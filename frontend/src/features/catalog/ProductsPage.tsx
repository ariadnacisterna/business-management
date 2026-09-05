import { useEffect, useMemo, useState } from 'react'
import { Link, Outlet, useNavigate } from 'react-router-dom'
import { deactivateProduct, fetchCategories, fetchProducts, fetchUnits, reactivateProduct } from '../../api/catalog'
import type { Category, Product, Unit } from '../../api/types'
import { useAuth } from '../access/AuthContext'
import { canManageCatalog } from '../access/roles'
import { SelectMenu } from '../../shared/SelectMenu'
import { RowMenu } from './RowMenu'

type Status = 'loading' | 'success' | 'error'
type SortKey = 'name' | 'category' | 'unit'

const LOAD_ERROR_MESSAGE = 'No se pudieron cargar los productos.'

const inputClasses =
  'h-12 rounded-lg border border-line bg-surface px-3 text-lg focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/10'
const primaryButtonClasses =
  'h-12 rounded-lg bg-brand px-5 text-base font-bold text-brand-contrast transition-colors hover:bg-brand/90'
const secondaryButtonClasses =
  'h-11 rounded-lg border border-line bg-surface px-3 text-base transition-colors hover:bg-surface-brand'

export function ProductsPage() {
  const { account } = useAuth()
  const canManage = canManageCatalog(account)
  const navigate = useNavigate()

  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [units, setUnits] = useState<Unit[]>([])
  const [status, setStatus] = useState<Status>('loading')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<number | 'all'>('all')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all')
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'name', dir: 'asc' })

  function load() {
    setStatus('loading')
    setLoadError(null)
    Promise.all([fetchProducts(), fetchCategories(), fetchUnits()])
      .then(([productList, categoryList, unitList]) => {
        setProducts(productList)
        setCategories(categoryList)
        setUnits(unitList)
        setStatus('success')
      })
      .catch(() => {
        setLoadError(LOAD_ERROR_MESSAGE)
        setStatus('error')
      })
  }

  useEffect(load, [])

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

  function toggleSort(key: SortKey) {
    setSort((prev) => (prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }))
  }

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    const categoryNames = new Map(categories.map((category) => [category.id, category.name]))
    const unitNames = new Map(units.map((unit) => [unit.id, unit.name]))

    return products
      .filter((product) => {
        const matchesSearch = query === '' || product.name.toLowerCase().includes(query)
        const matchesCategory = categoryFilter === 'all' || product.category_id === categoryFilter
        const matchesStatus = statusFilter === 'all' || product.status === statusFilter
        return matchesSearch && matchesCategory && matchesStatus
      })
      .sort((a, b) => {
        const value = (product: Product) =>
          sort.key === 'name'
            ? product.name
            : sort.key === 'category'
              ? (categoryNames.get(product.category_id) ?? '—')
              : (unitNames.get(product.unit_id) ?? '—')
        const comparison = value(a).localeCompare(value(b))
        return sort.dir === 'asc' ? comparison : -comparison
      })
  }, [products, search, categoryFilter, statusFilter, sort, categories, units])

  const columns: { key: SortKey; label: string }[] = [
    { key: 'name', label: 'Nombre' },
    { key: 'category', label: 'Categoría' },
    { key: 'unit', label: 'Unidad' },
  ]

  return (
    <section className="-m-4 flex min-h-[calc(100svh-4rem)] flex-col gap-4 bg-line/10 p-4 md:-m-6 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Productos</h1>
          <p className="mt-1 text-lg opacity-60">{filtered.length} productos encontrados</p>
        </div>
        {canManage && (
          <Link to="/products/new" className={`${primaryButtonClasses} flex items-center gap-2`}>
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

      <div className="flex flex-wrap gap-3">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Buscar nombre, código, categoría…"
          aria-label="Buscar productos"
          className={`${inputClasses} min-w-48 flex-1`}
        />
        <SelectMenu
          value={categoryFilter === 'all' ? 'all' : String(categoryFilter)}
          onChange={(value) => setCategoryFilter(value === 'all' ? 'all' : Number(value))}
          ariaLabel="Filtrar por categoría"
          className="w-56"
          options={[
            { value: 'all', label: 'Todas las categorías' },
            ...categories.map((category) => ({ value: String(category.id), label: category.name })),
          ]}
        />
        <SelectMenu
          value={statusFilter}
          onChange={(value) => setStatusFilter(value)}
          ariaLabel="Filtrar por estado"
          className="w-56"
          options={[
            { value: 'all', label: 'Todos los estados' },
            { value: 'active', label: 'Activo' },
            { value: 'inactive', label: 'Inactivo' },
          ]}
        />
        <button
          type="button"
          disabled={search === '' && categoryFilter === 'all' && statusFilter === 'all'}
          onClick={() => {
            setSearch('')
            setCategoryFilter('all')
            setStatusFilter('all')
          }}
          className="h-12 w-56 rounded-lg border-2 border-brand bg-surface text-lg font-semibold text-brand transition-colors hover:bg-brand hover:text-brand-contrast disabled:cursor-not-allowed disabled:border-line disabled:bg-surface disabled:font-normal disabled:text-ink/40 disabled:hover:bg-surface disabled:hover:text-ink/40"
        >
          Limpiar búsqueda
        </button>
      </div>

      {actionError !== null && (
        <p
          role="alert"
          className="m-0 rounded-lg border border-danger/20 bg-danger/10 px-3.5 py-2.5 text-lg font-medium text-danger"
        >
          {actionError}
        </p>
      )}

      {status === 'loading' && <p role="status">Cargando…</p>}

      {status === 'error' && (
        <div className="flex items-center gap-3" role="alert">
          <p className="m-0 text-danger">{loadError}</p>
          <button type="button" onClick={load} className={secondaryButtonClasses}>
            Reintentar
          </button>
        </div>
      )}

      {status === 'success' && filtered.length === 0 && (
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

      {status === 'success' && filtered.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-line bg-surface">
          <table className="w-full">
            <thead>
              <tr className="border-b border-line bg-surface-brand/40">
                <th className="px-4 py-3 text-left text-sm font-semibold uppercase tracking-wide opacity-60">Código</th>
                {columns.map((column) => (
                  <th
                    key={column.key}
                    onClick={() => toggleSort(column.key)}
                    className="cursor-pointer whitespace-nowrap px-4 py-3 text-left text-sm font-semibold uppercase tracking-wide opacity-60 transition-colors hover:text-brand"
                  >
                    {column.label}
                    {sort.key === column.key && <span className="ml-1">{sort.dir === 'asc' ? '↑' : '↓'}</span>}
                  </th>
                ))}
                <th className="px-4 py-3 text-left text-sm font-semibold uppercase tracking-wide opacity-60">Precio</th>
                <th className="px-4 py-3 text-left text-sm font-semibold uppercase tracking-wide opacity-60">Variantes</th>
                <th className="px-4 py-3 text-left text-sm font-semibold uppercase tracking-wide opacity-60">Estado</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((product) => {
                const isUndifferentiated = product.variants.length === 1 && product.variants[0].is_implicit
                return (
                  <tr key={product.id} className="border-t border-line transition-colors hover:bg-surface-brand/60">
                    <td className="px-4 py-3.5 text-lg italic opacity-40">Próximamente</td>
                    <td className="px-4 py-3.5">
                      <Link to={`/products/${product.id}`} className="text-lg font-semibold hover:text-brand">
                        {product.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3.5 text-lg opacity-70">{categoryName(product.category_id)}</td>
                    <td className="px-4 py-3.5 text-lg opacity-70">{unitName(product.unit_id)}</td>
                    <td className="px-4 py-3.5 text-lg italic opacity-40">Próximamente</td>
                    <td className="px-4 py-3.5 text-lg opacity-70">
                      {isUndifferentiated ? '—' : product.variants.length}
                    </td>
                    <td className="px-4 py-3.5">
                      <span
                        className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-base font-semibold ${
                          product.status === 'active' ? 'bg-success-soft text-success' : 'bg-ink/5 text-ink/50'
                        }`}
                      >
                        ● {product.status === 'active' ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      <RowMenu
                        title={product.name}
                        items={[
                          { label: 'Ver detalle', icon: '👁', onClick: () => navigate(`/products/${product.id}`) },
                          ...(canManage
                            ? [
                                {
                                  label: 'Cambiar precio',
                                  icon: '$',
                                  onClick: () => navigate(`/products/${product.id}?changePrice=1`),
                                },
                                {
                                  label: 'Editar producto',
                                  icon: '✎',
                                  onClick: () => navigate(`/products/${product.id}?edit=1`),
                                },
                                {
                                  label: product.status === 'active' ? 'Desactivar' : 'Activar',
                                  icon: '⊘',
                                  danger: product.status === 'active',
                                  success: product.status !== 'active',
                                  onClick: () => toggleActive(product),
                                },
                              ]
                            : []),
                        ]}
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <Outlet context={{ onProductUpdated: applyProductUpdate }} />
    </section>
  )
}
