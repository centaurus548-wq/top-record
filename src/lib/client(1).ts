'use client'

// Client-side helpers: typed fetch + Rupiah formatting

export type Role = 'OWNER' | 'MANAGER' | 'KASIR' | 'KAPSTER'

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

export type SessionUser = {
  id: string
  name: string
  username: string
  role: Role
  barberId: string | null
  barber: { id: string; name: string; nickname: string; tierId: string | null; tierName: string | null } | null
}

export type MeResponse = { user: SessionUser; nav: NavSection[] }

export class ApiRequestError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  })
  let body: unknown = null
  try {
    body = await res.json()
  } catch {
    body = null
  }
  if (!res.ok) {
    const msg =
      body && typeof body === 'object' && 'error' in body
        ? String((body as { error: unknown }).error)
        : `Permintaan gagal (${res.status})`
    throw new ApiRequestError(res.status, msg)
  }
  return body as T
}

export function rupiah(n: number): string {
  return 'Rp' + Math.round(n || 0).toLocaleString('id-ID')
}

/** 'YYYY-MM-DD' for today in Asia/Bangkok — computed client-side. */
export function todayISOClient(): string {
  const now = new Date(Date.now() + 7 * 60 * 60 * 1000)
  const y = now.getUTCFullYear()
  const m = String(now.getUTCMonth() + 1).padStart(2, '0')
  const d = String(now.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function formatDateID(dateStr: string): string {
  const [y, m, d] = (dateStr ?? '').split('-')
  if (!y || !m || !d) return dateStr ?? ''
  return `${d}/${m}/${y}`
}

export function formatClock(iso: string | Date | null | undefined): string {
  if (!iso) return '-'
  const dt = typeof iso === 'string' ? new Date(iso) : iso
  return new Date(dt.getTime() + 7 * 60 * 60 * 1000).toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
  })
}

export const ROLE_LABEL: Record<Role, string> = {
  OWNER: 'Owner',
  MANAGER: 'Manager',
  KASIR: 'Kasir',
  KAPSTER: 'Kapster',
}
