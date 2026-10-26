import { useRef, useState } from 'react'
import { fetchCustomers } from '../../api/catalog'
import { errorMessage } from '../../api/client'
import { createSale, fetchSellableVariants, type NewSaleLine } from '../../api/sales'
import type { Sale, SellableVariant } from '../../api/types'
import { EmptyState } from '../../shared/EmptyState'
import { formatAmount } from '../../shared/formatAmount'
import { LoadErrorCard } from '../../shared/LoadErrorCard'
import { formatStock } from '../../shared/presentation'
import { useLoad } from '../../shared/useLoad'
import { useToast } from '../../shared/useToast'
import { useAuth } from '../access/useAuth'
import { CheckoutDialog, type CheckoutLine, type CheckoutResult } from './CheckoutDialog'
import { DiscountFields } from './DiscountFields'
import { ProductPicker } from './ProductPicker'
import { useScrollbar } from '../../shared/useScrollbar'
import { FreeAmountDialog, PriceCheckDialog, SaleRegisteredDialog } from './SaleDialogs'
import {
  amountCents,
  centsToAmount,
  discountCents,
  discountProblem,
  exceedsStock,
  lineTotalCents,
  percentDiscountCents,
  percentFromCents,
  percentProblem,
  quantityProblem,
  sanitizePercent,
  sanitizeQuantity,
  stepQuantity,
  variantDescription,
} from './saleMath'

const SAVE_ERROR_MESSAGE = 'No se pudo registrar la venta. Intentá de nuevo.'
const NO_VARIANTS: SellableVariant[] = []

const stepButtonClasses =
  'flex h-14 w-14 items-center justify-center rounded-lg border border-line text-lg font-bold transition-colors hover:bg-surface-brand'

const searchToolButtonClasses =
  'flex min-h-14 min-w-0 flex-1 items-center justify-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-center text-lg font-medium text-ink transition-colors hover:bg-surface-brand sm:flex-none'

const lineGridClasses = 'md:grid md:grid-cols-[minmax(0,1fr)_14rem_4.5rem_8.5rem_3rem] md:items-center md:gap-x-2'

interface ProductLine {
  kind: 'product'
  key: string
  variant: SellableVariant
  quantity: string
}

interface FreeLine {
  kind: 'free'
  key: string
  description: string
  amount: string
}

type CartLine = ProductLine | FreeLine

type DiscountMode = 'pesos' | 'percent'

type OpenDialog = 'none' | 'price' | 'free' | 'checkout'

function displayName(variant: SellableVariant): string {
  const description = variantDescription(variant)
  return description ? `${variant.product_name} (${description})` : variant.product_name
}

function money(cents: number): string {
  return formatAmount(centsToAmount(cents))
}

function cartLineCents(line: CartLine): number {
  return line.kind === 'product' ? lineTotalCents(line.quantity, line.variant.price_amount) : amountCents(line.amount)
}

function cartLineName(line: CartLine): string {
  return line.kind === 'product' ? displayName(line.variant) : line.description
}

function checkoutLine(line: CartLine): CheckoutLine {
  const detail =
    line.kind === 'product'
      ? `${line.quantity} ${line.variant.unit_abbreviation} × ${formatAmount(line.variant.price_amount)}`
      : 'Monto libre'
  return { key: line.key, name: cartLineName(line), detail, totalCents: cartLineCents(line) }
}

function requestLine(line: CartLine): NewSaleLine {
  return line.kind === 'product'
    ? { variant_id: line.variant.variant_id, quantity: line.quantity }
    : { description: line.description, amount: line.amount }
}

function PriceIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
    >
      <line x1="12" y1="2" x2="12" y2="22" />
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  )
}

function PlusIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
    >
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  )
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
  const { showError } = useToast()
  const variantsLoad = useLoad(fetchSellableVariants, [account?.active_business_id])
  const customersLoad = useLoad(fetchCustomers, [account?.active_business_id])
  const variants = variantsLoad.data ?? NO_VARIANTS

  const [lines, setLines] = useState<CartLine[]>([])
  const [discount, setDiscount] = useState('')
  const [discountMode, setDiscountMode] = useState<DiscountMode>('pesos')
  const [dialog, setDialog] = useState<OpenDialog>('none')
  const [registeredSale, setRegisteredSale] = useState<Sale | null>(null)
  const ticketRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const freeKeyRef = useRef(0)

  const activeCustomers = (customersLoad.data ?? []).filter((customer) => customer.status === 'active')

  const subtotalCents = lines.reduce((sum, line) => sum + cartLineCents(line), 0)
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
  const lineErrors = lines.map((line) =>
    line.kind === 'product' ? quantityProblem(line.quantity, line.variant.unit_allows_fraction) : null,
  )
  const canConfirm = lines.length > 0 && discountError === null && lineErrors.every((error) => error === null)
  const productIds = lines.flatMap((line) => (line.kind === 'product' ? [line.variant.variant_id] : []))

  function addVariant(variant: SellableVariant) {
    setLines((current) => {
      const existing = current.find(
        (line): line is ProductLine => line.kind === 'product' && line.variant.variant_id === variant.variant_id,
      )
      if (existing === undefined) {
        return [...current, { kind: 'product', key: `v${variant.variant_id}`, variant, quantity: '1' }]
      }
      return current.map((line) =>
        line === existing ? { ...existing, quantity: stepQuantity(existing.quantity, 1) ?? existing.quantity } : line,
      )
    })
  }

  function addFreeAmount(description: string, amount: string) {
    freeKeyRef.current += 1
    setLines((current) => [...current, { kind: 'free', key: `f${freeKeyRef.current}`, description, amount }])
    setDialog('none')
  }

  function updateProductLine(key: string, change: (line: ProductLine) => ProductLine) {
    setLines((current) => current.map((line) => (line.key === key && line.kind === 'product' ? change(line) : line)))
  }

  function stepLine(key: string, delta: number) {
    updateProductLine(key, (line) => ({ ...line, quantity: stepQuantity(line.quantity, delta) ?? line.quantity }))
  }

  function changeQuantity(key: string, raw: string) {
    updateProductLine(key, (line) => ({ ...line, quantity: sanitizeQuantity(raw, line.variant.unit_allows_fraction) }))
  }

  function removeLine(key: string) {
    setLines((current) => current.filter((line) => line.key !== key))
  }

  function clearTicket() {
    setLines([])
    setDiscount('')
    setDiscountMode('pesos')
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

  function requestConfirmation() {
    if (canConfirm) setDialog('checkout')
  }

  async function confirmSale(result: CheckoutResult) {
    try {
      const sale = await createSale({
        lines: lines.map(requestLine),
        payments: result.payments,
        customer_id: result.customerId,
        discount: discountAppliedCents === 0 ? '0' : centsToAmount(discountAppliedCents),
      })
      setDialog('none')
      clearTicket()
      setRegisteredSale(sale)
      variantsLoad.reload()
    } catch (error) {
      showError(errorMessage(error, SAVE_ERROR_MESSAGE))
    }
  }

  function startNewSale() {
    setRegisteredSale(null)
    window.setTimeout(() => searchRef.current?.focus(), 0)
  }

  const {
    scrollRef: cartScrollRef,
    scrollbar: cartScrollbar,
    updateScrollbar: updateCartScrollbar,
    handleThumbPointerDown: handleCartThumbPointerDown,
  } = useScrollbar([lines.length])

  return (
    <div className="flex flex-col gap-4 pb-28 lg:min-h-0 lg:flex-1 lg:pb-0">
      <div className="grid grid-cols-1 items-start gap-4 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:grid-rows-[minmax(0,1fr)] lg:items-stretch lg:gap-x-8">
        <div className="flex min-w-0 flex-col gap-4 lg:min-h-0">
          <section className="flex flex-col gap-4 rounded-2xl bg-surface p-3 shadow-sm" aria-label="Productos">
            <h2 className="m-0 text-window-title">Buscar producto</h2>
            <p className="m-0 text-secondary">Escribí el nombre y elegilo de la lista con el mouse o con las flechas y Enter</p>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
              <div className="min-w-0 flex-1">
                {variantsLoad.status === 'error' ? (
                  <LoadErrorCard message="No se pudieron cargar los productos." onRetry={variantsLoad.reload} />
                ) : (
                  <ProductPicker
                    variants={variants}
                    onPick={addVariant}
                    ariaLabel="Buscar producto para vender"
                    placeholder="Buscar producto"
                    optionLabel={(variant) => `Agregar ${displayName(variant)}`}
                    inputRef={searchRef}
                    selectedIds={productIds}
                  />
                )}
              </div>
              <div className="grid shrink-0 grid-cols-2 gap-2 sm:flex">
                <button type="button" onClick={() => setDialog('price')} className={searchToolButtonClasses}>
                  <PriceIcon />
                  Consultar precio
                </button>
                <button type="button" onClick={() => setDialog('free')} className={searchToolButtonClasses}>
                  <PlusIcon />
                  Agregar monto
                </button>
              </div>
            </div>
            {variantsLoad.status === 'success' && variants.length === 0 && (
              <p className="m-0 text-lg opacity-70">No hay productos con precio para vender.</p>
            )}
          </section>

          <div
            ref={ticketRef}
            role="region"
            aria-label="Carrito"
            className="flex scroll-mt-4 flex-col gap-4 rounded-2xl bg-surface p-4 shadow-sm lg:min-h-0 lg:flex-1 lg:overflow-hidden"
          >
            <h2 className="m-0 text-window-title">Carrito</h2>
            <div className="relative flex min-h-0 flex-col lg:flex-1">
            <div
              ref={cartScrollRef}
              onScroll={updateCartScrollbar}
              className={`scrollbar-hidden lg:absolute lg:inset-0 lg:overflow-y-auto ${cartScrollbar.visible ? 'lg:pr-5' : ''}`}
            >
            <div className="flex flex-col gap-4">
            {lines.length === 0 ? (
              <EmptyState
                icon={<CartIcon />}
                title="El carrito está vacío"
                description="Buscá un producto para agregarlo."
              />
            ) : (
              <ul className="m-0 flex list-none flex-col p-0">
                {lines.map((line, index) => {
                  const name = cartLineName(line)
                  const error = lineErrors[index]
                  if (line.kind === 'free') {
                    return (
                      <li
                        key={line.key}
                        className={`flex flex-wrap items-center gap-x-2 gap-y-2 border-b border-line-soft py-3 last:border-b-0 ${lineGridClasses}`}
                      >
                        <div className="min-w-0 w-full md:col-span-3 md:w-auto">
                          <p className="m-0 text-lg font-bold leading-tight [overflow-wrap:anywhere]">{line.description}</p>
                          <p className="m-0 text-secondary">Monto libre</p>
                        </div>
                        <span className="ml-auto text-right text-lg font-bold text-brand md:ml-0">{money(cartLineCents(line))}</span>
                        <button
                          type="button"
                          onClick={() => removeLine(line.key)}
                          aria-label={`Quitar ${name}`}
                          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg text-danger transition-colors hover:bg-danger/10"
                        >
                          <TrashIcon />
                        </button>
                      </li>
                    )
                  }
                  const description = variantDescription(line.variant)
                  const shortStock = error === null && exceedsStock(line.quantity, line.variant.quantity)
                  return (
                    <li
                      key={line.key}
                      className={`flex flex-wrap items-center gap-x-2 gap-y-2 border-b border-line-soft py-3 last:border-b-0 ${lineGridClasses}`}
                    >
                      <div className="min-w-0 w-full md:w-auto">
                        <p className="m-0 text-lg font-bold leading-tight [overflow-wrap:anywhere]">
                          {line.variant.product_name}
                        </p>
                        <p className="m-0 text-secondary [overflow-wrap:anywhere]">
                          {[description, `${formatAmount(line.variant.price_amount)} c/u`]
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
                          onClick={() => stepLine(line.key, -1)}
                          aria-label={`Restar uno a ${name}`}
                          className={stepButtonClasses}
                        >
                          −
                        </button>
                        <input
                          value={line.quantity}
                          onChange={(event) => changeQuantity(line.key, event.target.value)}
                          inputMode={line.variant.unit_allows_fraction ? 'decimal' : 'numeric'}
                          aria-label={`Cantidad de ${name}`}
                          aria-invalid={error !== null || undefined}
                          className="h-14 w-20 rounded-lg border border-line bg-surface px-2 text-center text-lg font-bold focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/10"
                        />
                        <button
                          type="button"
                          onClick={() => stepLine(line.key, 1)}
                          aria-label={`Sumar uno a ${name}`}
                          className={stepButtonClasses}
                        >
                          +
                        </button>
                      </div>
                      <span className="text-left text-lg">{line.variant.unit_abbreviation}</span>
                      <span className="text-right text-lg font-bold text-brand">{money(cartLineCents(line))}</span>
                      <button
                        type="button"
                        onClick={() => removeLine(line.key)}
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
            </div>
            </div>
            {cartScrollbar.visible && (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute right-0 top-0 hidden w-3 rounded-full bg-line/40 lg:block"
                style={{ bottom: 0 }}
              >
                <div
                  onPointerDown={handleCartThumbPointerDown}
                  onMouseDown={(event) => event.preventDefault()}
                  className="pointer-events-auto absolute right-0 w-3 cursor-grab rounded-full bg-brand active:cursor-grabbing"
                  style={{ top: cartScrollbar.thumbTop, height: cartScrollbar.thumbHeight }}
                />
              </div>
            )}
            </div>
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <section className="flex flex-col gap-4 rounded-2xl bg-surface p-4 shadow-sm" aria-label="Resumen">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="m-0 text-window-title">Resumen</h2>
              <span className="text-lg opacity-60">
                {lines.length} {lines.length === 1 ? 'línea' : 'líneas'}
              </span>
            </div>

            <div className="flex flex-col gap-4 border-t border-line pt-4">
              <div className="flex items-center justify-between gap-3">
                <span className="text-lg font-semibold">Descuento</span>
                <DiscountFields pesosText={pesosText} percentText={percentText} onChangePesos={changePesos} onChangePercent={changePercent} />
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
                <span className="text-card-title">Total</span>
                <span className="text-card-title text-brand [overflow-wrap:anywhere]" aria-label="Total de la venta">
                  {money(totalCents)}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={requestConfirmation}
              disabled={lines.length === 0}
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
            {lines.length} {lines.length === 1 ? 'línea' : 'líneas'}
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

      {dialog === 'price' && <PriceCheckDialog variants={variants} onClose={() => setDialog('none')} />}
      {dialog === 'free' && <FreeAmountDialog onAdd={addFreeAmount} onClose={() => setDialog('none')} />}
      {dialog === 'checkout' && (
        <CheckoutDialog
          lines={lines.map(checkoutLine)}
          subtotalCents={subtotalCents}
          discountError={discountError}
          pesosText={pesosText}
          percentText={percentText}
          onChangePesos={changePesos}
          onChangePercent={changePercent}
          totalCents={totalCents}
          customers={activeCustomers}
          onConfirm={confirmSale}
          onCancel={() => setDialog('none')}
        />
      )}
      {registeredSale !== null && <SaleRegisteredDialog sale={registeredSale} onNewSale={startNewSale} />}
    </div>
  )
}
