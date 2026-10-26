import { useEffect, useRef, useState } from 'react'
import { activeBusiness, canEditTransferAlias } from '../access/roles'
import { useAuth } from '../access/useAuth'
import { CheckIcon, CopyIcon } from '../../shared/icons'

const COPIED_MILLISECONDS = 2500

export function TransferAlias() {
  const { account } = useAuth()
  const alias = activeBusiness(account)?.transfer_alias ?? null
  const [copied, setCopied] = useState(false)
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => () => window.clearTimeout(timer.current), [])

  async function copy() {
    if (alias === null) return
    try {
      await navigator.clipboard.writeText(alias)
    } catch {
      return
    }
    setCopied(true)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setCopied(false), COPIED_MILLISECONDS)
  }

  if (alias === null) {
    return (
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <span className="text-xl font-semibold">Alias</span>
          <span className="text-lg opacity-50">Sin alias cargado</span>
        </div>
        {canEditTransferAlias(account) && (
          <a href="/configuraciones" target="_blank" rel="noreferrer" className="self-end text-lg font-semibold text-brand underline">
            Cargar el alias en Configuración
          </a>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <span className="text-xl font-semibold">Alias</span>
      <div className="flex flex-wrap items-center justify-end gap-3">
        <span className="text-body font-semibold text-brand [overflow-wrap:anywhere]" data-testid="transfer-alias">
          {alias}
        </span>
        <button
          type="button"
          onClick={() => void copy()}
          aria-label="Copiar alias"
          title="Copiar alias"
          className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-line bg-surface transition-colors hover:bg-surface-brand"
        >
          {copied ? <CheckIcon className="h-6 w-6 text-brand" /> : <CopyIcon className="h-6 w-6" />}
        </button>
        <span role="status" className="sr-only">
          {copied ? 'Alias copiado' : ''}
        </span>
      </div>
    </div>
  )
}
