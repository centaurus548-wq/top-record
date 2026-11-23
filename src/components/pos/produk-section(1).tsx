'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
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
import { Package, PackagePlus, Edit3, Boxes, Trash2, AlertTriangle } from 'lucide-react'
import { api, rupiah, type SessionUser } from '@/lib/client'
import { toast } from '@/hooks/use-toast'

type ProdukData = {
  products: {
    id: string
    name: string
    price: number
    costPrice: number | null
    stock: number
    minStock: number
    active: boolean
    category: { id: string; name: string }
  }[]
  categories: { id: string; name: string }[]
}

export function ProdukSection({ user: _user }: { user: SessionUser }) {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ['produk'],
    queryFn: () => api<ProdukData>('/api/produk'),
  })

  const [addOpen, setAddOpen] = useState(false)
  const [name, setName] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [price, setPrice] = useState('')
  const [stock, setStock] = useState('10')
  const [minStock, setMinStock] = useState('5')
  const [saving, setSaving] = useState(false)

  const [adjustTarget, setAdjustTarget] = useState<ProdukData['products'][number] | null>(null)
  const [delta, setDelta] = useState('')
  const [reason, setReason] = useState('')

  const [editTarget, setEditTarget] = useState<ProdukData['products'][number] | null>(null)
  const [editPrice, setEditPrice] = useState('')
  const [editName, setEditName] = useState('')
  const [editCategoryId, setEditCategoryId] = useState('')
  const [editStock, setEditStock] = useState('')
  const [editCostPrice, setEditCostPrice] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<ProdukData['products'][number] | null>(null)
  const [deleting, setDeleting] = useState(false)

  const resetAdd = () => {
    setName('')
    setCategoryId('')
    setPrice('')
    setStock('10')
    setMinStock('5')
  }

  const createProduct = async () => {
    setSaving(true)
    try {
      await api('/api/produk', {
        method: 'POST',
        body: JSON.stringify({
          name,
          categoryId,
          price: parseInt(price, 10) || 0,
          stock: parseInt(stock, 10) || 0,
          minStock: parseInt(minStock, 10) || 0,
        }),
      })
      toast({ title: 'Produk dibuat', description: name })
      resetAdd()
      setAddOpen(false)
      qc.invalidateQueries({ queryKey: ['produk'] })
      qc.invalidateQueries({ queryKey: ['catalog'] })
    } catch (err) {
      toast({
        title: 'Gagal membuat produk',
        description: err instanceof Error ? err.message : 'Terjadi kesalahan',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  const submitAdjust = async () => {
    if (!adjustTarget) return
    const d = parseInt(delta, 10) || 0
    if (!d || !reason.trim()) {
      toast({ title: 'Delta dan alasan wajib diisi', variant: 'destructive' })
      return
    }
    setSaving(true)
    try {
      await api('/api/produk/adjust', {
        method: 'POST',
        body: JSON.stringify({ productId: adjustTarget.id, delta: d, reason }),
      })
      toast({ title: 'Stok disesuaikan', description: `${adjustTarget.name}: ${d > 0 ? '+' : ''}${d}` })
      setAdjustTarget(null)
      setDelta('')
      setReason('')
      qc.invalidateQueries({ queryKey: ['produk'] })
      qc.invalidateQueries({ queryKey: ['catalog'] })
    } catch (err) {
      toast({
        title: 'Gagal menyesuaikan stok',
        description: err instanceof Error ? err.message : 'Terjadi kesalahan',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  const submitEdit = async () => {
    if (!editTarget) return
    setSaving(true)
    try {
      await api('/api/produk', {
        method: 'PUT',
        body: JSON.stringify({
          id: editTarget.id,
          name: editName,
          price: parseInt(editPrice, 10) || editTarget.price,
          categoryId: editCategoryId || editTarget.category?.id,
          stock: parseInt(editStock, 10) || 0,
          costPrice: editCostPrice === '' ? null : parseInt(editCostPrice, 10) || 0,
        }),
      })
      toast({ title: 'Produk diperbarui', description: editName })
      setEditTarget(null)
      qc.invalidateQueries({ queryKey: ['produk'] })
      qc.invalidateQueries({ queryKey: ['catalog'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
    } catch (err) {
      toast({
        title: 'Gagal memperbarui produk',
        description: err instanceof Error ? err.message : 'Terjadi kesalahan',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  const submitDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      const res = await api<{ softDeleted?: boolean }>(`/api/produk?id=${deleteTarget.id}`, {
        method: 'DELETE',
      })
      toast({
        title: res?.softDeleted ? 'Produk dinonaktifkan' : 'Produk dihapus',
        description: res?.softDeleted
          ? `${deleteTarget.name} disembunyikan dari kasir; riwayat transaksi tetap aman.`
          : `${deleteTarget.name} dihapus (tanpa riwayat).`,
      })
      setDeleteTarget(null)
      qc.invalidateQueries({ queryKey: ['produk'] })
      qc.invalidateQueries({ queryKey: ['catalog'] })
    } catch (err) {
      toast({
        title: 'Gagal menghapus produk',
        description: err instanceof Error ? err.message : 'Terjadi kesalahan',
        variant: 'destructive',
      })
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm text-neutral-600">
          <Boxes className="h-4 w-4 text-emerald-700" />
          Menu khusus Owner: kelola produk, harga, dan stok (Restock).
        </p>
        <Button
          onClick={() => setAddOpen(true)}
          className="min-h-[44px] bg-emerald-600 text-white hover:bg-emerald-700"
        >
          <PackagePlus className="h-4 w-4" /> Produk Baru
        </Button>
      </div>

      {isLoading && <p className="text-sm text-neutral-400">Memuat...</p>}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {(data?.products ?? []).map((p) => (
          <Card key={p.id} className={p.stock <= p.minStock ? 'border-red-300' : ''}>
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <CardTitle className="text-base">{p.name}</CardTitle>
                  <CardDescription>
                    {p.category?.name} &middot; {rupiah(p.price)}
                  </CardDescription>
                </div>
                <Badge
                  variant="outline"
                  className={
                    p.stock <= p.minStock
                      ? 'border-red-300 bg-red-50 text-red-700'
                      : 'border-emerald-300 bg-emerald-50 text-emerald-800'
                  }
                >
                  Stok {p.stock}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="min-h-[40px] flex-1"
                onClick={() => {
                  setAdjustTarget(p)
                  setDelta('')
                  setReason('')
                }}
              >
                <Package className="h-4 w-4" /> Sesuaikan Stok
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="min-h-[40px] flex-1"
                onClick={() => {
                  setEditTarget(p)
                  setEditName(p.name)
                  setEditPrice(String(p.price))
                  setEditCategoryId(p.category?.id ?? '')
                  setEditStock(String(p.stock))
                  setEditCostPrice(p.costPrice === null || p.costPrice === undefined ? '' : String(p.costPrice))
                }}
              >
                <Edit3 className="h-4 w-4" /> Edit
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Add dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Produk Baru</DialogTitle>
            <DialogDescription>Produk untuk dijual di POS.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Nama</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} className="h-11" />
            </div>
            <div className="space-y-1.5">
              <Label>Kategori</Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger className="h-11">
                  <SelectValue placeholder="Pilih kategori" />
                </SelectTrigger>
                <SelectContent>
                  {(data?.categories ?? []).map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1.5">
                <Label>Harga</Label>
                <Input inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value.replace(/\D/g, ''))} className="h-11" />
              </div>
              <div className="space-y-1.5">
                <Label>Stok</Label>
                <Input inputMode="numeric" value={stock} onChange={(e) => setStock(e.target.value.replace(/\D/g, ''))} className="h-11" />
              </div>
              <div className="space-y-1.5">
                <Label>Min</Label>
                <Input inputMode="numeric" value={minStock} onChange={(e) => setMinStock(e.target.value.replace(/\D/g, ''))} className="h-11" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="min-h-[44px]" onClick={() => setAddOpen(false)}>
              Batal
            </Button>
            <Button
              onClick={createProduct}
              disabled={!name || !categoryId || saving}
              className="min-h-[44px] bg-emerald-600 text-white hover:bg-emerald-700"
            >
              Simpan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Adjust dialog */}
      <Dialog open={!!adjustTarget} onOpenChange={(o) => !o && setAdjustTarget(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Sesuaikan Stok</DialogTitle>
            <DialogDescription>
              {adjustTarget?.name} — stok saat ini {adjustTarget?.stock}. Alasan wajib diisi.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Delta (boleh minus)</Label>
              <Input
                inputMode="numeric"
                value={delta}
                onChange={(e) => setDelta(e.target.value.replace(/[^-\d]/g, ''))}
                placeholder="cth: 12 atau -3"
                className="h-11"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Alasan</Label>
              <Input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="cth: restock supplier, rusak"
                className="h-11"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="min-h-[44px]" onClick={() => setAdjustTarget(null)}>
              Batal
            </Button>
            <Button
              onClick={submitAdjust}
              disabled={saving || !reason.trim()}
              className="min-h-[44px] bg-emerald-600 text-white hover:bg-emerald-700"
            >
              Simpan Penyesuaian
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={!!editTarget} onOpenChange={(o) => !o && setEditTarget(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Edit Produk</DialogTitle>
            <DialogDescription>
              Semua perubahan langsung tersimpan. Perubahan stok tercatat sebagai penyesuaian otomatis.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Nama</Label>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="h-11" />
            </div>
            <div className="space-y-1.5">
              <Label>Kategori</Label>
              <Select value={editCategoryId} onValueChange={setEditCategoryId}>
                <SelectTrigger className="h-11">
                  <SelectValue placeholder="Pilih kategori" />
                </SelectTrigger>
                <SelectContent>
                  {(data?.categories ?? []).map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label>Harga Jual</Label>
                <Input
                  inputMode="numeric"
                  value={editPrice}
                  onChange={(e) => setEditPrice(e.target.value.replace(/\D/g, ''))}
                  className="h-11"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Stok</Label>
                <Input
                  inputMode="numeric"
                  value={editStock}
                  onChange={(e) => setEditStock(e.target.value.replace(/\D/g, ''))}
                  className="h-11"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Harga Modal</Label>
                <Input
                  inputMode="numeric"
                  value={editCostPrice}
                  onChange={(e) => setEditCostPrice(e.target.value.replace(/\D/g, ''))}
                  placeholder="opsional"
                  className="h-11"
                />
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              disabled={deleting}
              className="min-h-[44px] text-red-600 hover:bg-red-50"
              onClick={() => {
                setDeleteTarget(editTarget)
              }}
            >
              <Trash2 className="h-4 w-4" /> Hapus
            </Button>
            <Button
              onClick={submitEdit}
              disabled={saving}
              className="min-h-[44px] bg-emerald-600 text-white hover:bg-emerald-700"
            >
              Simpan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete product confirm */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-700">
              <AlertTriangle className="h-5 w-5" /> Hapus Produk?
            </DialogTitle>
            <DialogDescription>
              {deleteTarget?.name} akan disembunyikan dari semua daftar dan kasir. Riwayat transaksi lama
              tetap aman (nama produk tersimpan di setiap transaksi).
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" className="min-h-[44px]" onClick={() => setDeleteTarget(null)}>
              Batal
            </Button>
            <Button variant="destructive" disabled={deleting} className="min-h-[44px]" onClick={submitDelete}>
              {deleting ? 'Memproses...' : 'Ya, Hapus'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
