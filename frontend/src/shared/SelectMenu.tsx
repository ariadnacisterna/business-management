import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

export interface SelectOption<T extends string> {
  value: T
  label: string
}

interface Props<T extends string> {
  value: T
  options: SelectOption<T>[]
  onChange: (value: T) => void
  ariaLabel: string
  className?: string
  disabled?: boolean
}

const VIEWPORT_MARGIN = 8

export function SelectMenu<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  className = '',
  disabled = false,
}: Props<T>) {
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState({ top: 0, left: 0, width: 0 })
  const [positioned, setPositioned] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([])

  const selected = options.find((option) => option.value === value)

  useEffect(() => {
    if (!open) return
    const selectedIndex = options.findIndex((option) => option.value === value)
    const target = optionRefs.current[selectedIndex >= 0 ? selectedIndex : 0]
    target?.focus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useLayoutEffect(() => {
    if (!open || triggerRef.current === null || listRef.current === null) return

    const triggerRect = triggerRef.current.getBoundingClientRect()
    const listHeight = listRef.current.offsetHeight
    const spaceBelow = window.innerHeight - triggerRect.bottom
    const spaceAbove = triggerRect.top

    const top =
      spaceBelow >= listHeight + VIEWPORT_MARGIN || spaceBelow >= spaceAbove
        ? triggerRect.bottom + 6
        : triggerRect.top - listHeight - 6

    setPosition({ top, left: triggerRect.left, width: triggerRect.width })
    setPositioned(true)
  }, [open])

  function toggle() {
    if (!open) setPositioned(false)
    setOpen((v) => !v)
  }

  function focusOption(index: number) {
    const clamped = Math.max(0, Math.min(index, options.length - 1))
    optionRefs.current[clamped]?.focus()
  }

  function handleTriggerKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      if (!open) setPositioned(false)
      setOpen(true)
    }
  }

  function handleOptionKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        focusOption(index + 1)
        break
      case 'ArrowUp':
        event.preventDefault()
        focusOption(index - 1)
        break
      case 'Home':
        event.preventDefault()
        focusOption(0)
        break
      case 'End':
        event.preventDefault()
        focusOption(options.length - 1)
        break
      case 'Escape':
        event.preventDefault()
        setOpen(false)
        triggerRef.current?.focus()
        break
      case 'Tab':
        setOpen(false)
        break
    }
  }

  return (
    <div className={`relative ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        onClick={toggle}
        onKeyDown={handleTriggerKeyDown}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        className="flex h-12 w-full items-center justify-between gap-2 rounded-lg border border-line bg-surface px-3 text-left text-lg transition-colors focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/10 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className="truncate">{selected?.label ?? ''}</span>
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`h-4 w-4 shrink-0 opacity-60 transition-transform ${open ? 'rotate-180' : ''}`}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open &&
        createPortal(
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={() => {
                setOpen(false)
                triggerRef.current?.focus()
              }}
              aria-hidden="true"
            />
            <ul
              ref={listRef}
              role="listbox"
              aria-label={ariaLabel}
              style={{
                top: position.top,
                left: position.left,
                width: position.width,
                visibility: positioned ? 'visible' : 'hidden',
              }}
              className="scrollbar-clean fixed z-50 max-h-64 overflow-y-auto rounded-xl border border-line bg-surface py-1 shadow-xl"
            >
              {options.map((option, index) => (
                <li key={option.value}>
                  <button
                    ref={(element) => {
                      optionRefs.current[index] = element
                    }}
                    type="button"
                    role="option"
                    aria-selected={option.value === value}
                    onClick={() => {
                      onChange(option.value)
                      setOpen(false)
                      triggerRef.current?.focus()
                    }}
                    onKeyDown={(event) => handleOptionKeyDown(event, index)}
                    className={`w-full px-4 py-2.5 text-left text-lg transition-colors hover:bg-surface-brand focus:bg-surface-brand focus:outline-none ${
                      option.value === value ? 'bg-surface-brand font-semibold text-brand' : ''
                    }`}
                  >
                    {option.label}
                  </button>
                </li>
              ))}
            </ul>
          </>,
          document.body,
        )}
    </div>
  )
}
