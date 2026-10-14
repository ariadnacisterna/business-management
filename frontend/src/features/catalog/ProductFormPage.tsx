import { PresentationFields } from '../../shared/PresentationFields'
import { EMPTY_PRESENTATION_DRAFT, draftToPresentation, presentationDraftError } from '../../shared/presentationDraft'
import { describePresentation, evaluateMinimumEntry, formatStock, presentationLabel } from '../../shared/presentation'
import type { StockEntryMode } from '../../shared/presentation'
import { StockModeToggle } from '../../shared/StockModeToggle'
import { useEffect, useRef, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import {
  adjustStock,
  createProduct,
  fetchAttributes,
  fetchCategories,
  fetchProductsPage,
  fetchProviders,
  fetchUnits,
  setInitialVariantPrice,
  setMinimumStock,
  setProductProvider,
  uploadProductImage,
} from '../../api/catalog'
import { errorMessage } from '../../api/client'
import type { Attribute, Category, Provider, Unit, Variant } from '../../api/types'
import { Breadcrumb } from '../../shared/Breadcrumb'
import { CloseButton } from '../../shared/CloseButton'
import { Dialog } from '../../shared/Dialog'
import { LoadErrorCard } from '../../shared/LoadErrorCard'
import { normalizeForComparison } from '../../shared/normalizeForComparison'
import { PriceInput } from '../../shared/PriceInput'
import { SelectMenu } from '../../shared/SelectMenu'
import { useLoad } from '../../shared/useLoad'
import { useToast } from '../../shared/useToast'
import { useScrollbar } from '../../shared/useScrollbar'
import { useAuth } from '../access/useAuth'
import { canManageCatalog, canManageSuppliers } from '../access/roles'
import { DuplicateWarning } from './DuplicateWarning'
import { NewCategoryDialog } from './NewCategoryDialog'
import { NewUnitDialog } from './NewUnitDialog'
import { NewProductImagePicker } from './ProductImageField'
import { StockNumberField } from './StockNumberField'
import { VariantAttributesEditor } from './VariantAttributesEditor'
import {
  duplicateVariantProblem,
  locateServerProblem,
  repeatedAttributeProblem,
  stockSignProblem,
} from './productFormProblems'
import type { ServerProblem } from './productFormProblems'
import type { SelectedAttributeValue } from './VariantAttributesEditor'

const LOAD_ERROR_MESSAGE = 'No se pudieron cargar los datos necesarios para el formulario.'
const CREATE_ERROR_MESSAGE = 'No se pudo crear el producto. Intentá de nuevo.'
const CREATE_SUCCESS_MESSAGE = 'Producto creado correctamente.'
const IMAGE_UPLOAD_ERROR_MESSAGE = 'El producto se creó, pero no se pudo subir la imagen.'
const PRICE_SAVE_ERROR_MESSAGE = 'El producto se creó, pero no se pudo guardar el precio inicial.'
const STOCK_ADJUST_ERROR_MESSAGE = 'El producto se creó, pero no se pudo cargar el stock inicial.'
const MINIMUM_STOCK_ERROR_MESSAGE = 'El producto se creó, pero no se pudo definir el stock mínimo.'
const CHECK_DUPLICATE_NAME_ERROR_MESSAGE = 'No se pudo verificar si el nombre está repetido. El producto se guardará igual.'

const CREATE_NEW_OPTION = '__create__'

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

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

const NO_CATEGORIES: Category[] = []
const NO_UNITS: Unit[] = []
const NO_ATTRIBUTES: Attribute[] = []
const NO_PROVIDERS: Provider[] = []

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

  const {
    status: loadStatus,
    data: formData,
    reload: loadFormData,
    setData: setFormData,
  } = useLoad(
    () =>
      Promise.all([
        fetchCategories(),
        fetchUnits(),
        fetchAttributes(),
        canViewProviders ? fetchProviders() : Promise.resolve([]),
      ]).then(([categoryList, unitList, attributeList, providerList]) => ({
        categories: categoryList.filter((category) => category.status === 'active'),
        units: unitList.filter((unit) => unit.status === 'active'),
        attributes: attributeList.filter((attribute) => attribute.status === 'active'),
        providers: providerList.filter((provider) => provider.status === 'active'),
      })),
    [canViewProviders, account?.active_business_id],
  )
  const categories = formData?.categories ?? NO_CATEGORIES
  const units = formData?.units ?? NO_UNITS
  const attributes = formData?.attributes ?? NO_ATTRIBUTES
  const providers = formData?.providers ?? NO_PROVIDERS

  const [step, setStep] = useState<1 | 2 | 3>(1)

  const [name, setName] = useState('')
  const [categoryId, setCategoryId] = useState<number | ''>('')
  const [unitId, setUnitId] = useState<number | ''>('')
  const [providerId, setProviderId] = useState<number | ''>('')
  const [presentationDraft, setPresentationDraft] = useState(EMPTY_PRESENTATION_DRAFT)
  const [touched, setTouched] = useState({ name: false, category: false, unit: false })
  const [attemptedContinueStep1, setAttemptedContinueStep1] = useState(false)
  const [duplicateNameError, setDuplicateNameError] = useState<string | null>(null)
  const [checkingName, setCheckingName] = useState(false)
  const [addVariants, setAddVariants] = useState(false)
  const [variantDrafts, setVariantDrafts] = useState<VariantDraft[]>([])
  const [imageFile, setImageFile] = useState<File | null>(null)

  const [creatingCategory, setCreatingCategory] = useState(false)
  const [creatingUnit, setCreatingUnit] = useState(false)
  const [stockMode, setStockMode] = useState<StockEntryMode>('presentation')
  const focusSelector = useRef<string | null>(null)

  const [singlePrice, setSinglePrice] = useState('')
  const [singleStock, setSingleStock] = useState('')
  const [singleMinimum, setSingleMinimum] = useState('')
  const [sharedPrice, setSharedPrice] = useState('')
  const [variantPrices, setVariantPrices] = useState<Record<number, string>>({})
  const [variantCustomPrice, setVariantCustomPrice] = useState<Record<number, boolean>>({})
  const [variantStocks, setVariantStocks] = useState<Record<number, string>>({})
  const [variantMinimums, setVariantMinimums] = useState<Record<number, string>>({})

  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<{ message: string; problem: ServerProblem | null } | null>(null)
  const [createdProductId, setCreatedProductId] = useState<number | null>(null)
  const [duplicatesFound, setDuplicatesFound] = useState<Variant[] | null>(null)

  function close() {
    navigate('/products')
  }

  function effectiveVariantPrice(key: number) {
    const own = (variantPrices[key] ?? '').trim()
    if (variantCustomPrice[key] && own !== '') return own
    return sharedPrice.trim()
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
    setVariantCustomPrice((prev) => {
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
      setVariantCustomPrice({})
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
  const stockUnit = unitId === '' ? null : (units.find((unit) => unit.id === unitId) ?? null)
  const stockAllowsFraction = stockUnit?.allows_fraction ?? false
  const presentationError = presentationDraftError(presentationDraft, stockAllowsFraction)
  const presentation = draftToPresentation(presentationDraft)
  const entryMode: StockEntryMode = presentation !== null ? stockMode : 'unit'
  const stockStep = entryMode === 'unit' && stockAllowsFraction ? 0.001 : 1
  const stockInputMode = entryMode === 'unit' && stockAllowsFraction ? 'decimal' : 'numeric'
  const stockUnitText =
    entryMode === 'presentation' && presentation !== null ? presentation.plural_name : (stockUnit?.abbreviation ?? '')
  const stockHint = stockUnitText === '' ? '' : `(en ${stockUnitText})`
  const unitIsAlsoPresentation =
    presentationDraft.enabled &&
    stockUnit !== null &&
    [presentationDraft.name, presentationDraft.pluralName].some(
      (text) => text.trim() !== '' && normalizeForComparison(text) === normalizeForComparison(stockUnit.name),
    )

  function stockProblem(value: string): string | null {
    return stockSignProblem(value) ?? evaluateMinimumEntry(value, stockAllowsFraction, presentation, entryMode).error
  }

  function selectStockMode(mode: StockEntryMode) {
    setStockMode(mode)
    setSingleStock('')
    setSingleMinimum('')
    setVariantStocks({})
    setVariantMinimums({})
  }

  function describeStockText(value: string): string {
    const text = value.trim()
    if (text === '') return '—'
    if (entryMode === 'presentation' && presentation !== null) {
      return `${text} ${presentationLabel(presentation, Number(text))}`
    }
    if (presentation !== null && stockUnit !== null && Number.isFinite(Number(text))) {
      return formatStock(text, presentation, stockUnit.abbreviation)
    }
    return stockUnit !== null && stockUnit.abbreviation !== '' ? `${text} ${stockUnit.abbreviation}` : text
  }

  const showNameError = (touched.name || attemptedContinueStep1) && nameError !== null
  const showCategoryError = (touched.category || attemptedContinueStep1) && categoryError !== null
  const showUnitError = (touched.unit || attemptedContinueStep1) && unitError !== null

  function markTouched(field: keyof typeof touched) {
    setTouched((prev) => ({ ...prev, [field]: true }))
  }

  async function handleContinueStep1(event: React.FormEvent) {
    event.preventDefault()
    setAttemptedContinueStep1(true)
    if (name.trim() === '' || categoryError !== null || unitError !== null || presentationError !== null) return

    const trimmedName = name.trim()
    setCheckingName(true)
    const isDuplicate = await fetchProductsPage({ page: 1, pageSize: 10, search: trimmedName })
      .then((result) => {
        const normalizedTyped = normalizeForComparison(trimmedName)
        return result.items.some((item) => normalizeForComparison(item.name) === normalizedTyped)
      })
      .catch(() => {
        showError(CHECK_DUPLICATE_NAME_ERROR_MESSAGE)
        return false
      })
    setCheckingName(false)

    if (isDuplicate) {
      setDuplicateNameError('Ya existe un producto con ese nombre.')
      return
    }

    setStep(2)
  }

  const variantProblems = addVariants
    ? variantDrafts.map(
        (draft, index) =>
          repeatedAttributeProblem(draft.values, attributes) ?? duplicateVariantProblem(variantDrafts, index),
      )
    : []
  const stockTexts = addVariants
    ? variantDrafts.flatMap((draft) => [variantStocks[draft.key] ?? '', variantMinimums[draft.key] ?? ''])
    : [singleStock, singleMinimum]
  const step2Valid =
    !hasUndistinguishedVariant &&
    variantProblems.every((problem) => problem === null) &&
    stockTexts.every((text) => stockProblem(text) === null)

  useEffect(() => {
    const selector = focusSelector.current
    if (selector === null) return
    focusSelector.current = null
    document.querySelector<HTMLElement>(selector)?.focus()
  }, [step])

  function goToProblem(problem: ServerProblem) {
    focusSelector.current = problem.selector
    setCreateError(null)
    setStep(problem.step)
  }

  function goBackFromReview() {
    setCreateError(null)
    setStep(2)
  }

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
        ...(presentation !== null ? { presentation } : {}),
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
      let priceFailed = false
      let stockFailed = false
      let minimumFailed = false
      for (let index = 0; index < product.variants.length; index += 1) {
        const variant = product.variants[index]
        const draftKey = variantDrafts[index]?.key
        const price = (isSingle ? singlePrice : draftKey !== undefined ? effectiveVariantPrice(draftKey) : '').trim()
        const stock = (isSingle ? singleStock : (draftKey !== undefined ? variantStocks[draftKey] : '') ?? '').trim()
        const minimum = (isSingle ? singleMinimum : (draftKey !== undefined ? variantMinimums[draftKey] : '') ?? '').trim()

        if (price !== '') {
          try {
            await setInitialVariantPrice(variant.id, price)
          } catch {
            priceFailed = true
          }
        }
        if (stock !== '' && Number(stock) > 0) {
          try {
            await adjustStock(
              variant.id,
              presentation !== null && entryMode === 'presentation'
                ? { delta: String(Number(stock)), in_presentations: true, presentation_quantity: presentation.quantity }
                : { delta: Number(stock).toFixed(3) },
            )
          } catch {
            stockFailed = true
          }
        }
        if (minimum !== '') {
          try {
            await setMinimumStock(
              variant.id,
              presentation !== null && entryMode === 'presentation' ? String(Number(minimum)) : Number(minimum).toFixed(3),
              presentation !== null && entryMode === 'presentation' ? presentation.quantity : undefined,
            )
          } catch {
            minimumFailed = true
          }
        }
      }

      if (priceFailed) showError(PRICE_SAVE_ERROR_MESSAGE)
      if (stockFailed) showError(STOCK_ADJUST_ERROR_MESSAGE)
      if (minimumFailed) showError(MINIMUM_STOCK_ERROR_MESSAGE)

      showSuccess(CREATE_SUCCESS_MESSAGE)
      if (result.possible_duplicates.length > 0) {
        setCreatedProductId(product.id)
        setDuplicatesFound(result.possible_duplicates)
      } else {
        navigate(`/products/${product.id}`)
      }
    } catch (error) {
      const message = errorMessage(error, CREATE_ERROR_MESSAGE)
      setCreateError({ message, problem: locateServerProblem(message) })
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

      <Dialog
        label="Nuevo producto"
        onClose={close}
        className="relative flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-surface shadow-2xl"
      >
        <div ref={modalScrollRef} onScroll={updateModalScrollbar} className="scrollbar-hidden min-h-0 flex-1 overflow-auto px-4 py-6 sm:px-6">

        <div className="mb-4 flex items-center justify-between gap-3">
          {loadStatus === 'success' ? (
            <div className="min-w-0">
              <Breadcrumb segments={['Productos', 'Nuevo producto']} />
            </div>
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
                  aria-invalid={showNameError || undefined}
                  aria-describedby={showNameError ? 'product-name-error' : undefined}
                  className={fieldClasses(showNameError)}
                />
                {showNameError && (
                  <span id="product-name-error" role="alert" className="-mt-2 text-sm text-danger">
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
                  ariaDescribedBy={showCategoryError ? 'product-category-error' : undefined}
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
                  <span id="product-category-error" role="alert" className="-mt-2 text-sm text-danger">
                    {categoryError}
                  </span>
                )}

                <span className="text-lg font-semibold">
                  Unidad <span className="text-danger">*</span>
                </span>
                <SelectMenu
                  ariaLabel="Unidad"
                  disabled={checkingName}
                  hasError={showUnitError}
                  ariaDescribedBy={showUnitError ? 'product-unit-error' : undefined}
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
                  <span id="product-unit-error" role="alert" className="-mt-2 text-sm text-danger">
                    {unitError}
                  </span>
                )}

                <p className="m-0 text-base opacity-70">
                  La unidad es cómo se vende (por ejemplo, metro). Si además viene en rollos, cajas o packs, tildá la
                  presentación: es cómo viene (por ejemplo, rollo de 50 m).
                </p>

                {stockUnit !== null && (
                  <PresentationFields
                    draft={presentationDraft}
                    onChange={setPresentationDraft}
                    unitAbbreviation={stockUnit.abbreviation}
                    allowDecimals={stockAllowsFraction}
                    disabled={checkingName}
                    showError={attemptedContinueStep1}
                  />
                )}
                {unitIsAlsoPresentation && stockUnit !== null && (
                  <p role="status" className="m-0 rounded-lg bg-surface-brand p-3 text-base">
                    Elegiste &quot;{stockUnit.name}&quot; como unidad y también como presentación. Para un producto
                    que se vende por metro y viene en rollos, probá con la unidad Metro (m) y la presentación
                    &quot;rollo&quot; de 50 m.
                  </p>
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
                    disabled={
                      checkingName ||
                      nameError !== null ||
                      categoryError !== null ||
                      unitError !== null ||
                      presentationError !== null
                    }
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

                {presentation !== null && (
                  <StockModeToggle
                    presentation={presentation}
                    abbreviation={stockUnit?.abbreviation ?? ''}
                    mode={entryMode}
                    onChange={selectStockMode}
                    label="Cargar el stock en"
                  />
                )}

                {!addVariants ? (
                  <div className="flex flex-col gap-3">
                    <label className="flex flex-col gap-1">
                      <span className="text-base font-semibold">Precio</span>
                      <PriceInput
                        value={singlePrice}
                        placeholder="0.00"
                        onChange={setSinglePrice}
                        ariaLabel="Precio"
                        className={priceInputClasses}
                      />
                    </label>
                    <div className="grid grid-cols-[repeat(auto-fit,minmax(14rem,1fr))] items-start gap-3">
                      <StockNumberField
                        name="product-stock"
                        label="Stock actual"
                        hint={stockHint}
                        ariaLabel="Stock actual"
                        value={singleStock}
                        onChange={setSingleStock}
                        step={stockStep}
                        inputMode={stockInputMode}
                        error={stockProblem(singleStock)}
                      />
                      <StockNumberField
                        name="product-minimum"
                        label="Stock mínimo"
                        hint={stockHint}
                        ariaLabel="Stock mínimo"
                        value={singleMinimum}
                        onChange={setSingleMinimum}
                        step={stockStep}
                        inputMode={stockInputMode}
                        error={stockProblem(singleMinimum)}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-4 border-t border-line pt-4">
                    <label className="flex flex-col gap-1">
                      <span className="text-base font-semibold">
                        Precio para todas las variantes
                      </span>
                      <PriceInput
                        value={sharedPrice}
                        placeholder="0.00"
                        onChange={setSharedPrice}
                        ariaLabel="Precio para todas las variantes"
                        className={priceInputClasses}
                      />
                    </label>
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
                          onAttributeCreated={(attribute) =>
                            setFormData((prev) => prev && { ...prev, attributes: [...prev.attributes, attribute] })
                          }
                        />
                        {variantProblems[index] !== null && (
                          <p role="alert" className="m-0 text-base text-danger">
                            {variantProblems[index]}
                          </p>
                        )}
                        <div className="grid grid-cols-[repeat(auto-fit,minmax(14rem,1fr))] items-start gap-3">
                          <StockNumberField
                            name={`variant-stock-${draft.key}`}
                            label="Stock actual"
                            hint={stockHint}
                            ariaLabel={`Stock actual de la variante ${index + 1}`}
                            value={variantStocks[draft.key] ?? ''}
                            onChange={(value) => setVariantStocks((prev) => ({ ...prev, [draft.key]: value }))}
                            step={stockStep}
                            inputMode={stockInputMode}
                            error={stockProblem(variantStocks[draft.key] ?? '')}
                          />
                          <StockNumberField
                            name={`variant-minimum-${draft.key}`}
                            label="Stock mínimo"
                            hint={stockHint}
                            ariaLabel={`Stock mínimo de la variante ${index + 1}`}
                            value={variantMinimums[draft.key] ?? ''}
                            onChange={(value) => setVariantMinimums((prev) => ({ ...prev, [draft.key]: value }))}
                            step={stockStep}
                            inputMode={stockInputMode}
                            error={stockProblem(variantMinimums[draft.key] ?? '')}
                          />
                        </div>
                        <label className="flex min-h-12 items-center gap-3 text-lg">
                          <input
                            name={`variant-custom-price-${draft.key}`}
                            type="checkbox"
                            checked={variantCustomPrice[draft.key] === true}
                            onChange={(event) =>
                              setVariantCustomPrice((prev) => ({ ...prev, [draft.key]: event.target.checked }))
                            }
                            aria-label={`Precio distinto para la variante ${index + 1}`}
                            className="h-6 w-6 accent-brand"
                          />
                          Cargar un precio distinto para esta variante
                        </label>
                        {variantCustomPrice[draft.key] === true && (
                          <label className="flex flex-col gap-1">
                            <span className="text-base font-semibold">
                              Precio de esta variante
                            </span>
                            <PriceInput
                              value={variantPrices[draft.key] ?? ''}
                              placeholder="0.00"
                              onChange={(value) => setVariantPrices((prev) => ({ ...prev, [draft.key]: value }))}
                              ariaLabel={`Precio de la variante ${index + 1}`}
                              className={priceInputClasses}
                            />
                          </label>
                        )}
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

                <p className="m-0 text-base opacity-70">
                  El precio y el stock son opcionales: podés cargarlos más tarde.
                </p>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className={`${secondaryButtonClasses} flex-1`}
                  >
                    Atrás
                  </button>
                  <button type="submit" disabled={!step2Valid} className={`${primaryButtonClasses} flex-1`}>
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
                    {presentation !== null && selectedUnit !== undefined && (
                      <div>
                        <p className="m-0 text-sm uppercase tracking-wide opacity-60">Presentación</p>
                        <p className="m-0 font-bold">
                          {capitalize(describePresentation(presentation, selectedUnit.abbreviation))}
                        </p>
                      </div>
                    )}
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
                        <p className="m-0 font-bold">{describeStockText(singleStock)}</p>
                      </div>
                      <div>
                        <p className="m-0 text-sm uppercase tracking-wide opacity-60">Stock mínimo</p>
                        <p className="m-0 font-bold">{describeStockText(singleMinimum)}</p>
                      </div>
                    </div>
                  ) : (
                    <ul className="m-0 flex list-none flex-col gap-2 p-0">
                      {variantDrafts.map((draft, index) => (
                        <li key={draft.key} className="rounded-lg border border-line p-3">
                          <p className="m-0 font-bold">{draft.label.trim() !== '' ? draft.label : `Variante ${index + 1}`}</p>
                          <div className="mt-1 grid grid-cols-1 gap-2 text-base sm:grid-cols-3">
                            <span>
                              Precio: <span className="font-bold text-brand">${effectiveVariantPrice(draft.key) || '0.00'}</span>
                            </span>
                            <span>Stock actual: {describeStockText(variantStocks[draft.key] ?? '')}</span>
                            <span>Stock mínimo: {describeStockText(variantMinimums[draft.key] ?? '')}</span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {createError !== null && (
                  <div role="alert" className="flex flex-col gap-2 rounded-lg border border-danger p-3">
                    <p className="m-0 text-base text-danger">{createError.message}</p>
                    {createError.problem !== null && (
                      <button
                        type="button"
                        onClick={() => goToProblem(createError.problem as ServerProblem)}
                        className={`${secondaryButtonClasses} self-start`}
                      >
                        {createError.problem.buttonLabel}
                      </button>
                    )}
                  </div>
                )}

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={close}
                    disabled={creating}
                    className={`${secondaryButtonClasses} min-w-[7rem] flex-1`}
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={goBackFromReview}
                    disabled={creating}
                    className={`${secondaryButtonClasses} min-w-[7rem] flex-1`}
                  >
                    Atrás
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmCreate}
                    disabled={creating}
                    className={`${primaryButtonClasses} min-w-[7rem] flex-1`}
                  >
                    {creating ? 'Creando…' : 'Confirmar'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
        {creatingCategory && (
          <NewCategoryDialog
            breadcrumb={['Productos', 'Nuevo producto']}
            onClose={() => setCreatingCategory(false)}
            onCreated={(created) => {
              setFormData((prev) => prev && { ...prev, categories: [...prev.categories, created] })
              setCategoryId(created.id)
              setCreatingCategory(false)
            }}
          />
        )}
        {creatingUnit && (
          <NewUnitDialog
            breadcrumb={['Productos', 'Nuevo producto']}
            onClose={() => setCreatingUnit(false)}
            onCreated={(created) => {
              setFormData((prev) => prev && { ...prev, units: [...prev.units, created] })
              setUnitId(created.id)
              setCreatingUnit(false)
            }}
          />
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
      </Dialog>
    </div>
  )
}
