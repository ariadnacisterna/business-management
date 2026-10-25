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
import { amountProblem, paymentSummary, variantDescription } from './saleMath'

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
  onSubmit?: (event: FormEvent<HTMLFormElement>) => void
  onKeyDown?: (event: KeyboardEvent<HTMLElement>) => void
  children: ReactNode
}

export function SaleDialogShell({ title, onClose, widthClass, fixedHeight = false, fitHeight = false, onSubmit, onKeyDown, children }: ShellProps) {
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
          <h2 className="m-0 text-2xl font-bold">{title}</h2>
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
          <p className="m-0 text-xl font-bold [overflow-wrap:anywhere]">{displayName(checked)}</p>
          <p className="m-0 text-3xl font-bold text-brand">{formatAmount(checked.price_amount)}</p>
          <p className="m-0 text-lg">
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

export function SaleRegisteredDialog({ sale, onNewSale }: { sale: Sale; onNewSale: () => void }) {
  return (
    <SaleDialogShell title="Venta registrada" onClose={onNewSale} widthClass="max-w-md">
      <div className="flex flex-col items-center gap-2 rounded-xl bg-success-soft p-5 text-center">
        <p className="m-0 text-xl font-bold text-success">Venta N° {sale.id}</p>
        <p className="m-0 text-lg opacity-70">Total</p>
        <p className="m-0 text-4xl font-bold [overflow-wrap:anywhere]" aria-label="Total registrado">
          {formatAmount(sale.total)}
        </p>
        <p className="m-0 text-lg [overflow-wrap:anywhere]">{paymentSummary(sale.payments)}</p>
      </div>
      <div className="flex flex-col gap-1">
        <button
          type="button"
          disabled
          aria-describedby="sale-print-soon"
          className="min-h-14 rounded-lg border border-line px-4 text-lg font-semibold disabled:opacity-50"
        >
          Imprimir comprobante
        </button>
        <p id="sale-print-soon" className="m-0 text-center text-base opacity-70">
          Próximamente
        </p>
      </div>
      <div className="flex">
        <button type="button" onClick={onNewSale} autoFocus className={primaryButtonClasses.replace(' disabled:cursor-wait', '')}>
          Nueva venta
        </button>
      </div>
    </SaleDialogShell>
  )
}
