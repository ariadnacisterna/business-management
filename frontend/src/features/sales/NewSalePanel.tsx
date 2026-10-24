import { useMemo, useRef, useState } from 'react'
import { fetchCustomers } from '../../api/catalog'
import { errorMessage } from '../../api/client'
import { createSale, fetchSellableVariants } from '../../api/sales'
import type { PaymentMethod, Sale, SellableVariant } from '../../api/types'
import { ConfirmDialog } from '../../shared/ConfirmDialog'
import { EmptyState } from '../../shared/EmptyState'
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
  percentDiscountCents,
  percentFromCents,
  percentProblem,
  PAYMENT_METHOD_LABELS,
  PAYMENT_METHODS,
  quantityProblem,
  sanitizePercent,
  sanitizeQuantity,
  stepQuantity,
  variantDescription,
} from './saleMath'

const MAX_SEARCH_RESULTS = 24
const SAVE_ERROR_MESSAGE = 'No se pudo registrar la venta. Intentá de nuevo.'
const NO_VARIANTS: SellableVariant[] = []
const CONSUMER_FINAL_LABEL = 'Consumidor final'
const FIADO_CUSTOMER_MESSAGE = 'Para vender en fiado elegí el cliente.'

const inputClasses =
  'h-14 w-full rounded-lg border border-line bg-surface px-3 text-lg focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/10'

const stepButtonClasses =
  'flex h-14 w-14 items-center justify-center rounded-lg border border-line text-lg font-bold transition-colors hover:bg-surface-brand'

const lineGridClasses = 'md:grid md:grid-cols-[minmax(0,1fr)_14rem_4.5rem_8.5rem_3rem] md:items-center md:gap-x-2'

interface CartLine {
  variant: SellableVariant
  quantity: string
}

type DiscountMode = 'pesos' | 'percent'

function displayName(variant: SellableVariant): string {
  const description = variantDescription(variant)
  return description ? `${variant.product_name} (${description})` : variant.product_name
}

function money(cents: number): string {
  return `$${formatAmount(centsToAmount(cents))}`
}

function CartIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-10 w-10 opacity-40"
    >
      <circle cx="9" cy="20" r="1.5" />
      <circle cx="18" cy="20" r="1.5" />
      <path d="M2 3h3l2.5 12h11l2-8H6" />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-6 w-6"
    >
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M6 6l1 14h10l1-14" />
    </svg>
  )
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
  const [discountMode, setDiscountMode] = useState<DiscountMode>('pesos')
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('efectivo')
  const [customerId, setCustomerId] = useState('')
  const [attempted, setAttempted] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [lastSale, setLastSale] = useState<Sale | null>(null)
  const ticketRef = useRef<HTMLDivElement>(null)

  const searchResults = useMemo(
    () => variants.filter((variant) => search.trim() === '' || matchesSearch(variant, search)),
    [variants, search],
  )
  const shownResults = searchResults.slice(0, MAX_SEARCH_RESULTS)
  const activeCustomers = (customersLoad.data ?? []).filter((customer) => customer.status === 'active')

  const subtotalCents = lines.reduce((sum, line) => sum + lineTotalCents(line.quantity, line.variant.price_amount), 0)
  const discountError = discountMode === 'pesos' ? discountProblem(discount, subtotalCents) : percentProblem(discount)
  const discountAppliedCents =
    discountError !== null
      ? 0
      : discountMode === 'pesos'
        ? discountCents(discount)
        : percentDiscountCents(discount, subtotalCents)
  const totalCents = subtotalCents - discountAppliedCents
  const otherFieldCents = discountError === null && discount.trim() !== '' ? discountAppliedCents : 0
  const pesosText =
    discountMode === 'pesos' ? discount : discount.trim() === '' || discountError !== null ? '' : centsToAmount(otherFieldCents)
  const percentText =
    discountMode === 'percent'
      ? discount
      : discount.trim() === '' || discountError !== null
        ? ''
        : percentFromCents(otherFieldCents, subtotalCents)
  const lineErrors = lines.map((line) => quantityProblem(line.quantity, line.variant.unit_allows_fraction))
  const customerError = paymentMethod === 'fiado' && customerId === '' ? FIADO_CUSTOMER_MESSAGE : null
  const emptyError = lines.length === 0 ? 'Agregá al menos un producto.' : null
  const canConfirm =
    emptyError === null &&
    discountError === null &&
    customerError === null &&
    lineErrors.every((error) => error === null)

  function addVariant(variant: SellableVariant) {
    setLines((current) => {
      const existing = current.find((line) => line.variant.variant_id === variant.variant_id)
      if (existing === undefined) return [...current, { variant, quantity: '1' }]
      return current.map((line) =>
        line === existing ? { ...line, quantity: stepQuantity(line.quantity, 1) ?? line.quantity } : line,
      )
    })
    setSearch('')
    setLastSale(null)
  }

  function stepLine(variantId: number, delta: number) {
    setLines((current) =>
      current.map((line) =>
        line.variant.variant_id === variantId
          ? { ...line, quantity: stepQuantity(line.quantity, delta) ?? line.quantity }
          : line,
      ),
    )
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

  function clearTicket() {
    setLines([])
    setDiscount('')
    setDiscountMode('pesos')
    setPaymentMethod('efectivo')
    setCustomerId('')
    setAttempted(false)
  }

  function showTicket() {
    ticketRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
  }

  function changePesos(value: string) {
    setDiscountMode('pesos')
    setDiscount(value)
  }

  function changePercent(raw: string) {
    setDiscountMode('percent')
    setDiscount(sanitizePercent(raw))
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
        discount: discountAppliedCents === 0 ? '0' : centsToAmount(discountAppliedCents),
      })
      setConfirming(false)
      clearTicket()
      setLastSale(sale)
      variantsLoad.reload()
      showSuccess(`Venta N° ${sale.id} registrada.`)
    } catch (error) {
      setConfirming(false)
      showError(errorMessage(error, SAVE_ERROR_MESSAGE))
    }
  }

  const shortLines = lastSale?.lines.filter((line) => line.insufficient_stock) ?? []
  const activeCustomerName = activeCustomers.find((customer) => String(customer.id) === customerId)?.name

  return (
    <div className="flex flex-col gap-4 pb-28 lg:pb-0">
      {lastSale !== null && lastSale.insufficient_stock && (
        <div role="alert" className="rounded-2xl border-2 border-warning bg-warning/10 p-4 text-lg">
          <p className="m-0 font-bold">Venta N° {lastSale.id} registrada sin stock suficiente</p>
          <p className="m-0 mt-1 [overflow-wrap:anywhere]">
            No alcanzaba el stock de {shortLines.map((line) => line.product_name).join(', ')}. El stock quedó en 0 y la
            venta quedó marcada para que alguien revise el inventario.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:gap-x-8">
        <div className="flex min-w-0 flex-col gap-4">
          <section className="flex flex-col gap-4 rounded-2xl bg-surface p-3 shadow-sm" aria-label="Productos">
            <h2 className="m-0 text-2xl font-bold">Buscar producto</h2>
            <p className="m-0 text-lg opacity-60">Escribí el nombre del producto</p>
            {variantsLoad.status === 'error' ? (
              <LoadErrorCard message="No se pudieron cargar los productos." onRetry={variantsLoad.reload} />
            ) : (
              <SearchInput
                value={search}
                onChange={setSearch}
                placeholder="Buscar producto"
                ariaLabel="Buscar producto para vender"
                className="[&_input]:h-14 [&_input]:text-lg"
              />
            )}
            {search.trim() !== '' && (
              <>
                {shownResults.length > 0 && (
                  <ul
                    className="m-0 grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2 2xl:grid-cols-3"
                    aria-label="Resultados de la búsqueda"
                  >
                    {shownResults.map((variant) => {
                      const inTicket = lines.some((line) => line.variant.variant_id === variant.variant_id)
                      return (
                        <li key={variant.variant_id} className="flex">
                          <button
                            type="button"
                            onClick={() => addVariant(variant)}
                            aria-label={`Agregar ${displayName(variant)}`}
                            className={`flex h-full w-full flex-col gap-2 rounded-xl border bg-surface p-3 text-left transition-colors hover:bg-surface-brand ${
                              inTicket ? 'border-2 border-brand' : 'border-line'
                            }`}
                          >
                            <span className="text-xl font-bold leading-tight [overflow-wrap:anywhere]">
                              {variant.product_name}
                            </span>
                            <span className="text-lg opacity-60 [overflow-wrap:anywhere]">
                              {variantDescription(variant)}
                            </span>
                            <span className="mt-auto flex flex-col gap-2">
                              <span className="text-2xl font-bold text-brand">${formatAmount(variant.price_amount)}</span>
                              <span className="border-t border-line pt-2 text-lg">
                                Stock: {formatStock(variant.quantity, variant.presentation, variant.unit_abbreviation)}
                              </span>
                            </span>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                )}
                {searchResults.length > MAX_SEARCH_RESULTS && (
                  <p className="m-0 text-lg opacity-70">Escribí más del nombre para ver el resto de los productos.</p>
                )}
                {variantsLoad.status === 'success' && variants.length > 0 && searchResults.length === 0 && (
                  <p className="m-0 text-lg opacity-70">No hay productos con precio que coincidan con la búsqueda.</p>
                )}
              </>
            )}
            {variantsLoad.status === 'success' && variants.length === 0 && (
              <p className="m-0 text-lg opacity-70">No hay productos con precio para vender.</p>
            )}
          </section>

          <div
            ref={ticketRef}
            role="region"
            aria-label="Carrito"
            className="flex scroll-mt-4 flex-col gap-4 rounded-2xl bg-surface p-4 shadow-sm"
          >
            <h2 className="m-0 text-2xl font-bold">Carrito</h2>
            {lines.length === 0 ? (
              <EmptyState
                icon={<CartIcon />}
                title="El carrito está vacío"
                description="Buscá un producto para agregarlo."
              />
            ) : (
              <ul className="m-0 flex list-none flex-col p-0">
                {lines.map((line, index) => {
                  const name = displayName(line.variant)
                  const description = variantDescription(line.variant)
                  const error = lineErrors[index]
                  const shortStock = error === null && exceedsStock(line.quantity, line.variant.quantity)
                  return (
                    <li
                      key={line.variant.variant_id}
                      className={`flex flex-wrap items-center gap-x-2 gap-y-2 border-b border-line-soft py-3 last:border-b-0 ${lineGridClasses}`}
                    >
                      <div className="min-w-0 w-full md:w-auto">
                        <p className="m-0 text-lg font-bold leading-tight [overflow-wrap:anywhere]">
                          {line.variant.product_name}
                        </p>
                        <p className="m-0 text-lg opacity-60 [overflow-wrap:anywhere]">
                          {[description, `$${formatAmount(line.variant.price_amount)} c/u`]
                            .filter((part) => part !== '')
                            .join(' · ')}
                        </p>
                        {shortStock && (
                          <p className="m-0 text-base font-semibold text-warning">
                            Stock insuficiente: hay{' '}
                            {formatStock(line.variant.quantity, line.variant.presentation, line.variant.unit_abbreviation)}.
                            Se vende igual.
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => stepLine(line.variant.variant_id, -1)}
                          aria-label={`Restar uno a ${name}`}
                          className={stepButtonClasses}
                        >
                          −
                        </button>
                        <input
                          value={line.quantity}
                          onChange={(event) => changeQuantity(line.variant.variant_id, event.target.value)}
                          inputMode={line.variant.unit_allows_fraction ? 'decimal' : 'numeric'}
                          aria-label={`Cantidad de ${name}`}
                          aria-invalid={error !== null || undefined}
                          className="h-14 w-20 rounded-lg border border-line bg-surface px-2 text-center text-lg font-bold focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/10"
                        />
                        <button
                          type="button"
                          onClick={() => stepLine(line.variant.variant_id, 1)}
                          aria-label={`Sumar uno a ${name}`}
                          className={stepButtonClasses}
                        >
                          +
                        </button>
                      </div>
                      <span className="text-left text-lg">{line.variant.unit_abbreviation}</span>
                      <span className="text-right text-lg font-bold text-brand">
                        {money(lineTotalCents(line.quantity, line.variant.price_amount))}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeLine(line.variant.variant_id)}
                        aria-label={`Quitar ${name}`}
                        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg text-danger transition-colors hover:bg-danger/10"
                      >
                        <TrashIcon />
                      </button>
                      {error !== null && (
                        <p role="alert" className="m-0 w-full text-lg text-danger md:col-span-full">
                          {error}
                        </p>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
            {attempted && emptyError !== null && (
              <p role="alert" className="m-0 text-lg text-danger">
                {emptyError}
              </p>
            )}
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <section className="flex flex-col gap-3 rounded-2xl bg-surface p-4 shadow-sm" aria-label="Cliente">
            <h2 className="m-0 text-2xl font-bold">Cliente</h2>
            <SelectMenu
              value={customerId}
              onChange={setCustomerId}
              ariaLabel="Cliente"
              hasError={customerError !== null}
              options={[
                { value: '', label: CONSUMER_FINAL_LABEL },
                ...activeCustomers.map((customer) => ({ value: String(customer.id), label: customer.name })),
              ]}
            />
            {customerError !== null && (
              <p role="alert" className="m-0 text-lg text-danger">
                {customerError}
              </p>
            )}
          </section>

          <section className="flex flex-col gap-4 rounded-2xl bg-surface p-4 shadow-sm" aria-label="Resumen">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="m-0 text-2xl font-bold">Resumen</h2>
              <span className="text-lg opacity-60">
                {lines.length} {lines.length === 1 ? 'producto' : 'productos'}
              </span>
            </div>

            <div className="flex flex-col gap-4 border-t border-line pt-4">
              <div className="flex items-center justify-between gap-3">
                <span className="text-lg font-semibold">Descuento</span>
                <div className="grid w-64 max-w-full grid-cols-2 gap-2">
                  <div className="flex min-w-0 flex-col">
                    <PriceInput
                      value={pesosText}
                      onChange={changePesos}
                      placeholder="0"
                      ariaLabel="Descuento en pesos"
                      className={`${inputClasses} pl-8`}
                    />
                  </div>
                  <div className="flex min-w-0 flex-col">
                    <div className="relative">
                      <input
                        value={percentText}
                        onChange={(event) => changePercent(event.target.value)}
                        inputMode="decimal"
                        placeholder="0"
                        aria-label="Descuento en porcentaje"
                        className={`${inputClasses} pr-8`}
                      />
                      <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-lg font-bold opacity-60">
                        %
                      </span>
                    </div>
                  </div>
                </div>
              </div>
              {discountError !== null && (
                <p role="alert" className="m-0 text-lg text-danger">
                  {discountError}
                </p>
              )}
              <div className="flex items-baseline justify-between gap-2 text-lg">
                <span className="font-semibold">Subtotal</span>
                <span>{money(subtotalCents)}</span>
              </div>
              <div className="flex flex-wrap items-end justify-between gap-2">
                <span className="text-xl font-bold">Total</span>
                <span className="text-xl font-bold text-brand [overflow-wrap:anywhere]" aria-label="Total de la venta">
                  {money(totalCents)}
                </span>
              </div>
            </div>

            <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
              <legend className="mb-2 text-lg font-semibold">Forma de pago</legend>
              <div className="grid grid-cols-2 gap-2">
                {PAYMENT_METHODS.map((method, index) => (
                  <button
                    key={method}
                    type="button"
                    aria-pressed={paymentMethod === method}
                    onClick={() => choosePaymentMethod(method)}
                    className={`min-h-14 min-w-0 whitespace-nowrap rounded-lg border px-2 text-lg font-bold transition-colors ${
                      index === PAYMENT_METHODS.length - 1 ? 'col-span-2' : ''
                    } ${
                      paymentMethod === method
                        ? 'border-brand bg-surface-brand text-brand'
                        : 'border-line hover:bg-surface-brand'
                    }`}
                  >
                    {PAYMENT_METHOD_LABELS[method]}
                  </button>
                ))}
              </div>
            </fieldset>

            <button
              type="button"
              onClick={requestConfirmation}
              disabled={customerError !== null}
              className="min-h-14 rounded-lg bg-brand px-5 text-lg font-bold text-brand-contrast transition-colors hover:bg-brand/90 disabled:opacity-40"
            >
              Confirmar venta
            </button>
            <button
              type="button"
              onClick={clearTicket}
              disabled={lines.length === 0 && discount === ''}
              className="min-h-14 rounded-lg border border-line px-4 text-lg font-bold transition-colors hover:bg-surface-brand disabled:opacity-40"
            >
              Vaciar carrito
            </button>
          </section>
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-10 flex items-center justify-between gap-3 border-t border-line bg-surface px-4 py-3 shadow-lg lg:hidden">
        <div className="min-w-0">
          <p className="m-0 text-base opacity-70">
            {lines.length} {lines.length === 1 ? 'producto' : 'productos'}
          </p>
          <p className="m-0 text-2xl font-bold [overflow-wrap:anywhere]">{money(totalCents)}</p>
        </div>
        <button
          type="button"
          onClick={showTicket}
          className="min-h-14 shrink-0 rounded-lg bg-brand px-5 text-xl font-bold text-brand-contrast transition-colors hover:bg-brand/90"
        >
          Ver carrito
        </button>
      </div>

      {confirming && (
        <ConfirmDialog
          title="Registrar venta"
          breadcrumb={['Ventas', 'Venta']}
          description={`Total ${money(totalCents)} en ${PAYMENT_METHOD_LABELS[paymentMethod].toLowerCase()}${
            paymentMethod === 'fiado' && activeCustomerName !== undefined ? ` a ${activeCustomerName}` : ''
          }.`}
          confirmLabel="Registrar"
          onConfirm={confirmSale}
          onCancel={() => setConfirming(false)}
        />
      )}
    </div>
  )
}
