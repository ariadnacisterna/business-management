import { useAuth } from '../access/useAuth'
import { fetchStockSummary, type StockSummary } from '../inventory/stockRows'
import { NavIconGlyph } from '../../shared/layout/NavIcon'
import { LoadErrorCard } from '../../shared/LoadErrorCard'
import { useLoad } from '../../shared/useLoad'
import { LoginAlertsNotice } from './LoginAlertsNotice'

const EMPTY_SUMMARY: StockSummary = { total: 0, stockBajo: 0, sinStock: 0 }
const STOCK_LOAD_ERROR_MESSAGE = 'No se pudo cargar el resumen del inventario.'

export function DashboardPage() {
  const { account } = useAuth()
  const businessId = account?.active_business_id
  const stock = useLoad(() => fetchStockSummary(), [businessId])
  const status = stock.status
  const summary = stock.data ?? EMPTY_SUMMARY

  return (
    <section className="-m-4 flex flex-1 flex-col gap-4 bg-line/10 p-4 md:-m-6 md:p-6">
      <div>
        <h1 className="text-3xl font-bold">Panel</h1>
        <p className="mt-1 text-base opacity-60 lg:text-lg">Resumen general del negocio</p>
      </div>

      <LoginAlertsNotice key={businessId} />

      {status === 'loading' && (
        <div className="flex flex-col items-center gap-3 py-12 text-center" role="status">
          <span className="h-10 w-10 animate-spin rounded-full border-4 border-line border-t-brand" />
          <p className="text-xl font-semibold">Cargando…</p>
        </div>
      )}

      {status === 'error' && <LoadErrorCard message={STOCK_LOAD_ERROR_MESSAGE} onRetry={stock.reload} />}

      {status === 'success' && summary.total > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-line bg-surface p-5">
            <p className="text-sm font-bold uppercase tracking-wide opacity-50">Variantes</p>
            <p className="mt-1 text-3xl font-bold">{summary.total}</p>
          </div>
          <div className="rounded-xl border border-line bg-surface p-5">
            <p className="text-sm font-bold uppercase tracking-wide opacity-50">Con stock bajo</p>
            <p className="mt-1 text-3xl font-bold text-warning">{summary.stockBajo}</p>
          </div>
          <div className="rounded-xl border border-line bg-surface p-5">
            <p className="text-sm font-bold uppercase tracking-wide opacity-50">Sin stock</p>
            <p className="mt-1 text-3xl font-bold text-danger">{summary.sinStock}</p>
          </div>
        </div>
      )}

      {status === 'success' && summary.total === 0 && (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-line bg-surface px-6 py-16 text-center">
          <NavIconGlyph icon="inventory" className="h-10 w-10 opacity-40" />
          <p className="text-xl font-semibold opacity-70">No hay inventario cargado</p>
          <p className="text-lg opacity-50">Cuando tengas productos con variantes activas, su stock va a aparecer acá.</p>
        </div>
      )}
    </section>
  )
}
