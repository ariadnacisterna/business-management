import { useState } from 'react'
import { fetchCashRegisters, type CashRegister, type CashRegisterStatus } from '../../api/cash'
import { DatePicker } from '../../shared/DatePicker'
import { SelectMenu } from '../../shared/SelectMenu'
import { startOfDayIso, startOfNextDayIso } from '../sales/saleMath'
import { EmptyState } from '../../shared/EmptyState'
import { formatDateTime } from '../../shared/formatDateTime'
import { formatMoney } from '../../shared/formatPrice'
import { CheckIcon, EyeIcon } from '../../shared/icons'
import { NavIconGlyph } from '../../shared/layout/NavIcon'
import { LoadErrorCard } from '../../shared/LoadErrorCard'
import { PageLoading } from '../../shared/PageLoading'
import { Pagination } from '../../shared/Pagination'
import { RowMenu, type RowMenuItem } from '../../shared/RowMenu'
import { TABLE_CLASSES, TABLE_HEAD_CLASSES, TABLE_ROW_CLASSES } from '../../shared/tableRows'
import { useLoad } from '../../shared/useLoad'
import { canCloseCash, canCloseCashTransfers } from '../access/roles'
import { useAuth } from '../access/useAuth'
import { CloseRegisterDialog, RegisterDetailDialog } from './CashDialogs'
import { differenceText, differenceTone, STATUS_LABELS } from './cashMath'

const PAGE_SIZE = 25

const HEAD_CELL = 'whitespace-nowrap px-4 py-3 text-left text-sm font-bold uppercase tracking-wide opacity-60'

function History() {
  const { account } = useAuth()
  const canClose = canCloseCash(account)
  const canCloseTransfers = canCloseCashTransfers(account)
  const [version, setVersion] = useState(0)
  const [page, setPage] = useState(1)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [statusFilter, setStatusFilter] = useState<CashRegisterStatus | ''>('')
  const { status, data, reload } = useLoad(
    () =>
      fetchCashRegisters(page, PAGE_SIZE, {
        openedFrom: dateFrom === '' ? undefined : startOfDayIso(dateFrom),
        openedTo: dateTo === '' ? undefined : startOfNextDayIso(dateTo),
        status: statusFilter === '' ? undefined : statusFilter,
      }),
    [account?.active_business_id, page, dateFrom, dateTo, statusFilter, version],
  )
  const hasFilters = dateFrom !== '' || dateTo !== '' || statusFilter !== ''
  const noRegistersYet = status === 'success' && data !== undefined && data.total === 0 && !hasFilters
  const showFilters = !noRegistersYet && !(status === 'loading' && data === undefined)

  function changeDateFrom(value: string) {
    setDateFrom(value)
    setPage(1)
  }

  function changeDateTo(value: string) {
    setDateTo(value)
    setPage(1)
  }

  function changeStatus(value: CashRegisterStatus | '') {
    setStatusFilter(value)
    setPage(1)
  }

  function clearFilters() {
    setDateFrom('')
    setDateTo('')
    setStatusFilter('')
    setPage(1)
  }
  const [detail, setDetail] = useState<CashRegister | null>(null)
  const [closing, setClosing] = useState<CashRegister | null>(null)
  const totalPages = data === undefined ? 1 : Math.max(1, Math.ceil(data.total / PAGE_SIZE))

  function menuFor(register: CashRegister): RowMenuItem[] {
    const items: RowMenuItem[] = [{ label: 'Ver detalle', icon: <EyeIcon />, onClick: () => setDetail(register) }]
    const transfersPending = register.transfers_visible && register.transfers_closed_at === null
    if (canClose && register.status !== 'cerrada') {
      items.push({ label: 'Cerrar caja', icon: <CheckIcon />, onClick: () => setClosing(register) })
    } else if (canCloseTransfers && register.status === 'cerrada' && transfersPending) {
      items.push({ label: 'Cerrar transferencias', icon: <CheckIcon />, onClick: () => setClosing(register) })
    }
    return items
  }

  return (
    <section aria-label="Historial de cajas" className="flex flex-col gap-4">
      {status === 'success' && data !== undefined && data.total > 0 && (
        <p className="-mt-3 mb-0 text-base opacity-60 lg:text-lg">
          {data.total === 1 ? '1 caja registrada' : `${data.total} cajas registradas`}
        </p>
      )}
      {showFilters && (
        <div className={`grid grid-cols-1 gap-3 ${hasFilters ? 'sm:grid-cols-[1fr_1fr_1fr_auto]' : 'sm:grid-cols-3'}`}>
          <label className="flex min-w-0 flex-col gap-1.5">
            <span className="text-base font-semibold">Desde</span>
            <DatePicker value={dateFrom} onChange={changeDateFrom} ariaLabel="Cajas desde" disableFuture />
          </label>
          <label className="flex min-w-0 flex-col gap-1.5">
            <span className="text-base font-semibold">Hasta</span>
            <DatePicker value={dateTo} onChange={changeDateTo} ariaLabel="Cajas hasta" disableFuture />
          </label>
          <div className="flex min-w-0 flex-col gap-1.5">
            <span className="text-base font-semibold">Estado</span>
            <SelectMenu
              value={statusFilter}
              onChange={changeStatus}
              ariaLabel="Filtrar por estado"
              options={[
                { value: '', label: 'Todas' },
                ...(Object.keys(STATUS_LABELS) as CashRegisterStatus[]).map((value) => ({ value, label: STATUS_LABELS[value] })),
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
      {status === 'loading' && data === undefined && <PageLoading />}
      {status === 'error' && <LoadErrorCard message="No se pudo cargar el historial de cajas." onRetry={reload} />}
      {status === 'success' && data !== undefined && noRegistersYet && (
        <EmptyState
          icon={<NavIconGlyph icon="cash" className="h-10 w-10 opacity-40" />}
          title="Todavía no hay cajas"
          description="Cada cuenta que vende tiene su caja, y va a aparecer acá."
        />
      )}
      {status === 'success' && data !== undefined && data.items.length === 0 && hasFilters && (
        <p className="m-0 rounded-2xl bg-surface p-6 text-center text-lg opacity-70">No hay cajas con esos filtros.</p>
      )}
      {data !== undefined && data.items.length > 0 && (
        <div className="overflow-x-auto rounded-xl">
          <table className={`${TABLE_CLASSES} min-w-[900px]`} aria-label="Historial de cajas">
            <thead className={TABLE_HEAD_CLASSES}>
              <tr>
                <th className={HEAD_CELL}>N.º de caja</th>
                <th className={HEAD_CELL}>Persona</th>
                <th className={HEAD_CELL}>Abrió</th>
                <th className={HEAD_CELL}>Estado</th>
                <th className={HEAD_CELL}>Efectivo esperado</th>
                <th className={HEAD_CELL}>Diferencia</th>
                <th className={HEAD_CELL}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((register) => (
                <tr key={register.id} onClick={() => setDetail(register)} className={`cursor-pointer ${TABLE_ROW_CLASSES}`}>
                  <td className="whitespace-nowrap px-4 py-3 text-lg font-semibold">
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation()
                        setDetail(register)
                      }}
                      aria-label={`Ver caja N° ${register.id}`}
                      className="text-left font-semibold hover:text-brand"
                    >
                      N° {register.id}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-lg [overflow-wrap:anywhere]">{register.account_name}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-lg opacity-80">{formatDateTime(register.opened_at)}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`whitespace-nowrap rounded-full px-3 py-1 text-base font-bold ${
                        register.status === 'abierta'
                          ? 'bg-success-soft text-success'
                          : register.status === 'pendiente'
                            ? 'bg-warning/10 text-warning'
                            : 'bg-line/40 text-ink/70'
                      }`}
                    >
                      {STATUS_LABELS[register.status]}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-xl font-bold text-brand">{formatMoney(register.expected_cash)}</td>
                  <td className={`whitespace-nowrap px-4 py-3 text-lg font-semibold ${differenceTone(register.cash_difference)}`}>
                    {register.cash_difference === null ? '—' : differenceText(register.cash_difference)}
                  </td>
                  <td className="px-4 py-3" onClick={(event) => event.stopPropagation()}>
                    <RowMenu title={`Caja N° ${register.id}`} items={menuFor(register)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />

      {detail !== null && <RegisterDetailDialog register={detail} onClose={() => setDetail(null)} />}
      {closing !== null && (
        <CloseRegisterDialog
          register={closing}
          canCloseTransfers={canCloseTransfers}
          onClose={() => setClosing(null)}
          onChanged={() => {
            setClosing(null)
            setVersion((value) => value + 1)
          }}
        />
      )}
    </section>
  )
}

export function CashHistoryPage() {
  return (
    <section className="-m-4 flex flex-1 flex-col gap-6 bg-line/10 p-4 md:-m-6 md:p-6">
      <h1 className="text-3xl font-bold">Historial de cajas</h1>
      <History />
    </section>
  )
}
