import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireUser, apiErrorResponse } from '@/lib/auth'

/**
 * GET /api/produk — products + categories (R16: OWNER only, restock & stock
 * management is an owner-only menu).
 */
export async function GET() {
  try {
    await requireUser('OWNER')
    const [products, categories] = await Promise.all([
      db.product.findMany({
        where: { active: true },
        include: { category: true },
        orderBy: [{ category: { sortOrder: 'asc' } }, { name: 'asc' }],
      }),
      db.productCategory.findMany({ where: { isBarberService: false }, orderBy: { sortOrder: 'asc' } }),
    ])
    return NextResponse.json({ products, categories })
  } catch (e) {
    const { status, body } = apiErrorResponse(e)
    return NextResponse.json(body, { status })
  }
}

/** POST /api/produk — create product (OWNER only). */
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser('OWNER')
    const body = await req.json().catch(() => null)
    const name = typeof body?.name === 'string' ? body.name.trim() : ''
    const categoryId = typeof body?.categoryId === 'string' ? body.categoryId : ''
    const price = parseInt(String(body?.price ?? 0), 10)
    const costPrice = body?.costPrice !== undefined && body?.costPrice !== null && body?.costPrice !== ''
      ? parseInt(String(body.costPrice), 10)
      : null
    const stock = parseInt(String(body?.stock ?? 0), 10)
    const minStock = parseInt(String(body?.minStock ?? 5), 10)
    if (!name || !categoryId || !Number.isFinite(price) || price <= 0) {
      return NextResponse.json({ error: 'Nama, kategori, dan harga wajib diisi' }, { status: 400 })
    }
    const cat = await db.productCategory.findUnique({ where: { id: categoryId } })
    if (!cat || cat.isBarberService) {
      return NextResponse.json({ error: 'Kategori produk tidak valid' }, { status: 400 })
    }
    const product = await db.product.create({
      data: {
        name,
        categoryId,
        price,
        costPrice: costPrice !== null && Number.isFinite(costPrice) ? costPrice : null,
        stock: Math.max(0, Number.isFinite(stock) ? stock : 0),
        minStock: Math.max(0, Number.isFinite(minStock) ? minStock : 5),
        active: true,
      },
    })
    await db.auditLog.create({
      data: {
        userId: user.id,
        action: 'CREATE_PRODUCT',
        entity: 'Product',
        entityId: product.id,
        detail: `${name} harga ${price} stok ${product.stock}`,
      },
    })
    return NextResponse.json({ product }, { status: 201 })
  } catch (e) {
    const { status, body } = apiErrorResponse(e)
    return NextResponse.json(body, { status })
  }
}

/** PUT /api/produk — update product fields (OWNER only). Body: { id, name?, price?, costPrice?, minStock?, active?, categoryId?, stock? }
 * Direct stock edits are recorded as a StockAdjustment (reason "Edit manual produk").
 */
export async function PUT(req: NextRequest) {
  try {
    const user = await requireUser('OWNER')
    const body = await req.json().catch(() => null)
    const id = typeof body?.id === 'string' ? body.id : ''
    if (!id) return NextResponse.json({ error: 'ID produk wajib diisi' }, { status: 400 })
    const existing = await db.product.findUnique({ where: { id } })
    if (!existing) return NextResponse.json({ error: 'Produk tidak ditemukan' }, { status: 404 })

    const data: Record<string, unknown> = {}
    if (typeof body.name === 'string' && body.name.trim()) data.name = body.name.trim()
    if (body.price !== undefined) data.price = Math.max(0, parseInt(String(body.price), 10) || 0)
    if (body.costPrice !== undefined) data.costPrice = body.costPrice === null || body.costPrice === '' ? null : Math.max(0, parseInt(String(body.costPrice), 10) || 0)
    if (body.minStock !== undefined) data.minStock = Math.max(0, parseInt(String(body.minStock), 10) || 0)
    if (body.active !== undefined) data.active = !!body.active
    if (typeof body.categoryId === 'string' && body.categoryId) {
      const cat = await db.productCategory.findUnique({ where: { id: body.categoryId } })
      if (!cat || cat.isBarberService) {
        return NextResponse.json({ error: 'Kategori produk tidak valid' }, { status: 400 })
      }
      data.categoryId = body.categoryId
    }

    let stockDelta = 0
    if (body.stock !== undefined && body.stock !== '') {
      const newStock = Math.max(0, parseInt(String(body.stock), 10) || 0)
      stockDelta = newStock - existing.stock
      if (stockDelta !== 0) data.stock = newStock
    }

    const product = await db.product.update({ where: { id }, data })
    if (stockDelta !== 0) {
      await db.stockAdjustment.create({
        data: { productId: id, delta: stockDelta, reason: 'Edit manual produk', createdById: user.id },
      })
    }
    await db.auditLog.create({
      data: {
        userId: user.id,
        action: 'UPDATE_PRODUCT',
        entity: 'Product',
        entityId: id,
        detail: JSON.stringify({ ...data, stockDelta: stockDelta !== 0 ? stockDelta : undefined }),
      },
    })
    return NextResponse.json({ product })
  } catch (e) {
    const { status, body } = apiErrorResponse(e)
    return NextResponse.json(body, { status })
  }
}

/**
 * DELETE /api/produk?id= — soft-delete a product (OWNER only): active=false,
 * hidden from POS/catalog/reports but kept in DB so history snapshots stay intact.
 */
export async function DELETE(req: NextRequest) {
  try {
    const user = await requireUser('OWNER')
    const id = req.nextUrl.searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'ID produk wajib diisi' }, { status: 400 })
    const existing = await db.product.findUnique({ where: { id } })
    if (!existing) return NextResponse.json({ error: 'Produk tidak ditemukan' }, { status: 404 })

    const used = await db.transactionItem.count({ where: { productId: id } })
    if (used > 0 || existing.stock > 0) {
      const product = await db.product.update({ where: { id }, data: { active: false } })
      await db.auditLog.create({
        data: {
          userId: user.id,
          action: 'DEACTIVATE_PRODUCT',
          entity: 'Product',
          entityId: id,
          detail: `${existing.name} dinonaktifkan (dipakai di ${used} transaksi) oleh ${user.name}`,
        },
      })
      return NextResponse.json({ ok: true, softDeleted: true })
    }

    await db.product.delete({ where: { id } })
    await db.auditLog.create({
      data: {
        userId: user.id,
        action: 'DELETE_PRODUCT',
        entity: 'Product',
        entityId: id,
        detail: `${existing.name} dihapus permanen (tanpa riwayat, stok 0) oleh ${user.name}`,
      },
    })
    return NextResponse.json({ ok: true, softDeleted: false })
  } catch (e) {
    const { status, body } = apiErrorResponse(e)
    return NextResponse.json(body, { status })
  }
}
