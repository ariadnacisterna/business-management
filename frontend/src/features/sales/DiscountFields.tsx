import { PriceInput } from '../../shared/PriceInput'

const inputClasses =
  'h-14 w-full rounded-lg border border-line bg-surface px-3 text-lg focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/10'

interface Props {
  pesosText: string
  percentText: string
  onChangePesos: (value: string) => void
  onChangePercent: (raw: string) => void
}

export function DiscountFields({ pesosText, percentText, onChangePesos, onChangePercent }: Props) {
  return (
    <div className="grid w-64 max-w-full grid-cols-2 gap-2">
      <div className="flex min-w-0 flex-col">
        <PriceInput
          value={pesosText}
          onChange={onChangePesos}
          placeholder="0"
          ariaLabel="Descuento en pesos"
          className={`${inputClasses} pl-8`}
        />
      </div>
      <div className="flex min-w-0 flex-col">
        <div className="relative">
          <input
            value={percentText}
            onChange={(event) => onChangePercent(event.target.value)}
            inputMode="decimal"
            placeholder="0"
            aria-label="Descuento en porcentaje"
            className={`${inputClasses} pr-8`}
          />
          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-lg font-bold opacity-60">%</span>
        </div>
      </div>
    </div>
  )
}
