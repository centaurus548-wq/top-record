import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireUser, apiErrorResponse } from '@/lib/auth'
import { todayISO } from '@/lib/date'
import { nextInvoiceNo } from '@/lib/komisi'

type IncomingItem = {
  itemType?: string
  serviceItemId?: string
  productId?: string
  qty?: number
}

type IncomingKepala = {
  kepalaGroup?: number
  barberId?: string | null
  items?: IncomingItem[]
}

/**
 * GET /api/transactions
 * Filters: date, from, to, barberId, status (NORMAL|VOIDED|ALL), q (search invoice/customer name)
 */
export async function GET(req: NextRequest) {
  try {
    await requireUser()
    const sp = req.nextUrl.searchParams
    const date = sp.get('date')
    const from = sp.get('from')
    const to = sp.get('to')
    const barberId = sp.get('barberId')
    const status = sp.get('status') ?? 'NORMAL'
    const q = sp.get('q')
    const limit = Math.min(parseInt(sp.get('limit') ?? '100', 10) || 100, 500)

    const where: Record<string, unknown> = {}
    if (date) where.date = date
    else if (from && to) where.date = { gte: from, lte: to }
    if (status === 'VOIDED') where.status = 'VOIDED'
    else if (status === 'ALL') where.status = { in: ['NORMAL', 'VOIDED'] }
    else where.status = 'NORMAL'
    if (q) {
      where.OR = [{ invoiceNo: { contains: q } }, { customerName: { contains: q } }]
    }
    if (barberId) where.items = { some: { barberId } }

    const txns = await db.transaction.findMany({
      where,
      include: { items: true },
      orderBy: { createdAt: 'desc' },
      take: limit,
    })
    return NextResponse.json({ transactions: txns })
  } catch (e) {
    const { status, body } = apiErrorResponse(e)
    return NextResponse.json(body, { status })
  }
}

/**
 * POST /api/transactions — create a POS transaction.
 *
 * Body:
 * {
 *   kepalaGroups: [{ kepalaGroup: 1, barberId?: string, items: [{ itemType, serviceItemId?, productId?, qty? }] }],
 *   paymentMethod: 'CASH' | 'QRIS',
 *   tip?: { amount, barberId, method? },
 *   customerName?: string
 * }
 *
 * Prices are always recomputed from the DB (never trusted from client).
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser('OWNER', 'KASIR', 'KAPSTER')
    const body = await req.json().catch(() => null)
    const kepalaGroups: IncomingKepala[] = Array.isArray(body?.kepalaGroups) ? body.kepalaGroups : []
    const paymentMethod: 'CASH' | 'QRIS' = body?.paymentMethod === 'QRIS' ? 'QRIS' : 'CASH'
    const customerName = typeof body?.customerName === 'string' ? body.customerName.trim() || null : null

    if (kepalaGroups.length === 0) {
      return NextResponse.json({ error: 'Minimal satu kepala harus ada' }, { status: 400 })
    }

    // Validate structure & collect referenced ids
    const serviceIds = new Set<string>()
    const productIds = new Set<string>()
    let itemCount = 0
    for (const kg of kepalaGroups) {
      if (!kg || typeof kg.kepalaGroup !== 'number' || kg.kepalaGroup < 1) {
        return NextResponse.json({ error: 'Nomor kepala tidak valid' }, { status: 400 })
      }
      if (!Array.isArray(kg.items) || kg.items.length === 0) {
        return NextResponse.json({ error: 'Setiap kepala harus punya minimal satu item' }, { status: 400 })
      }
      if (!kg.barberId || typeof kg.barberId !== 'string') {
        return NextResponse.json({ error: 'Setiap kepala wajib punya kapster (opsi tanpa kapster sudah dihapus)' }, { status: 400 })
      }
      for (const it of kg.items) {
        itemCount++
        if (it?.itemType === 'SERVICE' && it.serviceItemId) serviceIds.add(it.serviceItemId)
        else if (it?.itemType === 'PRODUCT' && it.productId) productIds.add(it.productId)
        else {
          return NextResponse.json({ error: 'Item tidak valid' }, { status: 400 })
        }
      }
    }
    if (itemCount === 0) {
      return NextResponse.json({ error: 'Tidak ada item pada transaksi' }, { status: 400 })
    }

    const [services, products] = await Promise.all([
      db.serviceItem.findMany({ where: { id: { in: [...serviceIds] } } }),
      db.product.findMany({ where: { id: { in: [...productIds] } } }),
    ])
    const svcMap = new Map(services.map((s) => [s.id, s]))
    const prodMap = new Map(products.map((p) => [p.id, p]))

    // Validate barbers referenced
    const barberIds = new Set(
      kepalaGroups.filter((kg) => kg.barberId).map((kg) => kg.barberId as string)
    )
    if (body?.tip?.barberId) barberIds.add(body.tip.barberId)
    const barbers = barberIds.size
      ? await db.barber.findMany({ where: { id: { in: [...barberIds] }, active: true } })
      : []
    const barberMap = new Map(barbers.map((b) => [b.id, b]))
    for (const kg of kepalaGroups) {
      if (kg.barberId && !barberMap.has(kg.barberId)) {
        return NextResponse.json({ error: 'Kapster tidak ditemukan / tidak aktif' }, { status: 400 })
      }
    }

    // Build item rows, validate product stock
    const itemRows: {
      itemType: 'SERVICE' | 'PRODUCT'
      serviceItemId: string | null
      productId: string | null
      name: string
      price: number
      qty: number
      barberId: string | null
      kepalaGroup: number
    }[] = []
    const stockDeltas = new Map<string, number>()

    for (const kg of kepalaGroups) {
      for (const it of kg.items!) {
        const qty = Math.max(1, Math.min(50, parseInt(String(it.qty ?? 1), 10) || 1))
        if (it.itemType === 'SERVICE') {
          const svc = svcMap.get(it.serviceItemId!)
          if (!svc || !svc.active) {
            return NextResponse.json({ error: `Layanan tidak ditemukan` }, { status: 400 })
          }
          itemRows.push({
            itemType: 'SERVICE',
            serviceItemId: svc.id,
            productId: null,
            name: svc.name,
            price: svc.price,
            qty: 1,
            barberId: kg.barberId ?? null,
            kepalaGroup: kg.kepalaGroup!,
          })
        } else {
          const prod = prodMap.get(it.productId!)
          if (!prod || !prod.active) {
            return NextResponse.json({ error: `Produk tidak ditemukan` }, { status: 400 })
          }
          const need = (stockDeltas.get(prod.id) ?? 0) + qty
          if (need > prod.stock) {
            return NextResponse.json(
              { error: `Stok ${prod.name} tidak cukup (sisa ${prod.stock})` },
              { status: 400 }
            )
          }
          stockDeltas.set(prod.id, need)
          itemRows.push({
            itemType: 'PRODUCT',
            serviceItemId: null,
            productId: prod.id,
            name: prod.name,
            price: prod.price,
            qty,
            barberId: kg.barberId ?? null,
            kepalaGroup: kg.kepalaGroup!,
          })
        }
      }
    }

    const total = itemRows.reduce((acc, r) => acc + r.price * r.qty, 0)
    if (total <= 0) {
      return NextResponse.json({ error: 'Total transaksi harus lebih dari 0' }, { status: 400 })
    }

    // Tip (R2)
    let tipAmount = 0
    let tipBarberId: string | null = null
    let tipMethod: 'CASH' | 'QRIS' | null = null
    if (body?.tip && typeof body.tip === 'object') {
      tipAmount = Math.max(0, parseInt(String(body.tip.amount ?? 0), 10) || 0)
      tipBarberId = typeof body.tip.barberId === 'string' ? body.tip.barberId : null
      if (tipAmount > 0) {
        if (!tipBarberId || !barberMap.has(tipBarberId)) {
          return NextResponse.json({ error: 'Tip harus punya kapster yang valid' }, { status: 400 })
        }
        tipMethod = body.tip.method === 'QRIS' ? 'QRIS' : 'CASH'
      } else {
        tipBarberId = null
      }
    }

    const date = todayISO()
    const invoiceNo = await nextInvoiceNo(date)

    const txn = await db.$transaction(async (tx) => {
      const created = await tx.transaction.create({
        data: {
          invoiceNo,
          date,
          total,
          paymentMethod,
          tipAmount,
          tipBarberId,
          tipMethod,
          tipStatus: tipAmount > 0 ? 'UNCLAIMED' : 'NONE',
          status: 'NORMAL',
          createdById: user.id,
          customerName,
          items: {
            create: itemRows.map((r) => ({
              itemType: r.itemType,
              serviceItemId: r.serviceItemId,
              productId: r.productId,
              name: r.name,
              price: r.price,
              qty: r.qty,
              barberId: r.barberId,
              kepalaGroup: r.kepalaGroup,
            })),
          },
        },
        include: { items: true },
      })
      for (const [productId, delta] of stockDeltas) {
        await tx.product.update({ where: { id: productId }, data: { stock: { decrement: delta } } })
      }
      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: 'CREATE_TRANSACTION',
          entity: 'Transaction',
          entityId: created.id,
          detail: `${invoiceNo} total ${total}, ${itemRows.length} item, metode ${paymentMethod}`,
        },
      })
      return created
    })

    return NextResponse.json({ transaction: txn }, { status: 201 })
  } catch (e) {
    const { status, body } = apiErrorResponse(e)
    return NextResponse.json(body, { status })
  }
}
