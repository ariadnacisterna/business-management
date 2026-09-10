interface Props {
  onClose: () => void
}

export function LoginHelpDialog({ onClose }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink/20 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />

      <div
        role="alertdialog"
        aria-label="¿Problemas para acceder?"
        className="relative flex w-full max-w-sm flex-col gap-4 rounded-2xl bg-surface p-6 shadow-2xl"
      >
        <h2 className="m-0 text-2xl font-bold">¿Problemas para acceder?</h2>
        <p className="m-0 text-lg opacity-70">
          Para restablecer tu contraseña, pedile a un Administrador o Dueño que lo haga desde Cuentas. No se envían
          correos ni hay recuperación automática.
        </p>

        <button
          type="button"
          onClick={onClose}
          className="h-12 w-full rounded-lg bg-brand text-lg font-bold text-brand-contrast transition-colors hover:bg-brand/90"
        >
          Entendido
        </button>
      </div>
    </div>
  )
}
