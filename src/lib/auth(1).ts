import { cookies } from 'next/headers'
import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from 'crypto'
import { db } from '@/lib/db'
import type { Role } from '@prisma/client'

const COOKIE_NAME = 'pos_session'
const SECRET = process.env.SESSION_SECRET ?? 'kasir-barbershop-phase1-secret'

/**
 * PIN di-hash dengan scrypt + salt (format 'scrypt:salt:hash').
 * Jauh lebih tahan brute-force dibanding sha256 murni untuk PIN 4-6 digit.
 */
export function hashPin(pin: string): string {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(pin, salt, 64).toString('hex')
  return `scrypt:${salt}:${hash}`
}

/** Verifikasi PIN: dukung format scrypt baru + fallback sha256 lama (migrasi mulus). */
export function verifyPin(pin: string, stored: string): boolean {
  if (stored.startsWith('scrypt:')) {
    const [, salt, hash] = stored.split(':')
    if (!salt || !hash) return false
    try {
      const candidate = scryptSync(pin, salt, 64).toString('hex')
      return timingSafeEqual(Buffer.from(candidate, 'hex'), Buffer.from(hash, 'hex'))
    } catch {
      return false
    }
  }
  // Legacy: hash sha256 tanpa salt (data lama)
  return createHash('sha256').update(pin).digest('hex') === stored
}

function sign(userId: string): string {
  const mac = createHmac('sha256', SECRET).update(userId).digest('hex')
  return `${userId}.${mac}`
}

function verify(token: string): string | null {
  const idx = token.lastIndexOf('.')
  if (idx <= 0) return null
  const userId = token.slice(0, idx)
  const mac = token.slice(idx + 1)
  const expected = createHmac('sha256', SECRET).update(userId).digest('hex')
  try {
    if (timingSafeEqual(Buffer.from(mac, 'hex'), Buffer.from(expected, 'hex'))) {
      return userId
    }
  } catch {
    return null
  }
  return null
}

export type SessionUser = {
  id: string
  name: string
  username: string
  role: Role
  barberId: string | null
  barber: {
    id: string
    name: string
    nickname: string
    tierId: string | null
    tierName: string | null
  } | null
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const store = await cookies()
  const raw = store.get(COOKIE_NAME)?.value
  if (!raw) return null
  const userId = verify(raw)
  if (!userId) return null
  const user = await db.user.findUnique({
    where: { id: userId },
    include: {
      barber: { include: { tier: true } },
    },
  })
  if (!user || !user.active) return null
  return {
    id: user.id,
    name: user.name,
    username: user.username,
    role: user.role,
    barberId: user.barberId,
    barber: user.barber
      ? {
          id: user.barber.id,
          name: user.barber.name,
          nickname: user.barber.nickname,
          tierId: user.barber.tierId,
          tierName: user.barber.tier?.name ?? null,
        }
      : null,
  }
}

export function sessionCookieFor(userId: string) {
  return {
    name: COOKIE_NAME,
    value: sign(userId),
    path: '/',
    maxAge: 60 * 60 * 24 * 14,
    sameSite: 'lax' as const,
    httpOnly: true,
    // Cookie hanya dikirim lewat HTTPS saat production deploy
    secure: process.env.NODE_ENV === 'production',
  }
}

export function clearSessionCookie() {
  return { name: COOKIE_NAME, value: '', path: '/', maxAge: 0, httpOnly: true, sameSite: 'lax' as const }
}

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

/**
 * Revisi 8: satu level akses — semua pengguna yang login punya akses penuh.
 * Argumen peran tetap diterima agar pemanggilan API lama tidak perlu diubah,
 * tapi tidak lagi membatasi apa pun. Yang dicek hanya: sudah login & akun aktif.
 */
export async function requireUser(..._roles: Role[]): Promise<SessionUser> {
  void _roles
  const user = await getSessionUser()
  if (!user) throw new ApiError(401, 'Belum login')
  return user
}

export function apiErrorResponse(e: unknown): { status: number; body: { error: string } } {
  if (e instanceof ApiError) {
    return { status: e.status, body: { error: e.message } }
  }
  console.error('[api] unexpected error:', e)
  return { status: 500, body: { error: 'Terjadi kesalahan pada server' } }
}

// ===== Navigation sections per role =====

export type NavSection =
  | 'dashboard'
  | 'pos'
  | 'booking'
  | 'kapster'
  | 'produk'
  | 'pengeluaran'
  | 'closing'
  | 'riwayat'
  | 'gajian'
  | 'laporan'
  | 'pengaturan'
  | 'arsip'

const ALL_NAV: NavSection[] = [
  'dashboard',
  'pos',
  'booking',
  'kapster',
  'produk',
  'pengeluaran',
  'closing',
  'gajian',
  'laporan',
  'pengaturan',
  'arsip',
  'riwayat',
]

/** Revisi 8: semua pengguna login melihat seluruh menu (tanpa pembatasan fitur). */
export function navForRole(_role: Role): NavSection[] {
  void _role
  return ALL_NAV
}
