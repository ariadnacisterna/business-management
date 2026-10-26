import { CloseButton } from '../../shared/CloseButton'
import { Dialog } from '../../shared/Dialog'

interface Props {
  onClose: () => void
}

export function LoginHelpDialog({ onClose }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink/20 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />

      <Dialog
        role="alertdialog"
        label="¿Problemas para acceder?"
        onClose={onClose}
        className="relative flex max-h-[calc(100svh-2rem)] w-full max-w-sm flex-col gap-4 overflow-y-auto rounded-2xl bg-surface p-6 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3">
          <h2 className="m-0 text-window-title">¿Problemas para acceder?</h2>
          <CloseButton onClose={onClose} className="-mr-3 -mt-3" />
        </div>
        <p className="m-0 text-lg opacity-70">
          Para restablecer tu contraseña, pedile a un Administrador o Dueño que lo haga desde Usuarios. No se envían
          correos ni hay recuperación automática.
        </p>

        <button
          type="button"
          onClick={onClose}
          className="h-12 w-full rounded-lg bg-brand text-lg font-bold text-brand-contrast transition-colors hover:bg-brand/90"
        >
          Entendido
        </button>
      </Dialog>
    </div>
  )
}
