import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireUser, apiErrorResponse } from '@/lib/auth'

const VALID_STATUSES = ['WAITING', 'CONFIRMED', 'SERVING', 'DONE', 'CANCELLED', 'RESCHEDULED']

/** PATCH /api/bookings/[id] — update booking status (all operational roles). */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser('OWNER', 'KASIR', 'KAPSTER')
    const { id } = await params
    const body = await req.json().catch(() => null)
    const status = body?.status
    if (!VALID_STATUSES.includes(status)) {
      return NextResponse.json({ error: 'Status tidak valid' }, { status: 400 })
    }
    const existing = await db.booking.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Booking tidak ditemukan' }, { status: 404 })
    }
    const booking = await db.booking.update({ where: { id }, data: { status } })
    await db.auditLog.create({
      data: {
        userId: user.id,
        action: 'UPDATE_BOOKING_STATUS',
        entity: 'Booking',
        entityId: id,
        detail: `${existing.customerName}: ${existing.status} -> ${status} (${user.name})`,
      },
    })
    return NextResponse.json({ booking })
  } catch (e) {
    const { status, body } = apiErrorResponse(e)
    return NextResponse.json(body, { status })
  }
}
