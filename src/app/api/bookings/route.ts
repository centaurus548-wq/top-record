import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireUser, apiErrorResponse } from '@/lib/auth'
import { todayISO } from '@/lib/date'

/**
 * GET /api/bookings?date=YYYY-MM-DD (default today) | ?from&to
 * Includes service & barber names resolved manually (no FK relations on Booking).
 */
export async function GET(req: NextRequest) {
  try {
    await requireUser()
    const sp = req.nextUrl.searchParams
    const date = sp.get('date') ?? todayISO()
    const from = sp.get('from')
    const to = sp.get('to')

    const where: Record<string, unknown> = {}
    if (from && to) where.date = { gte: from, lte: to }
    else where.date = date

    const [bookings, services, barbers] = await Promise.all([
      db.booking.findMany({ where, orderBy: [{ date: 'desc' }, { time: 'asc' }], take: 200 }),
      db.serviceItem.findMany(),
      db.barber.findMany(),
    ])
    const svcMap = new Map(services.map((s) => [s.id, s]))
    const barberMap = new Map(barbers.map((b) => [b.id, b]))

    return NextResponse.json({
      bookings: bookings.map((b) => ({
        ...b,
        serviceName: svcMap.get(b.serviceItemId)?.name ?? '(layanan dihapus)',
        barberName: barberMap.get(b.barberId)?.name ?? '(kapster dihapus)',
      })),
    })
  } catch (e) {
    const { status, body } = apiErrorResponse(e)
    return NextResponse.json(body, { status })
  }
}

/**
 * POST /api/bookings — create booking.
 * Body: { customerName, whatsapp?, date, time, serviceItemId, barberId, note? }
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser('OWNER', 'KASIR', 'KAPSTER')
    const body = await req.json().catch(() => null)
    const customerName = typeof body?.customerName === 'string' ? body.customerName.trim() : ''
    const date = typeof body?.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.date) ? body.date : ''
    const time = typeof body?.time === 'string' && /^\d{2}:\d{2}$/.test(body.time) ? body.time : ''
    const serviceItemId = typeof body?.serviceItemId === 'string' ? body.serviceItemId : ''
    const barberId = typeof body?.barberId === 'string' ? body.barberId : ''
    const whatsapp = typeof body?.whatsapp === 'string' ? body.whatsapp.trim() || null : null
    const note = typeof body?.note === 'string' ? body.note.trim() || null : null

    if (!customerName || !date || !time || !serviceItemId || !barberId) {
      return NextResponse.json(
        { error: 'Nama, tanggal, jam, layanan, dan kapster wajib diisi' },
        { status: 400 }
      )
    }
    const [service, barber] = await Promise.all([
      db.serviceItem.findUnique({ where: { id: serviceItemId } }),
      db.barber.findUnique({ where: { id: barberId } }),
    ])
    if (!service || !barber) {
      return NextResponse.json({ error: 'Layanan atau kapster tidak ditemukan' }, { status: 400 })
    }

    const booking = await db.booking.create({
      data: {
        customerName,
        whatsapp,
        date,
        time,
        serviceItemId,
        barberId,
        durationMin: service.durationMin,
        status: 'CONFIRMED',
        note,
        createdById: user.id,
      },
    })
    await db.auditLog.create({
      data: {
        userId: user.id,
        action: 'CREATE_BOOKING',
        entity: 'Booking',
        entityId: booking.id,
        detail: `${customerName} ${date} ${time} ${service.name} oleh ${user.name}`,
      },
    })
    return NextResponse.json({ booking }, { status: 201 })
  } catch (e) {
    const { status, body } = apiErrorResponse(e)
    return NextResponse.json(body, { status })
  }
}
