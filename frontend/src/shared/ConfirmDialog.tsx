import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Breadcrumb } from './Breadcrumb'
import { CloseButton } from './CloseButton'
import { Dialog } from './Dialog'
import { CLOSE_FLOATING_MENUS_EVENT } from './floatingMenuEvents'

interface Props {
  title: string
  description: string
  details?: ReactNode
  confirmLabel: string
  danger?: boolean
  breadcrumb: string[]
  onConfirm: () => void | Promise<void>
  onCancel: () => void
}

export function ConfirmDialog({
  title,
  description,
  details,
  confirmLabel,
  danger = false,
  breadcrumb,
  onConfirm,
  onCancel,
}: Props) {
  const [confirming, setConfirming] = useState(false)
  const confirmingRef = useRef(false)

  useEffect(() => {
    window.dispatchEvent(new Event(CLOSE_FLOATING_MENUS_EVENT))
  }, [])

  async function handleConfirm() {
    if (confirmingRef.current) return
    confirmingRef.current = true
    setConfirming(true)
    try {
      await onConfirm()
    } finally {
      confirmingRef.current = false
      setConfirming(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink/20 backdrop-blur-sm" onClick={onCancel} aria-hidden="true" />

      <Dialog
        role="alertdialog"
        label={title}
        onClose={onCancel}
        className="relative flex max-h-[calc(100svh-2rem)] w-full max-w-sm flex-col gap-4 overflow-y-auto rounded-2xl bg-surface p-6 shadow-2xl"
      >
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <Breadcrumb segments={breadcrumb} />
            </div>
            <CloseButton onClose={onCancel} />
          </div>
          <h2 className="m-0 text-window-title">{title}</h2>
        </div>
        <p className="m-0 text-lg opacity-70 [overflow-wrap:anywhere]">{description}</p>
        {details}

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleConfirm}
            disabled={confirming}
            aria-busy={confirming}
            className={`min-h-12 flex-1 rounded-lg px-3 text-lg font-bold transition-colors disabled:cursor-wait disabled:opacity-60 ${
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
            className="min-h-12 flex-1 rounded-lg border border-line px-3 text-lg font-semibold transition-colors hover:bg-surface-brand"
          >
            Cancelar
          </button>
        </div>
      </Dialog>
    </div>
  )
}
