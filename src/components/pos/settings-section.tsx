'use client'

import { useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
  Scissors,
  Store,
  Calculator,
  Users,
  Building2,
  Wallet,
  ScrollText,
  Plus,
  Trash2,
  Save,
} from 'lucide-react'
import { api, rupiah, type SessionUser } from '@/lib/client'
import { cn } from '@/lib/utils'
import { toast } from '@/hooks/use-toast'
import { ProdukSection } from '@/components/pos/produk-section'
import { KomisiRulesEditor } from '@/components/pos/kapster-section'

const SETTING_LABELS: { key: string; label: string; hint?: string; numeric?: boolean }[] = [
  { key: 'shopName', label: 'Nama Toko' },
  { key: 'shiftStart', label: 'Jam Shift Mulai', hint: 'Format HH:mm, cth 09:00' },
  { key: 'shiftEnd', label: 'Jam Shift Selesai', hint: 'Format HH:mm, cth 21:00' },
  { key: 'hourlyRate', label: 'Tarif per Jam (Rp)', numeric: true, hint: 'Untuk gaji kehadiran harian' },
  { key: 'lateToleranceMin', label: 'Toleransi Telat (menit)', numeric: true, hint: 'Telat lewat toleransi 15 menit = potong 1 jam; tiap jam berikutnya ada toleransi baru 15 menit, melewatinya menambah potongan 1 jam' },
  { key: 'defaultOpeningCash', label: 'Modal Awal Default (Rp)', numeric: true },
]

export function SettingsSection({ user }: { user: SessionUser }) {
  return (
    <Tabs defaultValue="layanan" className="space-y-4">
      <TabsList className="h-auto flex-wrap justify-start gap-1">
        <TabsTrigger value="layanan" className="gap-1.5 data-[state=active]:bg-emerald-600 data-[state=active]:text-white">
          <Scissors className="h-4 w-4" /> Layanan
        </TabsTrigger>
        <TabsTrigger value="produk" className="gap-1.5 data-[state=active]:bg-emerald-600 data-[state=active]:text-white">
          <Store className="h-4 w-4" /> Produk
        </TabsTrigger>
        <TabsTrigger value="komisi" className="gap-1.5 data-[state=active]:bg-emerald-600 data-[state=active]:text-white">
          <Calculator className="h-4 w-4" /> Komisi
        </TabsTrigger>
        <TabsTrigger value="pengguna" className="gap-1.5 data-[state=active]:bg-emerald-600 data-[state=active]:text-white">
          <Users className="h-4 w-4" /> Pengguna
        </TabsTrigger>
        <TabsTrigger value="toko" className="gap-1.5 data-[state=active]:bg-emerald-600 data-[state=active]:text-white">
          <Building2 className="h-4 w-4" /> Toko
        </TabsTrigger>
        <TabsTrigger value="kategorieks" className="gap-1.5 data-[state=active]:bg-emerald-600 data-[state=active]:text-white">
          <Wallet className="h-4 w-4" /> Kategori Pengeluaran
        </TabsTrigger>
        <TabsTrigger value="audit" className="gap-1.5 data-[state=active]:bg-emerald-600 data-[state=active]:text-white">
          <ScrollText className="h-4 w-4" /> Audit Log
        </TabsTrigger>
      </TabsList>

      <TabsContent value="layanan"><LayananTab /></TabsContent>
      <TabsContent value="produk"><ProdukSection user={user} /></TabsContent>
      <TabsContent value="komisi"><KomisiTab /></TabsContent>
      <TabsContent value="pengguna"><PenggunaTab currentUserId={user.id} /></TabsContent>
      <TabsContent value="toko"><TokoTab /></TabsContent>
      <TabsContent value="kategorieks"><KategoriPengeluaranTab /></TabsContent>
      <TabsContent value="audit"><AuditTab /></TabsContent>
    </Tabs>
  )
}

// ================= LAYANAN TAB =================

type ServiceItem = {
  id: string
  name: string
  price: number
  durationMin: number
  active: boolean
  sortOrder: number
}

function LayananTab() {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ['service-items'],
    queryFn: () => api<{ services: ServiceItem[] }>('/api/service-items'),
  })
  const [addOpen, setAddOpen] = useState(false)
  const [name, setName] = useState('')
  const [price, setPrice] = useState('')
  const [duration, setDuration] = useState('60')
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState<ServiceItem | null>(null)
  const [editName, setEditName] = useState('')
  const [editPrice, setEditPrice] = useState('')
  const [editDuration, setEditDuration] = useState('')

  const create = async () => {
    setSaving(true)
    try {
      await api('/api/service-items', {
        method: 'POST',
        body: JSON.stringify({ name, price: parseInt(price, 10) || 0, durationMin: parseInt(duration, 10) || 60 }),
      })
      toast({ title: 'Layanan dibuat', description: name })
      setAddOpen(false)
      setName('')
      setPrice('')
      qc.invalidateQueries({ queryKey: ['service-items'] })
      qc.invalidateQueries({ queryKey: ['catalog'] })
    } catch (err) {
      toast({ title: 'Gagal', description: err instanceof Error ? err.message : '', variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  const update = async () => {
    if (!editing) return
    setSaving(true)
    try {
      await api('/api/service-items', {
        method: 'PUT',
        body: JSON.stringify({
          id: editing.id,
          name: editName,
          price: parseInt(editPrice, 10) || editing.price,
          durationMin: parseInt(editDuration, 10) || editing.durationMin,
        }),
      })
      toast({ title: 'Layanan diperbarui', description: 'Transaksi lama tetap memakai harga snapshot.' })
      setEditing(null)
      qc.invalidateQueries({ queryKey: ['service-items'] })
      qc.invalidateQueries({ queryKey: ['catalog'] })
    } catch (err) {
      toast({ title: 'Gagal', description: err instanceof Error ? err.message : '', variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  const toggleActive = async (s: ServiceItem) => {
    try {
      await api('/api/service-items', {
        method: 'PUT',
        body: JSON.stringify({ id: s.id, active: !s.active }),
      })
      qc.invalidateQueries({ queryKey: ['service-items'] })
      qc.invalidateQueries({ queryKey: ['catalog'] })
    } catch (err) {
      toast({ title: 'Gagal', description: err instanceof Error ? err.message : '', variant: 'destructive' })
    }
  }

  const remove = async (s: ServiceItem) => {
    try {
      const res = await api<{ deactivated?: boolean }>(`/api/service-items?id=${s.id}`, { method: 'DELETE' })
      toast({
        title: res?.deactivated ? 'Layanan dinonaktifkan' : 'Layanan dihapus',
        description: res?.deactivated ? `${s.name} dipakai di transaksi lama sehingga hanya dinonaktifkan.` : s.name,
      })
      qc.invalidateQueries({ queryKey: ['service-items'] })
      qc.invalidateQueries({ queryKey: ['catalog'] })
    } catch (err) {
      toast({ title: 'Gagal', description: err instanceof Error ? err.message : '', variant: 'destructive' })
    }
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="text-base">Daftar Layanan</CardTitle>
            <CardDescription>
              Perubahan harga hanya berlaku untuk transaksi baru &mdash; transaksi lama tetap memakai harga saat
              dibuat (snapshot).
            </CardDescription>
          </div>
          <Button onClick={() => setAddOpen(true)} className="min-h-[44px] bg-emerald-600 text-white hover:bg-emerald-700">
            <Plus className="h-4 w-4" /> Layanan Baru
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading && <p className="px-4 py-4 text-sm text-neutral-400">Memuat...</p>}
        <ul className="max-h-[480px] divide-y overflow-y-auto">
          {(data?.services ?? []).map((s) => (
            <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
              <div className="min-w-0">
                <p className="flex items-center gap-2 font-medium text-neutral-900">
                  {s.name}
                  {!s.active && (
                    <Badge variant="outline" className="border-stone-300 text-stone-500">
                      nonaktif
                    </Badge>
                  )}
                </p>
                <p className="text-xs text-neutral-500">
                  {rupiah(s.price)} &middot; {s.durationMin} menit
                </p>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-neutral-500">Aktif</span>
                  <Switch checked={s.active} onCheckedChange={() => toggleActive(s)} aria-label={`Aktifkan ${s.name}`} />
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="min-h-[40px]"
                  onClick={() => {
                    setEditing(s)
                    setEditName(s.name)
                    setEditPrice(String(s.price))
                    setEditDuration(String(s.durationMin))
                  }}
                >
                  Edit
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="min-h-[40px] text-red-600 hover:bg-red-50"
                  onClick={() => remove(s)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </CardContent>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Layanan Baru</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Nama layanan</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} className="h-11" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label>Harga (Rp)</Label>
                <Input inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value.replace(/\D/g, ''))} className="h-11" />
              </div>
              <div className="space-y-1.5">
                <Label>Durasi (menit)</Label>
                <Input inputMode="numeric" value={duration} onChange={(e) => setDuration(e.target.value.replace(/\D/g, ''))} className="h-11" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="min-h-[44px]" onClick={() => setAddOpen(false)}>
              Batal
            </Button>
            <Button onClick={create} disabled={!name || saving} className="min-h-[44px] bg-emerald-600 text-white hover:bg-emerald-700">
              Simpan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Edit Layanan</DialogTitle>
            <DialogDescription>
              Harga lama di transaksi lama tidak berubah (snapshot).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Nama</Label>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="h-11" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label>Harga (Rp)</Label>
                <Input inputMode="numeric" value={editPrice} onChange={(e) => setEditPrice(e.target.value.replace(/\D/g, ''))} className="h-11" />
              </div>
              <div className="space-y-1.5">
                <Label>Durasi (menit)</Label>
                <Input inputMode="numeric" value={editDuration} onChange={(e) => setEditDuration(e.target.value.replace(/\D/g, ''))} className="h-11" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="min-h-[44px]" onClick={() => setEditing(null)}>
              Batal
            </Button>
            <Button onClick={update} disabled={saving} className="min-h-[44px] bg-emerald-600 text-white hover:bg-emerald-700">
              <Save className="h-4 w-4" /> Simpan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}

// ================= KOMISI TAB =================

type ProductCategory = {
  id: string
  name: string
  isBarberService: boolean
  commissionRatePct: number
  commissionEnabled: boolean
}

function KomisiTab() {
  const qc = useQueryClient()
  const { data } = useQuery({
    queryKey: ['product-categories'],
    queryFn: () => api<{ categories: ProductCategory[] }>('/api/product-categories'),
  })
  const [savingId, setSavingId] = useState<string | null>(null)

  const updateCat = async (cat: ProductCategory, rate: number, enabled: boolean) => {
    setSavingId(cat.id)
    try {
      await api('/api/product-categories', {
        method: 'PUT',
        body: JSON.stringify({ id: cat.id, commissionRatePct: rate, commissionEnabled: enabled }),
      })
      toast({ title: 'Komisi kategori produk disimpan', description: `${cat.name}: ${rate}%` })
      qc.invalidateQueries({ queryKey: ['product-categories'] })
    } catch (err) {
      toast({ title: 'Gagal', description: err instanceof Error ? err.message : '', variant: 'destructive' })
    } finally {
      setSavingId(null)
    }
  }

  return (
    <div className="space-y-4">
      <Card className="border-amber-200 bg-amber-50/50">
        <CardContent className="p-4 text-sm text-amber-900">
          <p className="font-semibold">Cara kerja komisi:</p>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-xs leading-relaxed">
            <li>
              Komisi aktif untuk kapster pada hari tertentu setelah mencapai <strong>threshold kepala</strong>
              {' '}(default 5 kepala). Setelah aktif, rate berlaku <strong>retroaktif ke semua omzet layanan hari
              itu</strong> (bukan hanya setelah threshold).
            </li>
            <li>1 kepala = 1 pelanggan. Haircut + shaving kapster yang sama pada kepala yang sama = tetap 1 kepala.
              Ayah + anak (2 kepala) kapster yang sama = 2 kepala.</li>
            <li>Tip 100% untuk kapster (bukan komisi), tercatat terpisah.</li>
            <li>Prioritas aturan: Override kapster &gt; aturan kapster &gt; aturan tier &gt; aturan default.</li>
            <li>Komisi produk: rate per kategori produk di bawah, berlaku hanya untuk item produk yang punya
              kapster penanggung jawab.</li>
          </ul>
        </CardContent>
      </Card>

      <KomisiRulesEditor />

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Komisi per Kategori Produk</CardTitle>
          <CardDescription>
            Aktifkan dan atur rate (%) untuk item produk yang dijual dengan kapster tertentu. Default 0%.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {(data?.categories ?? [])
            .filter((c) => !c.isBarberService)
            .map((c) => (
              <CategoryRateRow key={c.id} category={c} saving={savingId === c.id} onSave={updateCat} />
            ))}
        </CardContent>
      </Card>
    </div>
  )
}

function CategoryRateRow({
  category,
  saving,
  onSave,
}: {
  category: ProductCategory
  saving: boolean
  onSave: (cat: ProductCategory, rate: number, enabled: boolean) => Promise<void>
}) {
  const [enabled, setEnabled] = useState(category.commissionEnabled)
  const [rate, setRate] = useState(String(category.commissionRatePct))

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2">
      <div className="flex items-center gap-2">
        <span className="font-medium text-neutral-800">{category.name}</span>
        <Switch checked={enabled} onCheckedChange={setEnabled} aria-label={`Komisi ${category.name}`} />
      </div>
      <div className="flex items-center gap-2">
        <Input
          inputMode="numeric"
          value={rate}
          onChange={(e) => setRate(e.target.value.replace(/\D/g, ''))}
          className="h-10 w-20"
          aria-label={`Rate komisi ${category.name}`}
        />
        <span className="text-sm text-neutral-500">%</span>
        <Button
          size="sm"
          variant="outline"
          disabled={saving}
          className="min-h-[40px]"
          onClick={() => onSave(category, parseInt(rate, 10) || 0, enabled)}
        >
          Simpan
        </Button>
      </div>
    </div>
  )
}

// ================= PENGGUNA TAB =================

type UserRow = {
  id: string
  name: string
  username: string
  role: 'OWNER' | 'MANAGER' | 'KASIR' | 'KAPSTER'
  active: boolean
  barberId: string | null
  barberName: string | null
}

function PenggunaTab({ currentUserId }: { currentUserId: string }) {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: () => api<{ users: UserRow[]; barbers: { id: string; name: string }[] }>('/api/users'),
  })
  const [addOpen, setAddOpen] = useState(false)
  const [name, setName] = useState('')
  const [username, setUsername] = useState('')
  const [pin, setPin] = useState('')
  const [saving, setSaving] = useState(false)
  const [editTarget, setEditTarget] = useState<UserRow | null>(null)
  const [editName, setEditName] = useState('')
  const [editPin, setEditPin] = useState('')

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['users'] })
    qc.invalidateQueries({ queryKey: ['barbers'] })
  }

  const create = async () => {
    setSaving(true)
    try {
      await api('/api/users', {
        method: 'POST',
        // Revisi 8: semua akun baru langsung akses penuh (tanpa pilihan peran).
        body: JSON.stringify({ name, username, pin, role: 'OWNER' }),
      })
      toast({ title: 'Pengguna dibuat', description: `${name} (${username})` })
      setAddOpen(false)
      setName('')
      setUsername('')
      setPin('')
      invalidate()
    } catch (err) {
      toast({ title: 'Gagal', description: err instanceof Error ? err.message : '', variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  const update = async (id: string, body: Record<string, unknown>, msg: string) => {
    setSaving(true)
    try {
      await api('/api/users', { method: 'PUT', body: JSON.stringify({ id, ...body }) })
      toast({ title: msg })
      setEditTarget(null)
      setEditPin('')
      invalidate()
    } catch (err) {
      toast({ title: 'Gagal', description: err instanceof Error ? err.message : '', variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="text-base">Pengguna &amp; Akun PIN</CardTitle>
            <CardDescription>
              Semua pengguna login punya akses penuh. Akun sendiri tidak bisa dinonaktifkan. Reset
              PIN langsung aktif.
            </CardDescription>
          </div>
          <Button onClick={() => setAddOpen(true)} className="min-h-[44px] bg-emerald-600 text-white hover:bg-emerald-700">
            <Plus className="h-4 w-4" /> Pengguna Baru
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading && <p className="px-4 py-4 text-sm text-neutral-400">Memuat...</p>}
        <ul className="max-h-[480px] divide-y overflow-y-auto">
          {(data?.users ?? []).map((u) => (
            <li key={u.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
              <div className="min-w-0">
                <p className="flex items-center gap-2 font-medium text-neutral-900">
                  {u.name}
                  {!u.active && (
                    <Badge variant="outline" className="border-red-300 text-red-700">
                      nonaktif
                    </Badge>
                  )}
                </p>
                <p className="text-xs text-neutral-500">@{u.username}</p>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-neutral-500">Aktif</span>
                  <Switch
                    checked={u.active}
                    disabled={u.id === currentUserId}
                    onCheckedChange={(v) => update(u.id, { active: v }, v ? 'Pengguna diaktifkan' : 'Pengguna dinonaktifkan')}
                    aria-label={`Aktifkan ${u.name}`}
                  />
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="min-h-[40px]"
                  onClick={() => {
                    setEditTarget(u)
                    setEditName(u.name)
                    setEditPin('')
                  }}
                >
                  Edit
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </CardContent>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Pengguna Baru</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Nama</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} className="h-11" />
            </div>
            <div className="space-y-1.5">
              <Label>Username</Label>
              <Input value={username} onChange={(e) => setUsername(e.target.value)} className="h-11" />
            </div>
            <div className="space-y-1.5">
              <Label>PIN (4-6 digit)</Label>
              <Input inputMode="numeric" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))} className="h-11" />
            </div>
            <p className="text-xs text-neutral-500">
              Semua akun baru otomatis punya akses penuh ke semua fitur.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" className="min-h-[44px]" onClick={() => setAddOpen(false)}>
              Batal
            </Button>
            <Button
              onClick={create}
              disabled={!name || !username || pin.length < 4 || saving}
              className="min-h-[44px] bg-emerald-600 text-white hover:bg-emerald-700"
            >
              Simpan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editTarget} onOpenChange={(o) => !o && setEditTarget(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Edit Pengguna</DialogTitle>
            <DialogDescription>
              {editTarget?.username} — isi PIN baru untuk reset PIN (kosongkan bila tidak diubah).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Nama</Label>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="h-11" />
            </div>
            <div className="space-y-1.5">
              <Label>Reset PIN (opsional)</Label>
              <Input
                inputMode="numeric"
                value={editPin}
                onChange={(e) => setEditPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="kosong = tetap"
                className="h-11"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="min-h-[44px]" onClick={() => setEditTarget(null)}>
              Batal
            </Button>
            <Button
              onClick={() =>
                editTarget &&
                update(
                  editTarget.id,
                  {
                    name: editName,
                    ...(editPin ? { pin: editPin } : {}),
                  },
                  'Pengguna diperbarui'
                )
              }
              disabled={saving}
              className="min-h-[44px] bg-emerald-600 text-white hover:bg-emerald-700"
            >
              Simpan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}

// ================= TOKO TAB =================

function TokoTab() {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api<{ settings: Record<string, string> }>('/api/settings'),
  })
  const [values, setValues] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (data?.settings) {
      setValues(data.settings)
    }
  }, [data])

  const save = async () => {
    setSaving(true)
    try {
      await api('/api/settings', { method: 'PUT', body: JSON.stringify(values) })
      toast({ title: 'Pengaturan toko disimpan', description: 'Berlaku untuk perhitungan gaji & absensi berikutnya.' })
      qc.invalidateQueries({ queryKey: ['settings'] })
    } catch (err) {
      toast({ title: 'Gagal', description: err instanceof Error ? err.message : '', variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  if (isLoading) return <p className="text-sm text-neutral-400">Memuat...</p>

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Pengaturan Toko</CardTitle>
        <CardDescription>Shift, tarif gaji, toleransi telat, dan modal awal default.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          {SETTING_LABELS.map((f) => (
            <div key={f.key} className="space-y-1.5">
              <Label htmlFor={`set-${f.key}`}>{f.label}</Label>
              <Input
                id={`set-${f.key}`}
                value={values[f.key] ?? ''}
                inputMode={f.numeric ? 'numeric' : undefined}
                onChange={(e) =>
                  setValues((v) => ({
                    ...v,
                    [f.key]: f.numeric ? e.target.value.replace(/\D/g, '') : e.target.value,
                  }))
                }
                className="h-11"
                placeholder={f.hint}
              />
              {f.hint && <p className="text-[11px] text-neutral-400">{f.hint}</p>}
            </div>
          ))}
        </div>
        <Button onClick={save} disabled={saving} className="min-h-[44px] bg-emerald-600 text-white hover:bg-emerald-700">
          <Save className="h-4 w-4" /> Simpan Pengaturan
        </Button>
      </CardContent>
    </Card>
  )
}

// ================= KATEGORI PENGELUARAN TAB =================

function KategoriPengeluaranTab() {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ['expense-categories'],
    queryFn: () => api<{ categories: { id: string; name: string; ownerOnly: boolean }[] }>(
      '/api/expense-categories'
    ),
  })
  const [name, setName] = useState('')
  const [ownerOnly, setOwnerOnly] = useState(false)
  const [saving, setSaving] = useState(false)

  const invalidate = () => qc.invalidateQueries({ queryKey: ['expense-categories'] })

  const create = async () => {
    setSaving(true)
    try {
      await api('/api/expense-categories', {
        method: 'POST',
        body: JSON.stringify({ name, ownerOnly }),
      })
      toast({ title: 'Kategori dibuat', description: name })
      setName('')
      invalidate()
    } catch (err) {
      toast({ title: 'Gagal', description: err instanceof Error ? err.message : '', variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  const toggle = async (cat: { id: string; ownerOnly: boolean }) => {
    try {
      await api('/api/expense-categories', {
        method: 'PUT',
        body: JSON.stringify({ id: cat.id, ownerOnly: !cat.ownerOnly }),
      })
      invalidate()
    } catch (err) {
      toast({ title: 'Gagal', description: err instanceof Error ? err.message : '', variant: 'destructive' })
    }
  }

  const remove = async (cat: { id: string; name: string }) => {
    try {
      await api(`/api/expense-categories?id=${cat.id}`, { method: 'DELETE' })
      toast({ title: 'Kategori dihapus', description: cat.name })
      invalidate()
    } catch (err) {
      toast({ title: 'Gagal', description: err instanceof Error ? err.message : '', variant: 'destructive' })
    }
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Kategori Pengeluaran</CardTitle>
        <CardDescription>
          Tandai &quot;Owner only&quot; untuk kategori yang tidak boleh dicatat kasir (cth: Restock, Gaji Harian).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="exp-cat-name">Nama kategori</Label>
            <Input id="exp-cat-name" value={name} onChange={(e) => setName(e.target.value)} className="h-11 w-full max-w-56" />
          </div>
          <div className="flex items-center gap-2 pb-2.5">
            <Switch checked={ownerOnly} onCheckedChange={setOwnerOnly} id="exp-cat-owner" aria-label="Owner only" />
            <Label htmlFor="exp-cat-owner" className="text-sm">
              Owner only
            </Label>
          </div>
          <Button onClick={create} disabled={!name || saving} className="min-h-[44px] bg-emerald-600 text-white hover:bg-emerald-700">
            <Plus className="h-4 w-4" /> Tambah
          </Button>
        </div>
        {isLoading && <p className="text-sm text-neutral-400">Memuat...</p>}
        <ul className="divide-y">
          {(data?.categories ?? []).map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-2 py-2.5">
              <div className="flex items-center gap-2">
                <span className="font-medium text-neutral-800">{c.name}</span>
                {c.ownerOnly && (
                  <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-900">
                    Owner only
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={c.ownerOnly}
                  onCheckedChange={() => toggle(c)}
                  aria-label={`Owner only ${c.name}`}
                />
                <Button size="sm" variant="outline" className="min-h-[40px] text-red-600 hover:bg-red-50" onClick={() => remove(c)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}

// ================= AUDIT LOG TAB =================

type AuditRow = {
  id: string
  at: string
  userName: string
  action: string
  entity: string
  detail: string | null
}

function AuditTab() {
  const [page, setPage] = useState(1)
  const [userFilter, setUserFilter] = useState('all')
  const [actionFilter, setActionFilter] = useState('all')

  const { data, isLoading } = useQuery({
    queryKey: ['audit', page, userFilter, actionFilter],
    queryFn: () =>
      api<{
        rows: AuditRow[]
        total: number
        page: number
        pageCount: number
        users: { id: string; name: string }[]
        actions: string[]
      }>(`/api/audit?page=${page}&user=${userFilter}&action=${actionFilter}`),
  })

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Audit Log</CardTitle>
        <CardDescription>
          Jejak semua aksi penting: login, void, perubahan harga, komisi, gajian, pengguna, dan lainnya.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-3">
          <div className="space-y-1.5">
            <Label>Pengguna</Label>
            <Select value={userFilter} onValueChange={(v) => { setUserFilter(v); setPage(1) }}>
              <SelectTrigger className="h-10 w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua</SelectItem>
                {(data?.users ?? []).map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Aksi</Label>
            <Select value={actionFilter} onValueChange={(v) => { setActionFilter(v); setPage(1) }}>
              <SelectTrigger className="h-10 w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua</SelectItem>
                {(data?.actions ?? []).map((a) => (
                  <SelectItem key={a} value={a}>
                    {a}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {isLoading && <p className="text-sm text-neutral-400">Memuat...</p>}
        <div className="max-h-96 overflow-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="sticky top-0 bg-neutral-50 text-left text-xs text-neutral-500">
              <tr>
                <th className="px-3 py-2">Waktu</th>
                <th className="px-3 py-2">Pengguna</th>
                <th className="px-3 py-2">Aksi</th>
                <th className="px-3 py-2">Detail</th>
              </tr>
            </thead>
            <tbody>
              {(data?.rows ?? []).map((r) => (
                <tr key={r.id} className="border-t align-top">
                  <td className="whitespace-nowrap px-3 py-2 text-xs text-neutral-500">
                    {new Date(new Date(r.at).getTime() + 7 * 3600 * 1000).toLocaleString('id-ID', {
                      day: '2-digit',
                      month: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                      timeZone: 'UTC',
                    })}
                  </td>
                  <td className="px-3 py-2 font-medium">{r.userName}</td>
                  <td className="px-3 py-2">
                    <Badge variant="outline" className="border-neutral-300 text-neutral-700">
                      {r.action}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 text-neutral-600">{r.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between">
          <p className="text-xs text-neutral-500">
            Halaman {data?.page ?? 1} dari {data?.pageCount ?? 1} ({data?.total ?? 0} entri)
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={page <= 1}
              className="min-h-[40px]"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Sebelumnya
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={page >= (data?.pageCount ?? 1)}
              className="min-h-[40px]"
              onClick={() => setPage((p) => p + 1)}
            >
              Berikutnya
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
