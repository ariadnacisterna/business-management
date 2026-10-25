import { useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import type { Customer, PaymentMethod, SalePayment } from '../../api/types'
import { canManageCustomers } from '../access/roles'
import { useAuth } from '../access/useAuth'
import { useScrollbar } from '../../shared/useScrollbar'
import { NewCustomerDialog } from './NewCustomerDialog'
import { PriceInput } from '../../shared/PriceInput'
import { SelectMenu } from '../../shared/SelectMenu'
import {
  cashCents,
  changeCents,
  EMPTY_SPLIT,
  includesFiado,
  paymentPlan,
  type PaymentMode,
  type SplitAmounts,
} from './checkoutMath'
import { fieldClasses, primaryButtonClasses, SaleDialogShell, secondaryButtonClasses } from './SaleDialogs'
import { centsToAmount, PAYMENT_METHOD_LABELS, PAYMENT_METHODS } from './saleMath'
import { formatMoney } from '../../shared/formatPrice'

const NEW_CUSTOMER_VALUE = '__new_customer__'
const FIADO_CUSTOMER_MESSAGE = 'Para vender en fiado elegí el cliente.'

export interface CheckoutLine {
  key: string
  name: string
  detail: string
  totalCents: number
}

export interface CheckoutResult {
  payments: SalePayment[]
  customerId: number | undefined
}

interface Props {
  lines: CheckoutLine[]
  subtotalCents: number
  discountCents: number
  totalCents: number
  customers: Customer[]
  onConfirm: (result: CheckoutResult) => Promise<void>
  onCancel: () => void
}

function money(cents: number): string {
  return formatMoney(cents / 100)
}

export function CheckoutDialog({ lines, subtotalCents, discountCents, totalCents, customers, onConfirm, onCancel }: Props) {
  const [mode, setMode] = useState<PaymentMode>('single')
  const [singleMethod, setSingleMethod] = useState<PaymentMethod>('efectivo')
  const [split, setSplit] = useState<SplitAmounts>(EMPTY_SPLIT)
  const [paidWith, setPaidWith] = useState('')
  const [customerId, setCustomerId] = useState('')
  const [attempted, setAttempted] = useState(false)
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)
  const { account } = useAuth()
  const canCreateCustomer = canManageCustomers(account)
  const [createdCustomers, setCreatedCustomers] = useState<Customer[]>([])
  const [creatingCustomer, setCreatingCustomer] = useState(false)
  const { scrollRef, scrollbar, updateScrollbar, handleThumbPointerDown } = useScrollbar([lines.length])
  const allCustomers = [...customers, ...createdCustomers]

  const plan = paymentPlan(mode, singleMethod, split, totalCents, PAYMENT_METHODS)
  const cash = cashCents(plan)
  const fiado = includesFiado(plan)
  const change = cash > 0 ? changeCents(paidWith, cash) : null
  const customerError = fiado && customerId === '' ? FIADO_CUSTOMER_MESSAGE : null
  const problem = plan.problem ?? customerError

  function chooseCustomer(value: string) {
    if (value === NEW_CUSTOMER_VALUE) {
      setCreatingCustomer(true)
      return
    }
    setCustomerId(value)
  }

  function handleCustomerCreated(customer: Customer) {
    setCreatedCustomers((current) => [...current, customer])
    setCustomerId(String(customer.id))
    setCreatingCustomer(false)
  }

  function toggleMode() {
    if (mode === 'single') {
      setSplit(EMPTY_SPLIT)
      setMode('split')
      return
    }
    setMode('single')
  }

  function changeSplit(method: PaymentMethod, value: string) {
    setSplit((current) => ({ ...current, [method]: value }))
  }

  async function submit(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault()
    setAttempted(true)
    if (problem !== null || savingRef.current) return
    savingRef.current = true
    setSaving(true)
    try {
      await onConfirm({
        payments: plan.parts.map((part) => ({ method: part.method, amount: centsToAmount(part.cents) })),
        customerId: fiado ? Number(customerId) : undefined,
      })
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key !== 'Enter' || event.defaultPrevented) return
    const target = event.target as HTMLElement
    if (target.closest('[role="dialog"]') !== target && !target.hasAttribute('aria-pressed')) return
    event.preventDefault()
    void submit()
  }

  return (
    <>
    <SaleDialogShell title="Confirmar venta" onClose={onCancel} onSubmit={submit} onKeyDown={handleKeyDown} widthClass="max-w-5xl">
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 md:gap-6">
        <section aria-label="Resumen de la venta" className="flex min-w-0 flex-col gap-3">
          <h3 className="m-0 text-xl font-bold">Resumen</h3>
          <div className="relative">
          <div
            ref={scrollRef}
            onScroll={updateScrollbar}
            className={`scrollbar-hidden max-h-[40vh] overflow-y-auto ${scrollbar.visible ? 'pr-5' : ''}`}
          >
          <ul className="m-0 flex list-none flex-col p-0">
            {lines.map((line) => (
              <li key={line.key} className="flex items-start justify-between gap-3 border-b border-line-soft py-2 last:border-b-0">
                <span className="min-w-0">
                  <span className="block text-lg font-semibold leading-tight [overflow-wrap:anywhere]">{line.name}</span>
                  <span className="block text-base opacity-70 [overflow-wrap:anywhere]">{line.detail}</span>
                </span>
                <span className="shrink-0 text-lg font-bold">{money(line.totalCents)}</span>
              </li>
            ))}
          </ul>
          </div>
          {scrollbar.visible && (
            <div aria-hidden="true" className="pointer-events-none absolute bottom-0 right-0 top-0 w-3 rounded-full bg-line/40">
              <div
                onPointerDown={handleThumbPointerDown}
                onMouseDown={(event) => event.preventDefault()}
                className="pointer-events-auto absolute right-0 w-3 cursor-grab rounded-full bg-brand active:cursor-grabbing"
                style={{ top: scrollbar.thumbTop, height: scrollbar.thumbHeight }}
              />
            </div>
          )}
          </div>
          <dl className="m-0 flex flex-col gap-1 border-t border-line pt-3 text-lg">
            <div className="flex justify-between gap-3">
              <dt className="opacity-70">Subtotal</dt>
              <dd className="m-0">{money(subtotalCents)}</dd>
            </div>
            {discountCents > 0 && (
              <div className="flex justify-between gap-3">
                <dt className="opacity-70">Descuento</dt>
                <dd className="m-0">-{money(discountCents)}</dd>
              </div>
            )}
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <dt className="text-2xl font-bold">Total</dt>
              <dd className="m-0 text-3xl font-bold text-brand [overflow-wrap:anywhere]" aria-label="Total a cobrar">
                {money(totalCents)}
              </dd>
            </div>
          </dl>
        </section>

        <section aria-label="Formas de pago" className="flex min-w-0 flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="m-0 text-xl font-bold">Forma de pago</h3>
            <button
              type="button"
              onClick={toggleMode}
              className="min-h-12 rounded-lg border-2 border-brand px-3 text-lg font-semibold text-brand transition-colors hover:bg-surface-brand"
            >
              {mode === 'single' ? 'Repartir entre varias' : 'Pagar con una sola'}
            </button>
          </div>

          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {PAYMENT_METHODS.map((method) =>
              mode === 'single' ? (
                <li key={method}>
                  <button
                    type="button"
                    aria-pressed={singleMethod === method}
                    onClick={() => setSingleMethod(method)}
                    className={`flex min-h-14 w-full flex-wrap items-center justify-between gap-x-3 rounded-lg border-2 px-4 text-left text-lg font-bold transition-colors ${
                      singleMethod === method ? 'border-brand bg-surface-brand text-brand' : 'border-line hover:bg-surface-brand'
                    }`}
                  >
                    <span>{PAYMENT_METHOD_LABELS[method]}</span>
                    {singleMethod === method && <span>{money(totalCents)}</span>}
                  </button>
                </li>
              ) : (
                <li key={method} className="grid grid-cols-1 items-center gap-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] sm:gap-3">
                  <span className="text-lg font-bold">{PAYMENT_METHOD_LABELS[method]}</span>
                  <PriceInput
                    value={split[method]}
                    onChange={(value) => changeSplit(method, value)}
                    ariaLabel={`Importe en ${PAYMENT_METHOD_LABELS[method].toLowerCase()}`}
                    placeholder="0"
                    className={`${fieldClasses} pl-8`}
                  />
                </li>
              ),
            )}
          </ul>

          {mode === 'split' && (
            <div
              aria-live="polite"
              className={`flex flex-wrap items-baseline justify-between gap-2 rounded-lg px-4 py-3 text-lg ${
                plan.remainingCents === 0 ? 'bg-success-soft text-success' : 'bg-warning/10'
              }`}
            >
              <span className="font-semibold">
                {plan.remainingCents === 0 ? 'Todo asignado' : plan.remainingCents > 0 ? 'Falta asignar' : 'Sobra'}
              </span>
              <span className="text-2xl font-bold">
                {money(Math.abs(plan.remainingCents))}
              </span>
            </div>
          )}

          {cash > 0 && (
            <div className="flex flex-col gap-2 border-t border-line-soft pt-4">
              <label className="flex flex-wrap items-center justify-between gap-3">
                <span className="text-lg font-semibold">Paga con</span>
                <div className="w-48">
                  <PriceInput
                    value={paidWith}
                    onChange={setPaidWith}
                    ariaLabel="Paga con"
                    placeholder={centsToAmount(cash)}
                    autoFocus={mode === 'single'}
                    className={`${fieldClasses} pl-8`}
                  />
                </div>
              </label>
              <div className="flex flex-wrap items-baseline justify-end gap-3" aria-live="polite">
                <span className="text-xl font-semibold">{change !== null && change < 0 ? 'Falta' : 'Vuelto'}</span>
                <span className="text-4xl font-bold text-brand [overflow-wrap:anywhere]" data-testid="change-amount">
                  {change === null ? '—' : money(Math.abs(change))}
                </span>
              </div>
            </div>
          )}

          {fiado && (
            <div className="flex flex-col gap-1.5">
              <span className="text-lg font-semibold">
                Cliente <span className="text-danger">*</span>
              </span>
              <SelectMenu
                value={customerId}
                onChange={chooseCustomer}
                ariaLabel="Cliente del fiado"
                hasError={attempted && customerError !== null}
                options={[
                  { value: '', label: 'Elegí el cliente' },
                  ...allCustomers.map((customer) => ({ value: String(customer.id), label: customer.name })),
                  ...(canCreateCustomer ? [{ value: NEW_CUSTOMER_VALUE, label: '+ Nuevo cliente' }] : []),
                ]}
              />
              {!canCreateCustomer && (
                <p className="m-0 text-base opacity-60">Si el cliente no está, pedile a un Gerente que lo cree.</p>
              )}
            </div>
          )}
        </section>
      </div>

      {attempted && problem !== null && (
        <p role="alert" className="m-0 text-lg text-danger">
          {problem}
        </p>
      )}

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-2">
          <button type="submit" disabled={saving} aria-busy={saving} className={primaryButtonClasses}>
            Confirmar venta
          </button>
          <button type="button" onClick={onCancel} className={secondaryButtonClasses}>
            Cancelar
          </button>
        </div>
        <p className="m-0 text-center text-base opacity-60">Enter confirma · Esc cancela</p>
      </div>
    </SaleDialogShell>
    {creatingCustomer && <NewCustomerDialog onCreated={handleCustomerCreated} onClose={() => setCreatingCustomer(false)} />}
    </>
  )
}
