import { db } from '@/lib/db'
import { computeKomisi, addDaysISO } from '@/lib/komisi'
import { hhmmToMinutes } from '@/lib/date'

export type PayrollPeriodLike = {
  id: string
  name: string
  type: 'WEEKLY' | 'MONTHLY' | 'CUSTOM'
  startDate: string
  endDate: string
}

export type PayrollAttendanceDetail = {
  date: string
  lateMinutes: number
  deductedHours: number
  dailyPay: number
}

export type ComputedPayrollLine = {
  barberId: string
  barberName: string
  nickname: string
  tierName: string | null
  daysWorked: number
  lateCount: number
  attendancePay: number
  komisi: number
  tip: number
  total: number
  attendanceDetail: PayrollAttendanceDetail[]
}

/**
 * Default period suggestion: last week Monday..Sunday (Asia/Bangkok).
 * E.g. today Wednesday -> last Monday (8 days ago) .. last Sunday (2 days ago).
 */
export function suggestWeeklyPeriod(): { name: string; startDate: string; endDate: string } {
  const today = new Date(Date.now() + 7 * 3600 * 1000)
  const dow = today.getUTCDay() // 0=Sun..6=Sat
  // last Sunday (most recent Sunday before today; if today is Sunday, that's 7 days ago)
  const daysSinceLastSunday = dow === 0 ? 7 : dow
  const end = new Date(today.getTime() - daysSinceLastSunday * 86400 * 1000)
  const start = new Date(end.getTime() - 6 * 86400 * 1000)
  const iso = (d: Date) =>
    `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
  const startDate = iso(start)
  const endDate = iso(end)
  const name = `Gajian Mingguan ${startDate} s/d ${endDate}`
  return { name, startDate, endDate }
}

export function suggestMonthlyPeriod(): { name: string; startDate: string; endDate: string } {
  const now = new Date(Date.now() + 7 * 3600 * 1000)
  // previous calendar month
  const y = now.getUTCFullYear()
  const m = now.getUTCMonth() // 0-based; previous month index
  const prevMonth = m === 0 ? 11 : m - 1
  const prevYear = m === 0 ? y - 1 : y
  const daysInMonth = new Date(Date.UTC(prevYear, prevMonth + 1, 0)).getUTCDate()
  const startDate = `${prevYear}-${String(prevMonth + 1).padStart(2, '0')}-01`
  const endDate = `${prevYear}-${String(prevMonth + 1).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`
  return {
    name: `Gajian Bulanan ${startDate.slice(0, 7)}`,
    startDate,
    endDate,
  }
}

/**
 * Compute payroll lines for all active barbers over a period.
 *
 * Gaji kehadiran (per day worked):
 *   dailyPay = shiftHours * hourlyRate - deductedHours * hourlyRate
 * shiftHours from Setting shiftStart/shiftEnd (09:00-21:00 = 12h).
 * Komisi: from the same komisi engine used everywhere else (computeKomisi per date).
 * Tip: sum of tips where tipBarberId = barber in period (UNCLAIMED + CLAIMED via kas).
 */
export async function computePayrollLines(
  startDate: string,
  endDate: string
): Promise<ComputedPayrollLine[]> {
  const [barbers, settings, attendances] = await Promise.all([
    db.barber.findMany({
      where: { active: true },
      include: { tier: true },
      orderBy: { name: 'asc' },
    }),
    db.setting.findMany(),
    db.attendance.findMany({
      where: { date: { gte: startDate, lte: endDate } },
      orderBy: { date: 'asc' },
    }),
  ])

  const settingMap = new Map(settings.map((s) => [s.key, s.value]))
  const shiftStart = settingMap.get('shiftStart') ?? '09:00'
  const shiftEnd = settingMap.get('shiftEnd') ?? '21:00'
  const hourlyRate = parseInt(settingMap.get('hourlyRate') ?? '10000', 10) || 10000
  const shiftHours = Math.max(1, (hhmmToMinutes(shiftEnd) - hhmmToMinutes(shiftStart)) / 60)
  const dailyShiftPay = Math.round(shiftHours * hourlyRate)

  // Komisi from the shared engine — computed per date so totals match
  // dashboard/komisi/closing numbers exactly.
  const komisiRows = await computeKomisi(startDate, endDate)
  const komisiByBarber = new Map(komisiRows.map((k) => [k.barberId, k]))

  // Tips via kas: all NORMAL transactions in period with tip on that barber.
  const tipTxns = await db.transaction.findMany({
    where: {
      date: { gte: startDate, lte: endDate },
      status: 'NORMAL',
      tipAmount: { gt: 0 },
    },
    select: { tipBarberId: true, tipAmount: true },
  })
  const tipByBarber = new Map<string, number>()
  for (const t of tipTxns) {
    if (t.tipBarberId) {
      tipByBarber.set(t.tipBarberId, (tipByBarber.get(t.tipBarberId) ?? 0) + t.tipAmount)
    }
  }

  const attByBarber = new Map<string, typeof attendances>()
  for (const a of attendances) {
    const arr = attByBarber.get(a.barberId) ?? []
    arr.push(a)
    attByBarber.set(a.barberId, arr)
  }

  const lines: ComputedPayrollLine[] = barbers.map((b) => {
    const details: PayrollAttendanceDetail[] = []
    let attendancePay = 0
    let lateCount = 0
    for (const a of attByBarber.get(b.id) ?? []) {
      const dailyPay = dailyShiftPay - a.deductedHours * hourlyRate
      attendancePay += dailyPay
      if (a.lateMinutes > 0) lateCount += 1
      details.push({
        date: a.date,
        lateMinutes: a.lateMinutes,
        deductedHours: a.deductedHours,
        dailyPay,
      })
    }
    const komisi = komisiByBarber.get(b.id)?.commission ?? 0
    const tip = tipByBarber.get(b.id) ?? 0
    return {
      barberId: b.id,
      barberName: b.name,
      nickname: b.nickname,
      tierName: b.tier?.name ?? null,
      daysWorked: details.length,
      lateCount,
      attendancePay,
      komisi,
      tip,
      total: attendancePay + komisi + tip,
      attendanceDetail: details,
    }
  })

  return lines
}

export { addDaysISO }
