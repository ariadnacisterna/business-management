import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CLOSE_FLOATING_MENUS_EVENT } from './floatingMenuEvents'

const DATE_PICKER_OPEN_EVENT = 'date-picker-open'
const WEEKDAY_LABELS = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do']
const CALENDAR_WIDTH = 320
const VIEWPORT_MARGIN = 8

interface Props {
  value: string
  onChange: (value: string) => void
  ariaLabel: string
  placeholder?: string
  className?: string
  disabled?: boolean
  hasError?: boolean
  disableFuture?: boolean
}

export function formatISODateDisplay(value: string): string {
  const date = parseISODate(value)
  return date !== null ? formatDisplayDate(date) : value
}

function parseISODate(value: string): Date | null {
  if (value === '') return null
  const [year, month, day] = value.split('-').map(Number)
  if (year === undefined || month === undefined || day === undefined) return null
  const date = new Date(year, month - 1, day)
  return Number.isNaN(date.getTime()) ? null : date
}

function toISODate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function buildCalendarDays(viewYear: number, viewMonth: number): Date[] {
  const firstOfMonth = new Date(viewYear, viewMonth, 1)
  const mondayIndex = (firstOfMonth.getDay() + 6) % 7
  const gridStart = new Date(viewYear, viewMonth, 1 - mondayIndex)
  return Array.from({ length: 42 }, (_, index) => new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + index))
}

function formatDisplayDate(date: Date): string {
  return date.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function formatMonthName(viewMonth: number): string {
  const label = new Date(2000, viewMonth, 1).toLocaleDateString('es-AR', { month: 'long' })
  return label.charAt(0).toUpperCase() + label.slice(1)
}

function formatMonthAbbreviation(month: number): string {
  const label = new Date(2000, month, 1).toLocaleDateString('es-AR', { month: 'short' }).replace('.', '')
  return label.charAt(0).toUpperCase() + label.slice(1)
}

const YEARS_PER_PAGE = 12
const MONTHS_IN_YEAR = Array.from({ length: 12 }, (_, index) => index)

function buildYearPage(pageStartYear: number): number[] {
  return Array.from({ length: YEARS_PER_PAGE }, (_, index) => pageStartYear + index)
}

export function DatePicker({
  value,
  onChange,
  ariaLabel,
  placeholder = 'Seleccionar fecha',
  className = '',
  disabled = false,
  hasError = false,
  disableFuture = false,
}: Props) {
  const selectedDate = parseISODate(value)
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState({ top: 0, left: 0 })
  const [positioned, setPositioned] = useState(false)
  const [viewYear, setViewYear] = useState((selectedDate ?? today).getFullYear())
  const [viewMonth, setViewMonth] = useState((selectedDate ?? today).getMonth())
  const [pickerView, setPickerView] = useState<'days' | 'months' | 'years'>('days')
  const [yearPageStart, setYearPageStart] = useState(
    (selectedDate ?? today).getFullYear() - Math.floor(YEARS_PER_PAGE / 2),
  )
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const instanceId = useId()

  useEffect(() => {
    function handleOtherOpen(event: Event) {
      const detail = (event as CustomEvent<string>).detail
      if (detail !== instanceId) setOpen(false)
    }
    window.addEventListener(DATE_PICKER_OPEN_EVENT, handleOtherOpen)
    return () => window.removeEventListener(DATE_PICKER_OPEN_EVENT, handleOtherOpen)
  }, [instanceId])

  useEffect(() => {
    function handleCloseAll() {
      setOpen(false)
    }
    window.addEventListener(CLOSE_FLOATING_MENUS_EVENT, handleCloseAll)
    return () => window.removeEventListener(CLOSE_FLOATING_MENUS_EVENT, handleCloseAll)
  }, [])

  useLayoutEffect(() => {
    if (!open || triggerRef.current === null || panelRef.current === null) return

    const triggerRect = triggerRef.current.getBoundingClientRect()
    const panelHeight = panelRef.current.offsetHeight
    const spaceBelow = window.innerHeight - triggerRect.bottom
    const spaceAbove = triggerRect.top

    const top =
      spaceBelow >= panelHeight + VIEWPORT_MARGIN || spaceBelow >= spaceAbove
        ? triggerRect.bottom + 6
        : triggerRect.top - panelHeight - 6

    const maxLeft = window.innerWidth - CALENDAR_WIDTH - VIEWPORT_MARGIN
    const left = Math.min(Math.max(triggerRect.left, VIEWPORT_MARGIN), Math.max(maxLeft, VIEWPORT_MARGIN))

    setPosition({ top, left })
    setPositioned(true)
  }, [open, viewYear, viewMonth, pickerView])

  function openPicker() {
    window.dispatchEvent(new CustomEvent(DATE_PICKER_OPEN_EVENT, { detail: instanceId }))
    setViewYear((selectedDate ?? today).getFullYear())
    setViewMonth((selectedDate ?? today).getMonth())
    setPickerView('days')
    setPositioned(false)
    setOpen(true)
  }

  function toggle() {
    if (open) {
      setOpen(false)
      return
    }
    openPicker()
  }

  function goToPreviousMonth() {
    const previous = new Date(viewYear, viewMonth - 1, 1)
    setViewYear(previous.getFullYear())
    setViewMonth(previous.getMonth())
  }

  function goToNextMonth() {
    const next = new Date(viewYear, viewMonth + 1, 1)
    setViewYear(next.getFullYear())
    setViewMonth(next.getMonth())
  }

  function openYearPicker() {
    setYearPageStart(viewYear - Math.floor(YEARS_PER_PAGE / 2))
    setPickerView('years')
  }

  function selectYear(year: number) {
    setViewYear(year)
    setPickerView('days')
  }

  function openMonthPicker() {
    setPickerView('months')
  }

  function selectMonth(month: number) {
    setViewMonth(month)
    setPickerView('days')
  }

  const calendarDays = buildCalendarDays(viewYear, viewMonth)
  const yearPage = buildYearPage(yearPageStart)

  const isCurrentMonthAtOrAfterToday =
    viewYear > today.getFullYear() || (viewYear === today.getFullYear() && viewMonth >= today.getMonth())
  const isViewYearAtOrAfterToday = viewYear >= today.getFullYear()
  const isYearPageAtOrAfterToday = yearPageStart + YEARS_PER_PAGE > today.getFullYear()

  const nextMonthDisabled = disableFuture && isCurrentMonthAtOrAfterToday
  const nextYearInMonthsViewDisabled = disableFuture && isViewYearAtOrAfterToday
  const nextYearPageDisabled = disableFuture && isYearPageAtOrAfterToday

  return (
    <div className={`relative ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        onClick={toggle}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={ariaLabel}
        className={`flex h-12 w-full items-center justify-between gap-2 rounded-lg border bg-surface px-3 text-left text-lg transition-colors focus:outline-none focus:ring-2 disabled:cursor-not-allowed disabled:opacity-50 ${
          hasError ? 'border-danger focus:border-danger focus:ring-danger/10' : 'border-line focus:border-brand focus:ring-brand/10'
        }`}
      >
        <span className={selectedDate === null ? 'opacity-50' : ''}>
          {selectedDate !== null ? formatDisplayDate(selectedDate) : placeholder}
        </span>
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 shrink-0 opacity-60">
          <rect x="3" y="4.5" width="18" height="16" rx="2" />
          <path d="M3 9h18M8 3v3M16 3v3" />
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
            <div
              ref={panelRef}
              role="dialog"
              aria-label={ariaLabel}
              style={{
                top: position.top,
                left: position.left,
                width: CALENDAR_WIDTH,
                visibility: positioned ? 'visible' : 'hidden',
              }}
              className="fixed z-50 flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4 shadow-2xl"
            >
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={
                    pickerView === 'days'
                      ? goToPreviousMonth
                      : pickerView === 'months'
                        ? () => setViewYear((year) => year - 1)
                        : () => setYearPageStart((start) => start - YEARS_PER_PAGE)
                  }
                  aria-label={pickerView === 'years' ? 'Años anteriores' : 'Año anterior'}
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-line text-ink/60 transition-colors hover:bg-surface-brand"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                    <polyline points="15 18 9 12 15 6" />
                  </svg>
                </button>

                {pickerView === 'days' ? (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={openMonthPicker}
                      className="rounded-lg px-2 py-1 text-base font-bold capitalize transition-colors hover:bg-surface-brand"
                    >
                      {formatMonthName(viewMonth)}
                    </button>
                    <button
                      type="button"
                      onClick={openYearPicker}
                      className="rounded-lg px-2 py-1 text-base font-bold transition-colors hover:bg-surface-brand"
                    >
                      {viewYear}
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setPickerView('days')}
                    className="rounded-lg px-2 py-1 text-base font-bold transition-colors hover:bg-surface-brand"
                  >
                    {pickerView === 'months' ? viewYear : `${yearPage[0]} - ${yearPage[yearPage.length - 1]}`}
                  </button>
                )}

                <button
                  type="button"
                  onClick={
                    pickerView === 'days'
                      ? goToNextMonth
                      : pickerView === 'months'
                        ? () => setViewYear((year) => year + 1)
                        : () => setYearPageStart((start) => start + YEARS_PER_PAGE)
                  }
                  disabled={
                    pickerView === 'days'
                      ? nextMonthDisabled
                      : pickerView === 'months'
                        ? nextYearInMonthsViewDisabled
                        : nextYearPageDisabled
                  }
                  aria-label={pickerView === 'years' ? 'Años siguientes' : 'Año siguiente'}
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-line text-ink/60 transition-colors hover:bg-surface-brand disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </button>
              </div>

              {pickerView === 'years' ? (
                <div className="grid grid-cols-3 gap-2">
                  {yearPage.map((year) => {
                    const yearDisabled = disableFuture && year > today.getFullYear()
                    return (
                      <button
                        key={year}
                        type="button"
                        onClick={() => selectYear(year)}
                        disabled={yearDisabled}
                        className={`flex h-11 items-center justify-center rounded-lg text-base font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent ${
                          year === viewYear ? 'bg-brand text-brand-contrast' : 'text-ink hover:bg-surface-brand'
                        }`}
                      >
                        {year}
                      </button>
                    )
                  })}
                </div>
              ) : pickerView === 'months' ? (
                <div className="grid grid-cols-3 gap-2">
                  {MONTHS_IN_YEAR.map((month) => {
                    const monthDisabled =
                      disableFuture && viewYear === today.getFullYear() && month > today.getMonth()
                    return (
                      <button
                        key={month}
                        type="button"
                        onClick={() => selectMonth(month)}
                        disabled={monthDisabled}
                        className={`flex h-11 items-center justify-center rounded-lg text-base font-semibold capitalize transition-colors disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent ${
                          month === viewMonth ? 'bg-brand text-brand-contrast' : 'text-ink hover:bg-surface-brand'
                        }`}
                      >
                        {formatMonthAbbreviation(month)}
                      </button>
                    )
                  })}
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-7 gap-1 border-b border-line pb-2">
                    {WEEKDAY_LABELS.map((label) => (
                      <span key={label} className="text-center text-sm font-semibold uppercase opacity-40">
                        {label}
                      </span>
                    ))}
                  </div>

                  <div className="grid grid-cols-7 gap-1">
                    {calendarDays.map((day) => {
                      const inCurrentMonth = day.getMonth() === viewMonth
                      const isSelected = selectedDate !== null && isSameDay(day, selectedDate)
                      const isToday = isSameDay(day, today)
                      const isFuture = disableFuture && day.getTime() > today.getTime()

                      return (
                        <button
                          key={day.toISOString()}
                          type="button"
                          aria-label={formatDisplayDate(day)}
                          onClick={() => onChange(toISODate(day))}
                          disabled={isFuture}
                          className={`flex h-9 w-9 items-center justify-center rounded-full text-base font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent ${
                            isSelected
                              ? 'bg-brand text-brand-contrast'
                              : isToday
                                ? 'border-2 border-brand text-brand'
                                : inCurrentMonth
                                  ? 'text-ink hover:bg-surface-brand'
                                  : 'text-ink/30 hover:bg-surface-brand'
                          }`}
                        >
                          {day.getDate()}
                        </button>
                      )
                    })}
                  </div>
                </>
              )}

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false)
                    triggerRef.current?.focus()
                  }}
                  className="h-10 rounded-lg bg-brand px-5 text-base font-bold text-brand-contrast transition-colors hover:bg-brand/90"
                >
                  Listo
                </button>
              </div>
            </div>
          </>,
          document.body,
        )}
    </div>
  )
}
