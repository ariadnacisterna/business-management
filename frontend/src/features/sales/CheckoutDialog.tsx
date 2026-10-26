import { useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import type { Customer, PaymentMethod, SalePayment } from '../../api/types'
import { canManageCustomers } from '../access/roles'
import { useAuth } from '../access/useAuth'
import { NewCustomerDialog } from './NewCustomerDialog'
import { DiscountFields } from './DiscountFields'
import { PriceInput } from '../../shared/PriceInput'
import { CustomerPicker } from './CustomerPicker'
import { TransferAlias } from './TransferAlias'
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
import { amountCents, centsToAmount, PAYMENT_METHOD_LABELS, PAYMENT_METHODS } from './saleMath'
import { formatMoney } from '../../shared/formatPrice'

const FIADO_CUSTOMER_MESSAGE = 'Elegí el cliente'

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
  discountError: string | null
  pesosText: string
  percentText: string
  onChangePesos: (value: string) => void
  onChangePercent: (raw: string) => void
  totalCents: number
  customers: Customer[]
  onConfirm: (result: CheckoutResult) => Promise<void>
  onCancel: () => void
}

function money(cents: number): string {
  return formatMoney(cents / 100)
}

function PaymentIcon({ method }: { method: PaymentMethod }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-10 w-10"
    >
      {method === 'efectivo' && (
        <>
          <rect x="2" y="6" width="20" height="12" rx="2" />
          <circle cx="12" cy="12" r="2.5" />
          <path d="M6 12h.01M18 12h.01" />
        </>
      )}
      {method === 'transferencia' && (
        <>
          <path d="M4 8h14M14 4l4 4-4 4" />
          <path d="M20 16H6M10 12l-4 4 4 4" />
        </>
      )}
      {method === 'fiado' && (
        <>
          <path d="M5 4h12a2 2 0 0 1 2 2v14H7a2 2 0 0 1-2-2V4z" />
          <path d="M9 9h6M9 13h6" />
        </>
      )}
    </svg>
  )
}

export function CheckoutDialog({ lines, subtotalCents, discountError, pesosText, percentText, onChangePesos, onChangePercent, totalCents, customers, onConfirm, onCancel }: Props) {
  const [mode, setMode] = useState<PaymentMode>('single')
  const [singleMethod, setSingleMethod] = useState<PaymentMethod>('efectivo')
  const [split, setSplit] = useState<SplitAmounts>(EMPTY_SPLIT)
  const [splitActive, setSplitActive] = useState<PaymentMethod[]>([])
  const [paidWith, setPaidWith] = useState('')
  const [customerId, setCustomerId] = useState('')
  const [attempted, setAttempted] = useState(false)
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)
  const { account } = useAuth()
  const canCreateCustomer = canManageCustomers(account)
  const [createdCustomers, setCreatedCustomers] = useState<Customer[]>([])
  const [creatingCustomer, setCreatingCustomer] = useState(false)
  const [newCustomerName, setNewCustomerName] = useState('')
  const allCustomers = [...customers, ...createdCustomers]

  const plan = paymentPlan(mode, singleMethod, split, totalCents, PAYMENT_METHODS)
  const cash = cashCents(plan)
  const fiado = includesFiado(plan)
  const change = cash > 0 ? changeCents(paidWith, cash) : null
  const customerError = fiado && customerId === '' ? FIADO_CUSTOMER_MESSAGE : null
  const problem = plan.problem ?? customerError
  const over = mode === 'split' && plan.remainingCents < 0
  const missing = mode === 'split' && plan.remainingCents > 0
  const emptyActive = mode === 'split' ? splitActive.filter((method) => amountCents(split[method]) <= 0) : []
  const splitBlocked = mode === 'split' && (plan.parts.length === 0 || plan.remainingCents !== 0 || emptyActive.length > 0)
  const blocked = splitBlocked || customerError !== null

  function startCreatingCustomer(name: string) {
    setNewCustomerName(name)
    setCreatingCustomer(true)
  }

  function handleCustomerCreated(customer: Customer) {
    setCreatedCustomers((current) => [...current, customer])
    setCustomerId(String(customer.id))
    setCreatingCustomer(false)
  }

  function toggleMode() {
    if (mode === 'single') {
      setSplit(EMPTY_SPLIT)
      setSplitActive([])
      setMode('split')
      return
    }
    setMode('single')
  }

  function toggleSplitMethod(method: PaymentMethod) {
    if (splitActive.includes(method)) {
      setSplitActive((current) => current.filter((item) => item !== method))
      setSplit((current) => ({ ...current, [method]: '' }))
      return
    }
    setSplitActive((current) => [...current, method])
  }

  function tileAmount(method: PaymentMethod): string | null {
    const part = plan.parts.find((item) => item.method === method)
    if (part === undefined || part.cents <= 0) return null
    return money(part.cents)
  }

  function changeSplit(method: PaymentMethod, value: string) {
    setSplit((current) => ({ ...current, [method]: value }))
  }

  async function submit(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault()
    setAttempted(true)
    if (problem !== null || blocked || savingRef.current) return
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
    <SaleDialogShell title="Confirmar venta" onClose={onCancel} onSubmit={submit} onKeyDown={handleKeyDown} widthClass="max-w-6xl" fitHeight>
      <div className="flex min-h-0 flex-1 flex-col gap-8 overflow-y-auto md:min-h-[calc(70svh-8rem)] md:overflow-hidden">
      <div className="grid shrink-0 grid-cols-1 gap-6 md:min-h-0 md:flex-1 md:shrink md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] md:grid-rows-[minmax(0,1fr)_auto] md:gap-x-10 md:gap-y-6">
        <section aria-label="Resumen de la venta" className="flex min-h-0 min-w-0 flex-col gap-4 md:col-start-1 md:row-start-1 md:pr-2">
          <h3 className="m-0 text-xl font-bold">Resumen</h3>
          <ul className="scrollbar-clean m-0 flex min-h-0 list-none flex-col overflow-y-auto p-0">
            {lines.map((line) => (
              <li key={line.key} className="flex items-start justify-between gap-3 border-b border-line-soft py-3 last:border-b-0">
                <span className="min-w-0">
                  <span className="block text-lg font-semibold leading-tight [overflow-wrap:anywhere]">{line.name}</span>
                  <span className="block text-base opacity-70 [overflow-wrap:anywhere]">{line.detail}</span>
                </span>
                <span className="shrink-0 text-lg font-bold">{money(line.totalCents)}</span>
              </li>
            ))}
          </ul>
        </section>
        <div className="flex min-w-0 flex-col gap-5 border-t border-line pt-6 text-lg md:col-start-1 md:row-start-2">
          <div className="flex items-center justify-between gap-3">
            <span className="font-semibold">Descuento</span>
            <DiscountFields pesosText={pesosText} percentText={percentText} onChangePesos={onChangePesos} onChangePercent={onChangePercent} />
          </div>
          {discountError !== null && (
            <p role="alert" className="m-0 text-lg text-danger">
              {discountError}
            </p>
          )}
          <div className="flex justify-between gap-3">
            <span className="opacity-70">Subtotal</span>
            <span>{money(subtotalCents)}</span>
          </div>
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <span className="text-2xl font-bold">Total</span>
            <span className="text-3xl font-bold text-brand [overflow-wrap:anywhere]" aria-label="Total a cobrar">
              {money(totalCents)}
            </span>
          </div>
          {attempted && plan.problem !== null && !splitBlocked && (
            <p role="alert" className="m-0 text-lg text-danger">
              {plan.problem}
            </p>
          )}
        </div>

        <div aria-hidden="true" className="hidden w-px bg-line md:col-start-2 md:row-span-2 md:row-start-1 md:block" />

        <section aria-label="Formas de pago" className="flex min-h-0 min-w-0 flex-col gap-6 md:col-start-3 md:row-start-1 md:pl-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="m-0 text-xl font-bold">Forma de pago</h3>
            <button
              type="button"
              onClick={toggleMode}
              className="min-h-12 rounded-lg border border-line bg-surface px-3 text-lg font-medium text-ink transition-colors hover:bg-surface-brand"
            >
              {mode === 'single' ? 'Repartir entre varias' : 'Pagar con una sola'}
            </button>
          </div>

          <ul className="m-0 grid list-none grid-cols-3 gap-4 p-0">
            {PAYMENT_METHODS.map((method) => {
              const selected = mode === 'single' ? singleMethod === method : splitActive.includes(method)
              const amount = tileAmount(method)
              return (
                <li key={method}>
                  <button
                    type="button"
                    aria-pressed={selected}
                    onClick={() => (mode === 'single' ? setSingleMethod(method) : toggleSplitMethod(method))}
                    className={`flex min-h-32 w-full flex-col items-center justify-center gap-1 rounded-xl border-2 px-2 py-3 text-center text-lg font-bold transition-colors ${
                      selected ? 'border-brand bg-surface-brand text-brand' : 'border-line hover:bg-surface-brand'
                    }`}
                  >
                    <PaymentIcon method={method} />
                    <span>{PAYMENT_METHOD_LABELS[method]}</span>
                    {selected && amount !== null && <span className="text-base [overflow-wrap:anywhere]">{amount}</span>}
                  </button>
                </li>
              )
            })}
          </ul>

          {mode === 'split' && splitActive.length > 0 && (
            <ul className="m-0 flex list-none flex-col gap-4 p-0">
              {PAYMENT_METHODS.filter((method) => splitActive.includes(method)).map((method) => (
                <li key={method} className="grid grid-cols-1 items-center gap-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] sm:gap-x-3">
                  <span className="text-lg font-bold">
                    {PAYMENT_METHOD_LABELS[method]} <span className="text-danger">*</span>
                  </span>
                  <PriceInput
                    value={split[method]}
                    onChange={(value) => changeSplit(method, value)}
                    ariaLabel={`Importe en ${PAYMENT_METHOD_LABELS[method].toLowerCase()}`}
                    placeholder="0"
                    className={`${fieldClasses} pl-8 ${over || emptyActive.includes(method) ? 'border-danger' : ''}`}
                  />
                  {emptyActive.includes(method) && (
                    <p role="alert" className="m-0 text-base text-danger sm:col-start-2">
                      Completá el importe
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}

          {mode === 'split' && (
            <div aria-live="polite" className="flex flex-col gap-3">
              {over && (
                <p role="alert" className="m-0 text-lg text-danger">
                  Las formas de pago suman {money(-plan.remainingCents)} más que el total. Corregí los importes.
                </p>
              )}
              {missing && plan.parts.length > 0 && (
                <p className="m-0 text-lg opacity-60">Todavía falta asignar parte del total.</p>
              )}
              <div className={`flex flex-wrap items-baseline justify-between gap-3 text-lg ${plan.remainingCents === 0 && plan.parts.length > 0 ? 'text-success' : 'opacity-70'}`}>
                <span className="font-semibold">{plan.remainingCents === 0 && plan.parts.length > 0 ? 'Completo' : 'Falta asignar'}</span>
                <span>{money(Math.max(plan.remainingCents, 0))}</span>
              </div>
            </div>
          )}

        </section>
        <div aria-label="Detalle del pago" role="group" className="flex min-w-0 flex-col gap-6 border-t border-line pt-6 md:col-start-3 md:row-start-2 md:pl-2">
          {cash > 0 && (
            <div className="flex flex-col gap-5">
              <label className="flex flex-wrap items-center justify-between gap-3">
                <span className="text-xl font-semibold">Paga con</span>
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
                <span className={`text-4xl font-bold [overflow-wrap:anywhere] ${change === null ? 'text-ink opacity-50' : 'text-brand'}`} data-testid="change-amount">
                  {money(change === null ? 0 : Math.abs(change))}
                </span>
              </div>
            </div>
          )}

          {plan.parts.some((part) => part.method === 'transferencia') && (
            <TransferAlias />
          )}

          {fiado && (
            <div className="flex flex-col gap-1.5">
              <span className="text-lg font-semibold">
                Cliente <span className="text-danger">*</span>
              </span>
              <CustomerPicker
                customers={allCustomers}
                value={customerId}
                onChange={setCustomerId}
                onCreate={canCreateCustomer ? startCreatingCustomer : null}
                hasError={attempted && customerError !== null}
                ariaLabel="Cliente del fiado"
              />
              {attempted && customerError !== null && (
                <p role="alert" className="m-0 text-base text-danger">
                  {customerError}
                </p>
              )}
              {!canCreateCustomer && (
                <p className="m-0 text-base opacity-60">Si el cliente no está, pedile a un Gerente que lo cree.</p>
              )}
            </div>
          )}
        </div>
      </div>
      <div className="grid shrink-0 grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] md:gap-10">
        <button type="submit" disabled={saving || blocked} aria-busy={saving} className={`${primaryButtonClasses} w-full`}>
          Confirmar venta
        </button>
        <div aria-hidden="true" className="hidden w-px md:block" />
        <button type="button" onClick={onCancel} className={`${secondaryButtonClasses} w-full`}>
          Cancelar
        </button>
      </div>
    </div>
    </SaleDialogShell>
    {creatingCustomer && <NewCustomerDialog initialName={newCustomerName} onCreated={handleCustomerCreated} onClose={() => setCreatingCustomer(false)} />}
    </>
  )
}
