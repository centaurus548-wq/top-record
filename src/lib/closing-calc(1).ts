import { db } from '@/lib/db'
import { dayRangeUTC } from '@/lib/date'

/**
 * Expected physical drawer cash for one operational day (Asia/Bangkok).
 *
 * Logic (owner-confirmed rules R18/R19):
 * - openingCash: custom cash float entered at day open.
 * - cashTxnTotal: totals of NORMAL CASH transactions (tip merged in cash
 *   payment is INCLUDED — the money is physically in the drawer).
 * - cashExpense: KAS_SHOP + CASH expenses paid out of the drawer.
 * - tipsPaidOut: tips CLAIMED on this calendar day (claimedAt in range).
 *   Claiming a tip = kasir hands cash from the drawer to the barber, which
 *   is a cash movement on the claim day (regardless of the tip's original
 *   method: CASH tips were counted inside cashTxnTotal, QRIS tips never
 *   touched the drawer but are disbursed in cash).
 * - Unclaimed tips need no separate line: CASH tips are already inside
 *   cashTxnTotal; QRIS tips are not drawer cash at all.
 */
export async function computeCashBreakdown(date: string) {
  const [cashDay, cashTxns, expenses, claimedTips] = await Promise.all([
    db.cashDay.findUnique({ where: { date } }),
    db.transaction.findMany({
      where: { date, status: 'NORMAL', paymentMethod: 'CASH' },
      select: { total: true },
    }),
    db.expense.findMany({
      where: { date, source: 'KAS_SHOP', method: 'CASH' },
      select: { amount: true },
    }),
    db.transaction.findMany({
      where: {
        tipAmount: { gt: 0 },
        tipStatus: 'CLAIMED',
        tipClaimedAt: dayRangeUTC(date),
      },
      select: { tipAmount: true },
    }),
  ])

  const openingCash = cashDay?.openingCash ?? 0
  const cashTxnTotal = cashTxns.reduce((a, t) => a + t.total, 0)
  const cashExpense = expenses.reduce((a, e) => a + e.amount, 0)
  const tipsPaidOut = claimedTips.reduce((a, t) => a + t.tipAmount, 0)
  const expectedCash = openingCash + cashTxnTotal - cashExpense - tipsPaidOut

  return {
    cashDay,
    breakdown: {
      openingCash,
      cashTxnTotal,
      cashExpense,
      tipsPaidOut,
      expectedCash,
    },
  }
}
