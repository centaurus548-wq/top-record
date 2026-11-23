import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireUser, apiErrorResponse } from '@/lib/auth'
import { todayISO } from '@/lib/date'

/**
 * GET /api/expenses?date= | ?from&to  — list + categories.
 * POST /api/expenses — create (KASIR/OWNER/KAPSTER as kasir). R16: ownerOnly
 * categories (Restock, Gaji Harian) only by OWNER.
 */
export async function GET(req: NextRequest) {
  try {
    await requireUser()
    const sp = req.nextUrl.searchParams
    const date = sp.get('date')
    const from = sp.get('from')
    const to = sp.get('to')

    const where: Record<string, unknown> = {}
    if (date) where.date = date
    else if (from && to) where.date = { gte: from, lte: to }

    const [expenses, categories] = await Promise.all([
      db.expense.findMany({
        where,
        include: { category: true },
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
      db.expenseCategory.findMany({ orderBy: { sortOrder: 'asc' } }),
    ])
    return NextResponse.json({ expenses, categories })
  } catch (e) {
    const { status, body } = apiErrorResponse(e)
    return NextResponse.json(body, { status })
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser('OWNER', 'KASIR', 'KAPSTER')
    const body = await req.json().catch(() => null)
    const date = typeof body?.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.date) ? body.date : todayISO()
    const categoryId = typeof body?.categoryId === 'string' ? body.categoryId : ''
    const amount = parseInt(String(body?.amount ?? 0), 10)
    const source = body?.source === 'OWNER_PRIVATE' ? 'OWNER_PRIVATE' : 'KAS_SHOP'
    const method = body?.method === 'QRIS' ? 'QRIS' : 'CASH'
    const note = typeof body?.note === 'string' ? body.note.trim() || null : null

    if (!categoryId) {
      return NextResponse.json({ error: 'Kategori wajib dipilih' }, { status: 400 })
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: 'Nominal harus lebih dari 0' }, { status: 400 })
    }
    const cat = await db.expenseCategory.findUnique({ where: { id: categoryId } })
    if (!cat) {
      return NextResponse.json({ error: 'Kategori tidak ditemukan' }, { status: 404 })
    }
    // Revisi 8: semua pengguna login boleh mencatat semua kategori (akses penuh).

    const expense = await db.expense.create({
      data: { date, categoryId, amount, source, method, note, createdById: user.id },
    })
    await db.auditLog.create({
      data: {
        userId: user.id,
        action: 'CREATE_EXPENSE',
        entity: 'Expense',
        entityId: expense.id,
        detail: `${cat.name} ${amount} (${source}/${method}) oleh ${user.name}`,
      },
    })
    return NextResponse.json({ expense }, { status: 201 })
  } catch (e) {
    const { status, body } = apiErrorResponse(e)
    return NextResponse.json(body, { status })
  }
}
