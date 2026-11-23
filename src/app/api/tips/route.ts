import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireUser, apiErrorResponse } from '@/lib/auth'
import { todayISO } from '@/lib/date'

/**
 * GET /api/tips?date=YYYY-MM-DD — tips per transaction (kasir/owner view for
 * "Ambil Tip" when the kapster takes the money).
 */
export async function GET(req: NextRequest) {
  try {
    await requireUser('OWNER', 'KASIR')
    const date = req.nextUrl.searchParams.get('date') ?? todayISO()

    const txns = await db.transaction.findMany({
      where: { date, status: 'NORMAL', tipAmount: { gt: 0 } },
      orderBy: { createdAt: 'desc' },
    })
    const barberIds = new Set(
      txns.map((t) => t.tipBarberId).filter((v): v is string => !!v)
    )
    const barbers = barberIds.size
      ? await db.barber.findMany({ where: { id: { in: [...barberIds] } } })
      : []
    const barberMap = new Map(barbers.map((b) => [b.id, b]))

    const rows = txns.map((t) => ({
      id: t.id,
      invoiceNo: t.invoiceNo,
      tipAmount: t.tipAmount,
      tipBarberId: t.tipBarberId,
      barberName: t.tipBarberId ? barberMap.get(t.tipBarberId)?.name ?? '-' : '-',
      tipMethod: t.tipMethod,
      tipStatus: t.tipStatus,
      tipClaimedAt: t.tipClaimedAt,
    }))
    return NextResponse.json({ tips: rows })
  } catch (e) {
    const { status, body } = apiErrorResponse(e)
    return NextResponse.json(body, { status })
  }
}

/**
 * POST /api/tips — mark a tip as taken from the drawer (R2). Body: { transactionId }.
 * Phase 3: done by KASIR/OWNER (kapster no longer log in).
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser('OWNER', 'KASIR')
    const body = await req.json().catch(() => null)
    const transactionId = typeof body?.transactionId === 'string' ? body.transactionId : ''
    if (!transactionId) {
      return NextResponse.json({ error: 'transactionId wajib diisi' }, { status: 400 })
    }
    const txn = await db.transaction.findUnique({ where: { id: transactionId } })
    if (!txn || txn.status !== 'NORMAL' || txn.tipAmount <= 0) {
      return NextResponse.json({ error: 'Tip tidak ditemukan' }, { status: 404 })
    }
    if (txn.tipStatus !== 'UNCLAIMED') {
      return NextResponse.json({ error: 'Tip sudah diambil' }, { status: 400 })
    }
    const updated = await db.transaction.update({
      where: { id: transactionId },
      data: { tipStatus: 'CLAIMED', tipClaimedAt: new Date() },
    })
    await db.auditLog.create({
      data: {
        userId: user.id,
        action: 'CLAIM_TIP',
        entity: 'Transaction',
        entityId: txn.id,
        detail: `${txn.invoiceNo} tip ${txn.tipAmount} diambil oleh ${user.name}`,
      },
    })
    return NextResponse.json({ transaction: updated })
  } catch (e) {
    const { status, body } = apiErrorResponse(e)
    return NextResponse.json(body, { status })
  }
}
