'use client'

import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Scissors } from 'lucide-react'
import { api, type MeResponse } from '@/lib/client'

export function LoginScreen({ onLogin }: { onLogin: (me: MeResponse) => void }) {
  const [username, setUsername] = useState('')
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const pinRef = useRef<HTMLInputElement>(null)

  // Auto-fokus ke PIN setelah username diisi (alur cepat di tablet)
  useEffect(() => {
    if (username && pin.length === 0) pinRef.current?.focus()
  }, [username, pin.length])

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await api('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, pin }),
      })
      const me = await api<MeResponse>('/api/auth/me')
      onLogin(me)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login gagal')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-emerald-50 via-white to-white p-4">
      <div className="w-full max-w-sm space-y-4">
        <Card className="border-emerald-100 shadow-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-2 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-600 text-white shadow-sm">
              <Scissors className="h-8 w-8" aria-hidden />
            </div>
            <CardTitle className="text-2xl font-bold text-emerald-800">Top-Record</CardTitle>
            <CardDescription>Kasir Barbershop &mdash; masuk dengan username dan PIN</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="cth: owner"
                  autoComplete="username"
                  autoCapitalize="none"
                  className="h-12"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pin">PIN (4-6 digit)</Label>
                <Input
                  id="pin"
                  ref={pinRef}
                  type="password"
                  inputMode="numeric"
                  pattern="\d*"
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="······"
                  autoComplete="off"
                  className="h-12 text-center text-lg tracking-[0.5em]"
                  required
                />
              </div>
              {error && (
                <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
                  {error}
                </p>
              )}
              <Button
                type="submit"
                disabled={loading || !username || pin.length < 4}
                className="h-12 w-full bg-emerald-600 text-base font-semibold text-white hover:bg-emerald-700"
              >
                {loading ? 'Memproses...' : 'Masuk'}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-neutral-500">
          Semua pengguna yang punya akun mendapat akses penuh.
          <br />
          Akun pertama: <span className="font-semibold text-neutral-700">owner</span> / PIN{' '}
          <span className="font-semibold text-neutral-700">111111</span> &mdash; buat akun lain di
          menu Pengaturan.
        </p>
      </div>
    </div>
  )
}
