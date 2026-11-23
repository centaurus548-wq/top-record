import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireUser, apiErrorResponse } from '@/lib/auth'
import { logAudit } from '@/lib/audit'

const ALLOWED_KEYS = ['shiftStart', 'shiftEnd', 'hourlyRate', 'lateToleranceMin', 'defaultOpeningCash', 'shopName']

const VALIDATORS: Record<string, (v: string) => boolean> = {
  shiftStart: (v) => /^\d{2}:\d{2}$/.test(v),
  shiftEnd: (v) => /^\d{2}:\d{2}$/.test(v),
  hourlyRate: (v) => /^\d+$/.test(v) && parseInt(v, 10) >= 0,
  lateToleranceMin: (v) => /^\d+$/.test(v) && parseInt(v, 10) >= 0,
  defaultOpeningCash: (v) => /^\d+$/.test(v) && parseInt(v, 10) >= 0,
  shopName: (v) => v.length > 0 && v.length <= 50,
}

/** GET /api/settings — all settings (OWNER only). */
export async function GET() {
  try {
    await requireUser('OWNER')
    const rows = await db.setting.findMany()
    return NextResponse.json({ settings: Object.fromEntries(rows.map((r) => [r.key, r.value])) })
  } catch (e) {
    const { status, body } = apiErrorResponse(e)
    return NextResponse.json(body, { status })
  }
}

/** PUT /api/settings — update allowed keys (OWNER only). Body: { key: value, ... } */
export async function PUT(req: NextRequest) {
  try {
    const user = await requireUser('OWNER')
    const body = await req.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Body tidak valid' }, { status: 400 })
    }
    const updates: { key: string; value: string }[] = []
    for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
      if (!ALLOWED_KEYS.includes(key)) continue
      const str = String(value)
      const validator = VALIDATORS[key]
      if (validator && !validator(str)) {
        return NextResponse.json({ error: `Nilai untuk ${key} tidak valid` }, { status: 400 })
      }
      updates.push({ key, value: str })
    }
    if (updates.length === 0) {
      return NextResponse.json({ error: 'Tidak ada pengaturan valid untuk disimpan' }, { status: 400 })
    }
    for (const u of updates) {
      await db.setting.upsert({
        where: { key: u.key },
        update: { value: u.value },
        create: { key: u.key, value: u.value },
      })
      await logAudit({
        userId: user.id,
        action: 'UPDATE_SETTING',
        entity: 'Setting',
        entityId: u.key,
        detail: `${u.key} = ${u.value}`,
      })
    }
    const rows = await db.setting.findMany()
    return NextResponse.json({ settings: Object.fromEntries(rows.map((r) => [r.key, r.value])) })
  } catch (e) {
    const { status, body } = apiErrorResponse(e)
    return NextResponse.json(body, { status })
  }
}
