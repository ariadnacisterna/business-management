import { useEffect, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react'
import type { Sale, SellableVariant } from '../../api/types'
import { Breadcrumb } from '../../shared/Breadcrumb'
import { CloseButton } from '../../shared/CloseButton'
import { Dialog } from '../../shared/Dialog'
import { CLOSE_FLOATING_MENUS_EVENT } from '../../shared/floatingMenuEvents'
import { formatAmount } from '../../shared/formatAmount'
import { PriceInput } from '../../shared/PriceInput'
import { formatStock } from '../../shared/presentation'
import { ProductPicker } from './ProductPicker'
import { useReceiptPrinter } from './useReceiptPrinter'
import { formatMoney } from '../../shared/formatPrice'
import { amountProblem, PAYMENT_METHOD_LABELS, paymentSummary, variantDescription } from './saleMath'

export const FREE_LINE_MAX_LENGTH = 100

export const fieldClasses =
  'h-14 w-full rounded-lg border border-line bg-surface px-3 text-lg focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/10'

export const primaryButtonClasses =
  'min-h-14 flex-1 rounded-lg bg-brand px-4 text-lg font-bold text-brand-contrast transition-colors hover:bg-brand/90 disabled:cursor-wait disabled:opacity-60'

export const secondaryButtonClasses =
  'min-h-14 flex-1 rounded-lg border border-line px-4 text-lg font-semibold transition-colors hover:bg-surface-brand'

interface ShellProps {
  title: string
  onClose: () => void
  widthClass: string
  fixedHeight?: boolean
  fitHeight?: boolean
  bare?: boolean
  onSubmit?: (event: FormEvent<HTMLFormElement>) => void
  onKeyDown?: (event: KeyboardEvent<HTMLElement>) => void
  children: ReactNode
}

export function SaleDialogShell({ title, onClose, widthClass, fixedHeight = false, fitHeight = false, bare = false, onSubmit, onKeyDown, children }: ShellProps) {
  useEffect(() => {
    window.dispatchEvent(new Event(CLOSE_FLOATING_MENUS_EVENT))
  }, [])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onKeyDown={onKeyDown}>
      <div className="absolute inset-0 bg-ink/20 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <Dialog
        label={title}
        onClose={onClose}
        onSubmit={onSubmit}
        noValidate
        className={`scrollbar-clean relative flex ${fitHeight ? 'max-h-[calc(100svh-4rem)] overflow-hidden' : fixedHeight ? 'max-h-[min(70svh,calc(100svh-2rem))] overflow-hidden' : 'max-h-[calc(100svh-2rem)] overflow-y-auto'} w-full ${widthClass} flex-col ${fitHeight ? 'gap-6 p-6 sm:p-8' : 'gap-4 p-5 sm:p-6'} rounded-2xl bg-surface shadow-2xl`}
      >
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <Breadcrumb segments={['Venta', title]} />
            </div>
            <CloseButton onClose={onClose} />
          </div>
          {!bare && <h2 className="m-0 text-window-title">{title}</h2>}
        </div>
        {children}
      </Dialog>
    </div>
  )
}

function displayName(variant: SellableVariant): string {
  const description = variantDescription(variant)
  return description ? `${variant.product_name} (${description})` : variant.product_name
}

export function PriceCheckDialog({ variants, onClose }: { variants: SellableVariant[]; onClose: () => void }) {
  const [checked, setChecked] = useState<SellableVariant | null>(null)

  return (
    <SaleDialogShell title="Consultar precio" onClose={onClose} widthClass="max-w-5xl" fixedHeight>
      <p className="m-0 shrink-0 text-lg opacity-70">Buscá el producto para ver su precio y su stock. No se agrega a la venta.</p>
      <ProductPicker
        variants={variants}
        onPick={setChecked}
        ariaLabel="Buscar producto para consultar"
        placeholder="Buscar producto"
        optionLabel={(variant) => `Consultar ${displayName(variant)}`}
        autoFocus
        inline
      />
      {checked !== null && (
        <section
          aria-label="Precio consultado"
          aria-live="polite"
          className="flex shrink-0 flex-col gap-2 rounded-xl border-2 border-brand bg-surface-brand p-4"
        >
          <p className="m-0 text-card-title [overflow-wrap:anywhere]">{displayName(checked)}</p>
          <p className="m-0 text-figure text-brand">{formatAmount(checked.price_amount)}</p>
          <p className="m-0 text-body">
            Stock: {formatStock(checked.quantity, checked.presentation, checked.unit_abbreviation)}
          </p>
        </section>
      )}
      <div className="flex shrink-0">
        <button type="button" onClick={onClose} className={secondaryButtonClasses}>
          Cerrar
        </button>
      </div>
    </SaleDialogShell>
  )
}

export function FreeAmountDialog({
  onAdd,
  onClose,
}: {
  onAdd: (description: string, amount: string) => void
  onClose: () => void
}) {
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [attempted, setAttempted] = useState(false)
  const descriptionError = description.trim() === '' ? 'Escribí el nombre.' : null
  const amountError = amountProblem(amount)

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setAttempted(true)
    if (descriptionError !== null || amountError !== null) return
    onAdd(description.trim(), amount)
  }

  return (
    <SaleDialogShell title="Agregar monto" onClose={onClose} onSubmit={submit} widthClass="max-w-md">
      <p className="m-0 text-lg opacity-70">Para cobrar algo que no está cargado como producto. No mueve stock.</p>
      <label className="flex flex-col gap-1.5">
        <span className="text-lg font-semibold">
          Nombre <span className="text-danger">*</span>
        </span>
        <input
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          maxLength={FREE_LINE_MAX_LENGTH}
          placeholder="Por ejemplo: Varios"
          aria-invalid={(attempted && descriptionError !== null) || undefined}
          autoFocus
          className={fieldClasses}
        />
      </label>
      {attempted && descriptionError !== null && (
        <p role="alert" className="m-0 text-lg text-danger">
          {descriptionError}
        </p>
      )}
      <div className="flex flex-col gap-1.5">
        <span className="text-lg font-semibold">
          Importe <span className="text-danger">*</span>
        </span>
        <PriceInput value={amount} onChange={setAmount} ariaLabel="Importe del monto" placeholder="0" className={`${fieldClasses} pl-8`} />
      </div>
      {attempted && amountError !== null && (
        <p role="alert" className="m-0 text-lg text-danger">
          {amountError}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="submit" className={primaryButtonClasses}>
          Agregar
        </button>
        <button type="button" onClick={onClose} className={secondaryButtonClasses}>
          Cancelar
        </button>
      </div>
    </SaleDialogShell>
  )
}

function CheckIcon() {
  return (
    <span aria-hidden="true" className="flex h-16 w-16 items-center justify-center rounded-full bg-success-soft text-success">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="h-9 w-9">
        <polyline points="5 12.5 10 17.5 19 7" />
      </svg>
    </span>
  )
}

export function SaleRegisteredDialog({ sale, onNewSale }: { sale: Sale; onNewSale: () => void }) {
  const split = sale.payments.length > 1
  const { print, receipt } = useReceiptPrinter(sale)
  const shortNames = sale.lines.filter((line) => line.insufficient_stock).map((line) => line.product_name ?? line.description ?? 'Producto')
  return (
    <SaleDialogShell title="Venta registrada" bare onClose={onNewSale} widthClass="max-w-md">
      <div className="flex flex-col items-center gap-2 text-center">
        <CheckIcon />
        <h2 className="m-0 mt-2 text-window-title">¡Venta registrada!</h2>
        <p className="m-0 text-secondary">Venta N.º {sale.id}</p>
        <p className="m-0 mt-3 text-figure-key text-brand [overflow-wrap:anywhere]" aria-label="Total registrado">
          {formatAmount(sale.total)}
        </p>
        <div className="mt-2 flex flex-col items-center gap-1 text-secondary">
          {split ? (
            <ul className="m-0 flex list-none flex-col items-center gap-0.5 p-0">
              {sale.payments.map((payment) => (
                <li key={payment.method}>
                  {PAYMENT_METHOD_LABELS[payment.method]} {formatMoney(payment.amount)}
                </li>
              ))}
            </ul>
          ) : (
            <p className="m-0">{paymentSummary(sale.payments)}</p>
          )}
          {sale.customer_name !== null && <p className="m-0 [overflow-wrap:anywhere]">Cliente: {sale.customer_name}</p>}
        </div>
      </div>
      {sale.insufficient_stock && (
        <div role="alert" className="flex flex-col items-center gap-1 text-center text-lg text-warning">
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7">
            <path d="M12 3l10 18H2L12 3z" />
            <path d="M12 10v5M12 18h.01" />
          </svg>
          <p className="m-0 font-semibold">Stock insuficiente en:</p>
          <ul className="m-0 list-none p-0">
            {shortNames.map((name, index) => (
              <li key={index} className="[overflow-wrap:anywhere]">
                {name}
              </li>
            ))}
          </ul>
          <p className="m-0 mt-1">El stock quedó en 0 y la venta queda marcada para revisar el inventario.</p>
        </div>
      )}
      <div className="flex flex-col gap-3">
        <button type="button" onClick={onNewSale} autoFocus className={`${primaryButtonClasses.replace(' disabled:cursor-wait', '')} w-full`}>
          Nueva venta
        </button>
        <button type="button" onClick={print} className={`${secondaryButtonClasses} w-full`}>
          Imprimir comprobante
        </button>
      </div>
      {receipt}
    </SaleDialogShell>
  )
}
