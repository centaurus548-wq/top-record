'use client'

import { useQuery } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

import { Skeleton } from '@/components/ui/skeleton'
import {
  Banknote,
  CreditCard,
  ReceiptText,
  TrendingDown,
  Calculator,
  Package,
  CalendarClock,
} from 'lucide-react'
import { api, rupiah, type SessionUser } from '@/lib/client'
import { formatClock, todayISOClient } from '@/lib/client'

type DashboardData = {
  role: string
  date: string
  omzet?: number
  txnCount?: number
  cashTotal?: number
  qrisTotal?: number
  expenseKas?: number
  totalKomisi?: number
  tipTotal?: number
  netEstimate?: number
  kapster?: {
    barberId: string
    barberName: string
    nickname: string
    tierName: string | null
    kepalaCount: number
    serviceRevenue: number
    commission: number
    tipEarned: number
    tipUnclaimed: number
  }[]
  lowStock?: { id: string; name: string; stock: number; minStock: number }[]
  bookings?: {
    id: string
    customerName: string
    time: string
    status: string
    serviceItemId: string
    barberId: string
  }[]
  kapsterSelf?: {
    barberName: string
    kepalaCount: number
    serviceRevenue: number
    commission: number
    tipEarned: number
    tipUnclaimed: number
    thresholdMet: boolean
    rule: { thresholdHeads: number; ratePct: number; ruleName: string }
  } | null
  attendance?: { clockInAt: string; lateMinutes: number; deductedHours: number } | null
  upcomingBookings?: number
}

type CatalogData = {
  services: { id: string; name: string }[]
  barbers: { id: string; name: string }[]
}

const BOOKING_STATUS_LABEL: Record<string, string> = {
  WAITING: 'Menunggu',
  CONFIRMED: 'Dikonfirmasi',
  SERVING: 'Dilayani',
  DONE: 'Selesai',
  CANCELLED: 'Dibatalkan',
  RESCHEDULED: 'Dijadwalkan Ulang',
}

export function DashboardSection({ user }: { user: SessionUser }) {
  const today = todayISOClient()
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api<DashboardData>('/api/dashboard'),
    refetchInterval: 30000,
  })
  const { data: catalog } = useQuery({
    queryKey: ['catalog'],
    queryFn: () => api<CatalogData>('/api/catalog'),
  })

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
    )
  }

  // Kapster view
  if (user.role === 'KAPSTER' && data?.kapsterSelf) {
    const self = data.kapsterSelf
    return (
      <div className="space-y-4">
        <Card className="border-emerald-200">
          <CardHeader className="pb-2">
            <CardDescription>Performa Anda hari ini &middot; {self.barberName}</CardDescription>
            <CardTitle className="text-2xl text-emerald-800">
              {self.kepalaCount} kepala
              <span className="ml-2 text-sm font-medium text-neutral-500">
                ({rupiah(self.serviceRevenue)})
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            <StatTile
              icon={<Calculator className="h-4 w-4" />}
              label="Komisi hari ini"
              value={rupiah(self.commission)}
            />
            <StatTile
              icon={<Banknote className="h-4 w-4" />}
              label="Tip hari ini"
              value={rupiah(self.tipEarned)}
            />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-neutral-600">
              {self.thresholdMet ? (
                <>
                  Aturan komisi aktif: <strong>{self.rule.ruleName}</strong> &mdash; threshold{' '}
                  {self.rule.thresholdHeads} kepala tercapai, rate {self.rule.ratePct}%.
                </>
              ) : (
                <>
                  Komisi belum aktif &mdash; butuh {Math.max(0, self.rule.thresholdHeads - self.kepalaCount)}{' '}
                  kepala lagi (aturan: {self.rule.ruleName}, threshold {self.rule.thresholdHeads}).
                </>
              )}
            </p>
            {data.attendance && (
              <p className="mt-2 text-sm text-neutral-600">
                Absen hari ini pukul {formatClock(data.attendance.clockInAt)}
                {data.attendance.lateMinutes > 0
                  ? ` (telat ${data.attendance.lateMinutes} menit${data.attendance.deductedHours > 0 ? ` \u2192 potong ${data.attendance.deductedHours} jam gaji` : ''})`
                  : ' (tepat waktu)'}
              </p>
            )}
            {data.upcomingBookings !== undefined && data.upcomingBookings > 0 && (
              <p className="mt-2 text-sm text-neutral-600">
                {data.upcomingBookings} booking menunggu Anda hari ini.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    )
  }

  const stats = [
    { label: 'Omzet Hari Ini', value: rupiah(data?.omzet ?? 0), icon: ReceiptText, tone: 'text-emerald-700 bg-emerald-50' },
    { label: 'Transaksi', value: String(data?.txnCount ?? 0), icon: ReceiptText, tone: 'text-stone-700 bg-stone-100' },
    { label: 'Tunai', value: rupiah(data?.cashTotal ?? 0), icon: Banknote, tone: 'text-amber-800 bg-amber-50' },
    { label: 'QRIS', value: rupiah(data?.qrisTotal ?? 0), icon: CreditCard, tone: 'text-stone-700 bg-stone-100' },
    { label: 'Pengeluaran', value: rupiah(data?.expenseKas ?? 0), icon: TrendingDown, tone: 'text-red-700 bg-red-50' },
    { label: 'Estimasi Bersih', value: rupiah(data?.netEstimate ?? 0), icon: Calculator, tone: 'text-emerald-800 bg-emerald-100' },
  ]

  const svcMap = new Map((catalog?.services ?? []).map((s) => [s.id, s.name]))
  const barberMap = new Map((catalog?.barbers ?? []).map((b) => [b.id, b.name]))

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        {stats.map((s) => {
          const Icon = s.icon
          return (
            <Card key={s.label} className="p-0">
              <CardContent className="p-4">
                <div className={`mb-2 inline-flex h-8 w-8 items-center justify-center rounded-lg ${s.tone}`}>
                  <Icon className="h-4 w-4" aria-hidden />
                </div>
                <p className="text-xs text-neutral-500">{s.label}</p>
                <p className="whitespace-nowrap text-lg font-bold tabular-nums text-neutral-900 sm:text-xl">{s.value}</p>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Kapster performance */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Performa Kapster Hari Ini</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {/* Mobile: stacked cards */}
            <ul className="divide-y md:hidden">
              {(data?.kapster ?? []).length === 0 && (
                <li className="px-4 py-4 text-sm text-neutral-400">Belum ada data.</li>
              )}
              {(data?.kapster ?? []).map((k) => (
                <li key={k.barberId} className="px-4 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-neutral-800">{k.barberName}</p>
                      <p className="text-xs text-neutral-400">{k.tierName ?? '-'} &middot; {k.kepalaCount} kepala</p>
                    </div>
                    <div className="shrink-0 text-right text-sm">
                      <p className="whitespace-nowrap font-semibold tabular-nums text-neutral-900">{rupiah(k.serviceRevenue)}</p>
                      <p className="whitespace-nowrap text-xs tabular-nums text-emerald-700">
                        komisi {rupiah(k.commission)} &middot; tip {rupiah(k.tipEarned)}
                      </p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
            {/* Desktop: table */}
            <div className="hidden max-h-80 overflow-y-auto md:block">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-neutral-50 text-left text-xs text-neutral-500">
                  <tr>
                    <th className="px-4 py-2">Kapster</th>
                    <th className="px-2 py-2 text-center">Kepala</th>
                    <th className="px-2 py-2 text-right">Omzet</th>
                    <th className="px-2 py-2 text-right">Komisi</th>
                    <th className="px-4 py-2 text-right">Tip</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.kapster ?? []).map((k) => (
                    <tr key={k.barberId} className="border-t">
                      <td className="px-4 py-2">
                        <div className="font-medium text-neutral-800">{k.barberName}</div>
                        <div className="text-xs text-neutral-400">{k.tierName ?? '-'}</div>
                      </td>
                      <td className="px-2 py-2 text-center font-semibold">{k.kepalaCount}</td>
                      <td className="whitespace-nowrap px-2 py-2 text-right tabular-nums">{rupiah(k.serviceRevenue)}</td>
                      <td className="whitespace-nowrap px-2 py-2 text-right tabular-nums text-emerald-700">{rupiah(k.commission)}</td>
                      <td className="whitespace-nowrap px-4 py-2 text-right tabular-nums">
                        {rupiah(k.tipEarned)}
                        {k.tipUnclaimed > 0 && (
                          <span className="ml-1 text-[10px] text-amber-700">(belum diambil)</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          {/* Low stock */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Package className="h-4 w-4 text-amber-700" /> Stok Menipis
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              {(data?.lowStock ?? []).length === 0 ? (
                <p className="text-sm text-neutral-400">Semua stok aman.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {data?.lowStock?.map((p) => (
                    <Badge
                      key={p.id}
                      variant="outline"
                      className="border-red-200 bg-red-50 text-red-800"
                    >
                      {p.name}: sisa {p.stock} (min {p.minStock})
                    </Badge>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Upcoming bookings */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <CalendarClock className="h-4 w-4 text-emerald-700" /> Booking Hari Ini
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              {(data?.bookings ?? []).length === 0 ? (
                <p className="text-sm text-neutral-400">Belum ada booking aktif hari ini.</p>
              ) : (
                <ul className="max-h-48 space-y-2 overflow-y-auto">
                  {data?.bookings?.map((b) => (
                    <li
                      key={b.id}
                      className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm"
                    >
                      <div>
                        <span className="font-medium">{b.customerName}</span>
                        <span className="ml-2 text-xs text-neutral-400">
                          {b.time} &middot; {svcMap.get(b.serviceItemId) ?? '-'} &middot;{' '}
                          {barberMap.get(b.barberId) ?? '-'}
                        </span>
                      </div>
                      <Badge variant="outline" className="border-emerald-200 text-emerald-800">
                        {BOOKING_STATUS_LABEL[b.status] ?? b.status}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

function StatTile({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="mb-1 flex items-center gap-1.5 text-xs text-neutral-500">
        {icon} {label}
      </div>
      <p className="whitespace-nowrap text-lg font-bold tabular-nums text-emerald-800">{value}</p>
    </div>
  )
}
