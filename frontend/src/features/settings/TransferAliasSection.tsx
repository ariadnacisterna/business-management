import { useState, type FormEvent } from 'react'
import { errorMessage } from '../../api/client'
import { useToast } from '../../shared/useToast'
import { activeBusiness, canEditTransferAlias } from '../access/roles'
import { useAuth } from '../access/useAuth'
import { TRANSFER_ALIAS_MAX_LENGTH, transferAliasProblem } from './transferAlias'

export function TransferAliasSection() {
  const { account, changeTransferAlias } = useAuth()
  const { showSuccess, showError } = useToast()
  const business = activeBusiness(account)
  const saved = business?.transfer_alias ?? ''
  const [text, setText] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState(false)

  if (business === null || !canEditTransferAlias(account)) return null

  const current = text ?? saved
  const problem = transferAliasProblem(current)
  const hasChanges = current.trim() !== saved

  function handleCancel() {
    setText(null)
    setEditing(false)
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (saving || !hasChanges || problem !== null) return
    setSaving(true)
    try {
      await changeTransferAlias(current.trim())
      setText(null)
      setEditing(false)
      showSuccess(current.trim() === '' ? 'Alias borrado.' : 'Alias guardado.')
    } catch (error) {
      showError(errorMessage(error, 'No se pudo guardar el alias. Intentá de nuevo.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="rounded-2xl border border-line bg-surface p-5" aria-labelledby="transfer-alias-heading">
      <h2 id="transfer-alias-heading" className="m-0 mb-1 text-window-title">
        Alias para transferencias
      </h2>
      <p className="m-0 mb-4 text-lg opacity-70">
        Es el alias de {business.name} que se muestra al cobrar con transferencia. Sin espacios, hasta {TRANSFER_ALIAS_MAX_LENGTH} caracteres. Es opcional.
      </p>
      {editing ? (
        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-3">
          <input
            type="text"
            value={current}
            onChange={(event) => setText(event.target.value)}
            aria-label="Alias para transferencias"
            aria-invalid={problem !== null || undefined}
            autoComplete="off"
            autoFocus
            className="h-14 min-w-0 rounded-lg border border-line bg-surface px-3 text-lg focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/10"
          />
          {problem !== null && (
            <p role="alert" className="m-0 text-lg text-danger">
              {problem}
            </p>
          )}
          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={!hasChanges || saving || problem !== null}
              className="h-14 flex-1 whitespace-nowrap rounded-lg bg-brand px-6 text-lg font-semibold text-brand-contrast transition-colors hover:bg-brand/90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
            <button
              type="button"
              onClick={handleCancel}
              disabled={saving}
              className="h-14 flex-1 rounded-lg border border-line px-6 text-lg font-semibold transition-colors hover:bg-surface-brand"
            >
              Cancelar
            </button>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="min-w-0 text-lg font-semibold [overflow-wrap:anywhere]">{saved === '' ? 'Sin alias' : saved}</span>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="h-14 shrink-0 rounded-lg border border-line px-6 text-lg font-semibold transition-colors hover:bg-surface-brand"
          >
            Editar
          </button>
        </div>
      )}
    </section>
  )
}
