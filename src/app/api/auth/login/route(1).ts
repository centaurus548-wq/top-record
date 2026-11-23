import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { verifyPin, sessionCookieFor, apiErrorResponse } from '@/lib/auth'
import { rateLimit, retryAfterSeconds } from '@/lib/rate-limit'
import { logAudit } from '@/lib/audit'

// Revisi 8: satu level akses — semua akun aktif bisa login dengan akses penuh.

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null)
    const username = typeof body?.username === 'string' ? body.username.trim().toLowerCase() : ''
    const pin = typeof body?.pin === 'string' ? body.pin.trim() : ''
    if (!username || !pin) {
      return NextResponse.json({ error: 'Username dan PIN wajib diisi' }, { status: 400 })
    }
    if (!/^\d{4,6}$/.test(pin)) {
      return NextResponse.json({ error: 'PIN harus 4-6 digit angka' }, { status: 400 })
    }

    // Rate limit: maksimal 5 percobaan per username+IP per 10 menit (security)
    const ip =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
      req.headers.get('x-real-ip') ??
      'local'
    const rlKey = `login:${username}:${ip}`
    if (!rateLimit(rlKey, 5, 10 * 60 * 1000)) {
      return NextResponse.json(
        {
          error: `Terlalu banyak percobaan gagal. Coba lagi dalam ${Math.ceil(retryAfterSeconds(rlKey) / 60)} menit.`,
        },
        { status: 429 }
      )
    }

    const user = await db.user.findUnique({
      where: { username },
      include: { barber: { include: { tier: true } } },
    })
    if (!user || !user.active || !verifyPin(pin, user.pin)) {
      return NextResponse.json({ error: 'Username atau PIN salah' }, { status: 401 })
    }

    const res = NextResponse.json({ ok: true })
    res.cookies.set(sessionCookieFor(user.id))
    await logAudit({
      userId: user.id,
      action: 'LOGIN',
      entity: 'User',
      entityId: user.id,
      detail: `${user.name} login`,
    })
    return res
  } catch (e) {
    const { status, body } = apiErrorResponse(e)
    return NextResponse.json(body, { status })
  }
}
