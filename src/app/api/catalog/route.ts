import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireUser, apiErrorResponse } from '@/lib/auth'
import { todayISO } from '@/lib/date'

/**
 * GET /api/catalog
 * Returns active service items, products (with category), barbers and
 * product categories — everything the POS screen needs in one call.
 */
export async function GET() {
  try {
    await requireUser()
    const [services, products, categories, barbers, todayBookings] = await Promise.all([
      db.serviceItem.findMany({ where: { active: true }, orderBy: { sortOrder: 'asc' } }),
      db.product.findMany({
        where: { active: true },
        include: { category: true },
        orderBy: { name: 'asc' },
      }),
      db.productCategory.findMany({ orderBy: { sortOrder: 'asc' } }),
      db.barber.findMany({ where: { active: true }, include: { tier: true }, orderBy: { name: 'asc' } }),
      db.booking.findMany({
        where: { date: todayISO(), status: { in: ['WAITING', 'CONFIRMED', 'SERVING'] } },
        orderBy: { time: 'asc' },
      }),
    ])
    return NextResponse.json({
      services,
      products,
      categories,
      barbers: barbers.map((b) => ({
        id: b.id,
        name: b.name,
        nickname: b.nickname,
        tierId: b.tierId,
        tierName: b.tier?.name ?? null,
      })),
      bookings: todayBookings,
    })
  } catch (e) {
    const { status, body } = apiErrorResponse(e)
    return NextResponse.json(body, { status })
  }
}
