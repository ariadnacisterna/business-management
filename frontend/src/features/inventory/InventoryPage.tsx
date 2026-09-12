import { useEffect, useRef, useState } from 'react'
import {
  adjustStock,
  createMovementReason,
  fetchCategories,
  fetchMovementReasons,
  fetchStock,
  fetchStockMovements,
  fetchStockPage,
  fetchUnits,
  setMinimumStock,
} from '../../api/catalog'
import { ApiError } from '../../api/client'
import type { Category, MovementReason, Stock, StockMovement, Unit } from '../../api/types'
import { ConfirmDialog } from '../../shared/ConfirmDialog'
import { CloseButton } from '../../shared/CloseButton'
import { FieldRow } from '../../shared/FieldRow'
import { FiltersButton, FiltersSheet } from '../../shared/FiltersSheet'
import { LoadErrorCard } from '../../shared/LoadErrorCard'
import { Pagination } from '../../shared/Pagination'
import { SearchInput } from '../../shared/SearchInput'
import { SelectMenu } from '../../shared/SelectMenu'
import { useToast } from '../../shared/Toast'
import { firstName } from '../../shared/formatName'
import { formatRelativeTime } from '../../shared/formatRelativeTime'
import { useScrollbar } from '../../shared/useScrollbar'
import { useTableScrollbar } from '../../shared/useTableScrollbar'
import type { ViewMode } from '../../shared/ViewToggle'
import { ViewToggle } from '../../shared/ViewToggle'
import { useAuth } from '../access/AuthContext'
import { canManageCatalog } from '../access/roles'
import { fetchStockSummary, type StockRow, type StockSummary } from './stockRows'

type LoadStatus = 'loading' | 'success' | 'error'
type QuickFilter = 'all' | 'normal' | 'stock_bajo' | 'sin_stock'
const EMPTY_SUMMARY: StockSummary = { total: 0, stockBajo: 0, sinStock: 0 }

const LOAD_ERROR_MESSAGE = 'No se pudo cargar el inventario.'
const SAVE_ERROR_MESSAGE = 'No se pudo guardar el ajuste. Intentá de nuevo.'
const CREATE_REASON_ERROR_MESSAGE = 'No se pudo crear el motivo. Intentá de nuevo.'
const HISTORY_LOAD_ERROR_MESSAGE = 'No se pudo cargar el historial.'
const MINIMUM_SAVE_ERROR_MESSAGE = 'No se pudo guardar el stock mínimo. Intentá de nuevo.'

const CREATE_NEW_REASON_OPTION = '__create__'

const inputClasses =
  'h-12 w-full rounded-lg border border-line bg-surface px-3 text-lg focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/10'
const editedInputClasses =
  'h-12 w-full rounded-lg border-2 border-brand bg-surface px-3 text-lg font-semibold focus:outline-none focus:ring-2 focus:ring-brand/10'
const secondaryButtonClasses =
  'h-12 rounded-lg border border-line px-5 text-base font-semibold transition-colors hover:bg-surface-brand'

const STATUS_LABELS: Record<string, string> = {
  normal: 'Normal',
  stock_bajo: 'Stock bajo',
  sin_stock: 'Sin stock',
}

function statusClasses(status: string): string {
  if (status === 'sin_stock') return 'bg-danger/10 text-danger'
  if (status === 'stock_bajo') return 'bg-warning/10 text-warning'
  return 'bg-success-soft text-success'
}

function statusTextColor(status: string): string {
  if (status === 'sin_stock') return 'text-danger'
  if (status === 'stock_bajo') return 'text-warning'
  return 'text-success'
}

function variantLabel(row: StockRow): string {
  return row.variant_label === null || row.variant_label === ''
    ? row.product_name
    : `${row.product_name} · ${row.variant_label}`
}

function variantDisplayLabel(row: StockRow): string {
  return row.variant_label === null || row.variant_label === '' ? 'Estándar' : row.variant_label
}

function lastChangeLabel(row: StockRow): string {
  if (row.last_movement_at === null || row.last_movement_by_account_name === null) return 'Sin registro'
  return `${formatRelativeTime(row.last_movement_at)} por ${firstName(row.last_movement_by_account_name)}`
}

function HistoryIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-6 w-6"
    >
      <circle cx="12" cy="12" r="9" />
      <polyline points="12 7 12 12 15.5 14" />
    </svg>
  )
}

function ModalBreadcrumb({ row, action }: { row: StockRow; action: string }) {
  return (
    <p className="m-0 text-base opacity-60">
      Inventario › {variantLabel(row)} › <span className="text-brand">{action}</span>
    </p>
  )
}

function EditIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  )
}

function MinimumStockDisplay({
  row,
  onEdit,
  showLabel = true,
  unit = '',
}: {
  row: StockRow
  onEdit: () => void
  showLabel?: boolean
  unit?: string
}) {
  return (
    <div className="flex items-center justify-between gap-3 text-lg">
      <div className="flex items-center gap-1">
        {showLabel && <span className="shrink-0 opacity-60">Stock mín.</span>}
        <button
          type="button"
          onClick={onEdit}
          aria-label={`Editar stock mínimo de ${variantLabel(row)}`}
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-ink/50 transition-colors hover:bg-surface-brand hover:text-brand"
        >
          <EditIcon />
        </button>
      </div>
      <span className="font-semibold">
        {row.effective_minimum_quantity} <span className="text-base font-normal opacity-70">{unit}</span>
      </span>
    </div>
  )
}

function MinimumStockEditor({
  row,
  onUpdated,
}: {
  row: StockRow
  onUpdated: (variantId: number, stock: Stock) => void
}) {
  const { showError } = useToast()
  const [value, setValue] = useState('')
  const [saving, setSaving] = useState(false)

  const trimmed = value.trim()
  const parsedQuantity = Number(trimmed)
  const quantityValid = trimmed !== '' && Number.isInteger(parsedQuantity) && parsedQuantity >= 0
  const edited = quantityValid && parsedQuantity !== row.effective_minimum_quantity

  async function save() {
    if (!edited) return

    setSaving(true)
    try {
      const stock = await setMinimumStock(row.variant_id, parsedQuantity)
      onUpdated(row.variant_id, stock)
    } catch (error) {
      showError(error instanceof ApiError ? error.message : MINIMUM_SAVE_ERROR_MESSAGE)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="grid grid-cols-[1fr_auto] gap-2">
      <input
        type="number"
        min={0}
        step={1}
        value={value}
        placeholder={String(row.effective_minimum_quantity)}
        onChange={(event) => setValue(event.target.value)}
        aria-label={`Nuevo stock mínimo para ${variantLabel(row)}`}
        disabled={saving}
        className={
          edited
            ? 'h-12 w-full rounded-lg border-2 border-brand bg-surface px-3 text-lg font-semibold focus:outline-none focus:ring-2 focus:ring-brand/10'
            : 'h-12 w-full rounded-lg border border-line bg-surface px-3 text-lg focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/10'
        }
      />
      <button
        type="button"
        onClick={save}
        disabled={!edited || saving}
        className="h-12 rounded-lg bg-brand px-5 text-base font-bold text-brand-contrast transition-colors hover:bg-brand/90 disabled:cursor-not-allowed disabled:bg-line disabled:text-ink/40"
      >
        Actualizar
      </button>
    </div>
  )
}

function StockRowEditor({
  row,
  reasons,
  onReasonCreated,
  onRequestAdjust,
}: {
  row: StockRow
  reasons: MovementReason[]
  onReasonCreated: (reason: MovementReason) => void
  onRequestAdjust: (quantity: number, reasonId: number) => void
}) {
  const activeReasons = reasons.filter((reason) => reason.status === 'active')
  const [quantity, setQuantity] = useState('')
  const [reasonId, setReasonId] = useState('')
  const [creatingReason, setCreatingReason] = useState(false)
  const [newReasonName, setNewReasonName] = useState('')
  const [savingNewReason, setSavingNewReason] = useState(false)
  const [newReasonError, setNewReasonError] = useState<string | null>(null)

  useEffect(() => {
    setQuantity('')
    setReasonId('')
  }, [row.quantity])

  async function handleCreateReason() {
    const trimmed = newReasonName.trim()
    if (trimmed === '') return
    setSavingNewReason(true)
    setNewReasonError(null)
    try {
      const created = await createMovementReason(trimmed)
      onReasonCreated(created)
      setReasonId(String(created.id))
      setCreatingReason(false)
      setNewReasonName('')
    } catch (error) {
      setNewReasonError(error instanceof ApiError ? error.message : CREATE_REASON_ERROR_MESSAGE)
    } finally {
      setSavingNewReason(false)
    }
  }

  const parsedQuantity = Number(quantity)
  const quantityValid =
    quantity.trim() !== '' && Number.isInteger(parsedQuantity) && parsedQuantity >= 0
  const edited = quantityValid && parsedQuantity !== row.quantity && reasonId !== ''

  return (
    <div className="flex w-full flex-col gap-2">
      <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-[96px_1fr_110px]">
        <input
          type="number"
          min={0}
          step={1}
          value={quantity}
          placeholder={String(row.quantity)}
          onChange={(event) => setQuantity(event.target.value)}
          aria-label={`Cantidad nueva para ${variantLabel(row)}`}
          className={edited ? editedInputClasses : inputClasses}
        />
        <SelectMenu
          value={reasonId}
          onChange={(value) => {
            if (value === CREATE_NEW_REASON_OPTION) {
              setCreatingReason(true)
              return
            }
            setReasonId(value)
          }}
          ariaLabel={`Motivo del ajuste para ${variantLabel(row)}`}
          className="w-full"
          options={[
            { value: '', label: 'Motivo' },
            ...activeReasons.map((reason) => ({ value: String(reason.id), label: reason.name })),
            { value: CREATE_NEW_REASON_OPTION, label: '+ Crear motivo nuevo…' },
          ]}
        />
        <button
          type="button"
          disabled={!edited}
          onClick={() => onRequestAdjust(parsedQuantity, Number(reasonId))}
          className={
            edited
              ? 'h-12 w-full rounded-lg bg-brand px-3 text-base font-bold text-brand-contrast transition-colors hover:bg-brand/90'
              : 'h-12 w-full cursor-not-allowed rounded-lg bg-line px-3 text-base font-bold text-ink/40'
          }
        >
          Actualizar
        </button>
      </div>

      {creatingReason && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line p-3">
          <input
            type="text"
            aria-label="Nombre del motivo nuevo"
            placeholder="Nombre del motivo"
            value={newReasonName}
            onChange={(event) => setNewReasonName(event.target.value)}
            disabled={savingNewReason}
            className="h-12 rounded-lg border border-line bg-surface px-3 text-lg focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/10"
          />
          <button
            type="button"
            onClick={handleCreateReason}
            disabled={savingNewReason || newReasonName.trim() === ''}
            className={secondaryButtonClasses}
          >
            Crear
          </button>
          <button
            type="button"
            onClick={() => {
              setCreatingReason(false)
              setNewReasonName('')
              setNewReasonError(null)
            }}
            disabled={savingNewReason}
            className={secondaryButtonClasses}
          >
            Cancelar
          </button>
          {newReasonError !== null && (
            <p role="alert" className="m-0 w-full text-base text-danger">
              {newReasonError}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

const STOCK_SEARCH_DEBOUNCE_MS = 300

interface StockFilters {
  page: number
  pageSize: number
  categoryId: number | 'all'
  quickFilter: QuickFilter
}

const DEFAULT_STOCK_FILTERS: StockFilters = { page: 1, pageSize: 25, categoryId: 'all', quickFilter: 'all' }

interface AdjustConfirmState {
  row: StockRow
  quantity: number
  reasonId: number
}

interface HistoryState {
  row: StockRow
  status: 'loading' | 'success' | 'error'
  movements: StockMovement[]
}

function StockTab({
  canManage,
  categories,
  units,
  reasons,
  onReasonCreated,
  criticalSignal,
  viewMode,
  onAdjusted,
}: {
  canManage: boolean
  categories: Category[]
  units: Unit[]
  reasons: MovementReason[]
  onReasonCreated: (reason: MovementReason) => void
  criticalSignal: number
  viewMode: ViewMode
  onAdjusted: () => void
}) {
  const { showSuccess, showError } = useToast()
  const [items, setItems] = useState<StockRow[]>([])
  const [total, setTotal] = useState(0)
  const [status, setStatus] = useState<LoadStatus>('loading')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [searchInput, setSearchInput] = useState('')
  const [appliedSearch, setAppliedSearch] = useState('')
  const [filters, setFilters] = useState<StockFilters>(DEFAULT_STOCK_FILTERS)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [confirmState, setConfirmState] = useState<AdjustConfirmState | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [historyState, setHistoryState] = useState<HistoryState | null>(null)
  const [adjustingRow, setAdjustingRow] = useState<StockRow | null>(null)
  const [editingMinimumRow, setEditingMinimumRow] = useState<StockRow | null>(null)

  const lastCriticalSignal = useRef(criticalSignal)

  const { tableScrollRef, theadRef, scrollbar, updateScrollbar, handleThumbPointerDown } = useTableScrollbar([
    items,
    viewMode,
  ])
  const {
    scrollRef: cardScrollRef,
    scrollbar: cardScrollbar,
    updateScrollbar: updateCardScrollbar,
    handleThumbPointerDown: handleCardThumbPointerDown,
  } = useScrollbar([items, viewMode])
  const {
    scrollRef: historyScrollRef,
    scrollbar: historyScrollbar,
    updateScrollbar: updateHistoryScrollbar,
    handleThumbPointerDown: handleHistoryThumbPointerDown,
  } = useScrollbar([historyState])

  useEffect(() => {
    if (criticalSignal === lastCriticalSignal.current) return
    lastCriticalSignal.current = criticalSignal
    setFilters((current) => ({ ...current, quickFilter: 'sin_stock', page: 1 }))
  }, [criticalSignal])

  useEffect(() => {
    const timer = setTimeout(() => {
      setAppliedSearch(searchInput)
      setFilters((current) => (current.page === 1 ? current : { ...current, page: 1 }))
    }, STOCK_SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [searchInput])

  function load() {
    setStatus('loading')
    setLoadError(null)
    fetchStockPage({
      page: filters.page,
      pageSize: filters.pageSize,
      categoryId: filters.categoryId === 'all' ? undefined : filters.categoryId,
      search: appliedSearch.trim() === '' ? undefined : appliedSearch.trim(),
      quickFilter: filters.quickFilter === 'all' ? undefined : filters.quickFilter,
    })
      .then((result) => {
        setItems(result.items)
        setTotal(result.total)
        setStatus('success')
      })
      .catch(() => {
        setLoadError(LOAD_ERROR_MESSAGE)
        setStatus('error')
      })
  }

  useEffect(load, [filters.page, filters.pageSize, filters.categoryId, filters.quickFilter, appliedSearch])

  const totalPages = Math.max(1, Math.ceil(total / filters.pageSize))

  function categoryName(categoryId: number): string {
    return categories.find((category) => category.id === categoryId)?.name ?? '—'
  }

  function unitAbbreviation(unitId: number): string {
    return units.find((unit) => unit.id === unitId)?.abbreviation ?? ''
  }

  function applyRowUpdate(variantId: number, stock: Stock) {
    setItems((current) =>
      current.map((row) =>
        row.variant_id === variantId
          ? {
              ...row,
              quantity: stock.quantity,
              minimum_quantity: stock.minimum_quantity,
              effective_minimum_quantity: stock.effective_minimum_quantity,
              status: stock.status,
            }
          : row,
      ),
    )
  }

  function requestAdjust(row: StockRow, quantity: number, reasonId: number) {
    setConfirmState({ row, quantity, reasonId })
  }

  async function confirmAdjust() {
    if (confirmState === null) return
    setConfirming(true)
    try {
      await adjustStock(confirmState.row.variant_id, {
        quantity: confirmState.quantity,
        reason_id: confirmState.reasonId,
      })
      const stock = await fetchStock(confirmState.row.variant_id)
      applyRowUpdate(confirmState.row.variant_id, stock)
      setConfirmState(null)
      showSuccess('Stock ajustado.')
      onAdjusted()
    } catch (error) {
      showError(error instanceof ApiError ? error.message : SAVE_ERROR_MESSAGE)
      setConfirmState(null)
    } finally {
      setConfirming(false)
    }
  }

  function openHistory(row: StockRow) {
    setHistoryState({ row, status: 'loading', movements: [] })
    fetchStockMovements(row.variant_id)
      .then((movements) => setHistoryState({ row, status: 'success', movements }))
      .catch(() => setHistoryState({ row, status: 'error', movements: [] }))
  }

  function reasonName(reasonId: number): string {
    return reasons.find((reason) => reason.id === reasonId)?.name ?? '—'
  }

  const hasActiveFilters = searchInput !== '' || filters.categoryId !== 'all' || filters.quickFilter !== 'all'

  function clearFilters() {
    setSearchInput('')
    setAppliedSearch('')
    setFilters(DEFAULT_STOCK_FILTERS)
  }

  const filterControls = (
    <>
      <SelectMenu
        value={filters.quickFilter}
        onChange={(value) =>
          setFilters((current) => ({ ...current, quickFilter: value as QuickFilter, page: 1 }))
        }
        ariaLabel="Filtrar por estado de stock"
        className="w-full lg:w-56"
        options={[
          { value: 'all', label: 'Todos los estados' },
          { value: 'normal', label: 'Con stock' },
          { value: 'stock_bajo', label: 'Bajo' },
          { value: 'sin_stock', label: 'Crítico' },
        ]}
      />
      <SelectMenu
        value={filters.categoryId === 'all' ? 'all' : String(filters.categoryId)}
        onChange={(value) =>
          setFilters((current) => ({
            ...current,
            categoryId: value === 'all' ? 'all' : Number(value),
            page: 1,
          }))
        }
        ariaLabel="Filtrar por categoría"
        className="w-full lg:w-56"
        options={[
          { value: 'all', label: 'Todas las categorías' },
          ...categories.map((category) => ({ value: String(category.id), label: category.name })),
        ]}
      />
      <SelectMenu
        value={String(filters.pageSize)}
        onChange={(value) => setFilters((current) => ({ ...current, pageSize: Number(value), page: 1 }))}
        ariaLabel="Cantidad por página"
        className="w-full lg:w-56"
        options={[
          { value: '10', label: '10 por página' },
          { value: '25', label: '25 por página' },
          { value: '50', label: '50 por página' },
        ]}
      />
      <button
        type="button"
        disabled={!hasActiveFilters}
        onClick={clearFilters}
        className="h-12 w-full rounded-lg border-2 border-brand bg-surface text-lg font-semibold text-brand transition-colors hover:bg-brand hover:text-brand-contrast disabled:cursor-not-allowed disabled:border-line disabled:bg-surface disabled:font-normal disabled:text-ink/40 disabled:hover:bg-surface disabled:hover:text-ink/40 lg:w-56"
      >
        Limpiar búsqueda
      </button>
    </>
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <FiltersSheet open={filtersOpen} onOpenChange={setFiltersOpen}>
        {filterControls}
      </FiltersSheet>
      <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center">
        <SearchInput
          value={searchInput}
          onChange={setSearchInput}
          placeholder="Buscar producto…"
          ariaLabel="Buscar producto"
          className="lg:min-w-40 lg:flex-1"
        />
        <div className="lg:hidden">
          <FiltersButton onClick={() => setFiltersOpen(true)} hasActiveFilters={hasActiveFilters} widthClassName="w-full" />
        </div>
        <div className="hidden flex-wrap items-center gap-3 lg:flex">{filterControls}</div>
      </div>

      {status === 'loading' && (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-line bg-surface px-6 py-12 text-center" role="status">
          <span className="h-10 w-10 animate-spin rounded-full border-4 border-line border-t-brand" />
          <p className="text-xl font-semibold">Cargando…</p>
        </div>
      )}

      {status === 'error' && <LoadErrorCard message={loadError ?? LOAD_ERROR_MESSAGE} onRetry={load} />}

      {status === 'success' && items.length === 0 && (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-line bg-surface px-6 py-12 text-center">
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-10 w-10 opacity-40"
          >
            <circle cx="11" cy="11" r="7" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <p className="text-xl font-semibold">No hay variantes que coincidan.</p>
          <p className="text-lg opacity-60">Probá cambiar la búsqueda o el filtro.</p>
        </div>
      )}

      {status === 'success' && items.length > 0 && viewMode === 'table' && (
        <div className="relative flex min-h-0 shrink flex-col overflow-hidden rounded-xl border border-line bg-surface lg:flex-1">
          <div
            ref={tableScrollRef}
            onScroll={updateScrollbar}
            className="scrollbar-hidden min-h-0 overflow-auto lg:flex-1"
          >
            <table className="w-full min-w-[1100px]">
              <thead ref={theadRef} className="sticky top-0 z-10">
                <tr className="table-header border-b border-line">
                  <th className="w-64 px-4 py-3 text-left text-sm font-bold uppercase tracking-wide opacity-60">Producto</th>
                  <th className="whitespace-nowrap px-4 py-3 text-left text-sm font-bold uppercase tracking-wide opacity-60">Variante</th>
                  <th className="whitespace-nowrap px-4 py-3 text-left text-sm font-bold uppercase tracking-wide opacity-60">Categoría</th>
                  <th className="whitespace-nowrap px-4 py-3 text-left text-sm font-bold uppercase tracking-wide opacity-60">Stock actual</th>
                  <th className="whitespace-nowrap px-4 py-3 text-left text-sm font-bold uppercase tracking-wide opacity-60">Estado</th>
                  {canManage && (
                    <th className="whitespace-nowrap px-4 py-3 text-left text-sm font-bold uppercase tracking-wide opacity-60">Stock mín.</th>
                  )}
                  {canManage && (
                    <th className="whitespace-nowrap px-4 py-3 text-left text-sm font-bold uppercase tracking-wide opacity-60">Último cambio</th>
                  )}
                  {canManage && <th className="px-4 py-3" />}
                </tr>
              </thead>
              <tbody>
                {items.map((row) => (
                  <tr key={row.variant_id} className="border-t border-line transition-colors hover:bg-surface-brand/60">
                    <td className="w-64 px-4 py-3 text-lg font-medium">{row.product_name}</td>
                    <td className="px-4 py-3 text-lg opacity-70">{variantDisplayLabel(row)}</td>
                    <td className="px-4 py-3 text-lg opacity-70">{categoryName(row.category_id)}</td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <span className="inline-flex items-center gap-1">
                        <span className="inline-flex min-w-[64px] items-baseline gap-1">
                          <span className="text-xl font-bold text-brand">{row.quantity}</span>
                          <span className="text-lg opacity-70">{unitAbbreviation(row.unit_id)}</span>
                        </span>
                        {canManage && (
                          <button
                            type="button"
                            onClick={() => setAdjustingRow(row)}
                            aria-label={`Ajustar stock de ${variantLabel(row)}`}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-ink/50 transition-colors hover:bg-surface-brand hover:text-brand"
                          >
                            <EditIcon />
                          </button>
                        )}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-base font-semibold ${statusClasses(row.status)}`}>
                        ● {STATUS_LABELS[row.status] ?? row.status}
                      </span>
                    </td>
                    {canManage && (
                      <td className="whitespace-nowrap px-4 py-3">
                        <span className="inline-flex items-center gap-1">
                          <span className="inline-flex min-w-[64px] items-baseline gap-1 text-lg">
                            <span className="font-semibold">{row.effective_minimum_quantity}</span>
                            <span className="opacity-70">{unitAbbreviation(row.unit_id)}</span>
                          </span>
                          <button
                            type="button"
                            onClick={() => setEditingMinimumRow(row)}
                            aria-label={`Editar stock mínimo de ${variantLabel(row)}`}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-ink/50 transition-colors hover:bg-surface-brand hover:text-brand"
                          >
                            <EditIcon />
                          </button>
                        </span>
                      </td>
                    )}
                    {canManage && (
                      <td className="px-4 py-3 text-lg opacity-70">{lastChangeLabel(row)}</td>
                    )}
                    {canManage && (
                      <td className="px-4 py-3 text-center">
                        <button
                          type="button"
                          onClick={() => openHistory(row)}
                          aria-label={`Ver historial de stock de ${variantLabel(row)}`}
                          className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-ink/50 transition-colors hover:bg-surface-brand hover:text-brand"
                        >
                          <HistoryIcon />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {scrollbar.visible && (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute right-0 w-3 rounded-full bg-line/40"
              style={{ top: scrollbar.headerHeight, bottom: 0 }}
            >
              <div
                onPointerDown={handleThumbPointerDown}
                className="pointer-events-auto absolute right-0 w-3 cursor-grab rounded-full bg-brand active:cursor-grabbing"
                style={{ top: scrollbar.thumbTop - scrollbar.headerHeight, height: scrollbar.thumbHeight }}
              />
            </div>
          )}
        </div>
      )}

      {status === 'success' && items.length > 0 && viewMode === 'cards' && (
        <div className="relative flex min-h-0 shrink flex-col lg:flex-1">
          <div
            ref={cardScrollRef}
            onScroll={updateCardScrollbar}
            className="scrollbar-hidden lg:min-h-0 lg:flex-1 lg:overflow-auto lg:pr-5"
          >
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-3">
              {items.map((row) => (
                <div key={row.variant_id} className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4">
                  <div className="flex items-start justify-between gap-3 border-b border-line pb-3">
                    <div className="min-h-20">
                      <p className="line-clamp-2 text-xl font-bold leading-tight">{row.product_name}</p>
                      <p className="mt-0.5 text-lg opacity-60">{variantDisplayLabel(row)}</p>
                    </div>
                    <span className={`whitespace-nowrap text-2xl font-bold ${statusTextColor(row.status)}`}>
                      {row.quantity} <span className="text-base font-normal opacity-60">{unitAbbreviation(row.unit_id)}</span>
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <span className="text-lg opacity-60">Estado</span>
                    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1 text-sm font-semibold ${statusClasses(row.status)}`}>
                      ● {STATUS_LABELS[row.status] ?? row.status}
                    </span>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <FieldRow label="Categoría" value={categoryName(row.category_id)} />
                    {canManage ? (
                      <MinimumStockDisplay
                        row={row}
                        onEdit={() => setEditingMinimumRow(row)}
                        unit={unitAbbreviation(row.unit_id)}
                      />
                    ) : (
                      <FieldRow
                        label="Stock mín."
                        value={`${row.effective_minimum_quantity} ${unitAbbreviation(row.unit_id)}`}
                      />
                    )}
                  </div>

                  {canManage && (
                    <StockRowEditor
                      row={row}
                      reasons={reasons}
                      onReasonCreated={onReasonCreated}
                      onRequestAdjust={(quantity, reasonId) => requestAdjust(row, quantity, reasonId)}
                    />
                  )}
                  {canManage && <FieldRow label="Último cambio" value={lastChangeLabel(row)} />}
                  {canManage && (
                    <button
                      type="button"
                      onClick={() => openHistory(row)}
                      aria-label={`Ver historial de stock de ${variantLabel(row)}`}
                      className="flex h-12 items-center justify-center gap-2 rounded-lg border border-line text-base font-semibold text-ink/70 transition-colors hover:bg-surface-brand hover:text-brand"
                    >
                      <HistoryIcon />
                      Ver historial
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {cardScrollbar.visible && (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute right-0 top-0 hidden w-3 rounded-full bg-line/40 lg:block"
              style={{ bottom: 0 }}
            >
              <div
                onPointerDown={handleCardThumbPointerDown}
                className="pointer-events-auto absolute right-0 w-3 cursor-grab rounded-full bg-brand active:cursor-grabbing"
                style={{ top: cardScrollbar.thumbTop, height: cardScrollbar.thumbHeight }}
              />
            </div>
          )}
        </div>
      )}

      {status === 'success' && total > 0 && (
        <div className="mt-auto pt-1">
          <Pagination
            page={filters.page}
            totalPages={totalPages}
            onPageChange={(page) => setFilters((current) => ({ ...current, page }))}
          />
        </div>
      )}

      {adjustingRow !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-ink/20 backdrop-blur-sm" onClick={() => setAdjustingRow(null)} aria-hidden="true" />
          <div
            role="dialog"
            aria-label={`Ajustar stock de ${variantLabel(adjustingRow)}`}
            className="relative flex w-full max-w-md flex-col gap-4 rounded-2xl bg-surface p-6 shadow-2xl"
          >
            <div className="flex items-start justify-between">
              <div>
                <ModalBreadcrumb row={adjustingRow} action="Editar stock actual" />
                <h2 className="m-0 text-2xl font-bold">Ajustar stock</h2>
              </div>
              <CloseButton onClose={() => setAdjustingRow(null)} />
            </div>
            <StockRowEditor
              row={adjustingRow}
              reasons={reasons}
              onReasonCreated={onReasonCreated}
              onRequestAdjust={(quantity, reasonId) => {
                requestAdjust(adjustingRow, quantity, reasonId)
                setAdjustingRow(null)
              }}
            />
          </div>
        </div>
      )}

      {editingMinimumRow !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-ink/20 backdrop-blur-sm" onClick={() => setEditingMinimumRow(null)} aria-hidden="true" />
          <div
            role="dialog"
            aria-label={`Editar stock mínimo de ${variantLabel(editingMinimumRow)}`}
            className="relative flex w-full max-w-sm flex-col gap-4 rounded-2xl bg-surface p-6 shadow-2xl"
          >
            <div className="flex items-start justify-between">
              <div>
                <ModalBreadcrumb row={editingMinimumRow} action="Editar stock mínimo" />
                <h2 className="m-0 text-2xl font-bold">Stock mínimo</h2>
              </div>
              <CloseButton onClose={() => setEditingMinimumRow(null)} />
            </div>
            <MinimumStockEditor
              row={editingMinimumRow}
              onUpdated={(variantId, stock) => {
                applyRowUpdate(variantId, stock)
                setEditingMinimumRow(null)
              }}
            />
          </div>
        </div>
      )}

      {confirmState !== null && (
        <ConfirmDialog
          title="Ajustar stock"
          description={`El stock de "${variantLabel(confirmState.row)}" va a pasar de ${confirmState.row.quantity} a ${confirmState.quantity}.`}
          confirmLabel={confirming ? 'Guardando…' : 'Ajustar'}
          onConfirm={confirmAdjust}
          onCancel={() => setConfirmState(null)}
        />
      )}

      {historyState !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-ink/20 backdrop-blur-sm" onClick={() => setHistoryState(null)} aria-hidden="true" />
          <div
            role="dialog"
            aria-label={`Historial de stock de ${variantLabel(historyState.row)}`}
            className="relative flex max-h-[80vh] w-full max-w-lg flex-col gap-4 rounded-2xl bg-surface p-6 shadow-2xl"
          >
            <div className="flex items-start justify-between">
              <div>
                <ModalBreadcrumb row={historyState.row} action="Historial de stock" />
                <h2 className="m-0 text-2xl font-bold">Historial de stock</h2>
              </div>
              <CloseButton onClose={() => setHistoryState(null)} />
            </div>

            {historyState.status === 'loading' && <p role="status">Cargando…</p>}
            {historyState.status === 'error' && (
              <p role="alert" className="text-lg text-danger">
                {HISTORY_LOAD_ERROR_MESSAGE}
              </p>
            )}
            {historyState.status === 'success' && historyState.movements.length === 0 && (
              <p className="text-lg opacity-60">Todavía no hay movimientos registrados.</p>
            )}
            {historyState.status === 'success' && historyState.movements.length > 0 && (
              <div className="relative min-h-0 flex-1">
                <div
                  ref={historyScrollRef}
                  onScroll={updateHistoryScrollbar}
                  className="scrollbar-hidden h-full overflow-auto pr-5"
                >
                  <ul className="flex flex-col gap-3">
                    {[...historyState.movements]
                      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                      .map((movement) => {
                        const diff = movement.quantity_after - movement.quantity_before
                        return (
                          <li key={movement.id} className="flex flex-col gap-1 rounded-lg border border-line px-4 py-3">
                            <div className="flex items-center justify-between text-lg">
                              <span className={`font-bold ${diff < 0 ? 'text-danger' : diff > 0 ? 'text-success' : ''}`}>
                                {diff > 0 ? `+${diff}` : diff}
                              </span>
                              <span className="opacity-60">{new Date(movement.created_at).toLocaleString()}</span>
                            </div>
                            <p className="m-0 text-base opacity-70">
                              {movement.quantity_before} → {movement.quantity_after}
                            </p>
                            <p className="m-0 text-base opacity-70">Motivo: {reasonName(movement.reason_id)}</p>
                            <p className="m-0 text-base opacity-70">Cuenta #{movement.created_by_account_id}</p>
                            {movement.observation !== null && (
                              <p className="m-0 text-base opacity-70">{movement.observation}</p>
                            )}
                          </li>
                        )
                      })}
                  </ul>
                </div>

                {historyScrollbar.visible && (
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute right-0 top-0 w-3 rounded-full bg-line/40"
                    style={{ bottom: 0 }}
                  >
                    <div
                      onPointerDown={handleHistoryThumbPointerDown}
                      className="pointer-events-auto absolute right-0 w-3 cursor-grab rounded-full bg-brand active:cursor-grabbing"
                      style={{ top: historyScrollbar.thumbTop, height: historyScrollbar.thumbHeight }}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export function InventoryPage() {
  const { account } = useAuth()
  const canManage = canManageCatalog(account)

  const [categories, setCategories] = useState<Category[]>([])
  const [units, setUnits] = useState<Unit[]>([])
  const [reasons, setReasons] = useState<MovementReason[]>([])
  const [summary, setSummary] = useState<StockSummary>(EMPTY_SUMMARY)
  const [status, setStatus] = useState<LoadStatus>('loading')
  const [loadError, setLoadError] = useState<string | null>(null)

  const [viewMode, setViewMode] = useState<ViewMode>('cards')
  const [criticalSignal, setCriticalSignal] = useState(0)
  const [bannerDismissed, setBannerDismissed] = useState(false)

  useEffect(() => {
    setBannerDismissed(false)
  }, [summary.sinStock])

  function load() {
    setStatus('loading')
    setLoadError(null)
    Promise.all([fetchCategories(), fetchUnits(), fetchMovementReasons(), fetchStockSummary()])
      .then(([categoryResult, unitResult, reasonResult, summaryResult]) => {
        setCategories(categoryResult)
        setUnits(unitResult)
        setReasons(reasonResult)
        setSummary(summaryResult)
        setStatus('success')
      })
      .catch(() => {
        setLoadError(LOAD_ERROR_MESSAGE)
        setStatus('error')
      })
  }

  useEffect(load, [account?.active_business_id])

  function refreshSummary() {
    fetchStockSummary()
      .then(setSummary)
      .catch(() => {})
    window.dispatchEvent(new Event('stock-updated'))
  }

  return (
    <section className="-m-4 flex flex-col gap-4 bg-line/10 p-4 md:-m-6 md:p-6 lg:h-[calc(100svh-4rem)] lg:overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Inventario</h1>
          <div className="mt-1 flex flex-col text-base opacity-60 sm:flex-row sm:flex-wrap sm:items-center sm:gap-1.5 lg:text-lg">
            <span className="whitespace-nowrap">{summary.stockBajo} con stock bajo</span>
            <span className="hidden sm:inline">·</span>
            <span className="whitespace-nowrap">{summary.sinStock} sin stock</span>
          </div>
        </div>
        <ViewToggle mode={viewMode} onChange={setViewMode} />
      </div>

      {status === 'success' && summary.total > 0 && summary.sinStock > 0 && !bannerDismissed && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3">
          <p className="m-0 text-lg font-semibold text-danger">
            Hay {summary.sinStock} {summary.sinStock === 1 ? 'variante sin stock' : 'variantes sin stock'}.
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCriticalSignal((value) => value + 1)}
              className="min-h-11 rounded-lg border border-danger px-4 text-base font-bold text-danger transition-colors hover:bg-danger/10"
            >
              Ver
            </button>
            <button
              type="button"
              onClick={() => setBannerDismissed(true)}
              aria-label="Cerrar aviso"
              className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-danger/100 outline-none transition-colors hover:text-danger focus-visible:ring-2 focus-visible:ring-danger/30"
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-5 w-5"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {status === 'loading' && (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-line bg-surface px-6 py-12 text-center" role="status">
          <span className="h-10 w-10 animate-spin rounded-full border-4 border-line border-t-brand" />
          <p className="text-xl font-semibold">Cargando…</p>
        </div>
      )}

      {status === 'error' && <LoadErrorCard message={loadError ?? LOAD_ERROR_MESSAGE} onRetry={load} />}

      {status === 'success' && summary.total === 0 && (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-line bg-surface px-6 py-16 text-center">
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-10 w-10 opacity-40"
          >
            <path d="M3 6l9-4 9 4-9 4-9-4Zm0 6l9 4 9-4M3 16l9 4 9-4" />
          </svg>
          <p className="text-xl font-semibold opacity-70">No hay inventario cargado</p>
          <p className="text-lg opacity-50">
            Cuando tengas productos con variantes activas, su stock va a aparecer acá.
          </p>
        </div>
      )}

      {status === 'success' && summary.total > 0 && (
        <StockTab
          canManage={canManage}
          categories={categories}
          units={units}
          reasons={reasons}
          onReasonCreated={(reason) => setReasons((current) => [...current, reason])}
          criticalSignal={criticalSignal}
          viewMode={viewMode}
          onAdjusted={refreshSummary}
        />
      )}
    </section>
  )
}
