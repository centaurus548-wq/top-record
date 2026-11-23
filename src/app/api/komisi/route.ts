import { NextRequest, NextResponse } from 'next/server'
import { requireUser, apiErrorResponse } from '@/lib/auth'
import { todayISO, addDaysISO } from '@/lib/date'
import { computeKomisi } from '@/lib/komisi'

/**
 * GET /api/komisi?date=YYYY-MM-DD  or  ?from=YYYY-MM-DD&to=YYYY-MM-DD
 * Live commission computation per barber. Voided excluded.
 * MANAGER sees aggregated payroll data (allowed); KAPSTER only own row unless acting as kasir.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await requireUser()
    const sp = req.nextUrl.searchParams
    const date = sp.get('date')
    const from = sp.get('from')
    const to = sp.get('to')

    let f = from
    let t = to
    if (date) {
      f = date
      t = date
    }
    if (!f || !t) {
      f = todayISO()
      t = todayISO()
    }

    let rows = await computeKomisi(f, t)

    // Kapster only sees own row
    if (user.role === 'KAPSTER' && user.barberId) {
      rows = rows.filter((r) => r.barberId === user.barberId)
    }

    const summary = {
      from: f,
      to: t,
      totalServiceRevenue: rows.reduce((a, r) => a + r.serviceRevenue, 0),
      totalCommission: rows.reduce((a, r) => a + r.commission, 0),
      totalTipUnclaimed: rows.reduce((a, r) => a + r.tipUnclaimed, 0),
    }
    return NextResponse.json({ summary, rows })
  } catch (e) {
    const { status, body } = apiErrorResponse(e)
    return NextResponse.json(body, { status })
  }
}
