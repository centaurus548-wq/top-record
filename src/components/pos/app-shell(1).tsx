'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard,
  ShoppingCart,
  CalendarDays,
  Users,
  Package,
  Wallet,
  Lock,
  History,
  Banknote,
  BarChart3,
  Settings,
  Archive,
  Scissors,
  LogOut,
} from 'lucide-react'
import type { NavSection, MeResponse } from '@/lib/client'
import { DashboardSection } from '@/components/pos/dashboard-section'
import { PosSection } from '@/components/pos/pos-section'
import { RiwayatSection } from '@/components/pos/riwayat-section'
import { KapsterSection } from '@/components/pos/kapster-section'
import { BookingSection } from '@/components/pos/booking-section'
import { ExpensesSection } from '@/components/pos/expenses-section'
import { ClosingSection } from '@/components/pos/closing-section'
import { ProdukSection } from '@/components/pos/produk-section'
import { PayrollSection } from '@/components/pos/payroll-section'
import { LaporanSection } from '@/components/pos/laporan-section'
import { SettingsSection } from '@/components/pos/settings-section'
import { ArsipSection } from '@/components/pos/arsip-section'

const NAV_META: Record<
  NavSection,
  { label: string; icon: React.ComponentType<{ className?: string }>; title: string }
> = {
  dashboard: { label: 'Dashboard', icon: LayoutDashboard, title: 'Dashboard' },
  pos: { label: 'Kasir', icon: ShoppingCart, title: 'Kasir (POS)' },
  booking: { label: 'Booking', icon: CalendarDays, title: 'Booking' },
  kapster: { label: 'Kapster', icon: Users, title: 'Kapster' },
  produk: { label: 'Produk & Stok', icon: Package, title: 'Produk & Stok' },
  pengeluaran: { label: 'Pengeluaran', icon: Wallet, title: 'Pengeluaran' },
  closing: { label: 'Closing', icon: Lock, title: 'Closing Kas' },
  riwayat: { label: 'Riwayat', icon: History, title: 'Riwayat Transaksi' },
  gajian: { label: 'Gajian', icon: Banknote, title: 'Gajian' },
  laporan: { label: 'Laporan', icon: BarChart3, title: 'Laporan' },
  pengaturan: { label: 'Pengaturan', icon: Settings, title: 'Pengaturan' },
  arsip: { label: 'Arsip', icon: Archive, title: 'Arsip Transaksi Dibatalkan' },
}

export function AppShell({ me, onLogout }: { me: MeResponse; onLogout: () => void }) {
  const [active, setActive] = useState<NavSection>('dashboard')
  const { user, nav } = me
  const renderSection = () => {
    switch (active) {
      case 'dashboard':
        return <DashboardSection user={user} />
      case 'pos':
        return <PosSection user={user} onDone={() => setActive('riwayat')} />
      case 'booking':
        return <BookingSection user={user} />
      case 'kapster':
        return <KapsterSection user={user} />
      case 'produk':
        return <ProdukSection user={user} />
      case 'pengeluaran':
        return <ExpensesSection user={user} />
      case 'closing':
        return <ClosingSection user={user} />
      case 'riwayat':
        return <RiwayatSection user={user} />
      case 'arsip':
        return <ArsipSection user={user} />
      case 'gajian':
        return <PayrollSection />
      case 'laporan':
        return <LaporanSection />
      case 'pengaturan':
        return <SettingsSection user={user} />
      default:
        return null
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-white">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-2 px-4 py-2.5">
          <div className="flex items-center gap-2 min-w-0">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-600 text-white">
              <Scissors className="h-5 w-5" aria-hidden />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-sm font-bold text-emerald-900 sm:text-base">
                Top-Record
              </h1>
              <p className="truncate text-[11px] text-neutral-500">
                {NAV_META[active].title} &middot; {user.name}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onLogout}
              className="h-9 min-h-[44px] sm:min-h-0 border-neutral-300 text-neutral-700 hover:bg-red-50 hover:text-red-700"
              aria-label="Keluar"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Keluar</span>
            </Button>
          </div>
        </div>
      </header>

      {/* Body: sidebar (desktop) + content */}
      <div className="mx-auto flex w-full max-w-7xl flex-1 gap-6 px-4 py-4 pb-[calc(6.5rem+env(safe-area-inset-bottom))] md:pb-4">
        {/* Desktop sidebar */}
        <nav
          className="hidden md:block w-52 shrink-0"
          aria-label="Menu utama"
        >
          <ul className="sticky top-20 space-y-1">
            {nav.map((s) => {
              const meta = NAV_META[s]
              const Icon = meta.icon
              const isActive = active === s
              return (
                <li key={s}>
                  <button
                    onClick={() => setActive(s)}
                    aria-current={isActive ? 'page' : undefined}
                    className={cn(
                      'flex w-full min-h-[44px] items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                      isActive
                        ? 'bg-emerald-600 text-white shadow-sm'
                        : 'text-neutral-700 hover:bg-emerald-50 hover:text-emerald-800'
                    )}
                  >
                    <Icon className="h-4.5 w-4.5 shrink-0" />
                    {meta.label}
                  </button>
                </li>
              )
            })}
          </ul>
        </nav>

        {/* Main content */}
        <main className="min-w-0 flex-1">
          <h2 className="mb-4 hidden text-xl font-bold text-neutral-900 md:block">
            {NAV_META[active].title}
          </h2>
          {renderSection()}
        </main>
      </div>

      {/* Mobile bottom tab bar */}
      <nav
        className="fixed inset-x-0 bottom-0 z-30 border-t bg-white/95 backdrop-blur md:hidden"
        aria-label="Menu utama"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="no-scrollbar flex overflow-x-auto">
          {nav.map((s) => {
            const meta = NAV_META[s]
            const Icon = meta.icon
            const isActive = active === s
            return (
              <button
                key={s}
                onClick={() => setActive(s)}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'flex w-20 shrink-0 min-h-[56px] flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-[10px] font-semibold transition-colors',
                  isActive
                    ? 'border-t-2 border-emerald-600 pt-1 text-emerald-700'
                    : 'border-t-2 border-transparent pt-1 text-neutral-500'
                )}
              >
                <span
                  className={cn(
                    'flex h-7 w-7 items-center justify-center rounded-full',
                    isActive && 'bg-emerald-600 text-white'
                  )}
                >
                  <Icon className="h-4 w-4" />
                </span>
                {meta.label}
              </button>
            )
          })}
        </div>
      </nav>

      {/* Sticky footer */}
      <footer className="mt-auto border-t bg-white">
        <div className="mx-auto max-w-7xl px-4 py-3 pb-[calc(4.5rem+env(safe-area-inset-bottom))] text-center text-xs text-neutral-400 md:pb-3">
          Top-Record &middot; Jam operasional 09:00&ndash;21:00 (WIB)
        </div>
      </footer>
    </div>
  )
}
