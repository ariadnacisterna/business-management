import { useState } from 'react'
import { adjustStock, createMovementReason } from '../../api/catalog'
import { ApiError } from '../../api/client'
import type { MovementReason, Product, StockRow, Variant } from '../../api/types'
import { CloseButton } from '../../shared/CloseButton'
import { ConfirmDialog } from '../../shared/ConfirmDialog'
import { SelectMenu } from '../../shared/SelectMenu'
import { useToast } from '../../shared/Toast'

const GENERIC_ERROR_MESSAGE = 'No se pudo guardar el ajuste. Intentá de nuevo.'
const CREATE_REASON_ERROR_MESSAGE = 'No se pudo crear el motivo. Intentá de nuevo.'
const CREATE_NEW_REASON_OPTION = '__create__'

function describeVariantLabel(variant: Variant): string {
  return variant.label ?? (variant.is_implicit ? 'Estándar' : `Variante #${variant.id}`)
}

interface Props {
  product: Product
  categoryName: string
  variant: Variant
  currentStock: StockRow | undefined
  reasons: MovementReason[]
  onReasonCreated: (reason: MovementReason) => void
  onClose: () => void
  onSuccess: () => void
}

export function AdjustStockModal({
  product,
  categoryName,
  variant,
  currentStock,
  reasons,
  onReasonCreated,
  onClose,
  onSuccess,
}: Props) {
  const { showSuccess, showError } = useToast()
  const activeReasons = reasons.filter((reason) => reason.status === 'active')

  const [quantity, setQuantity] = useState('')
  const [reasonId, setReasonId] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [saving, setSaving] = useState(false)

  const [creatingReason, setCreatingReason] = useState(false)
  const [newReasonName, setNewReasonName] = useState('')
  const [savingNewReason, setSavingNewReason] = useState(false)
  const [newReasonError, setNewReasonError] = useState<string | null>(null)

  const parsedQuantity = Number(quantity)
  const currentQuantity = currentStock?.quantity ?? 0
  const canSubmit =
    quantity.trim() !== '' &&
    Number.isInteger(parsedQuantity) &&
    parsedQuantity >= 0 &&
    parsedQuantity !== currentQuantity &&
    reasonId !== ''

  async function handleCreateReason() {
    const trimmed = newReasonName.trim()
    if (trimmed === '') return
    setSavingNewReason(true)
    setNewReasonError(null)
    try {
      const created = await createMovementReason(trimmed)
      onReasonCreated(created)
      setReasonId(String(created.id))
      setCreatingReason(false)
      setNewReasonName('')
    } catch (error) {
      setNewReasonError(error instanceof ApiError ? error.message : CREATE_REASON_ERROR_MESSAGE)
    } finally {
      setSavingNewReason(false)
    }
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!canSubmit) return
    setConfirming(true)
  }

  async function confirmSubmit() {
    setConfirming(false)
    setSaving(true)
    try {
      await adjustStock(variant.id, { quantity: parsedQuantity, reason_id: Number(reasonId) })
      showSuccess('Stock actualizado.')
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
          <label htmlFor="adjust-stock-quantity" className="text-lg font-semibold uppercase tracking-wide opacity-70">
            Cantidad nueva <span className="text-danger">*</span>
          </label>
          <input
            id="adjust-stock-quantity"
            type="number"
            min={0}
            step={1}
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
            disabled={saving}
            autoFocus
            className="mt-1.5 h-12 w-full rounded-xl border border-line px-3 text-lg font-bold focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/10"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-lg font-semibold uppercase tracking-wide opacity-70">
            Motivo <span className="text-danger">*</span>
          </span>
          <SelectMenu
            value={reasonId}
            onChange={(value) => {
              if (value === CREATE_NEW_REASON_OPTION) {
                setCreatingReason(true)
                return
              }
              setReasonId(value)
            }}
            ariaLabel="Motivo del ajuste"
            className="w-full"
            options={[
              { value: '', label: 'Motivo' },
              ...activeReasons.map((reason) => ({ value: String(reason.id), label: reason.name })),
              { value: CREATE_NEW_REASON_OPTION, label: '+ Crear motivo nuevo…' },
            ]}
          />
          {creatingReason && (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line p-3">
              <input
                type="text"
                aria-label="Nombre del motivo nuevo"
                placeholder="Nombre del motivo"
                value={newReasonName}
                onChange={(event) => setNewReasonName(event.target.value)}
                disabled={savingNewReason}
                className="h-12 flex-1 rounded-lg border border-line bg-surface px-3 text-lg focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/10"
              />
              <button
                type="button"
                onClick={handleCreateReason}
                disabled={savingNewReason || newReasonName.trim() === ''}
                className="h-12 rounded-lg border border-line px-5 text-base font-semibold transition-colors hover:bg-surface-brand"
              >
                Crear
              </button>
              <button
                type="button"
                onClick={() => {
                  setCreatingReason(false)
                  setNewReasonName('')
                  setNewReasonError(null)
                }}
                disabled={savingNewReason}
                className="h-12 rounded-lg border border-line px-5 text-base font-semibold transition-colors hover:bg-surface-brand"
              >
                Cancelar
              </button>
              {newReasonError !== null && (
                <p role="alert" className="m-0 w-full text-base text-danger">
                  {newReasonError}
                </p>
              )}
            </div>
          )}
        </div>

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
          description={`El stock de "${product.name}" (${describeVariantLabel(variant)}) va a pasar de ${currentQuantity} a ${parsedQuantity}.`}
          confirmLabel="Confirmar"
          onConfirm={confirmSubmit}
          onCancel={() => setConfirming(false)}
        />
      )}
    </div>
  )
}
