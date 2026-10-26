import { useState } from 'react'
import { fetchCurrentCashRegister, type CashMovementKind } from '../../api/cash'
import { formatMoney } from '../../shared/formatPrice'
import { LoadErrorCard } from '../../shared/LoadErrorCard'
import { PageLoading } from '../../shared/PageLoading'
import { useLoad } from '../../shared/useLoad'
import { useAuth } from '../access/useAuth'
import { CashSummary, MovementDialog } from './CashDialogs'

const headerButtonClasses =
  'min-h-14 rounded-lg border border-line bg-surface px-5 text-lg font-semibold transition-colors hover:bg-surface-brand'

export function CashPage() {
  const { account } = useAuth()
  const [version, setVersion] = useState(0)
  const { status, data, reload } = useLoad(() => fetchCurrentCashRegister(), [account?.active_business_id, version])
  const [movement, setMovement] = useState<CashMovementKind | null>(null)

  return (
    <section className="-m-4 flex flex-1 flex-col gap-6 bg-line/10 p-4 md:-m-6 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-page-title">Caja</h1>
          <p className="mt-1 text-page-subtitle">Lo que cobraste en tu turno y el efectivo que tenés en la caja.</p>
        </div>
        {data !== undefined && (
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setMovement('ingreso')} className={headerButtonClasses}>
              Ingresar efectivo
            </button>
            <button type="button" onClick={() => setMovement('retiro')} className={headerButtonClasses}>
              Retirar efectivo
            </button>
          </div>
        )}
      </div>
      {status === 'loading' && data === undefined && <PageLoading />}
      {status === 'error' && <LoadErrorCard message="No se pudo cargar tu caja." onRetry={reload} />}
      {data !== undefined && (
        <section aria-label="Caja actual" className="flex flex-col gap-4 rounded-2xl bg-surface p-5 shadow-sm">
          <p className="m-0 text-figure text-brand" aria-label="Efectivo en caja">
            {formatMoney(data.expected_cash)}
          </p>
          <CashSummary register={data} />
        </section>
      )}
      {movement !== null && (
        <MovementDialog
          kind={movement}
          onClose={() => setMovement(null)}
          onDone={() => {
            setMovement(null)
            setVersion((value) => value + 1)
          }}
        />
      )}
    </section>
  )
}
