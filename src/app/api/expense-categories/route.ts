import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireUser, apiErrorResponse } from '@/lib/auth'
import { logAudit } from '@/lib/audit'

/** GET /api/expense-categories — all categories (any logged-in user). */
export async function GET() {
  try {
    await requireUser()
    const categories = await db.expenseCategory.findMany({ orderBy: { sortOrder: 'asc' } })
    return NextResponse.json({ categories })
  } catch (e) {
    const { status, body } = apiErrorResponse(e)
    return NextResponse.json(body, { status })
  }
}

/** POST /api/expense-categories — create (OWNER only). */
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser('OWNER')
    const body = await req.json().catch(() => null)
    const name = typeof body?.name === 'string' ? body.name.trim() : ''
    const ownerOnly = !!body?.ownerOnly
    if (!name) {
      return NextResponse.json({ error: 'Nama kategori wajib diisi' }, { status: 400 })
    }
    const maxSort = await db.expenseCategory.aggregate({ _max: { sortOrder: true } })
    const category = await db.expenseCategory.create({
      data: { name, ownerOnly, sortOrder: (maxSort._max.sortOrder ?? 0) + 1 },
    })
    await logAudit({
      userId: user.id,
      action: 'CREATE_EXPENSE_CATEGORY',
      entity: 'ExpenseCategory',
      entityId: category.id,
      detail: `${name}${ownerOnly ? ' (ownerOnly)' : ''} dibuat oleh ${user.name}`,
    })
    return NextResponse.json({ category }, { status: 201 })
  } catch (e) {
    const { status, body } = apiErrorResponse(e)
    return NextResponse.json(body, { status })
  }
}

/** PUT /api/expense-categories — update name/ownerOnly (OWNER only). */
export async function PUT(req: NextRequest) {
  try {
    const user = await requireUser('OWNER')
    const body = await req.json().catch(() => null)
    const id = typeof body?.id === 'string' ? body.id : ''
    if (!id) {
      return NextResponse.json({ error: 'ID kategori wajib diisi' }, { status: 400 })
    }
    const existing = await db.expenseCategory.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Kategori tidak ditemukan' }, { status: 404 })
    }
    const data: Record<string, unknown> = {}
    if (typeof body.name === 'string' && body.name.trim()) data.name = body.name.trim()
    if (body.ownerOnly !== undefined) data.ownerOnly = !!body.ownerOnly
    const category = await db.expenseCategory.update({ where: { id }, data })
    await logAudit({
      userId: user.id,
      action: 'UPDATE_EXPENSE_CATEGORY',
      entity: 'ExpenseCategory',
      entityId: id,
      detail: `${existing.name} diubah oleh ${user.name}`,
    })
    return NextResponse.json({ category })
  } catch (e) {
    const { status, body } = apiErrorResponse(e)
    return NextResponse.json(body, { status })
  }
}

/** DELETE /api/expense-categories?id= — delete only when unused (OWNER only). */
export async function DELETE(req: NextRequest) {
  try {
    const user = await requireUser('OWNER')
    const id = req.nextUrl.searchParams.get('id')
    if (!id) {
      return NextResponse.json({ error: 'ID kategori wajib diisi' }, { status: 400 })
    }
    const existing = await db.expenseCategory.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Kategori tidak ditemukan' }, { status: 404 })
    }
    const used = await db.expense.count({ where: { categoryId: id } })
    if (used > 0) {
      return NextResponse.json(
        { error: `Kategori dipakai di ${used} pengeluaran, tidak bisa dihapus` },
        { status: 400 }
      )
    }
    await db.expenseCategory.delete({ where: { id } })
    await logAudit({
      userId: user.id,
      action: 'DELETE_EXPENSE_CATEGORY',
      entity: 'ExpenseCategory',
      entityId: id,
      detail: `${existing.name} dihapus oleh ${user.name}`,
    })
    return NextResponse.json({ ok: true })
  } catch (e) {
    const { status, body } = apiErrorResponse(e)
    return NextResponse.json(body, { status })
  }
}
