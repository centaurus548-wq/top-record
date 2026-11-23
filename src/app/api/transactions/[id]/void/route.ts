import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireUser, apiErrorResponse } from '@/lib/auth'

/**
 * POST /api/transactions/[id]/void — { reason }
 * R3: never hard-delete. Revisi 8: void hari apa pun diperbolehkan
 * (satu level akses penuh). Alasan wajib; dicatat siapa pembatalkannya.
 * Voided transactions are excluded from all reports, kepala counts, komisi, closing.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser('OWNER', 'KASIR', 'KAPSTER')
    const { id } = await params
    const body = await req.json().catch(() => null)
    const reason = typeof body?.reason === 'string' ? body.reason.trim() : ''
    if (!reason) {
      return NextResponse.json({ error: 'Alasan pembatalan wajib diisi' }, { status: 400 })
    }

    const txn = await db.transaction.findUnique({ where: { id } })
    if (!txn) {
      return NextResponse.json({ error: 'Transaksi tidak ditemukan' }, { status: 404 })
    }
    if (txn.status === 'VOIDED') {
      return NextResponse.json({ error: 'Transaksi sudah dibatalkan' }, { status: 400 })
    }

    // Revisi 8: pembatalan hari apa pun diperbolehkan (akses penuh, alasan wajib).

    const updated = await db.transaction.update({
      where: { id },
      data: {
        status: 'VOIDED',
        voidReason: reason,
        voidedById: user.id,
        voidedAt: new Date(),
      },
    })

    await db.auditLog.create({
      data: {
        userId: user.id,
        action: 'VOID_TRANSACTION',
        entity: 'Transaction',
        entityId: txn.id,
        detail: `${txn.invoiceNo} dibatalkan (${user.name}): ${reason}`,
      },
    })

    return NextResponse.json({ transaction: updated })
  } catch (e) {
    const { status, body } = apiErrorResponse(e)
    return NextResponse.json(body, { status })
  }
}
