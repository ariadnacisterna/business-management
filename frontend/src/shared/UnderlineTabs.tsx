export interface UnderlineTab<T extends string> {
  value: T
  label: string
}

interface UnderlineTabsProps<T extends string> {
  tabs: readonly UnderlineTab<T>[]
  value: T
  onChange: (value: T) => void
}

export function UnderlineTabs<T extends string>({ tabs, value, onChange }: UnderlineTabsProps<T>) {
  return (
    <div className="flex gap-2 border-b border-line">
      {tabs.map((tab) => (
        <button
          key={tab.value}
          type="button"
          onClick={() => onChange(tab.value)}
          aria-pressed={value === tab.value}
          className={`min-h-12 px-4 text-lg font-semibold transition-colors ${
            value === tab.value ? 'border-b-2 border-brand text-brand' : 'text-ink/50 hover:text-ink'
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}
