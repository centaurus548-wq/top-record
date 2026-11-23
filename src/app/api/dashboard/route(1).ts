import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireUser, apiErrorResponse } from '@/lib/auth'
import { todayISO } from '@/lib/date'
import { computeKomisiToday } from '@/lib/komisi'

/**
 * GET /api/dashboard — today's numbers.
 * OWNER/MANAGER/KASIR: shop-wide. KAPSTER: own performance only.
 */
export async function GET() {
  try {
    const user = await requireUser()
    const today = todayISO()

    if (user.role === 'KAPSTER') {
      return NextResponse.json(await kapsterDashboard(user, today))
    }

    const [txns, expenses, komisi, lowStock, bookings] = await Promise.all([
      db.transaction.findMany({
        where: { date: today, status: 'NORMAL' },
        select: { total: true, paymentMethod: true, tipAmount: true, tipMethod: true },
      }),
      db.expense.findMany({
        where: { date: today },
        select: { amount: true, source: true, method: true },
      }),
      computeKomisiToday(),
      db.product.findMany({
        where: { active: true },
        orderBy: [{ stock: 'asc' }, { name: 'asc' }],
      }),
      db.booking.findMany({
        where: { date: today, status: { in: ['WAITING', 'CONFIRMED', 'SERVING'] } },
        orderBy: { time: 'asc' },
        take: 10,
      }),
    ])

    const cashTotal = txns
      .filter((t) => t.paymentMethod === 'CASH')
      .reduce((a, t) => a + t.total, 0)
    const qrisTotal = txns
      .filter((t) => t.paymentMethod === 'QRIS')
      .reduce((a, t) => a + t.total, 0)
    const cashTips = txns
      .filter((t) => t.tipAmount > 0 && t.tipMethod === 'CASH')
      .reduce((a, t) => a + t.tipAmount, 0)
    const qrisTips = txns
      .filter((t) => t.tipAmount > 0 && t.tipMethod === 'QRIS')
      .reduce((a, t) => a + t.tipAmount, 0)

    const expenseKas = expenses
      .filter((e) => e.source === 'KAS_SHOP')
      .reduce((a, e) => a + e.amount, 0)
    const expenseOwner = expenses
      .filter((e) => e.source === 'OWNER_PRIVATE')
      .reduce((a, e) => a + e.amount, 0)

    const omzet = txns.reduce((a, t) => a + t.total, 0)
    const totalKomisi = komisi.reduce((a, k) => a + k.commission, 0)
    const tipTotal = komisi.reduce((a, k) => a + k.tipEarned, 0)

    return NextResponse.json({
      role: user.role,
      date: today,
      omzet,
      txnCount: txns.length,
      cashTotal: cashTotal + cashTips,
      qrisTotal: qrisTotal + qrisTips,
      expenseKas,
      expenseOwner,
      totalKomisi,
      tipTotal,
      netEstimate: omzet - expenseKas,
      kapster: komisi.map((k) => ({
        barberId: k.barberId,
        barberName: k.barberName,
        nickname: k.nickname,
        tierName: k.tierName,
        kepalaCount: k.kepalaCount,
        serviceRevenue: k.serviceRevenue,
        commission: k.commission,
        tipEarned: k.tipEarned,
        tipUnclaimed: k.tipUnclaimed,
      })),
      lowStock: lowStock
        .filter((p) => p.stock <= p.minStock)
        .map((p) => ({ id: p.id, name: p.name, stock: p.stock, minStock: p.minStock })),
      bookings,
    })
  } catch (e) {
    const { status, body } = apiErrorResponse(e)
    return NextResponse.json(body, { status })
  }
}

async function kapsterDashboard(
  user: { id: string; role: string; barberId: string | null; name: string },
  today: string
) {
  if (!user.barberId) {
    return { role: user.role, date: today, kapsterSelf: null }
  }
  const [komisiRows, attendance, bookingCount] = await Promise.all([
    computeKomisiToday(),
    db.attendance.findUnique({
      where: { barberId_date: { barberId: user.barberId, date: today } },
    }),
    db.booking.count({
      where: { date: today, barberId: user.barberId, status: { in: ['WAITING', 'CONFIRMED', 'SERVING'] } },
    }),
  ])
  const me = komisiRows.find((k) => k.barberId === user.barberId) ?? null
  return {
    role: user.role,
    date: today,
    kapsterSelf: me
      ? {
          barberName: me.barberName,
          kepalaCount: me.kepalaCount,
          serviceRevenue: me.serviceRevenue,
          commission: me.commission,
          tipEarned: me.tipEarned,
          tipUnclaimed: me.tipUnclaimed,
          thresholdMet: me.thresholdMet,
          rule: me.rule,
        }
      : null,
    attendance,
    upcomingBookings: bookingCount,
  }
}
