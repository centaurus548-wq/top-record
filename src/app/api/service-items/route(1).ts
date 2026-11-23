import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireUser, apiErrorResponse } from '@/lib/auth'
import { logAudit } from '@/lib/audit'

/** GET /api/service-items — all service items incl. inactive (OWNER only; POS uses /api/catalog). */
export async function GET() {
  try {
    await requireUser('OWNER')
    const items = await db.serviceItem.findMany({ orderBy: { sortOrder: 'asc' } })
    return NextResponse.json({ services: items })
  } catch (e) {
    const { status, body } = apiErrorResponse(e)
    return NextResponse.json(body, { status })
  }
}

/** POST /api/service-items — create. Body: { name, price, durationMin?, sortOrder? } */
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser('OWNER')
    const body = await req.json().catch(() => null)
    const name = typeof body?.name === 'string' ? body.name.trim() : ''
    const price = parseInt(String(body?.price ?? 0), 10)
    const durationMin = parseInt(String(body?.durationMin ?? 60), 10) || 60
    if (!name || !Number.isFinite(price) || price <= 0) {
      return NextResponse.json({ error: 'Nama dan harga wajib diisi' }, { status: 400 })
    }
    const maxSort = await db.serviceItem.aggregate({ _max: { sortOrder: true } })
    const item = await db.serviceItem.create({
      data: {
        name,
        price,
        durationMin: Math.max(5, durationMin),
        sortOrder: (maxSort._max.sortOrder ?? 0) + 1,
        active: true,
      },
    })
    await logAudit({
      userId: user.id,
      action: 'CREATE_SERVICE_ITEM',
      entity: 'ServiceItem',
      entityId: item.id,
      detail: `${name} harga ${price} (${durationMin} menit)`,
    })
    return NextResponse.json({ service: item }, { status: 201 })
  } catch (e) {
    const { status, body } = apiErrorResponse(e)
    return NextResponse.json(body, { status })
  }
}

/** PUT /api/service-items — update. Price changes only affect new transactions (snapshot preserved). */
export async function PUT(req: NextRequest) {
  try {
    const user = await requireUser('OWNER')
    const body = await req.json().catch(() => null)
    const id = typeof body?.id === 'string' ? body.id : ''
    if (!id) {
      return NextResponse.json({ error: 'ID layanan wajib diisi' }, { status: 400 })
    }
    const existing = await db.serviceItem.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Layanan tidak ditemukan' }, { status: 404 })
    }
    const data: Record<string, unknown> = {}
    if (typeof body.name === 'string' && body.name.trim()) data.name = body.name.trim()
    if (body.price !== undefined) data.price = Math.max(0, parseInt(String(body.price), 10) || 0)
    if (body.durationMin !== undefined) data.durationMin = Math.max(5, parseInt(String(body.durationMin), 10) || 5)
    if (body.active !== undefined) data.active = !!body.active
    if (body.sortOrder !== undefined) data.sortOrder = parseInt(String(body.sortOrder), 10) || existing.sortOrder

    const item = await db.serviceItem.update({ where: { id }, data })

    if (data.price !== undefined && data.price !== existing.price) {
      await logAudit({
        userId: user.id,
        action: 'CHANGE_SERVICE_PRICE',
        entity: 'ServiceItem',
        entityId: id,
        detail: `${existing.name}: harga diubah ${existing.price} -> ${data.price} oleh ${user.name} (transaksi lama tetap)`,
      })
    } else {
      await logAudit({
        userId: user.id,
        action: 'UPDATE_SERVICE_ITEM',
        entity: 'ServiceItem',
        entityId: id,
        detail: `${existing.name} diubah (${Object.keys(data).join(', ')}) oleh ${user.name}`,
      })
    }
    return NextResponse.json({ service: item })
  } catch (e) {
    const { status, body } = apiErrorResponse(e)
    return NextResponse.json(body, { status })
  }
}

/** DELETE /api/service-items?id= — soft deactivate; hard delete only when unused. */
export async function DELETE(req: NextRequest) {
  try {
    const user = await requireUser('OWNER')
    const id = req.nextUrl.searchParams.get('id')
    if (!id) {
      return NextResponse.json({ error: 'ID layanan wajib diisi' }, { status: 400 })
    }
    const existing = await db.serviceItem.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Layanan tidak ditemukan' }, { status: 404 })
    }
    const used = await db.transactionItem.count({ where: { serviceItemId: id } })
    if (used > 0) {
      const item = await db.serviceItem.update({ where: { id }, data: { active: false } })
      await logAudit({
        userId: user.id,
        action: 'DEACTIVATE_SERVICE_ITEM',
        entity: 'ServiceItem',
        entityId: id,
        detail: `${existing.name} dinonaktifkan (dipakai di ${used} transaksi) oleh ${user.name}`,
      })
      return NextResponse.json({ service: item, deactivated: true })
    }
    await db.serviceItem.delete({ where: { id } })
    await logAudit({
      userId: user.id,
      action: 'DELETE_SERVICE_ITEM',
      entity: 'ServiceItem',
      entityId: id,
      detail: `${existing.name} dihapus oleh ${user.name}`,
    })
    return NextResponse.json({ ok: true })
  } catch (e) {
    const { status, body } = apiErrorResponse(e)
    return NextResponse.json(body, { status })
  }
}
