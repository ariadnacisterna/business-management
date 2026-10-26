import { useState } from 'react'
import { fetchCashRegisters, fetchCurrentCashRegister, type CashMovementKind, type CashRegister } from '../../api/cash'
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
import { secondaryButtonClasses } from '../sales/SaleDialogs'
import { CashSummary, CloseRegisterDialog, MovementDialog, RegisterDetailDialog } from './CashDialogs'
import { differenceText, differenceTone, STATUS_LABELS } from './cashMath'

const PAGE_SIZE = 25

const HEAD_CELL = 'whitespace-nowrap px-4 py-3 text-left text-sm font-bold uppercase tracking-wide opacity-60'

function CurrentRegister({ onChanged, version }: { onChanged: () => void; version: number }) {
  const { account } = useAuth()
  const { status, data, reload } = useLoad(() => fetchCurrentCashRegister(), [account?.active_business_id, version])
  const [movement, setMovement] = useState<CashMovementKind | null>(null)

  return (
    <section aria-label="Mi caja" className="flex flex-col gap-4 rounded-2xl bg-surface p-5 shadow-sm">
      <h2 className="m-0 text-2xl font-bold">Mi caja</h2>
      {status === 'loading' && data === undefined && <PageLoading />}
      {status === 'error' && <LoadErrorCard message="No se pudo cargar tu caja." onRetry={reload} />}
      {data !== undefined && (
        <>
          <p className="m-0 text-lg opacity-70">
            Se abrió {formatDateTime(data.opened_at)} y termina {formatDateTime(data.ends_at)}.
          </p>
          <p className="m-0 text-4xl font-bold text-brand" aria-label="Efectivo en caja">
            {formatMoney(data.expected_cash)}
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setMovement('ingreso')} className={`${secondaryButtonClasses} sm:max-w-64`}>
              Ingresar efectivo
            </button>
            <button type="button" onClick={() => setMovement('retiro')} className={`${secondaryButtonClasses} sm:max-w-64`}>
              Retirar efectivo
            </button>
          </div>
          <CashSummary register={data} />
        </>
      )}
      {movement !== null && (
        <MovementDialog
          kind={movement}
          onClose={() => setMovement(null)}
          onDone={() => {
            setMovement(null)
            onChanged()
          }}
        />
      )}
    </section>
  )
}

function History({ version, onChanged }: { version: number; onChanged: () => void }) {
  const { account } = useAuth()
  const canClose = canCloseCash(account)
  const canCloseTransfers = canCloseCashTransfers(account)
  const [page, setPage] = useState(1)
  const { status, data, reload } = useLoad(() => fetchCashRegisters(page, PAGE_SIZE), [account?.active_business_id, page, version])
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
      <h2 className="m-0 text-2xl font-bold">Historial de cajas</h2>
      {status === 'loading' && data === undefined && <PageLoading />}
      {status === 'error' && <LoadErrorCard message="No se pudo cargar el historial de cajas." onRetry={reload} />}
      {status === 'success' && data !== undefined && data.total === 0 && (
        <EmptyState
          icon={<NavIconGlyph icon="cash" className="h-10 w-10 opacity-40" />}
          title="Todavía no hay cajas"
          description="Cada cuenta que vende tiene su caja, y va a aparecer acá."
        />
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
            onChanged()
          }}
        />
      )}
    </section>
  )
}

export function CashPage() {
  const { account } = useAuth()
  const [version, setVersion] = useState(0)
  const canSeeHistory = canCloseCash(account)

  return (
    <section className="-m-4 flex flex-1 flex-col gap-6 bg-line/10 p-4 md:-m-6 md:p-6">
      <div>
        <h1 className="text-3xl font-bold">Caja</h1>
        <p className="mt-1 text-base opacity-60 lg:text-lg">Lo que cobraste en tu turno y el efectivo que tenés en la caja.</p>
      </div>
      <CurrentRegister version={version} onChanged={() => setVersion((value) => value + 1)} />
      {canSeeHistory && <History version={version} onChanged={() => setVersion((value) => value + 1)} />}
    </section>
  )
}
