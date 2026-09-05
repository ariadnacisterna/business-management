import { useEffect, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import {
  createCategory,
  createProduct,
  createUnit,
  fetchAttributes,
  fetchCategories,
  fetchUnits,
  setInitialVariantPrice,
} from '../../api/catalog'
import { ApiError } from '../../api/client'
import type { Attribute, Category, Product, Unit, Variant } from '../../api/types'
import { SelectMenu } from '../../shared/SelectMenu'
import { useAuth } from '../access/AuthContext'
import { canManageCatalog } from '../access/roles'
import { DuplicateWarning } from './DuplicateWarning'
import { VariantAttributesEditor } from './VariantAttributesEditor'
import type { SelectedAttributeValue } from './VariantAttributesEditor'

const LOAD_ERROR_MESSAGE = 'No se pudieron cargar los datos necesarios para el formulario.'
const CREATE_ERROR_MESSAGE = 'No se pudo crear el producto. Intentá de nuevo.'
const PRICE_ERROR_MESSAGE = 'No se pudo guardar el precio. Intentá de nuevo.'
const CREATE_CATEGORY_ERROR_MESSAGE = 'No se pudo crear la categoría. Intentá de nuevo.'
const CREATE_UNIT_ERROR_MESSAGE = 'No se pudo crear la unidad. Intentá de nuevo.'

const CREATE_NEW_OPTION = '__create__'

const inputClasses =
  'h-12 rounded-lg border border-line px-3.5 text-lg focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/10'
const primaryButtonClasses =
  'h-12 self-start rounded-lg bg-brand px-5 text-base font-bold text-brand-contrast transition-colors hover:bg-brand/90 disabled:opacity-40'
const secondaryButtonClasses = 'min-h-12 rounded-lg border border-line px-4 text-base transition-colors hover:bg-surface-brand'

interface VariantDraft {
  key: number
  label: string
  values: SelectedAttributeValue[]
}

let nextDraftKey = 1

export function ProductFormPage() {
  const navigate = useNavigate()
  const { account } = useAuth()
  const canManage = canManageCatalog(account)

  const [categories, setCategories] = useState<Category[]>([])
  const [units, setUnits] = useState<Unit[]>([])
  const [attributes, setAttributes] = useState<Attribute[]>([])
  const [loadStatus, setLoadStatus] = useState<'loading' | 'success' | 'error'>('loading')

  const [name, setName] = useState('')
  const [categoryId, setCategoryId] = useState<number | ''>('')
  const [unitId, setUnitId] = useState<number | ''>('')
  const [addVariants, setAddVariants] = useState(false)
  const [variantDrafts, setVariantDrafts] = useState<VariantDraft[]>([])

  const [creatingCategory, setCreatingCategory] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [savingNewCategory, setSavingNewCategory] = useState(false)
  const [newCategoryError, setNewCategoryError] = useState<string | null>(null)

  const [creatingUnit, setCreatingUnit] = useState(false)
  const [newUnit, setNewUnit] = useState({ name: '', abbreviation: '', allows_fraction: false })
  const [savingNewUnit, setSavingNewUnit] = useState(false)
  const [newUnitError, setNewUnitError] = useState<string | null>(null)

  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  const [createdProduct, setCreatedProduct] = useState<Product | null>(null)
  const [duplicates, setDuplicates] = useState<Variant[]>([])
  const [prices, setPrices] = useState<Record<number, string>>({})
  const [savingPrices, setSavingPrices] = useState(false)
  const [priceError, setPriceError] = useState<string | null>(null)
  const [savedVariantIds, setSavedVariantIds] = useState<Set<number>>(new Set())

  useEffect(() => {
    Promise.all([fetchCategories(), fetchUnits(), fetchAttributes()])
      .then(([categoryList, unitList, attributeList]) => {
        setCategories(categoryList.filter((category) => category.status === 'active'))
        setUnits(unitList.filter((unit) => unit.status === 'active'))
        setAttributes(attributeList.filter((attribute) => attribute.status === 'active'))
        setLoadStatus('success')
      })
      .catch(() => setLoadStatus('error'))
  }, [])

  function close() {
    navigate('/products')
  }

  async function handleCreateCategory() {
    const trimmed = newCategoryName.trim()
    if (trimmed === '') return

    setSavingNewCategory(true)
    setNewCategoryError(null)
    try {
      const created = await createCategory(trimmed)
      setCategories((prev) => [...prev, created])
      setCategoryId(created.id)
      setCreatingCategory(false)
      setNewCategoryName('')
    } catch (error) {
      setNewCategoryError(error instanceof ApiError ? error.message : CREATE_CATEGORY_ERROR_MESSAGE)
    } finally {
      setSavingNewCategory(false)
    }
  }

  async function handleCreateUnit() {
    const trimmedName = newUnit.name.trim()
    const trimmedAbbreviation = newUnit.abbreviation.trim()
    if (trimmedName === '' || trimmedAbbreviation === '') return

    setSavingNewUnit(true)
    setNewUnitError(null)
    try {
      const created = await createUnit({
        name: trimmedName,
        abbreviation: trimmedAbbreviation,
        allows_fraction: newUnit.allows_fraction,
      })
      setUnits((prev) => [...prev, created])
      setUnitId(created.id)
      setCreatingUnit(false)
      setNewUnit({ name: '', abbreviation: '', allows_fraction: false })
    } catch (error) {
      setNewUnitError(error instanceof ApiError ? error.message : CREATE_UNIT_ERROR_MESSAGE)
    } finally {
      setSavingNewUnit(false)
    }
  }

  function addVariantDraft() {
    setVariantDrafts((prev) => [...prev, { key: nextDraftKey++, label: '', values: [] }])
  }

  function removeVariantDraft(key: number) {
    setVariantDrafts((prev) => prev.filter((draft) => draft.key !== key))
  }

  function updateVariantLabel(key: number, label: string) {
    setVariantDrafts((prev) => prev.map((draft) => (draft.key === key ? { ...draft, label } : draft)))
  }

  function addVariantValue(key: number, value: SelectedAttributeValue) {
    setVariantDrafts((prev) =>
      prev.map((draft) => (draft.key === key ? { ...draft, values: [...draft.values, value] } : draft)),
    )
  }

  function removeVariantValue(key: number, valueId: number) {
    setVariantDrafts((prev) =>
      prev.map((draft) =>
        draft.key === key ? { ...draft, values: draft.values.filter((value) => value.id !== valueId) } : draft,
      ),
    )
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (categoryId === '' || unitId === '' || name.trim() === '') return

    setCreating(true)
    setCreateError(null)
    try {
      const result = await createProduct({
        name: name.trim(),
        category_id: categoryId,
        unit_id: unitId,
        variants:
          addVariants && variantDrafts.length > 0
            ? variantDrafts.map((draft) => ({
                label: draft.label.trim() === '' ? null : draft.label.trim(),
                attribute_value_ids: draft.values.map((value) => value.id),
              }))
            : undefined,
      })
      setCreatedProduct(result.product)
      setDuplicates(result.possible_duplicates)
      setPrices(Object.fromEntries(result.product.variants.map((variant) => [variant.id, ''])))
    } catch (error) {
      setCreateError(error instanceof ApiError ? error.message : CREATE_ERROR_MESSAGE)
    } finally {
      setCreating(false)
    }
  }

  async function handleSavePrices(event: React.FormEvent) {
    event.preventDefault()
    if (createdProduct === null) return

    setSavingPrices(true)
    setPriceError(null)
    try {
      for (const variant of createdProduct.variants) {
        if (savedVariantIds.has(variant.id)) continue
        const amount = prices[variant.id]?.trim() ?? ''
        if (amount === '') continue
        await setInitialVariantPrice(variant.id, amount)
        setSavedVariantIds((prev) => new Set(prev).add(variant.id))
      }
      navigate(`/products/${createdProduct.id}`)
    } catch (error) {
      setPriceError(error instanceof ApiError ? error.message : PRICE_ERROR_MESSAGE)
    } finally {
      setSavingPrices(false)
    }
  }

  const allPricesFilled =
    createdProduct !== null &&
    createdProduct.variants.every((variant) => (prices[variant.id]?.trim() ?? '') !== '')

  if (!canManage) {
    return <Navigate to="/products" replace />
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink/20 backdrop-blur-sm" onClick={close} aria-hidden="true" />

      <div className="relative flex max-h-[90vh] w-full max-w-xl flex-col overflow-y-auto rounded-2xl bg-surface p-6 shadow-2xl">
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
          <p role="alert" className="text-danger">
            {LOAD_ERROR_MESSAGE}
          </p>
        )}

        {loadStatus === 'success' && createdProduct !== null && (
          <div className="flex flex-col gap-4">
            <p className="text-base opacity-60">
              <Link to="/products" className="hover:text-brand">
                Catálogo
              </Link>{' '}
              › <span className="text-brand">Precio inicial</span>
            </p>

            <div>
              <h1 className="m-0 text-2xl font-bold">Precio inicial</h1>
              <p className="mt-1 opacity-70">
                {createdProduct.variants.length === 1 && createdProduct.variants[0].is_implicit
                  ? 'Definí el precio del producto para que aparezca en las búsquedas.'
                  : 'Definí el precio de cada variante para que aparezcan en las búsquedas.'}
              </p>
            </div>

            <DuplicateWarning duplicates={duplicates} />

            <form onSubmit={handleSavePrices} className="flex flex-col gap-3">
              {createdProduct.variants.map((variant) => (
                <label key={variant.id} className="flex flex-col gap-1">
                  <span className="text-lg font-semibold">
                    {createdProduct.variants.length === 1 && createdProduct.variants[0].is_implicit
                      ? 'Precio'
                      : (variant.label ?? `Variante #${variant.id}`)}
                  </span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    value={prices[variant.id] ?? ''}
                    onChange={(event) => setPrices((prev) => ({ ...prev, [variant.id]: event.target.value }))}
                    disabled={savingPrices}
                    required
                    className={inputClasses}
                  />
                </label>
              ))}

              {priceError !== null && (
                <p role="alert" className="m-0 text-base text-danger">
                  {priceError}
                </p>
              )}

              <button type="submit" disabled={savingPrices || !allPricesFilled} className={primaryButtonClasses}>
                Guardar precio{createdProduct.variants.length > 1 ? 's' : ''}
              </button>
            </form>
          </div>
        )}

        {loadStatus === 'success' && createdProduct === null && (
          <div className="flex flex-col gap-4">
            <p className="text-base opacity-60">
              <Link to="/products" className="hover:text-brand">
                Catálogo
              </Link>{' '}
              › <span className="text-brand">Nuevo producto</span>
            </p>

            <h1 className="m-0 text-2xl font-bold">Nuevo producto</h1>

            <form onSubmit={handleSubmit} className="flex flex-col gap-3">
              <label htmlFor="product-name" className="text-lg font-semibold">
                Nombre
              </label>
              <input
                id="product-name"
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                disabled={creating}
                required
                className={inputClasses}
              />

              <span className="text-lg font-semibold">Categoría</span>
              <SelectMenu
                ariaLabel="Categoría"
                disabled={creating}
                value={categoryId === '' ? '' : String(categoryId)}
                onChange={(value) => {
                  if (value === CREATE_NEW_OPTION) {
                    setCreatingCategory(true)
                    return
                  }
                  setCategoryId(value === '' ? '' : Number(value))
                }}
                options={[
                  { value: '', label: 'Elegir categoría…' },
                  ...categories.map((category) => ({ value: String(category.id), label: category.name })),
                  { value: CREATE_NEW_OPTION, label: '+ Crear categoría nueva…' },
                ]}
              />

              {creatingCategory && (
                <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line p-3">
                  <input
                    type="text"
                    aria-label="Nombre de la categoría nueva"
                    placeholder="Nombre de la categoría"
                    value={newCategoryName}
                    onChange={(event) => setNewCategoryName(event.target.value)}
                    disabled={savingNewCategory}
                    className={inputClasses}
                  />
                  <button
                    type="button"
                    onClick={handleCreateCategory}
                    disabled={savingNewCategory || newCategoryName.trim() === ''}
                    className={secondaryButtonClasses}
                  >
                    Crear
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCreatingCategory(false)
                      setNewCategoryName('')
                      setNewCategoryError(null)
                    }}
                    disabled={savingNewCategory}
                    className={secondaryButtonClasses}
                  >
                    Cancelar
                  </button>
                  {newCategoryError !== null && (
                    <p role="alert" className="m-0 w-full text-base text-danger">
                      {newCategoryError}
                    </p>
                  )}
                </div>
              )}

              <span className="text-lg font-semibold">Unidad</span>
              <SelectMenu
                ariaLabel="Unidad"
                disabled={creating}
                value={unitId === '' ? '' : String(unitId)}
                onChange={(value) => {
                  if (value === CREATE_NEW_OPTION) {
                    setCreatingUnit(true)
                    return
                  }
                  setUnitId(value === '' ? '' : Number(value))
                }}
                options={[
                  { value: '', label: 'Elegir unidad…' },
                  ...units.map((unit) => ({ value: String(unit.id), label: `${unit.name} (${unit.abbreviation})` })),
                  { value: CREATE_NEW_OPTION, label: '+ Crear unidad nueva…' },
                ]}
              />

              {creatingUnit && (
                <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line p-3">
                  <input
                    type="text"
                    aria-label="Nombre de la unidad nueva"
                    placeholder="Nombre (ej. Kilogramo)"
                    value={newUnit.name}
                    onChange={(event) => setNewUnit((prev) => ({ ...prev, name: event.target.value }))}
                    disabled={savingNewUnit}
                    className={inputClasses}
                  />
                  <input
                    type="text"
                    aria-label="Abreviatura de la unidad nueva"
                    placeholder="Abreviatura (ej. kg)"
                    value={newUnit.abbreviation}
                    onChange={(event) => setNewUnit((prev) => ({ ...prev, abbreviation: event.target.value }))}
                    disabled={savingNewUnit}
                    className={`${inputClasses} w-40`}
                  />
                  <label className="flex items-center gap-2 text-base">
                    <input
                      type="checkbox"
                      checked={newUnit.allows_fraction}
                      onChange={(event) =>
                        setNewUnit((prev) => ({ ...prev, allows_fraction: event.target.checked }))
                      }
                      disabled={savingNewUnit}
                      className="accent-brand"
                    />
                    Admite fracciones
                  </label>
                  <button
                    type="button"
                    onClick={handleCreateUnit}
                    disabled={savingNewUnit || newUnit.name.trim() === '' || newUnit.abbreviation.trim() === ''}
                    className={secondaryButtonClasses}
                  >
                    Crear
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCreatingUnit(false)
                      setNewUnit({ name: '', abbreviation: '', allows_fraction: false })
                      setNewUnitError(null)
                    }}
                    disabled={savingNewUnit}
                    className={secondaryButtonClasses}
                  >
                    Cancelar
                  </button>
                  {newUnitError !== null && (
                    <p role="alert" className="m-0 w-full text-base text-danger">
                      {newUnitError}
                    </p>
                  )}
                </div>
              )}

              <label className="flex items-center gap-2 text-lg">
                <input
                  type="checkbox"
                  checked={addVariants}
                  onChange={(event) => {
                    setAddVariants(event.target.checked)
                    if (!event.target.checked) setVariantDrafts([])
                  }}
                  disabled={creating}
                  className="accent-brand"
                />
                Este producto tiene distintas presentaciones (color, talle, etc.)
              </label>

              {addVariants && (
                <div className="flex flex-col gap-3 border-t border-line pt-3">
                  {variantDrafts.map((draft) => (
                    <div key={draft.key} className="flex flex-col gap-2 rounded-xl border border-line p-4">
                      <div className="flex gap-2">
                        <input
                          type="text"
                          aria-label="Nombre de la variante"
                          placeholder="Nombre (opcional)"
                          value={draft.label}
                          onChange={(event) => updateVariantLabel(draft.key, event.target.value)}
                          disabled={creating}
                          className={`${inputClasses} flex-1`}
                        />
                        <button
                          type="button"
                          onClick={() => removeVariantDraft(draft.key)}
                          disabled={creating}
                          className={secondaryButtonClasses}
                        >
                          Quitar
                        </button>
                      </div>
                      <VariantAttributesEditor
                        attributes={attributes}
                        selectedValues={draft.values}
                        onAdd={(value) => addVariantValue(draft.key, value)}
                        onRemove={(valueId) => removeVariantValue(draft.key, valueId)}
                        onAttributeCreated={(attribute) => setAttributes((prev) => [...prev, attribute])}
                        disabled={creating}
                      />
                    </div>
                  ))}
                  <button type="button" onClick={addVariantDraft} disabled={creating} className={secondaryButtonClasses}>
                    + Agregar variante
                  </button>
                </div>
              )}

              {createError !== null && (
                <p role="alert" className="m-0 text-base text-danger">
                  {createError}
                </p>
              )}

              <button
                type="submit"
                disabled={creating || name.trim() === '' || categoryId === '' || unitId === ''}
                className={primaryButtonClasses}
              >
                Guardar producto
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  )
}
