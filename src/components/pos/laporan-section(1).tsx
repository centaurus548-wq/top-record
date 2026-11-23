'use client'

import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Download, TrendingUp, Archive, Clock } from 'lucide-react'
import { api, rupiah, formatDateID, todayISOClient } from '@/lib/client'
import { cn } from '@/lib/utils'

type ReportsData = {
  from: string
  to: string
  summary: {
    omzet: number
    cashOmzet: number
    qrisOmzet: number
    txnCount: number
    tipViaKas: number
    expenseKas: number
    expenseOwner: number
    netEstimate: number
    komisiTotal: number
  }
  perKapster: {
    barberId: string
    barberName: string
    nickname: string
    kepalaCount: number
    serviceRevenue: number
    commission: number
    tipEarned: number
  }[]
  perLayanan: { id: string; name: string; qty: number; revenue: number }[]
  perProduk: { id: string; name: string; qty: number; revenue: number }[]
  perKategoriPengeluaran: { id: string; name: string; amount: number; count: number }[]
  trend: { date: string; omzet: number; expense: number }[]
  archive: { count: number; total: number }
  attendance: {
    id: string
    date: string
    barberName: string
    clockIn: string
    lateMinutes: number
    deductedHours: number
    deduction: number
    dailyPay: number
  }[]
  attendanceTotals: { days: number; deduction: number; attendancePay: number }
  wageInfo: { shiftStart: string; shiftEnd: string; hourlyRate: number; shiftHours: number; dailyShiftPay: number }
}

type Range = 'today' | 'week' | 'month' | 'custom'

function isoMinusDays(n: number): string {
  const d = new Date(Date.now() + 7 * 3600 * 1000)
  d.setUTCDate(d.getUTCDate() - n)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

function isoWeekStart(): string {
  const d = new Date(Date.now() + 7 * 3600 * 1000)
  const dow = d.getUTCDay() // 0 Sun..6 Sat
  const back = dow === 0 ? 6 : dow - 1 // Monday
  d.setUTCDate(d.getUTCDate() - back)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

function isoMonthStart(): string {
  const d = new Date(Date.now() + 7 * 3600 * 1000)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`
}

export function LaporanSection() {
  // Revisi 8: satu level akses — semua pengguna login melihat semua laporan.
  const isOwner = true
  const [range, setRange] = useState<Range>('week')
  const [customFrom, setCustomFrom] = useState(isoMinusDays(7))
  const [customTo, setCustomTo] = useState(todayISOClient())

  const { from, to } = useMemo(() => {
    if (range === 'today') return { from: todayISOClient(), to: todayISOClient() }
    if (range === 'week') return { from: isoWeekStart(), to: todayISOClient() }
    if (range === 'month') return { from: isoMonthStart(), to: todayISOClient() }
    return { from: customFrom, to: customTo }
  }, [range, customFrom, customTo])

  const { data, isLoading } = useQuery({
    queryKey: ['reports', from, to],
    queryFn: () => api<ReportsData>(`/api/reports?from=${from}&to=${to}`),
    enabled: from <= to,
  })

  const downloadWord = () => {
    window.location.href = `/api/reports/export?from=${from}&to=${to}`
  }

  const trendData = (data?.trend ?? []).map((t) => ({
    ...t,
    label: t.date.slice(8), // day-of-month
  }))
  const isMultiDay = from !== to

  return (
    <div className="space-y-4">
      {/* Range picker */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-end gap-2">
            {(
              [
                ['today', 'Hari ini'],
                ['week', 'Minggu ini'],
                ['month', 'Bulan ini'],
                ['custom', 'Custom'],
              ] as [Range, string][]
            ).map(([r, label]) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={cn(
                  'min-h-[44px] rounded-full px-4 py-2 text-sm font-semibold transition-colors',
                  range === r
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'border border-neutral-300 bg-white text-neutral-700 hover:bg-emerald-50'
                )}
              >
                {label}
              </button>
            ))}
          </div>
          {range === 'custom' && (
            <div className="mt-3 flex flex-wrap items-end gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="rep-from">Dari</Label>
                <Input id="rep-from" type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="h-11 w-44" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rep-to">Sampai</Label>
                <Input id="rep-to" type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="h-11 w-44" />
              </div>
            </div>
          )}
          <p className="mt-2 text-sm text-neutral-500">
            Periode: <strong>{formatDateID(from)} &ndash; {formatDateID(to)}</strong>
          </p>
        </CardContent>
      </Card>

      {isLoading && <p className="text-sm text-neutral-400">Memuat laporan...</p>}

      {data && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Card className="p-0">
              <CardContent className="p-4">
                <TrendingUp className="mb-1 h-4 w-4 text-emerald-700" />
                <p className="text-xs text-neutral-500">Omzet</p>
                <p className="text-lg font-bold text-emerald-800">{rupiah(data.summary.omzet)}</p>
                <p className="mt-1 text-[11px] text-neutral-500">
                  Tunai {rupiah(data.summary.cashOmzet)} &middot; QRIS {rupiah(data.summary.qrisOmzet)}
                </p>
              </CardContent>
            </Card>
            <Card className="p-0">
              <CardContent className="p-4">
                <p className="text-xs text-neutral-500">Jumlah Transaksi</p>
                <p className="text-lg font-bold">{data.summary.txnCount}</p>
                <p className="mt-1 text-[11px] text-neutral-500">Tip via kas: {rupiah(data.summary.tipViaKas)}</p>
              </CardContent>
            </Card>
            <Card className="p-0">
              <CardContent className="p-4">
                <p className="text-xs text-neutral-500">Pengeluaran</p>
                <p className="text-lg font-bold text-red-700">{rupiah(data.summary.expenseKas + data.summary.expenseOwner)}</p>
                <p className="mt-1 text-[11px] text-neutral-500">
                  Kas toko {rupiah(data.summary.expenseKas)} &middot; Owner {rupiah(data.summary.expenseOwner)}
                </p>
              </CardContent>
            </Card>
            <Card className="p-0 border-emerald-300 bg-emerald-50">
              <CardContent className="p-4">
                <p className="text-xs text-emerald-800">Estimasi Pendapatan Bersih</p>
                <p className="text-lg font-bold text-emerald-900">{rupiah(data.summary.netEstimate)}</p>
                <p className="mt-1 text-[11px] text-emerald-700">
                  Omzet &minus; pengeluaran kas toko &middot; komisi {rupiah(data.summary.komisiTotal)}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Export buttons */}
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className="min-h-[44px]" onClick={() => downloadWord()}>
              <Download className="h-4 w-4" /> Unduh Laporan (Word)
            </Button>
          </div>

          {/* Rekap Absensi & Gaji — transparansi jam masuk & potongan otomatis */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Clock className="h-4 w-4 text-emerald-700" /> Absensi &amp; Gaji
              </CardTitle>
              <CardDescription>
                Shift {data.wageInfo.shiftStart}&ndash;{data.wageInfo.shiftEnd} &middot;{' '}
                {rupiah(data.wageInfo.hourlyRate)}/jam &middot; gaji penuh{' '}
                {rupiah(data.wageInfo.dailyShiftPay)}/hari. Toleransi telat 15 menit per jam.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {data.attendance.length === 0 ? (
                <p className="px-4 pb-4 text-sm text-neutral-400">
                  Belum ada absensi pada periode ini.
                </p>
              ) : (
                <>
                  <div className="max-h-72 overflow-auto">
                    <table className="w-full min-w-[480px] text-sm">
                      <thead className="sticky top-0 bg-neutral-50 text-left text-xs text-neutral-500">
                        <tr>
                          <th className="px-4 py-2">Tanggal</th>
                          <th className="px-4 py-2">Kapster</th>
                          <th className="px-4 py-2 text-right">Jam Masuk</th>
                          <th className="px-4 py-2 text-right">Telat</th>
                          <th className="px-4 py-2 text-right">Potongan</th>
                          <th className="px-4 py-2 text-right">Gaji Diterima</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.attendance.map((a) => (
                          <tr key={a.id} className="border-t">
                            <td className="px-4 py-2 font-medium text-neutral-800">
                              {formatDateID(a.date)}
                            </td>
                            <td className="px-4 py-2">{a.barberName}</td>
                            <td className="px-4 py-2 text-right tabular-nums">{a.clockIn}</td>
                            <td className="px-4 py-2 text-right tabular-nums">
                              {a.lateMinutes > 0 ? `${a.lateMinutes} mnt` : '-'}
                            </td>
                            <td className="px-4 py-2 text-right tabular-nums text-red-700">
                              {a.deduction > 0
                                ? `${a.deductedHours} jam (${rupiah(a.deduction)})`
                                : '-'}
                            </td>
                            <td className="px-4 py-2 text-right tabular-nums">
                              {rupiah(a.dailyPay)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="border-t bg-neutral-50 px-4 py-2 text-xs text-neutral-600">
                    Total gaji kehadiran bersih:{' '}
                    <strong>{rupiah(data.attendanceTotals.attendancePay)}</strong> &middot; potongan
                    telat: <strong>{rupiah(data.attendanceTotals.deduction)}</strong>
                  </p>
                </>
              )}
            </CardContent>
          </Card>

          {/* Daily trend */}
          {isMultiDay && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Tren Harian</CardTitle>
                <CardDescription>Omzet (termasuk tip) vs pengeluaran per hari</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={trendData} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
                      <XAxis dataKey="label" tick={{ fontSize: 12 }} stroke="#a3a3a3" />
                      <YAxis
                        tick={{ fontSize: 12 }}
                        stroke="#a3a3a3"
                        tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}rb` : String(v))}
                      />
                      <Tooltip
                        formatter={(value: number, name: string) => [rupiah(value), name === 'omzet' ? 'Omzet' : 'Pengeluaran']}
                        labelFormatter={(label) => `Tanggal ${label}`}
                      />
                      <Bar dataKey="omzet" fill="#059669" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="expense" fill="#b45309" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-1 flex gap-4 text-xs text-neutral-500">
                  <span className="flex items-center gap-1">
                    <span className="h-3 w-3 rounded bg-emerald-600" /> Omzet
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="h-3 w-3 rounded bg-amber-700" /> Pengeluaran
                  </span>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Breakdown tables */}
          <div className="grid gap-4 xl:grid-cols-2">
            <BreakdownTable
              title="Per Kapster"
              headers={['Kapster', 'Kepala', 'Omzet Layanan', 'Komisi', 'Tip']}
              rows={data.perKapster.map((k) => [
                k.barberName,
                k.kepalaCount,
                rupiah(k.serviceRevenue),
                rupiah(k.commission),
                rupiah(k.tipEarned),
              ])}
            />
            <BreakdownTable
              title="Per Layanan"
              headers={['Layanan', 'Qty', 'Pendapatan']}
              rows={data.perLayanan.map((s) => [s.name, s.qty, rupiah(s.revenue)])}
              emptyText="Belum ada layanan terjual pada periode ini."
            />
            <BreakdownTable
              title="Per Produk"
              headers={['Produk', 'Qty', 'Pendapatan']}
              rows={data.perProduk.map((p) => [p.name, p.qty, rupiah(p.revenue)])}
              emptyText="Belum ada produk terjual pada periode ini."
            />
            <BreakdownTable
              title="Per Kategori Pengeluaran"
              headers={['Kategori', 'Jumlah', 'Nominal']}
              rows={data.perKategoriPengeluaran.map((e) => [e.name, `${e.count}x`, rupiah(e.amount)])}
              emptyText="Tidak ada pengeluaran pada periode ini."
            />
          </div>

          {/* Archive stats (transaksi dibatalkan) */}
          {isOwner && data.archive && (
            <Card className="border-stone-300 bg-stone-50">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Archive className="h-4 w-4 text-stone-600" /> Arsip Transaksi Dibatalkan
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                {data.archive.count === 0 ? (
                  <p className="text-sm text-neutral-500">Tidak ada transaksi dibatalkan pada periode ini.</p>
                ) : (
                  <div className="flex items-center gap-3">
                    <Badge variant="outline" className="border-red-300 text-red-700">
                      {data.archive.count} transaksi dibatalkan
                    </Badge>
                    <span className="text-sm font-semibold text-red-800">
                      Nilai dibatalkan: {rupiah(data.archive.total)}
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  )
}

function BreakdownTable({
  title,
  headers,
  rows,
  emptyText,
}: {
  title: string
  headers: string[]
  rows: (string | number)[][]
  emptyText?: string
}) {
  return (
    <Card className="min-w-0">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {rows.length === 0 ? (
          <p className="px-4 pb-4 text-sm text-neutral-400">{emptyText}</p>
        ) : (
          <div className="max-h-72 overflow-auto">
            <table className="w-full min-w-[480px] text-sm">
              <thead className="sticky top-0 bg-neutral-50 text-left text-xs text-neutral-500">
                <tr>
                  {headers.map((h, i) => (
                    <th key={h} className={cn('px-4 py-2', i > 0 && 'text-right')}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="border-t">
                    {r.map((c, j) => (
                      <td
                        key={j}
                        className={cn('px-4 py-2', j > 0 && 'text-right tabular-nums', j === 0 && 'font-medium text-neutral-800')}
                      >
                        {c}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
