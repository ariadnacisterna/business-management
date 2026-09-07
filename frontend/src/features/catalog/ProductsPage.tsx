import { useEffect, useMemo, useState } from 'react'
import { Link, Outlet, useNavigate } from 'react-router-dom'
import {
  deactivateProduct,
  fetchCategories,
  fetchProductsPage,
  fetchUnits,
  reactivateProduct,
} from '../../api/catalog'
import type { Category, Product, Unit } from '../../api/types'
import { useAuth } from '../access/AuthContext'
import { canManageCatalog } from '../access/roles'
import { ConfirmDialog } from '../../shared/ConfirmDialog'
import { HighlightedText } from '../../shared/HighlightedText'
import { EyeIcon, PencilIcon } from '../../shared/icons'
import { Pagination } from '../../shared/Pagination'
import { FiltersButton, FiltersSheet } from '../../shared/FiltersSheet'
import { HEADER_ACTION_BUTTON_CLASSES } from '../../shared/headerActionButton'
import { RowMenu } from '../../shared/RowMenu'
import { SearchInput } from '../../shared/SearchInput'
import { SelectMenu } from '../../shared/SelectMenu'
import { useScrollbar } from '../../shared/useScrollbar'
import { useTableScrollbar } from '../../shared/useTableScrollbar'
import type { ViewMode } from '../../shared/ViewToggle'
import { ViewToggle } from '../../shared/ViewToggle'

type Status = 'loading' | 'success' | 'error'
type StatusFilter = 'all' | 'active' | 'inactive'

const LOAD_ERROR_MESSAGE = 'No se pudieron cargar los productos.'
const SEARCH_DEBOUNCE_MS = 300

interface Filters {
  page: number
  pageSize: number
  categoryId: number | 'all'
  status: StatusFilter
}

const DEFAULT_FILTERS: Filters = { page: 1, pageSize: 25, categoryId: 'all', status: 'all' }

const priceFormatter = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' })

function ProductThumbnail({ product, sizeClassName }: { product: Product; sizeClassName: string }) {
  if (product.image_url !== null) {
    return (
      <img
        src={product.image_url}
        alt={product.name}
        className={`${sizeClassName} shrink-0 rounded-lg border border-line object-cover`}
      />
    )
  }

  return (
    <div
      aria-hidden="true"
      className={`${sizeClassName} flex shrink-0 items-center justify-center rounded-lg border border-line bg-line/15 text-ink/30`}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-1/2 w-1/2">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <circle cx="8.5" cy="8.5" r="1.5" />
        <path d="M21 15l-5-5L5 21" />
      </svg>
    </div>
  )
}

function productPriceInfo(product: Product): { amount: number; hasRange: boolean } | null {
  const amounts = product.variants
    .map((variant) => variant.price_amount)
    .filter((amount): amount is string => amount !== null)
    .map(Number)
  if (amounts.length === 0) return null
  const distinct = new Set(amounts)
  return { amount: Math.min(...amounts), hasRange: distinct.size > 1 }
}

export function ProductsPage() {
  const { account } = useAuth()
  const canManage = canManageCatalog(account)
  const navigate = useNavigate()

  const [products, setProducts] = useState<Product[]>([])
  const [total, setTotal] = useState(0)
  const [categories, setCategories] = useState<Category[]>([])
  const [units, setUnits] = useState<Unit[]>([])
  const [status, setStatus] = useState<Status>('loading')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [confirmingProduct, setConfirmingProduct] = useState<Product | null>(null)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>('cards')

  const [searchInput, setSearchInput] = useState('')
  const [appliedSearch, setAppliedSearch] = useState('')
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  const { tableScrollRef, theadRef, scrollbar, updateScrollbar, handleThumbPointerDown } = useTableScrollbar([
    products,
    filters.pageSize,
    viewMode,
  ])
  const {
    scrollRef: cardScrollRef,
    scrollbar: cardScrollbar,
    updateScrollbar: updateCardScrollbar,
    handleThumbPointerDown: handleCardThumbPointerDown,
  } = useScrollbar([products, filters.pageSize, viewMode])

  useEffect(() => {
    fetchCategories().then(setCategories).catch(() => {})
    fetchUnits().then(setUnits).catch(() => {})
  }, [account?.active_business_id])

  useEffect(() => {
    const timer = setTimeout(() => {
      setAppliedSearch(searchInput)
      setFilters((current) => (current.page === 1 ? current : { ...current, page: 1 }))
    }, SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [searchInput])

  function load() {
    setStatus('loading')
    setLoadError(null)
    fetchProductsPage({
      page: filters.page,
      pageSize: filters.pageSize,
      categoryId: filters.categoryId === 'all' ? undefined : filters.categoryId,
      status: filters.status === 'all' ? undefined : filters.status,
      search: appliedSearch.trim() === '' ? undefined : appliedSearch.trim(),
    })
      .then((result) => {
        setProducts(result.items)
        setTotal(result.total)
        setStatus('success')
      })
      .catch(() => {
        setLoadError(LOAD_ERROR_MESSAGE)
        setStatus('error')
      })
  }

  useEffect(load, [
    filters.page,
    filters.pageSize,
    filters.categoryId,
    filters.status,
    appliedSearch,
    account?.active_business_id,
  ])

  const totalPages = Math.max(1, Math.ceil(total / filters.pageSize))

  function categoryName(categoryId: number): string {
    return categories.find((category) => category.id === categoryId)?.name ?? '—'
  }

  function unitName(unitId: number): string {
    return units.find((unit) => unit.id === unitId)?.name ?? '—'
  }

  function applyProductUpdate(updated: Product) {
    setProducts((current) => current.map((item) => (item.id === updated.id ? updated : item)))
  }

  function toggleActive(product: Product) {
    setActionError(null)
    const request = product.status === 'active' ? deactivateProduct(product.id) : reactivateProduct(product.id)
    request
      .then(applyProductUpdate)
      .catch(() => {
        setActionError(
          product.status === 'active'
            ? 'No se pudo desactivar el producto.'
            : 'No se pudo activar el producto.',
        )
      })
  }

  function confirmToggleActive() {
    if (confirmingProduct === null) return
    toggleActive(confirmingProduct)
    setConfirmingProduct(null)
  }

  function productRowMenuItems(product: Product) {
    return [
      { label: 'Ver detalle', icon: <EyeIcon />, onClick: () => navigate(`/products/${product.id}`) },
      ...(canManage
        ? [
            {
              label: 'Cambiar precio',
              icon: <span className="text-xl font-semibold">$</span>,
              onClick: () => navigate(`/products/${product.id}?changePrice=1`),
            },
            {
              label: 'Editar producto',
              icon: <PencilIcon />,
              onClick: () => navigate(`/products/${product.id}?edit=1`),
            },
            {
              label: product.status === 'active' ? 'Desactivar' : 'Activar',
              icon: '⊘',
              danger: product.status === 'active',
              success: product.status !== 'active',
              onClick: () => setConfirmingProduct(product),
            },
          ]
        : []),
    ]
  }

  function toggleSort() {
    setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'))
  }

  function clearFilters() {
    setSearchInput('')
    setAppliedSearch('')
    setFilters(DEFAULT_FILTERS)
  }

  const hasActiveFilters = searchInput !== '' || filters.categoryId !== 'all' || filters.status !== 'all'

  const sorted = useMemo(() => {
    return [...products].sort((a, b) => {
      const comparison = a.name.localeCompare(b.name)
      return sortDir === 'asc' ? comparison : -comparison
    })
  }, [products, sortDir])

  return (
    <section className="-m-4 flex flex-col gap-4 bg-line/10 p-4 md:-m-6 md:p-6 lg:h-[calc(100svh-4rem)] lg:overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Productos</h1>
          <p className="mt-1 text-lg opacity-60">{total} productos encontrados</p>
        </div>
        <div className="flex items-center gap-3">
          <ViewToggle mode={viewMode} onChange={setViewMode} />
          {canManage && (
            <Link
              to="/products/new"
              className={`${HEADER_ACTION_BUTTON_CLASSES} hidden lg:flex bg-brand text-brand-contrast hover:bg-brand/90`}
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
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Nuevo Producto
            </Link>
          )}
        </div>
      </div>

      {(() => {
        const filterControls = (
          <>
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
              value={filters.status}
              onChange={(value: StatusFilter) => setFilters((current) => ({ ...current, status: value, page: 1 }))}
              ariaLabel="Filtrar por estado"
              className="w-full lg:w-56"
              options={[
                { value: 'all', label: 'Todos los estados' },
                { value: 'active', label: 'Activo' },
                { value: 'inactive', label: 'Inactivo' },
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
          <>
            <FiltersSheet open={filtersOpen} onOpenChange={setFiltersOpen}>
              {filterControls}
            </FiltersSheet>
            <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center">
              <SearchInput
                value={searchInput}
                onChange={setSearchInput}
                placeholder="Buscar nombre, código, categoría…"
                ariaLabel="Buscar productos"
                className="lg:min-w-40 lg:flex-1"
              />
              <div className="grid grid-cols-2 gap-4 lg:hidden">
                <FiltersButton
                  onClick={() => setFiltersOpen(true)}
                  hasActiveFilters={hasActiveFilters}
                  widthClassName="w-full"
                />
                {canManage && (
                  <Link
                    to="/products/new"
                    className={`${HEADER_ACTION_BUTTON_CLASSES} w-full justify-center bg-brand text-brand-contrast hover:bg-brand/90`}
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
                      <line x1="12" y1="5" x2="12" y2="19" />
                      <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                    Nuevo Producto
                  </Link>
                )}
              </div>
              <div className="hidden flex-wrap items-center gap-3 lg:flex">{filterControls}</div>
            </div>
          </>
        )
      })()}

      {actionError !== null && (
        <p
          role="alert"
          className="m-0 rounded-lg border border-danger/20 bg-danger/10 px-3.5 py-2.5 text-lg font-medium text-danger"
        >
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
          <p className="text-lg opacity-60">Probá cambiar la búsqueda o los filtros.</p>
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
              {sorted.map((product) => {
                const isUndifferentiated = product.variants.length === 1 && product.variants[0].is_implicit
                const priceInfo = productPriceInfo(product)
                return (
                  <div key={product.id} className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4">
                    <div className="relative">
                      <ProductThumbnail product={product} sizeClassName="aspect-video w-full" />
                      <span
                        className={`absolute right-3 top-3 inline-flex items-center gap-2 whitespace-nowrap rounded-full px-4 py-2 text-base font-semibold ${
                          product.status === 'active' ? 'bg-success-soft text-success' : 'bg-ink/5 text-ink/50'
                        }`}
                      >
                        ● {product.status === 'active' ? 'Activo' : 'Inactivo'}
                      </span>
                    </div>
                    <div className="flex items-start justify-between gap-3">
                      <span className="text-base opacity-50">Próximamente</span>
                      <RowMenu title={product.name} items={productRowMenuItems(product)} />
                    </div>
                    <div className="min-h-20">
                      <Link
                        to={`/products/${product.id}`}
                        className="line-clamp-2 text-xl font-bold leading-tight hover:text-brand"
                      >
                        <HighlightedText text={product.name} query={appliedSearch} />
                      </Link>
                      <p className="mt-0.5 text-lg opacity-60">{categoryName(product.category_id)}</p>
                    </div>
                    <div className="grid grid-cols-3 gap-3 border-t border-line pt-3">
                      <div>
                        <p className="text-sm font-bold uppercase tracking-wide opacity-50">Precio</p>
                        <p className="mt-0.5 text-lg font-bold">
                          {priceInfo === null ? (
                            <span className="italic opacity-40">Sin precio</span>
                          ) : (
                            <span className="text-brand">
                              {priceFormatter.format(priceInfo.amount)}
                              {priceInfo.hasRange && (
                                <span className="ml-1 text-sm font-normal opacity-60">desde</span>
                              )}
                            </span>
                          )}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm font-bold uppercase tracking-wide opacity-50">Unidad</p>
                        <p className="mt-0.5 text-lg font-bold">{unitName(product.unit_id)}</p>
                      </div>
                      <div>
                        <p className="text-sm font-bold uppercase tracking-wide opacity-50">Variantes</p>
                        <p className="mt-0.5 text-lg font-bold">{isUndifferentiated ? '—' : product.variants.length}</p>
                      </div>
                    </div>
                  </div>
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
              <table className="w-full min-w-[900px]">
                <thead ref={theadRef} className="sticky top-0 z-10">
                  <tr className="table-header border-b border-line">
                    <th className="whitespace-nowrap px-4 py-3 text-left text-sm font-bold uppercase tracking-wide opacity-60">Imagen</th>
                    <th className="whitespace-nowrap px-4 py-3 text-left text-sm font-bold uppercase tracking-wide opacity-60">Código</th>
                    <th
                      onClick={toggleSort}
                      className="cursor-pointer whitespace-nowrap px-4 py-3 text-left text-sm font-bold uppercase tracking-wide opacity-60 transition-colors hover:text-brand"
                    >
                      Nombre
                      <span className="ml-1.5 text-lg leading-none">{sortDir === 'asc' ? '↑' : '↓'}</span>
                    </th>
                    <th className="whitespace-nowrap pl-8 pr-4 py-3 text-left text-sm font-bold uppercase tracking-wide opacity-60">Categoría</th>
                    <th className="whitespace-nowrap px-4 py-3 text-left text-sm font-bold uppercase tracking-wide opacity-60">Unidad</th>
                    <th className="whitespace-nowrap px-4 py-3 text-left text-sm font-bold uppercase tracking-wide opacity-60">Precio</th>
                    <th className="whitespace-nowrap px-4 py-3 text-left text-sm font-bold uppercase tracking-wide opacity-60">Variantes</th>
                    <th className="whitespace-nowrap py-3 pl-8 pr-4 text-left text-sm font-bold uppercase tracking-wide opacity-60">Estado</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                {sorted.map((product) => {
                  const isUndifferentiated = product.variants.length === 1 && product.variants[0].is_implicit
                  return (
                    <tr key={product.id} className="border-t border-line transition-colors hover:bg-surface-brand/60">
                      <td className="px-4 py-3.5">
                        <ProductThumbnail product={product} sizeClassName="h-12 w-12" />
                      </td>
                      <td className="whitespace-nowrap px-4 py-3.5 text-lg italic opacity-40">Próximamente</td>
                      <td className="max-w-xs px-4 py-3.5">
                        <Link to={`/products/${product.id}`} className="text-lg font-semibold hover:text-brand">
                          <HighlightedText text={product.name} query={appliedSearch} />
                        </Link>
                      </td>
                      <td className="py-3.5 pl-8 pr-4 text-lg opacity-70">{categoryName(product.category_id)}</td>
                      <td className="px-4 py-3.5 text-lg opacity-70">{unitName(product.unit_id)}</td>
                      <td className="whitespace-nowrap px-4 py-3.5 text-lg">
                        {(() => {
                          const priceInfo = productPriceInfo(product)
                          if (priceInfo === null) {
                            return <span className="italic opacity-40">Sin precio</span>
                          }
                          return (
                            <span className="font-bold text-brand">
                              {priceFormatter.format(priceInfo.amount)}
                              {priceInfo.hasRange && (
                                <span className="ml-1 text-sm font-normal opacity-60">desde</span>
                              )}
                            </span>
                          )
                        })()}
                      </td>
                      <td className="px-4 py-3.5 text-lg opacity-70">
                        {isUndifferentiated ? '—' : product.variants.length}
                      </td>
                      <td className="py-3.5 pl-8 pr-4">
                        <span
                          className={`inline-flex items-center gap-2 whitespace-nowrap rounded-full px-4 py-2 text-base font-semibold ${
                            product.status === 'active' ? 'bg-success-soft text-success' : 'bg-ink/5 text-ink/50'
                          }`}
                        >
                          ● {product.status === 'active' ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>
                      <td className="py-3.5 pl-4 pr-8 text-center">
                        <RowMenu title={product.name} items={productRowMenuItems(product)} />
                      </td>
                    </tr>
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
            <Pagination
              page={filters.page}
              totalPages={totalPages}
              onPageChange={(page) => setFilters((current) => ({ ...current, page }))}
            />
          </div>
        </>
      )}

      <Outlet context={{ onProductUpdated: applyProductUpdate }} />

      {confirmingProduct !== null && (
        <ConfirmDialog
          title={confirmingProduct.status === 'active' ? 'Desactivar producto' : 'Activar producto'}
          description={
            confirmingProduct.status === 'active'
              ? `"${confirmingProduct.name}" y todas sus variantes van a dejar de aparecer en las consultas del catálogo. Vas a poder reactivarlo cuando quieras.`
              : `"${confirmingProduct.name}" y sus variantes vuelven a aparecer en las consultas del catálogo.`
          }
          confirmLabel={confirmingProduct.status === 'active' ? 'Desactivar' : 'Activar'}
          danger={confirmingProduct.status === 'active'}
          onConfirm={confirmToggleActive}
          onCancel={() => setConfirmingProduct(null)}
        />
      )}
    </section>
  )
}
