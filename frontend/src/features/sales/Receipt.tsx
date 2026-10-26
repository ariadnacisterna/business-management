import type { Sale } from '../../api/types'
import { formatAmount } from '../../shared/formatAmount'
import { formatDateTime } from '../../shared/formatDateTime'
import { formatQuantity } from '../../shared/formatQuantity'
import { PAYMENT_METHOD_LABELS, saleLineName } from './saleMath'

export function Receipt({ sale, businessName, alias }: { sale: Sale; businessName: string; alias: string | null }) {
  const hasTransfer = sale.payments.some((payment) => payment.method === 'transferencia')
  return (
    <div className="receipt-print" data-testid="receipt">
      <h1 className="receipt-title">{businessName}</h1>
      <p>{formatDateTime(sale.created_at)}</p>
      <p>Venta N.º {sale.id}</p>
      <hr />
      <ul className="receipt-lines">
        {sale.lines.map((line) => (
          <li key={line.id}>
            <span className="receipt-line-name">{saleLineName(line)}</span>
            <span className="receipt-row">
              <span>
                {line.description !== null
                  ? 'Monto libre'
                  : `${formatQuantity(line.quantity)} ${line.unit_abbreviation ?? ''} x ${formatAmount(line.unit_price)}`}
              </span>
              <span>{formatAmount(line.line_total)}</span>
            </span>
          </li>
        ))}
      </ul>
      <hr />
      {Number(sale.discount) > 0 && (
        <>
          <p className="receipt-row">
            <span>Subtotal</span>
            <span>{formatAmount(sale.subtotal)}</span>
          </p>
          <p className="receipt-row">
            <span>Descuento</span>
            <span>-{formatAmount(sale.discount)}</span>
          </p>
        </>
      )}
      <p className="receipt-row receipt-total">
        <span>TOTAL</span>
        <span>{formatAmount(sale.total)}</span>
      </p>
      <hr />
      <p className="receipt-heading">Forma de pago</p>
      {sale.payments.map((payment) => (
        <p key={payment.method} className="receipt-row">
          <span>{PAYMENT_METHOD_LABELS[payment.method]}</span>
          <span>{formatAmount(payment.amount)}</span>
        </p>
      ))}
      {hasTransfer && alias !== null && <p>Alias: {alias}</p>}
      {sale.customer_name !== null && <p>Cliente: {sale.customer_name}</p>}
      <hr />
      <p className="receipt-footer">No válido como factura</p>
    </div>
  )
}
