import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireUser, apiErrorResponse } from '@/lib/auth'

/**
 * POST /api/produk/adjust — stock adjustment with mandatory reason (R14, OWNER only).
 * Body: { productId, delta (can be negative), reason }
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser('OWNER')
    const body = await req.json().catch(() => null)
    const productId = typeof body?.productId === 'string' ? body.productId : ''
    const delta = parseInt(String(body?.delta ?? 0), 10)
    const reason = typeof body?.reason === 'string' ? body.reason.trim() : ''
    if (!productId || !Number.isFinite(delta) || delta === 0) {
      return NextResponse.json({ error: 'Produk dan delta stok wajib diisi' }, { status: 400 })
    }
    if (!reason) {
      return NextResponse.json({ error: 'Alasan penyesuaian stok wajib diisi' }, { status: 400 })
    }
    const product = await db.product.findUnique({ where: { id: productId } })
    if (!product) {
      return NextResponse.json({ error: 'Produk tidak ditemukan' }, { status: 404 })
    }
    const newStock = product.stock + delta
    if (newStock < 0) {
      return NextResponse.json({ error: `Stok tidak boleh minus (sisa ${product.stock})` }, { status: 400 })
    }
    const [adjusted, adjustment] = await db.$transaction([
      db.product.update({ where: { id: productId }, data: { stock: newStock } }),
      db.stockAdjustment.create({
        data: { productId, delta, reason, createdById: user.id },
      }),
    ])
    await db.auditLog.create({
      data: {
        userId: user.id,
        action: 'STOCK_ADJUST',
        entity: 'Product',
        entityId: productId,
        detail: `${product.name} ${delta > 0 ? '+' : ''}${delta} -> ${newStock}: ${reason}`,
      },
    })
    return NextResponse.json({ product: adjusted, adjustment })
  } catch (e) {
    const { status, body } = apiErrorResponse(e)
    return NextResponse.json(body, { status })
  }
}
