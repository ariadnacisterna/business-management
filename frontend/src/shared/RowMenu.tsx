import type { ReactNode } from 'react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

const VIEWPORT_MARGIN = 8

export interface RowMenuItem {
  label: string
  onClick: () => void
  danger?: boolean
  success?: boolean
  icon?: ReactNode
  disabled?: boolean
}

interface Props {
  title: string
  subtitle?: string
  items: RowMenuItem[]
}

export function RowMenu({ title, subtitle, items }: Props) {
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState({ top: 0, right: 0 })
  const [positioned, setPositioned] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  function toggle() {
    if (!open && buttonRef.current !== null) {
      const rect = buttonRef.current.getBoundingClientRect()
      setPositioned(false)
      setPosition({ top: rect.bottom + 6, right: window.innerWidth - rect.right })
    }
    setOpen((value) => !value)
  }

  useLayoutEffect(() => {
    if (!open || buttonRef.current === null || menuRef.current === null) return

    const buttonRect = buttonRef.current.getBoundingClientRect()
    const menuHeight = menuRef.current.offsetHeight
    const spaceBelow = window.innerHeight - buttonRect.bottom
    const spaceAbove = buttonRect.top

    const top =
      spaceBelow >= menuHeight + VIEWPORT_MARGIN
        ? buttonRect.bottom + 6
        : spaceAbove >= menuHeight + VIEWPORT_MARGIN
          ? buttonRect.top - menuHeight - 6
          : Math.max(VIEWPORT_MARGIN, window.innerHeight - menuHeight - VIEWPORT_MARGIN)

    setPosition({ top, right: window.innerWidth - buttonRect.right })
    setPositioned(true)
  }, [open])

  useEffect(() => {
    if (!open) return
    function handleReposition() {
      setOpen(false)
    }
    window.addEventListener('scroll', handleReposition, true)
    window.addEventListener('resize', handleReposition)
    return () => {
      window.removeEventListener('scroll', handleReposition, true)
      window.removeEventListener('resize', handleReposition)
    }
  }, [open])

  return (
    <div className="relative inline-flex">
      <button
        ref={buttonRef}
        type="button"
        aria-label={`Acciones para ${title}`}
        aria-expanded={open}
        onClick={(event) => {
          event.stopPropagation()
          toggle()
        }}
        className={`flex h-11 w-11 items-center justify-center rounded-lg border transition-colors ${
          open
            ? 'border-brand bg-brand text-brand-contrast'
            : 'border-transparent text-ink/50 hover:border-brand/30 hover:bg-surface-brand hover:text-brand'
        }`}
      >
        <span className="flex flex-col items-center justify-center gap-[3px]" aria-hidden="true">
          <span className="block h-[3px] w-[3px] rounded-full bg-current" />
          <span className="block h-[3px] w-[3px] rounded-full bg-current" />
          <span className="block h-[3px] w-[3px] rounded-full bg-current" />
        </span>
      </button>

      {open &&
        createPortal(
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden="true" />
            <div
              ref={menuRef}
              style={{ top: position.top, right: position.right, visibility: positioned ? 'visible' : 'hidden' }}
              className="fixed z-50 max-h-[calc(100vh-1rem)] w-64 overflow-y-auto rounded-2xl border border-line bg-surface shadow-xl"
            >
              <div className="border-b border-line bg-ink/5 px-4 py-3">
                <p className="truncate text-base font-semibold">{title}</p>
                {subtitle !== undefined && (
                  <p className="mt-0.5 truncate font-mono text-xs uppercase tracking-wide opacity-50">{subtitle}</p>
                )}
              </div>
              <div className="py-1.5">
                {items.map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    disabled={item.disabled === true}
                    onClick={() => {
                      item.onClick()
                      setOpen(false)
                    }}
                    className={`flex w-full items-center gap-3 px-3.5 py-2.5 text-left text-base transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                      item.danger === true
                        ? 'text-danger enabled:hover:bg-danger/10'
                        : item.success === true
                          ? 'text-success enabled:hover:bg-success-soft'
                          : 'enabled:hover:bg-surface-brand enabled:hover:text-brand'
                    }`}
                  >
                    {item.icon !== undefined && (
                      <span
                        aria-hidden="true"
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-lg ${
                          item.danger === true
                            ? 'bg-danger/10'
                            : item.success === true
                              ? 'bg-success-soft'
                              : 'bg-ink/5'
                        }`}
                      >
                        {item.icon}
                      </span>
                    )}
                    <span>
                      {item.label}
                      {item.disabled === true && <span className="ml-1 opacity-70">(próximamente)</span>}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </>,
          document.body,
        )}
    </div>
  )
}
