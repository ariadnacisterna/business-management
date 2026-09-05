import type { Variant } from '../../api/types'

function describeVariant(variant: Variant): string {
  return variant.label ?? `variante #${variant.id}`
}

export function DuplicateWarning({ duplicates }: { duplicates: Variant[] }) {
  if (duplicates.length === 0) return null

  return (
    <div className="rounded-lg border border-warning p-4" role="alert">
      <p className="m-0 mb-1 font-semibold text-warning">Ya existe algo parecido. Revisalo si fue un error:</p>
      <ul className="m-0 pl-5">
        {duplicates.map((duplicate) => (
          <li key={duplicate.id}>{describeVariant(duplicate)}</li>
        ))}
      </ul>
    </div>
  )
}
