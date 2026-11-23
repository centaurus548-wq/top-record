import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireUser, apiErrorResponse } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { computePayrollLines, suggestWeeklyPeriod, suggestMonthlyPeriod } from '@/lib/payroll'

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/**
 * GET /api/payroll — list payroll periods (OWNER + MANAGER), newest first.
 */
export async function GET() {
  try {
    await requireUser('OWNER', 'MANAGER')
    const periods = await db.payrollPeriod.findMany({
      orderBy: { createdAt: 'desc' },
      include: { lines: { include: { barber: true } } },
    })
    return NextResponse.json({
      periods: periods.map((p) => ({
        id: p.id,
        name: p.name,
        type: p.type,
        startDate: p.startDate,
        endDate: p.endDate,
        status: p.status,
        createdAt: p.createdAt,
        closedAt: p.closedAt,
        total: p.lines.reduce((a, l) => a + l.total, 0),
        totalPaid: p.lines.filter((l) => l.status === 'PAID').reduce((a, l) => a + l.total, 0),
        lineCount: p.lines.length,
      })),
      suggestions: {
        weekly: suggestWeeklyPeriod(),
        monthly: suggestMonthlyPeriod(),
      },
    })
  } catch (e) {
    const { status, body } = apiErrorResponse(e)
    return NextResponse.json(body, { status })
  }
}

/**
 * POST /api/payroll — create a period and compute its lines.
 * Body: { type: 'WEEKLY'|'MONTHLY'|'CUSTOM', name?, startDate, endDate }
 * Lines are recomputed from live data at creation time; owner can refresh while OPEN.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser('OWNER')
    const body = await req.json().catch(() => null)
    const type = ['WEEKLY', 'MONTHLY', 'CUSTOM'].includes(body?.type) ? body.type : null
    const startDate = typeof body?.startDate === 'string' && ISO_DATE.test(body.startDate) ? body.startDate : null
    const endDate = typeof body?.endDate === 'string' && ISO_DATE.test(body.endDate) ? body.endDate : null
    const name = typeof body?.name === 'string' && body.name.trim() ? body.name.trim() : null

    if (!type || !startDate || !endDate) {
      return NextResponse.json(
        { error: 'Tipe, tanggal mulai, dan tanggal akhir wajib diisi' },
        { status: 400 }
      )
    }
    if (startDate > endDate) {
      return NextResponse.json({ error: 'Tanggal mulai harus sebelum tanggal akhir' }, { status: 400 })
    }
    // Limit period length to 3 months to keep computations sane
    const maxEnd = addMonths(startDate, 3)
    if (endDate > maxEnd) {
      return NextResponse.json({ error: 'Periode maksimal 3 bulan' }, { status: 400 })
    }

    const periodName = name ?? `${type === 'WEEKLY' ? 'Gajian Mingguan' : type === 'MONTHLY' ? 'Gajian Bulanan' : 'Gajian'} ${startDate} s/d ${endDate}`

    const period = await db.payrollPeriod.create({
      data: {
        name: periodName,
        type,
        startDate,
        endDate,
        status: 'OPEN',
        createdById: user.id,
      },
    })

    const computed = await computePayrollLines(startDate, endDate)
    await db.payrollLine.createMany({
      data: computed.map((l) => ({
        periodId: period.id,
        barberId: l.barberId,
        daysWorked: l.daysWorked,
        lateCount: l.lateCount,
        attendancePay: l.attendancePay,
        komisi: l.komisi,
        tip: l.tip,
        total: l.total,
        attendanceDetail: l.attendanceDetail,
        status: 'UNPAID',
      })),
    })

    await logAudit({
      userId: user.id,
      action: 'CREATE_PAYROLL_PERIOD',
      entity: 'PayrollPeriod',
      entityId: period.id,
      detail: `${periodName} (${startDate} s/d ${endDate}, ${computed.length} baris)`,
    })

    const lines = await db.payrollLine.findMany({
      where: { periodId: period.id },
      include: { barber: true },
    })
    return NextResponse.json({ period, lines }, { status: 201 })
  } catch (e) {
    const { status, body } = apiErrorResponse(e)
    return NextResponse.json(body, { status })
  }
}

function addMonths(dateStr: string, months: number): string {
  const [y, m, d] = dateStr.split('-').map((v) => parseInt(v, 10))
  const dt = new Date(Date.UTC(y, m - 1 + months, d))
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`
}
