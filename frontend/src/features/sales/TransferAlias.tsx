import { useEffect, useRef, useState } from 'react'
import { activeBusiness, canEditTransferAlias } from '../access/roles'
import { useAuth } from '../access/useAuth'

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
        <span className="text-figure text-brand [overflow-wrap:anywhere]" data-testid="transfer-alias">
          {alias}
        </span>
        <button
          type="button"
          onClick={() => void copy()}
          className="min-h-12 rounded-lg border border-line bg-surface px-4 text-lg font-semibold transition-colors hover:bg-surface-brand"
        >
          {copied ? 'Copiado' : 'Copiar'}
        </button>
      </div>
    </div>
  )
}
