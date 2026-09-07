import type { ReactNode } from 'react'

export function FieldRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 text-lg">
      <span className="shrink-0 opacity-60">{label}</span>
      <div className="text-right font-semibold">{value}</div>
    </div>
  )
}
