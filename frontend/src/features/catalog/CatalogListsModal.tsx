import { useState } from 'react'
import { AttributesPage } from './AttributesPage'
import { CategoriesPage } from './CategoriesPage'
import { UnitsPage } from './UnitsPage'

type Tab = 'categories' | 'units' | 'attributes'

const TABS: { key: Tab; label: string }[] = [
  { key: 'categories', label: 'Categorías' },
  { key: 'units', label: 'Unidades' },
  { key: 'attributes', label: 'Atributos' },
]

interface Props {
  onClose: () => void
}

export function CatalogListsModal({ onClose }: Props) {
  const [tab, setTab] = useState<Tab>('categories')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink/20 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />

      <div
        role="dialog"
        aria-label="Categorías, unidades y atributos"
        className="relative flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-line/10 shadow-2xl"
      >
        <div className="flex items-center justify-between gap-3 border-b border-line bg-surface px-6 py-4">
          <div className="flex gap-2">
            {TABS.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setTab(item.key)}
                className={`min-h-11 rounded-lg px-4 text-base font-semibold transition-colors ${
                  tab === item.key
                    ? 'bg-brand text-brand-contrast'
                    : 'border border-line bg-surface hover:bg-surface-brand'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="min-h-11 rounded-lg border border-line bg-surface px-4 text-base font-semibold transition-colors hover:bg-surface-brand"
          >
            Cerrar
          </button>
        </div>

        <div className="overflow-y-auto p-4">
          {tab === 'categories' && <CategoriesPage />}
          {tab === 'units' && <UnitsPage />}
          {tab === 'attributes' && <AttributesPage />}
        </div>
      </div>
    </div>
  )
}
