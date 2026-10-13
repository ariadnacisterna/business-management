import { suggestPluralName } from './presentation'
import { presentationDraftError } from './presentationDraft'
import type { PresentationDraft } from './presentationDraft'

const inputClasses =
  'h-12 w-full rounded-lg border border-line bg-surface px-3.5 text-lg focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/10'

interface Props {
  draft: PresentationDraft
  onChange: (draft: PresentationDraft) => void
  unitAbbreviation: string
  allowDecimals: boolean
  disabled?: boolean
  showError?: boolean
}

export function PresentationFields({ draft, onChange, unitAbbreviation, allowDecimals, disabled = false, showError = false }: Props) {
  const error = presentationDraftError(draft, allowDecimals)
  const visibleError = showError || draft.quantity.trim() !== '' ? error : null

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-line p-3">
      <label className="flex items-center gap-3 text-lg font-semibold">
        <input
          name="product-has-presentation"
          type="checkbox"
          checked={draft.enabled}
          disabled={disabled}
          onChange={(event) => onChange({ ...draft, enabled: event.target.checked })}
          className="checkbox-brand h-6 w-6"
        />
        Se compra o se cuenta por presentación (rollo, caja, pack)
      </label>
      {draft.enabled && (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5 text-lg">
              <span className="font-semibold">Nombre en singular</span>
              <input
                name="presentation-name"
                type="text"
                placeholder="Ej. rollo"
                value={draft.name}
                disabled={disabled}
                onChange={(event) =>
                  onChange({
                    ...draft,
                    name: event.target.value,
                    pluralName: draft.pluralEdited ? draft.pluralName : suggestPluralName(event.target.value),
                  })
                }
                className={inputClasses}
              />
            </label>
            <label className="flex flex-col gap-1.5 text-lg">
              <span className="font-semibold">Nombre en plural</span>
              <input
                name="presentation-plural-name"
                type="text"
                placeholder="Ej. rollos"
                value={draft.pluralName}
                disabled={disabled}
                onChange={(event) => onChange({ ...draft, pluralName: event.target.value, pluralEdited: true })}
                className={inputClasses}
              />
            </label>
          </div>
          <label className="flex flex-col gap-1.5 text-lg">
            <span className="font-semibold">
              Cuánto trae cada {draft.name.trim() === '' ? 'presentación' : draft.name.trim()}
              {unitAbbreviation === '' ? '' : ` (en ${unitAbbreviation})`}
            </span>
            <input
              name="presentation-quantity"
              type="text"
              inputMode={allowDecimals ? 'decimal' : 'numeric'}
              autoComplete="off"
              placeholder="Ej. 50"
              value={draft.quantity}
              disabled={disabled}
              aria-invalid={visibleError !== null || undefined}
              onChange={(event) => onChange({ ...draft, quantity: event.target.value })}
              className={inputClasses}
            />
          </label>
          {visibleError !== null && (
            <span role="alert" className="text-base text-danger">
              {visibleError}
            </span>
          )}
        </>
      )}
    </div>
  )
}
