import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireUser, apiErrorResponse } from '@/lib/auth'
import {
  todayISO,
  currentHHmm,
  hhmmToMinutes,
  progressiveDeductedHours,
  formatDateID,
} from '@/lib/date'
import { logAudit } from '@/lib/audit'

/**
 * GET /api/attendance?date=YYYY-MM-DD | ?from&to | ?barberId
 * List attendance rows (barbers included). OWNER/KASIR/MANAGER see all.
 */
export async function GET(req: NextRequest) {
  try {
    await requireUser('OWNER', 'KASIR', 'MANAGER')
    const sp = req.nextUrl.searchParams
    const date = sp.get('date')
    const from = sp.get('from')
    const to = sp.get('to')
    const barberId = sp.get('barberId')

    const where: Record<string, unknown> = {}
    if (date) where.date = date
    if (from && to) {
      where.date = { gte: from, lte: to }
    }
    if (barberId && barberId !== 'all') where.barberId = barberId

    const rows = await db.attendance.findMany({
      where,
      include: { barber: true },
      orderBy: { date: 'desc' },
    })
    return NextResponse.json({ rows })
  } catch (e) {
    const { status, body } = apiErrorResponse(e)
    return NextResponse.json(body, { status })
  }
}

/**
 * POST /api/attendance — record attendance for a barber (done by KASIR/OWNER;
 * kapster no longer log in). Body: { barberId, clockInTime?: 'HH:mm' }.
 * clockInTime defaults to the current wall-clock time (Asia/Bangkok).
 *
 * Progressive late penalty: <= tolerance -> 0 jam; 16..75 -> 1 jam;
 * 76..135 -> 2 jam; i.e. ceil((lateMinutes - tolerance) / 60) jam.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser('OWNER', 'KASIR')
    const body = await req.json().catch(() => ({}))
    const barberId = typeof body?.barberId === 'string' ? body.barberId : ''
    if (!barberId) {
      return NextResponse.json({ error: 'Kapster wajib dipilih' }, { status: 400 })
    }
    const barber = await db.barber.findUnique({ where: { id: barberId } })
    if (!barber || !barber.active) {
      return NextResponse.json({ error: 'Kapster tidak ditemukan / tidak aktif' }, { status: 404 })
    }

    const clockInTime =
      typeof body?.clockInTime === 'string' && /^\d{2}:\d{2}$/.test(body.clockInTime)
        ? body.clockInTime
        : currentHHmm()

    const today = todayISO()
    const existing = await db.attendance.findUnique({
      where: { barberId_date: { barberId, date: today } },
    })
    if (existing) {
      return NextResponse.json(
        { error: `${barber.name} sudah absen hari ini (${formatDateID(today)})`, attendance: existing },
        { status: 409 }
      )
    }

    const [shift, toleranceSetting] = await Promise.all([
      db.setting.findFirst({ where: { key: 'shiftStart' } }),
      db.setting.findFirst({ where: { key: 'lateToleranceMin' } }),
    ])
    const shiftStart = shift?.value ?? '09:00'
    const tolerance = toleranceSetting ? parseInt(toleranceSetting.value, 10) : 15

    const lateMinutes = Math.max(0, hhmmToMinutes(clockInTime) - hhmmToMinutes(shiftStart))
    const deductedHours = progressiveDeductedHours(lateMinutes, tolerance)

    // Store the clock-in instant as today's date at the given wall-clock time (UTC+7).
    const clockInAt = new Date(`${today}T${clockInTime}:00+07:00`)

    const attendance = await db.attendance.create({
      data: {
        barberId,
        date: today,
        clockInAt,
        lateMinutes,
        deductedHours,
      },
    })

    await logAudit({
      userId: user.id,
      action: 'CLOCK_IN',
      entity: 'Attendance',
      entityId: attendance.id,
      detail: `${barber.name} absen ${clockInTime} (dicatat ${user.name}), telat ${lateMinutes} menit, potong ${deductedHours} jam`,
    })

    return NextResponse.json({ attendance })
  } catch (e) {
    const { status, body } = apiErrorResponse(e)
    return NextResponse.json(body, { status })
  }
}
