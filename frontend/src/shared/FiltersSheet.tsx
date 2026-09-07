import type { ReactNode } from 'react'
import { CloseButton } from './CloseButton'
import { HEADER_ACTION_BUTTON_CLASSES } from './headerActionButton'

export function FiltersButton({
  onClick,
  hasActiveFilters,
  widthClassName = 'w-44',
}: {
  onClick: () => void
  hasActiveFilters: boolean
  widthClassName?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${HEADER_ACTION_BUTTON_CLASSES} ${widthClassName} justify-center border-2 border-brand bg-surface text-brand hover:bg-brand hover:text-brand-contrast lg:hidden`}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-6 w-6"
      >
        <line x1="4" y1="6" x2="20" y2="6" />
        <line x1="4" y1="12" x2="14" y2="12" />
        <line x1="4" y1="18" x2="20" y2="18" />
        <circle cx="18" cy="12" r="2.5" />
      </svg>
      Filtros
      {hasActiveFilters && <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-brand" />}
    </button>
  )
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  children: ReactNode
}

export function FiltersSheet({ open, onOpenChange, children }: Props) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center lg:hidden">
      <div
        className="absolute inset-0 bg-ink/20 backdrop-blur-sm"
        onClick={() => onOpenChange(false)}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-label="Filtros"
        className="scrollbar-clean relative flex max-h-[80vh] w-full flex-col gap-4 overflow-auto rounded-t-2xl bg-surface p-6 shadow-2xl"
      >
        <div className="flex items-center justify-between">
          <h2 className="m-0 text-2xl font-bold">Filtros</h2>
          <CloseButton onClose={() => onOpenChange(false)} />
        </div>
        <div className="flex flex-col gap-3">{children}</div>
      </div>
    </div>
  )
}
