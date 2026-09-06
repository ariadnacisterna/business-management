import { buildPageList } from './paginationList'

interface Props {
  page: number
  totalPages: number
  onPageChange: (page: number) => void
}

const navButtonClasses =
  'table-header h-11 rounded-lg border border-line px-4 text-lg font-semibold text-ink transition-colors hover:bg-line/40 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent'

export function Pagination({ page, totalPages, onPageChange }: Props) {
  if (totalPages <= 1) return null

  const items = buildPageList(page, totalPages)

  return (
    <nav aria-label="Paginación" className="flex flex-wrap items-center justify-center gap-2">
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
            className={`flex h-11 w-11 items-center justify-center rounded-full border text-lg font-semibold transition-colors ${
              item === page
                ? 'table-header border-line font-bold text-ink'
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
