import { useState } from 'react'

interface Props {
  id?: string
  value: string
  placeholder?: string
  onChange: (value: string) => void
  ariaLabel: string
  className: string
  disabled?: boolean
  required?: boolean
  autoFocus?: boolean
}

function sanitizeAmount(raw: string): string {
  const digitsAndDots = raw.replace(/[^\d.]/g, '')
  const [wholePart, ...rest] = digitsAndDots.split('.')
  return rest.length > 0 ? `${wholePart}.${rest.join('')}` : digitsAndDots
}

export function PriceInput({
  id,
  value,
  placeholder,
  onChange,
  ariaLabel,
  className,
  disabled = false,
  required = false,
  autoFocus = false,
}: Props) {
  const [showInvalidCharError, setShowInvalidCharError] = useState(false)

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const raw = event.target.value
    const sanitized = sanitizeAmount(raw)
    setShowInvalidCharError(raw !== sanitized)
    onChange(sanitized)
  }

  return (
    <div>
      <div className="relative">
        <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-lg font-bold opacity-60">$</span>
        <input
          id={id}
          value={value}
          placeholder={placeholder}
          onChange={handleChange}
          type="text"
          inputMode="decimal"
          aria-label={ariaLabel}
          disabled={disabled}
          required={required}
          autoFocus={autoFocus}
          className={className}
        />
      </div>
      {showInvalidCharError && (
        <span role="alert" className="text-sm text-danger">
          Solo se permiten números.
        </span>
      )}
    </div>
  )
}
