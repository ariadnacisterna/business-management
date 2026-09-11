import { useEffect, useMemo, useState } from 'react'
import { changeShortageStatus, fetchCategories, fetchProviders, fetchShortages } from '../../api/catalog'
import { ApiError } from '../../api/client'
import type { Category, Provider, Shortage } from '../../api/types'
import { ConfirmDialog } from '../../shared/ConfirmDialog'
import { LoadErrorCard } from '../../shared/LoadErrorCard'
import { SelectMenu } from '../../shared/SelectMenu'
import { useToast } from '../../shared/Toast'

type Status = 'loading' | 'success' | 'error'
type StatusFilter = 'open' | 'faltante' | 'pedido' | 'recibido' | 'all'
type GroupBy = 'provider' | 'category'

const LOAD_ERROR_MESSAGE = 'No se pudieron cargar los faltantes.'

const STATUS_LABELS: Record<string, string> = {
  faltante: 'Faltante',
  pedido: 'Pedido',
  recibido: 'Recibido',
}

const primaryButtonClasses =
  'min-h-10 rounded-lg bg-brand px-3 text-sm font-bold text-brand-contrast transition-colors hover:bg-brand/90'
const secondaryButtonClasses =
  'min-h-10 rounded-lg border border-line px-3 text-sm font-semibold transition-colors hover:bg-surface-brand'

interface PendingTransition {
  shortage: Shortage
  nextStatus: string
  label: string
}

export function ShortagesPage() {
  const { showSuccess, showError } = useToast()

  const [shortages, setShortages] = useState<Shortage[]>([])
  const [providers, setProviders] = useState<Provider[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [status, setStatus] = useState<Status>('loading')
  const [loadError, setLoadError] = useState<string | null>(null)

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('open')
  const [groupBy, setGroupBy] = useState<GroupBy>('provider')
  const [pendingTransition, setPendingTransition] = useState<PendingTransition | null>(null)

  function load() {
    setStatus('loading')
    setLoadError(null)
    Promise.all([
      fetchShortages(statusFilter === 'open' || statusFilter === 'all' ? {} : { status: statusFilter }),
      fetchProviders(),
      fetchCategories(),
    ])
      .then(([shortageResult, providerResult, categoryResult]) => {
        const filtered =
          statusFilter === 'open'
            ? shortageResult.filter((item) => item.status === 'faltante' || item.status === 'pedido')
            : shortageResult
        setShortages(filtered)
        setProviders(providerResult)
        setCategories(categoryResult)
        setStatus('success')
      })
      .catch(() => {
        setLoadError(LOAD_ERROR_MESSAGE)
        setStatus('error')
      })
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [statusFilter])

  const groups = useMemo(() => {
    const map = new Map<string, { label: string; items: Shortage[] }>()
    for (const shortage of shortages) {
      const key =
        groupBy === 'provider'
          ? shortage.provider_id === null
            ? 'none'
            : String(shortage.provider_id)
          : String(shortage.category_id)
      const label =
        groupBy === 'provider'
          ? shortage.provider_id === null
            ? 'Sin proveedor'
            : (providers.find((provider) => provider.id === shortage.provider_id)?.name ?? 'Sin proveedor')
          : (categories.find((category) => category.id === shortage.category_id)?.name ?? '—')
      const existing = map.get(key)
      if (existing === undefined) {
        map.set(key, { label, items: [shortage] })
      } else {
        existing.items.push(shortage)
      }
    }
    return [...map.values()].sort((a, b) => a.label.localeCompare(b.label))
  }, [shortages, groupBy, providers, categories])

  function applyShortageUpdate(updated: Shortage) {
    setShortages((current) =>
      statusFilter === 'open' && updated.status === 'recibido'
        ? current.filter((item) => item.id !== updated.id)
        : current.map((item) => (item.id === updated.id ? updated : item)),
    )
  }

  function confirmTransition() {
    if (pendingTransition === null) return
    const { shortage, nextStatus } = pendingTransition
    setPendingTransition(null)
    changeShortageStatus(shortage.id, nextStatus)
      .then((updated) => {
        applyShortageUpdate(updated)
        showSuccess('Estado del faltante actualizado.')
      })
      .catch((error) => {
        showError(error instanceof ApiError ? error.message : 'No se pudo actualizar el faltante.')
      })
  }

  function shortageActions(shortage: Shortage) {
    if (shortage.status === 'faltante') {
      return [{ nextStatus: 'pedido', label: 'Marcar como pedido' }]
    }
    if (shortage.status === 'pedido') {
      return [
        { nextStatus: 'recibido', label: 'Marcar como recibido' },
        { nextStatus: 'faltante', label: 'Volver a faltante' },
      ]
    }
    return []
  }

  return (
    <section className="-m-4 flex flex-col gap-4 bg-line/10 p-4 md:-m-6 md:p-6">
      <div>
        <h1 className="text-3xl font-bold">Faltantes</h1>
        <p className="mt-1 text-base opacity-60 lg:text-lg">{shortages.length} faltantes encontrados</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <SelectMenu
          value={statusFilter}
          onChange={(value: StatusFilter) => setStatusFilter(value)}
          ariaLabel="Filtrar por estado"
          className="w-full sm:w-56"
          options={[
            { value: 'open', label: 'Abiertos (faltante y pedido)' },
            { value: 'faltante', label: 'Faltante' },
            { value: 'pedido', label: 'Pedido' },
            { value: 'recibido', label: 'Recibido' },
            { value: 'all', label: 'Todos' },
          ]}
        />
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setGroupBy('provider')}
            className={`min-h-12 rounded-lg border px-4 text-base font-semibold transition-colors ${
              groupBy === 'provider' ? 'border-brand bg-surface-brand text-brand' : 'border-line hover:bg-surface-brand'
            }`}
          >
            Agrupar por proveedor
          </button>
          <button
            type="button"
            onClick={() => setGroupBy('category')}
            className={`min-h-12 rounded-lg border px-4 text-base font-semibold transition-colors ${
              groupBy === 'category' ? 'border-brand bg-surface-brand text-brand' : 'border-line hover:bg-surface-brand'
            }`}
          >
            Agrupar por categoría
          </button>
        </div>
      </div>

      {status === 'loading' && <p role="status">Cargando…</p>}

      {status === 'error' && <LoadErrorCard message={loadError ?? LOAD_ERROR_MESSAGE} onRetry={load} />}

      {status === 'success' && shortages.length === 0 && (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-line bg-surface px-6 py-12 text-center">
          <p className="text-xl font-semibold">No hay faltantes que coincidan.</p>
        </div>
      )}

      {status === 'success' && shortages.length > 0 && (
        <div className="flex flex-col gap-5">
          {groups.map((group) => (
            <div key={group.label} className="flex flex-col gap-2">
              <h2 className="m-0 border-l-4 border-brand pl-3 text-base font-bold uppercase tracking-wide opacity-70">
                {group.label} ({group.items.length})
              </h2>
              <div className="flex flex-col gap-2">
                {group.items.map((shortage) => (
                  <div
                    key={shortage.id}
                    className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <p className="m-0 text-lg font-bold">{shortage.product_name}</p>
                      <span
                        className={`mt-1 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold ${
                          shortage.status === 'recibido'
                            ? 'bg-success-soft text-success'
                            : shortage.status === 'pedido'
                              ? 'bg-role-gerente-soft text-role-gerente'
                              : 'bg-danger/10 text-danger'
                        }`}
                      >
                        ● {STATUS_LABELS[shortage.status] ?? shortage.status}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {shortageActions(shortage).map((action) => (
                        <button
                          key={action.nextStatus}
                          type="button"
                          onClick={() =>
                            setPendingTransition({ shortage, nextStatus: action.nextStatus, label: action.label })
                          }
                          className={action.nextStatus === 'faltante' ? secondaryButtonClasses : primaryButtonClasses}
                        >
                          {action.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {pendingTransition !== null && (
        <ConfirmDialog
          title={pendingTransition.label}
          description={`"${pendingTransition.shortage.product_name}" va a pasar a estado "${
            STATUS_LABELS[pendingTransition.nextStatus] ?? pendingTransition.nextStatus
          }".`}
          confirmLabel={pendingTransition.label}
          onConfirm={confirmTransition}
          onCancel={() => setPendingTransition(null)}
        />
      )}
    </section>
  )
}
