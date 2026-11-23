import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireUser, apiErrorResponse } from '@/lib/auth'
import { todayISO, hhmmToMinutes } from '@/lib/date'
import { computeKomisi, addDaysISO } from '@/lib/komisi'

/**
 * GET /api/reports?from&to — summary + breakdowns (OWNER + MANAGER).
 * Voided transactions excluded everywhere.
 */
export async function GET(req: NextRequest) {
  try {
    await requireUser('OWNER', 'MANAGER')
    const sp = req.nextUrl.searchParams
    const from = sp.get('from') ?? todayISO()
    const to = sp.get('to') ?? todayISO()

    const [txns, expenses, categories, products, services, komisi, attendanceRows, settings] =
      await Promise.all([
        db.transaction.findMany({
          where: { date: { gte: from, lte: to }, status: 'NORMAL' },
          include: { items: true },
          orderBy: { createdAt: 'asc' },
        }),
        db.expense.findMany({
          where: { date: { gte: from, lte: to } },
          include: { category: true },
        }),
        db.expenseCategory.findMany({ orderBy: { sortOrder: 'asc' } }),
        db.product.findMany(),
        db.serviceItem.findMany(),
        computeKomisi(from, to),
        db.attendance.findMany({
          where: { date: { gte: from, lte: to } },
          include: { barber: true },
          orderBy: [{ date: 'asc' }, { clockInAt: 'asc' }],
        }),
        db.setting.findMany(),
      ])

    // Pengaturan shift & gaji untuk rekap absensi (transparansi potongan telat)
    const settingMap = new Map(settings.map((s) => [s.key, s.value]))
    const shiftStart = settingMap.get('shiftStart') ?? '09:00'
    const shiftEnd = settingMap.get('shiftEnd') ?? '21:00'
    const hourlyRate = parseInt(settingMap.get('hourlyRate') ?? '10000', 10) || 10000
    const shiftHours = Math.max(1, (hhmmToMinutes(shiftEnd) - hhmmToMinutes(shiftStart)) / 60)
    const dailyShiftPay = Math.round(shiftHours * hourlyRate)

    // Summary
    const cashOmzet = txns.filter((t) => t.paymentMethod === 'CASH').reduce((a, t) => a + t.total, 0)
    const qrisOmzet = txns.filter((t) => t.paymentMethod === 'QRIS').reduce((a, t) => a + t.total, 0)
    const tipViaKas = txns.reduce((a, t) => a + t.tipAmount, 0)
    const expenseKas = expenses.filter((e) => e.source === 'KAS_SHOP').reduce((a, e) => a + e.amount, 0)
    const expenseOwner = expenses.filter((e) => e.source === 'OWNER_PRIVATE').reduce((a, e) => a + e.amount, 0)
    const omzet = cashOmzet + qrisOmzet

    // Breakdown per layanan
    const svcAgg = new Map<string, { name: string; qty: number; revenue: number }>()
    const prodAgg = new Map<string, { name: string; qty: number; revenue: number }>()
    for (const t of txns) {
      for (const it of t.items) {
        const map = it.itemType === 'SERVICE' ? svcAgg : prodAgg
        const key = it.itemType === 'SERVICE' ? it.serviceItemId ?? it.name : it.productId ?? it.name
        const agg = map.get(key) ?? { name: it.name, qty: 0, revenue: 0 }
        agg.qty += it.qty
        agg.revenue += it.price * it.qty
        map.set(key, agg)
      }
    }

    // Breakdown per kategori pengeluaran
    const expAgg = new Map<string, { name: string; amount: number; count: number }>()
    for (const e of expenses) {
      const name = e.category?.name ?? 'Lain-lain'
      const agg = expAgg.get(e.categoryId) ?? { name, amount: 0, count: 0 }
      agg.amount += e.amount
      agg.count += 1
      expAgg.set(e.categoryId, agg)
    }

    // Daily trend
    const trendMap = new Map<string, { date: string; omzet: number; expense: number }>()
    for (let d = from; d <= to; d = addDaysISO(d, 1)) {
      trendMap.set(d, { date: d, omzet: 0, expense: 0 })
    }
    for (const t of txns) {
      const row = trendMap.get(t.date)
      if (row) row.omzet += t.total + t.tipAmount
    }
    for (const e of expenses) {
      const row = trendMap.get(e.date)
      if (row) row.expense += e.amount
    }

    // Archive stats (voided in range) — Revisi 8: tersedia untuk semua pengguna
    const voided = await db.transaction.findMany({
      where: { date: { gte: from, lte: to }, status: 'VOIDED' },
      select: { total: true, tipAmount: true },
    })
    const archive = {
      count: voided.length,
      total: voided.reduce((a, t) => a + t.total + t.tipAmount, 0),
    }

    const svcNameMap = new Map(services.map((s) => [s.id, s.name]))
    const prodNameMap = new Map(products.map((p) => [p.id, p.name]))

    // Rekap absensi & gaji per hari per kapster — jam masuk, telat, potongan otomatis
    const attendance = attendanceRows.map((a) => {
      const clockIn = new Date(a.clockInAt.getTime() + 7 * 3600 * 1000)
        .toISOString()
        .slice(11, 16)
      const dailyPay = dailyShiftPay - a.deductedHours * hourlyRate
      return {
        id: a.id,
        date: a.date,
        barberName: a.barber?.name ?? '-',
        clockIn,
        shiftStart,
        lateMinutes: a.lateMinutes,
        deductedHours: a.deductedHours,
        deduction: a.deductedHours * hourlyRate,
        dailyPay,
      }
    })
    const attendanceTotals = {
      days: attendance.length,
      deduction: attendance.reduce((a, r) => a + r.deduction, 0),
      attendancePay: attendance.reduce((a, r) => a + r.dailyPay, 0),
    }

    return NextResponse.json({
      from,
      to,
      summary: {
        omzet,
        cashOmzet,
        qrisOmzet,
        txnCount: txns.length,
        tipViaKas,
        expenseKas,
        expenseOwner,
        netEstimate: omzet - expenseKas,
        komisiTotal: komisi.reduce((a, k) => a + k.commission, 0),
      },
      perKapster: komisi.map((k) => ({
        barberId: k.barberId,
        barberName: k.barberName,
        nickname: k.nickname,
        kepalaCount: k.kepalaCount,
        serviceRevenue: k.serviceRevenue,
        commission: k.commission,
        tipEarned: k.tipEarned,
      })),
      perLayanan: [...svcAgg.entries()]
        .map(([id, v]) => ({ id, name: svcNameMap.get(id) ?? v.name, qty: v.qty, revenue: v.revenue }))
        .sort((a, b) => b.revenue - a.revenue),
      perProduk: [...prodAgg.entries()]
        .map(([id, v]) => ({ id, name: prodNameMap.get(id) ?? v.name, qty: v.qty, revenue: v.revenue }))
        .sort((a, b) => b.revenue - a.revenue),
      perKategoriPengeluaran: [...expAgg.entries()]
        .map(([id, v]) => ({ id, name: v.name, amount: v.amount, count: v.count }))
        .sort((a, b) => b.amount - a.amount),
      trend: [...trendMap.values()],
      archive,
      attendance,
      attendanceTotals,
      wageInfo: { shiftStart, shiftEnd, hourlyRate, shiftHours, dailyShiftPay },
    })
  } catch (e) {
    const { status, body } = apiErrorResponse(e)
    return NextResponse.json(body, { status })
  }
}
