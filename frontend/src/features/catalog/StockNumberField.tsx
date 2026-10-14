interface Props {
  name: string
  label: string
  hint: string
  ariaLabel: string
  value: string
  onChange: (value: string) => void
  step: number
  inputMode: 'decimal' | 'numeric'
  error: string | null
}

export function StockNumberField({ name, label, hint, ariaLabel, value, onChange, step, inputMode, error }: Props) {
  const errorId = `${name}-error`
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="text-base font-semibold">
        {label} <span className="font-normal opacity-70">{hint}</span>
      </span>
      <input
        name={name}
        type="number"
        min={0}
        step={step}
        inputMode={inputMode}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label={ariaLabel}
        aria-invalid={error !== null || undefined}
        aria-describedby={error !== null ? errorId : undefined}
        className={`h-12 w-full rounded-lg border px-3.5 text-lg focus:outline-none focus:ring-2 ${
          error !== null
            ? 'border-danger focus:border-danger focus:ring-danger/10'
            : 'border-line focus:border-brand focus:ring-brand/10'
        }`}
      />
      {error !== null && (
        <span id={errorId} role="alert" className="text-sm text-danger">
          {error}
        </span>
      )}
    </label>
  )
}
