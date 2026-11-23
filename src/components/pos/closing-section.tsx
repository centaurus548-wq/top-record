'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Lock, LockOpen, Vault, Banknote, HandCoins, TrendingDown, Scale } from 'lucide-react'
import { api, rupiah, type SessionUser } from '@/lib/client'
import { toast } from '@/hooks/use-toast'

type ClosingData = {
  date: string
  cashDay: {
    id: string
    date: string
    openingCash: number
    status: 'OPEN' | 'LOCKED'
    countedCash: number | null
    expectedCash: number | null
    difference: number | null
    differenceNote: string | null
    closedAt: string | null
    reopenReason: string | null
  } | null
  breakdown: {
    openingCash: number
    cashTxnTotal: number
    cashExpense: number
    tipsPaidOut: number
    expectedCash: number
  }
}

export function ClosingSection({ user: _user }: { user: SessionUser }) {
  const qc = useQueryClient()
  const [opening, setOpening] = useState('')
  const [counted, setCounted] = useState('')
  const [diffNote, setDiffNote] = useState('')
  const [busy, setBusy] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['closing'],
    queryFn: () => api<ClosingData>('/api/closing'),
  })

  const setOpeningCash = async () => {
    const val = parseInt(opening.replace(/\D/g, ''), 10) || 0
    setBusy(true)
    try {
      await api('/api/closing', { method: 'PUT', body: JSON.stringify({ openingCash: val }) })
      toast({ title: 'Modal awal disimpan', description: rupiah(val) })
      qc.invalidateQueries({ queryKey: ['closing'] })
    } catch (err) {
      toast({
        title: 'Gagal menyimpan modal awal',
        description: err instanceof Error ? err.message : 'Terjadi kesalahan',
        variant: 'destructive',
      })
    } finally {
      setBusy(false)
    }
  }

  const closeDay = async () => {
    const val = parseInt(counted.replace(/\D/g, ''), 10) || 0
    setBusy(true)
    try {
      await api('/api/closing', {
        method: 'POST',
        body: JSON.stringify({ action: "close", countedCash: val, differenceNote: diffNote }),
      })
      toast({ title: 'Hari ditutup & kas dikunci' })
      setCounted('')
      setDiffNote('')
      qc.invalidateQueries({ queryKey: ['closing'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
    } catch (err) {
      toast({
        title: 'Gagal menutup hari',
        description: err instanceof Error ? err.message : 'Terjadi kesalahan',
        variant: 'destructive',
      })
    } finally {
      setBusy(false)
    }
  }

  const reopenDay = async () => {
    const reason = window.prompt('Alasan buka ulang (Owner):')
    if (!reason) return
    setBusy(true)
    try {
      await api('/api/closing', { method: 'POST', body: JSON.stringify({ action: 'reopen', reopenReason: reason }) })
      toast({ title: 'Hari dibuka ulang' })
      qc.invalidateQueries({ queryKey: ['closing'] })
    } catch (err) {
      toast({
        title: 'Gagal membuka ulang',
        description: err instanceof Error ? err.message : 'Terjadi kesalahan',
        variant: 'destructive',
      })
    } finally {
      setBusy(false)
    }
  }

  if (isLoading) return <p className="text-sm text-neutral-400">Memuat...</p>

  const b = data?.breakdown
  const cashDay = data?.cashDay
  const locked = cashDay?.status === 'LOCKED'
  const difference = counted ? (parseInt(counted, 10) || 0) - (b?.expectedCash ?? 0) : null

  return (
    <div className="space-y-4">
      {/* Status */}
      <Card className={locked ? 'border-stone-300' : 'border-emerald-200'}>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center justify-between text-base">
            <span className="flex items-center gap-2">
              <Vault className="h-4 w-4 text-emerald-700" /> Status Kas Hari Ini
            </span>
            <Badge variant="outline" className={locked ? 'border-stone-400 text-stone-700' : 'border-emerald-300 bg-emerald-50 text-emerald-800'}>
              {locked ? <Lock className="mr-1 h-3 w-3" /> : <LockOpen className="mr-1 h-3 w-3" />}
              {locked ? 'TERKUNCI' : 'TERBUKA'}
            </Badge>
          </CardTitle>
          <CardDescription>
            {locked
              ? 'Hari sudah ditutup. Owner bisa membuka ulang bila perlu koreksi.'
              : 'Isi modal awal di pagi hari, tutup kasir di akhir hari.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Breakdown */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <MiniStat label="Modal Awal" value={rupiah(b?.openingCash ?? 0)} icon={<Vault className="h-3.5 w-3.5" />} />
            <MiniStat label="Masuk Tunai" value={rupiah(b?.cashTxnTotal ?? 0)} icon={<Banknote className="h-3.5 w-3.5" />} />
            <MiniStat label="Tip Dibayarkan" value={rupiah(b?.tipsPaidOut ?? 0)} icon={<HandCoins className="h-3.5 w-3.5" />} />
            <MiniStat label="Keluar (Pengeluaran Tunai)" value={rupiah(b?.cashExpense ?? 0)} icon={<TrendingDown className="h-3.5 w-3.5" />} />
            <MiniStat
              label="Harus Ada di Laci"
              value={rupiah(b?.expectedCash ?? 0)}
              icon={<Scale className="h-3.5 w-3.5" />}
              highlight
            />
          </div>

          {/* Opening cash */}
          {!locked && (
            <div className="rounded-lg border border-dashed p-3">
              <Label htmlFor="opening-cash" className="text-xs">
                Modal awal hari ini
              </Label>
              <div className="mt-1 flex gap-2">
                <Input
                  id="opening-cash"
                  inputMode="numeric"
                  value={opening}
                  onChange={(e) => setOpening(e.target.value.replace(/\D/g, ''))}
                  placeholder={String(cashDay?.openingCash ?? 0)}
                  className="h-11 max-w-48"
                />
                <Button
                  onClick={setOpeningCash}
                  disabled={busy}
                  className="min-h-[44px] bg-emerald-600 text-white hover:bg-emerald-700"
                >
                  Simpan Modal
                </Button>
              </div>
            </div>
          )}

          {/* Close / reopen */}
          {!locked ? (
            <div className="rounded-lg border p-3">
              <p className="mb-2 text-sm font-semibold text-neutral-800">Tutup Hari</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="counted-cash">Uang yang dihitung di laci</Label>
                  <Input
                    id="counted-cash"
                    inputMode="numeric"
                    value={counted}
                    onChange={(e) => setCounted(e.target.value.replace(/\D/g, ''))}
                    className="h-11"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="diff-note">Keterangan selisih (wajib bila selisih)</Label>
                  <Input
                    id="diff-note"
                    value={diffNote}
                    onChange={(e) => setDiffNote(e.target.value)}
                    className="h-11"
                    placeholder="opsional"
                  />
                </div>
              </div>
              {difference !== null && (
                <p
                  className={`mt-2 text-sm font-semibold ${
                    difference === 0 ? 'text-emerald-700' : 'text-amber-800'
                  }`}
                >
                  Selisih: {difference >= 0 ? '+' : ''}
                  {rupiah(difference)}
                </p>
              )}
              <Button
                onClick={closeDay}
                disabled={busy || !counted}
                className="mt-3 min-h-[44px] bg-stone-800 text-white hover:bg-stone-900"
              >
                <Lock className="h-4 w-4" /> Tutup & Kunci Hari
              </Button>
            </div>
          ) : (
            <div className="rounded-lg bg-stone-50 p-3 text-sm">
              <p className="text-neutral-700">
                Dihitung: <strong>{rupiah(cashDay?.countedCash ?? 0)}</strong> &middot; Harus:{' '}
                <strong>{rupiah(cashDay?.expectedCash ?? 0)}</strong> &middot; Selisih:{' '}
                <strong className={(cashDay?.difference ?? 0) === 0 ? 'text-emerald-700' : 'text-red-700'}>
                  {(cashDay?.difference ?? 0) >= 0 ? '+' : ''}
                  {rupiah(cashDay?.difference ?? 0)}
                </strong>
              </p>
              {cashDay?.differenceNote && (
                <p className="mt-1 text-xs text-neutral-500">Catatan: {cashDay.differenceNote}</p>
              )}
              {(
                <Button variant="outline" onClick={reopenDay} disabled={busy} className="mt-2 min-h-[44px]">
                  <LockOpen className="h-4 w-4" /> Buka Ulang
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function MiniStat({
  label,
  value,
  icon,
  highlight,
}: {
  label: string
  value: string
  icon: React.ReactNode
  highlight?: boolean
}) {
  return (
    <div className={`rounded-lg border p-3 ${highlight ? 'border-emerald-400 bg-emerald-50' : ''}`}>
      <p className="flex items-center gap-1 text-[11px] text-neutral-500">
        {icon} {label}
      </p>
      <p className="whitespace-nowrap text-sm font-bold tabular-nums text-neutral-900 sm:text-base">{value}</p>
    </div>
  )
}
