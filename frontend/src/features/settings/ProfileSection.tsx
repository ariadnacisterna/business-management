import { useState, type FormEvent } from 'react'
import { ApiError } from '../../api/client'
import { CloseButton } from '../../shared/CloseButton'
import { ConfirmDialog } from '../../shared/ConfirmDialog'
import { PencilIcon } from '../../shared/icons'
import { useToast } from '../../shared/useToast'
import { useAuth } from '../access/useAuth'

const inputClasses =
  'h-14 w-full rounded-lg border border-line bg-surface px-3 text-lg focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/10'

function EditNameModal({
  currentName,
  onClose,
}: {
  currentName: string
  onClose: () => void
}) {
  const { changeName } = useAuth()
  const { showSuccess, showError } = useToast()
  const [name, setName] = useState(currentName)
  const [saving, setSaving] = useState(false)
  const [confirming, setConfirming] = useState(false)

  const trimmedName = name.trim()
  const hasChanges = trimmedName !== '' && trimmedName !== currentName

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!hasChanges || saving) return
    setConfirming(true)
  }

  async function handleConfirm() {
    setConfirming(false)
    setSaving(true)
    try {
      await changeName(trimmedName)
      showSuccess('Nombre cambiado.')
      onClose()
    } catch (error) {
      showError(
        error instanceof ApiError ? error.message : 'No se pudo cambiar el nombre. Intentá de nuevo.',
      )
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink/20 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <form
        onSubmit={handleSubmit}
        role="dialog"
        aria-label="Editar nombre"
        className="relative flex w-full max-w-sm flex-col gap-4 rounded-2xl bg-surface p-6 shadow-2xl"
      >
        <div className="flex items-start justify-between">
          <h2 className="m-0 text-2xl font-bold">Editar nombre</h2>
          <CloseButton onClose={onClose} />
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="text-lg font-semibold">Nombre</span>
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            disabled={saving}
            autoFocus
            className={inputClasses}
          />
        </label>

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={!hasChanges || saving}
            className="h-14 flex-1 whitespace-nowrap rounded-xl bg-brand px-4 text-lg font-bold text-brand-contrast transition-colors hover:bg-brand/90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Guardar
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="h-14 flex-1 whitespace-nowrap rounded-xl border border-line px-4 text-lg font-semibold transition-colors hover:bg-surface-brand"
          >
            Cancelar
          </button>
        </div>
      </form>

      {confirming && (
        <ConfirmDialog
          title="Cambiar nombre"
          description={`¿Cambiar tu nombre a "${trimmedName}"?`}
          confirmLabel="Confirmar"
          onConfirm={handleConfirm}
          onCancel={() => setConfirming(false)}
        />
      )}
    </div>
  )
}

export function ProfileSection() {
  const { account } = useAuth()
  const [editing, setEditing] = useState(false)

  if (account === null) return null

  const activeBusinessName = account.businesses.find(
    (business) => business.id === account.active_business_id,
  )?.name

  return (
    <section className="rounded-2xl border border-line bg-surface p-5" aria-labelledby="account-heading">
      <h2 id="account-heading" className="m-0 mb-4 text-2xl font-bold">
        Mi cuenta
      </h2>
      <dl className="m-0 flex flex-col gap-1">
        <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-start gap-x-3 text-lg">
          <dt className="py-1.5 opacity-60">Nombre</dt>
          <dd className="m-0 flex min-w-0 items-end gap-2 font-semibold">
            <span className="min-w-0 py-1.5 [overflow-wrap:anywhere]">{account.name}</span>
            <button
              type="button"
              onClick={() => setEditing(true)}
              aria-label="Editar nombre"
              title="Editar nombre"
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-ink/50 transition-colors hover:bg-surface-brand hover:text-brand"
            >
              <PencilIcon />
            </button>
          </dd>
        </div>
        <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-start gap-x-3 text-lg">
          <dt className="py-1.5 opacity-60">Usuario</dt>
          <dd className="m-0 min-w-0 py-1.5 text-left font-semibold [overflow-wrap:anywhere]">{account.user_name}</dd>
        </div>
        <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-start gap-x-3 text-lg">
          <dt className="py-1.5 opacity-60">Rol</dt>
          <dd className="m-0 min-w-0 py-1.5 text-left font-semibold [overflow-wrap:anywhere]">{account.role ?? '—'}</dd>
        </div>
        <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-start gap-x-3 text-lg">
          <dt className="py-1.5 opacity-60">Negocio</dt>
          <dd className="m-0 min-w-0 py-1.5 text-left font-semibold [overflow-wrap:anywhere]">{activeBusinessName ?? '—'}</dd>
        </div>
      </dl>

      {editing && <EditNameModal currentName={account.name} onClose={() => setEditing(false)} />}
    </section>
  )
}
