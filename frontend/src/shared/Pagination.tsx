import { buildPageList } from './paginationList'

interface Props {
  page: number
  totalPages: number
  onPageChange: (page: number) => void
}

const navButtonClasses =
  'h-11 rounded-lg border border-line bg-surface px-4 text-lg font-semibold transition-colors hover:bg-surface-brand disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-surface'

export function Pagination({ page, totalPages, onPageChange }: Props) {
  if (totalPages <= 1) return null

  const items = buildPageList(page, totalPages)

  return (
    <nav aria-label="Paginación" className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => onPageChange(page - 1)}
        disabled={page <= 1}
        className={navButtonClasses}
      >
        Anterior
      </button>

      {items.map((item, index) =>
        item === 'ellipsis' ? (
          <span key={`ellipsis-${index}`} className="px-1 text-lg opacity-50" aria-hidden="true">
            …
          </span>
        ) : (
          <button
            key={item}
            type="button"
            aria-current={item === page ? 'page' : undefined}
            onClick={() => onPageChange(item)}
            className={`h-11 min-w-11 rounded-lg border px-3 text-lg font-semibold transition-colors ${
              item === page
                ? 'border-brand bg-brand text-brand-contrast'
                : 'border-line bg-surface hover:bg-surface-brand'
            }`}
          >
            {item}
          </button>
        ),
      )}

      <button
        type="button"
        onClick={() => onPageChange(page + 1)}
        disabled={page >= totalPages}
        className={navButtonClasses}
      >
        Siguiente
      </button>
    </nav>
  )
}
