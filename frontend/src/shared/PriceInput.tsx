interface Props {
  value: string
  placeholder?: string
  onChange: (value: string) => void
  ariaLabel: string
  className: string
  disabled?: boolean
  required?: boolean
}

export function PriceInput({
  value,
  placeholder,
  onChange,
  ariaLabel,
  className,
  disabled = false,
  required = false,
}: Props) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-lg font-bold opacity-60">$</span>
      <input
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        type="number"
        min="0.01"
        step="0.01"
        inputMode="decimal"
        aria-label={ariaLabel}
        disabled={disabled}
        required={required}
        className={className}
      />
    </div>
  )
}
