import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireUser, apiErrorResponse } from '@/lib/auth'

/**
 * GET /api/komisi/rules — all rules (with tier/barber/category names) + barber overrides.
 */
export async function GET() {
  try {
    await requireUser()
    const [rules, tiers, barbers, categories] = await Promise.all([
      db.commissionRule.findMany({ orderBy: { createdAt: 'desc' } }),
      db.kapsterTier.findMany({ orderBy: { sortOrder: 'asc' } }),
      db.barber.findMany({ where: { active: true }, orderBy: { name: 'asc' } }),
      db.productCategory.findMany({ where: { isBarberService: false }, orderBy: { sortOrder: 'asc' } }),
    ])
    return NextResponse.json({
      rules,
      tiers,
      barbers: barbers.map((b) => ({
        id: b.id,
        name: b.name,
        nickname: b.nickname,
        commissionOverrideEnabled: b.commissionOverrideEnabled,
        commissionOverrideThresholdHeads: b.commissionOverrideThresholdHeads,
        commissionOverrideRatePct: b.commissionOverrideRatePct,
        tierId: b.tierId,
      })),
      categories,
    })
  } catch (e) {
    const { status, body } = apiErrorResponse(e)
    return NextResponse.json(body, { status })
  }
}

/**
 * POST /api/komisi/rules — create a rule (OWNER only).
 * Body: { name, scopeType, tierId?, barberId?, productCategoryId?, thresholdHeads, ratePct, active? }
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser('OWNER')
    const body = await req.json().catch(() => null)
    const name = typeof body?.name === 'string' ? body.name.trim() : ''
    const scopeType = body?.scopeType
    const thresholdHeads = parseInt(String(body?.thresholdHeads ?? 5), 10)
    const ratePct = parseInt(String(body?.ratePct ?? 0), 10)
    if (!name || !['DEFAULT', 'TIER', 'BARBER', 'PRODUCT_CATEGORY'].includes(scopeType)) {
      return NextResponse.json({ error: 'Nama dan scopeType wajib diisi' }, { status: 400 })
    }
    if (!Number.isFinite(thresholdHeads) || thresholdHeads < 0 || !Number.isFinite(ratePct) || ratePct < 0 || ratePct > 100) {
      return NextResponse.json({ error: 'Threshold / rate tidak valid' }, { status: 400 })
    }
    if (scopeType === 'TIER' && !body?.tierId) {
      return NextResponse.json({ error: 'Aturan TIER wajib memilih tier' }, { status: 400 })
    }
    if (scopeType === 'BARBER' && !body?.barberId) {
      return NextResponse.json({ error: 'Aturan BARBER wajib memilih kapster' }, { status: 400 })
    }
    if (scopeType === 'PRODUCT_CATEGORY' && !body?.productCategoryId) {
      return NextResponse.json({ error: 'Aturan kategori produk wajib memilih kategori' }, { status: 400 })
    }

    const rule = await db.commissionRule.create({
      data: {
        name,
        scopeType,
        tierId: scopeType === 'TIER' ? body.tierId : null,
        barberId: scopeType === 'BARBER' ? body.barberId : null,
        productCategoryId: scopeType === 'PRODUCT_CATEGORY' ? body.productCategoryId : null,
        thresholdHeads,
        ratePct,
        active: body?.active === false ? false : true,
      },
    })
    await db.auditLog.create({
      data: {
        userId: user.id,
        action: 'CREATE_COMMISSION_RULE',
        entity: 'CommissionRule',
        entityId: rule.id,
        detail: `${name} (${scopeType}, threshold ${thresholdHeads}, ${ratePct}%)`,
      },
    })
    return NextResponse.json({ rule }, { status: 201 })
  } catch (e) {
    const { status, body } = apiErrorResponse(e)
    return NextResponse.json(body, { status })
  }
}

/**
 * PUT /api/komisi/rules — update a rule (OWNER only). Body: { id, ...fields }
 */
export async function PUT(req: NextRequest) {
  try {
    const user = await requireUser('OWNER')
    const body = await req.json().catch(() => null)
    const id = body?.id
    if (typeof id !== 'string') {
      return NextResponse.json({ error: 'ID aturan wajib diisi' }, { status: 400 })
    }
    const existing = await db.commissionRule.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Aturan tidak ditemukan' }, { status: 404 })
    }
    const data: Record<string, unknown> = {}
    if (typeof body.name === 'string' && body.name.trim()) data.name = body.name.trim()
    if (body.thresholdHeads !== undefined) data.thresholdHeads = Math.max(0, parseInt(String(body.thresholdHeads), 10) || 0)
    if (body.ratePct !== undefined) data.ratePct = Math.min(100, Math.max(0, parseInt(String(body.ratePct), 10) || 0))
    if (body.active !== undefined) data.active = !!body.active

    const rule = await db.commissionRule.update({ where: { id }, data })
    await db.auditLog.create({
      data: {
        userId: user.id,
        action: 'UPDATE_COMMISSION_RULE',
        entity: 'CommissionRule',
        entityId: id,
        detail: JSON.stringify(data),
      },
    })
    return NextResponse.json({ rule })
  } catch (e) {
    const { status, body } = apiErrorResponse(e)
    return NextResponse.json(body, { status })
  }
}

/**
 * DELETE /api/komisi/rules?id=... (OWNER only). Soft disable then delete row (rules are config, deletion allowed).
 */
export async function DELETE(req: NextRequest) {
  try {
    const user = await requireUser('OWNER')
    const id = req.nextUrl.searchParams.get('id')
    if (!id) {
      return NextResponse.json({ error: 'ID aturan wajib diisi' }, { status: 400 })
    }
    const existing = await db.commissionRule.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Aturan tidak ditemukan' }, { status: 404 })
    }
    await db.commissionRule.delete({ where: { id } })
    await db.auditLog.create({
      data: {
        userId: user.id,
        action: 'DELETE_COMMISSION_RULE',
        entity: 'CommissionRule',
        entityId: id,
        detail: existing.name,
      },
    })
    return NextResponse.json({ ok: true })
  } catch (e) {
    const { status, body } = apiErrorResponse(e)
    return NextResponse.json(body, { status })
  }
}

/**
 * PATCH /api/komisi/rules — update barber override (OWNER only).
 * Body: { barberId, commissionOverrideEnabled, commissionOverrideThresholdHeads?, commissionOverrideRatePct? }
 */
export async function PATCH(req: NextRequest) {
  try {
    const user = await requireUser('OWNER')
    const body = await req.json().catch(() => null)
    const barberId = body?.barberId
    if (typeof barberId !== 'string') {
      return NextResponse.json({ error: 'barberId wajib diisi' }, { status: 400 })
    }
    const barber = await db.barber.findUnique({ where: { id: barberId } })
    if (!barber) {
      return NextResponse.json({ error: 'Kapster tidak ditemukan' }, { status: 404 })
    }
    const data: Record<string, unknown> = {
      commissionOverrideEnabled: !!body.commissionOverrideEnabled,
    }
    if (body.commissionOverrideEnabled) {
      data.commissionOverrideThresholdHeads = Math.max(0, parseInt(String(body.commissionOverrideThresholdHeads ?? 5), 10) || 0)
      data.commissionOverrideRatePct = Math.min(100, Math.max(0, parseInt(String(body.commissionOverrideRatePct ?? 10), 10) || 0))
    }
    const updated = await db.barber.update({ where: { id: barberId }, data })
    await db.auditLog.create({
      data: {
        userId: user.id,
        action: 'UPDATE_BARBER_OVERRIDE',
        entity: 'Barber',
        entityId: barberId,
        detail: JSON.stringify(data),
      },
    })
    return NextResponse.json({ barber: updated })
  } catch (e) {
    const { status, body } = apiErrorResponse(e)
    return NextResponse.json(body, { status })
  }
}
