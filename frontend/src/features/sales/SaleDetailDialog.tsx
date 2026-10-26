import { useState } from 'react'
import { errorMessage } from '../../api/client'
import { fetchSale, voidSale } from '../../api/sales'
import type { Sale } from '../../api/types'
import { Breadcrumb } from '../../shared/Breadcrumb'
import { CloseButton } from '../../shared/CloseButton'
import { Dialog } from '../../shared/Dialog'
import { formatAmount } from '../../shared/formatAmount'
import { formatDateTime } from '../../shared/formatDateTime'
import { formatQuantity } from '../../shared/formatQuantity'
import { LoadErrorCard } from '../../shared/LoadErrorCard'
import { useLoad } from '../../shared/useLoad'
import { useToast } from '../../shared/useToast'
import { useReceiptPrinter } from './useReceiptPrinter'
import { PAYMENT_METHOD_LABELS, saleLineName } from './saleMath'

const VOID_ERROR_MESSAGE = 'No se pudo anular la venta. Intentá de nuevo.'

function SaleBody({ sale }: { sale: Sale }) {
  const { print, receipt } = useReceiptPrinter(sale)
  return (
    <div className="flex flex-col gap-3 text-lg">
      <dl className="m-0 grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2">
        <div>
          <dt className="inline opacity-60">Fecha: </dt>
          <dd className="m-0 inline">{formatDateTime(sale.created_at)}</dd>
        </div>
        <div>
          <dt className="inline opacity-60">Vendió: </dt>
          <dd className="m-0 inline [overflow-wrap:anywhere]">{sale.created_by_account_name}</dd>
        </div>
        {sale.customer_name !== null && (
          <div>
            <dt className="inline opacity-60">Cliente: </dt>
            <dd className="m-0 inline [overflow-wrap:anywhere]">{sale.customer_name}</dd>
          </div>
        )}
      </dl>

      <ul className="m-0 flex list-none flex-col gap-2 p-0" aria-label="Productos vendidos">
        {sale.lines.map((line) => (
          <li key={line.id} className="flex flex-col gap-1 rounded-lg border border-line p-3">
            <span className="font-semibold [overflow-wrap:anywhere]">{saleLineName(line)}</span>
            <span className="flex flex-wrap justify-between gap-x-4">
              <span>
                {line.description !== null
                  ? 'Monto libre'
                  : `${formatQuantity(line.quantity)} ${line.unit_abbreviation ?? ''} × ${formatAmount(line.unit_price)}`}
              </span>
              <span className="font-bold">{formatAmount(line.line_total)}</span>
            </span>
            {line.insufficient_stock && (
              <span className="text-base font-semibold text-warning">
                Sin stock suficiente: se descontaron {formatQuantity(line.stock_taken)} {line.unit_abbreviation}.
              </span>
            )}
          </li>
        ))}
      </ul>

      <dl className="m-0 flex flex-col gap-1">
        <div className="flex justify-between gap-4">
          <dt className="opacity-60">Subtotal</dt>
          <dd className="m-0">{formatAmount(sale.subtotal)}</dd>
        </div>
        {Number(sale.discount) > 0 && (
          <div className="flex justify-between gap-4">
            <dt className="opacity-60">Descuento de {sale.created_by_account_name}</dt>
            <dd className="m-0">-{formatAmount(sale.discount)}</dd>
          </div>
        )}
        <div className="flex justify-between gap-4 text-2xl font-bold">
          <dt>Total</dt>
          <dd className="m-0">{formatAmount(sale.total)}</dd>
        </div>
      </dl>

      <section aria-label="Formas de pago" className="flex flex-col gap-1 border-t border-line pt-3">
        <h3 className="m-0 text-lg font-bold">Forma de pago</h3>
        <ul className="m-0 flex list-none flex-col gap-1 p-0">
          {sale.payments.map((payment) => (
            <li key={payment.method} className="flex justify-between gap-4">
              <span>{PAYMENT_METHOD_LABELS[payment.method]}</span>
              <span className="font-semibold">{formatAmount(payment.amount)}</span>
            </li>
          ))}
        </ul>
      </section>

      <button
        type="button"
        onClick={print}
        className="min-h-12 rounded-lg border border-line px-4 text-lg font-semibold transition-colors hover:bg-surface-brand"
      >
        Imprimir comprobante
      </button>
      {receipt}

      {sale.voided_at !== null && (
        <div className="rounded-lg border-2 border-danger bg-danger/10 p-3">
          <p className="m-0 font-bold text-danger">Venta anulada</p>
          <p className="m-0 [overflow-wrap:anywhere]">
            {sale.voided_by_account_name} la anuló el {formatDateTime(sale.voided_at)}. Motivo: {sale.void_reason}
          </p>
        </div>
      )}
    </div>
  )
}

export function SaleDetailDialog({
  saleId,
  canVoid,
  onClose,
  onVoided,
}: {
  saleId: number
  canVoid: boolean
  onClose: () => void
  onVoided: () => void
}) {
  const { showSuccess, showError } = useToast()
  const { status, data, reload, setData } = useLoad(() => fetchSale(saleId), [saleId])
  const [voiding, setVoiding] = useState(false)
  const [reason, setReason] = useState('')
  const [attempted, setAttempted] = useState(false)
  const [saving, setSaving] = useState(false)
  const title = `Venta N° ${saleId}`
  const reasonError = reason.trim() === '' ? 'Escribí el motivo de la anulación.' : null

  async function confirmVoid() {
    setAttempted(true)
    if (reasonError !== null || saving) return
    setSaving(true)
    try {
      const updated = await voidSale(saleId, reason.trim())
      setData(updated)
      setVoiding(false)
      showSuccess('Venta anulada.')
      onVoided()
    } catch (error) {
      showError(errorMessage(error, VOID_ERROR_MESSAGE))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink/20 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <Dialog
        label={title}
        onClose={onClose}
        className="relative flex max-h-[calc(100svh-2rem)] w-full max-w-xl flex-col gap-4 overflow-y-auto rounded-2xl bg-surface p-6 shadow-2xl"
      >
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <Breadcrumb segments={['Ventas', title]} />
            </div>
            <CloseButton onClose={onClose} />
          </div>
          <h2 className="m-0 text-window-title">{title}</h2>
        </div>

        {status === 'loading' && data === undefined && (
          <p role="status" className="m-0 text-lg">
            Cargando…
          </p>
        )}
        {status === 'error' && <LoadErrorCard message="No se pudo cargar la venta." onRetry={reload} />}
        {data !== undefined && <SaleBody sale={data} />}

        {data !== undefined && data.voided_at === null && canVoid && !voiding && (
          <button
            type="button"
            onClick={() => setVoiding(true)}
            className="min-h-12 rounded-lg border-2 border-danger px-4 text-lg font-bold text-danger transition-colors hover:bg-danger/10"
          >
            Anular venta
          </button>
        )}

        {voiding && (
          <div className="flex flex-col gap-2 rounded-lg border border-line p-3">
            <p className="m-0 text-body">
              Al anularla se devuelve el stock y, si una parte fue en fiado, se descuenta de la cuenta del cliente. No se puede
              deshacer.
            </p>
            <label className="flex flex-col gap-1.5">
              <span className="text-base font-semibold">
                Motivo <span className="text-danger">*</span>
              </span>
              <textarea
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                rows={3}
                aria-invalid={(attempted && reasonError !== null) || undefined}
                className="rounded-lg border border-line bg-surface px-3 py-2 text-lg focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/10"
              />
            </label>
            {attempted && reasonError !== null && (
              <p role="alert" className="m-0 text-base text-danger">
                {reasonError}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={confirmVoid}
                disabled={saving}
                aria-busy={saving}
                className="min-h-12 flex-1 rounded-lg bg-danger px-4 text-lg font-bold text-brand-contrast transition-colors hover:bg-danger/90 disabled:opacity-60"
              >
                Confirmar anulación
              </button>
              <button
                type="button"
                onClick={() => setVoiding(false)}
                className="min-h-12 flex-1 rounded-lg border border-line px-4 text-lg font-semibold transition-colors hover:bg-surface-brand"
              >
                Volver
              </button>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  )
}
