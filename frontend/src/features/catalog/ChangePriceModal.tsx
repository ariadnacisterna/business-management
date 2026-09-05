import { useState } from 'react'
import { changeProductPrice, changeVariantPrice } from '../../api/catalog'
import { ApiError } from '../../api/client'
import type { Price, Product, Variant } from '../../api/types'
import { formatRelativeTime } from '../../shared/formatRelativeTime'

const CONFLICT_ERROR_MESSAGE = 'El precio cambió mientras tanto. Cerrá y volvé a intentar.'
const GENERIC_ERROR_MESSAGE = 'No se pudo guardar el precio. Intentá de nuevo.'

const priceFormatter = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' })

function formatAmount(amount: string): string {
  return priceFormatter.format(Number(amount))
}

function describeVariantLabel(variant: Variant): string {
  return variant.label ?? (variant.is_implicit ? 'Estándar' : `Variante #${variant.id}`)
}

interface Props {
  product: Product
  variant: Variant
  currentPrice: Price | null
  activeVariantPrices: Map<number, Price | null>
  onClose: () => void
  onSuccess: (updates: { variantId: number; price: Price }[]) => void
}

export function ChangePriceModal({ product, variant, currentPrice, activeVariantPrices, onClose, onSuccess }: Props) {
  const [amount, setAmount] = useState('')
  const [applyToAll, setApplyToAll] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const activeVariantCount = activeVariantPrices.size

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    const trimmed = amount.trim()
    if (trimmed === '') return

    setSaving(true)
    setError(null)
    try {
      if (applyToAll) {
        const expectedIds: Record<number, number | null> = {}
        for (const [variantId, price] of activeVariantPrices) {
          expectedIds[variantId] = price?.id ?? null
        }
        const result = await changeProductPrice(product.id, trimmed, expectedIds)
        onSuccess(result.prices.map((price) => ({ variantId: price.variant_id, price })))
      } else {
        const price = await changeVariantPrice(variant.id, trimmed, currentPrice?.id ?? null)
        onSuccess([{ variantId: variant.id, price }])
      }
    } catch (submitError) {
      setError(
        submitError instanceof ApiError && submitError.status === 409
          ? CONFLICT_ERROR_MESSAGE
          : GENERIC_ERROR_MESSAGE,
      )
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
        <div className="flex items-start justify-between">
          <h2 className="text-2xl font-bold">Cambiar Precio</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-line/20 text-ink/70 transition-colors hover:bg-danger/15 hover:text-danger"
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
        </div>

        <div className="flex flex-col gap-1.5 text-lg">
          <div className="flex justify-between">
            <span className="opacity-60">Producto</span>
            <span className="font-semibold">{product.name}</span>
          </div>
          <div className="flex justify-between">
            <span className="opacity-60">Variante</span>
            <span className="font-semibold">{describeVariantLabel(variant)}</span>
          </div>
        </div>

        <div className="flex flex-col gap-1.5 border-t border-line pt-3 text-lg">
          <div className="flex justify-between">
            <span className="opacity-60">Precio actual</span>
            <span className="font-bold">{currentPrice !== null ? formatAmount(currentPrice.amount) : 'Sin precio'}</span>
          </div>
          <div className="flex justify-between">
            <span className="opacity-60">Vigente desde</span>
            <span className="font-medium">
              {currentPrice !== null ? formatRelativeTime(currentPrice.effective_from) : '—'}
            </span>
          </div>
        </div>

        <div>
          <label htmlFor="new-price-amount" className="text-lg font-semibold uppercase tracking-wide opacity-70">
            Nuevo precio (ARS)
          </label>
          <input
            id="new-price-amount"
            type="number"
            min="0.01"
            step="0.01"
            inputMode="decimal"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            disabled={saving}
            required
            autoFocus
            className="mt-1.5 h-12 w-full rounded-lg border border-line px-3 text-lg focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/10"
          />
        </div>

        {activeVariantCount > 1 && (
          <label className="flex items-center gap-2 text-lg">
            <input
              type="checkbox"
              checked={applyToAll}
              onChange={(event) => setApplyToAll(event.target.checked)}
              disabled={saving}
              className="h-5 w-5 accent-brand"
            />
            Aplicar a TODAS las variantes ({activeVariantCount})
          </label>
        )}

        {error !== null && (
          <p role="alert" className="m-0 text-lg text-danger">
            {error}
          </p>
        )}

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={saving || amount.trim() === ''}
            className="h-12 flex-1 rounded-lg bg-brand text-lg font-bold text-brand-contrast transition-colors hover:bg-brand/90 disabled:opacity-40"
          >
            Confirmar
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="h-12 flex-1 rounded-lg border border-line text-lg font-semibold transition-colors hover:bg-surface-brand"
          >
            Cancelar
          </button>
        </div>
      </form>
    </div>
  )
}
