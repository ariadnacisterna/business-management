import { useState } from 'react'
import { adjustStock } from '../../api/catalog'
import { ApiError } from '../../api/client'
import type { Product, StockRow, Variant } from '../../api/types'
import { CloseButton } from '../../shared/CloseButton'
import { ConfirmDialog } from '../../shared/ConfirmDialog'
import { DeltaPreview, SignedDeltaInput } from '../../shared/SignedDeltaInput'
import { describeChange, evaluateDelta, evaluateTargetStock } from '../../shared/signedDelta'
import { useToast } from '../../shared/useToast'

const GENERIC_ERROR_MESSAGE = 'No se pudo guardar el ajuste. Intentá de nuevo.'

function describeVariantLabel(variant: Variant): string {
  return variant.label ?? (variant.is_implicit ? 'Estándar' : `Variante #${variant.id}`)
}

interface Props {
  product: Product
  categoryName: string
  variant: Variant
  currentStock: StockRow | undefined
  onClose: () => void
  onSuccess: () => void
}

export function AdjustStockModal({
  product,
  categoryName,
  variant,
  currentStock,
  onClose,
  onSuccess,
}: Props) {
  const { showSuccess, showError } = useToast()

  const [delta, setDelta] = useState('')
  const [wholeQuantity, setWholeQuantity] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [saving, setSaving] = useState(false)

  const currentQuantity = currentStock?.quantity ?? 0
  const evaluation = wholeQuantity
    ? evaluateTargetStock(currentQuantity, delta)
    : evaluateDelta('stock', currentQuantity, delta)
  const canSubmit = evaluation.state === 'ready'

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!canSubmit) return
    setConfirming(true)
  }

  async function confirmSubmit() {
    setConfirming(false)
    setSaving(true)
    try {
      const movement = await adjustStock(variant.id, { delta: evaluation.delta ?? 0 })
      showSuccess(`Stock actualizado: ${movement.quantity_before} → ${movement.quantity_after}.`)
      onSuccess()
    } catch (error) {
      showError(error instanceof ApiError ? error.message : GENERIC_ERROR_MESSAGE)
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
        <div className="flex items-start justify-between">
          <h2 className="text-2xl font-bold">Actualizar stock</h2>
          <CloseButton onClose={onClose} />
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
            <span className="opacity-60">Stock actual</span>
            <span className="font-bold">{currentQuantity}</span>
          </div>
        </div>

        <div>
          <label htmlFor="adjust-stock-delta" className="text-lg font-semibold uppercase tracking-wide opacity-70">
            {wholeQuantity ? 'Cantidad nueva' : 'Cuánto sumar o restar'} <span className="text-danger">*</span>
          </label>
          <div className="mt-1.5">
            <SignedDeltaInput
              kind="stock"
              id="adjust-stock-delta"
              value={delta}
              onChange={setDelta}
              allowSign={!wholeQuantity}
              ariaLabel={wholeQuantity ? 'Cantidad nueva' : 'Cuánto sumar o restar'}
              disabled={saving}
              autoFocus
              className="h-12 w-full rounded-xl border border-line px-3 text-lg font-bold focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/10"
            />
          </div>
          <label className="mt-3 flex items-center gap-2 text-lg text-ink/60">
            <input
              type="checkbox"
              checked={wholeQuantity}
              onChange={(event) => {
                setWholeQuantity(event.target.checked)
                setDelta('')
              }}
              disabled={saving}
              className="checkbox-brand"
            />
            Cambiar toda la cantidad
          </label>
        </div>

        <DeltaPreview kind="stock" current={currentQuantity} evaluation={evaluation} />

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

      {confirming && (
        <ConfirmDialog
          title="Actualizar stock"
          description={`El stock de "${product.name}" (${describeVariantLabel(variant)}) cambia: ${describeChange('stock', currentQuantity, evaluation.delta ?? 0)}.`}
          confirmLabel="Confirmar"
          onConfirm={confirmSubmit}
          onCancel={() => setConfirming(false)}
        />
      )}
    </div>
  )
}
