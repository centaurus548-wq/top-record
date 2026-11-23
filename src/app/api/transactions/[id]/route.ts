import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireUser, apiErrorResponse } from '@/lib/auth'

/** GET /api/transactions/[id] — transaction detail including creator info. */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireUser()
    const { id } = await params
    const txn = await db.transaction.findUnique({
      where: { id },
      include: { items: true },
    })
    if (!txn) {
      return NextResponse.json({ error: 'Transaksi tidak ditemukan' }, { status: 404 })
    }
    return NextResponse.json({ transaction: txn })
  } catch (e) {
    const { status, body } = apiErrorResponse(e)
    return NextResponse.json(body, { status })
  }
}
