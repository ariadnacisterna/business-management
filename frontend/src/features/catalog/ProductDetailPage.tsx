import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useOutletContext, useParams, useSearchParams } from 'react-router-dom'
import {
  fetchAttributes,
  fetchAttributeValues,
  fetchCategories,
  fetchProduct,
  fetchUnits,
  fetchVariantCurrentPrice,
  updateProduct,
  updateVariant,
} from '../../api/catalog'
import { fetchAccount } from '../../api/auth'
import { ApiError } from '../../api/client'
import type { Attribute, Category, Price, Product, Unit, Variant } from '../../api/types'
import { formatRelativeTime } from '../../shared/formatRelativeTime'
import { SelectMenu } from '../../shared/SelectMenu'
import { useAuth } from '../access/AuthContext'
import { canManageCatalog } from '../access/roles'
import { ChangePriceModal } from './ChangePriceModal'
import { DuplicateWarning } from './DuplicateWarning'
import { VariantAttributesEditor } from './VariantAttributesEditor'
import type { SelectedAttributeValue } from './VariantAttributesEditor'

const priceFormatter = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' })

const LOAD_ERROR_MESSAGE = 'No se pudo cargar el producto.'
const SAVE_ERROR_MESSAGE = 'No se pudo guardar. Intentá de nuevo.'

const inputClasses =
  'h-11 rounded-lg border border-line px-3 text-base focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/10'
const primaryButtonClasses =
  'min-h-11 rounded-lg bg-brand px-4 text-base font-bold text-brand-contrast transition-colors hover:bg-brand/90 disabled:opacity-40'
const secondaryButtonClasses = 'h-11 rounded-lg border border-line px-3 text-base transition-colors hover:bg-surface-brand'

interface ValueInfo {
  attribute_name: string
  value: string
}

export interface ProductsOutletContext {
  onProductUpdated: (product: Product) => void
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

function describeVariant(variant: Variant, valuesById: Map<number, ValueInfo>): string {
  const parts = [
    variant.label,
    ...variant.attribute_value_ids.map((id) => {
      const info = valuesById.get(id)
      return info === undefined ? null : `${capitalize(info.attribute_name)}: ${info.value}`
    }),
  ].filter((part): part is string => part !== null && part !== '')

  return parts.length > 0 ? parts.join(' · ') : 'Sin diferenciar'
}

export function ProductDetailPage() {
  const { productId } = useParams()
  const id = Number(productId)
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { account } = useAuth()
  const canManage = canManageCatalog(account)
  const outletContext = useOutletContext<ProductsOutletContext>() as ProductsOutletContext | undefined

  const [product, setProduct] = useState<Product | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [units, setUnits] = useState<Unit[]>([])
  const [attributes, setAttributes] = useState<Attribute[]>([])
  const [valuesById, setValuesById] = useState<Map<number, ValueInfo>>(new Map())
  const [loadStatus, setLoadStatus] = useState<'loading' | 'success' | 'error'>('loading')

  const [editingProduct, setEditingProduct] = useState(false)
  const [productDraft, setProductDraft] = useState({ name: '', categoryId: 0, unitId: 0 })
  const [savingProduct, setSavingProduct] = useState(false)
  const [productError, setProductError] = useState<string | null>(null)

  const [editingVariantId, setEditingVariantId] = useState<number | null>(null)
  const [variantLabel, setVariantLabel] = useState('')
  const [variantValues, setVariantValues] = useState<SelectedAttributeValue[]>([])
  const [savingVariant, setSavingVariant] = useState(false)
  const [variantError, setVariantError] = useState<string | null>(null)

  const [duplicates, setDuplicates] = useState<Variant[]>([])

  const [pricesByVariant, setPricesByVariant] = useState<Map<number, Price | null>>(new Map())
  const [priceModalVariant, setPriceModalVariant] = useState<Variant | null>(null)
  const [accountNames, setAccountNames] = useState<Map<number, string>>(new Map())

  const activeAttributes = useMemo(
    () => attributes.filter((attribute) => attribute.status === 'active'),
    [attributes],
  )

  const requestIdRef = useRef(0)

  function load() {
    const requestId = ++requestIdRef.current
    setLoadStatus('loading')
    Promise.all([fetchProduct(id), fetchCategories(), fetchUnits(), fetchAttributes()])
      .then(async ([productResult, categoryList, unitList, attributeList]) => {
        if (requestId !== requestIdRef.current) return
        setProduct(productResult)
        setCategories(categoryList)
        setUnits(unitList)
        setAttributes(attributeList)

        const valueLists = await Promise.all(
          attributeList.map((attribute) => fetchAttributeValues(attribute.id)),
        )
        if (requestId !== requestIdRef.current) return
        const map = new Map<number, ValueInfo>()
        attributeList.forEach((attribute, index) => {
          for (const value of valueLists[index]) {
            map.set(value.id, { attribute_name: attribute.name, value: value.value })
          }
        })
        setValuesById(map)
        setLoadStatus('success')

        const priceResults = await Promise.all(
          productResult.variants.map((variant) => fetchVariantCurrentPrice(variant.id)),
        )
        if (requestId !== requestIdRef.current) return
        setPricesByVariant(new Map(priceResults.map((result) => [result.variant_id, result.price])))

        const authorIds = [
          ...new Set(
            priceResults
              .map((result) => result.price?.created_by_account_id)
              .filter((authorId): authorId is number => authorId !== undefined),
          ),
        ]
        Promise.allSettled(authorIds.map((authorId) => fetchAccount(authorId))).then((results) => {
          if (requestId !== requestIdRef.current) return
          const resolved = results.flatMap((result) => (result.status === 'fulfilled' ? [result.value] : []))
          if (resolved.length > 0) {
            setAccountNames((prev) => {
              const next = new Map(prev)
              for (const author of resolved) {
                next.set(author.id, author.name)
              }
              return next
            })
          }
        })

        if (searchParams.get('edit') === '1' && canManage) {
          setProductDraft({
            name: productResult.name,
            categoryId: productResult.category_id,
            unitId: productResult.unit_id,
          })
          setEditingProduct(true)
        }

        if (searchParams.get('changePrice') === '1' && canManage && productResult.variants.length === 1) {
          setPriceModalVariant(productResult.variants[0])
        }
      })
      .catch(() => {
        if (requestId !== requestIdRef.current) return
        setLoadStatus('error')
      })
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [id])

  function close() {
    navigate('/products')
  }

  function startEditProduct() {
    if (product === null) return
    setProductDraft({ name: product.name, categoryId: product.category_id, unitId: product.unit_id })
    setEditingProduct(true)
    setProductError(null)
  }

  async function handleSaveProduct(event: React.FormEvent) {
    event.preventDefault()
    if (product === null) return

    setSavingProduct(true)
    setProductError(null)
    try {
      const updated = await updateProduct(product.id, {
        name: productDraft.name.trim(),
        category_id: productDraft.categoryId,
        unit_id: productDraft.unitId,
      })
      setProduct((prev) => (prev === null ? prev : { ...updated, variants: prev.variants }))
      outletContext?.onProductUpdated({ ...updated, variants: product.variants })
      setEditingProduct(false)
    } catch (error) {
      setProductError(error instanceof ApiError ? error.message : SAVE_ERROR_MESSAGE)
    } finally {
      setSavingProduct(false)
    }
  }

  function startEditVariant(variant: Variant) {
    setEditingVariantId(variant.id)
    setVariantLabel(variant.label ?? '')
    setVariantValues(
      variant.attribute_value_ids.map((valueId) => {
        const info = valuesById.get(valueId)
        return { id: valueId, attribute_id: 0, value: info?.value ?? `#${valueId}` }
      }),
    )
    setVariantError(null)
  }

  function cancelEditVariant() {
    setEditingVariantId(null)
    setVariantValues([])
    setVariantError(null)
  }

  async function handleSaveVariant(event: React.FormEvent) {
    event.preventDefault()
    if (editingVariantId === null) return

    setSavingVariant(true)
    setVariantError(null)
    try {
      const result = await updateVariant(editingVariantId, {
        label: variantLabel.trim() === '' ? null : variantLabel.trim(),
        attribute_value_ids: variantValues.map((value) => value.id),
      })
      setProduct((prev) =>
        prev === null
          ? prev
          : {
              ...prev,
              variants: prev.variants.map((variant) =>
                variant.id === result.variant.id ? result.variant : variant,
              ),
            },
      )
      setDuplicates(result.possible_duplicates)
      cancelEditVariant()
    } catch (error) {
      setVariantError(error instanceof ApiError ? error.message : SAVE_ERROR_MESSAGE)
    } finally {
      setSavingVariant(false)
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink/20 backdrop-blur-sm" onClick={close} aria-hidden="true" />

      <div className="relative flex max-h-[90vh] min-h-[16rem] w-full max-w-lg flex-col overflow-y-auto rounded-2xl bg-surface p-6 shadow-2xl">
        <button
          type="button"
          onClick={close}
          aria-label="Cerrar"
          className="absolute right-4 top-4 flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-line/20 text-ink/70 transition-colors hover:bg-danger/15 hover:text-danger"
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

        {loadStatus === 'loading' && (
          <p role="status" className="flex flex-1 items-center justify-center text-lg opacity-60">
            Cargando…
          </p>
        )}

        {loadStatus === 'error' && (
          <div className="flex items-center gap-3" role="alert">
            <p className="m-0 text-danger">{LOAD_ERROR_MESSAGE}</p>
            <button type="button" onClick={load} className={secondaryButtonClasses}>
              Reintentar
            </button>
          </div>
        )}

        {loadStatus === 'success' && product !== null && (
          <div className="flex flex-col gap-4">
            <p className="text-base opacity-60">
              <Link to="/products" className="hover:text-brand">
                Catálogo
              </Link>{' '}
              › {product.name} › <span className="text-brand">{editingProduct ? 'Editar' : 'Ver detalle'}</span>
            </p>

            <DuplicateWarning duplicates={duplicates} />

            {editingProduct ? (
              <form onSubmit={handleSaveProduct} className="flex flex-col gap-2">
                <label htmlFor="edit-product-name" className="text-base font-semibold">
                  Nombre
                </label>
                <input
                  id="edit-product-name"
                  type="text"
                  value={productDraft.name}
                  onChange={(event) => setProductDraft((prev) => ({ ...prev, name: event.target.value }))}
                  disabled={savingProduct}
                  className={inputClasses}
                />

                <span className="text-base font-semibold">Categoría</span>
                <SelectMenu
                  ariaLabel="Categoría"
                  disabled={savingProduct}
                  value={String(productDraft.categoryId)}
                  onChange={(value) => setProductDraft((prev) => ({ ...prev, categoryId: Number(value) }))}
                  options={categories
                    .filter((category) => category.status === 'active' || category.id === productDraft.categoryId)
                    .map((category) => ({ value: String(category.id), label: category.name }))}
                />

                <span className="text-base font-semibold">Unidad</span>
                <SelectMenu
                  ariaLabel="Unidad"
                  disabled={savingProduct}
                  value={String(productDraft.unitId)}
                  onChange={(value) => setProductDraft((prev) => ({ ...prev, unitId: Number(value) }))}
                  options={units
                    .filter((unit) => unit.status === 'active' || unit.id === productDraft.unitId)
                    .map((unit) => ({ value: String(unit.id), label: `${unit.name} (${unit.abbreviation})` }))}
                />

                {productError !== null && (
                  <p role="alert" className="m-0 text-base text-danger">
                    {productError}
                  </p>
                )}

                <div className="flex gap-2">
                  <button type="submit" disabled={savingProduct} className={primaryButtonClasses}>
                    Guardar
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingProduct(false)}
                    disabled={savingProduct}
                    className={secondaryButtonClasses}
                  >
                    Cancelar
                  </button>
                </div>
              </form>
            ) : (
              <div className="flex flex-col gap-3">
                <div className="flex items-start justify-between gap-3">
                  <h1 className="m-0 text-2xl font-bold">{product.name}</h1>
                  {canManage && (
                    <button
                      type="button"
                      onClick={startEditProduct}
                      aria-label="Editar producto"
                      title="Editar producto"
                      className="flex h-11 w-11 items-center justify-center rounded-lg text-ink/60 transition-colors hover:bg-surface-brand hover:text-brand"
                    >
                      <svg
                        aria-hidden="true"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.75"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="h-5 w-5"
                      >
                        <path d="M12 20h9" />
                        <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                      </svg>
                    </button>
                  )}
                </div>

                <div className="-mt-3 flex items-center gap-2 text-base">
                  <span
                    className={`flex items-center gap-1.5 font-semibold ${
                      product.status === 'active' ? 'text-success' : 'text-ink/50'
                    }`}
                  >
                    ● {product.status === 'active' ? 'Activo' : 'Inactivo'}
                  </span>
                  <span className="opacity-40">·</span>
                  <span className="font-mono uppercase italic opacity-40">Próximamente</span>
                </div>

                <div className="grid grid-cols-2 gap-4 rounded-xl bg-line/15 p-4">
                  <div>
                    <p className="m-0 text-base opacity-60">Categoría</p>
                    <p className="m-0 font-medium">
                      {categories.find((category) => category.id === product.category_id)?.name ?? '—'}
                    </p>
                  </div>
                  <div>
                    <p className="m-0 text-base opacity-60">Unidad</p>
                    <p className="m-0 font-medium">
                      {units.find((unit) => unit.id === product.unit_id)?.name ?? '—'}
                    </p>
                  </div>
                  <div className="col-span-2">
                    <p className="m-0 text-base opacity-60">Descripción</p>
                    <p className="m-0 italic opacity-40">Próximamente</p>
                  </div>
                </div>
              </div>
            )}

            {!editingProduct && !(product.variants.length === 1 && product.variants[0].is_implicit) && (
              <div className="flex flex-col gap-3 border-t border-line pt-3">
                <h2 className="text-base font-semibold">Variantes</h2>
                <ul className="m-0 flex list-none flex-col gap-2 p-0">
                  {product.variants.map((variant) => (
                    <li key={variant.id} className="rounded-xl border border-line p-4">

                      {editingVariantId === variant.id ? (
                        <form onSubmit={handleSaveVariant} className="flex w-full flex-col gap-2">
                          <label htmlFor={`variant-label-${variant.id}`} className="text-base font-semibold">
                            Nombre
                          </label>
                          <input
                            id={`variant-label-${variant.id}`}
                            type="text"
                            value={variantLabel}
                            onChange={(event) => setVariantLabel(event.target.value)}
                            disabled={savingVariant}
                            className={inputClasses}
                          />
                          <VariantAttributesEditor
                            attributes={activeAttributes}
                            selectedValues={variantValues}
                            onAdd={(value) => setVariantValues((prev) => [...prev, value])}
                            onRemove={(valueId) =>
                              setVariantValues((prev) => prev.filter((value) => value.id !== valueId))
                            }
                            onAttributeCreated={(attribute) => setAttributes((prev) => [...prev, attribute])}
                            disabled={savingVariant}
                          />
                          {variantError !== null && (
                            <p role="alert" className="m-0 text-base text-danger">
                              {variantError}
                            </p>
                          )}
                          <div className="flex gap-2">
                            <button type="submit" disabled={savingVariant} className={primaryButtonClasses}>
                              Guardar
                            </button>
                            <button
                              type="button"
                              onClick={cancelEditVariant}
                              disabled={savingVariant}
                              className={secondaryButtonClasses}
                            >
                              Cancelar
                            </button>
                          </div>
                        </form>
                      ) : (
                        <div className="flex w-full flex-col gap-3">
                          <div className="flex items-start justify-between gap-3">
                            <span
                              className={`text-lg font-bold ${variant.status !== 'active' ? 'opacity-50 line-through' : ''}`}
                            >
                              {describeVariant(variant, valuesById)}
                            </span>
                            <span className="text-xl font-bold text-brand">
                              {pricesByVariant.get(variant.id)?.amount !== undefined
                                ? priceFormatter.format(Number(pricesByVariant.get(variant.id)!.amount))
                                : 'Sin precio'}
                            </span>
                          </div>

                          <div className="flex flex-col gap-0.5 text-base opacity-60">
                            <p className="m-0">
                              <span>Stock: </span>
                              <span>Próximamente</span>
                            </p>
                            <p className="m-0">
                              <span>Último cambio: </span>
                              <span>
                                {(() => {
                                  const price = pricesByVariant.get(variant.id)
                                  if (price === null || price === undefined) return '—'
                                  const authorName = accountNames.get(price.created_by_account_id)
                                  return authorName === undefined
                                    ? formatRelativeTime(price.effective_from)
                                    : `${formatRelativeTime(price.effective_from)} por ${authorName}`
                                })()}
                              </span>
                            </p>
                          </div>

                          <div className="flex flex-wrap gap-2">
                            {canManage && (
                              <button
                                type="button"
                                onClick={() => setPriceModalVariant(variant)}
                                className={primaryButtonClasses}
                              >
                                Cambiar precio
                              </button>
                            )}
                            <button type="button" disabled className={`${secondaryButtonClasses} opacity-40`}>
                              Ver historial
                            </button>
                            {canManage && (
                              <button
                                type="button"
                                onClick={() => startEditVariant(variant)}
                                className={secondaryButtonClasses}
                              >
                                Editar
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>

              </div>
            )}
          </div>
        )}
      </div>

      {priceModalVariant !== null && product !== null && (
        <ChangePriceModal
          product={product}
          variant={priceModalVariant}
          currentPrice={pricesByVariant.get(priceModalVariant.id) ?? null}
          activeVariantPrices={
            new Map(
              product.variants
                .filter((variant) => variant.status === 'active')
                .map((variant) => [variant.id, pricesByVariant.get(variant.id) ?? null]),
            )
          }
          onClose={() => setPriceModalVariant(null)}
          onSuccess={(updates) => {
            setPricesByVariant((prev) => {
              const next = new Map(prev)
              for (const update of updates) {
                next.set(update.variantId, update.price)
              }
              return next
            })
            if (account !== null) {
              setAccountNames((prev) => new Map(prev).set(account.id, account.name))
            }
            setPriceModalVariant(null)
          }}
        />
      )}
    </div>
  )
}
