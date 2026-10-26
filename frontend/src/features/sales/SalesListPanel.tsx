import { useState } from 'react'
import { Badge } from '../../shared/Badge'
import { fetchSales } from '../../api/sales'
import type { PaymentMethod } from '../../api/types'
import { DatePicker } from '../../shared/DatePicker'
import { useNavigate } from 'react-router-dom'
import { EmptyState } from '../../shared/EmptyState'
import { NavIconGlyph } from '../../shared/layout/NavIcon'
import { PageLoading } from '../../shared/PageLoading'
import { formatAmount } from '../../shared/formatAmount'
import { formatDateTime } from '../../shared/formatDateTime'
import { LoadErrorCard } from '../../shared/LoadErrorCard'
import { Pagination } from '../../shared/Pagination'
import { CrossIcon, EyeIcon } from '../../shared/icons'
import { RowMenu } from '../../shared/RowMenu'
import { TABLE_CLASSES, TABLE_HEAD_CLASSES, TABLE_ROW_CLASSES } from '../../shared/tableRows'
import { SelectMenu } from '../../shared/SelectMenu'
import { useLoad } from '../../shared/useLoad'
import { useAuth } from '../access/useAuth'
import { canVoidSales } from '../access/roles'
import { SaleDetailDialog } from './SaleDetailDialog'
import { PAYMENT_METHOD_LABELS, PAYMENT_METHODS, paymentSummary, startOfDayIso, startOfNextDayIso } from './saleMath'

const PAGE_SIZE = 25

type PaymentFilter = PaymentMethod | ''

export function SalesListPanel() {
  const navigate = useNavigate()
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
  const showFilters = !noSalesYet && !(status === 'loading' && data === undefined)

  function changeDateFrom(value: string) {
    setDateFrom(value)
    setPage(1)
  }

  function changeDateTo(value: string) {
    setDateTo(value)
    setPage(1)
  }

  function clearFilters() {
    setDateFrom('')
    setDateTo('')
    setPaymentFilter('')
    setPage(1)
  }

  function changePaymentFilter(value: PaymentFilter) {
    setPaymentFilter(value)
    setPage(1)
  }

  return (
    <div className="flex flex-col gap-4">
      {status === 'success' && data !== undefined && data.total > 0 && (
        <p className="-mt-3 mb-0 text-page-subtitle">
          {data.total === 1 ? '1 venta registrada' : `${data.total} ventas registradas`}
        </p>
      )}
      {showFilters && (
      <div className={`grid grid-cols-1 gap-3 ${hasFilters ? 'sm:grid-cols-[1fr_1fr_1fr_auto]' : 'sm:grid-cols-3'}`}>
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
        {hasFilters && (
          <button
            type="button"
            onClick={clearFilters}
            className="h-12 w-full self-end rounded-lg border-2 border-brand bg-surface text-lg font-semibold text-brand transition-colors hover:bg-brand hover:text-brand-contrast sm:w-48"
          >
            Limpiar filtros
          </button>
        )}
      </div>
      )}

      {status === 'loading' && <PageLoading />}

      {status === 'error' && <LoadErrorCard message="No se pudieron cargar las ventas." onRetry={reload} />}

      {noSalesYet && (
        <EmptyState
          icon={<NavIconGlyph icon="sales" className="h-10 w-10 opacity-40" />}
          title="No hay ventas registradas"
          description="Cuando registres una venta, va a aparecer acá."
          action={
            <button
              type="button"
              onClick={() => navigate('/ventas/nueva')}
              className="min-h-14 rounded-lg bg-brand px-5 text-lg font-bold text-brand-contrast transition-colors hover:bg-brand/90"
            >
              Ir a Venta
            </button>
          }
        />
      )}

      {status === 'success' && data !== undefined && data.items.length === 0 && (hasFilters || data.total > 0) && (
        <p className="m-0 rounded-2xl bg-surface p-6 text-center text-lg opacity-70">
          {hasFilters ? 'No hay ventas con esos filtros.' : 'No hay ventas para mostrar.'}
        </p>
      )}

      {status === 'success' && data !== undefined && data.items.length > 0 && (
        <div className="overflow-x-auto rounded-xl">
          <table className={`${TABLE_CLASSES} min-w-[960px]`} aria-label="Historial de ventas">
            <thead className={TABLE_HEAD_CLASSES}>
              <tr>
                <th className="whitespace-nowrap px-4 py-3 text-left text-sm font-bold uppercase tracking-wide opacity-60">N.º de venta</th>
                <th className="whitespace-nowrap px-4 py-3 text-left text-sm font-bold uppercase tracking-wide opacity-60">Fecha y hora</th>
                <th className="whitespace-nowrap px-4 py-3 text-left text-sm font-bold uppercase tracking-wide opacity-60">Cliente</th>
                <th className="whitespace-nowrap px-4 py-3 text-left text-sm font-bold uppercase tracking-wide opacity-60">Forma de pago</th>
                <th className="whitespace-nowrap px-4 py-3 text-left text-sm font-bold uppercase tracking-wide opacity-60">Vendedor</th>
                <th className="whitespace-nowrap px-4 py-3 text-left text-sm font-bold uppercase tracking-wide opacity-60">Estado</th>
                <th className="whitespace-nowrap px-4 py-3 text-left text-sm font-bold uppercase tracking-wide opacity-60">Total</th>
                <th className="whitespace-nowrap px-4 py-3 text-left text-sm font-bold uppercase tracking-wide opacity-60">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((sale) => {
                const voided = sale.voided_at !== null
                const menuItems = [
                  { label: 'Ver detalle', icon: <EyeIcon />, onClick: () => setSelectedSaleId(sale.id) },
                  ...(canVoid && !voided
                    ? [{ label: 'Anular', icon: <CrossIcon />, danger: true, divider: true, onClick: () => setSelectedSaleId(sale.id) }]
                    : []),
                ]
                return (
                  <tr
                    key={sale.id}
                    onClick={() => setSelectedSaleId(sale.id)}
                    className={`cursor-pointer ${TABLE_ROW_CLASSES} ${voided ? 'opacity-70' : ''}`}
                  >
                    <td className="whitespace-nowrap px-4 py-3 text-lg font-semibold">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation()
                          setSelectedSaleId(sale.id)
                        }}
                        aria-label={`Ver venta N° ${sale.id}`}
                        className="text-left font-semibold hover:text-brand"
                      >
                        N° {sale.id}
                      </button>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-lg opacity-80">{formatDateTime(sale.created_at)}</td>
                    <td className="px-4 py-3 text-lg [overflow-wrap:anywhere]">{sale.customer_name ?? 'Consumidor final'}</td>
                    <td className="px-4 py-3 text-lg opacity-80">{paymentSummary(sale.payments)}</td>
                    <td className="px-4 py-3 text-lg opacity-80 [overflow-wrap:anywhere]">{sale.created_by_account_name}</td>
                    <td className="px-4 py-3">
                      <span className="flex flex-wrap gap-2">
                        {voided && (
                          <Badge tone="danger">Anulada</Badge>
                        )}
                        {!voided && !sale.insufficient_stock && (
                          <Badge tone="success">Normal</Badge>
                        )}
                        {sale.insufficient_stock && (
                          <Badge tone="warning">Stock insuficiente</Badge>
                        )}
                      </span>
                    </td>
                    <td
                      className={`whitespace-nowrap px-4 py-3 text-left text-card-title text-brand ${voided ? 'line-through' : ''}`}
                    >
                      {formatAmount(sale.total)}
                    </td>
                    <td className="px-4 py-3" onClick={(event) => event.stopPropagation()}>
                      <RowMenu title={`Venta N° ${sale.id}`} items={menuItems} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
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
