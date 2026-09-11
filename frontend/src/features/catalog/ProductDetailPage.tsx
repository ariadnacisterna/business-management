import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useOutletContext, useParams, useSearchParams } from 'react-router-dom'
import {
  changeVariantPrice,
  createCategory,
  createUnit,
  deactivateProduct,
  deactivateVariant,
  fetchAttributes,
  fetchAttributeValues,
  fetchCategories,
  fetchProduct,
  fetchProductsPage,
  fetchUnits,
  fetchVariantCurrentPrice,
  fetchVariantPriceHistory,
  reactivateProduct,
  reactivateVariant,
  removeProductImage,
  updateProduct,
  updateVariant,
  uploadProductImage,
} from '../../api/catalog'
import { ApiError } from '../../api/client'
import type { Attribute, Category, Price, Product, Unit, Variant } from '../../api/types'
import { CloseButton } from '../../shared/CloseButton'
import { ConfirmDialog } from '../../shared/ConfirmDialog'
import { formatPrice } from '../../shared/formatPrice'
import { formatRelativeTime } from '../../shared/formatRelativeTime'
import { LoadErrorCard } from '../../shared/LoadErrorCard'
import { normalizeForComparison } from '../../shared/normalizeForComparison'
import { PriceInput } from '../../shared/PriceInput'
import { SelectMenu } from '../../shared/SelectMenu'
import { useToast } from '../../shared/Toast'
import { useScrollbar } from '../../shared/useScrollbar'
import { useAuth } from '../access/AuthContext'
import { canManageCatalog } from '../access/roles'
import { ChangePriceModal } from './ChangePriceModal'
import { DuplicateWarning } from './DuplicateWarning'
import { StagedProductImageField } from './ProductImageField'
import { VariantAttributesEditor } from './VariantAttributesEditor'
import type { SelectedAttributeValue } from './VariantAttributesEditor'

const LOAD_ERROR_MESSAGE = 'No se pudo cargar el producto.'
const SAVE_ERROR_MESSAGE = 'No se pudo guardar. Intentá de nuevo.'
const CREATE_CATEGORY_ERROR_MESSAGE = 'No se pudo crear la categoría. Intentá de nuevo.'
const CREATE_UNIT_ERROR_MESSAGE = 'No se pudo crear la unidad. Intentá de nuevo.'

const CREATE_NEW_OPTION = '__create__'

const inputClasses =
  'h-11 rounded-lg border border-line px-3 text-base focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/10'
const inputErrorClasses = 'border-danger focus:border-danger focus:ring-danger/10'

function fieldClasses(hasError: boolean): string {
  return hasError ? `${inputClasses} ${inputErrorClasses}` : inputClasses
}

const primaryButtonClasses =
  'min-h-11 rounded-lg bg-brand px-4 text-base font-bold text-brand-contrast transition-colors hover:bg-brand/90 disabled:opacity-40'
const secondaryButtonClasses = 'h-11 rounded-lg border border-line px-3 text-base transition-colors hover:bg-surface-brand'

interface ValueInfo {
  attribute_name: string
  value: string
}

interface HistoryState {
  variant: Variant
  status: 'loading' | 'success' | 'error'
  prices: Price[]
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
  const { showSuccess, showError } = useToast()
  const {
    scrollRef: modalScrollRef,
    scrollbar: modalScrollbar,
    updateScrollbar: updateModalScrollbar,
    handleThumbPointerDown: handleModalThumbPointerDown,
  } = useScrollbar([id])

  const [product, setProduct] = useState<Product | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [units, setUnits] = useState<Unit[]>([])
  const [attributes, setAttributes] = useState<Attribute[]>([])
  const [valuesById, setValuesById] = useState<Map<number, ValueInfo>>(new Map())
  const [loadStatus, setLoadStatus] = useState<'loading' | 'success' | 'error'>('loading')

  const [editingProduct, setEditingProduct] = useState(false)
  const [productDraft, setProductDraft] = useState({ name: '', categoryId: 0, unitId: 0, status: 'active' })
  const [productNameTouched, setProductNameTouched] = useState(false)
  const [attemptedProductSubmit, setAttemptedProductSubmit] = useState(false)
  const [duplicateProductNameError, setDuplicateProductNameError] = useState<string | null>(null)
  const [checkingProductName, setCheckingProductName] = useState(false)
  const [savingProduct, setSavingProduct] = useState(false)
  const [confirmingStatusChange, setConfirmingStatusChange] = useState(false)
  const [confirmingProductEdit, setConfirmingProductEdit] = useState(false)
  const [pendingImageFile, setPendingImageFile] = useState<File | null>(null)
  const [imageRemoved, setImageRemoved] = useState(false)

  const [priceDraft, setPriceDraft] = useState('')
  const [variantDraftRows, setVariantDraftRows] = useState<{ id: number; label: string; price: string }[]>([])

  const [creatingCategory, setCreatingCategory] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [savingNewCategory, setSavingNewCategory] = useState(false)

  const [creatingUnit, setCreatingUnit] = useState(false)
  const [newUnit, setNewUnit] = useState({ name: '', abbreviation: '', allows_fraction: false })
  const [savingNewUnit, setSavingNewUnit] = useState(false)

  const [editingVariantId, setEditingVariantId] = useState<number | null>(null)
  const [variantLabel, setVariantLabel] = useState('')
  const [variantValues, setVariantValues] = useState<SelectedAttributeValue[]>([])
  const [savingVariant, setSavingVariant] = useState(false)
  const [confirmingVariantEdit, setConfirmingVariantEdit] = useState(false)

  const [duplicates, setDuplicates] = useState<Variant[]>([])

  const [confirmingVariantStatusChange, setConfirmingVariantStatusChange] = useState<Variant | null>(null)
  const [variantStatusError, setVariantStatusError] = useState<string | null>(null)

  const [pricesByVariant, setPricesByVariant] = useState<Map<number, Price | null>>(new Map())
  const [priceModalVariant, setPriceModalVariant] = useState<Variant | null>(null)
  const [priceModalOpenedDirectly, setPriceModalOpenedDirectly] = useState(false)
  const [pickingVariantForPrice, setPickingVariantForPrice] = useState(false)
  const [priceModalApplyToAll, setPriceModalApplyToAll] = useState(false)

  const [historyState, setHistoryState] = useState<HistoryState | null>(null)
  const {
    scrollRef: historyScrollRef,
    scrollbar: historyScrollbar,
    updateScrollbar: updateHistoryScrollbar,
    handleThumbPointerDown: handleHistoryThumbPointerDown,
  } = useScrollbar([historyState])

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

        if (searchParams.get('edit') === '1' && canManage) {
          setProductDraft({
            name: productResult.name,
            categoryId: productResult.category_id,
            unitId: productResult.unit_id,
            status: productResult.status,
          })
          const priceByVariantId = new Map(priceResults.map((result) => [result.variant_id, result.price]))
          setPriceDraft(priceByVariantId.get(productResult.variants[0].id)?.amount ?? '')
          setVariantDraftRows(
            productResult.variants.map((variant) => ({
              id: variant.id,
              label: variant.label ?? '',
              price: priceByVariantId.get(variant.id)?.amount ?? '',
            })),
          )
          setPendingImageFile(null)
          setImageRemoved(false)
          setEditingProduct(true)
        }

        if (searchParams.get('changePrice') === '1' && canManage && productResult.variants.length === 1) {
          setPriceModalOpenedDirectly(true)
          setPriceModalVariant(productResult.variants[0])
        } else if (searchParams.get('changePrice') === '1' && canManage && productResult.variants.length > 1) {
          setPickingVariantForPrice(true)
        }
      })
      .catch(() => {
        if (requestId !== requestIdRef.current) return
        setLoadStatus('error')
      })
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [id, account?.active_business_id])

  function close() {
    navigate('/products')
  }

  async function handleCreateCategory() {
    const trimmed = newCategoryName.trim()
    if (trimmed === '') return

    setSavingNewCategory(true)
    try {
      const created = await createCategory(trimmed)
      setCategories((prev) => [...prev, created])
      setProductDraft((prev) => ({ ...prev, categoryId: created.id }))
      setCreatingCategory(false)
      setNewCategoryName('')
      showSuccess('Categoría creada.')
    } catch (error) {
      showError(error instanceof ApiError ? error.message : CREATE_CATEGORY_ERROR_MESSAGE)
    } finally {
      setSavingNewCategory(false)
    }
  }

  async function handleCreateUnit() {
    const trimmedName = newUnit.name.trim()
    const trimmedAbbreviation = newUnit.abbreviation.trim()
    if (trimmedName === '' || trimmedAbbreviation === '') return

    setSavingNewUnit(true)
    try {
      const created = await createUnit({
        name: trimmedName,
        abbreviation: trimmedAbbreviation,
        allows_fraction: newUnit.allows_fraction,
      })
      setUnits((prev) => [...prev, created])
      setProductDraft((prev) => ({ ...prev, unitId: created.id }))
      setCreatingUnit(false)
      setNewUnit({ name: '', abbreviation: '', allows_fraction: false })
      showSuccess('Unidad creada.')
    } catch (error) {
      showError(error instanceof ApiError ? error.message : CREATE_UNIT_ERROR_MESSAGE)
    } finally {
      setSavingNewUnit(false)
    }
  }

  function cancelCreateCategory() {
    setCreatingCategory(false)
    setNewCategoryName('')
  }

  function cancelCreateUnit() {
    setCreatingUnit(false)
    setNewUnit({ name: '', abbreviation: '', allows_fraction: false })
  }

  const productNameError =
    productDraft.name.trim() === '' ? 'El nombre es obligatorio.' : duplicateProductNameError
  const showProductNameError = (productNameTouched || attemptedProductSubmit) && productNameError !== null

  async function handleSaveProduct(event: React.FormEvent) {
    event.preventDefault()
    if (product === null) return
    setAttemptedProductSubmit(true)
    if (productNameError !== null) return

    const trimmedName = productDraft.name.trim()
    if (normalizeForComparison(trimmedName) !== normalizeForComparison(product.name)) {
      setCheckingProductName(true)
      const isDuplicate = await fetchProductsPage({ page: 1, pageSize: 10, search: trimmedName })
        .then((result) => {
          const normalizedTyped = normalizeForComparison(trimmedName)
          return result.items.some(
            (item) => item.id !== product.id && normalizeForComparison(item.name) === normalizedTyped,
          )
        })
        .catch(() => false)
      setCheckingProductName(false)

      if (isDuplicate) {
        setDuplicateProductNameError('Ya existe un producto con ese nombre.')
        return
      }
    }

    if (productDraft.status !== product.status) {
      setConfirmingStatusChange(true)
      return
    }

    setConfirmingProductEdit(true)
  }

  function confirmStatusChangeAndSave() {
    setConfirmingStatusChange(false)
    void saveProduct()
  }

  function confirmProductEditAndSave() {
    setConfirmingProductEdit(false)
    void saveProduct()
  }

  async function saveProduct() {
    if (product === null) return

    setSavingProduct(true)
    try {
      let updated = await updateProduct(product.id, {
        name: productDraft.name.trim(),
        category_id: productDraft.categoryId,
        unit_id: productDraft.unitId,
      })
      if (productDraft.status !== product.status) {
        updated = productDraft.status === 'active' ? await reactivateProduct(product.id) : await deactivateProduct(product.id)
      }

      if (imageRemoved) {
        updated = { ...updated, image_url: (await removeProductImage(product.id)).image_url }
      } else if (pendingImageFile !== null) {
        updated = { ...updated, image_url: (await uploadProductImage(product.id, pendingImageFile)).image_url }
      }

      const nextPricesByVariant = new Map(pricesByVariant)
      let nextVariants = product.variants

      if (product.variants.length === 1 && product.variants[0].is_implicit) {
        const variant = product.variants[0]
        const trimmedPrice = priceDraft.trim()
        const currentAmount = pricesByVariant.get(variant.id)?.amount
        if (trimmedPrice !== '' && trimmedPrice !== currentAmount) {
          const price = await changeVariantPrice(variant.id, trimmedPrice, pricesByVariant.get(variant.id)?.id ?? null)
          nextPricesByVariant.set(variant.id, price)
        }
      } else {
        for (const row of variantDraftRows) {
          const variant = product.variants.find((candidate) => candidate.id === row.id)
          if (variant === undefined) continue

          const trimmedLabel = row.label.trim()
          if (trimmedLabel !== (variant.label ?? '')) {
            const result = await updateVariant(variant.id, {
              label: trimmedLabel === '' ? null : trimmedLabel,
              attribute_value_ids: variant.attribute_value_ids,
            })
            nextVariants = nextVariants.map((candidate) =>
              candidate.id === result.variant.id ? result.variant : candidate,
            )
          }

          const trimmedPrice = row.price.trim()
          const currentAmount = pricesByVariant.get(variant.id)?.amount
          if (trimmedPrice !== '' && trimmedPrice !== currentAmount) {
            const price = await changeVariantPrice(variant.id, trimmedPrice, pricesByVariant.get(variant.id)?.id ?? null)
            nextPricesByVariant.set(variant.id, price)
          }
        }
      }

      setPricesByVariant(nextPricesByVariant)
      setProduct({ ...updated, variants: nextVariants })
      outletContext?.onProductUpdated({ ...updated, variants: nextVariants })
      setPendingImageFile(null)
      setImageRemoved(false)
      setEditingProduct(false)
      showSuccess('Producto actualizado.')
      close()
    } catch (error) {
      const isPriceConflict =
        error instanceof ApiError &&
        error.status === 409 &&
        typeof error.body === 'object' &&
        error.body !== null
      showError(
        isPriceConflict
          ? 'Un precio cambió mientras tanto. Cerrá y volvé a intentar.'
          : error instanceof ApiError
            ? error.message
            : SAVE_ERROR_MESSAGE,
      )
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
  }

  function cancelEditVariant() {
    setEditingVariantId(null)
    setVariantValues([])
  }

  function handleSaveVariant(event: React.FormEvent) {
    event.preventDefault()
    if (editingVariantId === null) return
    setConfirmingVariantEdit(true)
  }

  async function saveVariantNow() {
    if (editingVariantId === null) return

    setConfirmingVariantEdit(false)
    setSavingVariant(true)
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
      showSuccess('Variante actualizada.')
    } catch (error) {
      showError(error instanceof ApiError ? error.message : SAVE_ERROR_MESSAGE)
    } finally {
      setSavingVariant(false)
    }
  }

  async function confirmVariantStatusChange() {
    if (confirmingVariantStatusChange === null) return
    const variant = confirmingVariantStatusChange

    setVariantStatusError(null)
    try {
      const updated =
        variant.status === 'active' ? await deactivateVariant(variant.id) : await reactivateVariant(variant.id)
      setProduct((prev) =>
        prev === null
          ? prev
          : { ...prev, variants: prev.variants.map((candidate) => (candidate.id === updated.id ? updated : candidate)) },
      )
      setConfirmingVariantStatusChange(null)
      showSuccess(updated.status === 'active' ? 'Variante activada.' : 'Variante desactivada.')
    } catch (error) {
      setVariantStatusError(error instanceof ApiError ? error.message : SAVE_ERROR_MESSAGE)
    }
  }

  function openHistory(variant: Variant) {
    setHistoryState({ variant, status: 'loading', prices: [] })
    fetchVariantPriceHistory(variant.id)
      .then((prices) => setHistoryState({ variant, status: 'success', prices }))
      .catch(() => setHistoryState({ variant, status: 'error', prices: [] }))
  }

  return (
    <>
    {!pickingVariantForPrice && !(priceModalVariant !== null && priceModalOpenedDirectly) && (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-3 sm:p-4">
      <div className="absolute inset-0 bg-ink/20 backdrop-blur-sm" onClick={close} aria-hidden="true" />

      <div className="relative flex max-h-[90vh] min-h-[16rem] w-full max-w-full flex-col overflow-hidden rounded-2xl bg-surface shadow-2xl sm:max-w-2xl">
        <div ref={modalScrollRef} onScroll={updateModalScrollbar} className="scrollbar-hidden min-h-0 flex-1 overflow-auto px-4 py-4 sm:px-6 sm:py-6">

        <div className="mb-4 flex items-center justify-between gap-3">
          {loadStatus === 'success' && product !== null ? (
            <p className="m-0 text-base opacity-60">
              <Link to="/products" className="hover:text-brand">
                Catálogo
              </Link>{' '}
              › {product.name} ›{' '}
              <span className="text-brand">{editingProduct ? 'Editar producto' : 'Ver detalle'}</span>
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

        {loadStatus === 'error' && (
          <div className="flex flex-1 items-center justify-center">
            <LoadErrorCard message={LOAD_ERROR_MESSAGE} onRetry={load} />
          </div>
        )}

        {loadStatus === 'success' && product !== null && (
          <div className="flex flex-col gap-4">
            {editingProduct && (
              <div>
                <h1 className="m-0 text-2xl font-bold">Editar producto</h1>
                <p className="m-0 mt-1 font-mono text-base italic opacity-40">Próximamente</p>
              </div>
            )}

            <DuplicateWarning duplicates={duplicates} />

            {editingProduct ? (
              <form onSubmit={handleSaveProduct} className="flex flex-col gap-4">
                <div className="flex flex-col gap-3">
                  <h2 className="m-0 border-l-4 border-brand pl-3 text-base font-bold uppercase tracking-wide opacity-70">
                    Información general
                  </h2>

                  <label htmlFor="edit-product-name" className="-mb-2 text-base font-bold uppercase tracking-wide opacity-60">
                    Nombre <span className="text-danger">*</span>
                  </label>
                  <input
                    id="edit-product-name"
                    type="text"
                    value={productDraft.name}
                    onChange={(event) => {
                      setProductDraft((prev) => ({ ...prev, name: event.target.value }))
                      setDuplicateProductNameError(null)
                    }}
                    onBlur={() => setProductNameTouched(true)}
                    disabled={savingProduct}
                    className={fieldClasses(showProductNameError)}
                  />
                  {showProductNameError && (
                    <span role="alert" className="-mt-2 text-sm text-danger">
                      {productNameError}
                    </span>
                  )}
                  {!showProductNameError && checkingProductName && (
                    <span className="-mt-2 text-sm opacity-60">Verificando nombre…</span>
                  )}

                  <StagedProductImageField
                    imageUrl={product.image_url}
                    productName={product.name}
                    pendingFile={pendingImageFile}
                    removed={imageRemoved}
                    disabled={savingProduct}
                    onSelectFile={(file) => {
                      setPendingImageFile(file)
                      setImageRemoved(false)
                    }}
                    onRemove={() => {
                      setImageRemoved(true)
                      setPendingImageFile(null)
                    }}
                    onUndo={() => {
                      setPendingImageFile(null)
                      setImageRemoved(false)
                    }}
                  />

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="flex flex-col gap-2">
                      <span className="text-base font-bold uppercase tracking-wide opacity-60">Código</span>
                      <p className={`${inputClasses} m-0 flex items-center italic opacity-40`}>Próximamente</p>
                    </div>

                    <div className="flex flex-col gap-2">
                      <span className="text-base font-bold uppercase tracking-wide opacity-60">Estado</span>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setProductDraft((prev) => ({ ...prev, status: 'active' }))}
                          disabled={savingProduct}
                          className={`min-h-11 flex-1 rounded-lg border text-base font-semibold transition-colors ${
                            productDraft.status === 'active'
                              ? 'border-success bg-success-soft text-success'
                              : 'border-line text-ink/40 hover:bg-surface-brand'
                          }`}
                        >
                          ● Activo
                        </button>
                        <button
                          type="button"
                          onClick={() => setProductDraft((prev) => ({ ...prev, status: 'inactive' }))}
                          disabled={savingProduct}
                          className={`min-h-11 flex-1 rounded-lg border text-base font-semibold transition-colors ${
                            productDraft.status !== 'active'
                              ? 'border-ink/40 bg-ink/5 text-ink/60'
                              : 'border-line text-ink/40 hover:bg-surface-brand'
                          }`}
                        >
                          ○ Inactivo
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center justify-between">
                        <span className="text-base font-bold uppercase tracking-wide opacity-60">
                          Categoría <span className="text-danger">*</span>
                        </span>
                        {!creatingCategory && (
                          <button
                            type="button"
                            onClick={() => setCreatingCategory(true)}
                            disabled={savingProduct}
                            className="min-h-11 rounded-lg px-3 text-base font-semibold text-brand transition-colors hover:bg-surface-brand hover:underline"
                          >
                            + Nueva
                          </button>
                        )}
                      </div>
                      <SelectMenu
                        ariaLabel="Categoría"
                        disabled={savingProduct}
                        value={String(productDraft.categoryId)}
                        onChange={(value) => {
                          if (value === CREATE_NEW_OPTION) {
                            setCreatingCategory(true)
                            return
                          }
                          setProductDraft((prev) => ({ ...prev, categoryId: Number(value) }))
                        }}
                        options={[
                          ...categories
                            .filter((category) => category.status === 'active' || category.id === productDraft.categoryId)
                            .map((category) => ({ value: String(category.id), label: category.name })),
                          { value: CREATE_NEW_OPTION, label: '+ Crear categoría nueva…' },
                        ]}
                      />
                    </div>

                    <div className="flex flex-col gap-1">
                      <div className="flex items-center justify-between">
                        <span className="text-base font-bold uppercase tracking-wide opacity-60">
                          Unidad <span className="text-danger">*</span>
                        </span>
                        {!creatingUnit && (
                          <button
                            type="button"
                            onClick={() => setCreatingUnit(true)}
                            disabled={savingProduct}
                            className="min-h-11 rounded-lg px-3 text-base font-semibold text-brand transition-colors hover:bg-surface-brand hover:underline"
                          >
                            + Nueva
                          </button>
                        )}
                      </div>
                      <SelectMenu
                        ariaLabel="Unidad"
                        disabled={savingProduct}
                        value={String(productDraft.unitId)}
                        onChange={(value) => {
                          if (value === CREATE_NEW_OPTION) {
                            setCreatingUnit(true)
                            return
                          }
                          setProductDraft((prev) => ({ ...prev, unitId: Number(value) }))
                        }}
                        options={[
                          ...units
                            .filter((unit) => unit.status === 'active' || unit.id === productDraft.unitId)
                            .map((unit) => ({ value: String(unit.id), label: `${unit.name} (${unit.abbreviation})` })),
                          { value: CREATE_NEW_OPTION, label: '+ Crear unidad nueva…' },
                        ]}
                      />
                    </div>
                  </div>

                  {creatingCategory && (
                    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
                      <div
                        className="absolute inset-0 bg-ink/20"
                        onClick={cancelCreateCategory}
                        aria-hidden="true"
                      />
                      <div
                        role="dialog"
                        aria-label="Nueva categoría"
                        className="relative flex w-full max-w-sm flex-col gap-4 rounded-2xl bg-surface p-6 shadow-2xl"
                      >
                        <div className="flex items-start justify-between">
                          <h2 className="m-0 text-2xl font-bold">Nueva categoría</h2>
                          <CloseButton onClose={cancelCreateCategory} />
                        </div>

                        <div className="flex flex-col gap-2">
                          <label
                            htmlFor="new-category-name"
                            className="text-base font-bold uppercase tracking-wide opacity-60"
                          >
                            Nombre <span className="text-danger">*</span>
                          </label>
                          <input
                            id="new-category-name"
                            type="text"
                            placeholder="Ej: Ropa interior"
                            value={newCategoryName}
                            onChange={(event) => setNewCategoryName(event.target.value)}
                            disabled={savingNewCategory}
                            autoFocus
                            className={inputClasses}
                          />
                        </div>

                        <div className="flex flex-col gap-2">
                          <span className="text-base font-bold uppercase tracking-wide opacity-60">
                            Descripción <span className="font-normal normal-case opacity-70">(opcional)</span>
                          </span>
                          <p className="m-0 flex min-h-16 items-start rounded-lg border border-line bg-line/10 px-3.5 py-2.5 text-lg italic opacity-40">
                            Próximamente
                          </p>
                        </div>

                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={handleCreateCategory}
                            disabled={savingNewCategory || newCategoryName.trim() === ''}
                            className={`${primaryButtonClasses} flex-1`}
                          >
                            Crear
                          </button>
                          <button
                            type="button"
                            onClick={cancelCreateCategory}
                            disabled={savingNewCategory}
                            className={`${secondaryButtonClasses} flex-1`}
                          >
                            Cancelar
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {creatingUnit && (
                    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
                      <div
                        className="absolute inset-0 bg-ink/20"
                        onClick={cancelCreateUnit}
                        aria-hidden="true"
                      />
                      <div
                        role="dialog"
                        aria-label="Nueva unidad"
                        className="relative flex w-full max-w-sm flex-col gap-4 rounded-2xl bg-surface p-6 shadow-2xl"
                      >
                        <div className="flex items-start justify-between">
                          <h2 className="m-0 text-2xl font-bold">Nueva unidad</h2>
                          <CloseButton onClose={cancelCreateUnit} />
                        </div>

                        <div className="grid grid-cols-[1fr_6rem] gap-3">
                          <div className="flex flex-col gap-2">
                            <label
                              htmlFor="new-unit-name"
                              className="text-base font-bold uppercase tracking-wide opacity-60"
                            >
                              Nombre <span className="text-danger">*</span>
                            </label>
                            <input
                              id="new-unit-name"
                              type="text"
                              placeholder="Metro"
                              value={newUnit.name}
                              onChange={(event) => setNewUnit((prev) => ({ ...prev, name: event.target.value }))}
                              disabled={savingNewUnit}
                              autoFocus
                              className={inputClasses}
                            />
                          </div>
                          <div className="flex flex-col gap-2">
                            <label
                              htmlFor="new-unit-abbreviation"
                              className="text-base font-bold uppercase tracking-wide opacity-60"
                            >
                              Abrev. <span className="text-danger">*</span>
                            </label>
                            <input
                              id="new-unit-abbreviation"
                              type="text"
                              placeholder="m"
                              value={newUnit.abbreviation}
                              onChange={(event) =>
                                setNewUnit((prev) => ({ ...prev, abbreviation: event.target.value }))
                              }
                              disabled={savingNewUnit}
                              className={inputClasses}
                            />
                          </div>
                        </div>

                        <label className="flex items-center gap-2 text-base">
                          <input
                            type="checkbox"
                            checked={newUnit.allows_fraction}
                            onChange={(event) =>
                              setNewUnit((prev) => ({ ...prev, allows_fraction: event.target.checked }))
                            }
                            disabled={savingNewUnit}
                            className="h-5 w-5 accent-brand"
                          />
                          Permite decimales (fraccionable)
                        </label>

                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={handleCreateUnit}
                            disabled={savingNewUnit || newUnit.name.trim() === '' || newUnit.abbreviation.trim() === ''}
                            className={`${primaryButtonClasses} flex-1`}
                          >
                            Crear
                          </button>
                          <button
                            type="button"
                            onClick={cancelCreateUnit}
                            disabled={savingNewUnit}
                            className={`${secondaryButtonClasses} flex-1`}
                          >
                            Cancelar
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  <span className="-mb-2 text-base font-bold uppercase tracking-wide opacity-60">
                    Descripción <span className="font-normal normal-case opacity-70">(opcional)</span>
                  </span>
                  <p className="m-0 flex min-h-24 items-start rounded-lg border border-line bg-line/10 px-3.5 py-2.5 text-lg italic opacity-40">
                    Próximamente
                  </p>
                </div>

                <div className="flex flex-col gap-3">
                  <h2 className="m-0 border-l-4 border-brand pl-3 text-base font-bold uppercase tracking-wide opacity-70">
                    Precios y variantes
                  </h2>

                  <div className="flex gap-2">
                    <div
                      className={`flex min-h-11 flex-1 items-center justify-center rounded-lg border text-base font-semibold ${
                        product.variants.length === 1 && product.variants[0].is_implicit
                          ? 'border-brand bg-surface-brand text-brand'
                          : 'border-line text-ink/30'
                      }`}
                    >
                      Precio único
                    </div>
                    <div
                      className={`flex min-h-11 flex-1 items-center justify-center rounded-lg border text-base font-semibold ${
                        !(product.variants.length === 1 && product.variants[0].is_implicit)
                          ? 'border-brand bg-surface-brand text-brand'
                          : 'border-line text-ink/30'
                      }`}
                    >
                      Con variantes
                    </div>
                  </div>

                  {product.variants.length === 1 && product.variants[0].is_implicit ? (
                    <div className="flex flex-col gap-2">
                      <span className="text-base font-bold uppercase tracking-wide opacity-60">
                        Precio <span className="font-normal normal-case opacity-70">(opcional)</span>
                      </span>
                      <PriceInput
                        ariaLabel="Precio"
                        value={priceDraft}
                        onChange={setPriceDraft}
                        disabled={savingProduct}
                        className={`${inputClasses} w-full pl-8`}
                      />
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2">
                      <div className="grid grid-cols-[1fr_9rem_2.75rem] gap-2 text-base font-bold uppercase tracking-wide opacity-60">
                        <span>Nombre de variante</span>
                        <span>
                          Precio <span className="font-normal normal-case opacity-70">(opcional)</span>
                        </span>
                        <span />
                      </div>
                      {variantDraftRows.map((row, index) => (
                        <div key={row.id} className="grid grid-cols-[1fr_9rem_2.75rem] items-center gap-2">
                          <input
                            type="text"
                            aria-label={`Nombre de la variante ${index + 1}`}
                            value={row.label}
                            onChange={(event) =>
                              setVariantDraftRows((prev) =>
                                prev.map((candidate) =>
                                  candidate.id === row.id ? { ...candidate, label: event.target.value } : candidate,
                                ),
                              )
                            }
                            disabled={savingProduct}
                            className={inputClasses}
                          />
                          <PriceInput
                            ariaLabel={`Precio de la variante ${index + 1}`}
                            value={row.price}
                            onChange={(value) =>
                              setVariantDraftRows((prev) =>
                                prev.map((candidate) =>
                                  candidate.id === row.id ? { ...candidate, price: value } : candidate,
                                ),
                              )
                            }
                            disabled={savingProduct}
                            className={`${inputClasses} w-full pl-6`}
                          />
                          <button
                            type="button"
                            disabled
                            title="Próximamente"
                            aria-label="Eliminar variante (Próximamente)"
                            className="flex h-11 w-11 items-center justify-center text-ink/20"
                          >
                            <svg
                              aria-hidden="true"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="3"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              className="h-5 w-5"
                            >
                              <line x1="18" y1="6" x2="6" y2="18" />
                              <line x1="6" y1="6" x2="18" y2="18" />
                            </svg>
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        disabled
                        title="Próximamente"
                        className={`${secondaryButtonClasses} border-dashed opacity-50`}
                      >
                        + Agregar variante (Próximamente)
                      </button>
                    </div>
                  )}
                </div>

                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={savingProduct || productNameError !== null || checkingProductName}
                    className={`${primaryButtonClasses} flex-1`}
                  >
                    {checkingProductName ? 'Verificando…' : 'Guardar cambios'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingProduct(false)
                      setPendingImageFile(null)
                      setImageRemoved(false)
                      close()
                    }}
                    disabled={savingProduct}
                    className={`${secondaryButtonClasses} flex-1`}
                  >
                    Cancelar
                  </button>
                </div>
              </form>
            ) : (
              <div className="flex flex-col gap-3">
                <div className="flex items-start gap-4">
                  {product.image_url !== null ? (
                    <img
                      src={product.image_url}
                      alt={product.name}
                      className="h-20 w-20 shrink-0 rounded-lg border border-line object-cover"
                    />
                  ) : (
                    <div
                      aria-hidden="true"
                      className="flex h-20 w-20 shrink-0 items-center justify-center rounded-lg border border-line bg-line/15 text-ink/30"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-1/2 w-1/2">
                        <rect x="3" y="3" width="18" height="18" rx="2" />
                        <circle cx="8.5" cy="8.5" r="1.5" />
                        <path d="M21 15l-5-5L5 21" />
                      </svg>
                    </div>
                  )}
                  <div className="flex flex-col gap-1">
                    <h1 className="m-0 text-2xl font-bold">{product.name}</h1>
                    <div className="flex items-center gap-2 text-base">
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
                  </div>
                </div>

                <div className="flex flex-col gap-4 rounded-xl bg-line/15 p-4">
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <p className="m-0 text-base uppercase tracking-wide opacity-60">Categoría</p>
                      <p className="m-0 font-bold">
                        {categories.find((category) => category.id === product.category_id)?.name ?? '—'}
                      </p>
                    </div>
                    <div>
                      <p className="m-0 text-base uppercase tracking-wide opacity-60">Unidad</p>
                      <p className="m-0 font-bold">
                        {units.find((unit) => unit.id === product.unit_id)?.name ?? '—'}
                      </p>
                    </div>
                    <div>
                      <p className="m-0 text-base uppercase tracking-wide opacity-60">Variantes</p>
                      <p className="m-0 font-bold">{product.variants.length}</p>
                    </div>
                  </div>
                  <div className="border-t border-line pt-4">
                    <p className="m-0 text-base uppercase tracking-wide opacity-60">Descripción</p>
                    <p className="m-0 italic opacity-40">Próximamente</p>
                  </div>
                </div>
              </div>
            )}

            {!editingProduct && product.variants.length === 1 && product.variants[0].is_implicit && (
              <div className="flex flex-col gap-3">
                <h2 className="m-0 border-l-4 border-brand pl-3 text-base font-bold uppercase tracking-wide opacity-70">
                  Precio
                </h2>
                <div className="flex flex-col gap-3 rounded-xl border border-line p-4">
                  <div className="flex items-start justify-between gap-3">
                    <p className="m-0 text-base opacity-60">Precio</p>
                    <p className="m-0 text-xl font-bold text-brand">
                      {pricesByVariant.get(product.variants[0].id)?.amount !== undefined
                        ? formatPrice(pricesByVariant.get(product.variants[0].id)!.amount)
                        : 'Sin precio'}
                    </p>
                  </div>

                  <div className="flex flex-col gap-0.5 text-base opacity-60">
                    <p className="m-0">
                      <span>Stock: </span>
                      <span>Próximamente</span>
                    </p>
                    {canManage && (
                      <p className="m-0">
                        <span>Último cambio: </span>
                        <span>
                          {(() => {
                            const price = pricesByVariant.get(product.variants[0].id)
                            if (price === null || price === undefined) return '—'
                            return `${formatRelativeTime(price.effective_from)} por ${price.created_by_account_name}`
                          })()}
                        </span>
                      </p>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {canManage && (
                      <button
                        type="button"
                        onClick={() => {
                          setPriceModalOpenedDirectly(false)
                          setPriceModalApplyToAll(false)
                          setPriceModalVariant(product.variants[0])
                        }}
                        className={primaryButtonClasses}
                      >
                        Cambiar precio
                      </button>
                    )}
                    {canManage && (
                      <button
                        type="button"
                        onClick={() => openHistory(product.variants[0])}
                        className={secondaryButtonClasses}
                      >
                        Ver historial
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {!editingProduct && !(product.variants.length === 1 && product.variants[0].is_implicit) && (
              <div className="flex flex-col gap-3">
                <h2 className="m-0 border-l-4 border-brand pl-3 text-base font-bold uppercase tracking-wide opacity-70">
                  Precios y variantes
                </h2>
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
                            <div className="flex items-center gap-2">
                              <span
                                className={`text-lg font-bold ${variant.status !== 'active' ? 'opacity-50 line-through' : ''}`}
                              >
                                {describeVariant(variant, valuesById)}
                              </span>
                              {variant.status !== 'active' && (
                                <span className="rounded-full bg-ink/10 px-2 py-0.5 text-sm font-semibold uppercase tracking-wide text-ink/60">
                                  Inactiva
                                </span>
                              )}
                            </div>
                            <span className="text-xl font-bold text-brand">
                              {pricesByVariant.get(variant.id)?.amount !== undefined
                                ? formatPrice(pricesByVariant.get(variant.id)!.amount)
                                : 'Sin precio'}
                            </span>
                          </div>

                          <div className="flex flex-col gap-0.5 text-base opacity-60">
                            <p className="m-0">
                              <span>Stock: </span>
                              <span>Próximamente</span>
                            </p>
                            {canManage && (
                              <p className="m-0">
                                <span>Último cambio: </span>
                                <span>
                                  {(() => {
                                    const price = pricesByVariant.get(variant.id)
                                    if (price === null || price === undefined) return '—'
                                    return `${formatRelativeTime(price.effective_from)} por ${price.created_by_account_name}`
                                  })()}
                                </span>
                              </p>
                            )}
                          </div>

                          <div className="flex flex-wrap gap-2">
                            {canManage && variant.status === 'active' && (
                              <button
                                type="button"
                                onClick={() => {
                                  setPriceModalOpenedDirectly(false)
                                  setPriceModalApplyToAll(false)
                                  setPriceModalVariant(variant)
                                }}
                                className={primaryButtonClasses}
                              >
                                Cambiar precio
                              </button>
                            )}
                            {canManage && (
                              <button
                                type="button"
                                onClick={() => openHistory(variant)}
                                className={secondaryButtonClasses}
                              >
                                Ver historial
                              </button>
                            )}
                            {canManage && variant.status === 'active' && (
                              <button
                                type="button"
                                onClick={() => startEditVariant(variant)}
                                className={secondaryButtonClasses}
                              >
                                Editar
                              </button>
                            )}
                            {canManage && (
                              <button
                                type="button"
                                onClick={() => {
                                  setVariantStatusError(null)
                                  setConfirmingVariantStatusChange(variant)
                                }}
                                className={secondaryButtonClasses}
                              >
                                {variant.status === 'active' ? 'Desactivar' : 'Activar'}
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
    )}

      {pickingVariantForPrice && product !== null && (
        <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-ink/20 backdrop-blur-sm"
            onClick={() => setPickingVariantForPrice(false)}
            aria-hidden="true"
          />
          <div className="relative flex w-full max-w-sm flex-col gap-4 rounded-2xl bg-surface p-6 shadow-2xl">
            <div className="flex items-start justify-between">
              <h2 className="m-0 text-2xl font-bold">Elegir variante</h2>
              <CloseButton onClose={() => setPickingVariantForPrice(false)} />
            </div>
            <p className="m-0 text-base opacity-60">¿A qué variante de "{product.name}" le querés cambiar el precio?</p>
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {product.variants.filter((variant) => variant.status === 'active').length > 1 && (
                <li>
                  <button
                    type="button"
                    onClick={() => {
                      const firstActive = product.variants.find((candidate) => candidate.status === 'active')
                      if (firstActive === undefined) return
                      setPickingVariantForPrice(false)
                      setPriceModalOpenedDirectly(true)
                      setPriceModalApplyToAll(true)
                      setPriceModalVariant(firstActive)
                    }}
                    className="flex w-full items-center justify-between gap-3 rounded-lg border border-brand/40 bg-surface-brand px-4 py-3 text-left text-base font-semibold text-brand transition-colors hover:border-brand"
                  >
                    <span>Todas las variantes</span>
                    <span>({product.variants.filter((variant) => variant.status === 'active').length})</span>
                  </button>
                </li>
              )}
              {product.variants.map((variant) => (
                <li key={variant.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setPickingVariantForPrice(false)
                      setPriceModalOpenedDirectly(true)
                      setPriceModalApplyToAll(false)
                      setPriceModalVariant(variant)
                    }}
                    className="flex w-full items-center justify-between gap-3 rounded-lg border border-line px-4 py-3 text-left text-base transition-colors hover:border-brand hover:bg-surface-brand"
                  >
                    <span className="font-semibold">{describeVariant(variant, valuesById)}</span>
                    <span className="font-bold text-brand">
                      {pricesByVariant.get(variant.id)?.amount !== undefined
                        ? formatPrice(pricesByVariant.get(variant.id)!.amount)
                        : 'Sin precio'}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

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
          defaultApplyToAll={priceModalApplyToAll}
          onClose={() => {
            if (priceModalOpenedDirectly) {
              close()
              return
            }
            setPriceModalVariant(null)
          }}
          onSuccess={(updates) => {
            setPricesByVariant((prev) => {
              const next = new Map(prev)
              for (const update of updates) {
                next.set(update.variantId, update.price)
              }
              return next
            })
            if (priceModalOpenedDirectly) {
              close()
              return
            }
            setPriceModalVariant(null)
          }}
        />
      )}

      {historyState !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-ink/20 backdrop-blur-sm"
            onClick={() => setHistoryState(null)}
            aria-hidden="true"
          />
          <div
            role="dialog"
            aria-label={`Historial de precios de ${product?.name ?? ''}`}
            className="relative flex max-h-[80vh] w-full max-w-lg flex-col gap-4 rounded-2xl bg-surface p-6 shadow-2xl"
          >
            <div className="flex items-start justify-between">
              <div>
                <h2 className="m-0 text-2xl font-bold">Historial de precios</h2>
                <p className="m-0 text-lg opacity-60">
                  {product?.name} — {describeVariant(historyState.variant, valuesById)}
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
              <div className="relative min-h-0 flex-1">
                <div
                  ref={historyScrollRef}
                  onScroll={updateHistoryScrollbar}
                  className="scrollbar-hidden h-full overflow-auto pr-5"
                >
                  <ul className="m-0 flex list-none flex-col gap-3 p-0">
                    {[...historyState.prices]
                      .sort((a, b) => new Date(b.effective_from).getTime() - new Date(a.effective_from).getTime())
                      .map((price) => (
                        <li key={price.id} className="flex flex-col gap-1 rounded-lg border border-line px-4 py-3">
                          <div className="flex items-center justify-between text-lg">
                            <span className="font-bold text-brand">{formatPrice(price.amount)}</span>
                            <span className="opacity-60">{price.created_by_account_name}</span>
                          </div>
                          <p className="m-0 text-base opacity-60">
                            Vigente desde {formatRelativeTime(price.effective_from)}
                            {price.effective_to !== null
                              ? ` hasta ${formatRelativeTime(price.effective_to)}`
                              : ' (actual)'}
                          </p>
                        </li>
                      ))}
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

      {confirmingVariantStatusChange !== null && (
        <ConfirmDialog
          title={confirmingVariantStatusChange.status === 'active' ? 'Desactivar variante' : 'Activar variante'}
          description={
            (variantStatusError ?? '') +
            (variantStatusError !== null ? ' ' : '') +
            (confirmingVariantStatusChange.status === 'active'
              ? `"${describeVariant(confirmingVariantStatusChange, valuesById)}" va a dejar de aparecer en las consultas del catálogo y en la pantalla de precios. Su historial de precios se conserva y vas a poder reactivarla cuando quieras.`
              : `"${describeVariant(confirmingVariantStatusChange, valuesById)}" vuelve a aparecer en las consultas del catálogo y en la pantalla de precios.`)
          }
          confirmLabel={confirmingVariantStatusChange.status === 'active' ? 'Desactivar' : 'Activar'}
          danger={confirmingVariantStatusChange.status === 'active'}
          onConfirm={confirmVariantStatusChange}
          onCancel={() => setConfirmingVariantStatusChange(null)}
        />
      )}

      {confirmingStatusChange && product !== null && (
        <ConfirmDialog
          title={productDraft.status === 'active' ? 'Activar producto' : 'Desactivar producto'}
          description={
            productDraft.status === 'active'
              ? `"${product.name}" y sus variantes vuelven a aparecer en las consultas del catálogo.`
              : `"${product.name}" y todas sus variantes van a dejar de aparecer en las consultas del catálogo. Vas a poder reactivarlo cuando quieras.`
          }
          confirmLabel={productDraft.status === 'active' ? 'Activar' : 'Desactivar'}
          danger={productDraft.status !== 'active'}
          onConfirm={confirmStatusChangeAndSave}
          onCancel={() => setConfirmingStatusChange(false)}
        />
      )}

      {confirmingProductEdit && product !== null && (
        <ConfirmDialog
          title="Guardar cambios"
          description={`Se van a guardar los cambios en "${product.name}" (nombre, categoría, unidad o precio).`}
          confirmLabel="Guardar"
          onConfirm={confirmProductEditAndSave}
          onCancel={() => setConfirmingProductEdit(false)}
        />
      )}

      {confirmingVariantEdit && (
        <ConfirmDialog
          title="Guardar variante"
          description={`Se van a guardar los cambios en la variante "${variantLabel.trim() === '' ? 'sin nombre' : variantLabel.trim()}".`}
          confirmLabel="Guardar"
          onConfirm={saveVariantNow}
          onCancel={() => setConfirmingVariantEdit(false)}
        />
      )}
    </>
  )
}
