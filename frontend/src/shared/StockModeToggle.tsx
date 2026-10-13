import type { Presentation } from '../api/types'
import type { StockEntryMode } from './presentation'

interface Props {
  presentation: Presentation
  abbreviation: string
  mode: StockEntryMode
  onChange: (mode: StockEntryMode) => void
  disabled?: boolean
  label?: string
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

export function StockModeToggle({ presentation, abbreviation, mode, onChange, disabled = false, label = 'Cargar en' }: Props) {
  const options: { value: StockEntryMode; text: string }[] = [
    { value: 'presentation', text: capitalize(presentation.plural_name) },
    { value: 'unit', text: abbreviation === '' ? 'Sueltos' : `Sueltos (${abbreviation})` },
  ]
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-col gap-1.5">
      <span className="text-lg font-semibold opacity-70">{label}</span>
      <div className="grid grid-cols-2 gap-2">
        {options.map((option) => {
          const selected = mode === option.value
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={disabled}
              onClick={() => onChange(option.value)}
              className={`min-h-12 rounded-lg border-2 px-3 text-lg font-bold transition-colors [overflow-wrap:anywhere] disabled:opacity-60 ${
                selected
                  ? 'border-brand bg-brand text-brand-contrast'
                  : 'border-line bg-surface text-ink hover:bg-surface-brand'
              }`}
            >
              {option.text}
            </button>
          )
        })}
      </div>
    </div>
  )
}
