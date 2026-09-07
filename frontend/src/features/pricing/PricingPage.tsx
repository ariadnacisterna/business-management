import { Fragment, useEffect, useState } from 'react'
import {
  changeProductPrice,
  changeVariantPrice,
  fetchProductsPage,
  fetchVariantCurrentPrice,
  fetchVariantPriceHistory,
} from '../../api/catalog'
import { ApiError } from '../../api/client'
import type { Price, Product, Variant } from '../../api/types'
import { useAuth } from '../access/AuthContext'
import { canManageCatalog } from '../access/roles'
import { ConfirmDialog } from '../../shared/ConfirmDialog'
import { CloseButton } from '../../shared/CloseButton'
import { HighlightedText } from '../../shared/HighlightedText'
import { Pagination } from '../../shared/Pagination'
import { SelectMenu } from '../../shared/SelectMenu'
import { formatRelativeTime } from '../../shared/formatRelativeTime'
import { useTableScrollbar } from '../../shared/useTableScrollbar'

type Status = 'loading' | 'success' | 'error'

const LOAD_ERROR_MESSAGE = 'No se pudo cargar la lista de precios.'
const SEARCH_DEBOUNCE_MS = 300

const priceFormatter = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' })

function formatAmount(amount: string): string {
  return priceFormatter.format(Number(amount))
}

function variantLabel(variant: Variant): string {
  return variant.label ?? (variant.is_implicit ? 'Estándar' : `Variante #${variant.id}`)
}

interface VariantConfirmState {
  kind: 'variant'
  product: Product
  variant: Variant
  newAmount: string
  expectedPriceId: number | null
  currentAmount: string | null
  conflictMessage: string | null
}

interface ProductConfirmState {
  kind: 'product'
  product: Product
  variants: Variant[]
  newAmount: string
  expectedPriceIds: Record<number, number | null>
  conflictMessage: string | null
}

type ConfirmState = VariantConfirmState | ProductConfirmState

interface HistoryState {
  product: Product
  variant: Variant
  status: 'loading' | 'success' | 'error'
  prices: Price[]
}

const inputClasses =
  'h-12 w-40 rounded-lg border border-line bg-surface pl-7 pr-3 text-lg focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/10'
const editedInputClasses =
  'h-12 w-40 rounded-lg border-2 border-brand bg-surface pl-7 pr-3 text-lg font-semibold focus:outline-none focus:ring-2 focus:ring-brand/10'

function PriceInput(props: {
  value: string
  placeholder?: string
  onChange: (value: string) => void
  ariaLabel: string
  className: string
}) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-lg font-bold opacity-60">$</span>
      <input
        value={props.value}
        placeholder={props.placeholder}
        onChange={(event) => props.onChange(event.target.value)}
        type="number"
        min="0.01"
        step="0.01"
        inputMode="decimal"
        aria-label={props.ariaLabel}
        className={props.className}
      />
    </div>
  )
}

export function PricingPage() {
  const { account } = useAuth()
  const canManage = canManageCatalog(account)

  const [products, setProducts] = useState<Product[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [status, setStatus] = useState<Status>('loading')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const [searchInput, setSearchInput] = useState('')
  const [appliedSearch, setAppliedSearch] = useState('')

  const [pricesByVariant, setPricesByVariant] = useState<Map<number, Price | null>>(new Map())
  const [drafts, setDrafts] = useState<Map<number, string>>(new Map())
  const [productDrafts, setProductDrafts] = useState<Map<number, string>>(new Map())

  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [historyState, setHistoryState] = useState<HistoryState | null>(null)

  const { tableScrollRef, theadRef, scrollbar, updateScrollbar, handleThumbPointerDown } = useTableScrollbar([
    products,
  ])

  useEffect(() => {
    const timer = setTimeout(() => {
      setAppliedSearch(searchInput)
      setPage(1)
    }, SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [searchInput])

  function load() {
    setStatus('loading')
    setLoadError(null)
    fetchProductsPage({
      page,
      pageSize,
      search: appliedSearch.trim() === '' ? undefined : appliedSearch.trim(),
    })
      .then(async (result) => {
        setProducts(result.items)
        setTotal(result.total)

        const activeVariants = result.items.flatMap((product) =>
          product.variants.filter((variant) => variant.status === 'active'),
        )
        const priceResults = await Promise.all(
          activeVariants.map((variant) => fetchVariantCurrentPrice(variant.id)),
        )
        setPricesByVariant(new Map(priceResults.map((entry) => [entry.variant_id, entry.price])))
        setDrafts(new Map())

        setStatus('success')
      })
      .catch(() => {
        setLoadError(LOAD_ERROR_MESSAGE)
        setStatus('error')
      })
  }

  useEffect(load, [page, pageSize, appliedSearch, account?.active_business_id])

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  function draftFor(variantId: number): string {
    return drafts.get(variantId) ?? ''
  }

  function setDraft(variantId: number, value: string) {
    setDrafts((prev) => {
      const next = new Map(prev)
      next.set(variantId, value)
      return next
    })
  }

  function lastChangeLabel(variantId: number): string {
    const price = pricesByVariant.get(variantId)
    if (price === null || price === undefined) return 'Sin registro'
    return `${formatRelativeTime(price.effective_from)} por ${price.created_by_account_name}`
  }

  function startVariantChange(product: Product, variant: Variant) {
    const trimmed = draftFor(variant.id).trim()
    if (trimmed === '') return
    setActionError(null)
    setConfirmState({
      kind: 'variant',
      product,
      variant,
      newAmount: trimmed,
      expectedPriceId: pricesByVariant.get(variant.id)?.id ?? null,
      currentAmount: pricesByVariant.get(variant.id)?.amount ?? null,
      conflictMessage: null,
    })
  }

  function startProductChange(product: Product, variants: Variant[]) {
    const trimmed = (productDrafts.get(product.id) ?? '').trim()
    if (trimmed === '') return
    setActionError(null)
    const expectedPriceIds: Record<number, number | null> = {}
    for (const variant of variants) {
      expectedPriceIds[variant.id] = pricesByVariant.get(variant.id)?.id ?? null
    }
    setConfirmState({
      kind: 'product',
      product,
      variants,
      newAmount: trimmed,
      expectedPriceIds,
      conflictMessage: null,
    })
  }

  async function confirmChange() {
    if (confirmState === null) return
    setConfirming(true)

    try {
      if (confirmState.kind === 'variant') {
        const price = await changeVariantPrice(
          confirmState.variant.id,
          confirmState.newAmount,
          confirmState.expectedPriceId,
        )
        setPricesByVariant((prev) => new Map(prev).set(price.variant_id, price))
        setDrafts((prev) => {
          const next = new Map(prev)
          next.delete(price.variant_id)
          return next
        })
        setConfirmState(null)
      } else {
        const result = await changeProductPrice(
          confirmState.product.id,
          confirmState.newAmount,
          confirmState.expectedPriceIds,
        )
        setPricesByVariant((prev) => {
          const next = new Map(prev)
          for (const price of result.prices) next.set(price.variant_id, price)
          return next
        })
        setDrafts((prev) => {
          const next = new Map(prev)
          for (const price of result.prices) next.delete(price.variant_id)
          return next
        })
        setProductDrafts((prev) => {
          const next = new Map(prev)
          next.delete(confirmState.product.id)
          return next
        })
        setConfirmState(null)
      }
    } catch (error) {
      if (error instanceof ApiError && error.status === 409 && confirmState.kind === 'variant') {
        const body = error.body as { current_price?: Price | null } | null
        const currentPrice = body?.current_price ?? null
        setConfirmState({
          ...confirmState,
          expectedPriceId: currentPrice?.id ?? null,
          currentAmount: currentPrice?.amount ?? null,
          conflictMessage:
            currentPrice !== null
              ? `El precio cambió a ${formatAmount(currentPrice.amount)} mientras tanto. Confirmá de nuevo para aplicar tu precio.`
              : 'El precio cambió mientras tanto. Confirmá de nuevo para aplicar tu precio.',
        })
      } else if (error instanceof ApiError && error.status === 409 && confirmState.kind === 'product') {
        const body = error.body as { current_prices?: Record<string, Price | null> } | null
        const currentPrices = body?.current_prices ?? {}
        const expectedPriceIds: Record<number, number | null> = { ...confirmState.expectedPriceIds }
        for (const [variantId, price] of Object.entries(currentPrices)) {
          expectedPriceIds[Number(variantId)] = price?.id ?? null
        }
        setConfirmState({
          ...confirmState,
          expectedPriceIds,
          conflictMessage: 'Algunos precios cambiaron mientras tanto. Confirmá de nuevo para aplicar tu precio.',
        })
      } else {
        setActionError('No se pudo actualizar el precio. Intentá de nuevo.')
        setConfirmState(null)
      }
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
      const oldLabel = confirmState.currentAmount !== null ? formatAmount(confirmState.currentAmount) : 'sin precio'
      const base = `"${confirmState.product.name}" (${variantLabel(confirmState.variant)}): de ${oldLabel} a ${formatAmount(confirmState.newAmount)}.`
      return confirmState.conflictMessage !== null ? `${confirmState.conflictMessage} ${base}` : base
    }
    const base = `"${confirmState.product.name}" y sus ${confirmState.variants.length} variantes van a pasar a costar ${formatAmount(confirmState.newAmount)}.`
    return confirmState.conflictMessage !== null ? `${confirmState.conflictMessage} ${base}` : base
  })()

  return (
    <section className="-m-4 flex h-[calc(100svh-4rem)] flex-col gap-4 overflow-hidden bg-line/10 p-4 md:-m-6 md:p-6">
      <div>
        <h1 className="text-3xl font-bold">Precios</h1>
        <p className="mt-1 text-lg opacity-60">{total} productos encontrados</p>
      </div>

      <div className="flex flex-wrap gap-3">
        <input
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          placeholder="Buscar por nombre…"
          aria-label="Buscar productos"
          className="h-12 min-w-48 flex-1 rounded-lg border border-line bg-surface px-3 text-lg focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/10"
        />
        <SelectMenu
          value={String(pageSize)}
          onChange={(value) => {
            setPageSize(Number(value))
            setPage(1)
          }}
          ariaLabel="Cantidad por página"
          className="w-56"
          options={[
            { value: '10', label: '10 por página' },
            { value: '25', label: '25 por página' },
            { value: '50', label: '50 por página' },
          ]}
        />
        <button
          type="button"
          disabled={searchInput === ''}
          onClick={() => setSearchInput('')}
          className="h-12 w-56 rounded-lg border-2 border-brand bg-surface text-lg font-semibold text-brand transition-colors hover:bg-brand hover:text-brand-contrast disabled:cursor-not-allowed disabled:border-line disabled:bg-surface disabled:font-normal disabled:text-ink/40 disabled:hover:bg-surface disabled:hover:text-ink/40"
        >
          Limpiar búsqueda
        </button>
      </div>

      {actionError !== null && (
        <p role="alert" className="m-0 rounded-lg border border-danger/20 bg-danger/10 px-3.5 py-2.5 text-lg font-medium text-danger">
          {actionError}
        </p>
      )}

      {status === 'loading' && (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-line bg-surface px-6 py-12 text-center" role="status">
          <span className="h-10 w-10 animate-spin rounded-full border-4 border-line border-t-brand" />
          <p className="text-xl font-semibold">Cargando…</p>
        </div>
      )}

      {status === 'error' && (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-line bg-surface px-6 py-12 text-center" role="alert">
          <p className="m-0 text-xl font-semibold">{loadError}</p>
          <button
            type="button"
            onClick={load}
            className="flex h-12 items-center gap-2 rounded-lg bg-brand px-5 text-base font-bold text-brand-contrast transition-colors hover:bg-brand/90"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-5 w-5"
            >
              <polyline points="1 4 1 10 7 10" />
              <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
            </svg>
            Reintentar
          </button>
        </div>
      )}

      {status === 'success' && total === 0 && (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-line bg-surface px-6 py-12 text-center">
          <p className="text-xl font-semibold">No hay productos que coincidan.</p>
          <p className="text-lg opacity-60">Probá cambiar la búsqueda.</p>
        </div>
      )}

      {status === 'success' && total > 0 && (
        <>
          <div className="relative flex min-h-0 shrink flex-col overflow-hidden rounded-xl border border-line bg-surface">
            <div
              ref={tableScrollRef}
              onScroll={updateScrollbar}
              className="scrollbar-hidden min-h-0 flex-1 overflow-auto"
            >
              <table className="w-full min-w-[1000px]">
                <thead ref={theadRef} className="sticky top-0 z-10">
                  <tr className="table-header border-b border-line">
                    <th className="whitespace-nowrap px-4 py-3 text-left text-sm font-bold uppercase tracking-wide opacity-60">Producto</th>
                    <th className="whitespace-nowrap px-4 py-3 text-left text-sm font-bold uppercase tracking-wide opacity-60">Variante</th>
                    <th className="whitespace-nowrap px-4 py-3 text-left text-sm font-bold uppercase tracking-wide opacity-60">Precio actual</th>
                    {canManage && (
                      <th className="whitespace-nowrap px-4 py-3 text-left text-sm font-bold uppercase tracking-wide opacity-60">Nuevo precio</th>
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
                            <td colSpan={2} className="px-4 py-3 text-lg font-semibold">
                              <HighlightedText text={product.name} query={appliedSearch} />
                              <span className="ml-2 text-base font-normal opacity-60">
                                aplicar a las {activeVariants.length} variantes
                              </span>
                            </td>
                            <td className="px-4 py-3" />
                            <td className="px-4 py-3">
                              <PriceInput
                                value={productDrafts.get(product.id) ?? ''}
                                onChange={(value) =>
                                  setProductDrafts((prev) => new Map(prev).set(product.id, value))
                                }
                                ariaLabel={`Nuevo precio para todas las variantes de ${product.name}`}
                                className={inputClasses}
                              />
                            </td>
                            <td className="px-4 py-3" />
                            <td className="px-4 py-3">
                              <button
                                type="button"
                                disabled={(productDrafts.get(product.id) ?? '').trim() === ''}
                                onClick={() => startProductChange(product, activeVariants)}
                                className="h-12 rounded-lg bg-brand px-5 text-base font-bold text-brand-contrast transition-colors hover:bg-brand/90 disabled:cursor-not-allowed disabled:bg-line disabled:text-ink/40"
                              >
                                Actualizar todas
                              </button>
                            </td>
                          </tr>
                        )}
                        {activeVariants.map((variant) => {
                          const currentPrice = pricesByVariant.get(variant.id) ?? null
                          const draft = draftFor(variant.id)
                          const edited = draft.trim() !== '' && draft.trim() !== (currentPrice?.amount ?? '')
                          return (
                            <tr key={variant.id} className="border-t border-line transition-colors hover:bg-surface-brand/60">
                              <td className="max-w-xs px-4 py-3.5 text-lg font-semibold">
                                <HighlightedText text={product.name} query={appliedSearch} />
                              </td>
                              <td className="px-4 py-3.5 text-lg opacity-70">{variantLabel(variant)}</td>
                              <td className="whitespace-nowrap px-4 py-3.5 text-lg">
                                {currentPrice !== null ? (
                                  <span className="font-bold text-brand">{formatAmount(currentPrice.amount)}</span>
                                ) : (
                                  <span className="italic opacity-40">Sin precio</span>
                                )}
                              </td>
                              {canManage && (
                                <td className="px-4 py-3.5">
                                  <div className="flex items-center gap-2">
                                    <PriceInput
                                      value={draft}
                                      placeholder={currentPrice?.amount}
                                      onChange={(value) => setDraft(variant.id, value)}
                                      ariaLabel={`Nuevo precio para ${product.name} ${variantLabel(variant)}`}
                                      className={edited ? editedInputClasses : inputClasses}
                                    />
                                    <button
                                      type="button"
                                      disabled={!edited}
                                      onClick={() => startVariantChange(product, variant)}
                                      className={
                                        edited
                                          ? 'h-12 rounded-lg bg-brand px-5 text-base font-bold text-brand-contrast transition-colors hover:bg-brand/90'
                                          : 'h-12 cursor-not-allowed rounded-lg bg-line px-5 text-base font-bold text-ink/40'
                                      }
                                    >
                                      Actualizar
                                    </button>
                                  </div>
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
            className="relative flex max-h-[80vh] w-full max-w-lg flex-col gap-4 rounded-2xl bg-surface p-6 shadow-2xl"
          >
            <div className="flex items-start justify-between">
              <div>
                <h2 className="m-0 text-2xl font-bold">Historial de precios</h2>
                <p className="m-0 text-lg opacity-60">
                  {historyState.product.name} — {variantLabel(historyState.variant)}
                </p>
              </div>
              <CloseButton onClose={() => setHistoryState(null)} />
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
              <ul className="flex flex-col gap-3 overflow-auto">
                {[...historyState.prices]
                  .sort((a, b) => new Date(b.effective_from).getTime() - new Date(a.effective_from).getTime())
                  .map((price) => (
                    <li key={price.id} className="flex flex-col gap-1 rounded-lg border border-line px-4 py-3">
                      <div className="flex items-center justify-between text-lg">
                        <span className="font-bold text-brand">{formatAmount(price.amount)}</span>
                        <span className="opacity-60">{price.created_by_account_name}</span>
                      </div>
                      <p className="m-0 text-base opacity-60">
                        Vigente desde {formatRelativeTime(price.effective_from)}
                        {price.effective_to !== null ? ` hasta ${formatRelativeTime(price.effective_to)}` : ' (actual)'}
                      </p>
                    </li>
                  ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </section>
  )
}
