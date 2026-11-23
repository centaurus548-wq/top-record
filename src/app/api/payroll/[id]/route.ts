import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireUser, apiErrorResponse } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { computePayrollLines } from '@/lib/payroll'

/**
 * GET /api/payroll/[id] — period detail with lines (OWNER + MANAGER).
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireUser('OWNER', 'MANAGER')
    const { id } = await params
    const period = await db.payrollPeriod.findUnique({
      where: { id },
      include: { lines: { include: { barber: { include: { tier: true } } } } },
    })
    if (!period) {
      return NextResponse.json({ error: 'Periode gajian tidak ditemukan' }, { status: 404 })
    }
    return NextResponse.json({ period })
  } catch (e) {
    const { status, body } = apiErrorResponse(e)
    return NextResponse.json(body, { status })
  }
}

/**
 * POST /api/payroll/[id] — actions.
 * Body:
 *  { action: 'pay-line', lineId }            — OWNER/MANAGER: mark one line PAID
 *  { action: 'unpay-line', lineId }          — OWNER: reopen a paid line
 *  { action: 'pay-all' }                     — OWNER/MANAGER: mark all UNPAID lines PAID
 *  { action: 'refresh' }                     — OWNER: recompute lines from live data (OPEN only)
 *  { action: 'close' }                       — OWNER: lock the period
 *  { action: 'reopen' }                      — OWNER: reopen a closed period
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser('OWNER', 'MANAGER')
    const { id } = await params
    const body = await req.json().catch(() => null)
    const action = body?.action

    const period = await db.payrollPeriod.findUnique({ where: { id } })
    if (!period) {
      return NextResponse.json({ error: 'Periode gajian tidak ditemukan' }, { status: 404 })
    }

    if (action === 'pay-line' || action === 'unpay-line') {
      const lineId = typeof body?.lineId === 'string' ? body.lineId : ''
      const line = await db.payrollLine.findUnique({ where: { id: lineId } })
      if (!line || line.periodId !== id) {
        return NextResponse.json({ error: 'Baris gajian tidak ditemukan' }, { status: 404 })
      }
      if (action === 'pay-line') {
        if (line.status === 'PAID') {
          return NextResponse.json({ error: 'Baris sudah ditandai dibayar' }, { status: 400 })
        }
        const updated = await db.payrollLine.update({
          where: { id: lineId },
          data: { status: 'PAID', paidAt: new Date(), paidById: user.id },
        })
        await logAudit({
          userId: user.id,
          action: 'PAYROLL_PAY_LINE',
          entity: 'PayrollLine',
          entityId: lineId,
          detail: `${period.name}: ${line.barberId} dibayar ${line.total} oleh ${user.name}`,
        })
        return NextResponse.json({ line: updated })
      }
      // unpay-line: OWNER only
      // Revisi 8: akses penuh — tidak ada lagi pembatasan Owner saja.
      const updated = await db.payrollLine.update({
        where: { id: lineId },
        data: { status: 'UNPAID', paidAt: null, paidById: null },
      })
      await logAudit({
        userId: user.id,
        action: 'PAYROLL_UNPAY_LINE',
        entity: 'PayrollLine',
        entityId: lineId,
        detail: `${period.name}: pembayaran dibatalkan oleh ${user.name}`,
      })
      return NextResponse.json({ line: updated })
    }

    if (action === 'pay-all') {
      const lines = await db.payrollLine.updateMany({
        where: { periodId: id, status: 'UNPAID' },
        data: { status: 'PAID', paidAt: new Date(), paidById: user.id },
      })
      await logAudit({
        userId: user.id,
        action: 'PAYROLL_PAY_ALL',
        entity: 'PayrollPeriod',
        entityId: id,
        detail: `${period.name}: ${lines.count} baris ditandai dibayar oleh ${user.name}`,
      })
      return NextResponse.json({ updated: lines.count })
    }

    if (action === 'refresh') {
      // Revisi 8: akses penuh — tidak ada lagi pembatasan Owner saja.
      if (period.status !== 'OPEN') {
        return NextResponse.json({ error: 'Periode sudah dikunci' }, { status: 400 })
      }
      const computed = await computePayrollLines(period.startDate, period.endDate)
      for (const l of computed) {
        const existing = await db.payrollLine.findUnique({
          where: { periodId_barberId: { periodId: id, barberId: l.barberId } },
        })
        if (existing && existing.status === 'PAID') continue // never overwrite paid lines
        if (existing) {
          await db.payrollLine.update({
            where: { id: existing.id },
            data: {
              daysWorked: l.daysWorked,
              lateCount: l.lateCount,
              attendancePay: l.attendancePay,
              komisi: l.komisi,
              tip: l.tip,
              total: l.total,
              attendanceDetail: l.attendanceDetail,
            },
          })
        } else {
          await db.payrollLine.create({
            data: {
              periodId: id,
              barberId: l.barberId,
              daysWorked: l.daysWorked,
              lateCount: l.lateCount,
              attendancePay: l.attendancePay,
              komisi: l.komisi,
              tip: l.tip,
              total: l.total,
              attendanceDetail: l.attendanceDetail,
            },
          })
        }
      }
      await logAudit({
        userId: user.id,
        action: 'PAYROLL_REFRESH',
        entity: 'PayrollPeriod',
        entityId: id,
        detail: `${period.name} di-refresh oleh ${user.name}`,
      })
      const lines = await db.payrollLine.findMany({ where: { periodId: id }, include: { barber: true } })
      return NextResponse.json({ lines })
    }

    if (action === 'close') {
      // Revisi 8: akses penuh — tidak ada lagi pembatasan Owner saja.
      if (period.status !== 'OPEN') {
        return NextResponse.json({ error: 'Periode sudah terkunci' }, { status: 400 })
      }
      const updated = await db.payrollPeriod.update({
        where: { id },
        data: { status: 'CLOSED', closedById: user.id, closedAt: new Date() },
      })
      await logAudit({
        userId: user.id,
        action: 'PAYROLL_CLOSE_PERIOD',
        entity: 'PayrollPeriod',
        entityId: id,
        detail: `${period.name} dikunci oleh ${user.name}`,
      })
      return NextResponse.json({ period: updated })
    }

    if (action === 'reopen') {
      // Revisi 8: akses penuh — tidak ada lagi pembatasan Owner saja.
      if (period.status !== 'CLOSED') {
        return NextResponse.json({ error: 'Periode tidak dalam status terkunci' }, { status: 400 })
      }
      const updated = await db.payrollPeriod.update({
        where: { id },
        data: { status: 'OPEN', closedById: null, closedAt: null, reopenedById: user.id, reopenedAt: new Date() },
      })
      await logAudit({
        userId: user.id,
        action: 'PAYROLL_REOPEN_PERIOD',
        entity: 'PayrollPeriod',
        entityId: id,
        detail: `${period.name} dibuka ulang oleh ${user.name}`,
      })
      return NextResponse.json({ period: updated })
    }

    return NextResponse.json({ error: 'Aksi tidak dikenal' }, { status: 400 })
  } catch (e) {
    const { status, body } = apiErrorResponse(e)
    return NextResponse.json(body, { status })
  }
}
