interface Props {
  title: string
  description: string
  confirmLabel: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({ title, description, confirmLabel, danger = false, onConfirm, onCancel }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink/20 backdrop-blur-sm" onClick={onCancel} aria-hidden="true" />

      <div
        role="alertdialog"
        aria-label={title}
        className="relative flex w-full max-w-sm flex-col gap-4 rounded-2xl bg-surface p-6 shadow-2xl"
      >
        <h2 className="m-0 text-2xl font-bold">{title}</h2>
        <p className="m-0 text-lg opacity-70">{description}</p>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onConfirm}
            className={`h-12 flex-1 rounded-lg text-lg font-bold transition-colors ${
              danger
                ? 'bg-danger text-brand-contrast hover:bg-danger/90'
                : 'bg-brand text-brand-contrast hover:bg-brand/90'
            }`}
          >
            {confirmLabel}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="h-12 flex-1 rounded-lg border border-line text-lg font-semibold transition-colors hover:bg-surface-brand"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}
