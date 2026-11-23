'use client'

import { Card, CardContent } from '@/components/ui/card'
import { Construction } from 'lucide-react'

export function PlaceholderSection({ title, description }: { title: string; description: string }) {
  return (
    <Card className="border-dashed border-2 border-emerald-200 bg-emerald-50/40">
      <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
          <Construction className="h-7 w-7" aria-hidden />
        </div>
        <h3 className="text-lg font-semibold text-emerald-900">{title}</h3>
        <p className="max-w-sm text-sm text-neutral-500">{description}</p>
        <p className="rounded-full bg-emerald-600 px-4 py-1.5 text-xs font-semibold text-white">
          Akan hadir di fase berikutnya
        </p>
      </CardContent>
    </Card>
  )
}
