const BRAND_NAME = 'Casa Diaco'
const BRAND_INITIALS = BRAND_NAME.split(' ')
  .map((word) => word.charAt(0))
  .join('')

interface BrandProps {
  tagline?: string
  large?: boolean
  inverted?: boolean
}

export function Brand({ tagline, large = false, inverted = false }: BrandProps) {
  if (large) {
    return (
      <div className="flex flex-col items-center gap-1">
        <div role="img" aria-label={BRAND_NAME} className="flex items-center gap-5">
          <span
            aria-hidden="true"
            className="flex h-24 w-24 shrink-0 items-center justify-center rounded-full bg-brand text-4xl font-extrabold text-brand-contrast"
          >
            {BRAND_INITIALS}
          </span>
          <span aria-hidden="true" className="h-20 w-0.5 shrink-0 bg-brand" />
          <span aria-hidden="true" className="w-min text-4xl font-extrabold uppercase leading-none tracking-wide text-brand">
            {BRAND_NAME}
          </span>
        </div>
        {tagline !== undefined && <span className="text-[max(0.8125rem,11px)] opacity-75">{tagline}</span>}
      </div>
    )
  }

  return (
    <div className="flex items-center gap-3">
      <span
        aria-hidden="true"
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand text-sm font-bold text-brand-contrast"
      >
        {BRAND_INITIALS}
      </span>
      <span className="flex flex-col leading-tight">
        <span className={`text-2xl font-bold ${inverted ? 'text-brand-contrast' : ''}`}>{BRAND_NAME}</span>
        {tagline !== undefined && (
          <span className={`text-[max(0.8125rem,11px)] opacity-75 ${inverted ? 'text-brand-contrast' : ''}`}>{tagline}</span>
        )}
      </span>
    </div>
  )
}
