import { Fragment, useEffect, useState } from 'react'
import {
  changeProductPrice,
  changeVariantPrice,
  fetchCategories,
  fetchProductsPage,
  fetchVariantCurrentPrice,
  fetchVariantPriceHistory,
  setInitialVariantPrice,
} from '../../api/catalog'
import { ApiError } from '../../api/client'
import type { Category, Price, Product, Variant } from '../../api/types'
import { useAuth } from '../access/useAuth'
import { canManageCatalog } from '../access/roles'
import { Breadcrumb } from '../../shared/Breadcrumb'
import { ConfirmDialog } from '../../shared/ConfirmDialog'
import { CloseButton } from '../../shared/CloseButton'
import { FieldRow } from '../../shared/FieldRow'
import { FiltersButton, FiltersSheet } from '../../shared/FiltersSheet'
import { HighlightedText } from '../../shared/HighlightedText'
import { LoadErrorCard } from '../../shared/LoadErrorCard'
import { NavIconGlyph } from '../../shared/layout/NavIcon'
import { Pagination } from '../../shared/Pagination'
import { ProductThumbnail } from '../../shared/ProductThumbnail'
import { PriceInput } from '../../shared/PriceInput'
import { SearchInput } from '../../shared/SearchInput'
import { SelectMenu } from '../../shared/SelectMenu'
import { AllVariantsPreview, DeltaPreview, SignedDeltaInput } from '../../shared/SignedDeltaInput'
import {
  deltaToApi,
  describeChange,
  evaluateDelta,
  evaluateForAll,
  evaluateTargetPrice,
  formatSignedDelta,
} from '../../shared/signedDelta'
import { useLoad } from '../../shared/useLoad'
import { useToast } from '../../shared/useToast'
import { firstName } from '../../shared/formatName'
import { formatPrice, formatPriceExact } from '../../shared/formatPrice'
import { formatDateTime } from '../../shared/formatDateTime'
import { formatRelativeTime } from '../../shared/formatRelativeTime'
import { useScrollbar } from '../../shared/useScrollbar'
import { useTableScrollbar } from '../../shared/useTableScrollbar'
import type { ViewMode } from '../../shared/ViewToggle'
import { ViewToggle } from '../../shared/ViewToggle'

const NO_PRODUCTS: Product[] = []
const NO_PRICES: Map<number, Price | null> = new Map()
const NO_DRAFTS: Map<number, string> = new Map()

const LOAD_ERROR_MESSAGE = 'No se pudo cargar la lista de precios.'
const SEARCH_DEBOUNCE_MS = 300

function variantLabel(variant: Variant): string {
  return variant.label ?? (variant.is_implicit ? 'Estándar' : `Variante #${variant.id}`)
}

interface VariantConfirmState {
  kind: 'variant'
  product: Product
  variant: Variant
  currentAmount: string | null
  delta: number | null
  initialAmount: string | null
}

interface ProductConfirmState {
  kind: 'product'
  product: Product
  delta: number
  priced: { variant: Variant; currentAmount: string }[]
  skipped: Variant[]
}

type ConfirmState = VariantConfirmState | ProductConfirmState

interface HistoryState {
  product: Product
  variant: Variant
  status: 'loading' | 'success' | 'error'
  prices: Price[]
}

const inputClasses =
  'h-12 w-full rounded-lg border border-line bg-surface pl-7 pr-3 text-lg focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/10'
const editedInputClasses =
  'h-12 w-full rounded-lg border-2 border-brand bg-surface pl-7 pr-3 text-lg font-semibold focus:outline-none focus:ring-2 focus:ring-brand/10'
const initialInputClasses =
  'h-12 w-full rounded-lg border border-line bg-surface pl-7 pr-3 text-lg focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/10'
const activeButtonClasses =
  'h-12 rounded-lg bg-brand px-5 text-base font-bold text-brand-contrast transition-colors hover:bg-brand/90'
const inactiveButtonClasses = 'h-12 cursor-not-allowed rounded-lg bg-line px-5 text-base font-bold text-ink/40'

function VariantPriceEditor({
  product,
  variant,
  currentPrice,
  draft,
  onDraftChange,
  onRequest,
}: {
  product: Product
  variant: Variant
  currentPrice: Price | null
  draft: string
  onDraftChange: (value: string) => void
  onRequest: (delta: number | null, initialAmount: string | null) => void
}) {
  const [wholePrice, setWholePrice] = useState(false)
  const subject = `${product.name} ${variantLabel(variant)}`

  if (currentPrice === null) {
    const trimmed = draft.trim()
    const ready = trimmed !== '' && Number(trimmed) > 0
    return (
      <div className="grid w-full grid-cols-2 items-start gap-2">
        <PriceInput
          value={draft}
          onChange={onDraftChange}
          ariaLabel={`Precio inicial para ${subject}`}
          className={initialInputClasses}
        />
        <button
          type="button"
          disabled={!ready}
          onClick={() => onRequest(null, trimmed)}
          className={ready ? activeButtonClasses : inactiveButtonClasses}
        >
          Cargar precio
        </button>
      </div>
    )
  }

  const evaluation = wholePrice
    ? evaluateTargetPrice(currentPrice.amount, draft)
    : evaluateDelta('price', currentPrice.amount, draft)
  const ready = evaluation.state === 'ready'
  const fieldClassName = ready ? editedInputClasses : inputClasses

  function toggleWholePrice(checked: boolean) {
    setWholePrice(checked)
    onDraftChange('')
  }

  return (
    <div className="flex w-full flex-col gap-2">
      <div className="grid grid-cols-2 items-start gap-2">
        {wholePrice ? (
          <PriceInput
            value={draft}
            onChange={onDraftChange}
            ariaLabel={`Precio nuevo para ${subject}`}
            className={fieldClassName}
          />
        ) : (
          <SignedDeltaInput
            kind="price"
            value={draft}
            onChange={onDraftChange}
            ariaLabel={`Cuánto sumar o restar a ${subject}`}
            className={fieldClassName}
          />
        )}
        <button
          type="button"
          disabled={!ready}
          onClick={() => onRequest(evaluation.delta, null)}
          className={ready ? activeButtonClasses : inactiveButtonClasses}
        >
          Actualizar
        </button>
      </div>
      <label className="flex items-center gap-2 text-lg text-ink/60">
        <input
          type="checkbox"
          checked={wholePrice}
          onChange={(event) => toggleWholePrice(event.target.checked)}
          className="checkbox-brand"
        />
        Cambiar todo el precio
      </label>
      {evaluation.state !== 'empty' && (
        <DeltaPreview kind="price" current={currentPrice.amount} evaluation={evaluation} />
      )}
    </div>
  )
}

function ProductPriceEditor({
  product,
  variants,
  pricesByVariant,
  draft,
  onDraftChange,
  onRequest,
}: {
  product: Product
  variants: Variant[]
  pricesByVariant: Map<number, Price | null>
  draft: string
  onDraftChange: (value: string) => void
  onRequest: (delta: number) => void
}) {
  const priced = variants.flatMap((variant) => {
    const price = pricesByVariant.get(variant.id)
    return price === null || price === undefined ? [] : [{ variant, currentAmount: price.amount }]
  })
  const skipped = variants.filter((variant) => (pricesByVariant.get(variant.id) ?? null) === null)
  const evaluation = evaluateForAll(
    priced.map((entry) => ({ label: variantLabel(entry.variant), current: entry.currentAmount })),
    draft,
  )
  const editing =
    evaluation.entries.length === 0 ? draft.trim() !== '' : evaluation.entries[0].evaluation.state !== 'empty'

  return (
    <div className="flex w-full flex-col gap-2">
      <div className="grid grid-cols-2 items-start gap-2">
        <SignedDeltaInput
          kind="price"
          value={draft}
          onChange={onDraftChange}
          ariaLabel={`Cuánto sumar o restar a todas las variantes de ${product.name}`}
          className={evaluation.ready ? editedInputClasses : inputClasses}
        />
        <button
          type="button"
          disabled={!evaluation.ready}
          onClick={() => onRequest(evaluation.delta ?? 0)}
          className={evaluation.ready ? activeButtonClasses : inactiveButtonClasses}
        >
          Actualizar todas
        </button>
      </div>
      {editing && <AllVariantsPreview evaluation={evaluation} skippedLabels={skipped.map(variantLabel)} />}
    </div>
  )
}

export function PricingPage() {
  const { account } = useAuth()
  const canManage = canManageCatalog(account)
  const { showSuccess, showError } = useToast()

  const [categories, setCategories] = useState<Category[]>([])
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)

  const [searchInput, setSearchInput] = useState('')
  const [appliedSearch, setAppliedSearch] = useState('')
  const [categoryId, setCategoryId] = useState<number | 'all'>('all')

  const [productDrafts, setProductDrafts] = useState<Map<number, string>>(new Map())

  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [historyState, setHistoryState] = useState<HistoryState | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('cards')
  const [filtersOpen, setFiltersOpen] = useState(false)

  useEffect(() => {
    fetchCategories().then(setCategories).catch(() => {})
  }, [account?.active_business_id])

  useEffect(() => {
    const timer = setTimeout(() => {
      setAppliedSearch(searchInput)
      setPage(1)
    }, SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [searchInput])

  const { status, data, reload, setData } = useLoad(
    async () => {
      const result = await fetchProductsPage({
        page,
        pageSize,
        categoryId: categoryId === 'all' ? undefined : categoryId,
        search: appliedSearch.trim() === '' ? undefined : appliedSearch.trim(),
      })
      const activeVariants = result.items.flatMap((product) =>
        product.variants.filter((variant) => variant.status === 'active'),
      )
      const priceResults = await Promise.all(activeVariants.map((variant) => fetchVariantCurrentPrice(variant.id)))
      return {
        products: result.items,
        total: result.total,
        pricesByVariant: new Map<number, Price | null>(priceResults.map((entry) => [entry.variant_id, entry.price])),
        drafts: new Map<number, string>(),
      }
    },
    [page, pageSize, categoryId, appliedSearch, account?.active_business_id],
  )
  const products = data?.products ?? NO_PRODUCTS
  const total = data?.total ?? 0
  const pricesByVariant = data?.pricesByVariant ?? NO_PRICES
  const drafts = data?.drafts ?? NO_DRAFTS

  const { tableScrollRef, theadRef, scrollbar, updateScrollbar, handleThumbPointerDown } = useTableScrollbar([
    products,
    viewMode,
  ])
  const {
    scrollRef: cardScrollRef,
    scrollbar: cardScrollbar,
    updateScrollbar: updateCardScrollbar,
    handleThumbPointerDown: handleCardThumbPointerDown,
  } = useScrollbar([products, viewMode])
  const {
    scrollRef: historyScrollRef,
    scrollbar: historyScrollbar,
    updateScrollbar: updateHistoryScrollbar,
    handleThumbPointerDown: handleHistoryThumbPointerDown,
  } = useScrollbar([historyState])

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  function categoryName(categoryId: number): string {
    return categories.find((category) => category.id === categoryId)?.name ?? '—'
  }

  function draftFor(variantId: number): string {
    return drafts.get(variantId) ?? ''
  }

  function setDraft(variantId: number, value: string) {
    setData((prev) => prev && { ...prev, drafts: new Map(prev.drafts).set(variantId, value) })
  }

  function lastChangeLabel(variantId: number): string {
    const price = pricesByVariant.get(variantId)
    if (price === null || price === undefined) return 'Sin registro'
    return `${formatRelativeTime(price.effective_from)} por ${firstName(price.created_by_account_name)}`
  }

  function startVariantChange(product: Product, variant: Variant, delta: number | null, initialAmount: string | null) {
    setConfirmState({
      kind: 'variant',
      product,
      variant,
      currentAmount: pricesByVariant.get(variant.id)?.amount ?? null,
      delta,
      initialAmount,
    })
  }

  function startProductChange(product: Product, variants: Variant[], delta: number) {
    setConfirmState({
      kind: 'product',
      product,
      delta,
      priced: variants.flatMap((variant) => {
        const price = pricesByVariant.get(variant.id)
        return price === null || price === undefined ? [] : [{ variant, currentAmount: price.amount }]
      }),
      skipped: variants.filter((variant) => (pricesByVariant.get(variant.id) ?? null) === null),
    })
  }

  async function confirmChange() {
    if (confirmState === null) return
    setConfirming(true)

    try {
      if (confirmState.kind === 'variant') {
        const previousAmount = confirmState.currentAmount
        const price =
          confirmState.initialAmount !== null
            ? await setInitialVariantPrice(confirmState.variant.id, confirmState.initialAmount)
            : await changeVariantPrice(
                confirmState.variant.id,
                String(deltaToApi('price', confirmState.delta ?? 0)),
              )
        setData((prev) => {
          if (prev === undefined) return prev
          const nextDrafts = new Map(prev.drafts)
          nextDrafts.delete(price.variant_id)
          return { ...prev, pricesByVariant: new Map(prev.pricesByVariant).set(price.variant_id, price), drafts: nextDrafts }
        })
        setConfirmState(null)
        showSuccess(
          previousAmount === null
            ? `Precio inicial cargado: ${formatPriceExact(price.amount)}.`
            : `Precio actualizado: ${formatPriceExact(previousAmount)} → ${formatPriceExact(price.amount)}.`,
        )
      } else {
        const result = await changeProductPrice(
          confirmState.product.id,
          String(deltaToApi('price', confirmState.delta)),
        )
        setData((prev) => {
          if (prev === undefined) return prev
          const nextPrices = new Map(prev.pricesByVariant)
          const nextDrafts = new Map(prev.drafts)
          for (const price of result.prices) {
            nextPrices.set(price.variant_id, price)
            nextDrafts.delete(price.variant_id)
          }
          return { ...prev, pricesByVariant: nextPrices, drafts: nextDrafts }
        })
        setProductDrafts((prev) => {
          const next = new Map(prev)
          next.delete(confirmState.product.id)
          return next
        })
        setConfirmState(null)
        const skippedNames = confirmState.skipped
          .filter((variant) => result.skipped_variant_ids.includes(variant.id))
          .map(variantLabel)
        showSuccess(
          skippedNames.length > 0
            ? `Precio actualizado en ${result.prices.length} variantes. Se omitieron por no tener precio: ${skippedNames.join(', ')}.`
            : 'Precio actualizado para todas las variantes.',
        )
      }
    } catch (error) {
      showError(error instanceof ApiError ? error.message : 'No se pudo actualizar el precio. Intentá de nuevo.')
      setConfirmState(null)
    } finally {
      setConfirming(false)
    }
  }

  function cancelChange() {
    setConfirmState(null)
  }

  function openHistory(product: Product, variant: Variant) {
    setHistoryState({ product, variant, status: 'loading', prices: [] })
    fetchVariantPriceHistory(variant.id)
      .then((prices) => setHistoryState({ product, variant, status: 'success', prices }))
      .catch(() => setHistoryState({ product, variant, status: 'error', prices: [] }))
  }

  const confirmDescription = (() => {
    if (confirmState === null) return ''
    if (confirmState.kind === 'variant') {
      const name = `"${confirmState.product.name}" (${variantLabel(confirmState.variant)})`
      if (confirmState.initialAmount !== null) {
        return `${name}: precio inicial de ${formatPriceExact(confirmState.initialAmount)}.`
      }
      const transition = describeChange('price', confirmState.currentAmount ?? 0, confirmState.delta ?? 0)
      return `${name}: ${transition}.`
    }
    const lines = confirmState.priced.map((entry) => {
      const result = Math.round(Number(entry.currentAmount) * 100) + confirmState.delta
      return `${variantLabel(entry.variant)} ${formatPriceExact(entry.currentAmount)} → ${formatPriceExact(result / 100)}`
    })
    const skippedText =
      confirmState.skipped.length > 0
        ? ` Sin precio, no se modifican: ${confirmState.skipped.map(variantLabel).join(', ')}.`
        : ''
    return `"${confirmState.product.name}": ${lines.join('; ')} (diferencia ${formatSignedDelta('price', confirmState.delta)}).${skippedText}`
  })()

  const hasActiveFilters = appliedSearch !== '' || categoryId !== 'all'

  return (
    <section className="-m-4 flex min-h-[calc(100svh-4rem)] flex-col gap-4 bg-line/10 p-4 md:-m-6 md:p-6 lg:h-[calc(100svh-4rem)] lg:overflow-hidden">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Precios</h1>
          <p className="mt-1 whitespace-nowrap text-base opacity-60 lg:text-lg">{total} productos encontrados</p>
        </div>
        {status === 'success' && (total > 0 || hasActiveFilters) && (
          <ViewToggle mode={viewMode} onChange={setViewMode} />
        )}
      </div>

      {status === 'success' && (total > 0 || hasActiveFilters) && (() => {
        const filterControls = (
          <>
            <SelectMenu
              value={categoryId === 'all' ? 'all' : String(categoryId)}
              onChange={(value) => {
                setCategoryId(value === 'all' ? 'all' : Number(value))
                setPage(1)
              }}
              ariaLabel="Filtrar por categoría"
              className="w-full lg:w-56"
              options={[
                { value: 'all', label: 'Todas las categorías' },
                ...categories.map((category) => ({ value: String(category.id), label: category.name })),
              ]}
            />
            <SelectMenu
              value={String(pageSize)}
              onChange={(value) => {
                setPageSize(Number(value))
                setPage(1)
              }}
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
              onClick={() => {
                setSearchInput('')
                setCategoryId('all')
              }}
              className="h-12 w-full rounded-lg border-2 border-brand bg-surface text-lg font-semibold text-brand transition-colors hover:bg-brand hover:text-brand-contrast disabled:cursor-not-allowed disabled:border-line disabled:bg-surface disabled:font-normal disabled:text-ink/40 disabled:hover:bg-surface disabled:hover:text-ink/40 lg:w-56"
            >
              Limpiar búsqueda
            </button>
          </>
        )
        return (
          <>
            <FiltersSheet open={filtersOpen} onOpenChange={setFiltersOpen} section="Precios">
              {filterControls}
            </FiltersSheet>
            <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center">
              <SearchInput
                value={searchInput}
                onChange={setSearchInput}
                placeholder="Buscar por nombre…"
                ariaLabel="Buscar productos"
                className="lg:min-w-40 lg:flex-1"
              />
              <FiltersButton
                onClick={() => setFiltersOpen(true)}
                hasActiveFilters={categoryId !== 'all'}
                widthClassName="w-full lg:hidden"
              />
              <div className="hidden flex-wrap items-center gap-3 lg:flex">{filterControls}</div>
            </div>
          </>
        )
      })()}

      {status === 'loading' && (
        <div className="flex flex-col items-center gap-3 py-12 text-center" role="status">
          <span className="h-10 w-10 animate-spin rounded-full border-4 border-line border-t-brand" />
          <p className="text-xl font-semibold">Cargando…</p>
        </div>
      )}

      {status === 'error' && <LoadErrorCard message={LOAD_ERROR_MESSAGE} onRetry={reload} />}

      {status === 'success' && total === 0 && hasActiveFilters && (
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
          <p className="text-xl font-semibold">No hay productos que coincidan.</p>
          <p className="text-lg opacity-60">Probá cambiar la búsqueda.</p>
        </div>
      )}

      {status === 'success' && total === 0 && !hasActiveFilters && (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-line bg-surface px-6 py-16 text-center">
          <NavIconGlyph icon="prices" className="h-10 w-10 opacity-40" />
          <p className="text-xl font-semibold opacity-70">No hay precios cargados</p>
          <p className="text-lg opacity-50">Cuando tengas productos con variantes activas, sus precios van a aparecer acá.</p>
        </div>
      )}

      {status === 'success' && total > 0 && (
        <>
          {viewMode === 'cards' && (
          <div className="relative flex min-h-0 shrink flex-col lg:flex-1">
            <div
              ref={cardScrollRef}
              onScroll={updateCardScrollbar}
              className="scrollbar-hidden lg:min-h-0 lg:flex-1 lg:overflow-auto lg:pr-5"
            >
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-3">
              {products.map((product) => {
                const activeVariants = product.variants.filter((variant) => variant.status === 'active')
                if (activeVariants.length === 0) return null
                const showApplyAll = canManage && activeVariants.length > 1
                return (
                  <Fragment key={product.id}>
                    {showApplyAll && (
                      <div className="flex flex-col gap-3 rounded-xl border border-line bg-surface-brand/40 p-4">
                        <p className="text-lg font-semibold">
                          <HighlightedText text={product.name} query={appliedSearch} />
                          <span className="ml-2 text-base font-normal opacity-60">
                            aplicar a las {activeVariants.length} variantes
                          </span>
                        </p>
                        <ProductPriceEditor
                          product={product}
                          variants={activeVariants}
                          pricesByVariant={pricesByVariant}
                          draft={productDrafts.get(product.id) ?? ''}
                          onDraftChange={(value) => setProductDrafts((prev) => new Map(prev).set(product.id, value))}
                          onRequest={(delta) => startProductChange(product, activeVariants, delta)}
                        />
                      </div>
                    )}
                    {activeVariants.map((variant) => {
                      const currentPrice = pricesByVariant.get(variant.id) ?? null
                      const draft = draftFor(variant.id)
                      return (
                        <div key={variant.id} data-testid="price-row" className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4">
                          <div className="flex items-start justify-between gap-3 border-b border-line pb-3">
                            <div className="flex min-h-12 items-center gap-3">
                              <ProductThumbnail imageUrl={product.image_url} name={product.name} sizeClassName="h-12 w-12" />
                              <p className="text-xl font-bold leading-tight">
                                <HighlightedText text={product.name} query={appliedSearch} />
                              </p>
                            </div>
                            {currentPrice !== null ? (
                              <span className="text-2xl font-bold text-brand">{formatPrice(currentPrice.amount)}</span>
                            ) : (
                              <span className="text-lg italic opacity-40">Sin precio</span>
                            )}
                          </div>
                          <div className="flex flex-col gap-1.5">
                            <FieldRow label="Categoría" value={categoryName(product.category_id)} />
                            <FieldRow label="Variante" value={variantLabel(variant)} />
                          </div>
                          {canManage && (
                            <VariantPriceEditor
                              product={product}
                              variant={variant}
                              currentPrice={currentPrice}
                              draft={draft}
                              onDraftChange={(value) => setDraft(variant.id, value)}
                              onRequest={(delta, initialAmount) =>
                                startVariantChange(product, variant, delta, initialAmount)
                              }
                            />
                          )}
                          {canManage && <FieldRow label="Último cambio" value={lastChangeLabel(variant.id)} />}
                          {canManage && (
                            <button
                              type="button"
                              onClick={() => openHistory(product, variant)}
                              aria-label={`Ver historial de precios de ${product.name} ${variantLabel(variant)}`}
                              className="flex h-12 items-center justify-center gap-2 rounded-lg border border-line text-base font-semibold text-ink/70 transition-colors hover:bg-surface-brand hover:text-brand"
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
                                <circle cx="12" cy="12" r="9" />
                                <polyline points="12 7 12 12 15.5 14" />
                              </svg>
                              Ver historial
                            </button>
                          )}
                        </div>
                      )
                    })}
                  </Fragment>
                )
              })}
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

          {viewMode === 'table' && (
          <div className="relative flex min-h-0 shrink flex-col overflow-hidden rounded-xl border border-line bg-surface">
            <div
              ref={tableScrollRef}
              onScroll={updateScrollbar}
              className="scrollbar-hidden min-h-0 flex-1 overflow-auto"
            >
              <table className="w-full min-w-[1000px]">
                <thead ref={theadRef} className="sticky top-0 z-10">
                  <tr className="table-header border-b border-line">
                    <th className="whitespace-nowrap px-4 py-3 text-left text-sm font-bold uppercase tracking-wide opacity-60">Imagen</th>
                    <th className="whitespace-nowrap px-4 py-3 text-left text-sm font-bold uppercase tracking-wide opacity-60">Producto</th>
                    <th className="whitespace-nowrap px-4 py-3 text-left text-sm font-bold uppercase tracking-wide opacity-60">Categoría</th>
                    <th className="whitespace-nowrap px-4 py-3 text-left text-sm font-bold uppercase tracking-wide opacity-60">Variante</th>
                    <th className="whitespace-nowrap px-4 py-3 text-left text-sm font-bold uppercase tracking-wide opacity-60">Precio actual</th>
                    {canManage && (
                      <th className="whitespace-nowrap px-4 py-3 text-left text-sm font-bold uppercase tracking-wide opacity-60">Sumar o restar</th>
                    )}
                    {canManage && (
                      <th className="whitespace-nowrap px-4 py-3 text-left text-sm font-bold uppercase tracking-wide opacity-60">Último cambio</th>
                    )}
                    {canManage && <th className="px-4 py-3" />}
                  </tr>
                </thead>
                <tbody>
                  {products.map((product) => {
                    const activeVariants = product.variants.filter((variant) => variant.status === 'active')
                    if (activeVariants.length === 0) return null
                    const showApplyAll = canManage && activeVariants.length > 1
                    return (
                      <Fragment key={product.id}>
                        {showApplyAll && (
                          <tr key={`${product.id}-apply-all`} className="border-t border-line bg-surface-brand/40">
                            <td colSpan={4} className="px-4 py-3 text-lg font-semibold">
                              <HighlightedText text={product.name} query={appliedSearch} />
                              <span className="ml-2 text-base font-normal opacity-60">
                                aplicar a las {activeVariants.length} variantes
                              </span>
                            </td>
                            <td className="px-4 py-3" />
                            <td className="min-w-64 px-4 py-3 align-top">
                              <ProductPriceEditor
                                product={product}
                                variants={activeVariants}
                                pricesByVariant={pricesByVariant}
                                draft={productDrafts.get(product.id) ?? ''}
                                onDraftChange={(value) =>
                                  setProductDrafts((prev) => new Map(prev).set(product.id, value))
                                }
                                onRequest={(delta) => startProductChange(product, activeVariants, delta)}
                              />
                            </td>
                            <td colSpan={2} className="px-4 py-3" />
                          </tr>
                        )}
                        {activeVariants.map((variant) => {
                          const currentPrice = pricesByVariant.get(variant.id) ?? null
                          const draft = draftFor(variant.id)
                              return (
                            <tr key={variant.id} data-testid="price-row" className="border-t border-line transition-colors hover:bg-surface-brand/60">
                              <td className="px-4 py-3.5">
                                <ProductThumbnail imageUrl={product.image_url} name={product.name} sizeClassName="h-12 w-12" />
                              </td>
                              <td className="max-w-xs px-4 py-3.5 text-lg font-semibold">
                                <HighlightedText text={product.name} query={appliedSearch} />
                              </td>
                              <td className="px-4 py-3.5 text-lg opacity-70">{categoryName(product.category_id)}</td>
                              <td className="px-4 py-3.5 text-lg opacity-70">{variantLabel(variant)}</td>
                              <td className="whitespace-nowrap px-4 py-3.5 text-lg">
                                {currentPrice !== null ? (
                                  <span className="font-bold text-brand">{formatPrice(currentPrice.amount)}</span>
                                ) : (
                                  <span className="italic opacity-40">Sin precio</span>
                                )}
                              </td>
                              {canManage && (
                                <td className="min-w-64 px-4 py-3.5 align-top">
                                  <VariantPriceEditor
                                    product={product}
                                    variant={variant}
                                    currentPrice={currentPrice}
                                    draft={draft}
                                    onDraftChange={(value) => setDraft(variant.id, value)}
                                    onRequest={(delta, initialAmount) =>
                                      startVariantChange(product, variant, delta, initialAmount)
                                    }
                                  />
                                </td>
                              )}
                              {canManage && (
                                <td className="px-4 py-3.5 text-lg opacity-70">{lastChangeLabel(variant.id)}</td>
                              )}
                              {canManage && (
                                <td className="px-4 py-3.5 text-center">
                                  <button
                                    type="button"
                                    onClick={() => openHistory(product, variant)}
                                    aria-label={`Ver historial de precios de ${product.name} ${variantLabel(variant)}`}
                                    className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-ink/50 transition-colors hover:bg-surface-brand hover:text-brand"
                                  >
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
                                  </button>
                                </td>
                              )}
                            </tr>
                          )
                        })}
                      </Fragment>
                    )
                  })}
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

          <div className="mt-auto pt-1">
            <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
          </div>
        </>
      )}

      {confirmState !== null && (
        <ConfirmDialog
          title="Confirmar cambio de precio"
          description={confirmDescription}
          confirmLabel={confirming ? 'Guardando…' : 'Confirmar'}
          breadcrumb={['Precios', confirmState.product.name, 'Confirmar cambio de precio']}
          onConfirm={confirmChange}
          onCancel={cancelChange}
        />
      )}

      {historyState !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-ink/20 backdrop-blur-sm" onClick={() => setHistoryState(null)} aria-hidden="true" />
          <div
            role="dialog"
            aria-label={`Historial de precios de ${historyState.product.name}`}
            className="relative grid max-h-[80vh] w-full max-w-lg grid-rows-[auto_1fr] gap-4 overflow-hidden rounded-2xl bg-surface p-6 shadow-2xl"
          >
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <Breadcrumb segments={['Precios', historyState.product.name, 'Historial de precios']} />
                </div>
                <CloseButton onClose={() => setHistoryState(null)} />
              </div>
              <div>
                <h2 className="m-0 text-2xl font-bold">Historial de precios</h2>
                <p className="m-0 text-lg opacity-60">
                  {historyState.product.name} — {variantLabel(historyState.variant)}
                </p>
              </div>
            </div>

            {historyState.status === 'loading' && <p role="status">Cargando…</p>}
            {historyState.status === 'error' && (
              <p role="alert" className="text-lg text-danger">
                No se pudo cargar el historial.
              </p>
            )}
            {historyState.status === 'success' && historyState.prices.length === 0 && (
              <p className="text-lg opacity-60">Todavía no hay cambios de precio registrados.</p>
            )}
            {historyState.status === 'success' && historyState.prices.length > 0 && (
              <div className="relative min-h-0">
                <div
                  ref={historyScrollRef}
                  onScroll={updateHistoryScrollbar}
                  className={`scrollbar-hidden h-full overflow-auto ${historyScrollbar.visible ? 'pr-5' : ''}`}
                >
                  <ul className="flex flex-col gap-3">
                    {(() => {
                      const sorted = [...historyState.prices].sort(
                        (a, b) => new Date(b.effective_from).getTime() - new Date(a.effective_from).getTime(),
                      )
                      return sorted.map((price, index) => {
                        const previousAmount = sorted[index + 1]?.amount ?? null
                        const diff = previousAmount !== null ? Number(price.amount) - Number(previousAmount) : 0
                        return (
                          <li key={price.id} className="flex flex-col gap-1 rounded-lg border border-line px-4 py-3">
                            <div className="flex items-center justify-between text-lg">
                              <span
                                className={`font-bold ${diff < 0 ? 'text-danger' : diff > 0 ? 'text-success' : 'text-brand'}`}
                              >
                                {formatPrice(price.amount)}
                              </span>
                              <span className="opacity-60">{formatDateTime(price.effective_from)}</span>
                            </div>
                            <p className="m-0 text-base opacity-70">
                              {previousAmount !== null ? `${formatPrice(previousAmount)} → ${formatPrice(price.amount)}` : formatPrice(price.amount)}
                            </p>
                            <p className="m-0 text-base opacity-70">Cambiado por: {firstName(price.created_by_account_name)}</p>
                          </li>
                        )
                      })
                    })()}
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
    </section>
  )
}
