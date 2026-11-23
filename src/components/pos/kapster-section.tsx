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
import { Switch } from '@/components/ui/switch'
import {
  LogIn,
  HandCoins,
  Calculator,
  Plus,
  Trash2,
  Clock,
  Users,
  Edit3,
  UserPlus,
  AlertTriangle,
} from 'lucide-react'
import { api, rupiah, formatClock, todayISOClient, type SessionUser } from '@/lib/client'
import { cn } from '@/lib/utils'
import { toast } from '@/hooks/use-toast'

type BarberRow = {
  id: string
  name: string
  nickname: string
  tierName: string | null
  tierId: string | null
  attendance: { id?: string; clockInAt: string; lateMinutes: number; deductedHours: number } | null
  today: {
    kepalaCount: number
    serviceRevenue: number
    commission: number
    tipEarned: number
    tipUnclaimed: number
    tipClaimed: number
  } | null
}

type TipsData = {
  tips: {
    id: string
    invoiceNo: string
    tipAmount: number
    tipBarberId: string | null
    barberName: string
    tipStatus: string
  }[]
}

type KomisiRulesData = {
  rules: {
    id: string
    name: string
    scopeType: string
    tierId: string | null
    barberId: string | null
    productCategoryId: string | null
    thresholdHeads: number
    ratePct: number
    active: boolean
  }[]
  tiers: { id: string; name: string }[]
  barbers: {
    id: string
    name: string
    nickname: string
    commissionOverrideEnabled: boolean
    commissionOverrideThresholdHeads: number | null
    commissionOverrideRatePct: number | null
    tierId: string | null
  }[]
  categories: { id: string; name: string; commissionRatePct: number; commissionEnabled: boolean }[]
}

function lateText(lateMinutes: number, deductedHours: number): string {
  if (lateMinutes <= 0) return 'Tepat waktu'
  if (deductedHours === 0) return `Telat ${lateMinutes} menit (dalam toleransi)`
  return `Telat ${lateMinutes} menit \u2192 potong ${deductedHours} jam`
}

export function KapsterSection({ user }: { user: SessionUser }) {
  const qc = useQueryClient()
  const today = todayISOClient()
  // Revisi 8: satu level akses — semua pengguna login punya akses penuh.
  const isOwner = true
  const canAct = true

  const { data, isLoading } = useQuery({
    queryKey: ['barbers'],
    queryFn: () => api<{ barbers: BarberRow[] }>('/api/barbers'),
    refetchInterval: 30000,
  })
  const { data: tipsData } = useQuery({
    queryKey: ['tips', today],
    queryFn: () => api<TipsData>(`/api/tips?date=${today}`),
    refetchInterval: 30000,
  })

  // Absen dialog state
  const [absenTarget, setAbsenTarget] = useState<BarberRow | null>(null)
  const [absenTime, setAbsenTime] = useState('')
  const [editAbsenId, setEditAbsenId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // Barber management state (owner)
  const [addOpen, setAddOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [newNickname, setNewNickname] = useState('')
  const [newTierId, setNewTierId] = useState('')
  const [editTarget, setEditTarget] = useState<BarberRow | null>(null)
  const [editName, setEditName] = useState('')
  const [editNickname, setEditNickname] = useState('')
  const [editTierId, setEditTierId] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<BarberRow | null>(null)
  const [saving, setSaving] = useState(false)

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ['barbers'] })
    qc.invalidateQueries({ queryKey: ['tips'] })
    qc.invalidateQueries({ queryKey: ['dashboard'] })
    qc.invalidateQueries({ queryKey: ['komisi'] })
    qc.invalidateQueries({ queryKey: ['catalog'] })
    qc.invalidateQueries({ queryKey: ['komisi-rules'] })
  }

  const recordAbsen = async () => {
    if (!absenTarget) return
    setBusy(true)
    try {
      const res = await api<{ attendance: { lateMinutes: number; deductedHours: number } }>(
        '/api/attendance',
        {
          method: 'POST',
          body: JSON.stringify({
            barberId: absenTarget.id,
            clockInTime: absenTime || undefined,
          }),
        }
      )
      toast({
        title: `Absen ${absenTarget.name} dicatat`,
        description: lateText(res.attendance.lateMinutes, res.attendance.deductedHours),
      })
      setAbsenTarget(null)
      invalidateAll()
    } catch (err) {
      toast({
        title: 'Absen gagal',
        description: err instanceof Error ? err.message : 'Terjadi kesalahan',
        variant: 'destructive',
      })
    } finally {
      setBusy(false)
    }
  }

  const editAbsen = async () => {
    if (!editAbsenId) return
    setBusy(true)
    try {
      const res = await api<{ attendance: { lateMinutes: number; deductedHours: number } }>(
        `/api/attendance/${editAbsenId}`,
        { method: 'PUT', body: JSON.stringify({ clockInTime: absenTime }) }
      )
      toast({
        title: 'Absensi dikoreksi',
        description: lateText(res.attendance.lateMinutes, res.attendance.deductedHours),
      })
      setEditAbsenId(null)
      invalidateAll()
    } catch (err) {
      toast({
        title: 'Gagal mengoreksi absensi',
        description: err instanceof Error ? err.message : 'Terjadi kesalahan',
        variant: 'destructive',
      })
    } finally {
      setBusy(false)
    }
  }

  const deleteAbsen = async (attendanceId: string, barberName: string) => {
    setBusy(true)
    try {
      await api(`/api/attendance/${attendanceId}`, { method: 'DELETE' })
      toast({ title: 'Absensi dihapus', description: barberName })
      invalidateAll()
    } catch (err) {
      toast({
        title: 'Gagal menghapus absensi',
        description: err instanceof Error ? err.message : 'Terjadi kesalahan',
        variant: 'destructive',
      })
    } finally {
      setBusy(false)
    }
  }

  const claimTip = async (transactionId: string, invoiceNo: string) => {
    try {
      await api('/api/tips', { method: 'POST', body: JSON.stringify({ transactionId }) })
      toast({ title: 'Tip diambil', description: `${invoiceNo} — uang diambil dari kasir` })
      invalidateAll()
    } catch (err) {
      toast({
        title: 'Gagal mengambil tip',
        description: err instanceof Error ? err.message : 'Terjadi kesalahan',
        variant: 'destructive',
      })
    }
  }

  // ===== Barber management actions (owner) =====
  const createBarber = async () => {
    setSaving(true)
    try {
      await api('/api/barbers', {
        method: 'POST',
        body: JSON.stringify({ name: newName, nickname: newNickname, tierId: newTierId || undefined }),
      })
      toast({ title: 'Kapster ditambahkan', description: `${newName} (${newNickname})` })
      setAddOpen(false)
      setNewName('')
      setNewNickname('')
      setNewTierId('')
      invalidateAll()
    } catch (err) {
      toast({
        title: 'Gagal menambah kapster',
        description: err instanceof Error ? err.message : 'Terjadi kesalahan',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  const updateBarber = async () => {
    if (!editTarget) return
    setSaving(true)
    try {
      await api('/api/barbers', {
        method: 'PUT',
        body: JSON.stringify({
          id: editTarget.id,
          name: editName,
          nickname: editNickname,
          tierId: editTierId,
        }),
      })
      toast({ title: 'Kapster diperbarui', description: editName })
      setEditTarget(null)
      invalidateAll()
    } catch (err) {
      toast({
        title: 'Gagal memperbarui kapster',
        description: err instanceof Error ? err.message : 'Terjadi kesalahan',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  const deleteBarber = async () => {
    if (!deleteTarget) return
    setSaving(true)
    try {
      const res = await api<{ softDeleted?: boolean }>(`/api/barbers?id=${deleteTarget.id}`, {
        method: 'DELETE',
      })
      toast({
        title: res?.softDeleted ? 'Kapster dinonaktifkan' : 'Kapster dihapus',
        description: res?.softDeleted
          ? `${deleteTarget.name} disembunyikan dari semua daftar; riwayat transaksi & gajian tetap aman.`
          : `${deleteTarget.name} dihapus (tidak punya riwayat).`,
      })
      setDeleteTarget(null)
      invalidateAll()
    } catch (err) {
      toast({
        title: 'Gagal menghapus kapster',
        description: err instanceof Error ? err.message : 'Terjadi kesalahan',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  const unclaimedTips = (tipsData?.tips ?? []).filter((t) => t.tipStatus === 'UNCLAIMED')
  const tiers = [
    { id: 'tier-junior', name: 'Junior' },
    { id: 'tier-senior', name: 'Senior' },
  ]

  return (
    <div className="space-y-6">
      {/* Owner: manage barbers */}
      {isOwner && (
        <Card className="border-amber-200 bg-amber-50/40">
          <CardHeader className="pb-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Users className="h-4 w-4 text-amber-700" /> Kelola Kapster
                </CardTitle>
                <CardDescription>
                  Tambah, ubah nama/kode/tier, atau hapus kapster yang resign. Riwayat transaksi & gajian
                  lama tetap aman.
                </CardDescription>
              </div>
              <Button
                onClick={() => setAddOpen(true)}
                className="min-h-[44px] bg-amber-700 text-white hover:bg-amber-800"
              >
                <UserPlus className="h-4 w-4" /> Kapster Baru
              </Button>
            </div>
          </CardHeader>
        </Card>
      )}

      {/* Attendance + performance */}
      <div className="grid gap-4 lg:grid-cols-2">
        {isLoading && <p className="text-sm text-neutral-400">Memuat...</p>}
        {(data?.barbers ?? []).map((b) => (
          <Card key={b.id} className="border-emerald-100">
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <CardTitle className="text-base">{b.name}</CardTitle>
                  <CardDescription>
                    {b.nickname} &middot; {b.tierName ?? '-'}
                  </CardDescription>
                </div>
                <div className="flex flex-col items-end gap-1.5">
                  {b.attendance ? (
                    <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-emerald-800">
                      <Clock className="mr-1 h-3 w-3" /> Absen {formatClock(b.attendance.clockInAt)}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="border-red-300 bg-red-50 text-red-700">
                      Belum absen
                    </Badge>
                  )}
                  {isOwner && (
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        className="min-h-[32px] px-2 text-xs"
                        onClick={() => {
                          setEditTarget(b)
                          setEditName(b.name)
                          setEditNickname(b.nickname)
                          setEditTierId(b.tierId ?? '')
                        }}
                      >
                        <Edit3 className="h-3.5 w-3.5" /> Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="min-h-[32px] px-2 text-xs text-red-600 hover:bg-red-50"
                        onClick={() => setDeleteTarget(b)}
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Hapus
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
                <div className="rounded-lg bg-emerald-50 p-2">
                  <p className="text-lg font-bold tabular-nums text-emerald-800">{b.today?.kepalaCount ?? 0}</p>
                  <p className="text-[10px] text-neutral-500">Kepala</p>
                </div>
                <div className="rounded-lg bg-neutral-50 p-2">
                  <p className="whitespace-nowrap text-base font-bold tabular-nums sm:text-lg">{rupiah(b.today?.serviceRevenue ?? 0)}</p>
                  <p className="text-[10px] text-neutral-500">Omzet</p>
                </div>
                <div className="rounded-lg bg-amber-50 p-2">
                  <p className="whitespace-nowrap text-base font-bold tabular-nums text-amber-800 sm:text-lg">{rupiah(b.today?.commission ?? 0)}</p>
                  <p className="text-[10px] text-neutral-500">Komisi</p>
                </div>
                <div className="rounded-lg bg-amber-50 p-2">
                  <p className="whitespace-nowrap text-base font-bold tabular-nums text-amber-900 sm:text-lg">{rupiah(b.today?.tipEarned ?? 0)}</p>
                  <p className="text-[10px] text-neutral-500">Tip</p>
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                {b.attendance ? (
                  <p className="text-xs text-neutral-600">
                    {lateText(b.attendance.lateMinutes, b.attendance.deductedHours)}
                  </p>
                ) : (
                  <p className="text-xs text-neutral-400">Belum ada absensi hari ini.</p>
                )}
                {canAct && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Button
                      size="sm"
                      disabled={!!b.attendance || busy}
                      onClick={() => {
                        setAbsenTarget(b)
                        setAbsenTime(new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(11, 16))
                      }}
                      className="min-h-[40px] bg-emerald-600 text-white hover:bg-emerald-700 sm:min-h-[36px]"
                    >
                      <LogIn className="h-4 w-4" /> Absen
                    </Button>
                    {isOwner && b.attendance && (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          className="min-h-[36px]"
                          onClick={() => {
                            setEditAbsenId(b.attendance!.id ?? null)
                            setAbsenTarget(b)
                            setAbsenTime(
                              new Date(new Date(b.attendance!.clockInAt).getTime() + 7 * 3600 * 1000)
                                .toISOString()
                                .slice(11, 16)
                            )
                          }}
                        >
                          <Edit3 className="h-4 w-4" /> Koreksi
                        </Button>
                        {b.attendance.id && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            className="min-h-[36px] text-red-600 hover:bg-red-50"
                            onClick={() => deleteAbsen(b.attendance!.id!, b.name)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
              {b.today && b.today.tipUnclaimed > 0 && (
                <Badge variant="outline" className="border-amber-400 bg-amber-50 text-amber-900">
                  Tip belum diambil: {rupiah(b.today.tipUnclaimed)}
                </Badge>
              )}
            </CardContent>
          </Card>
        ))}
        {!isLoading && (data?.barbers ?? []).length === 0 && (
          <Card className="border-dashed lg:col-span-2">
            <CardContent className="py-10 text-center text-sm text-neutral-400">
              Belum ada kapster aktif.
            </CardContent>
          </Card>
        )}
      </div>

      {/* Tips unclaimed (kasir/owner action) */}
      {canAct && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <HandCoins className="h-4 w-4 text-amber-700" /> Tip Belum Diambil (uang di kasir)
            </CardTitle>
            <CardDescription>
              Tekan &quot;Ambil Tip&quot; saat kapster mengambil tipnya dari laci kasir.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            {unclaimedTips.length === 0 ? (
              <p className="text-sm text-neutral-400">Tidak ada tip menunggu.</p>
            ) : (
              <ul className="max-h-64 space-y-2 overflow-y-auto">
                {unclaimedTips.map((t) => (
                  <li
                    key={t.id}
                    className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm"
                  >
                    <div>
                      <span className="font-medium">{t.barberName}</span>
                      <span className="ml-2 text-xs text-neutral-400">
                        {t.invoiceNo} &middot; {rupiah(t.tipAmount)}
                      </span>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="min-h-[44px] border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100 sm:min-h-[36px]"
                      onClick={() => claimTip(t.id, t.invoiceNo)}
                    >
                      Ambil Tip
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      {/* Owner: komisi rules */}
      {isOwner && <KomisiRulesEditor />}

      {/* Absen dialog (record new or correct existing) */}
      <Dialog
        open={!!absenTarget}
        onOpenChange={(o) => {
          if (!o) {
            setAbsenTarget(null)
            setEditAbsenId(null)
          }
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {editAbsenId ? `Koreksi Absensi — ${absenTarget?.name}` : `Absen Masuk — ${absenTarget?.name}`}
            </DialogTitle>
            <DialogDescription>
              {editAbsenId
                ? 'Ubah jam masuk untuk koreksi telat/potongan gaji hari ini.'
                : 'Isi jam masuk (default jam sekarang). Telat dihitung dari jam mulai shift 09:00. Setiap jam punya toleransi baru 15 menit.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="absen-time">Jam masuk</Label>
              <Input
                id="absen-time"
                type="time"
                value={absenTime}
                onChange={(e) => setAbsenTime(e.target.value)}
                className="h-11"
              />
            </div>
            {absenTime && (
              <div className="space-y-1 text-sm text-neutral-600">
                <p>
                  Telat {Math.max(0, timeToMinutes(absenTime) - 540)} menit &rarr; potong{' '}
                  {lateHoursPreview(absenTime)} jam
                </p>
                <p className="text-xs text-neutral-400">
                  Aturan: telat lewat toleransi 15 menit = potong 1 jam. Toleransi baru mulai di jam penuh
                  berikutnya (mis. datang 10:00&ndash;10:15 masih 1 jam potongan, lewat 10:15 jadi 2 jam).
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              className="min-h-[44px]"
              onClick={() => {
                setAbsenTarget(null)
                setEditAbsenId(null)
              }}
            >
              Batal
            </Button>
            <Button
              className="min-h-[44px] bg-emerald-600 text-white hover:bg-emerald-700"
              disabled={busy}
              onClick={editAbsenId ? editAbsen : recordAbsen}
            >
              {busy ? 'Menyimpan...' : editAbsenId ? 'Simpan Koreksi' : 'Catat Absen'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add barber dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Kapster Baru</DialogTitle>
            <DialogDescription>Kode kapster dipakai sebagai label singkat di kasir.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Nama lengkap</Label>
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} className="h-11" placeholder="cth: Barber Eko" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label>Kode</Label>
                <Input
                  value={newNickname}
                  onChange={(e) => setNewNickname(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10))}
                  className="h-11"
                  placeholder="EKO"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Tier</Label>
                <Select value={newTierId} onValueChange={setNewTierId}>
                  <SelectTrigger className="h-11">
                    <SelectValue placeholder="Pilih tier" />
                  </SelectTrigger>
                  <SelectContent>
                    {tiers.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="min-h-[44px]" onClick={() => setAddOpen(false)}>
              Batal
            </Button>
            <Button
              onClick={createBarber}
              disabled={!newName || !newNickname || saving}
              className="min-h-[44px] bg-emerald-600 text-white hover:bg-emerald-700"
            >
              Simpan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit barber dialog */}
      <Dialog open={!!editTarget} onOpenChange={(o) => !o && setEditTarget(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Edit Kapster</DialogTitle>
            <DialogDescription>Ubah nama, kode, atau tier. Riwayat tidak terpengaruh.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Nama lengkap</Label>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="h-11" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label>Kode</Label>
                <Input
                  value={editNickname}
                  onChange={(e) => setEditNickname(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10))}
                  className="h-11"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Tier</Label>
                <Select value={editTierId} onValueChange={setEditTierId}>
                  <SelectTrigger className="h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {tiers.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="min-h-[44px]" onClick={() => setEditTarget(null)}>
              Batal
            </Button>
            <Button
              onClick={updateBarber}
              disabled={!editName || !editNickname || saving}
              className="min-h-[44px] bg-emerald-600 text-white hover:bg-emerald-700"
            >
              Simpan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete barber confirm */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-700">
              <AlertTriangle className="h-5 w-5" /> Hapus Kapster?
            </DialogTitle>
            <DialogDescription>
              {deleteTarget?.name} ({deleteTarget?.nickname}) akan dihapus dari semua daftar, selector kasir,
              dan komisi. Riwayat transaksi, gajian, dan absensi lama tetap tersimpan aman di database.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" className="min-h-[44px]" onClick={() => setDeleteTarget(null)}>
              Batal
            </Button>
            <Button
              variant="destructive"
              disabled={saving}
              className="min-h-[44px]"
              onClick={deleteBarber}
            >
              {saving ? 'Memproses...' : 'Ya, Hapus'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map((v) => parseInt(v, 10) || 0)
  return h * 60 + m
}

function lateHoursPreview(clockIn: string): number {
  const late = Math.max(0, timeToMinutes(clockIn) - 540) // shift start 09:00
  if (late <= 15) return 0
  return Math.ceil((late - 15) / 60)
}

// ===================== Owner: komisi rules editor =====================

export function KomisiRulesEditor() {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ['komisi-rules'],
    queryFn: () => api<KomisiRulesData>('/api/komisi/rules'),
  })

  const [name, setName] = useState('')
  const [scopeType, setScopeType] = useState('TIER')
  const [tierId, setTierId] = useState('')
  const [barberId, setBarberId] = useState('')
  const [threshold, setThreshold] = useState('5')
  const [rate, setRate] = useState('10')
  const [saving, setSaving] = useState(false)

  const createRule = async () => {
    setSaving(true)
    try {
      await api('/api/komisi/rules', {
        method: 'POST',
        body: JSON.stringify({
          name,
          scopeType,
          tierId: scopeType === 'TIER' ? tierId : undefined,
          barberId: scopeType === 'BARBER' ? barberId : undefined,
          thresholdHeads: parseInt(threshold, 10),
          ratePct: parseInt(rate, 10),
        }),
      })
      toast({ title: 'Aturan komisi dibuat' })
      setName('')
      qc.invalidateQueries({ queryKey: ['komisi-rules'] })
    } catch (err) {
      toast({
        title: 'Gagal membuat aturan',
        description: err instanceof Error ? err.message : 'Terjadi kesalahan',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  const toggleRule = async (id: string, active: boolean) => {
    try {
      await api('/api/komisi/rules', {
        method: 'PUT',
        body: JSON.stringify({ id, active }),
      })
      qc.invalidateQueries({ queryKey: ['komisi-rules'] })
    } catch (err) {
      toast({
        title: 'Gagal mengubah aturan',
        description: err instanceof Error ? err.message : 'Terjadi kesalahan',
        variant: 'destructive',
      })
    }
  }

  const deleteRule = async (id: string) => {
    try {
      await api(`/api/komisi/rules?id=${id}`, { method: 'DELETE' })
      qc.invalidateQueries({ queryKey: ['komisi-rules'] })
      toast({ title: 'Aturan dihapus' })
    } catch (err) {
      toast({
        title: 'Gagal menghapus aturan',
        description: err instanceof Error ? err.message : 'Terjadi kesalahan',
        variant: 'destructive',
      })
    }
  }

  const saveOverride = async (
    barberId: string,
    enabled: boolean,
    threshold: number,
    rate: number
  ) => {
    try {
      await api('/api/komisi/rules', {
        method: 'PATCH',
        body: JSON.stringify({
          barberId,
          commissionOverrideEnabled: enabled,
          commissionOverrideThresholdHeads: threshold,
          commissionOverrideRatePct: rate,
        }),
      })
      qc.invalidateQueries({ queryKey: ['komisi-rules'] })
      toast({ title: 'Override kapster disimpan' })
    } catch (err) {
      toast({
        title: 'Gagal menyimpan override',
        description: err instanceof Error ? err.message : 'Terjadi kesalahan',
        variant: 'destructive',
      })
    }
  }

  if (isLoading) return <p className="text-sm text-neutral-400">Memuat aturan komisi...</p>

  return (
    <Card className="border-stone-200">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Calculator className="h-4 w-4 text-stone-700" /> Aturan Komisi (Owner)
        </CardTitle>
        <CardDescription>
          Prioritas: override kapster &gt; aturan kapster &gt; aturan tier &gt; aturan default.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Rules list */}
        <ul className="max-h-64 space-y-2 overflow-y-auto">
          {(data?.rules ?? []).map((r) => (
            <li
              key={r.id}
              className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm"
            >
              <div className="min-w-0">
                <p className="font-medium">
                  {r.name}{' '}
                  <span className="text-xs font-normal text-neutral-400">({r.scopeType})</span>
                </p>
                <p className="text-xs text-neutral-500">
                  Threshold {r.thresholdHeads} kepala &middot; rate {r.ratePct}%
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={r.active}
                  onCheckedChange={(v) => toggleRule(r.id, v)}
                  aria-label={`Aktifkan aturan ${r.name}`}
                />
                <button
                  onClick={() => deleteRule(r.id)}
                  className="flex h-9 w-9 items-center justify-center rounded-md border text-red-600 hover:bg-red-50"
                  aria-label={`Hapus aturan ${r.name}`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>

        {/* Create rule */}
        <div className="rounded-lg border border-dashed p-3">
          <p className="mb-2 text-sm font-semibold text-neutral-700">
            <Plus className="mr-1 inline h-4 w-4" /> Aturan Baru
          </p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-1">
              <Label className="text-xs">Nama</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} className="h-10" placeholder="cth: Bonus Senior" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Scope</Label>
              <Select value={scopeType} onValueChange={setScopeType}>
                <SelectTrigger className="h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="TIER">Tier</SelectItem>
                  <SelectItem value="BARBER">Kapster</SelectItem>
                  <SelectItem value="DEFAULT">Default Semua</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {scopeType === 'TIER' && (
              <div className="space-y-1">
                <Label className="text-xs">Tier</Label>
                <Select value={tierId} onValueChange={setTierId}>
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder="Pilih tier" />
                  </SelectTrigger>
                  <SelectContent>
                    {(data?.tiers ?? []).map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {scopeType === 'BARBER' && (
              <div className="space-y-1">
                <Label className="text-xs">Kapster</Label>
                <Select value={barberId} onValueChange={setBarberId}>
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder="Pilih kapster" />
                  </SelectTrigger>
                  <SelectContent>
                    {(data?.barbers ?? []).map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1">
              <Label className="text-xs">Threshold kepala</Label>
              <Input
                inputMode="numeric"
                value={threshold}
                onChange={(e) => setThreshold(e.target.value.replace(/\D/g, ''))}
                className="h-10"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Rate (%)</Label>
              <Input
                inputMode="numeric"
                value={rate}
                onChange={(e) => setRate(e.target.value.replace(/\D/g, ''))}
                className="h-10"
              />
            </div>
            <div className="flex items-end">
              <Button
                onClick={createRule}
                disabled={!name || saving}
                className="min-h-[40px] w-full bg-emerald-600 text-white hover:bg-emerald-700"
              >
                Simpan Aturan
              </Button>
            </div>
          </div>
        </div>

        {/* Barber overrides */}
        <div>
          <p className="mb-2 flex items-center gap-1 text-sm font-semibold text-neutral-700">
            <Users className="h-4 w-4" /> Override per Kapster
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {(data?.barbers ?? []).map((b) => (
              <OverrideRow key={b.id} barber={b} onSave={saveOverride} />
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function OverrideRow({
  barber,
  onSave,
}: {
  barber: KomisiRulesData['barbers'][number]
  onSave: (id: string, enabled: boolean, threshold: number, rate: number) => Promise<void>
}) {
  const [enabled, setEnabled] = useState(barber.commissionOverrideEnabled)
  const [threshold, setThreshold] = useState(String(barber.commissionOverrideThresholdHeads ?? 5))
  const [rate, setRate] = useState(String(barber.commissionOverrideRatePct ?? 10))

  return (
    <div className="rounded-lg border p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-semibold">{barber.name}</span>
        <div className="flex items-center gap-2">
          <span className="text-xs text-neutral-500">Override</span>
          <Switch checked={enabled} onCheckedChange={setEnabled} aria-label={`Override ${barber.name}`} />
        </div>
      </div>
      {enabled && (
        <div className="mb-2 grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-xs">Threshold</Label>
            <Input
              inputMode="numeric"
              value={threshold}
              onChange={(e) => setThreshold(e.target.value.replace(/\D/g, ''))}
              className="h-9"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Rate (%)</Label>
            <Input
              inputMode="numeric"
              value={rate}
              onChange={(e) => setRate(e.target.value.replace(/\D/g, ''))}
              className="h-9"
            />
          </div>
        </div>
      )}
      <Button
        size="sm"
        variant="outline"
        className={cn('min-h-[36px] w-full')}
        onClick={() => onSave(barber.id, enabled, parseInt(threshold, 10) || 0, parseInt(rate, 10) || 0)}
      >
        Simpan Override
      </Button>
    </div>
  )
}
