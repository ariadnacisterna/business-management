import { useEffect, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import {
  adjustStock,
  createCategory,
  createMovementReason,
  createProduct,
  createUnit,
  fetchAttributes,
  fetchCategories,
  fetchMovementReasons,
  fetchProductsPage,
  fetchProviders,
  fetchUnits,
  setInitialVariantPrice,
  setMinimumStock,
  setProductProvider,
  uploadProductImage,
} from '../../api/catalog'
import { ApiError } from '../../api/client'
import type { Attribute, Category, MovementReason, Provider, Unit, Variant } from '../../api/types'
import { CloseButton } from '../../shared/CloseButton'
import { LoadErrorCard } from '../../shared/LoadErrorCard'
import { normalizeForComparison } from '../../shared/normalizeForComparison'
import { PriceInput } from '../../shared/PriceInput'
import { SelectMenu } from '../../shared/SelectMenu'
import { useToast } from '../../shared/Toast'
import { useScrollbar } from '../../shared/useScrollbar'
import { useAuth } from '../access/AuthContext'
import { canManageCatalog, canManageSuppliers } from '../access/roles'
import { DuplicateWarning } from './DuplicateWarning'
import { NewProductImagePicker } from './ProductImageField'
import { VariantAttributesEditor } from './VariantAttributesEditor'
import type { SelectedAttributeValue } from './VariantAttributesEditor'

const LOAD_ERROR_MESSAGE = 'No se pudieron cargar los datos necesarios para el formulario.'
const CREATE_ERROR_MESSAGE = 'No se pudo crear el producto. Intentá de nuevo.'
const CREATE_SUCCESS_MESSAGE = 'Producto creado correctamente.'
const CREATE_CATEGORY_ERROR_MESSAGE = 'No se pudo crear la categoría. Intentá de nuevo.'
const CREATE_UNIT_ERROR_MESSAGE = 'No se pudo crear la unidad. Intentá de nuevo.'
const IMAGE_UPLOAD_ERROR_MESSAGE = 'El producto se creó, pero no se pudo subir la imagen.'
const INITIAL_STOCK_REASON_NAME = 'Carga inicial'

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

function StepIndicator({ step }: { step: 1 | 2 | 3 }) {
  const labels = ['Información\ngeneral', 'Precio y stock', 'Confirmar']
  return (
    <div className="mb-2 flex items-center">
      {labels.map((label, index) => {
        const n = (index + 1) as 1 | 2 | 3
        const active = n === step
        const done = n < step
        return (
          <div key={label} className={`flex items-center ${index < labels.length - 1 ? 'flex-1' : ''}`}>
            <div className="flex flex-col items-center gap-1">
              <div
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-sm font-bold ${
                  active
                    ? 'border-brand bg-brand text-brand-contrast'
                    : done
                      ? 'border-brand text-brand'
                      : 'border-line text-ink/40'
                }`}
              >
                {n}
              </div>
              <span
                className={`whitespace-pre-line text-center text-xs font-semibold ${active || done ? 'text-brand' : 'text-ink/40'}`}
              >
                {label}
              </span>
            </div>
            {index < labels.length - 1 && (
              <div className={`mx-2 mb-4 h-0.5 flex-1 ${done ? 'bg-brand' : 'bg-line'}`} />
            )}
          </div>
        )
      })}
    </div>
  )
}

export function ProductFormPage() {
  const navigate = useNavigate()
  const { showSuccess, showError } = useToast()
  const { account } = useAuth()
  const canManage = canManageCatalog(account)
  const canViewProviders = canManageSuppliers(account)
  const {
    scrollRef: modalScrollRef,
    scrollbar: modalScrollbar,
    updateScrollbar: updateModalScrollbar,
    handleThumbPointerDown: handleModalThumbPointerDown,
  } = useScrollbar([])

  const [categories, setCategories] = useState<Category[]>([])
  const [units, setUnits] = useState<Unit[]>([])
  const [attributes, setAttributes] = useState<Attribute[]>([])
  const [providers, setProviders] = useState<Provider[]>([])
  const [reasons, setReasons] = useState<MovementReason[]>([])
  const [loadStatus, setLoadStatus] = useState<'loading' | 'success' | 'error'>('loading')

  const [step, setStep] = useState<1 | 2 | 3>(1)

  const [name, setName] = useState('')
  const [categoryId, setCategoryId] = useState<number | ''>('')
  const [unitId, setUnitId] = useState<number | ''>('')
  const [providerId, setProviderId] = useState<number | ''>('')
  const [touched, setTouched] = useState({ name: false, category: false, unit: false })
  const [attemptedContinueStep1, setAttemptedContinueStep1] = useState(false)
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

  const [singlePrice, setSinglePrice] = useState('')
  const [singleStock, setSingleStock] = useState('')
  const [singleMinimum, setSingleMinimum] = useState('')
  const [variantPrices, setVariantPrices] = useState<Record<number, string>>({})
  const [variantStocks, setVariantStocks] = useState<Record<number, string>>({})
  const [variantMinimums, setVariantMinimums] = useState<Record<number, string>>({})

  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [createdProductId, setCreatedProductId] = useState<number | null>(null)
  const [duplicatesFound, setDuplicatesFound] = useState<Variant[] | null>(null)

  function loadFormData() {
    setLoadStatus('loading')
    Promise.all([
      fetchCategories(),
      fetchUnits(),
      fetchAttributes(),
      canViewProviders ? fetchProviders() : Promise.resolve([]),
      fetchMovementReasons(),
    ])
      .then(([categoryList, unitList, attributeList, providerList, reasonList]) => {
        setCategories(categoryList.filter((category) => category.status === 'active'))
        setUnits(unitList.filter((unit) => unit.status === 'active'))
        setAttributes(attributeList.filter((attribute) => attribute.status === 'active'))
        setProviders(providerList.filter((provider) => provider.status === 'active'))
        setReasons(reasonList)
        setLoadStatus('success')
      })
      .catch(() => setLoadStatus('error'))
  }

  async function resolveInitialStockReasonId(): Promise<number> {
    const existing = reasons.find(
      (reason) => reason.status === 'active' && reason.name.trim().toLowerCase() === INITIAL_STOCK_REASON_NAME.toLowerCase(),
    )
    if (existing !== undefined) return existing.id
    const created = await createMovementReason(INITIAL_STOCK_REASON_NAME)
    setReasons((prev) => [...prev, created])
    return created.id
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
    setVariantPrices((prev) => {
      const next = { ...prev }
      delete next[key]
      return next
    })
    setVariantStocks((prev) => {
      const next = { ...prev }
      delete next[key]
      return next
    })
    setVariantMinimums((prev) => {
      const next = { ...prev }
      delete next[key]
      return next
    })
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

  function selectVariantMode(withVariants: boolean) {
    setAddVariants(withVariants)
    if (!withVariants) {
      setVariantDrafts([])
      setVariantPrices({})
      setVariantStocks({})
      setVariantMinimums({})
    } else if (variantDrafts.length === 0) {
      addVariantDraft()
    }
  }

  const hasUndistinguishedVariant =
    addVariants &&
    variantDrafts.length > 1 &&
    variantDrafts.some((draft) => draft.label.trim() === '' && draft.values.length === 0)

  const nameError = name.trim() === '' ? 'El nombre es obligatorio.' : duplicateNameError
  const categoryError = categoryId === '' ? 'Elegí una categoría.' : null
  const unitError = unitId === '' ? 'Elegí una unidad.' : null

  const showNameError = (touched.name || attemptedContinueStep1) && nameError !== null
  const showCategoryError = (touched.category || attemptedContinueStep1) && categoryError !== null
  const showUnitError = (touched.unit || attemptedContinueStep1) && unitError !== null

  function markTouched(field: keyof typeof touched) {
    setTouched((prev) => ({ ...prev, [field]: true }))
  }

  async function handleContinueStep1(event: React.FormEvent) {
    event.preventDefault()
    setAttemptedContinueStep1(true)
    if (name.trim() === '' || categoryError !== null || unitError !== null) return

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

    setStep(2)
  }

  const step2Valid = !hasUndistinguishedVariant

  function handleContinueStep2(event: React.FormEvent) {
    event.preventDefault()
    if (!step2Valid) return
    setStep(3)
  }

  async function handleConfirmCreate() {
    if (categoryId === '' || unitId === '') return
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
      let product = result.product

      if (imageFile !== null) {
        try {
          product = await uploadProductImage(product.id, imageFile)
        } catch {
          showError(IMAGE_UPLOAD_ERROR_MESSAGE)
        }
      }

      if (providerId !== '') {
        try {
          product = await setProductProvider(product.id, providerId)
        } catch {
          showError('El producto se creó, pero no se pudo asignar el proveedor.')
        }
      }

      const isSingle = product.variants.length === 1 && product.variants[0].is_implicit
      let stockReasonId: number | null = null
      for (let index = 0; index < product.variants.length; index += 1) {
        const variant = product.variants[index]
        const draftKey = variantDrafts[index]?.key
        const price = (isSingle ? singlePrice : (draftKey !== undefined ? variantPrices[draftKey] : '') ?? '').trim()
        const stock = (isSingle ? singleStock : (draftKey !== undefined ? variantStocks[draftKey] : '') ?? '').trim()
        const minimum = (isSingle ? singleMinimum : (draftKey !== undefined ? variantMinimums[draftKey] : '') ?? '').trim()

        if (price !== '') {
          await setInitialVariantPrice(variant.id, price)
        }
        if (stock !== '') {
          if (stockReasonId === null) stockReasonId = await resolveInitialStockReasonId()
          await adjustStock(variant.id, { quantity: Number(stock), reason_id: stockReasonId })
        }
        if (minimum !== '') {
          await setMinimumStock(variant.id, Number(minimum))
        }
      }

      showSuccess(CREATE_SUCCESS_MESSAGE)
      if (result.possible_duplicates.length > 0) {
        setCreatedProductId(product.id)
        setDuplicatesFound(result.possible_duplicates)
      } else {
        navigate(`/products/${product.id}`)
      }
    } catch (error) {
      setCreateError(error instanceof ApiError ? error.message : CREATE_ERROR_MESSAGE)
    } finally {
      setCreating(false)
    }
  }

  const selectedCategory = categories.find((category) => category.id === categoryId)
  const selectedUnit = units.find((unit) => unit.id === unitId)
  const selectedProvider = providers.find((provider) => provider.id === providerId)

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
              › <span className="text-brand">Nuevo producto</span>
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

        {loadStatus === 'success' && duplicatesFound !== null && (
          <div className="flex flex-col gap-4">
            <h1 className="m-0 text-2xl font-bold">Producto creado</h1>
            <DuplicateWarning duplicates={duplicatesFound} />
            <button
              type="button"
              onClick={() => navigate(`/products/${createdProductId}`)}
              className={primaryButtonClasses}
            >
              Ir al producto
            </button>
          </div>
        )}

        {loadStatus === 'success' && duplicatesFound === null && (
          <div className="flex flex-col gap-4">
            <h1 className="m-0 text-2xl font-bold">Nuevo producto</h1>
            <StepIndicator step={step} />

            {step === 1 && (
              <form onSubmit={handleContinueStep1} className="flex flex-col gap-3">
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
                  disabled={checkingName}
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
                  disabled={checkingName}
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
                  disabled={checkingName}
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

                {canViewProviders && (
                  <>
                    <span className="text-lg font-semibold">
                      Proveedor <span className="font-normal opacity-70">(opcional)</span>
                    </span>
                    <SelectMenu
                      ariaLabel="Proveedor"
                      disabled={checkingName}
                      value={providerId === '' ? '' : String(providerId)}
                      onChange={(value) => setProviderId(value === '' ? '' : Number(value))}
                      options={[
                        { value: '', label: 'Sin proveedor asignado' },
                        ...providers.map((provider) => ({ value: String(provider.id), label: provider.name })),
                      ]}
                    />
                  </>
                )}

                <NewProductImagePicker file={imageFile} disabled={checkingName} onChange={setImageFile} />

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={checkingName || nameError !== null || categoryError !== null || unitError !== null}
                    className={`${primaryButtonClasses} w-1/2`}
                  >
                    {checkingName ? 'Verificando…' : 'Continuar'}
                  </button>
                </div>
              </form>
            )}

            {step === 2 && (
              <form onSubmit={handleContinueStep2} className="flex flex-col gap-3">
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => selectVariantMode(false)}
                    className={`flex min-h-11 flex-1 items-center justify-center rounded-lg border text-base font-semibold transition-colors ${
                      !addVariants ? 'border-brand bg-surface-brand text-brand' : 'border-line text-ink/50 hover:bg-surface-brand'
                    }`}
                  >
                    Producto único
                  </button>
                  <button
                    type="button"
                    onClick={() => selectVariantMode(true)}
                    className={`flex min-h-11 flex-1 items-center justify-center rounded-lg border text-base font-semibold transition-colors ${
                      addVariants ? 'border-brand bg-surface-brand text-brand' : 'border-line text-ink/50 hover:bg-surface-brand'
                    }`}
                  >
                    Producto con variantes
                  </button>
                </div>

                {!addVariants ? (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <label className="flex flex-col gap-1">
                      <span className="whitespace-nowrap text-base font-semibold">
                        Precio <span className="font-normal opacity-70">(opcional)</span>
                      </span>
                      <PriceInput
                        value={singlePrice}
                        placeholder="0.00"
                        onChange={setSinglePrice}
                        ariaLabel="Precio"
                        className={priceInputClasses}
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="whitespace-nowrap text-base font-semibold">
                        Stock actual <span className="font-normal opacity-70">(opcional)</span>
                      </span>
                      <input
                        type="number"
                        min={0}
                        step={1}
                        value={singleStock}
                        onChange={(event) => setSingleStock(event.target.value)}
                        aria-label="Stock actual"
                        className={inputClasses}
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="whitespace-nowrap text-base font-semibold">
                        Stock min. <span className="font-normal opacity-70">(opcional)</span>
                      </span>
                      <input
                        type="number"
                        min={0}
                        step={1}
                        value={singleMinimum}
                        onChange={(event) => setSingleMinimum(event.target.value)}
                        aria-label="Stock min."
                        className={inputClasses}
                      />
                    </label>
                  </div>
                ) : (
                  <div className="flex flex-col gap-4 border-t border-line pt-4">
                    {variantDrafts.map((draft, index) => (
                      <div key={draft.key} className="flex flex-col gap-4 rounded-2xl border border-line p-4">
                        <div className="flex items-start justify-between gap-3">
                          <p className="m-0 text-sm font-bold uppercase tracking-wide text-brand">
                            Variante {index + 1}
                          </p>
                          {variantDrafts.length > 1 && (
                            <CloseButton onClose={() => removeVariantDraft(draft.key)} className="-m-2" />
                          )}
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
                            className={`${inputClasses} w-full`}
                          />
                        </div>
                        <VariantAttributesEditor
                          attributes={attributes}
                          selectedValues={draft.values}
                          onAdd={(value) => addVariantValue(draft.key, value)}
                          onRemove={(valueId) => removeVariantValue(draft.key, valueId)}
                          onAttributeCreated={(attribute) => setAttributes((prev) => [...prev, attribute])}
                        />
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                          <label className="flex flex-col gap-1">
                            <span className="whitespace-nowrap text-base font-semibold">
                              Precio <span className="font-normal opacity-70">(opcional)</span>
                            </span>
                            <PriceInput
                              value={variantPrices[draft.key] ?? ''}
                              placeholder="0.00"
                              onChange={(value) => setVariantPrices((prev) => ({ ...prev, [draft.key]: value }))}
                              ariaLabel={`Precio de la variante ${index + 1}`}
                              className={priceInputClasses}
                            />
                          </label>
                          <label className="flex flex-col gap-1">
                            <span className="whitespace-nowrap text-base font-semibold">
                              Stock actual <span className="font-normal opacity-70">(opcional)</span>
                            </span>
                            <input
                              type="number"
                              min={0}
                              step={1}
                              value={variantStocks[draft.key] ?? ''}
                              onChange={(event) =>
                                setVariantStocks((prev) => ({ ...prev, [draft.key]: event.target.value }))
                              }
                              aria-label={`Stock actual de la variante ${index + 1}`}
                              className={inputClasses}
                            />
                          </label>
                          <label className="flex flex-col gap-1">
                            <span className="whitespace-nowrap text-base font-semibold">
                              Stock min. <span className="font-normal opacity-70">(opcional)</span>
                            </span>
                            <input
                              type="number"
                              min={0}
                              step={1}
                              value={variantMinimums[draft.key] ?? ''}
                              onChange={(event) =>
                                setVariantMinimums((prev) => ({ ...prev, [draft.key]: event.target.value }))
                              }
                              aria-label={`Stock min. de la variante ${index + 1}`}
                              className={inputClasses}
                            />
                          </label>
                        </div>
                      </div>
                    ))}
                    <button type="button" onClick={addVariantDraft} className={`${secondaryButtonClasses} mt-1`}>
                      + Agregar variante
                    </button>

                    {hasUndistinguishedVariant && (
                      <p role="alert" className="m-0 text-base text-danger">
                        Cada variante necesita un nombre o un atributo que la diferencie de las demás.
                      </p>
                    )}
                  </div>
                )}

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className={`${secondaryButtonClasses} flex-1`}
                  >
                    Atrás
                  </button>
                  <button type="submit" className={`${primaryButtonClasses} flex-1`}>
                    Continuar
                  </button>
                </div>
              </form>
            )}

            {step === 3 && (
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-3 rounded-xl border border-line p-4">
                  <h2 className="m-0 text-base font-bold uppercase tracking-wide opacity-70">Información general</h2>
                  <div className="grid grid-cols-1 gap-2 text-lg sm:grid-cols-2">
                    <div>
                      <p className="m-0 text-sm uppercase tracking-wide opacity-60">Nombre</p>
                      <p className="m-0 font-bold">{name.trim()}</p>
                    </div>
                    <div>
                      <p className="m-0 text-sm uppercase tracking-wide opacity-60">Categoría</p>
                      <p className="m-0 font-bold">{selectedCategory?.name ?? '—'}</p>
                    </div>
                    <div>
                      <p className="m-0 text-sm uppercase tracking-wide opacity-60">Unidad</p>
                      <p className="m-0 font-bold">
                        {selectedUnit !== undefined ? `${selectedUnit.name} (${selectedUnit.abbreviation})` : '—'}
                      </p>
                    </div>
                    {canViewProviders && (
                      <div>
                        <p className="m-0 text-sm uppercase tracking-wide opacity-60">Proveedor</p>
                        <p className="m-0 font-bold">{selectedProvider?.name ?? 'Sin proveedor asignado'}</p>
                      </div>
                    )}
                    <div>
                      <p className="m-0 text-sm uppercase tracking-wide opacity-60">Imagen</p>
                      <p className="m-0 font-bold">{imageFile?.name ?? 'Sin imagen'}</p>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-3 rounded-xl border border-line p-4">
                  <h2 className="m-0 text-base font-bold uppercase tracking-wide opacity-70">
                    {addVariants ? 'Variantes' : 'Precio y stock'}
                  </h2>
                  {!addVariants ? (
                    <div className="grid grid-cols-1 gap-2 text-lg sm:grid-cols-3">
                      <div>
                        <p className="m-0 text-sm uppercase tracking-wide opacity-60">Precio</p>
                        <p className="m-0 font-bold text-brand">${singlePrice || '0.00'}</p>
                      </div>
                      <div>
                        <p className="m-0 text-sm uppercase tracking-wide opacity-60">Stock actual</p>
                        <p className="m-0 font-bold">{singleStock.trim() !== '' ? singleStock : '—'}</p>
                      </div>
                      <div>
                        <p className="m-0 text-sm uppercase tracking-wide opacity-60">Stock min.</p>
                        <p className="m-0 font-bold">{singleMinimum.trim() !== '' ? singleMinimum : '—'}</p>
                      </div>
                    </div>
                  ) : (
                    <ul className="m-0 flex list-none flex-col gap-2 p-0">
                      {variantDrafts.map((draft, index) => (
                        <li key={draft.key} className="rounded-lg border border-line p-3">
                          <p className="m-0 font-bold">{draft.label.trim() !== '' ? draft.label : `Variante ${index + 1}`}</p>
                          <div className="mt-1 grid grid-cols-1 gap-2 text-base sm:grid-cols-3">
                            <span>
                              Precio: <span className="font-bold text-brand">${variantPrices[draft.key] || '0.00'}</span>
                            </span>
                            <span>Stock actual: {variantStocks[draft.key]?.trim() ? variantStocks[draft.key] : '—'}</span>
                            <span>Stock min.: {variantMinimums[draft.key]?.trim() ? variantMinimums[draft.key] : '—'}</span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {createError !== null && (
                  <p role="alert" className="m-0 text-base text-danger">
                    {createError}
                  </p>
                )}

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={close}
                    disabled={creating}
                    className={`${secondaryButtonClasses} flex-1`}
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmCreate}
                    disabled={creating}
                    className={`${primaryButtonClasses} flex-1`}
                  >
                    {creating ? 'Creando…' : 'Confirmar'}
                  </button>
                </div>
              </div>
            )}
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
    </div>
  )
}
