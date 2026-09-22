import { useState } from 'react'
import { formatPriceExact } from './formatPrice'
import {
  formatDeltaValue,
  hasInvalidDeltaChars,
  sanitizeSignedDelta,
  toUnits,
} from './signedDelta'
import type { AllVariantsEvaluation, DeltaEvaluation, DeltaKind } from './signedDelta'

interface InputProps {
  kind: DeltaKind
  id?: string
  value: string
  onChange: (value: string) => void
  ariaLabel: string
  className: string
  disabled?: boolean
  autoFocus?: boolean
  placeholder?: string
  allowSign?: boolean
  allowDecimals?: boolean
}

export function SignedDeltaInput({
  kind,
  id,
  value,
  onChange,
  ariaLabel,
  className,
  disabled = false,
  autoFocus = false,
  placeholder,
  allowSign = true,
  allowDecimals = kind === 'price',
}: InputProps) {
  const [showInvalidCharError, setShowInvalidCharError] = useState(false)

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const raw = event.target.value
    const sanitized = sanitizeSignedDelta(raw, allowDecimals)
    setShowInvalidCharError(
      allowSign
        ? hasInvalidDeltaChars(raw, allowDecimals)
        : hasInvalidDeltaChars(`0${raw}`, allowDecimals),
    )
    onChange(allowSign ? sanitized : sanitized.replace(/^[+-]/, ''))
  }

  return (
    <div className="flex w-full flex-col gap-2">
      <div className="relative">
        {allowDecimals && (
          <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-lg font-bold opacity-60">
            $
          </span>
        )}
        <input
          id={id}
          type="text"
          inputMode={allowDecimals ? 'decimal' : 'numeric'}
          autoComplete="off"
          value={value}
          placeholder={placeholder}
          onChange={handleChange}
          aria-label={ariaLabel}
          disabled={disabled}
          autoFocus={autoFocus}
          className={className}
        />
      </div>
      {showInvalidCharError && (
        <span role="alert" className="text-base text-danger">
          {allowDecimals ? 'Solo se permiten números.' : 'Solo se permiten números enteros.'}
        </span>
      )}
    </div>
  )
}

interface PreviewProps {
  kind: DeltaKind
  current: number | string
  evaluation: DeltaEvaluation
}

export function DeltaPreview({ kind, current, evaluation }: PreviewProps) {
  const label = kind === 'stock' ? 'Stock' : 'Precio'
  const from = formatDeltaValue(kind, toUnits(kind, current))
  const to = evaluation.result !== null ? formatDeltaValue(kind, evaluation.result) : '—'
  const danger = evaluation.state === 'invalid'

  return (
    <div className="flex flex-col gap-1">
      <p className={`m-0 text-xl font-bold ${danger ? 'text-danger' : 'text-ink/60'}`} data-testid="delta-preview">
        {label}: {from} → {to}
      </p>
      {evaluation.error !== null && (
        <p role="alert" className="m-0 text-lg text-danger">
          {evaluation.error}
        </p>
      )}
    </div>
  )
}

interface AllVariantsPreviewProps {
  evaluation: AllVariantsEvaluation
  skippedLabels: string[]
}

export function AllVariantsPreview({ evaluation, skippedLabels }: AllVariantsPreviewProps) {
  return (
    <div className="flex flex-col gap-1.5" data-testid="apply-all-preview">
      {evaluation.entries.map((entry) => (
        <p
          key={entry.label}
          className={`m-0 text-lg font-bold ${entry.evaluation.state === 'invalid' ? 'text-danger' : 'text-ink/60'}`}
        >
          {entry.label}: {formatPriceExact(entry.current)} →{' '}
          {entry.evaluation.result !== null ? formatDeltaValue('price', entry.evaluation.result) : '—'}
        </p>
      ))}
      {skippedLabels.map((label) => (
        <p key={label} className="m-0 text-lg opacity-70">
          {label}: sin precio, no se modifica
        </p>
      ))}
      {evaluation.error !== null && (
        <p role="alert" className="m-0 text-lg text-danger">
          {evaluation.error}
        </p>
      )}
      {evaluation.entries.length === 0 && (
        <p role="alert" className="m-0 text-lg text-danger">
          Ninguna variante tiene precio: cargá el precio inicial de cada una.
        </p>
      )}
    </div>
  )
}
