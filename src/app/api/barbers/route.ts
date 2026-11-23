import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireUser, apiErrorResponse } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { todayISO } from '@/lib/date'
import { computeKomisiToday } from '@/lib/komisi'

/**
 * GET /api/barbers
 * List of active barbers + today's attendance status + today's stats.
 */
export async function GET() {
  try {
    await requireUser()
    const today = todayISO()
    const [barbers, attendances, komisi] = await Promise.all([
      db.barber.findMany({
        where: { active: true },
        include: { tier: true },
        orderBy: { name: 'asc' },
      }),
      db.attendance.findMany({ where: { date: today } }),
      computeKomisiToday(),
    ])
    const attByBarber = new Map(attendances.map((a) => [a.barberId, a]))
    const komisiByBarber = new Map(komisi.map((k) => [k.barberId, k]))

    const result = barbers.map((b) => {
      const att = attByBarber.get(b.id)
      const k = komisiByBarber.get(b.id)
      return {
        id: b.id,
        name: b.name,
        nickname: b.nickname,
        tierName: b.tier?.name ?? null,
        active: b.active,
        attendance: att
          ? {
              id: att.id,
              clockInAt: att.clockInAt,
              lateMinutes: att.lateMinutes,
              deductedHours: att.deductedHours,
            }
          : null,
        today: k
          ? {
              kepalaCount: k.kepalaCount,
              serviceRevenue: k.serviceRevenue,
              commission: k.commission,
              tipEarned: k.tipEarned,
              tipUnclaimed: k.tipUnclaimed,
              tipClaimed: k.tipClaimed,
            }
          : null,
      }
    })

    return NextResponse.json({ barbers: result })
  } catch (e) {
    const { status, body } = apiErrorResponse(e)
    return NextResponse.json(body, { status })
  }
}

/**
 * POST /api/barbers — add a new barber (OWNER only).
 * Body: { name, nickname, tierId?, commissionOverrideEnabled?, commissionOverrideThresholdHeads?, commissionOverrideRatePct? }
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser('OWNER')
    const body = await req.json().catch(() => null)
    const name = typeof body?.name === 'string' ? body.name.trim() : ''
    const nickname = typeof body?.nickname === 'string' ? body.nickname.trim().toUpperCase() : ''
    const tierId = typeof body?.tierId === 'string' && body.tierId ? body.tierId : null
    if (!name || !nickname) {
      return NextResponse.json({ error: 'Nama dan kode kapster wajib diisi' }, { status: 400 })
    }
    if (nickname.length > 10) {
      return NextResponse.json({ error: 'Kode kapster maksimal 10 karakter' }, { status: 400 })
    }
    const exists = await db.barber.findUnique({ where: { nickname } })
    if (exists) {
      return NextResponse.json({ error: `Kode ${nickname} sudah dipakai` }, { status: 400 })
    }
    const barber = await db.barber.create({
      data: {
        name,
        nickname,
        tierId,
        active: true,
        commissionOverrideEnabled: !!body?.commissionOverrideEnabled,
        commissionOverrideThresholdHeads: body?.commissionOverrideEnabled
          ? Math.max(0, parseInt(String(body?.commissionOverrideThresholdHeads ?? 5), 10) || 0)
          : null,
        commissionOverrideRatePct: body?.commissionOverrideEnabled
          ? Math.min(100, Math.max(0, parseInt(String(body?.commissionOverrideRatePct ?? 10), 10) || 0))
          : null,
      },
    })
    await logAudit({
      userId: user.id,
      action: 'CREATE_BARBER',
      entity: 'Barber',
      entityId: barber.id,
      detail: `${name} (${nickname}) dibuat oleh ${user.name}`,
    })
    return NextResponse.json({ barber }, { status: 201 })
  } catch (e) {
    const { status, body } = apiErrorResponse(e)
    return NextResponse.json(body, { status })
  }
}

/**
 * PUT /api/barbers — edit barber (OWNER only). Body: { id, name?, nickname?, tierId? }
 */
export async function PUT(req: NextRequest) {
  try {
    const user = await requireUser('OWNER')
    const body = await req.json().catch(() => null)
    const id = typeof body?.id === 'string' ? body.id : ''
    if (!id) {
      return NextResponse.json({ error: 'ID kapster wajib diisi' }, { status: 400 })
    }
    const existing = await db.barber.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Kapster tidak ditemukan' }, { status: 404 })
    }
    const data: Record<string, unknown> = {}
    if (typeof body.name === 'string' && body.name.trim()) data.name = body.name.trim()
    if (typeof body.nickname === 'string' && body.nickname.trim()) {
      const nickname = body.nickname.trim().toUpperCase()
      if (nickname !== existing.nickname) {
        const clash = await db.barber.findUnique({ where: { nickname } })
        if (clash) {
          return NextResponse.json({ error: `Kode ${nickname} sudah dipakai` }, { status: 400 })
        }
        data.nickname = nickname
      }
    }
    if (body.tierId !== undefined) data.tierId = body.tierId || null
    if (body.active !== undefined) data.active = !!body.active

    const barber = await db.barber.update({ where: { id }, data })
    await logAudit({
      userId: user.id,
      action: 'UPDATE_BARBER',
      entity: 'Barber',
      entityId: id,
      detail: `${existing.name} diubah (${Object.keys(data).join(', ')}) oleh ${user.name}`,
    })
    return NextResponse.json({ barber })
  } catch (e) {
    const { status, body } = apiErrorResponse(e)
    return NextResponse.json(body, { status })
  }
}

/**
 * DELETE /api/barbers?id= — remove a resigned barber (OWNER only).
 * With history: soft-delete (active=false) so old transactions/payroll stay intact.
 * With zero references: hard delete so the code can be reused.
 */
export async function DELETE(req: NextRequest) {
  try {
    const user = await requireUser('OWNER')
    const id = req.nextUrl.searchParams.get('id')
    if (!id) {
      return NextResponse.json({ error: 'ID kapster wajib diisi' }, { status: 400 })
    }
    const existing = await db.barber.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Kapster tidak ditemukan' }, { status: 404 })
    }
    const [txnItems, payLines, attendances, users] = await Promise.all([
      db.transactionItem.count({ where: { barberId: id } }),
      db.payrollLine.count({ where: { barberId: id } }),
      db.attendance.count({ where: { barberId: id } }),
      db.user.count({ where: { barberId: id } }),
    ])
    const hasHistory = txnItems + payLines + attendances + users > 0

    if (hasHistory) {
      await db.barber.update({ where: { id }, data: { active: false } })
      await logAudit({
        userId: user.id,
        action: 'DEACTIVATE_BARBER',
        entity: 'Barber',
        entityId: id,
        detail: `${existing.name} (${existing.nickname}) dinonaktifkan — riwayat transaksi & gajian tetap aman (oleh ${user.name})`,
      })
      return NextResponse.json({ ok: true, softDeleted: true })
    }

    await db.barber.delete({ where: { id } })
    await logAudit({
      userId: user.id,
      action: 'DELETE_BARBER',
      entity: 'Barber',
      entityId: id,
      detail: `${existing.name} (${existing.nickname}) dihapus permanen (tanpa riwayat) oleh ${user.name}`,
    })
    return NextResponse.json({ ok: true, softDeleted: false })
  } catch (e) {
    const { status, body } = apiErrorResponse(e)
    return NextResponse.json(body, { status })
  }
}
