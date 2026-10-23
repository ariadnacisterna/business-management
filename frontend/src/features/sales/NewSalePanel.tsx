import { useMemo, useState } from 'react'
import { fetchCustomers } from '../../api/catalog'
import { errorMessage } from '../../api/client'
import { createSale, fetchSellableVariants } from '../../api/sales'
import type { PaymentMethod, Sale, SellableVariant } from '../../api/types'
import { ConfirmDialog } from '../../shared/ConfirmDialog'
import { formatAmount } from '../../shared/formatAmount'
import { LoadErrorCard } from '../../shared/LoadErrorCard'
import { PriceInput } from '../../shared/PriceInput'
import { formatStock } from '../../shared/presentation'
import { SearchInput } from '../../shared/SearchInput'
import { SelectMenu } from '../../shared/SelectMenu'
import { useLoad } from '../../shared/useLoad'
import { useToast } from '../../shared/useToast'
import { useAuth } from '../access/useAuth'
import {
  centsToAmount,
  discountCents,
  discountProblem,
  exceedsStock,
  lineTotalCents,
  matchesSearch,
  PAYMENT_METHOD_LABELS,
  PAYMENT_METHODS,
  quantityProblem,
  sanitizeQuantity,
  variantDescription,
} from './saleMath'

const MAX_SEARCH_RESULTS = 8
const SAVE_ERROR_MESSAGE = 'No se pudo registrar la venta. Intentá de nuevo.'
const NO_VARIANTS: SellableVariant[] = []

const inputClasses =
  'h-12 w-full rounded-lg border border-line bg-surface px-3 text-lg focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/10'

interface CartLine {
  variant: SellableVariant
  quantity: string
}

function displayName(variant: SellableVariant): string {
  const description = variantDescription(variant)
  return description ? `${variant.product_name} (${description})` : variant.product_name
}

function money(cents: number): string {
  return `$${formatAmount(centsToAmount(cents))}`
}

export function NewSalePanel() {
  const { account } = useAuth()
  const { showSuccess, showError } = useToast()
  const variantsLoad = useLoad(fetchSellableVariants, [account?.active_business_id])
  const customersLoad = useLoad(fetchCustomers, [account?.active_business_id])
  const variants = variantsLoad.data ?? NO_VARIANTS

  const [search, setSearch] = useState('')
  const [lines, setLines] = useState<CartLine[]>([])
  const [discount, setDiscount] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('efectivo')
  const [customerId, setCustomerId] = useState('')
  const [attempted, setAttempted] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [lastSale, setLastSale] = useState<Sale | null>(null)

  const searchResults = useMemo(
    () => (search.trim() === '' ? [] : variants.filter((variant) => matchesSearch(variant, search)).slice(0, MAX_SEARCH_RESULTS)),
    [variants, search],
  )
  const activeCustomers = (customersLoad.data ?? []).filter((customer) => customer.status === 'active')

  const subtotalCents = lines.reduce((sum, line) => sum + lineTotalCents(line.quantity, line.variant.price_amount), 0)
  const discountError = discountProblem(discount, subtotalCents)
  const totalCents = subtotalCents - (discountError === null ? discountCents(discount) : 0)
  const lineErrors = lines.map((line) => quantityProblem(line.quantity, line.variant.unit_allows_fraction))
  const customerError = paymentMethod === 'fiado' && customerId === '' ? 'Para vender en fiado elegí el cliente.' : null
  const emptyError = lines.length === 0 ? 'Agregá al menos un producto.' : null
  const canConfirm = emptyError === null && discountError === null && customerError === null && lineErrors.every((error) => error === null)

  function addVariant(variant: SellableVariant) {
    setLines((current) => {
      const existing = current.find((line) => line.variant.variant_id === variant.variant_id)
      if (existing === undefined) return [...current, { variant, quantity: '1' }]
      return current.map((line) =>
        line === existing && quantityProblem(line.quantity, variant.unit_allows_fraction) === null
          ? { ...line, quantity: String(Number(line.quantity) + 1) }
          : line,
      )
    })
    setSearch('')
    setLastSale(null)
  }

  function changeQuantity(variantId: number, raw: string) {
    setLines((current) =>
      current.map((line) =>
        line.variant.variant_id === variantId
          ? { ...line, quantity: sanitizeQuantity(raw, line.variant.unit_allows_fraction) }
          : line,
      ),
    )
  }

  function removeLine(variantId: number) {
    setLines((current) => current.filter((line) => line.variant.variant_id !== variantId))
  }

  function choosePaymentMethod(method: PaymentMethod) {
    setPaymentMethod(method)
    if (method !== 'fiado') setCustomerId('')
  }

  function requestConfirmation() {
    setAttempted(true)
    if (canConfirm) setConfirming(true)
  }

  async function confirmSale() {
    try {
      const sale = await createSale({
        lines: lines.map((line) => ({ variant_id: line.variant.variant_id, quantity: line.quantity })),
        payment_method: paymentMethod,
        customer_id: paymentMethod === 'fiado' ? Number(customerId) : undefined,
        discount: discount.trim() === '' ? '0' : discount,
      })
      setConfirming(false)
      setLines([])
      setDiscount('')
      setPaymentMethod('efectivo')
      setCustomerId('')
      setAttempted(false)
      setLastSale(sale)
      variantsLoad.reload()
      showSuccess(`Venta N° ${sale.id} registrada.`)
    } catch (error) {
      setConfirming(false)
      showError(errorMessage(error, SAVE_ERROR_MESSAGE))
    }
  }

  const shortLines = lastSale?.lines.filter((line) => line.insufficient_stock) ?? []

  return (
    <div className="flex flex-col gap-4">
      {lastSale !== null && lastSale.insufficient_stock && (
        <div role="alert" className="rounded-2xl border-2 border-warning bg-warning/10 p-4 text-lg">
          <p className="m-0 font-bold">Venta N° {lastSale.id} registrada sin stock suficiente</p>
          <p className="m-0 mt-1 [overflow-wrap:anywhere]">
            No alcanzaba el stock de {shortLines.map((line) => line.product_name).join(', ')}. El stock quedó en 0 y la
            venta quedó marcada para que alguien revise el inventario.
          </p>
        </div>
      )}

      <div className="flex flex-col gap-2 rounded-2xl bg-surface p-4 shadow-sm">
        <h2 className="m-0 text-xl font-bold">Buscar producto</h2>
        {variantsLoad.status === 'error' ? (
          <LoadErrorCard message="No se pudieron cargar los productos." onRetry={variantsLoad.reload} />
        ) : (
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Escribí el nombre del producto…"
            ariaLabel="Buscar producto para vender"
          />
        )}
        {searchResults.length > 0 && (
          <ul className="m-0 flex list-none flex-col gap-2 p-0" aria-label="Resultados de la búsqueda">
            {searchResults.map((variant) => (
              <li key={variant.variant_id}>
                <button
                  type="button"
                  onClick={() => addVariant(variant)}
                  aria-label={`Agregar ${displayName(variant)}`}
                  className="flex min-h-14 w-full flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-lg border border-line px-4 py-2 text-left text-lg transition-colors hover:bg-surface-brand"
                >
                  <span className="min-w-0 font-semibold [overflow-wrap:anywhere]">{displayName(variant)}</span>
                  <span className="flex flex-wrap gap-x-4">
                    <span className="font-bold">${formatAmount(variant.price_amount)}</span>
                    <span className="opacity-60">
                      Stock: {formatStock(variant.quantity, variant.presentation, variant.unit_abbreviation)}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {search.trim() !== '' && variantsLoad.status === 'success' && searchResults.length === 0 && (
          <p className="m-0 text-lg opacity-70">No hay productos con precio que coincidan con la búsqueda.</p>
        )}
      </div>

      <div className="flex flex-col gap-3 rounded-2xl bg-surface p-4 shadow-sm">
        <h2 className="m-0 text-xl font-bold">Productos de la venta</h2>
        {lines.length === 0 && <p className="m-0 text-lg opacity-70">Todavía no agregaste productos.</p>}
        {attempted && emptyError !== null && (
          <p role="alert" className="m-0 text-lg text-danger">
            {emptyError}
          </p>
        )}
        <ul className="m-0 flex list-none flex-col gap-3 p-0">
          {lines.map((line, index) => {
            const name = displayName(line.variant)
            const error = lineErrors[index]
            return (
              <li key={line.variant.variant_id} className="flex flex-col gap-2 rounded-lg border border-line p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <span className="min-w-0 text-lg font-semibold [overflow-wrap:anywhere]">{name}</span>
                  <button
                    type="button"
                    onClick={() => removeLine(line.variant.variant_id)}
                    aria-label={`Quitar ${name}`}
                    className="min-h-11 rounded-lg border border-line px-3 text-base font-semibold text-danger transition-colors hover:bg-danger/10"
                  >
                    Quitar
                  </button>
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  <label className="flex items-center gap-2">
                    <span className="text-base font-semibold">Cantidad</span>
                    <input
                      value={line.quantity}
                      onChange={(event) => changeQuantity(line.variant.variant_id, event.target.value)}
                      inputMode={line.variant.unit_allows_fraction ? 'decimal' : 'numeric'}
                      aria-label={`Cantidad de ${name}`}
                      aria-invalid={error !== null || undefined}
                      className="h-12 w-28 rounded-lg border border-line bg-surface px-3 text-lg focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/10"
                    />
                    <span className="text-lg">{line.variant.unit_abbreviation}</span>
                  </label>
                  <span className="text-lg opacity-70">× ${formatAmount(line.variant.price_amount)}</span>
                  <span className="ml-auto text-xl font-bold">
                    {money(lineTotalCents(line.quantity, line.variant.price_amount))}
                  </span>
                </div>
                {error !== null && (
                  <p role="alert" className="m-0 text-base text-danger">
                    {error}
                  </p>
                )}
                {error === null && exceedsStock(line.quantity, line.variant.quantity) && (
                  <p className="m-0 text-base font-semibold text-warning">
                    Hay {formatStock(line.variant.quantity, line.variant.presentation, line.variant.unit_abbreviation)} en
                    stock. Se vende igual y la venta queda marcada para revisar el inventario.
                  </p>
                )}
              </li>
            )
          })}
        </ul>
      </div>

      <div className="flex flex-col gap-4 rounded-2xl bg-surface p-4 shadow-sm">
        <label className="flex flex-col gap-1.5">
          <span className="text-base font-semibold">Descuento sobre el total (opcional)</span>
          <PriceInput
            value={discount}
            onChange={setDiscount}
            placeholder="0"
            ariaLabel="Descuento"
            className={`${inputClasses} pl-8`}
          />
        </label>
        {discountError !== null && (
          <p role="alert" className="m-0 text-base text-danger">
            {discountError}
          </p>
        )}

        <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
          <legend className="mb-2 text-base font-semibold">Forma de pago</legend>
          <div className="flex flex-wrap gap-2">
            {PAYMENT_METHODS.map((method) => (
              <button
                key={method}
                type="button"
                aria-pressed={paymentMethod === method}
                onClick={() => choosePaymentMethod(method)}
                className={`min-h-12 flex-1 rounded-lg border-2 px-4 text-lg font-bold transition-colors ${
                  paymentMethod === method ? 'border-brand bg-brand text-brand-contrast' : 'border-line hover:bg-surface-brand'
                }`}
              >
                {PAYMENT_METHOD_LABELS[method]}
              </button>
            ))}
          </div>
        </fieldset>

        {paymentMethod === 'fiado' && (
          <div className="flex flex-col gap-1.5">
            <span className="text-base font-semibold">Cliente</span>
            <SelectMenu
              value={customerId}
              onChange={setCustomerId}
              ariaLabel="Cliente del fiado"
              hasError={attempted && customerError !== null}
              options={[
                { value: '', label: 'Elegí el cliente' },
                ...activeCustomers.map((customer) => ({ value: String(customer.id), label: customer.name })),
              ]}
            />
            {attempted && customerError !== null && (
              <p role="alert" className="m-0 text-base text-danger">
                {customerError}
              </p>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-end justify-between gap-2 border-t border-line pt-4">
          <span className="text-2xl font-bold">Total</span>
          <span className="text-4xl font-bold [overflow-wrap:anywhere]" aria-label="Total de la venta">
            {money(totalCents)}
          </span>
        </div>

        <button
          type="button"
          onClick={requestConfirmation}
          className="min-h-14 rounded-lg bg-brand px-5 text-xl font-bold text-brand-contrast transition-colors hover:bg-brand/90"
        >
          Confirmar venta
        </button>
      </div>

      {confirming && (
        <ConfirmDialog
          title="Registrar venta"
          breadcrumb={['Ventas', 'Nueva venta']}
          description={`Total ${money(totalCents)} en ${PAYMENT_METHOD_LABELS[paymentMethod].toLowerCase()}${
            paymentMethod === 'fiado'
              ? ` a ${activeCustomers.find((customer) => String(customer.id) === customerId)?.name ?? ''}`
              : ''
          }.`}
          confirmLabel="Registrar"
          onConfirm={confirmSale}
          onCancel={() => setConfirming(false)}
        />
      )}
    </div>
  )
}
