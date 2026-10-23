import { useState } from 'react'
import { NewSalePanel } from './NewSalePanel'
import { SalesListPanel } from './SalesListPanel'

type SalesView = 'new' | 'list'

const VIEW_LABELS: Record<SalesView, string> = {
  new: 'Nueva venta',
  list: 'Ventas registradas',
}

const VIEWS: SalesView[] = ['new', 'list']

export function SalesPage() {
  const [view, setView] = useState<SalesView>('new')

  return (
    <section className="-m-4 flex min-h-[calc(100svh-4rem)] flex-col gap-4 bg-line/10 p-4 md:-m-6 md:p-6">
      <div>
        <h1 className="text-3xl font-bold">Ventas</h1>
        <p className="mt-1 text-base opacity-60 lg:text-lg">Registrá lo que se vende en el mostrador.</p>
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Qué mostrar">
        {VIEWS.map((item) => (
          <button
            key={item}
            type="button"
            aria-pressed={view === item}
            onClick={() => setView(item)}
            className={`min-h-12 flex-1 rounded-lg border-2 px-4 text-lg font-bold transition-colors sm:flex-none ${
              view === item ? 'border-brand bg-brand text-brand-contrast' : 'border-line bg-surface hover:bg-surface-brand'
            }`}
          >
            {VIEW_LABELS[item]}
          </button>
        ))}
      </div>

      <div hidden={view !== 'new'}>
        <NewSalePanel />
      </div>
      {view === 'list' && <SalesListPanel />}
    </section>
  )
}
