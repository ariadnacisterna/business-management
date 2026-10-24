import type { ReactNode } from 'react'

interface Props {
  icon: ReactNode
  title: string
  description: string
}

export function EmptyState({ icon, title, description }: Props) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-line bg-surface px-6 py-16 text-center">
      {icon}
      <p className="m-0 text-xl font-semibold opacity-70">{title}</p>
      <p className="m-0 text-lg opacity-50">{description}</p>
    </div>
  )
}
