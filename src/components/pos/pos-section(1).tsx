'use client'

import { useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Plus,
  Trash2,
  UserRound,
  Banknote,
  QrCode,
  HandCoins,
  ReceiptText,
  ChevronDown,
  Package,
  CheckCircle2,
  Minus,
  X,
} from 'lucide-react'
import { api, rupiah, type SessionUser } from '@/lib/client'
import { cn } from '@/lib/utils'
import { toast } from '@/hooks/use-toast'

type CatalogData = {
  services: { id: string; name: string; price: number; durationMin: number }[]
  products: { id: string; name: string; price: number; stock: number; minStock: number; category: { name: string } }[]
  barbers: { id: string; name: string; nickname: string; tierName: string | null }[]
}

type CartItem = {
  key: string
  itemType: 'SERVICE' | 'PRODUCT'
  refId: string
  name: string
  price: number
  qty: number
}

type KepalaGroup = {
  kepalaGroup: number
  barberId: string | null
  items: CartItem[]
}

type SavedTransaction = {
  id: string
  invoiceNo: string
  date: string
  total: number
  paymentMethod: 'CASH' | 'QRIS'
  tipAmount: number
  tipBarberId: string | null
  tipMethod: 'CASH' | 'QRIS' | null
  customerName: string | null
  items: { itemType: string; name: string; price: number; qty: number; barberId: string | null; kepalaGroup: number }[]
}

let itemKeyCounter = 0
function newItemKey(): string {
  itemKeyCounter += 1
  return `it-${Date.now()}-${itemKeyCounter}`
}

export function PosSection({ user, onDone }: { user: SessionUser; onDone?: () => void }) {
  const qc = useQueryClient()
  const { data: catalog } = useQuery({
    queryKey: ['catalog'],
    queryFn: () => api<CatalogData>('/api/catalog'),
  })

  const [groups, setGroups] = useState<KepalaGroup[]>([{ kepalaGroup: 1, barberId: null, items: [] }])
  const [activeGroup, setActiveGroup] = useState(0)
  const [customerName, setCustomerName] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'QRIS'>('CASH')
  const [cashReceived, setCashReceived] = useState('')
  const [tipOpen, setTipOpen] = useState(false)
  const [tipAmount, setTipAmount] = useState('')
  const [tipBarberId, setTipBarberId] = useState('')
  const [tipMethod, setTipMethod] = useState<'CASH' | 'QRIS'>('CASH')
  const [saving, setSaving] = useState(false)
  const [receipt, setReceipt] = useState<SavedTransaction | null>(null)
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false)

  const barbers = catalog?.barbers ?? []
  const services = catalog?.services ?? []
  const products = catalog?.products ?? []
  const active = groups[activeGroup] ?? groups[0]

  // Kapster wajib untuk setiap kepala: isi otomatis dengan kapster pertama
  // begitu katalog termuat atau kepala baru dibuat tanpa pilihan.
  useEffect(() => {
    const list = catalog?.barbers
    if (!list || list.length === 0) return
    setGroups((prev) =>
      prev.map((g) => (g.barberId && list.some((b) => b.id === g.barberId) ? g : { ...g, barberId: list[0].id }))
    )
  }, [catalog])

  const total = useMemo(
    () => groups.reduce((acc, g) => acc + g.items.reduce((a, i) => a + i.price * i.qty, 0), 0),
    [groups]
  )
  const tip = parseInt(tipAmount.replace(/\D/g, ''), 10) || 0
  const grandTotal = total + tip
  const kembalian = (parseInt(cashReceived.replace(/\D/g, ''), 10) || 0) - grandTotal

  const barberLabel = (id: string | null) =>
    id ? barbers.find((b) => b.id === id)?.nickname ?? '-' : '-'

  const kepalaCountPerBarber = useMemo(() => {
    const map = new Map<string, number>()
    for (const g of groups) {
      if (g.barberId && g.items.some((i) => i.itemType === 'SERVICE')) {
        map.set(g.barberId, (map.get(g.barberId) ?? 0) + 1)
      }
    }
    return map
  }, [groups])

  const addKepala = () => {
    const nextNo = Math.max(...groups.map((g) => g.kepalaGroup)) + 1
    setGroups((prev) => [
      ...prev,
      { kepalaGroup: nextNo, barberId: barbers[0]?.id ?? null, items: [] },
    ])
    setActiveGroup(groups.length)
  }

  const removeKepala = (idx: number) => {
    if (groups.length <= 1) return
    setGroups((prev) => prev.filter((_, i) => i !== idx))
    setActiveGroup((cur) => Math.max(0, cur > idx ? cur - 1 : cur === idx ? 0 : cur - 0))
  }

  const setGroupBarber = (idx: number, barberId: string | null) => {
    setGroups((prev) => prev.map((g, i) => (i === idx ? { ...g, barberId } : g)))
  }

  const addItem = (itemType: 'SERVICE' | 'PRODUCT', refId: string, name: string, price: number) => {
    setGroups((prev) =>
      prev.map((g, i) => {
        if (i !== activeGroup) return g
        const existing = g.items.find((it) => it.itemType === itemType && it.refId === refId)
        if (existing) {
          return {
            ...g,
            items: g.items.map((it) => (it === existing ? { ...it, qty: it.qty + 1 } : it)),
          }
        }
        return {
          ...g,
          items: [...g.items, { key: newItemKey(), itemType, refId, name, price, qty: 1 }],
        }
      })
    )
  }

  const bumpQty = (key: string, delta: number) => {
    setGroups((prev) =>
      prev.map((g, i) => {
        if (i !== activeGroup) return g
        return {
          ...g,
          items: g.items
            .map((it) => (it.key === key ? { ...it, qty: it.qty + delta } : it))
            .filter((it) => it.qty > 0),
        }
      })
    )
  }

  const clearActive = () => {
    setGroups((prev) => prev.map((g, i) => (i === activeGroup ? { ...g, items: [] } : g)))
  }

  const resetCart = () => {
    setGroups([{ kepalaGroup: 1, barberId: barbers[0]?.id ?? null, items: [] }])
    setActiveGroup(0)
    setCustomerName('')
    setPaymentMethod('CASH')
    setCashReceived('')
    setTipAmount('')
    setTipBarberId('')
  }

  const submit = async () => {
    if (groups.every((g) => g.items.length === 0)) {
      toast({ title: 'Keranjang kosong', description: 'Tambahkan layanan atau produk dulu.', variant: 'destructive' })
      return
    }
    if (groups.some((g) => g.items.length > 0 && !g.barberId)) {
      toast({
        title: 'Kapster belum dipilih',
        description: 'Setiap kepala wajib punya kapster. Pilih kapster di kepala yang belum ada.',
        variant: 'destructive',
      })
      return
    }
    const payloadGroups = groups
      .filter((g) => g.items.length > 0)
      .map((g, i) => ({
        kepalaGroup: i + 1,
        barberId: g.barberId,
        items: g.items.map((it) => ({
          itemType: it.itemType,
          serviceItemId: it.itemType === 'SERVICE' ? it.refId : undefined,
          productId: it.itemType === 'PRODUCT' ? it.refId : undefined,
          qty: it.qty,
        })),
      }))
    setSaving(true)
    try {
      const res = await api<{ transaction: SavedTransaction }>('/api/transactions', {
        method: 'POST',
        body: JSON.stringify({
          kepalaGroups: payloadGroups,
          paymentMethod,
          tip:
            tip > 0 && tipBarberId
              ? { amount: tip, barberId: tipBarberId, method: tipMethod }
              : undefined,
          customerName: customerName || undefined,
        }),
      })
      setReceipt(res.transaction)
      resetCart()
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      qc.invalidateQueries({ queryKey: ['catalog'] })
      qc.invalidateQueries({ queryKey: ['komisi'] })
      qc.invalidateQueries({ queryKey: ['transactions'] })
      toast({ title: 'Transaksi tersimpan', description: res.transaction.invoiceNo })
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

  const receiptPanel = (
    <div className="flex flex-col">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-2 font-semibold text-neutral-800">
          <ReceiptText className="h-4 w-4 text-emerald-700" /> Struk Berjalan
        </h3>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 min-h-[44px] text-red-600 hover:bg-red-50 sm:min-h-0"
          onClick={resetCart}
        >
          <X className="h-4 w-4" /> Reset
        </Button>
      </div>
      <div className="max-h-72 flex-1 space-y-3 overflow-y-auto pr-1">
        {groups.every((g) => g.items.length === 0) && (
          <p className="py-6 text-center text-sm text-neutral-400">Belum ada item.</p>
        )}
        {groups.map(
          (g, gi) =>
            g.items.length > 0 && (
              <div key={g.kepalaGroup} className="rounded-lg border border-neutral-200">
                <div className="flex items-center justify-between border-b bg-neutral-50 px-3 py-1.5 text-xs font-semibold text-neutral-600">
                  <span>
                    Kepala {g.kepalaGroup} &middot; {barberLabel(g.barberId)}
                    {kepalaCountPerBarber.get(g.barberId ?? '') ? (
                      <span className="ml-1 text-emerald-700">
                        ({kepalaCountPerBarber.get(g.barberId ?? '')} kepala)
                      </span>
                    ) : null}
                  </span>
                  <button
                    onClick={() => removeKepala(gi)}
                    className="text-red-500 hover:text-red-700"
                    aria-label={`Hapus kepala ${g.kepalaGroup}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                <ul className="px-3 py-1.5">
                  {g.items.map((it) => (
                    <li key={it.key} className="flex items-center justify-between py-1 text-sm">
                      <div className="min-w-0">
                        <span className="truncate font-medium text-neutral-800">{it.name}</span>
                        <span className="ml-1 text-xs text-neutral-400">x{it.qty}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="tabular-nums">{rupiah(it.price * it.qty)}</span>
                        <div className="ml-1 flex items-center gap-0.5">
                          <button
                            onClick={() => bumpQty(it.key, -1)}
                            className="flex h-8 w-8 items-center justify-center rounded border text-neutral-600 hover:bg-neutral-100 sm:h-6 sm:w-6"
                            aria-label={`Kurangi ${it.name}`}
                          >
                            <Minus className="h-3 w-3" />
                          </button>
                          <button
                            onClick={() => bumpQty(it.key, 1)}
                            className="flex h-8 w-8 items-center justify-center rounded border text-neutral-600 hover:bg-neutral-100 sm:h-6 sm:w-6"
                            aria-label={`Tambah ${it.name}`}
                          >
                            <Plus className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )
        )}
      </div>
      <div className="mt-3 space-y-2 border-t pt-3">
        <div className="flex items-center justify-between text-sm">
          <span className="text-neutral-500">Subtotal</span>
          <span className="whitespace-nowrap font-semibold tabular-nums">{rupiah(total)}</span>
        </div>
        {tip > 0 && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-neutral-500">
              Tip ({barbers.find((b) => b.id === tipBarberId)?.nickname ?? '-'})
            </span>
            <span className="whitespace-nowrap font-semibold tabular-nums text-amber-800">{rupiah(tip)}</span>
          </div>
        )}
        <div className="flex items-center justify-between text-base font-bold">
          <span>Total</span>
          <span className="whitespace-nowrap tabular-nums text-emerald-800">{rupiah(grandTotal)}</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant={paymentMethod === 'CASH' ? 'default' : 'outline'}
            onClick={() => setPaymentMethod('CASH')}
            className="min-h-[44px] bg-emerald-600 text-white hover:bg-emerald-700 data-[variant=outline]:text-neutral-700"
          >
            <Banknote className="h-4 w-4" /> Tunai
          </Button>
          <Button
            variant={paymentMethod === 'QRIS' ? 'default' : 'outline'}
            onClick={() => setPaymentMethod('QRIS')}
            className="min-h-[44px] data-[state=active]:bg-emerald-600"
          >
            <QrCode className="h-4 w-4" /> QRIS
          </Button>
        </div>
        {paymentMethod === 'CASH' && (
          <div className="space-y-1.5">
            <Input
              inputMode="numeric"
              placeholder="Uang diterima (opsional)"
              value={cashReceived}
              onChange={(e) => setCashReceived(e.target.value.replace(/\D/g, ''))}
              className="h-11"
              aria-label="Uang diterima"
            />
            {cashReceived && (
              <p
                className={cn(
                  'whitespace-nowrap text-sm font-semibold tabular-nums',
                  kembalian >= 0 ? 'text-emerald-700' : 'text-red-600'
                )}
              >
                {kembalian >= 0 ? `Kembalian: ${rupiah(kembalian)}` : 'Kurang bayar'}
              </p>
            )}
          </div>
        )}
        <Button
          variant="outline"
          className="w-full min-h-[44px] border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100"
          onClick={() => {
            if (!tipBarberId && groups.some((g) => g.barberId)) setTipBarberId(groups.find((g) => g.barberId)!.barberId!)
            setTipOpen(true)
          }}
        >
          <HandCoins className="h-4 w-4" /> Tip {tip > 0 ? `(${rupiah(tip)})` : ''}
        </Button>
        <Button
          onClick={submit}
          disabled={saving}
          className="w-full min-h-[48px] bg-emerald-600 text-base font-semibold text-white hover:bg-emerald-700"
        >
          {saving ? 'Menyimpan...' : `Simpan & Bayar ${rupiah(grandTotal)}`}
        </Button>
      </div>
    </div>
  )

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
      {/* Left: kepala & catalog */}
      <div className="space-y-4 pb-16 lg:pb-0">
        {/* Kepala tabs — horizontal scroll on mobile */}
        <div className="no-scrollbar -mx-4 flex items-center gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
          {groups.map((g, i) => (
            <button
              key={g.kepalaGroup}
              onClick={() => setActiveGroup(i)}
              className={cn(
                'flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold transition-colors',
                i === activeGroup
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'border border-neutral-300 bg-white text-neutral-700 hover:bg-emerald-50'
              )}
            >
              <UserRound className="h-4 w-4" />
              Kepala {g.kepalaGroup}
              {g.items.length > 0 && (
                <span
                  className={cn(
                    'rounded-full px-1.5 text-xs',
                    i === activeGroup ? 'bg-white/25' : 'bg-emerald-100 text-emerald-800'
                  )}
                >
                  {g.items.length}
                </span>
              )}
            </button>
          ))}
          <Button
            variant="outline"
            onClick={addKepala}
            className="min-h-[44px] shrink-0 rounded-full border-dashed border-emerald-400 text-emerald-800 hover:bg-emerald-50"
          >
            <Plus className="h-4 w-4" /> Kepala
          </Button>
        </div>

        {/* Active kepala card */}
        <Card className="border-emerald-100">
          <CardHeader className="pb-3">
            <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
              <span>Pelanggan Kepala {active?.kepalaGroup}</span>
              <div className="flex min-w-0 flex-1 items-center justify-between gap-2 sm:flex-none">
                <Input
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Nama pelanggan (opsional)"
                  className="h-9 w-full sm:w-44"
                  aria-label="Nama pelanggan"
                />
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label="Bersihkan kepala aktif"
                  className="h-9 min-h-[44px] shrink-0 text-red-600 sm:min-h-0"
                  onClick={clearActive}
                >
                  <Trash2 className="h-4 w-4" /> <span className="hidden sm:inline">Bersihkan</span>
                </Button>
              </div>
            </CardTitle>
            <div className="flex flex-wrap gap-2 pt-1">
              {barbers.map((b) => (
                <button
                  key={b.id}
                  onClick={() => setGroupBarber(activeGroup, b.id)}
                  className={cn(
                    'min-h-[40px] rounded-lg border px-3 text-sm font-medium transition-colors',
                    active?.barberId === b.id
                      ? 'border-emerald-700 bg-emerald-600 text-white shadow-sm'
                      : 'border-neutral-200 bg-white text-neutral-700 hover:bg-emerald-50'
                  )}
                >
                  <span className="font-bold">{b.nickname}</span>
                  <span className="ml-1 text-xs opacity-70">{b.tierName ?? ''}</span>
                </button>
              ))}
            </div>
          </CardHeader>
          <CardContent>
            {/* Service grid */}
            {!active?.barberId && (
              <p className="mb-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900">
                Pilih kapster dulu di atas sebelum menambah layanan.
              </p>
            )}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
              {services.map((s) => (
                <button
                  key={s.id}
                  onClick={() => addItem('SERVICE', s.id, s.name, s.price)}
                  disabled={!active?.barberId}
                  className="group flex min-h-[76px] flex-col justify-between rounded-xl border border-emerald-100 bg-emerald-50/60 px-3 py-2 text-left transition-colors hover:border-emerald-500 hover:bg-emerald-100 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <span className="text-sm font-semibold leading-tight text-emerald-950">{s.name}</span>
                  <span className="text-xs font-bold text-emerald-700">{rupiah(s.price)}</span>
                </button>
              ))}
            </div>

            {/* Products collapsible */}
            <Collapsible>
              <CollapsibleTrigger className="mt-3 flex min-h-[44px] w-full items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-900 hover:bg-amber-100">
                <span className="flex items-center gap-2">
                  <Package className="h-4 w-4" /> Produk (kosmetik & minuman)
                </span>
                <ChevronDown className="h-4 w-4" />
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
                  {products.map((p) => (
                    <button
                      key={p.id}
                      disabled={p.stock <= 0 || !active?.barberId}
                      onClick={() => addItem('PRODUCT', p.id, p.name, p.price)}
                      className={cn(
                        'flex min-h-[64px] flex-col justify-between rounded-xl border px-3 py-2 text-left transition-colors active:scale-[0.98]',
                        p.stock <= 0 || !active?.barberId
                          ? 'cursor-not-allowed border-neutral-200 bg-neutral-100 text-neutral-400'
                          : 'border-amber-200 bg-white hover:border-amber-500 hover:bg-amber-50'
                      )}
                    >
                      <span className="text-sm font-semibold leading-tight">{p.name}</span>
                      <span
                        className={cn(
                          'text-xs font-bold',
                          p.stock <= p.minStock ? 'text-red-600' : 'text-amber-800'
                        )}
                      >
                        {rupiah(p.price)} &middot; stok {p.stock}
                      </span>
                    </button>
                  ))}
                </div>
              </CollapsibleContent>
            </Collapsible>
          </CardContent>
        </Card>
      </div>

      {/* Right: running receipt — sticky desktop */}
      <aside className="hidden lg:block">
        <Card className="sticky top-20 p-0">
          <CardContent className="p-4">{receiptPanel}</CardContent>
        </Card>
      </aside>

      {/* Mobile: bottom trigger — di atas tab bar + safe area */}
      <Sheet open={mobileSheetOpen} onOpenChange={setMobileSheetOpen}>
        <SheetTrigger asChild>
          <Button
            className="fixed inset-x-4 z-20 min-h-[52px] bg-emerald-600 text-base font-semibold text-white shadow-lg hover:bg-emerald-700 lg:hidden"
            style={{ bottom: 'calc(3.5rem + env(safe-area-inset-bottom) + 0.5rem)' }}
          >
            <ReceiptText className="h-5 w-5 shrink-0" />
            <span className="whitespace-nowrap tabular-nums">Struk &middot; {rupiah(grandTotal)}</span>
          </Button>
        </SheetTrigger>
        <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-2xl">
          <SheetHeader>
            <SheetTitle>Struk Berjalan</SheetTitle>
          </SheetHeader>
          {receiptPanel}
        </SheetContent>
      </Sheet>

      {/* Tip dialog */}
      <Dialog open={tipOpen} onOpenChange={setTipOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <HandCoins className="h-5 w-5 text-amber-700" /> Tip untuk Kapster
            </DialogTitle>
            <DialogDescription>
              Tip 100% untuk kapster. Bisa digabung pembayaran atau tunai terpisah.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Kapster penerima tip</Label>
              <Select value={tipBarberId} onValueChange={setTipBarberId}>
                <SelectTrigger className="h-11">
                  <SelectValue placeholder="Pilih kapster" />
                </SelectTrigger>
                <SelectContent>
                  {barbers.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name} ({b.nickname})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Nominal tip</Label>
              <Input
                inputMode="numeric"
                value={tipAmount}
                onChange={(e) => setTipAmount(e.target.value.replace(/\D/g, ''))}
                placeholder="cth: 20000"
                className="h-11"
              />
              <div className="flex gap-2">
                {[10000, 20000, 50000].map((v) => (
                  <Button
                    key={v}
                    variant="outline"
                    size="sm"
                    className="min-h-[36px] flex-1"
                    onClick={() => setTipAmount(String(v))}
                  >
                    {rupiah(v)}
                  </Button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Metode tip</Label>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant={tipMethod === 'CASH' ? 'default' : 'outline'}
                  onClick={() => setTipMethod('CASH')}
                  className="min-h-[44px] data-[state=active]:bg-emerald-600"
                >
                  <Banknote className="h-4 w-4" /> Tunai
                </Button>
                <Button
                  variant={tipMethod === 'QRIS' ? 'default' : 'outline'}
                  onClick={() => setTipMethod('QRIS')}
                  className="min-h-[44px]"
                >
                  <QrCode className="h-4 w-4" /> QRIS
                </Button>
              </div>
              <p className="text-xs text-neutral-500">
                Tip tunai dicatat sebagai UNCLAIMED (uang di kasir) sampai kapster mengambilnya.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              className="min-h-[44px]"
              onClick={() => {
                setTipAmount('')
                setTipOpen(false)
              }}
            >
              Hapus Tip
            </Button>
            <Button
              className="min-h-[44px] bg-emerald-600 text-white hover:bg-emerald-700"
              onClick={() => {
                if (tip > 0 && !tipBarberId) {
                  toast({
                    title: 'Pilih kapster penerima tip',
                    variant: 'destructive',
                  })
                  return
                }
                setTipOpen(false)
              }}
            >
              Simpan Tip
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Receipt success modal */}
      <Dialog open={!!receipt} onOpenChange={(open) => !open && setReceipt(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-emerald-800">
              <CheckCircle2 className="h-5 w-5" /> Transaksi Berhasil
            </DialogTitle>
            <DialogDescription>
              {receipt?.invoiceNo} &middot; {receipt?.paymentMethod === 'CASH' ? 'Tunai' : 'QRIS'}
            </DialogDescription>
          </DialogHeader>
          {receipt && (
            <div className="max-h-72 space-y-2 overflow-y-auto rounded-lg border bg-neutral-50 p-3 text-sm">
              {receipt.customerName && (
                <p className="font-semibold">Pelanggan: {receipt.customerName}</p>
              )}
              {[...new Set(receipt.items.map((i) => i.kepalaGroup))].sort().map((kg) => (
                <div key={kg}>
                  <p className="text-xs font-bold text-neutral-500">
                    Kepala {kg} &middot; {barberLabel(receipt.items.find((i) => i.kepalaGroup === kg)?.barberId ?? null)}
                  </p>
                  {receipt.items
                    .filter((i) => i.kepalaGroup === kg)
                    .map((i, idx) => (
                      <p key={idx} className="flex justify-between">
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
                  <span>{rupiah(receipt.total)}</span>
                </p>
                {receipt.tipAmount > 0 && (
                  <p className="flex justify-between text-amber-800">
                    <span>Tip</span>
                    <span>{rupiah(receipt.tipAmount)}</span>
                  </p>
                )}
                <p className="flex justify-between text-emerald-800">
                  <span>Grand Total</span>
                  <span>{rupiah(receipt.total + receipt.tipAmount)}</span>
                </p>
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button
              className="min-h-[44px] w-full bg-emerald-600 text-white hover:bg-emerald-700"
              onClick={() => {
                setReceipt(null)
                onDone?.()
              }}
            >
              <CheckCircle2 className="h-4 w-4" /> Selesai
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
