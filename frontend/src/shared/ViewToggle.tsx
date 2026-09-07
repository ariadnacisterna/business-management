export type ViewMode = 'table' | 'cards'

interface Props {
  mode: ViewMode
  onChange: (mode: ViewMode) => void
}

function segmentClasses(active: boolean): string {
  return `flex h-12 items-center gap-1.5 rounded-full px-5 text-base font-bold transition-colors ${
    active ? 'bg-brand text-brand-contrast shadow-sm' : 'text-ink/60 hover:text-brand'
  }`
}

export function ViewToggle({ mode, onChange }: Props) {
  return (
    <div className="inline-flex items-center gap-1 rounded-full border border-line bg-line/10 p-1">
      <button
        type="button"
        aria-pressed={mode === 'cards'}
        aria-label="Ver como tarjetas"
        onClick={() => onChange('cards')}
        className={segmentClasses(mode === 'cards')}
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-6 w-6"
        >
          <rect x="3" y="3" width="8" height="8" rx="1.5" />
          <rect x="13" y="3" width="8" height="8" rx="1.5" />
          <rect x="3" y="13" width="8" height="8" rx="1.5" />
          <rect x="13" y="13" width="8" height="8" rx="1.5" />
        </svg>
      </button>
      <button
        type="button"
        aria-pressed={mode === 'table'}
        aria-label="Ver como tabla"
        onClick={() => onChange('table')}
        className={segmentClasses(mode === 'table')}
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-6 w-6"
        >
          <rect x="3" y="4" width="18" height="16" rx="1.5" />
          <line x1="3" y1="10" x2="21" y2="10" />
          <line x1="9" y1="10" x2="9" y2="20" />
        </svg>
      </button>
    </div>
  )
}
