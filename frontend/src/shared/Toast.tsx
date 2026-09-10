import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import { CloseButton } from './CloseButton'
import { CheckIcon, CrossIcon } from './icons'

type ToastType = 'success' | 'error'

interface ToastRecord {
  id: number
  type: ToastType
  message: string
}

interface ToastContextValue {
  showSuccess: (message: string) => void
  showError: (message: string) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

const AUTO_DISMISS_MS = 5000

let nextToastId = 1

interface ToastItemProps {
  toast: ToastRecord
  onClose: () => void
  onPause: () => void
  onResume: () => void
}

function ToastItem({ toast, onClose, onPause, onResume }: ToastItemProps) {
  const isError = toast.type === 'error'
  const heading = isError ? 'Error' : '¡Listo!'

  return (
    <div
      role={isError ? 'alert' : 'status'}
      onMouseEnter={onPause}
      onMouseLeave={onResume}
      onFocus={onPause}
      onBlur={onResume}
      className="pointer-events-auto relative flex w-full max-w-md flex-col items-center gap-2 rounded-2xl border border-line bg-surface px-6 pb-7 pt-12 text-center shadow-2xl"
    >
      <span
        className={`absolute -top-8 flex h-16 w-16 items-center justify-center rounded-full border-4 border-surface text-white ${
          isError ? 'bg-danger' : 'bg-success'
        }`}
      >
        {isError ? <CrossIcon className="h-8 w-8" /> : <CheckIcon className="h-8 w-8" />}
      </span>

      <CloseButton onClose={onClose} className="absolute right-1 top-1" />

      <h3 className="m-0 text-3xl font-bold">{heading}</h3>
      <p className="m-0 text-xl opacity-80">{toast.message}</p>
    </div>
  )
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastRecord[]>([])
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>())

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id)
    if (timer !== undefined) {
      clearTimeout(timer)
      timers.current.delete(id)
    }
    setToasts((prev) => prev.filter((toast) => toast.id !== id))
  }, [])

  const schedule = useCallback(
    (id: number) => {
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), AUTO_DISMISS_MS),
      )
    },
    [dismiss],
  )

  const pause = useCallback((id: number) => {
    const timer = timers.current.get(id)
    if (timer !== undefined) {
      clearTimeout(timer)
      timers.current.delete(id)
    }
  }, [])

  const resume = useCallback(
    (id: number) => {
      if (timers.current.has(id)) return
      schedule(id)
    },
    [schedule],
  )

  const show = useCallback(
    (type: ToastType, message: string) => {
      const id = nextToastId++
      setToasts((prev) => [{ id, type, message }, ...prev])
      schedule(id)
    },
    [schedule],
  )

  const value = useMemo<ToastContextValue>(
    () => ({
      showSuccess: (message: string) => show('success', message),
      showError: (message: string) => show('error', message),
    }),
    [show],
  )

  return (
    <ToastContext.Provider value={value}>
      {children}
      {toasts.length > 0 && (
        <div className="pointer-events-none fixed inset-0 z-[65] bg-ink/20 backdrop-blur-sm" aria-hidden="true" />
      )}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-0 z-[70] flex flex-col items-center justify-center gap-4 p-4"
      >
        {toasts.map((toast) => (
          <ToastItem
            key={toast.id}
            toast={toast}
            onClose={() => dismiss(toast.id)}
            onPause={() => pause(toast.id)}
            onResume={() => resume(toast.id)}
          />
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext)
  if (context === null) {
    throw new Error('useToast must be used within a ToastProvider')
  }
  return context
}
