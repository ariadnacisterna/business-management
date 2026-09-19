import { useEffect, useState } from 'react'
import { fetchCustomerBalances } from '../../api/catalog'
import { fetchStockSummary, type StockSummary } from '../inventory/stockRows'
import { formatAmount } from '../../shared/formatAmount'
import { NavIconGlyph } from '../../shared/layout/NavIcon'

const EMPTY_SUMMARY: StockSummary = { total: 0, stockBajo: 0, sinStock: 0 }

type Status = 'loading' | 'success' | 'error'

export function DashboardPage() {
  const [summary, setSummary] = useState<StockSummary>(EMPTY_SUMMARY)
  const [status, setStatus] = useState<Status>('loading')
  const [pendingTotal, setPendingTotal] = useState(0)
  const [balanceStatus, setBalanceStatus] = useState<Status>('loading')

  useEffect(() => {
    fetchStockSummary()
      .then((result) => {
        setSummary(result)
        setStatus('success')
      })
      .catch(() => setStatus('error'))
  }, [])

  useEffect(() => {
    fetchCustomerBalances()
      .then((balances) => {
        const total = balances.reduce((sum, item) => {
          const value = Number(item.balance)
          return value > 0 ? sum + value : sum
        }, 0)
        setPendingTotal(total)
        setBalanceStatus('success')
      })
      .catch(() => setBalanceStatus('error'))
  }, [])

  return (
    <section className="-m-4 flex min-h-[calc(100svh-4rem)] flex-col gap-4 bg-line/10 p-4 md:-m-6 md:p-6">
      <div>
        <h1 className="text-3xl font-bold">Panel</h1>
        <p className="mt-1 whitespace-nowrap text-base opacity-60 lg:text-lg">Resumen general del negocio</p>
      </div>

      <div className="rounded-xl border border-line bg-surface p-5">
        <p className="text-sm font-bold uppercase tracking-wide opacity-50">Fiado pendiente</p>
        {balanceStatus === 'loading' && (
          <div className="mt-1 flex items-center gap-3" role="status">
            <span className="h-6 w-6 animate-spin rounded-full border-4 border-line border-t-brand" />
            <p className="text-xl font-semibold">Cargando…</p>
          </div>
        )}
        {balanceStatus === 'success' && <p className="mt-1 text-3xl font-bold">${formatAmount(String(pendingTotal))}</p>}
        {balanceStatus === 'error' && (
          <p className="mt-1 text-xl font-semibold text-danger" role="alert">
            No se pudo cargar
          </p>
        )}
      </div>

      {status === 'loading' && (
        <div className="flex flex-col items-center gap-3 py-12 text-center" role="status">
          <span className="h-10 w-10 animate-spin rounded-full border-4 border-line border-t-brand" />
          <p className="text-xl font-semibold">Cargando…</p>
        </div>
      )}

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
