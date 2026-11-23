import { db } from '@/lib/db'
import type { Barber, CommissionRule, RuleScope } from '@prisma/client'
import { addDaysISO, todayISO } from '@/lib/date'

export type ResolvedBarberRule = {
  ruleId: string
  ruleName: string
  scopeType: RuleScope
  thresholdHeads: number
  ratePct: number
}

export type BarberKomisi = {
  barberId: string
  barberName: string
  nickname: string
  tierName: string | null
  kepalaCount: number
  serviceRevenue: number
  productRevenue: number
  rule: ResolvedBarberRule
  thresholdMet: boolean
  serviceCommission: number
  productCommission: number
  commission: number
  tipEarned: number
  tipUnclaimed: number
  tipClaimed: number
}

/**
 * Resolve the effective commission rule for one barber:
 * override on barber > BARBER-scope rule > TIER-scope rule > DEFAULT rule.
 */
export function resolveBarberRule(
  barber: Barber,
  rules: CommissionRule[]
): ResolvedBarberRule {
  const fallback: ResolvedBarberRule = {
    ruleId: 'none',
    ruleName: 'Tidak ada aturan aktif',
    scopeType: 'DEFAULT',
    thresholdHeads: 999999,
    ratePct: 0,
  }
  const active = rules.filter((r) => r.active)

  if (barber.commissionOverrideEnabled) {
    return {
      ruleId: 'override',
      ruleName: `Override ${barber.nickname}`,
      scopeType: 'BARBER',
      thresholdHeads: barber.commissionOverrideThresholdHeads ?? 5,
      ratePct: barber.commissionOverrideRatePct ?? 0,
    }
  }
  const barberRule = active
    .filter((r) => r.scopeType === 'BARBER' && r.barberId === barber.id)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0]
  if (barberRule) {
    return {
      ruleId: barberRule.id,
      ruleName: barberRule.name,
      scopeType: barberRule.scopeType,
      thresholdHeads: barberRule.thresholdHeads,
      ratePct: barberRule.ratePct,
    }
  }
  const tierRule = barber.commissionTierId || barber.tierId
    ? active
        .filter(
          (r) =>
            r.scopeType === 'TIER' &&
            (r.tierId === barber.commissionTierId || r.tierId === barber.tierId)
        )
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0]
    : undefined
  if (tierRule) {
    return {
      ruleId: tierRule.id,
      ruleName: tierRule.name,
      scopeType: tierRule.scopeType,
      thresholdHeads: tierRule.thresholdHeads,
      ratePct: tierRule.ratePct,
    }
  }
  const def = active.find((r) => r.scopeType === 'DEFAULT')
  if (def) {
    return {
      ruleId: def.id,
      ruleName: def.name,
      scopeType: def.scopeType,
      thresholdHeads: def.thresholdHeads,
      ratePct: def.ratePct,
    }
  }
  return fallback
}

type TxnLike = {
  id: string
  tipAmount: number
  tipBarberId: string | null
  tipStatus: string
  items: {
    itemType: string
    price: number
    qty: number
    barberId: string | null
    kepalaGroup: number
    productId: string | null
  }[]
}

/**
 * Compute komisi for each barber over a date range (inclusive), live from
 * transactions. Voided transactions are excluded everywhere.
 *
 * Kepala counting (R5): per barber, count DISTINCT (transactionId, kepalaGroup)
 * pairs where the barber has at least one SERVICE item in that kepala group.
 */
export async function computeKomisi(from: string, to: string): Promise<BarberKomisi[]> {
  const [barbers, rules, categories, txns] = await Promise.all([
    db.barber.findMany({
      where: { active: true },
      include: { tier: true },
      orderBy: { name: 'asc' },
    }),
    db.commissionRule.findMany({ where: { active: true } }),
    db.productCategory.findMany(),
    db.transaction.findMany({
      where: {
        date: { gte: from, lte: to },
        status: 'NORMAL',
      },
      include: { items: true },
      orderBy: { createdAt: 'asc' },
    }),
  ])

  const catById = new Map(categories.map((c) => [c.id, c]))
  const products = await db.product.findMany()
  const prodById = new Map(products.map((p) => [p.id, p]))

  const result: BarberKomisi[] = barbers.map((b) => ({
    barberId: b.id,
    barberName: b.name,
    nickname: b.nickname,
    tierName: b.tier?.name ?? null,
    kepalaCount: 0,
    serviceRevenue: 0,
    productRevenue: 0,
    rule: resolveBarberRule(b, rules),
    thresholdMet: false,
    serviceCommission: 0,
    productCommission: 0,
    commission: 0,
    tipEarned: 0,
    tipUnclaimed: 0,
    tipClaimed: 0,
  }))
  const byId = new Map(result.map((r) => [r.barberId, r]))

  for (const b of barbers) {
    const row = byId.get(b.id)!
    const kepalaKeys = new Set<string>()

    for (const t of txns as TxnLike[]) {
      // Tips (R2): 100% for the barber
      if (t.tipBarberId === b.id && t.tipAmount > 0) {
        row.tipEarned += t.tipAmount
        if (t.tipStatus === 'UNCLAIMED') row.tipUnclaimed += t.tipAmount
        if (t.tipStatus === 'CLAIMED') row.tipClaimed += t.tipAmount
      }

      for (const item of t.items) {
        const revenue = item.price * (item.qty || 1)
        if (item.itemType === 'SERVICE' && item.barberId === b.id) {
          row.serviceRevenue += revenue
          kepalaKeys.add(`${t.id}:${item.kepalaGroup}`)
        }
        if (item.itemType === 'PRODUCT' && item.barberId === b.id) {
          row.productRevenue += revenue
          const prod = item.productId ? prodById.get(item.productId) : undefined
          const cat = prod ? catById.get(prod.categoryId) : undefined
          if (cat && cat.commissionEnabled && cat.commissionRatePct > 0) {
            row.productCommission += Math.floor((revenue * cat.commissionRatePct) / 100)
          }
        }
      }
    }

    row.kepalaCount = kepalaKeys.size
    row.thresholdMet = row.kepalaCount >= row.rule.thresholdHeads
    // Retroactive: when threshold met, rate applies to ALL of the day's service revenue.
    row.serviceCommission = row.thresholdMet
      ? Math.floor((row.serviceRevenue * row.rule.ratePct) / 100)
      : 0
    row.commission = row.serviceCommission + row.productCommission
  }

  return result
}

/** Get today's komisi rows (single date). */
export async function computeKomisiToday(): Promise<BarberKomisi[]> {
  const today = todayISO()
  return computeKomisi(today, today)
}

/** Generate next invoice number for the given date: INV-YYYYMMDD-### */
export async function nextInvoiceNo(date: string): Promise<string> {
  const compact = date.replace(/-/g, '')
  const prefix = `INV-${compact}-`
  const count = await db.transaction.count({
    where: { invoiceNo: { startsWith: prefix } },
  })
  for (let i = count + 1; i < 10000; i++) {
    const candidate = `${prefix}${String(i).padStart(3, '0')}`
    const exists = await db.transaction.findUnique({ where: { invoiceNo: candidate } })
    if (!exists) return candidate
  }
  throw new Error('Nomor invoice melebihi kapasitas')
}

export { addDaysISO }
