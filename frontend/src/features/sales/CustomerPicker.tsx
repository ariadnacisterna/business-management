import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Customer } from '../../api/types'
import { CLOSE_FLOATING_MENUS_EVENT } from '../../shared/floatingMenuEvents'
import { filterCustomers } from './customerSearch'

interface Props {
  customers: Customer[]
  value: string
  onChange: (value: string) => void
  onCreate: ((name: string) => void) | null
  hasError: boolean
  ariaLabel: string
}

type Entry = { kind: 'customer'; customer: Customer } | { kind: 'new' }

export function CustomerPicker({ customers, value, onChange, onCreate, hasError, ariaLabel }: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const [position, setPosition] = useState({ top: 0, left: 0, width: 0 })
  const [positioned, setPositioned] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const selected = customers.find((customer) => String(customer.id) === value)
  const matches = filterCustomers(customers, query)
  const entries: Entry[] = [
    ...matches.map((customer): Entry => ({ kind: 'customer', customer })),
    ...(onCreate !== null ? [{ kind: 'new' } as Entry] : []),
  ]
  const newLabel = query.trim() !== '' && matches.length === 0 ? `+ Nuevo cliente "${query.trim()}"` : '+ Nuevo cliente'
  const activeIndex = Math.min(active, Math.max(entries.length - 1, 0))

  useEffect(() => {
    function handleCloseAll() {
      setOpen(false)
    }
    window.addEventListener(CLOSE_FLOATING_MENUS_EVENT, handleCloseAll)
    return () => window.removeEventListener(CLOSE_FLOATING_MENUS_EVENT, handleCloseAll)
  }, [])

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  useLayoutEffect(() => {
    if (!open || triggerRef.current === null || listRef.current === null) return
    const triggerRect = triggerRef.current.getBoundingClientRect()
    const listHeight = listRef.current.offsetHeight
    const spaceBelow = window.innerHeight - triggerRect.bottom
    const top = spaceBelow >= listHeight + 8 || spaceBelow >= triggerRect.top ? triggerRect.bottom + 6 : triggerRect.top - listHeight - 6
    setPosition({ top, left: triggerRect.left, width: triggerRect.width })
    setPositioned(true)
  }, [open, query])

  function openMenu() {
    setQuery('')
    setActive(0)
    setPositioned(false)
    setOpen(true)
  }

  function close() {
    setOpen(false)
    triggerRef.current?.focus()
  }

  function choose(entry: Entry) {
    if (entry.kind === 'new') {
      setOpen(false)
      onCreate?.(query.trim())
      return
    }
    onChange(String(entry.customer.id))
    close()
  }

  function handleSearchKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActive(Math.min(activeIndex + 1, entries.length - 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActive(Math.max(activeIndex - 1, 0))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      event.stopPropagation()
      const entry = entries[activeIndex]
      if (entry !== undefined) choose(entry)
    } else if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      close()
    } else if (event.key === 'Tab') {
      setOpen(false)
    }
  }

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => (open ? setOpen(false) : openMenu())}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        aria-invalid={hasError || undefined}
        className={`flex min-h-12 w-full items-center justify-between gap-2 rounded-lg border bg-surface px-3 py-2 text-left text-lg transition-colors focus:outline-none focus:ring-2 ${
          hasError ? 'border-danger focus:border-danger focus:ring-danger/10' : 'border-line focus:border-brand focus:ring-brand/10'
        }`}
      >
        <span className="min-w-0 [overflow-wrap:anywhere]">{selected?.name ?? 'Elegí el cliente'}</span>
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`h-4 w-4 shrink-0 opacity-60 transition-transform ${open ? 'rotate-180' : ''}`}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open &&
        createPortal(
          <>
            <div className="fixed inset-0 z-40" onClick={close} aria-hidden="true" />
            <div
              ref={listRef}
              style={{ top: position.top, left: position.left, width: position.width, visibility: positioned ? 'visible' : 'hidden' }}
              className="fixed z-50 flex flex-col rounded-xl border border-line bg-surface shadow-xl"
            >
              <div className="p-2">
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value)
                    setActive(0)
                  }}
                  onKeyDown={handleSearchKeyDown}
                  aria-label="Buscar cliente"
                  placeholder="Buscar cliente"
                  className="h-12 w-full rounded-lg border border-line bg-surface px-3 text-lg focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/10"
                />
              </div>
              <ul role="listbox" aria-label={ariaLabel} className="scrollbar-clean m-0 max-h-56 list-none overflow-y-auto p-0 pb-1">
                {entries.map((entry, index) => {
                  const isNew = entry.kind === 'new'
                  const label = isNew ? newLabel : entry.customer.name
                  const isSelected = !isNew && String(entry.customer.id) === value
                  return (
                    <li key={isNew ? '__new__' : entry.customer.id}>
                      <button
                        type="button"
                        role="option"
                        tabIndex={-1}
                        aria-selected={isSelected}
                        onClick={() => choose(entry)}
                        onMouseEnter={() => setActive(index)}
                        className={`w-full px-4 py-2.5 text-left text-lg [overflow-wrap:anywhere] transition-colors ${
                          index === activeIndex ? 'bg-surface-brand' : ''
                        } ${isSelected ? 'font-semibold text-brand' : ''} ${isNew ? 'border-t border-line-soft font-semibold' : ''}`}
                      >
                        {label}
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          </>,
          document.body,
        )}
    </div>
  )
}
