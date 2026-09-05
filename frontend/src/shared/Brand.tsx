interface BrandProps {
  tagline?: string
  large?: boolean
  inverted?: boolean
}

export function Brand({ tagline, large = false, inverted = false }: BrandProps) {
  if (large) {
    return (
      <div className="flex flex-col items-center gap-1">
        <img src="/logo-casa-diaco.png" alt="Casa Diaco" className="h-32 w-auto" />
        {tagline !== undefined && <span className="text-[13px] opacity-75">{tagline}</span>}
      </div>
    )
  }

  return (
    <div className="flex items-center gap-3">
      <span
        aria-hidden="true"
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand text-sm font-bold text-brand-contrast"
      >
        CD
      </span>
      <span className="flex flex-col leading-tight">
        <span className={`text-2xl font-bold ${inverted ? 'text-brand-contrast' : ''}`}>Casa Diaco</span>
        {tagline !== undefined && (
          <span className={`text-[13px] opacity-75 ${inverted ? 'text-brand-contrast' : ''}`}>{tagline}</span>
        )}
      </span>
    </div>
  )
}
