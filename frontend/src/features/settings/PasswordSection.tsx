import { useState, type FormEvent } from 'react'
import { changeOwnPassword } from '../../api/auth'
import { ApiError } from '../../api/client'
import { CloseButton } from '../../shared/CloseButton'
import { ConfirmDialog } from '../../shared/ConfirmDialog'
import { EyeIcon } from '../../shared/icons'
import { isPasswordSecure, PasswordChecklist } from '../../shared/passwordRules'
import { useToast } from '../../shared/Toast'

const inputClasses =
  'h-12 w-full rounded-lg border border-line bg-surface px-3 text-lg focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/10'
const inputErrorClasses = 'border-danger focus:border-danger focus:ring-danger/10'

function fieldClasses(hasError: boolean): string {
  return hasError ? `${inputClasses} ${inputErrorClasses}` : inputClasses
}

const primaryButtonClasses =
  'h-12 rounded-lg bg-brand px-5 text-base font-bold text-brand-contrast transition-colors hover:bg-brand/90 disabled:opacity-40'
const secondaryButtonClasses =
  'h-12 rounded-lg border border-line px-5 text-base font-semibold transition-colors hover:bg-surface-brand'

const SAVE_ERROR_MESSAGE = 'No se pudo cambiar la contraseña. Intentá de nuevo.'

function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const { showSuccess } = useToast()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [visible, setVisible] = useState(false)
  const [attempted, setAttempted] = useState(false)
  const [saving, setSaving] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  const currentError = currentPassword === '' ? 'Escribí tu contraseña actual.' : null
  const newError =
    newPassword === ''
      ? 'Escribí la contraseña nueva.'
      : !isPasswordSecure(newPassword)
        ? 'La contraseña nueva no cumple los requisitos.'
        : newPassword === currentPassword
          ? 'La contraseña nueva debe ser distinta de la actual.'
          : null
  const confirmationError =
    confirmation === ''
      ? 'Repetí la contraseña nueva.'
      : confirmation !== newPassword
        ? 'Las contraseñas no coinciden.'
        : null
  const isValid = currentError === null && newError === null && confirmationError === null
  const inputType = visible ? 'text' : 'password'

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setAttempted(true)
    setServerError(null)
    if (!isValid || saving) return
    setConfirming(true)
  }

  async function handleConfirm() {
    setConfirming(false)
    setSaving(true)
    try {
      await changeOwnPassword(currentPassword, newPassword)
      showSuccess('Contraseña cambiada. Se cerraron las demás sesiones abiertas de tu cuenta.')
      onClose()
    } catch (error) {
      setServerError(error instanceof ApiError ? error.message : SAVE_ERROR_MESSAGE)
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto p-4">
      <div className="absolute inset-0 bg-ink/20 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <form
        onSubmit={handleSubmit}
        noValidate
        role="dialog"
        aria-label="Cambiar contraseña"
        className="relative my-auto flex w-full max-w-sm flex-col gap-4 rounded-2xl bg-surface p-6 shadow-2xl"
      >
        <div className="flex items-start justify-between">
          <h2 className="m-0 text-2xl font-bold">Cambiar contraseña</h2>
          <CloseButton onClose={onClose} />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="flex flex-col gap-1.5">
            <span className="text-base font-semibold">
              Contraseña actual <span className="text-danger">*</span>
            </span>
            <input
              type={inputType}
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              disabled={saving}
              autoComplete="current-password"
              autoFocus
              className={fieldClasses(attempted && currentError !== null)}
            />
          </label>
          {attempted && currentError !== null && (
            <span role="alert" className="text-sm text-danger">
              {currentError}
            </span>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="flex flex-col gap-1.5">
            <span className="text-base font-semibold">
              Contraseña nueva <span className="text-danger">*</span>
            </span>
            <input
              type={inputType}
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              disabled={saving}
              autoComplete="new-password"
              className={fieldClasses(attempted && newError !== null)}
            />
          </label>
          {attempted && newError !== null && (
            <span role="alert" className="text-sm text-danger">
              {newError}
            </span>
          )}
          <PasswordChecklist password={newPassword} />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="flex flex-col gap-1.5">
            <span className="text-base font-semibold">
              Repetir contraseña <span className="text-danger">*</span>
            </span>
            <input
              type={inputType}
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              disabled={saving}
              autoComplete="new-password"
              className={fieldClasses(attempted && confirmationError !== null)}
            />
          </label>
          {attempted && confirmationError !== null && (
            <span role="alert" className="text-sm text-danger">
              {confirmationError}
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={() => setVisible((value) => !value)}
          aria-pressed={visible}
          className="flex h-12 items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-line px-4 text-base font-semibold transition-colors hover:bg-surface-brand"
        >
          <EyeIcon className="h-5 w-5" />
          {visible ? 'Ocultar contraseñas' : 'Mostrar contraseñas'}
        </button>

        {serverError !== null && (
          <p role="alert" className="m-0 rounded-lg bg-danger/10 px-4 py-3 text-base font-semibold text-danger">
            {serverError}
          </p>
        )}

        <div className="flex gap-2">
          <button type="submit" disabled={saving} className={`${primaryButtonClasses} flex-1`}>
            Cambiar
          </button>
          <button type="button" onClick={onClose} disabled={saving} className={`${secondaryButtonClasses} flex-1`}>
            Cancelar
          </button>
        </div>
      </form>

      {confirming && (
        <ConfirmDialog
          title="Cambiar contraseña"
          description="¿Cambiar tu contraseña? Se van a cerrar las demás sesiones abiertas de tu cuenta."
          confirmLabel="Confirmar"
          onConfirm={handleConfirm}
          onCancel={() => setConfirming(false)}
        />
      )}
    </div>
  )
}

export function PasswordSection() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-between gap-3 rounded-2xl border border-line bg-surface p-5 text-left text-2xl font-bold transition-colors hover:bg-surface-brand"
      >
        <span>Cambiar contraseña</span>
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-7 w-7 shrink-0 opacity-50"
        >
          <path d="M9 6l6 6-6 6" />
        </svg>
      </button>

      {open && <ChangePasswordModal onClose={() => setOpen(false)} />}
    </>
  )
}
