import { useState } from 'react'
import { NewSalePanel } from './NewSalePanel'
import { SalesListPanel } from './SalesListPanel'
import { UnderlineTabs, type UnderlineTab } from '../../shared/UnderlineTabs'

type SalesView = 'new' | 'list'

const VIEW_TABS: readonly UnderlineTab<SalesView>[] = [
  { value: 'new', label: 'Nueva venta' },
  { value: 'list', label: 'Ventas registradas' },
]

export function SalesPage() {
  const [view, setView] = useState<SalesView>('new')

  return (
    <section className="-m-4 flex flex-1 flex-col gap-4 bg-line/10 p-4 md:-m-6 md:p-6">
      <div>
        <h1 className="text-3xl font-bold">Ventas</h1>
        <p className="mt-1 text-base opacity-60 lg:text-lg">Registrá lo que se vende en el mostrador.</p>
      </div>

      <div>
        <UnderlineTabs tabs={VIEW_TABS} value={view} onChange={setView} />
      </div>

      <div hidden={view !== 'new'}>
        <NewSalePanel />
      </div>
      {view === 'list' && <SalesListPanel />}
    </section>
  )
}
