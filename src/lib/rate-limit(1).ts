// Rate limiter sederhana in-memory (per proses) — cukup untuk uji coba 1-2
// bulan pada satu instance server. Untuk multi-instance, pindah ke Redis/Turso.

const buckets = new Map<string, { count: number; resetAt: number }>()

let lastSweep = 0

function sweep(now: number) {
  // Bersihkan entri kadaluarsa tiap ~1 menit agar Map tidak tumbuh tanpa batas
  if (now - lastSweep < 60_000) return
  lastSweep = now
  for (const [k, b] of buckets) {
    if (b.resetAt < now) buckets.delete(k)
  }
}

/**
 * Fixed-window rate limit.
 * Return true bila boleh lewat, false bila kuota habis (perlu ditolak).
 */
export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now()
  sweep(now)
  const b = buckets.get(key)
  if (!b || b.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return true
  }
  if (b.count >= limit) return false
  b.count += 1
  return true
}

/** Sisa detik sampai jendela reset (untuk pesan error). */
export function retryAfterSeconds(key: string): number {
  const b = buckets.get(key)
  if (!b) return 0
  return Math.max(1, Math.ceil((b.resetAt - Date.now()) / 1000))
}
