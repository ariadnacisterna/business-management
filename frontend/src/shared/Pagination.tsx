import { buildPageList } from './paginationList'
import { SelectMenu } from './SelectMenu'

interface Props {
  page: number
  totalPages: number
  onPageChange: (page: number) => void
}

const navButtonClasses =
  'h-11 rounded-full border border-line bg-surface px-4 text-lg font-semibold text-ink/60 transition-colors hover:bg-line/40 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-surface'

export function Pagination({ page, totalPages, onPageChange }: Props) {
  if (totalPages <= 1) return null

  const items = buildPageList(page, totalPages)
  const pageOptions = Array.from({ length: totalPages }, (_, index) => {
    const pageNumber = index + 1
    return { value: String(pageNumber), label: String(pageNumber) }
  })

  return (
    <nav aria-label="Paginación" className="flex w-full items-center justify-between gap-2 sm:w-auto sm:justify-center">
      <button
        type="button"
        onClick={() => onPageChange(page - 1)}
        disabled={page <= 1}
        className={navButtonClasses}
      >
        Anterior
      </button>

      <div className="flex min-w-0 flex-1 items-center gap-2 sm:hidden">
        <SelectMenu
          value={String(page)}
          onChange={(value) => onPageChange(Number(value))}
          ariaLabel="Ir a página"
          className="min-w-0 flex-1"
          options={pageOptions}
        />
        <span className="shrink-0 text-lg font-semibold text-ink/60">/ {totalPages}</span>
      </div>

      <div className="hidden flex-wrap items-center justify-center gap-2 sm:flex">
        {items.map((item, index) =>
          item === 'ellipsis' ? (
            <span key={`ellipsis-${index}`} className="px-1 text-lg text-ink/60" aria-hidden="true">
              …
            </span>
          ) : (
            <button
              key={item}
              type="button"
              aria-current={item === page ? 'page' : undefined}
              onClick={() => onPageChange(item)}
              className={`flex h-11 w-11 items-center justify-center rounded-full text-lg font-semibold transition-colors ${
                item === page
                  ? 'bg-line font-bold text-ink/60 shadow-lg'
                  : 'text-ink/60 hover:bg-line/40'
              }`}
            >
              {item}
            </button>
          ),
        )}
      </div>

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
