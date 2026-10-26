import { NewSalePanel } from './NewSalePanel'
import { SalesListPanel } from './SalesListPanel'

export type SalesView = 'new' | 'list'

const TITLES: Record<SalesView, string> = {
  new: 'Venta',
  list: 'Historial de ventas',
}

export function SalesPage({ view }: { view: SalesView }) {
  return (
    <section className="-m-4 flex flex-1 flex-col gap-4 bg-line/10 p-4 md:-m-6 md:p-6">
      <div>
        <h1 className="text-page-title">{TITLES[view]}</h1>
        {view === 'new' && <p className="mt-1 text-page-subtitle">Registrá lo que se vende en el mostrador.</p>}
      </div>

      {view === 'new' ? <NewSalePanel /> : <SalesListPanel />}
    </section>
  )
}
