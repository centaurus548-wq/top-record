'use client'

import { RiwayatSection } from '@/components/pos/riwayat-section'
import type { SessionUser } from '@/lib/client'

export function ArsipSection({ user }: { user: SessionUser }) {
  return (
    <div className="space-y-2">
      <p className="rounded-lg bg-stone-100 px-4 py-3 text-sm text-stone-700">
        Arsip transaksi void &mdash; tidak dihitung dalam laporan, komisi, kepala, maupun closing.
      </p>
      <RiwayatSection user={user} archiveMode />
    </div>
  )
}
