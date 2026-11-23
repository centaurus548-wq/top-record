'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
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
import { Plus, Wallet, TrendingDown } from 'lucide-react'
import { api, rupiah, formatDateID, type SessionUser } from '@/lib/client'
import { todayISOClient } from '@/lib/client'
import { toast } from '@/hooks/use-toast'

type ExpenseData = {
  expenses: {
    id: string
    date: string
    amount: number
    source: 'KAS_SHOP' | 'OWNER_PRIVATE'
    method: 'CASH' | 'QRIS'
    note: string | null
    createdAt: string
    category: { id: string; name: string; ownerOnly: boolean }
  }[]
  categories: { id: string; name: string; ownerOnly: boolean }[]
}

export function ExpensesSection({ user }: { user: SessionUser }) {
  const qc = useQueryClient()
  // Revisi 8: satu level akses — semua kategori boleh dicatat siapa pun.
  const isOwner = true
  const [date, setDate] = useState(todayISOClient())
  const [categoryId, setCategoryId] = useState('')
  const [amount, setAmount] = useState('')
  const [source, setSource] = useState<'KAS_SHOP' | 'OWNER_PRIVATE'>('KAS_SHOP')
  const [method, setMethod] = useState<'CASH' | 'QRIS'>('CASH')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['expenses', date],
    queryFn: () => api<ExpenseData>(`/api/expenses?date=${date}`),
  })

  const categories = (data?.categories ?? []).filter((c) => isOwner || !c.ownerOnly)

  const submit = async () => {
    const amt = parseInt(amount.replace(/\D/g, ''), 10) || 0
    if (!categoryId || amt <= 0) {
      toast({ title: 'Lengkapi kategori dan nominal', variant: 'destructive' })
      return
    }
    setSaving(true)
    try {
      await api('/api/expenses', {
        method: 'POST',
        body: JSON.stringify({ date, categoryId, amount: amt, source, method, note }),
      })
      toast({ title: 'Pengeluaran dicatat', description: rupiah(amt) })
      setAmount('')
      setNote('')
      qc.invalidateQueries({ queryKey: ['expenses'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
    } catch (err) {
      toast({
        title: 'Gagal menyimpan',
        description: err instanceof Error ? err.message : 'Terjadi kesalahan',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  const totalKas = (data?.expenses ?? [])
    .filter((e) => e.source === 'KAS_SHOP')
    .reduce((a, e) => a + e.amount, 0)
  const totalOwner = (data?.expenses ?? [])
    .filter((e) => e.source === 'OWNER_PRIVATE')
    .reduce((a, e) => a + e.amount, 0)

  return (
    <div className="space-y-4">
      {/* Form */}
      <Card className="border-emerald-200">
        <CardContent className="p-4">
          <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-neutral-800">
            <Plus className="h-4 w-4 text-emerald-700" /> Catat Pengeluaran
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="exp-date">Tanggal</Label>
              <Input id="exp-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-11" />
            </div>
            <div className="space-y-1.5">
              <Label>Kategori</Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger className="h-11">
                  <SelectValue placeholder="Pilih kategori" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="exp-amount">Nominal</Label>
              <Input
                id="exp-amount"
                inputMode="numeric"
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))}
                placeholder="cth: 50000"
                className="h-11"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Sumber dana</Label>
              <Select value={source} onValueChange={(v) => setSource(v as 'KAS_SHOP' | 'OWNER_PRIVATE')}>
                <SelectTrigger className="h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="KAS_SHOP">Kas Toko</SelectItem>
                  <SelectItem value="OWNER_PRIVATE">Dana Pribadi Owner</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Metode</Label>
              <Select value={method} onValueChange={(v) => setMethod(v as 'CASH' | 'QRIS')}>
                <SelectTrigger className="h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CASH">Tunai</SelectItem>
                  <SelectItem value="QRIS">QRIS / Transfer</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="exp-note">Catatan</Label>
              <Input id="exp-note" value={note} onChange={(e) => setNote(e.target.value)} className="h-11" placeholder="opsional" />
            </div>
          </div>
          <Button
            onClick={submit}
            disabled={saving}
            className="mt-3 min-h-[44px] bg-emerald-600 text-white hover:bg-emerald-700"
          >
            {saving ? 'Menyimpan...' : 'Simpan Pengeluaran'}
          </Button>
          <p className="mt-2 text-xs text-neutral-500">
            Kasir bisa langsung mencatat pengeluaran operasional. Menu Restock & pembelian stok hanya
            untuk Owner (ada di menu Produk & Stok).
          </p>
        </CardContent>
      </Card>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-4">
        <Card className="p-0">
          <CardContent className="p-4">
            <TrendingDown className="mb-1 h-4 w-4 text-red-600" />
            <p className="text-xs text-neutral-500">Kas Toko ({formatDateID(date)})</p>
            <p className="whitespace-nowrap text-lg font-bold tabular-nums text-red-700">{rupiah(totalKas)}</p>
          </CardContent>
        </Card>
        <Card className="p-0">
          <CardContent className="p-4">
            <Wallet className="mb-1 h-4 w-4 text-stone-600" />
            <p className="text-xs text-neutral-500">Dana Pribadi Owner</p>
            <p className="whitespace-nowrap text-lg font-bold tabular-nums text-stone-700">{rupiah(totalOwner)}</p>
          </CardContent>
        </Card>
      </div>

      {/* List */}
      {isLoading && <p className="text-sm text-neutral-400">Memuat...</p>}
      <div className="space-y-2">
        {(data?.expenses ?? []).map((e) => (
          <Card key={e.id} className="p-0">
            <CardContent className="flex flex-wrap items-center justify-between gap-2 p-4">
              <div className="min-w-0">
                <p className="font-medium text-neutral-900">{e.category?.name ?? '-'}</p>
                <p className="text-xs text-neutral-500">
                  {formatDateID(e.date)} &middot; {e.source === 'KAS_SHOP' ? 'Kas Toko' : 'Dana Owner'} &middot;{' '}
                  {e.method === 'CASH' ? 'Tunai' : 'QRIS'}
                  {e.note ? ` — ${e.note}` : ''}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  variant="outline"
                  className={e.source === 'KAS_SHOP' ? 'border-red-200 text-red-700' : 'border-stone-300 text-stone-600'}
                >
                  {e.source === 'KAS_SHOP' ? 'Mengurangi kas' : 'Tidak mempengaruhi kas'}
                </Badge>
                <span className="whitespace-nowrap font-bold tabular-nums text-red-700">-{rupiah(e.amount)}</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
