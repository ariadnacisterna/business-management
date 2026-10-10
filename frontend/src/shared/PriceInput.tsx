import { useId, useState } from 'react'

interface Props {
  id?: string
  value: string
  placeholder?: string
  onChange: (value: string) => void
  ariaLabel: string
  ariaDescribedBy?: string
  className: string
  disabled?: boolean
  required?: boolean
  autoFocus?: boolean
}

function sanitizeAmount(raw: string): string {
  const normalized = raw.replace(/,/g, '.')
  const digitsAndDots = normalized.replace(/[^\d.]/g, '')
  const [wholePart, ...rest] = digitsAndDots.split('.')
  return rest.length > 0 ? `${wholePart}.${rest.join('')}` : digitsAndDots
}

function hasInvalidChars(raw: string): boolean {
  return /[^\d.,]/.test(raw)
}

export function PriceInput({
  id,
  value,
  placeholder,
  onChange,
  ariaLabel,
  ariaDescribedBy,
  className,
  disabled = false,
  required = false,
  autoFocus = false,
}: Props) {
  const [showInvalidCharError, setShowInvalidCharError] = useState(false)
  const invalidCharErrorId = useId()
  const generatedInputId = useId()
  const describedBy = [ariaDescribedBy, showInvalidCharError ? invalidCharErrorId : undefined]
    .filter((value): value is string => value !== undefined)
    .join(' ')

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const raw = event.target.value
    const sanitized = sanitizeAmount(raw)
    setShowInvalidCharError(hasInvalidChars(raw))
    onChange(sanitized)
  }

  return (
    <div>
      <div className="relative">
        <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-lg font-bold opacity-60">$</span>
        <input
          id={id ?? generatedInputId}
          value={value}
          placeholder={placeholder}
          onChange={handleChange}
          type="text"
          inputMode="decimal"
          aria-label={ariaLabel}
          aria-invalid={describedBy !== '' || undefined}
          aria-describedby={describedBy === '' ? undefined : describedBy}
          disabled={disabled}
          required={required}
          autoFocus={autoFocus}
          className={className}
        />
      </div>
      {showInvalidCharError && (
        <span id={invalidCharErrorId} role="alert" className="text-sm text-danger">
          Solo se permiten números.
        </span>
      )}
    </div>
  )
}
