// Date helpers — shop operates in Asia/Bangkok (UTC+7)

const TZ_OFFSET_MS = 7 * 60 * 60 * 1000

/** Returns a Date shifted to UTC+7 wall clock (read via getUTC* methods). */
export function bangkokNow(): Date {
  return new Date(Date.now() + TZ_OFFSET_MS)
}

/** Today's date in 'YYYY-MM-DD' according to Asia/Bangkok. */
export function todayISO(): string {
  const d = bangkokNow()
  return toISODate(d)
}

export function toISODate(d: Date): string {
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Current wall-clock time 'HH:mm' in Asia/Bangkok. */
export function currentHHmm(): string {
  const d = bangkokNow()
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
}

/** Minutes since midnight (Asia/Bangkok wall clock). */
export function minutesSinceMidnight(): number {
  const d = bangkokNow()
  return d.getUTCHours() * 60 + d.getUTCMinutes()
}

/** Parse 'HH:mm' into minutes since midnight. */
export function hhmmToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map((v) => parseInt(v, 10))
  return (isNaN(h) ? 0 : h) * 60 + (isNaN(m) ? 0 : m)
}

/**
 * Progressive late penalty (owner rule, Phase 3) — tolerance per hour:
 * - lateMinutes <= tolerance (default 15) -> 0 jam
 * - 16..75 min -> 1 jam (melewati toleransi jam pertama)
 * - 76..135 min -> 2 jam (melewati toleransi jam kedua)
 * i.e. ceil((lateMinutes - tolerance) / 60) jam.
 * (The owner's narrative ranges imply ceil; the written floor-formula would
 * contradict the stated ranges at exact hour boundaries.)
 */
export function progressiveDeductedHours(lateMinutes: number, toleranceMin: number = 15): number {
  if (lateMinutes <= toleranceMin) return 0
  return Math.ceil((lateMinutes - toleranceMin) / 60)
}

/** Returns true when the given 'YYYY-MM-DD' is today (Asia/Bangkok). */
export function isToday(dateStr: string): boolean {
  return dateStr === todayISO()
}

/** Shift a 'YYYY-MM-DD' string by n days (n can be negative). */
export function addDaysISO(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split('-').map((v) => parseInt(v, 10))
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() + n)
  return toISODate(dt)
}

/** UTC Date range (gte inclusive, lt exclusive) covering one Asia/Bangkok calendar day. */
export function dayRangeUTC(dateStr: string): { gte: Date; lt: Date } {
  const gte = new Date(`${dateStr}T00:00:00.000Z`)
  gte.setUTCHours(gte.getUTCHours() - 7)
  const lt = new Date(gte.getTime() + 24 * 60 * 60 * 1000)
  return { gte, lt }
}

/** Format 'YYYY-MM-DD' for display: DD/MM/YYYY */
export function formatDateID(dateStr: string): string {
  const [y, m, d] = dateStr.split('-')
  if (!y || !m || !d) return dateStr
  return `${d}/${m}/${y}`
}

export function formatDateTimeID(iso: string): string {
  const dt = new Date(iso)
  return bangkokFromISO(dt).toLocaleString('id-ID', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function bangkokFromISO(dt: Date): Date {
  return new Date(dt.getTime() + TZ_OFFSET_MS)
}

export function bangkokToISODate(dt: Date): string {
  return toISODate(bangkokFromISO(dt))
}
