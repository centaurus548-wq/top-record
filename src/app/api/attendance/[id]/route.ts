import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireUser, apiErrorResponse } from '@/lib/auth'
import { hhmmToMinutes, progressiveDeductedHours, isToday } from '@/lib/date'
import { logAudit } from '@/lib/audit'

/**
 * PUT /api/attendance/[id] — correct today's attendance row (OWNER only).
 * Body: { clockInTime: 'HH:mm' } — recomputes lateMinutes + progressive deduction.
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser('OWNER')
    const { id } = await params
    const body = await req.json().catch(() => null)
    const clockInTime =
      typeof body?.clockInTime === 'string' && /^\d{2}:\d{2}$/.test(body.clockInTime)
        ? body.clockInTime
        : ''
    if (!clockInTime) {
      return NextResponse.json({ error: 'Jam masuk wajib diisi (format HH:mm)' }, { status: 400 })
    }
    const row = await db.attendance.findUnique({ where: { id } })
    if (!row) {
      return NextResponse.json({ error: 'Data absensi tidak ditemukan' }, { status: 404 })
    }
    if (!isToday(row.date)) {
      return NextResponse.json({ error: 'Hanya absensi hari ini yang bisa dikoreksi' }, { status: 400 })
    }

    const [shift, toleranceSetting] = await Promise.all([
      db.setting.findFirst({ where: { key: 'shiftStart' } }),
      db.setting.findFirst({ where: { key: 'lateToleranceMin' } }),
    ])
    const shiftStart = shift?.value ?? '09:00'
    const tolerance = toleranceSetting ? parseInt(toleranceSetting.value, 10) : 15

    const lateMinutes = Math.max(0, hhmmToMinutes(clockInTime) - hhmmToMinutes(shiftStart))
    const deductedHours = progressiveDeductedHours(lateMinutes, tolerance)
    const clockInAt = new Date(`${row.date}T${clockInTime}:00+07:00`)

    const updated = await db.attendance.update({
      where: { id },
      data: { clockInAt, lateMinutes, deductedHours },
    })
    await logAudit({
      userId: user.id,
      action: 'EDIT_ATTENDANCE',
      entity: 'Attendance',
      entityId: id,
      detail: `Absensi dikoreksi jadi ${clockInTime}, telat ${lateMinutes} menit, potong ${deductedHours} jam (oleh ${user.name})`,
    })
    return NextResponse.json({ attendance: updated })
  } catch (e) {
    const { status, body } = apiErrorResponse(e)
    return NextResponse.json(body, { status })
  }
}

/**
 * DELETE /api/attendance/[id] — remove today's attendance row (OWNER only),
 * e.g. wrong barber or mistaken entry.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser('OWNER')
    const { id } = await params
    const row = await db.attendance.findUnique({ where: { id }, include: { barber: true } })
    if (!row) {
      return NextResponse.json({ error: 'Data absensi tidak ditemukan' }, { status: 404 })
    }
    if (!isToday(row.date)) {
      return NextResponse.json({ error: 'Hanya absensi hari ini yang bisa dihapus' }, { status: 400 })
    }
    await db.attendance.delete({ where: { id } })
    await logAudit({
      userId: user.id,
      action: 'DELETE_ATTENDANCE',
      entity: 'Attendance',
      entityId: id,
      detail: `Absensi ${row.barber?.name ?? row.barberId} tanggal ${row.date} dihapus (oleh ${user.name})`,
    })
    return NextResponse.json({ ok: true })
  } catch (e) {
    const { status, body } = apiErrorResponse(e)
    return NextResponse.json(body, { status })
  }
}
