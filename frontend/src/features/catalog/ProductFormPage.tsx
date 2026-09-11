import { useEffect, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import {
  createCategory,
  createProduct,
  createUnit,
  fetchAttributes,
  fetchCategories,
  fetchProductsPage,
  fetchUnits,
  setInitialVariantPrice,
  uploadProductImage,
} from '../../api/catalog'
import { ApiError } from '../../api/client'
import type { Attribute, Category, Product, Unit, Variant } from '../../api/types'
import { CloseButton } from '../../shared/CloseButton'
import { ConfirmDialog } from '../../shared/ConfirmDialog'
import { LoadErrorCard } from '../../shared/LoadErrorCard'
import { normalizeForComparison } from '../../shared/normalizeForComparison'
import { PriceInput } from '../../shared/PriceInput'
import { SelectMenu } from '../../shared/SelectMenu'
import { useToast } from '../../shared/Toast'
import { useScrollbar } from '../../shared/useScrollbar'
import { useAuth } from '../access/AuthContext'
import { canManageCatalog } from '../access/roles'
import { DuplicateWarning } from './DuplicateWarning'
import { NewProductImagePicker } from './ProductImageField'
import { VariantAttributesEditor } from './VariantAttributesEditor'
import type { SelectedAttributeValue } from './VariantAttributesEditor'

const LOAD_ERROR_MESSAGE = 'No se pudieron cargar los datos necesarios para el formulario.'
const CREATE_ERROR_MESSAGE = 'No se pudo crear el producto. Intentá de nuevo.'
const CREATE_SUCCESS_MESSAGE = 'Producto creado correctamente.'
const PRICE_ERROR_MESSAGE = 'No se pudo guardar el precio. Intentá de nuevo.'
const CREATE_CATEGORY_ERROR_MESSAGE = 'No se pudo crear la categoría. Intentá de nuevo.'
const CREATE_UNIT_ERROR_MESSAGE = 'No se pudo crear la unidad. Intentá de nuevo.'
const IMAGE_UPLOAD_ERROR_MESSAGE = 'El producto se creó, pero no se pudo subir la imagen.'

const CREATE_NEW_OPTION = '__create__'

const inputClasses =
  'h-12 rounded-lg border border-line px-3.5 text-lg focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/10'
const inputErrorClasses = 'border-danger focus:border-danger focus:ring-danger/10'

function fieldClasses(hasError: boolean): string {
  return hasError ? `${inputClasses} ${inputErrorClasses}` : inputClasses
}

const priceInputClasses =
  'h-12 w-full rounded-lg border border-line pl-7 pr-3.5 text-lg focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/10'
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
  const { showSuccess, showError } = useToast()
  const { account } = useAuth()
  const canManage = canManageCatalog(account)
  const {
    scrollRef: modalScrollRef,
    scrollbar: modalScrollbar,
    updateScrollbar: updateModalScrollbar,
    handleThumbPointerDown: handleModalThumbPointerDown,
  } = useScrollbar([])

  const [categories, setCategories] = useState<Category[]>([])
  const [units, setUnits] = useState<Unit[]>([])
  const [attributes, setAttributes] = useState<Attribute[]>([])
  const [loadStatus, setLoadStatus] = useState<'loading' | 'success' | 'error'>('loading')

  const [name, setName] = useState('')
  const [categoryId, setCategoryId] = useState<number | ''>('')
  const [unitId, setUnitId] = useState<number | ''>('')
  const [touched, setTouched] = useState({ name: false, category: false, unit: false })
  const [attemptedSubmit, setAttemptedSubmit] = useState(false)
  const [duplicateNameError, setDuplicateNameError] = useState<string | null>(null)
  const [checkingName, setCheckingName] = useState(false)
  const [addVariants, setAddVariants] = useState(false)
  const [variantDrafts, setVariantDrafts] = useState<VariantDraft[]>([])
  const [imageFile, setImageFile] = useState<File | null>(null)

  const [creatingCategory, setCreatingCategory] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [savingNewCategory, setSavingNewCategory] = useState(false)
  const [newCategoryError, setNewCategoryError] = useState<string | null>(null)

  const [creatingUnit, setCreatingUnit] = useState(false)
  const [newUnit, setNewUnit] = useState({ name: '', abbreviation: '', allows_fraction: false })
  const [savingNewUnit, setSavingNewUnit] = useState(false)
  const [newUnitError, setNewUnitError] = useState<string | null>(null)

  const [creating, setCreating] = useState(false)
  const [confirmingCreate, setConfirmingCreate] = useState(false)

  const [createdProduct, setCreatedProduct] = useState<Product | null>(null)
  const [duplicates, setDuplicates] = useState<Variant[]>([])
  const [prices, setPrices] = useState<Record<number, string>>({})
  const [savingPrices, setSavingPrices] = useState(false)
  const [priceError, setPriceError] = useState<string | null>(null)
  const [savedVariantIds, setSavedVariantIds] = useState<Set<number>>(new Set())

  function loadFormData() {
    setLoadStatus('loading')
    Promise.all([fetchCategories(), fetchUnits(), fetchAttributes()])
      .then(([categoryList, unitList, attributeList]) => {
        setCategories(categoryList.filter((category) => category.status === 'active'))
        setUnits(unitList.filter((unit) => unit.status === 'active'))
        setAttributes(attributeList.filter((attribute) => attribute.status === 'active'))
        setLoadStatus('success')
      })
      .catch(() => setLoadStatus('error'))
  }

  useEffect(loadFormData, [])

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

  const hasUndistinguishedVariant =
    addVariants &&
    variantDrafts.length > 1 &&
    variantDrafts.some((draft) => draft.label.trim() === '' && draft.values.length === 0)

  const nameError = name.trim() === '' ? 'El nombre es obligatorio.' : duplicateNameError
  const categoryError = categoryId === '' ? 'Elegí una categoría.' : null
  const unitError = unitId === '' ? 'Elegí una unidad.' : null

  const showNameError = (touched.name || attemptedSubmit) && nameError !== null
  const showCategoryError = (touched.category || attemptedSubmit) && categoryError !== null
  const showUnitError = (touched.unit || attemptedSubmit) && unitError !== null

  function markTouched(field: keyof typeof touched) {
    setTouched((prev) => ({ ...prev, [field]: true }))
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setAttemptedSubmit(true)
    if (name.trim() === '' || categoryError !== null || unitError !== null || hasUndistinguishedVariant) return

    const trimmedName = name.trim()
    setCheckingName(true)
    const isDuplicate = await fetchProductsPage({ page: 1, pageSize: 10, search: trimmedName })
      .then((result) => {
        const normalizedTyped = normalizeForComparison(trimmedName)
        return result.items.some((item) => normalizeForComparison(item.name) === normalizedTyped)
      })
      .catch(() => false)
    setCheckingName(false)

    if (isDuplicate) {
      setDuplicateNameError('Ya existe un producto con ese nombre.')
      return
    }

    setConfirmingCreate(true)
  }

  async function createProductNow() {
    if (categoryId === '' || unitId === '') return
    setConfirmingCreate(false)
    setCreating(true)
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
      let product = result.product
      if (imageFile !== null) {
        try {
          product = await uploadProductImage(product.id, imageFile)
        } catch {
          showError(IMAGE_UPLOAD_ERROR_MESSAGE)
        }
      }
      setCreatedProduct(product)
      setDuplicates(result.possible_duplicates)
      setPrices(Object.fromEntries(result.product.variants.map((variant) => [variant.id, ''])))
      showSuccess(CREATE_SUCCESS_MESSAGE)
    } catch (error) {
      showError(error instanceof ApiError ? error.message : CREATE_ERROR_MESSAGE)
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

      <div className="relative flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-surface shadow-2xl">
        <div ref={modalScrollRef} onScroll={updateModalScrollbar} className="scrollbar-hidden min-h-0 flex-1 overflow-auto px-6 py-6">

        <div className="mb-4 flex items-center justify-between gap-3">
          {loadStatus === 'success' ? (
            <p className="m-0 text-base opacity-60">
              <Link to="/products" className="hover:text-brand">
                Catálogo
              </Link>{' '}
              ›{' '}
              {createdProduct !== null && (
                <>
                  {createdProduct.name}
                  {' › '}
                </>
              )}
              <span className="text-brand">{createdProduct !== null ? 'Precio inicial' : 'Nuevo producto'}</span>
            </p>
          ) : (
            <span />
          )}
          <CloseButton onClose={close} />
        </div>

        {loadStatus === 'loading' && (
          <p role="status" className="flex flex-1 items-center justify-center text-lg opacity-60">
            Cargando…
          </p>
        )}

        {loadStatus === 'error' && <LoadErrorCard message={LOAD_ERROR_MESSAGE} onRetry={loadFormData} />}

        {loadStatus === 'success' && createdProduct !== null && (
          <div className="flex flex-col gap-4">
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
              {createdProduct.variants.map((variant) => {
                const label =
                  createdProduct.variants.length === 1 && createdProduct.variants[0].is_implicit
                    ? 'Precio'
                    : (variant.label ?? `Variante #${variant.id}`)
                return (
                  <label key={variant.id} className="flex flex-col gap-1">
                    <span className="text-lg font-semibold">{label}</span>
                    <PriceInput
                      value={prices[variant.id] ?? ''}
                      placeholder="0.00"
                      onChange={(value) => setPrices((prev) => ({ ...prev, [variant.id]: value }))}
                      ariaLabel={label}
                      disabled={savingPrices}
                      required
                      className={priceInputClasses}
                    />
                  </label>
                )
              })}

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
            <h1 className="m-0 text-2xl font-bold">Nuevo producto</h1>

            <form onSubmit={handleSubmit} className="flex flex-col gap-3">
              <label htmlFor="product-name" className="text-lg font-semibold">
                Nombre <span className="text-danger">*</span>
              </label>
              <input
                id="product-name"
                type="text"
                value={name}
                onChange={(event) => {
                  setName(event.target.value)
                  setDuplicateNameError(null)
                }}
                onBlur={() => markTouched('name')}
                disabled={creating}
                className={fieldClasses(showNameError)}
              />
              {showNameError && (
                <span role="alert" className="-mt-2 text-sm text-danger">
                  {nameError}
                </span>
              )}
              {!showNameError && checkingName && (
                <span className="-mt-2 text-sm opacity-60">Verificando nombre…</span>
              )}

              <span className="text-lg font-semibold">
                Categoría <span className="text-danger">*</span>
              </span>
              <SelectMenu
                ariaLabel="Categoría"
                disabled={creating}
                hasError={showCategoryError}
                onBlur={() => markTouched('category')}
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
              {showCategoryError && (
                <span role="alert" className="-mt-2 text-sm text-danger">
                  {categoryError}
                </span>
              )}

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

              <span className="text-lg font-semibold">
                Unidad <span className="text-danger">*</span>
              </span>
              <SelectMenu
                ariaLabel="Unidad"
                disabled={creating}
                hasError={showUnitError}
                onBlur={() => markTouched('unit')}
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
              {showUnitError && (
                <span role="alert" className="-mt-2 text-sm text-danger">
                  {unitError}
                </span>
              )}

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

              <NewProductImagePicker file={imageFile} disabled={creating} onChange={setImageFile} />

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
                <div className="flex flex-col gap-4 border-t border-line pt-4">
                  {variantDrafts.map((draft, index) => (
                    <div key={draft.key} className="flex flex-col gap-4 rounded-2xl border border-line p-4">
                      <div className="flex items-start justify-between gap-3">
                        <p className="m-0 text-sm font-bold uppercase tracking-wide text-brand">
                          Variante {index + 1}
                        </p>
                        <CloseButton
                          onClose={() => removeVariantDraft(draft.key)}
                          className="-m-2"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label htmlFor={`variant-label-${draft.key}`} className="text-sm font-bold">
                          Nombre <span className="font-normal normal-case opacity-70">(opcional)</span>
                        </label>
                        <input
                          id={`variant-label-${draft.key}`}
                          type="text"
                          aria-label="Nombre de la variante"
                          placeholder="Ej. Rojo, Talle M"
                          value={draft.label}
                          onChange={(event) => updateVariantLabel(draft.key, event.target.value)}
                          disabled={creating}
                          className={`${inputClasses} w-full`}
                        />
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
                  <button
                    type="button"
                    onClick={addVariantDraft}
                    disabled={creating}
                    className={`${secondaryButtonClasses} mt-1`}
                  >
                    + Agregar variante
                  </button>

                  {hasUndistinguishedVariant && (
                    <p role="alert" className="m-0 text-base text-danger">
                      Cada variante necesita un nombre o un atributo que la diferencie de las demás.
                    </p>
                  )}
                </div>
              )}

              <button
                type="submit"
                disabled={
                  creating ||
                  nameError !== null ||
                  categoryError !== null ||
                  unitError !== null ||
                  hasUndistinguishedVariant ||
                  checkingName
                }
                className={primaryButtonClasses}
              >
                {checkingName ? 'Verificando…' : 'Guardar producto'}
              </button>
            </form>
          </div>
        )}
        </div>

        {modalScrollbar.visible && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute right-1 top-0 w-3 rounded-full bg-line/40"
            style={{ bottom: 0 }}
          >
            <div
              onPointerDown={handleModalThumbPointerDown}
              className="pointer-events-auto absolute right-0 w-3 cursor-grab rounded-full bg-brand active:cursor-grabbing"
              style={{ top: modalScrollbar.thumbTop, height: modalScrollbar.thumbHeight }}
            />
          </div>
        )}
      </div>

      {confirmingCreate && (
        <ConfirmDialog
          title="Crear producto"
          description={`Se va a crear el producto "${name.trim()}".`}
          confirmLabel="Crear"
          onConfirm={createProductNow}
          onCancel={() => setConfirmingCreate(false)}
        />
      )}
    </div>
  )
}
