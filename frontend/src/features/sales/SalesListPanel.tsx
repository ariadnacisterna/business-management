import { useState } from 'react'
import { fetchSales } from '../../api/sales'
import type { PaymentMethod } from '../../api/types'
import { DatePicker } from '../../shared/DatePicker'
import { formatAmount } from '../../shared/formatAmount'
import { formatDateTime } from '../../shared/formatDateTime'
import { LoadErrorCard } from '../../shared/LoadErrorCard'
import { Pagination } from '../../shared/Pagination'
import { SelectMenu } from '../../shared/SelectMenu'
import { useLoad } from '../../shared/useLoad'
import { useAuth } from '../access/useAuth'
import { canVoidSales } from '../access/roles'
import { SaleDetailDialog } from './SaleDetailDialog'
import { PAYMENT_METHOD_LABELS, PAYMENT_METHODS, startOfDayIso, startOfNextDayIso } from './saleMath'

const PAGE_SIZE = 25

type PaymentFilter = PaymentMethod | ''

export function SalesListPanel({ onNewSale }: { onNewSale: () => void }) {
  const { account } = useAuth()
  const canVoid = canVoidSales(account)
  const [page, setPage] = useState(1)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [paymentFilter, setPaymentFilter] = useState<PaymentFilter>('')
  const [selectedSaleId, setSelectedSaleId] = useState<number | null>(null)
  const [voidCount, setVoidCount] = useState(0)

  const { status, data, reload } = useLoad(
    () =>
      fetchSales({
        page,
        pageSize: PAGE_SIZE,
        createdFrom: dateFrom === '' ? undefined : startOfDayIso(dateFrom),
        createdTo: dateTo === '' ? undefined : startOfNextDayIso(dateTo),
        paymentMethod: paymentFilter === '' ? undefined : paymentFilter,
      }),
    [account?.active_business_id, page, dateFrom, dateTo, paymentFilter, voidCount],
  )
  const totalPages = data === undefined ? 1 : Math.max(1, Math.ceil(data.total / PAGE_SIZE))
  const hasFilters = dateFrom !== '' || dateTo !== '' || paymentFilter !== ''
  const noSalesYet = status === 'success' && data !== undefined && data.total === 0 && !hasFilters

  function changeDateFrom(value: string) {
    setDateFrom(value)
    setPage(1)
  }

  function changeDateTo(value: string) {
    setDateTo(value)
    setPage(1)
  }

  function changePaymentFilter(value: PaymentFilter) {
    setPaymentFilter(value)
    setPage(1)
  }

  return (
    <div className="flex flex-col gap-4">
      {!noSalesYet && (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className="flex min-w-0 flex-col gap-1.5">
          <span className="text-base font-semibold">Desde</span>
          <DatePicker value={dateFrom} onChange={changeDateFrom} ariaLabel="Ventas desde" disableFuture />
        </label>
        <label className="flex min-w-0 flex-col gap-1.5">
          <span className="text-base font-semibold">Hasta</span>
          <DatePicker value={dateTo} onChange={changeDateTo} ariaLabel="Ventas hasta" disableFuture />
        </label>
        <div className="flex min-w-0 flex-col gap-1.5">
          <span className="text-base font-semibold">Forma de pago</span>
          <SelectMenu
            value={paymentFilter}
            onChange={changePaymentFilter}
            ariaLabel="Filtrar por forma de pago"
            options={[
              { value: '', label: 'Todas' },
              ...PAYMENT_METHODS.map((method) => ({ value: method, label: PAYMENT_METHOD_LABELS[method] })),
            ]}
          />
        </div>
      </div>
      )}

      {status === 'loading' && (
        <div className="flex flex-col items-center gap-3 py-12 text-center" role="status">
          <span className="h-10 w-10 animate-spin rounded-full border-4 border-line border-t-brand" />
          <p className="text-xl font-semibold">Cargando…</p>
        </div>
      )}

      {status === 'error' && <LoadErrorCard message="No se pudieron cargar las ventas." onRetry={reload} />}

      {noSalesYet && (
        <div className="flex flex-col items-center gap-4 rounded-2xl bg-surface p-6 text-center">
          <p className="m-0 text-xl font-semibold">Todavía no hay ventas registradas.</p>
          <button
            type="button"
            onClick={onNewSale}
            className="min-h-16 rounded-lg bg-brand px-5 text-lg font-bold text-brand-contrast transition-colors hover:bg-brand/90"
          >
            Registrar una venta
          </button>
        </div>
      )}

      {status === 'success' && data !== undefined && data.items.length === 0 && (hasFilters || data.total > 0) && (
        <p className="m-0 rounded-2xl bg-surface p-6 text-center text-lg opacity-70">
          {hasFilters ? 'No hay ventas con esos filtros.' : 'No hay ventas para mostrar.'}
        </p>
      )}

      {status === 'success' && data !== undefined && data.items.length > 0 && (
        <ul className="m-0 flex list-none flex-col gap-3 p-0" aria-label="Ventas registradas">
          {data.items.map((sale) => (
            <li key={sale.id}>
              <button
                type="button"
                onClick={() => setSelectedSaleId(sale.id)}
                aria-label={`Ver venta N° ${sale.id}`}
                className={`flex w-full flex-col gap-1 rounded-2xl bg-surface p-4 text-left text-lg shadow-sm transition-colors hover:bg-surface-brand ${
                  sale.voided_at !== null ? 'opacity-70' : ''
                }`}
              >
                <span className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                  <span className="font-bold">Venta N° {sale.id}</span>
                  <span className={`text-2xl font-bold ${sale.voided_at !== null ? 'line-through' : ''}`}>
                    ${formatAmount(sale.total)}
                  </span>
                </span>
                <span className="flex flex-wrap gap-x-4 gap-y-1 opacity-80">
                  <span>{formatDateTime(sale.created_at)}</span>
                  <span>{PAYMENT_METHOD_LABELS[sale.payment_method]}</span>
                  {sale.customer_name !== null && <span className="[overflow-wrap:anywhere]">{sale.customer_name}</span>}
                  <span className="[overflow-wrap:anywhere]">{sale.created_by_account_name}</span>
                </span>
                {(sale.voided_at !== null || sale.insufficient_stock) && (
                  <span className="flex flex-wrap gap-2">
                    {sale.voided_at !== null && (
                      <span className="rounded-full bg-danger/10 px-3 py-0.5 text-base font-bold text-danger">Anulada</span>
                    )}
                    {sale.insufficient_stock && (
                      <span className="rounded-full bg-warning/10 px-3 py-0.5 text-base font-bold text-warning">
                        Stock insuficiente
                      </span>
                    )}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />

      {selectedSaleId !== null && (
        <SaleDetailDialog
          saleId={selectedSaleId}
          canVoid={canVoid}
          onClose={() => setSelectedSaleId(null)}
          onVoided={() => setVoidCount((count) => count + 1)}
        />
      )}
    </div>
  )
}
