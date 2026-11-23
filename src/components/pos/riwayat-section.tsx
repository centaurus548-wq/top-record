'use client'

import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Search,
  Eye,
  Ban,
  Banknote,
  QrCode,
  HandCoins,
  ChevronDown,
} from 'lucide-react'
import { api, rupiah, formatDateID, formatClock, type SessionUser } from '@/lib/client'
import { todayISOClient } from '@/lib/client'
import { cn } from '@/lib/utils'
import { toast } from '@/hooks/use-toast'

type TxItem = {
  id: string
  itemType: 'SERVICE' | 'PRODUCT'
  name: string
  price: number
  qty: number
  barberId: string | null
  kepalaGroup: number
}

type Txn = {
  id: string
  invoiceNo: string
  date: string
  createdAt: string
  total: number
  paymentMethod: 'CASH' | 'QRIS'
  tipAmount: number
  tipBarberId: string | null
  tipMethod: 'CASH' | 'QRIS' | null
  tipStatus: 'NONE' | 'UNCLAIMED' | 'CLAIMED'
  status: 'NORMAL' | 'VOIDED'
  voidReason: string | null
  customerName: string | null
  items: TxItem[]
}

type CatalogData = {
  barbers: { id: string; name: string; nickname: string }[]
}

export function RiwayatSection({ user, archiveMode = false }: { user: SessionUser; archiveMode?: boolean }) {
  const qc = useQueryClient()
  const today = todayISOClient()
  const [date, setDate] = useState(today)
  const [barberId, setBarberId] = useState('all')
  const [q, setQ] = useState('')
  const [detail, setDetail] = useState<Txn | null>(null)
  const [voidTarget, setVoidTarget] = useState<Txn | null>(null)
  const [voidReason, setVoidReason] = useState('')
  const [voiding, setVoiding] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)

  const { data: catalog } = useQuery({
    queryKey: ['catalog'],
    queryFn: () => api<CatalogData>('/api/catalog'),
  })
  const { data, isLoading } = useQuery({
    queryKey: ['transactions', date, barberId, q, archiveMode],
    queryFn: () =>
      api<{ transactions: Txn[] }>(
        `/api/transactions?date=${date}&status=${archiveMode ? 'VOIDED' : 'NORMAL'}&q=${encodeURIComponent(q)}${barberId !== 'all' ? `&barberId=${barberId}` : ''}`
      ),
  })

  const barberMap = useMemo(
    () => new Map((catalog?.barbers ?? []).map((b) => [b.id, b])),
    [catalog]
  )

  const canVoid = (t: Txn) => {
    // Revisi 8: akses penuh — pembatalan hari apa pun diperbolehkan (alasan wajib).
    return t.status !== 'VOIDED'
  }

  const submitVoid = async () => {
    if (!voidTarget || !voidReason.trim()) return
    setVoiding(true)
    try {
      await api(`/api/transactions/${voidTarget.id}/void`, {
        method: 'POST',
        body: JSON.stringify({ reason: voidReason }),
      })
      toast({ title: 'Transaksi dibatalkan', description: voidTarget.invoiceNo })
      setVoidTarget(null)
      setVoidReason('')
      qc.invalidateQueries({ queryKey: ['transactions'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      qc.invalidateQueries({ queryKey: ['komisi'] })
    } catch (err) {
      toast({
        title: 'Gagal membatalkan',
        description: err instanceof Error ? err.message : 'Terjadi kesalahan',
        variant: 'destructive',
      })
    } finally {
      setVoiding(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="riwayat-date">Tanggal</Label>
          <Input
            id="riwayat-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="h-11 w-44"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Kapster</Label>
          <Select value={barberId} onValueChange={setBarberId}>
            <SelectTrigger className="h-11 w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua kapster</SelectItem>
              {(catalog?.barbers ?? []).map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-52 flex-1 space-y-1.5">
          <Label htmlFor="riwayat-q">Cari invoice / pelanggan</Label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
            <Input
              id="riwayat-q"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="INV-... atau nama"
              className="h-11 pl-9"
            />
          </div>
        </div>
      </div>

      {/* List */}
      <div className="space-y-2">
        {isLoading && <p className="py-8 text-center text-sm text-neutral-400">Memuat...</p>}
        {!isLoading && (data?.transactions ?? []).length === 0 && (
          <Card className="border-dashed">
            <CardContent className="py-10 text-center text-sm text-neutral-400">
              {archiveMode ? 'Belum ada transaksi yang dibatalkan.' : 'Tidak ada transaksi pada filter ini.'}
            </CardContent>
          </Card>
        )}
        {(data?.transactions ?? []).map((t) => {
          const kepalaSet = new Set(t.items.map((i) => i.kepalaGroup))
          const isOpen = expanded === t.id
          return (
            <Card key={t.id} className={cn('p-0', t.status === 'VOIDED' && 'border-red-200 bg-red-50/40')}>
              <CardContent className="p-0">
                <button
                  onClick={() => setExpanded(isOpen ? null : t.id)}
                  className="flex w-full flex-wrap items-center justify-between gap-2 px-4 py-3 text-left"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-neutral-900">{t.invoiceNo}</span>
                      {t.status === 'VOIDED' ? (
                        <Badge variant="outline" className="border-red-300 text-red-700">
                          Dibatalkan
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className={t.paymentMethod === 'CASH' ? 'border-amber-300 text-amber-800' : 'border-neutral-300 text-neutral-600'}
                        >
                          {t.paymentMethod === 'CASH' ? <Banknote className="mr-1 h-3 w-3" /> : <QrCode className="mr-1 h-3 w-3" />}
                          {t.paymentMethod === 'CASH' ? 'Tunai' : 'QRIS'}
                        </Badge>
                      )}
                      {t.tipAmount > 0 && (
                        <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-900">
                          <HandCoins className="mr-1 h-3 w-3" /> Tip {rupiah(t.tipAmount)}
                        </Badge>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-neutral-500">
                      {formatDateID(t.date)} {formatClock(t.createdAt)} &middot; {kepalaSet.size} kepala &middot;{' '}
                      {t.items.length} item{t.customerName ? ` &middot; ${t.customerName}` : ''}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="whitespace-nowrap text-base font-bold tabular-nums text-emerald-800">
                      {rupiah(t.total + t.tipAmount)}
                    </span>
                    <div className="flex items-center gap-1">
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={(e) => {
                          e.stopPropagation()
                          setDetail(t)
                        }}
                        onKeyDown={(e) => e.key === 'Enter' && setDetail(t)}
                        className="flex h-11 w-11 items-center justify-center rounded-md border text-neutral-500 hover:bg-neutral-100 sm:h-9 sm:w-9"
                        aria-label={`Detail ${t.invoiceNo}`}
                      >
                        <Eye className="h-4 w-4" />
                      </span>
                      {!archiveMode && canVoid(t) && (
                        <span
                          role="button"
                          tabIndex={0}
                          onClick={(e) => {
                            e.stopPropagation()
                            setVoidTarget(t)
                          }}
                          onKeyDown={(e) => e.key === 'Enter' && setVoidTarget(t)}
                          className="flex h-11 w-11 items-center justify-center rounded-md border text-red-600 hover:bg-red-50 sm:h-9 sm:w-9"
                          aria-label={`Batalkan ${t.invoiceNo}`}
                        >
                          <Ban className="h-4 w-4" />
                        </span>
                      )}
                    </div>
                    <ChevronDown className={cn('h-4 w-4 shrink-0 text-neutral-400 transition-transform', isOpen && 'rotate-180')} />
                  </div>
                </button>
                {isOpen && (
                  <div className="border-t px-4 py-2">
                    {[...kepalaSet].sort((a, b) => a - b).map((kg) => (
                      <div key={kg} className="py-1">
                        <p className="text-xs font-bold text-neutral-500">
                          Kepala {kg} &middot;{' '}
                          {t.items.find((i) => i.kepalaGroup === kg)?.barberId
                            ? barberMap.get(t.items.find((i) => i.kepalaGroup === kg)!.barberId!)?.name ?? '-'
                            : '- (transaksi lama)'}
                        </p>
                        {t.items
                          .filter((i) => i.kepalaGroup === kg)
                          .map((i) => (
                            <p key={i.id} className="flex justify-between text-sm">
                              <span>
                                {i.qty}x {i.name}
                              </span>
                              <span>{rupiah(i.price * i.qty)}</span>
                            </p>
                          ))}
                      </div>
                    ))}
                    {t.status === 'VOIDED' && t.voidReason && (
                      <p className="mt-2 rounded bg-red-100 px-2 py-1 text-xs text-red-800">
                        Alasan pembatalan: {t.voidReason}
                      </p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Detail dialog */}
      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{detail?.invoiceNo}</DialogTitle>
            <DialogDescription>
              {detail ? `${formatDateID(detail.date)} ${formatClock(detail.createdAt)}` : ''}
            </DialogDescription>
          </DialogHeader>
          {detail && (
            <div className="max-h-80 space-y-2 overflow-y-auto rounded-lg border bg-neutral-50 p-3 text-sm">
              {detail.customerName && <p className="font-semibold">Pelanggan: {detail.customerName}</p>}
              {[...new Set(detail.items.map((i) => i.kepalaGroup))].sort((a, b) => a - b).map((kg) => (
                <div key={kg}>
                  <p className="text-xs font-bold text-neutral-500">
                    Kepala {kg} &middot;{' '}
                    {detail.items.find((i) => i.kepalaGroup === kg)?.barberId
                      ? barberMap.get(detail.items.find((i) => i.kepalaGroup === kg)!.barberId!)?.name ?? '-'
                      : '- (transaksi lama)'}
                  </p>
                  {detail.items
                    .filter((i) => i.kepalaGroup === kg)
                    .map((i) => (
                      <p key={i.id} className="flex justify-between">
                        <span>
                          {i.qty}x {i.name}
                        </span>
                        <span>{rupiah(i.price * i.qty)}</span>
                      </p>
                    ))}
                </div>
              ))}
              <div className="border-t pt-2 font-bold">
                <p className="flex justify-between">
                  <span>Total</span>
                  <span>{rupiah(detail.total)}</span>
                </p>
                {detail.tipAmount > 0 && (
                  <p className="flex justify-between">
                    <span>Tip ({detail.tipStatus === 'CLAIMED' ? 'sudah diambil' : 'belum diambil'})</span>
                    <span>{rupiah(detail.tipAmount)}</span>
                  </p>
                )}
                <p className="flex justify-between text-emerald-800">
                  <span>Grand Total</span>
                  <span>{rupiah(detail.total + detail.tipAmount)}</span>
                </p>
              </div>
              {detail.status === 'VOIDED' && detail.voidReason && (
                <p className="rounded bg-red-100 px-2 py-1 text-xs text-red-800">
                  Dibatalkan: {detail.voidReason}
                </p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Void dialog */}
      <Dialog open={!!voidTarget} onOpenChange={(o) => !o && setVoidTarget(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-red-700">Batalkan Transaksi</DialogTitle>
            <DialogDescription>
              {voidTarget?.invoiceNo} akan dibatalkan dan dikeluarkan dari semua laporan. Tindakan ini
              tidak bisa dibatalkan.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="void-reason">Alasan pembatalan (wajib)</Label>
            <Input
              id="void-reason"
              value={voidReason}
              onChange={(e) => setVoidReason(e.target.value)}
              placeholder="cth: salah input kepala"
              className="h-11"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" className="min-h-[44px]" onClick={() => setVoidTarget(null)}>
              Batal
            </Button>
            <Button
              variant="destructive"
              disabled={!voidReason.trim() || voiding}
              className="min-h-[44px]"
              onClick={submitVoid}
            >
              {voiding ? 'Memproses...' : 'Batalkan Transaksi'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
