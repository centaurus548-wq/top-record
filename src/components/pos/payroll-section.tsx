'use client'

import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Banknote,
  CalendarRange,
  Lock,
  LockOpen,
  RefreshCcw,
  CheckCheck,
  ChevronDown,
  Undo2,
  Clock,
  Calculator,
  HandCoins,
} from 'lucide-react'
import { api, rupiah, formatDateID } from '@/lib/client'
import { cn } from '@/lib/utils'
import { toast } from '@/hooks/use-toast'

type PayrollType = 'WEEKLY' | 'MONTHLY' | 'CUSTOM'

type PeriodSummary = {
  id: string
  name: string
  type: PayrollType
  startDate: string
  endDate: string
  status: 'OPEN' | 'CLOSED'
  total: number
  totalPaid: number
  lineCount: number
}

type PeriodDetail = {
  id: string
  name: string
  type: PayrollType
  startDate: string
  endDate: string
  status: 'OPEN' | 'CLOSED'
  lines: {
    id: string
    barberId: string
    barber: { name: string; nickname: string; tier?: { name: string } | null }
    daysWorked: number
    lateCount: number
    attendancePay: number
    komisi: number
    tip: number
    total: number
    attendanceDetail: { date: string; lateMinutes: number; deductedHours: number; dailyPay: number }[] | null
    status: 'UNPAID' | 'PAID'
    paidAt: string | null
  }[]
}

type PayrollListData = {
  periods: PeriodSummary[]
  suggestions: { weekly: { name: string; startDate: string; endDate: string }; monthly: { name: string; startDate: string; endDate: string } }
}

export function PayrollSection() {
  const qc = useQueryClient()
  // Revisi 8: satu level akses — semua pengguna login punya akses penuh.
  const isOwner = true
  const canPay = true

  const { data: listData, isLoading } = useQuery({
    queryKey: ['payroll'],
    queryFn: () => api<PayrollListData>('/api/payroll'),
  })
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const { data: detail } = useQuery({
    queryKey: ['payroll', selectedId],
    queryFn: () => api<{ period: PeriodDetail }>(`/api/payroll/${selectedId}`),
    enabled: !!selectedId,
  })

  // Create form
  const [type, setType] = useState<PayrollType>('WEEKLY')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)
  const [busy, setBusy] = useState(false)
  const [expandedLine, setExpandedLine] = useState<string | null>(null)
  const [confirmClose, setConfirmClose] = useState(false)

  const period = detail?.period ?? null
  const totals = useMemo(() => {
    const lines = period?.lines ?? []
    return {
      attendance: lines.reduce((a, l) => a + l.attendancePay, 0),
      komisi: lines.reduce((a, l) => a + l.komisi, 0),
      tip: lines.reduce((a, l) => a + l.tip, 0),
      total: lines.reduce((a, l) => a + l.total, 0),
      unpaid: lines.filter((l) => l.status === 'UNPAID').reduce((a, l) => a + l.total, 0),
    }
  }, [period])

  const applySuggestion = (s: { name: string; startDate: string; endDate: string }, t: PayrollType) => {
    setType(t)
    setStartDate(s.startDate)
    setEndDate(s.endDate)
    setName(s.name)
  }

  const createPeriod = async () => {
    if (!startDate || !endDate) {
      toast({ title: 'Pilih tanggal mulai dan akhir', variant: 'destructive' })
      return
    }
    setCreating(true)
    try {
      const res = await api<{ period: { id: string } }>('/api/payroll', {
        method: 'POST',
        body: JSON.stringify({ type, startDate, endDate, name: name || undefined }),
      })
      toast({ title: 'Periode gajian dibuat', description: `${startDate} s/d ${endDate}` })
      qc.invalidateQueries({ queryKey: ['payroll'] })
      setSelectedId(res.period.id)
    } catch (err) {
      toast({
        title: 'Gagal membuat periode',
        description: err instanceof Error ? err.message : 'Terjadi kesalahan',
        variant: 'destructive',
      })
    } finally {
      setCreating(false)
    }
  }

  const act = async (body: Record<string, unknown>, successMsg: string) => {
    if (!selectedId) return
    setBusy(true)
    try {
      await api(`/api/payroll/${selectedId}`, { method: 'POST', body: JSON.stringify(body) })
      toast({ title: successMsg })
      qc.invalidateQueries({ queryKey: ['payroll'] })
      qc.invalidateQueries({ queryKey: ['payroll', selectedId] })
    } catch (err) {
      toast({
        title: 'Gagal',
        description: err instanceof Error ? err.message : 'Terjadi kesalahan',
        variant: 'destructive',
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Create period */}
      <Card className="border-emerald-200">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarRange className="h-4 w-4 text-emerald-700" /> Buat Periode Gajian
          </CardTitle>
          <CardDescription>
            Gaji kehadiran dihitung dari absensi (jam shift x tarif per jam, potongan telat per jam dengan toleransi 15 menit baru di setiap jam: telat lewat 09:15 potong 1 jam, lewat 10:15 potong 2 jam, dan seterusnya) + komisi mesin yang sama dengan dashboard + tip via kas.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              className="min-h-[40px] border-emerald-300 text-emerald-800 hover:bg-emerald-50"
              onClick={() => listData && applySuggestion(listData.suggestions.weekly, 'WEEKLY')}
            >
              Saran: Minggu Lalu (Senin&ndash;Minggu)
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="min-h-[40px] border-emerald-300 text-emerald-800 hover:bg-emerald-50"
              onClick={() => listData && applySuggestion(listData.suggestions.monthly, 'MONTHLY')}
            >
              Saran: Bulan Lalu
            </Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5">
              <Label>Tipe</Label>
              <Select value={type} onValueChange={(v) => setType(v as PayrollType)}>
                <SelectTrigger className="h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="WEEKLY">Mingguan</SelectItem>
                  <SelectItem value="MONTHLY">Bulanan</SelectItem>
                  <SelectItem value="CUSTOM">Custom</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pay-from">Dari</Label>
              <Input id="pay-from" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="h-11" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pay-to">Sampai</Label>
              <Input id="pay-to" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="h-11" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pay-name">Nama (opsional)</Label>
              <Input id="pay-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="cth: Gajian minggu ke-2 Nov" className="h-11" />
            </div>
          </div>
          <Button
            onClick={createPeriod}
            disabled={creating || !isOwner}
            className="min-h-[44px] bg-emerald-600 text-white hover:bg-emerald-700"
          >
            {creating ? 'Membuat...' : 'Buat & Hitung Gajian'}
          </Button>
          {!isOwner && (
            <p className="text-xs text-neutral-500">Hanya Owner yang bisa membuat/mengunci periode.</p>
          )}
        </CardContent>
      </Card>

      {/* Period list */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Riwayat Periode</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading && <p className="px-4 py-4 text-sm text-neutral-400">Memuat...</p>}
          <ul className="max-h-60 divide-y overflow-y-auto">
            {(listData?.periods ?? []).map((p) => (
              <li key={p.id}>
                <button
                  onClick={() => setSelectedId(p.id)}
                  className={cn(
                    'flex w-full flex-wrap items-center justify-between gap-2 px-4 py-3 text-left hover:bg-emerald-50/60',
                    selectedId === p.id && 'bg-emerald-50'
                  )}
                >
                  <div>
                    <p className="font-medium text-neutral-900">{p.name}</p>
                    <p className="text-xs text-neutral-500">
                      {formatDateID(p.startDate)} &ndash; {formatDateID(p.endDate)} &middot; {p.lineCount} kapster
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant="outline"
                      className={p.status === 'OPEN' ? 'border-emerald-300 text-emerald-800' : 'border-stone-400 text-stone-700'}
                    >
                      {p.status === 'OPEN' ? 'TERBUKA' : 'TERKUNCI'}
                    </Badge>
                    <span className="whitespace-nowrap font-bold tabular-nums text-emerald-800">{rupiah(p.total)}</span>
                  </div>
                </button>
              </li>
            ))}
            {!isLoading && (listData?.periods ?? []).length === 0 && (
              <li className="px-4 py-6 text-center text-sm text-neutral-400">
                Belum ada periode gajian.
              </li>
            )}
          </ul>
        </CardContent>
      </Card>

      {/* Detail */}
      {period && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <CardTitle className="text-base">{period.name}</CardTitle>
                <CardDescription>
                  {formatDateID(period.startDate)} &ndash; {formatDateID(period.endDate)} &middot;{' '}
                  {period.status === 'OPEN' ? 'Terbuka (bisa di-refresh)' : 'Terkunci (riwayat)'}
                </CardDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                {period.status === 'OPEN' && isOwner && (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy}
                      className="min-h-[40px]"
                      onClick={() => act({ action: 'refresh' }, 'Perhitungan di-refresh dari data terbaru')}
                    >
                      <RefreshCcw className="h-4 w-4" /> Refresh
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy}
                      className="min-h-[40px] border-stone-400 text-stone-700"
                      onClick={() => setConfirmClose(true)}
                    >
                      <Lock className="h-4 w-4" /> Tutup Periode
                    </Button>
                  </>
                )}
                {period.status === 'CLOSED' && isOwner && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    className="min-h-[40px]"
                    onClick={() => act({ action: 'reopen' }, 'Periode dibuka ulang')}
                  >
                    <LockOpen className="h-4 w-4" /> Buka Ulang
                  </Button>
                )}
                {canPay && period.status === 'OPEN' && (
                  <Button
                    size="sm"
                    disabled={busy || period.lines.every((l) => l.status === 'PAID')}
                    className="min-h-[40px] bg-emerald-600 text-white hover:bg-emerald-700"
                    onClick={() => act({ action: 'pay-all' }, 'Semua baris ditandai dibayar')}
                  >
                    <CheckCheck className="h-4 w-4" /> Tandai Semua Dibayar
                  </Button>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Totals row */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <TotalTile label="Gaji Kehadiran" value={rupiah(totals.attendance)} />
              <TotalTile label="Komisi" value={rupiah(totals.komisi)} />
              <TotalTile label="Tip via Kas" value={rupiah(totals.tip)} />
              <TotalTile label="Siap Dibayar" value={rupiah(totals.total)} highlight />
            </div>

            {/* Lines */}
            <div className="space-y-2">
              {period.lines.map((l) => (
                <div key={l.id} className="rounded-xl border">
                  <div className="flex flex-wrap items-center justify-between gap-2 p-4">
                    <button
                      className="min-w-0 flex-1 text-left"
                      onClick={() => setExpandedLine(expandedLine === l.id ? null : l.id)}
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-neutral-900">{l.barber.name}</span>
                        <Badge
                          variant="outline"
                          className={l.status === 'PAID' ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-amber-300 bg-amber-50 text-amber-900'}
                        >
                          {l.status === 'PAID' ? 'DIBAYAR' : 'BELUM'}
                        </Badge>
                      </div>
                      <p className="mt-0.5 text-xs text-neutral-500">
                        {l.barber.nickname} &middot; {l.barber.tier?.name ?? '-'} &middot; {l.daysWorked} hari
                        kerja, {l.lateCount}x telat
                      </p>
                    </button>
                    <div className="flex items-center gap-2">
                      <span className="whitespace-nowrap text-lg font-bold tabular-nums text-emerald-800">{rupiah(l.total)}</span>
                      <div className="flex gap-1">
                        {canPay && l.status === 'UNPAID' && period.status === 'OPEN' && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            className="min-h-[40px] border-emerald-300 text-emerald-800 hover:bg-emerald-50"
                            onClick={() => act({ action: 'pay-line', lineId: l.id }, `${l.barber.name} ditandai dibayar`)}
                          >
                            <Banknote className="h-4 w-4" /> Bayar
                          </Button>
                        )}
                        {isOwner && l.status === 'PAID' && period.status === 'OPEN' && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            className="min-h-[40px]"
                            onClick={() => act({ action: 'unpay-line', lineId: l.id }, 'Pembayaran dibatalkan')}
                          >
                            <Undo2 className="h-4 w-4" /> Batalkan
                          </Button>
                        )}
                        <button
                          onClick={() => setExpandedLine(expandedLine === l.id ? null : l.id)}
                          className="flex h-9 w-9 items-center justify-center rounded-md border text-neutral-500 hover:bg-neutral-100"
                          aria-label={`Rincian ${l.barber.name}`}
                        >
                          <ChevronDown className={cn('h-4 w-4 transition-transform', expandedLine === l.id && 'rotate-180')} />
                        </button>
                      </div>
                    </div>
                  </div>
                  {expandedLine === l.id && (
                    <div className="border-t bg-neutral-50 px-4 py-3">
                      <div className="grid grid-cols-3 gap-3 text-sm">
                        <div>
                          <p className="flex items-center gap-1 text-xs text-neutral-500">
                            <Clock className="h-3 w-3" /> Gaji Kehadiran
                          </p>
                          <p className="font-bold">{rupiah(l.attendancePay)}</p>
                        </div>
                        <div>
                          <p className="flex items-center gap-1 text-xs text-neutral-500">
                            <Calculator className="h-3 w-3" /> Komisi
                          </p>
                          <p className="font-bold">{rupiah(l.komisi)}</p>
                        </div>
                        <div>
                          <p className="flex items-center gap-1 text-xs text-neutral-500">
                            <HandCoins className="h-3 w-3" /> Tip via Kas
                          </p>
                          <p className="font-bold">{rupiah(l.tip)}</p>
                        </div>
                      </div>
                      {l.attendanceDetail && l.attendanceDetail.length > 0 && (
                        <div className="mt-3">
                          <p className="text-xs font-semibold text-neutral-600">Rincian absensi:</p>
                          <ul className="mt-1 max-h-32 space-y-0.5 overflow-y-auto text-xs text-neutral-600">
                            {l.attendanceDetail.map((d) => (
                              <li key={d.date} className="flex justify-between">
                                <span>
                                  {formatDateID(d.date)}
                                  {d.lateMinutes > 0
                                    ? ` — telat ${d.lateMinutes} menit${d.deductedHours > 0 ? ` \u2192 potong ${d.deductedHours} jam` : ''}`
                                    : ' — tepat waktu'}
                                </span>
                                <span>{rupiah(d.dailyPay)}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {l.status === 'PAID' && l.paidAt && (
                        <p className="mt-2 text-xs text-emerald-700">
                          Dibayar pada {formatDateID(new Date(l.paidAt).toISOString().slice(0, 10))}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
            {totals.unpaid > 0 && (
              <p className="text-sm text-amber-800">
                Total belum dibayar: <strong>{rupiah(totals.unpaid)}</strong>
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Confirm close dialog */}
      <Dialog open={confirmClose} onOpenChange={setConfirmClose}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Tutup Periode Gajian?</DialogTitle>
            <DialogDescription>
              Periode terkunci dan tidak bisa diubah (kecuali dibuka ulang oleh Owner). Pastikan semua
              angka sudah benar.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" className="min-h-[44px]" onClick={() => setConfirmClose(false)}>
              Batal
            </Button>
            <Button
              disabled={busy}
              className="min-h-[44px] bg-stone-800 text-white hover:bg-stone-900"
              onClick={async () => {
                setConfirmClose(false)
                await act({ action: 'close' }, 'Periode gajian dikunci')
              }}
            >
              Kunci Periode
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function TotalTile({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={cn('rounded-lg border p-3', highlight && 'border-emerald-400 bg-emerald-50')}>
      <p className="text-[11px] text-neutral-500">{label}</p>
      <p className="whitespace-nowrap text-sm font-bold tabular-nums text-neutral-900 sm:text-base">{value}</p>
    </div>
  )
}
