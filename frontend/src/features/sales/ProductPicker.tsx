import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type Ref } from 'react'
import type { SellableVariant } from '../../api/types'
import { formatAmount } from '../../shared/formatAmount'
import { formatStock } from '../../shared/presentation'
import { useScrollbar } from '../../shared/useScrollbar'
import { matchesSearch, variantDescription } from './saleMath'

const MAX_RESULTS = 24

interface Props {
  variants: SellableVariant[]
  onPick: (variant: SellableVariant) => void
  ariaLabel: string
  placeholder: string
  optionLabel: (variant: SellableVariant) => string
  inputRef?: Ref<HTMLInputElement>
  autoFocus?: boolean
  selectedIds?: number[]
  inline?: boolean
}

export function ProductPicker({
  variants,
  onPick,
  ariaLabel,
  placeholder,
  optionLabel,
  inputRef,
  autoFocus = false,
  selectedIds = [],
  inline = false,
}: Props) {
  const listId = useId()
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const optionRefs = useRef<(HTMLLIElement | null)[]>([])

  const matches = useMemo(
    () => (query.trim() === '' ? [] : variants.filter((variant) => matchesSearch(variant, query))),
    [variants, query],
  )
  const results = matches.slice(0, MAX_RESULTS)
  const expanded = (inline || open) && query.trim() !== ''
  const active = Math.min(activeIndex, Math.max(results.length - 1, 0))
  const { scrollRef, scrollbar, updateScrollbar, handleThumbPointerDown } = useScrollbar([
    results.length,
    expanded,
  ])

  useEffect(() => {
    if (expanded) optionRefs.current[active]?.scrollIntoView?.({ block: 'nearest' })
  }, [active, expanded])

  function changeQuery(value: string) {
    setQuery(value)
    setOpen(true)
    setActiveIndex(0)
  }

  function pick(variant: SellableVariant) {
    onPick(variant)
    setQuery('')
    setOpen(false)
    setActiveIndex(0)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (!expanded) {
        setOpen(true)
        return
      }
      if (results.length === 0) return
      const step = event.key === 'ArrowDown' ? 1 : -1
      setActiveIndex((active + step + results.length) % results.length)
      return
    }
    if (event.key === 'Enter' && expanded) {
      event.preventDefault()
      if (results.length > 0) pick(results[active])
      return
    }
    if (event.key === 'Escape' && expanded) {
      event.preventDefault()
      setOpen(false)
    }
  }

  return (
    <div className={inline ? 'flex min-h-0 flex-col gap-2' : 'relative'}>
      <div className="relative shrink-0">
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="pointer-events-none absolute left-3 top-0 my-auto h-14 w-5 opacity-50"
      >
        <circle cx="11" cy="11" r="7" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
      <input
        ref={inputRef}
        value={query}
        onChange={(event) => changeQuery(event.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        placeholder={placeholder}
        aria-label={ariaLabel}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={expanded}
        aria-controls={listId}
        aria-activedescendant={expanded && results.length > 0 ? `${listId}-${active}` : undefined}
        autoComplete="off"
        autoFocus={autoFocus}
        className="h-14 w-full rounded-lg border border-line bg-surface pl-10 pr-3 text-lg focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/10"
      />
      </div>
      {expanded && (
        <div
          className={
            inline
              ? 'flex min-h-0 flex-col rounded-xl border border-line bg-surface shadow-xl'
              : 'absolute inset-x-0 top-full z-30 mt-1 rounded-xl border border-line bg-surface shadow-xl'
          }
        >
          <div className={inline ? 'relative flex min-h-0 flex-col' : 'relative'}>
            <div
              ref={scrollRef}
              onScroll={updateScrollbar}
              className={`scrollbar-hidden ${inline ? 'min-h-0 flex-1' : 'max-h-[50vh]'} overflow-y-auto rounded-xl ${scrollbar.visible ? 'pr-5' : ''}`}
            >
              <div>
          {results.length > 0 ? (
            <ul id={listId} role="listbox" aria-label="Resultados de la búsqueda" className="m-0 list-none p-1">
              {results.map((variant, index) => {
                const description = variantDescription(variant)
                const inCart = selectedIds.includes(variant.variant_id)
                return (
                  <li
                    key={variant.variant_id}
                    id={`${listId}-${index}`}
                    ref={(element) => {
                      optionRefs.current[index] = element
                    }}
                    role="option"
                    aria-selected={index === active}
                    aria-label={optionLabel(variant)}
                    onMouseDown={(event) => event.preventDefault()}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => pick(variant)}
                    className={`flex cursor-pointer flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-lg px-3 py-3 ${
                      index === active ? 'bg-surface-brand' : ''
                    } ${inCart ? 'border-l-4 border-brand' : ''}`}
                  >
                    <span className="flex min-w-0 flex-col">
                      <span className="text-lg font-bold leading-tight [overflow-wrap:anywhere]">{variant.product_name}</span>
                      {description !== '' && (
                        <span className="text-base opacity-60 [overflow-wrap:anywhere]">{description}</span>
                      )}
                    </span>
                    <span className="flex flex-col items-end">
                      <span className="text-card-title text-brand">{formatAmount(variant.price_amount)}</span>
                      <span className="text-base opacity-70">
                        Stock: {formatStock(variant.quantity, variant.presentation, variant.unit_abbreviation)}
                      </span>
                    </span>
                  </li>
                )
              })}
            </ul>
          ) : (
            <p id={listId} className="m-0 p-4 text-lg opacity-70">
              No hay productos con precio que coincidan con la búsqueda.
            </p>
          )}
          {matches.length > MAX_RESULTS && (
            <p className="m-0 border-t border-line px-4 py-3 text-base opacity-70">
              Escribí más del nombre para ver el resto de los productos.
            </p>
          )}
              </div>
            </div>
            {scrollbar.visible && (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute right-0 top-0 w-3 rounded-full bg-line/40"
                style={{ bottom: 0 }}
              >
                <div
                  onPointerDown={handleThumbPointerDown}
                  onMouseDown={(event) => event.preventDefault()}
                  className="pointer-events-auto absolute right-0 w-3 cursor-grab rounded-full bg-brand active:cursor-grabbing"
                  style={{ top: scrollbar.thumbTop, height: scrollbar.thumbHeight }}
                />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
