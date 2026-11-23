import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireUser, apiErrorResponse } from '@/lib/auth'
import { logAudit } from '@/lib/audit'

/**
 * GET /api/product-categories — categories (any logged-in user; POS uses catalog too).
 */
export async function GET() {
  try {
    await requireUser()
    const categories = await db.productCategory.findMany({ orderBy: { sortOrder: 'asc' } })
    return NextResponse.json({ categories })
  } catch (e) {
    const { status, body } = apiErrorResponse(e)
    return NextResponse.json(body, { status })
  }
}

/** POST /api/product-categories — create non-barber category (OWNER only). */
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser('OWNER')
    const body = await req.json().catch(() => null)
    const name = typeof body?.name === 'string' ? body.name.trim() : ''
    if (!name) {
      return NextResponse.json({ error: 'Nama kategori wajib diisi' }, { status: 400 })
    }
    const maxSort = await db.productCategory.aggregate({ _max: { sortOrder: true } })
    const category = await db.productCategory.create({
      data: {
        name,
        isBarberService: false,
        commissionRatePct: Math.min(100, Math.max(0, parseInt(String(body?.commissionRatePct ?? 0), 10) || 0)),
        commissionEnabled: !!body?.commissionEnabled,
        sortOrder: (maxSort._max.sortOrder ?? 0) + 1,
      },
    })
    await logAudit({
      userId: user.id,
      action: 'CREATE_PRODUCT_CATEGORY',
      entity: 'ProductCategory',
      entityId: category.id,
      detail: `${name} dibuat oleh ${user.name}`,
    })
    return NextResponse.json({ category }, { status: 201 })
  } catch (e) {
    const { status, body } = apiErrorResponse(e)
    return NextResponse.json(body, { status })
  }
}

/** PUT /api/product-categories — update (OWNER only). Body: { id, name?, commissionRatePct?, commissionEnabled? } */
export async function PUT(req: NextRequest) {
  try {
    const user = await requireUser('OWNER')
    const body = await req.json().catch(() => null)
    const id = typeof body?.id === 'string' ? body.id : ''
    if (!id) {
      return NextResponse.json({ error: 'ID kategori wajib diisi' }, { status: 400 })
    }
    const existing = await db.productCategory.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Kategori tidak ditemukan' }, { status: 404 })
    }
    const data: Record<string, unknown> = {}
    if (typeof body.name === 'string' && body.name.trim()) data.name = body.name.trim()
    if (body.commissionRatePct !== undefined) {
      data.commissionRatePct = Math.min(100, Math.max(0, parseInt(String(body.commissionRatePct), 10) || 0))
    }
    if (body.commissionEnabled !== undefined) data.commissionEnabled = !!body.commissionEnabled

    const category = await db.productCategory.update({ where: { id }, data })
    if (data.commissionRatePct !== undefined || data.commissionEnabled !== undefined) {
      await logAudit({
        userId: user.id,
        action: 'UPDATE_PRODUCT_CATEGORY_COMMISSION',
        entity: 'ProductCategory',
        entityId: id,
        detail: `${existing.name}: rate ${data.commissionRatePct ?? existing.commissionRatePct}%, aktif ${data.commissionEnabled ?? existing.commissionEnabled} oleh ${user.name}`,
      })
    } else {
      await logAudit({
        userId: user.id,
        action: 'UPDATE_PRODUCT_CATEGORY',
        entity: 'ProductCategory',
        entityId: id,
        detail: `${existing.name} diubah oleh ${user.name}`,
      })
    }
    return NextResponse.json({ category })
  } catch (e) {
    const { status, body } = apiErrorResponse(e)
    return NextResponse.json(body, { status })
  }
}

/** DELETE /api/product-categories?id= — delete only when unused (OWNER only). */
export async function DELETE(req: NextRequest) {
  try {
    const user = await requireUser('OWNER')
    const id = req.nextUrl.searchParams.get('id')
    if (!id) {
      return NextResponse.json({ error: 'ID kategori wajib diisi' }, { status: 400 })
    }
    const existing = await db.productCategory.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Kategori tidak ditemukan' }, { status: 404 })
    }
    if (existing.isBarberService) {
      return NextResponse.json({ error: 'Kategori Layanan Barber tidak boleh dihapus' }, { status: 400 })
    }
    const used = await db.product.count({ where: { categoryId: id } })
    if (used > 0) {
      return NextResponse.json({ error: `Kategori dipakai ${used} produk, tidak bisa dihapus` }, { status: 400 })
    }
    await db.productCategory.delete({ where: { id } })
    await logAudit({
      userId: user.id,
      action: 'DELETE_PRODUCT_CATEGORY',
      entity: 'ProductCategory',
      entityId: id,
      detail: `${existing.name} dihapus oleh ${user.name}`,
    })
    return NextResponse.json({ ok: true })
  } catch (e) {
    const { status, body } = apiErrorResponse(e)
    return NextResponse.json(body, { status })
  }
}
