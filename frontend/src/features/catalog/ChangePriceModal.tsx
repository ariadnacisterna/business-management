import { useState } from 'react'
import { changeProductPrice, changeVariantPrice, setInitialVariantPrice } from '../../api/catalog'
import { ApiError } from '../../api/client'
import type { Price, Product, Variant } from '../../api/types'
import { Breadcrumb } from '../../shared/Breadcrumb'
import { CloseButton } from '../../shared/CloseButton'
import { PriceInput } from '../../shared/PriceInput'
import { AllVariantsPreview, DeltaPreview, SignedDeltaInput } from '../../shared/SignedDeltaInput'
import { deltaToApi, evaluateDelta, evaluateForAll, evaluateTargetPrice } from '../../shared/signedDelta'
import { useToast } from '../../shared/useToast'
import { formatPrice, formatPriceExact } from '../../shared/formatPrice'
import { formatRelativeTime } from '../../shared/formatRelativeTime'

const GENERIC_ERROR_MESSAGE = 'No se pudo guardar el precio. Intentá de nuevo.'

function describeVariantLabel(variant: Variant): string {
  return variant.label ?? (variant.is_implicit ? 'Estándar' : `Variante #${variant.id}`)
}

interface Props {
  product: Product
  categoryName: string
  variant: Variant
  currentPrice: Price | null
  activeVariantPrices: Map<number, Price | null>
  defaultApplyToAll?: boolean
  onClose: () => void
  onSuccess: (updates: { variantId: number; price: Price }[]) => void
}

export function ChangePriceModal({
  product,
  categoryName,
  variant,
  currentPrice,
  activeVariantPrices,
  defaultApplyToAll = false,
  onClose,
  onSuccess,
}: Props) {
  const { showSuccess, showError } = useToast()
  const [amount, setAmount] = useState('')
  const [applyToAll, setApplyToAll] = useState(defaultApplyToAll)
  const [wholePrice, setWholePrice] = useState(false)
  const [saving, setSaving] = useState(false)

  const activeVariantCount = activeVariantPrices.size
  const isInitialPrice = !applyToAll && currentPrice === null

  const singleEvaluation = wholePrice
    ? evaluateTargetPrice(currentPrice?.amount ?? 0, amount)
    : evaluateDelta('price', currentPrice?.amount ?? 0, amount)
  const pricedEntries = product.variants.flatMap((candidate) => {
    const price = activeVariantPrices.get(candidate.id)
    if (price === null || price === undefined) return []
    return [{ label: describeVariantLabel(candidate), current: price.amount }]
  })
  const allEvaluation = evaluateForAll(pricedEntries, amount)
  const skippedVariants = product.variants.filter(
    (candidate) => activeVariantPrices.has(candidate.id) && activeVariantPrices.get(candidate.id) === null,
  )
  const canSubmit = isInitialPrice
    ? amount.trim() !== '' && Number(amount) > 0
    : applyToAll
      ? allEvaluation.ready
      : singleEvaluation.state === 'ready'

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    const trimmed = amount.trim()
    if (!canSubmit) return

    setSaving(true)
    try {
      if (applyToAll) {
        const delta = allEvaluation.delta ?? 0
        const result = await changeProductPrice(product.id, String(deltaToApi('price', delta)))
        onSuccess(result.prices.map((price) => ({ variantId: price.variant_id, price })))
        const skippedNames = result.skipped_variant_ids
          .map((skippedId) => product.variants.find((candidate) => candidate.id === skippedId))
          .filter((candidate): candidate is Variant => candidate !== undefined)
          .map(describeVariantLabel)
        showSuccess(
          skippedNames.length > 0
            ? `Precio actualizado en ${result.prices.length} variantes. Se omitieron por no tener precio: ${skippedNames.join(', ')}.`
            : 'Precio actualizado para todas las variantes.',
        )
      } else if (isInitialPrice) {
        const price = await setInitialVariantPrice(variant.id, trimmed)
        onSuccess([{ variantId: variant.id, price }])
        showSuccess(`Precio inicial cargado: ${formatPriceExact(price.amount)}.`)
      } else {
        const price = await changeVariantPrice(
          variant.id,
          String(deltaToApi('price', singleEvaluation.delta ?? 0)),
        )
        onSuccess([{ variantId: variant.id, price }])
        showSuccess(
          `Precio actualizado: ${formatPriceExact(currentPrice?.amount ?? 0)} → ${formatPriceExact(price.amount)}.`,
        )
      }
    } catch (submitError) {
      showError(submitError instanceof ApiError ? submitError.message : GENERIC_ERROR_MESSAGE)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink/20 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />

      <form
        onSubmit={handleSubmit}
        className="relative flex w-full max-w-sm flex-col gap-4 rounded-2xl bg-surface p-6 shadow-2xl"
      >
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <Breadcrumb segments={['Productos', product.name, 'Cambiar precio']} />
            </div>
            <CloseButton onClose={onClose} />
          </div>
          <h2 className="text-2xl font-bold">Cambiar Precio</h2>
        </div>

        <div className="flex flex-col gap-1.5 text-lg">
          <div className="flex justify-between">
            <span className="opacity-60">Producto</span>
            <span className="font-semibold">{product.name}</span>
          </div>
          <div className="flex justify-between">
            <span className="opacity-60">Categoría</span>
            <span className="font-semibold">{categoryName}</span>
          </div>
          <div className="flex justify-between">
            <span className="opacity-60">Variante</span>
            <span className="font-semibold">{describeVariantLabel(variant)}</span>
          </div>
        </div>

        <div className="flex flex-col gap-1.5 border-t border-line pt-3 text-lg">
          <div className="flex justify-between">
            <span className="opacity-60">Precio actual</span>
            <span className="font-bold">{currentPrice !== null ? formatPrice(currentPrice.amount) : 'Sin precio'}</span>
          </div>
          <div className="flex justify-between">
            <span className="opacity-60">Vigente desde</span>
            <span className="font-medium text-success">
              {currentPrice !== null ? formatRelativeTime(currentPrice.effective_from) : '—'}
            </span>
          </div>
        </div>

        {isInitialPrice ? (
          <div>
            <label htmlFor="new-price-amount" className="text-lg font-semibold uppercase tracking-wide opacity-70">
              Precio inicial (ARS) <span className="text-danger">*</span>
            </label>
            <div className="mt-1.5">
              <PriceInput
                id="new-price-amount"
                value={amount}
                onChange={setAmount}
                ariaLabel="Precio inicial (ARS)"
                disabled={saving}
                required
                autoFocus
                className="h-12 w-full rounded-xl border border-line pl-8 pr-3 text-lg font-bold focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/10"
              />
            </div>
          </div>
        ) : (
          <div>
            <label htmlFor="new-price-delta" className="text-lg font-semibold uppercase tracking-wide opacity-70">
              {wholePrice ? 'Precio nuevo (ARS)' : 'Cuánto sumar o restar (ARS)'} <span className="text-danger">*</span>
            </label>
            <div className="mt-1.5">
              {wholePrice ? (
                <PriceInput
                  id="new-price-delta"
                  value={amount}
                  onChange={setAmount}
                  ariaLabel="Precio nuevo (ARS)"
                  disabled={saving}
                  autoFocus
                  className="h-12 w-full rounded-xl border border-line pl-8 pr-3 text-lg font-bold focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/10"
                />
              ) : (
                <SignedDeltaInput
                  kind="price"
                  id="new-price-delta"
                  value={amount}
                  onChange={setAmount}
                  ariaLabel="Cuánto sumar o restar (ARS)"
                  disabled={saving}
                  autoFocus
                  className="h-12 w-full rounded-xl border border-line pl-8 pr-3 text-lg font-bold focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/10"
                />
              )}
            </div>
            {!applyToAll && (
              <label className="mt-3 flex items-center gap-2 text-lg text-ink/60">
                <input
                  type="checkbox"
                  checked={wholePrice}
                  onChange={(event) => {
                    setWholePrice(event.target.checked)
                    setAmount('')
                  }}
                  disabled={saving}
                  className="checkbox-brand"
                />
                Cambiar todo el precio
              </label>
            )}
          </div>
        )}

        {!isInitialPrice && !applyToAll && currentPrice !== null && (
          <DeltaPreview kind="price" current={currentPrice.amount} evaluation={singleEvaluation} />
        )}

        {applyToAll && (
          <AllVariantsPreview
            evaluation={allEvaluation}
            skippedLabels={skippedVariants.map(describeVariantLabel)}
          />
        )}

        {activeVariantCount > 1 && (
          <label className="flex items-center gap-2 text-lg">
            <input
              type="checkbox"
              checked={applyToAll}
              onChange={(event) => {
                setApplyToAll(event.target.checked)
                setWholePrice(false)
                setAmount('')
              }}
              disabled={saving}
              className="checkbox-brand"
            />
            Aplicar a TODAS las variantes ({activeVariantCount})
          </label>
        )}

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={saving || !canSubmit}
            className="h-12 flex-1 rounded-xl bg-brand/80 text-lg font-bold text-brand-contrast transition-colors hover:bg-brand disabled:opacity-40"
          >
            Confirmar
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="h-12 flex-1 rounded-xl bg-line/25 text-lg font-semibold text-ink transition-colors hover:bg-line/40"
          >
            Cancelar
          </button>
        </div>
      </form>
    </div>
  )
}
