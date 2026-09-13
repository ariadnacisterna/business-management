import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CLOSE_FLOATING_MENUS_EVENT } from './floatingMenuEvents'

const MULTI_SELECT_MENU_OPEN_EVENT = 'multi-select-menu-open'

export interface MultiSelectOption<T extends string> {
  value: T
  label: string
}

interface Props<T extends string> {
  value: T[]
  options: MultiSelectOption<T>[]
  onChange: (value: T[]) => void
  ariaLabel: string
  placeholder: string
  className?: string
  disabled?: boolean
  hasError?: boolean
  onBlur?: () => void
}

const VIEWPORT_MARGIN = 8

export function MultiSelectMenu<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  placeholder,
  className = '',
  disabled = false,
  hasError = false,
  onBlur,
}: Props<T>) {
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState({ top: 0, left: 0, width: 0 })
  const [positioned, setPositioned] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([])
  const instanceId = useId()

  const selectedLabels = options.filter((option) => value.includes(option.value)).map((option) => option.label)

  useEffect(() => {
    function handleOtherOpen(event: Event) {
      const detail = (event as CustomEvent<string>).detail
      if (detail !== instanceId) setOpen(false)
    }
    window.addEventListener(MULTI_SELECT_MENU_OPEN_EVENT, handleOtherOpen)
    return () => window.removeEventListener(MULTI_SELECT_MENU_OPEN_EVENT, handleOtherOpen)
  }, [instanceId])

  useEffect(() => {
    function handleCloseAll() {
      setOpen(false)
    }
    window.addEventListener(CLOSE_FLOATING_MENUS_EVENT, handleCloseAll)
    return () => window.removeEventListener(CLOSE_FLOATING_MENUS_EVENT, handleCloseAll)
  }, [])

  function openMenu() {
    window.dispatchEvent(new CustomEvent(MULTI_SELECT_MENU_OPEN_EVENT, { detail: instanceId }))
    setPositioned(false)
    setOpen(true)
  }

  function closeMenu() {
    setOpen(false)
    onBlur?.()
  }

  useEffect(() => {
    if (!open) return
    optionRefs.current[0]?.focus()
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
    if (open) {
      closeMenu()
      return
    }
    openMenu()
  }

  function toggleOption(optionValue: T) {
    onChange(value.includes(optionValue) ? value.filter((item) => item !== optionValue) : [...value, optionValue])
  }

  function focusOption(index: number) {
    const clamped = Math.max(0, Math.min(index, options.length - 1))
    optionRefs.current[clamped]?.focus()
  }

  function handleTriggerKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      if (!open) openMenu()
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
        closeMenu()
        triggerRef.current?.focus()
        break
      case 'Tab':
        closeMenu()
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
        className={`flex h-12 w-full items-center justify-between gap-2 rounded-lg border bg-surface px-3 text-left text-lg transition-colors focus:outline-none focus:ring-2 disabled:cursor-not-allowed disabled:opacity-50 ${
          hasError
            ? 'border-danger focus:border-danger focus:ring-danger/10'
            : 'border-line focus:border-brand focus:ring-brand/10'
        }`}
      >
        <span className={`truncate ${selectedLabels.length === 0 ? 'opacity-50' : ''}`}>
          {selectedLabels.length > 0 ? selectedLabels.join(', ') : placeholder}
        </span>
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
                closeMenu()
                triggerRef.current?.focus()
              }}
              aria-hidden="true"
            />
            <ul
              ref={listRef}
              role="listbox"
              aria-multiselectable="true"
              aria-label={ariaLabel}
              style={{
                top: position.top,
                left: position.left,
                width: position.width,
                visibility: positioned ? 'visible' : 'hidden',
              }}
              className="scrollbar-clean fixed z-50 max-h-64 overflow-y-auto rounded-xl border border-line bg-surface py-1 shadow-xl"
            >
              {options.map((option, index) => {
                const checked = value.includes(option.value)
                return (
                  <li key={option.value}>
                    <button
                      ref={(element) => {
                        optionRefs.current[index] = element
                      }}
                      type="button"
                      role="option"
                      aria-selected={checked}
                      onClick={() => toggleOption(option.value)}
                      onKeyDown={(event) => handleOptionKeyDown(event, index)}
                      className={`flex w-full items-center gap-3 px-4 py-2.5 text-left text-lg transition-colors hover:bg-surface-brand focus:bg-surface-brand focus:outline-none ${
                        checked ? 'font-semibold text-brand' : ''
                      }`}
                    >
                      <span
                        aria-hidden="true"
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 ${
                          checked ? 'border-brand bg-brand text-brand-contrast' : 'border-line'
                        }`}
                      >
                        {checked && (
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        )}
                      </span>
                      {option.label}
                    </button>
                  </li>
                )
              })}
            </ul>
          </>,
          document.body,
        )}
    </div>
  )
}
