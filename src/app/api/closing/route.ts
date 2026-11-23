import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireUser, apiErrorResponse } from '@/lib/auth'
import { todayISO } from '@/lib/date'
import { computeCashBreakdown } from '@/lib/closing-calc'

/**
 * GET /api/closing?date=YYYY-MM-DD (default today)
 * Returns CashDay row + live computed breakdown:
 * expectedCash = openingCash + cash txn totals (tips included) - KAS_SHOP cash expenses - tips paid out (claimed) today
 */
export async function GET(req: NextRequest) {
  try {
    const user = await requireUser()
    const date = req.nextUrl.searchParams.get('date') ?? todayISO()

    const { cashDay, breakdown } = await computeCashBreakdown(date)

    return NextResponse.json({
      date,
      cashDay,
      breakdown,
    })
  } catch (e) {
    const { status, body } = apiErrorResponse(e)
    return NextResponse.json(body, { status })
  }
}

/**
 * PUT /api/closing — set/update opening cash for today (KASIR/OWNER/KAPSTER acting kasir).
 * Body: { openingCash }
 */
export async function PUT(req: NextRequest) {
  try {
    const user = await requireUser('OWNER', 'KASIR', 'KAPSTER')
    const body = await req.json().catch(() => null)
    const openingCash = parseInt(String(body?.openingCash ?? 0), 10)
    if (!Number.isFinite(openingCash) || openingCash < 0) {
      return NextResponse.json({ error: 'Modal awal tidak valid' }, { status: 400 })
    }
    const date = todayISO()
    const cashDay = await db.cashDay.upsert({
      where: { date },
      update: { openingCash },
      create: { date, openingCash, status: 'OPEN' },
    })
    await db.auditLog.create({
      data: {
        userId: user.id,
        action: 'SET_OPENING_CASH',
        entity: 'CashDay',
        entityId: cashDay.id,
        detail: `${date} modal awal ${openingCash} (${user.name})`,
      },
    })
    return NextResponse.json({ cashDay })
  } catch (e) {
    const { status, body } = apiErrorResponse(e)
    return NextResponse.json(body, { status })
  }
}

/**
 * POST /api/closing — close or reopen the day.
 * Body: { action: 'close', countedCash, differenceNote? } or { action: 'reopen', reopenReason }
 * Close: KASIR/OWNER/KAPSTER (same day only). Reopen: OWNER only.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser('OWNER', 'KASIR', 'KAPSTER')
    const body = await req.json().catch(() => null)
    const action = body?.action
    const date = todayISO()

    if (action === 'close') {
      const cashDay = await db.cashDay.findUnique({ where: { date } })
      if (!cashDay) {
        return NextResponse.json({ error: 'Hari belum dibuka (isi modal awal dulu)' }, { status: 400 })
      }
      if (cashDay.status === 'LOCKED') {
        return NextResponse.json({ error: 'Hari sudah dikunci' }, { status: 400 })
      }

      // Recompute expected cash live
      const { breakdown } = await computeCashBreakdown(date)
      const expectedCash = breakdown.expectedCash

      const countedCash = parseInt(String(body?.countedCash ?? 0), 10)
      if (!Number.isFinite(countedCash) || countedCash < 0) {
        return NextResponse.json({ error: 'Uang dihitung tidak valid' }, { status: 400 })
      }
      const difference = countedCash - expectedCash
      const differenceNote = typeof body?.differenceNote === 'string' ? body.differenceNote.trim() || null : null
      if (difference !== 0 && !differenceNote) {
        return NextResponse.json({ error: 'Selisih tidak nol, wajib isi keterangan' }, { status: 400 })
      }

      const updated = await db.cashDay.update({
        where: { date },
        data: {
          status: 'LOCKED',
          closedById: user.id,
          closedAt: new Date(),
          countedCash,
          expectedCash,
          difference,
          differenceNote,
        },
      })
      await db.auditLog.create({
        data: {
          userId: user.id,
          action: 'CLOSE_DAY',
          entity: 'CashDay',
          entityId: updated.id,
          detail: `${date} ditutup ${user.name}: hitung ${countedCash}, harap ${expectedCash}, selisih ${difference}`,
        },
      })
      return NextResponse.json({ cashDay: updated })
    }

    if (action === 'reopen') {
      // Revisi 8: akses penuh — semua pengguna login bisa membuka ulang hari (alasan wajib).
      const cashDay = await db.cashDay.findUnique({ where: { date } })
      if (!cashDay || cashDay.status !== 'LOCKED') {
        return NextResponse.json({ error: 'Hari tidak dalam status terkunci' }, { status: 400 })
      }
      const reopenReason = typeof body?.reopenReason === 'string' ? body.reopenReason.trim() : ''
      if (!reopenReason) {
        return NextResponse.json({ error: 'Alasan buka ulang wajib diisi' }, { status: 400 })
      }
      const updated = await db.cashDay.update({
        where: { date },
        data: {
          status: 'OPEN',
          reopenedById: user.id,
          reopenedAt: new Date(),
          reopenReason,
          closedById: null,
          closedAt: null,
          countedCash: null,
          expectedCash: null,
          difference: null,
          differenceNote: null,
        },
      })
      await db.auditLog.create({
        data: {
          userId: user.id,
          action: 'REOPEN_DAY',
          entity: 'CashDay',
          entityId: updated.id,
          detail: `${date} dibuka ulang: ${reopenReason}`,
        },
      })
      return NextResponse.json({ cashDay: updated })
    }

    return NextResponse.json({ error: 'Aksi tidak dikenal' }, { status: 400 })
  } catch (e) {
    const { status, body } = apiErrorResponse(e)
    return NextResponse.json(body, { status })
  }
}
