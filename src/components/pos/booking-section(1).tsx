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
import { CalendarPlus, Clock, Phone, UserRound } from 'lucide-react'
import { api, formatDateID, type SessionUser } from '@/lib/client'
import { todayISOClient } from '@/lib/client'
import { cn } from '@/lib/utils'
import { toast } from '@/hooks/use-toast'

type CatalogData = {
  services: { id: string; name: string; price: number; durationMin: number }[]
  barbers: { id: string; name: string; nickname: string }[]
}

type Booking = {
  id: string
  customerName: string
  whatsapp: string | null
  date: string
  time: string
  status: string
  note: string | null
  serviceName: string
  barberName: string
  durationMin: number
}

const STATUS_LABEL: Record<string, string> = {
  WAITING: 'Menunggu',
  CONFIRMED: 'Dikonfirmasi',
  SERVING: 'Dilayani',
  DONE: 'Selesai',
  CANCELLED: 'Dibatalkan',
  RESCHEDULED: 'Reschedule',
}

const STATUS_COLOR: Record<string, string> = {
  WAITING: 'border-amber-300 bg-amber-50 text-amber-900',
  CONFIRMED: 'border-emerald-300 bg-emerald-50 text-emerald-800',
  SERVING: 'border-orange-300 bg-orange-50 text-orange-800',
  DONE: 'border-stone-300 bg-stone-100 text-stone-700',
  CANCELLED: 'border-red-300 bg-red-50 text-red-700',
  RESCHEDULED: 'border-neutral-300 bg-neutral-100 text-neutral-600',
}

const NEXT_ACTIONS: Record<string, string[]> = {
  WAITING: ['CONFIRMED', 'SERVING', 'CANCELLED'],
  CONFIRMED: ['SERVING', 'CANCELLED', 'RESCHEDULED'],
  SERVING: ['DONE', 'CANCELLED'],
  DONE: [],
  CANCELLED: [],
  RESCHEDULED: ['CONFIRMED', 'CANCELLED'],
}

export function BookingSection({ user: _user }: { user: SessionUser }) {
  const qc = useQueryClient()
  const [date, setDate] = useState(todayISOClient())
  const [showForm, setShowForm] = useState(false)
  const [customerName, setCustomerName] = useState('')
  const [whatsapp, setWhatsapp] = useState('')
  const [time, setTime] = useState('10:00')
  const [serviceItemId, setServiceItemId] = useState('')
  const [barberId, setBarberId] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  const { data: catalog } = useQuery({
    queryKey: ['catalog'],
    queryFn: () => api<CatalogData>('/api/catalog'),
  })
  const { data, isLoading } = useQuery({
    queryKey: ['bookings', date],
    queryFn: () => api<{ bookings: Booking[] }>(`/api/bookings?date=${date}`),
  })

  const create = async () => {
    if (!customerName || !serviceItemId || !barberId) {
      toast({ title: 'Lengkapi nama, layanan, dan kapster', variant: 'destructive' })
      return
    }
    setSaving(true)
    try {
      await api('/api/bookings', {
        method: 'POST',
        body: JSON.stringify({ customerName, whatsapp, date, time, serviceItemId, barberId, note }),
      })
      toast({ title: 'Booking dibuat', description: `${customerName} ${formatDateID(date)} ${time}` })
      setCustomerName('')
      setWhatsapp('')
      setServiceItemId('')
      setBarberId('')
      setNote('')
      setShowForm(false)
      qc.invalidateQueries({ queryKey: ['bookings'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
    } catch (err) {
      toast({
        title: 'Gagal membuat booking',
        description: err instanceof Error ? err.message : 'Terjadi kesalahan',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  const setStatus = async (id: string, status: string) => {
    try {
      await api(`/api/bookings/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) })
      qc.invalidateQueries({ queryKey: ['bookings'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
    } catch (err) {
      toast({
        title: 'Gagal ubah status',
        description: err instanceof Error ? err.message : 'Terjadi kesalahan',
        variant: 'destructive',
      })
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="booking-date">Tanggal</Label>
          <Input
            id="booking-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="h-11 w-44"
          />
        </div>
        <Button
          onClick={() => setShowForm((s) => !s)}
          className="min-h-[44px] bg-emerald-600 text-white hover:bg-emerald-700"
        >
          <CalendarPlus className="h-4 w-4" /> Booking Baru
        </Button>
      </div>

      {showForm && (
        <Card className="border-emerald-200 bg-emerald-50/40">
          <CardContent className="p-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-1.5">
                <Label>Nama pelanggan</Label>
                <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} className="h-11" placeholder="cth: Pak Dedi" />
              </div>
              <div className="space-y-1.5">
                <Label>WhatsApp</Label>
                <Input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} className="h-11" placeholder="08..." inputMode="tel" />
              </div>
              <div className="space-y-1.5">
                <Label>Jam</Label>
                <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="h-11" />
              </div>
              <div className="space-y-1.5">
                <Label>Layanan</Label>
                <Select value={serviceItemId} onValueChange={setServiceItemId}>
                  <SelectTrigger className="h-11">
                    <SelectValue placeholder="Pilih layanan" />
                  </SelectTrigger>
                  <SelectContent>
                    {(catalog?.services ?? []).map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name} ({rupiahLabel(s.price)})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Kapster</Label>
                <Select value={barberId} onValueChange={setBarberId}>
                  <SelectTrigger className="h-11">
                    <SelectValue placeholder="Pilih kapster" />
                  </SelectTrigger>
                  <SelectContent>
                    {(catalog?.barbers ?? []).map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Catatan</Label>
                <Input value={note} onChange={(e) => setNote(e.target.value)} className="h-11" placeholder="opsional" />
              </div>
            </div>
            <div className="mt-3 flex gap-2">
              <Button onClick={create} disabled={saving} className="min-h-[44px] bg-emerald-600 text-white hover:bg-emerald-700">
                {saving ? 'Menyimpan...' : 'Simpan Booking'}
              </Button>
              <Button variant="outline" className="min-h-[44px]" onClick={() => setShowForm(false)}>
                Batal
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading && <p className="text-sm text-neutral-400">Memuat...</p>}
      <div className="space-y-2">
        {(data?.bookings ?? []).length === 0 && !isLoading && (
          <Card className="border-dashed">
            <CardContent className="py-10 text-center text-sm text-neutral-400">
              Belum ada booking pada tanggal ini.
            </CardContent>
          </Card>
        )}
        {(data?.bookings ?? []).map((b) => (
          <Card key={b.id} className="p-0">
            <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="flex items-center gap-1 font-semibold text-neutral-900">
                    <UserRound className="h-4 w-4 text-emerald-700" /> {b.customerName}
                  </span>
                  <span className="flex items-center gap-1 text-sm text-neutral-600">
                    <Clock className="h-3.5 w-3.5" /> {b.time}
                  </span>
                  {b.whatsapp && (
                    <a
                      href={`https://wa.me/62${b.whatsapp.replace(/^0/, '').replace(/\D/g, '')}`}
                      target="_blank"
                      rel="noopener"
                      className="flex items-center gap-1 text-sm text-emerald-700 underline"
                    >
                      <Phone className="h-3.5 w-3.5" /> {b.whatsapp}
                    </a>
                  )}
                </div>
                <p className="mt-0.5 text-sm text-neutral-500">
                  {b.serviceName} &middot; {b.barberName} &middot; {b.durationMin} menit
                </p>
                {b.note && <p className="text-xs text-neutral-400">Catatan: {b.note}</p>}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className={cn(STATUS_COLOR[b.status])}>
                  {STATUS_LABEL[b.status] ?? b.status}
                </Badge>
                {(NEXT_ACTIONS[b.status] ?? []).map((next) => (
                  <Button
                    key={next}
                    size="sm"
                    variant="outline"
                    className="min-h-[44px] sm:min-h-[36px]"
                    onClick={() => setStatus(b.id, next)}
                  >
                    {STATUS_LABEL[next]}
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}

function rupiahLabel(n: number): string {
  return 'Rp' + (n || 0).toLocaleString('id-ID')
}
