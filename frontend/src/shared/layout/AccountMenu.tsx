import { useState } from 'react'
import type { Account } from '../../api/types'

interface Props {
  account: Account
  onLogout: () => Promise<void>
}

function initials(name: string): string {
  return name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

function firstName(name: string): string {
  return name.split(' ')[0]
}

export function AccountMenu({ account, onLogout }: Props) {
  const [open, setOpen] = useState(false)
  const [logoutError, setLogoutError] = useState<string | null>(null)

  async function handleLogout() {
    setLogoutError(null)
    try {
      await onLogout()
    } catch {
      setLogoutError('No se pudo cerrar sesión. Intentá de nuevo.')
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className={`flex h-14 items-center gap-3 rounded-lg border-2 px-4 transition-colors hover:border-brand hover:bg-ink/5 ${
          open ? 'border-brand' : 'border-transparent'
        }`}
      >
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand text-sm font-bold text-brand-contrast">
          {initials(account.name)}
        </span>
        <span className="hidden text-lg font-medium sm:block">{firstName(account.name)}</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} aria-hidden="true" />
          <div className="absolute right-0 top-full z-30 mt-1.5 w-60 overflow-hidden rounded-xl border border-line bg-surface shadow-xl">
            <div className="border-b border-line px-4 py-3">
              <p className="text-base font-semibold">{account.name}</p>
              {account.role !== null && <p className="mt-0.5 text-sm opacity-60">{account.role}</p>}
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="flex min-h-14 w-full items-center gap-3 px-4 text-base text-danger transition-colors hover:bg-danger/10"
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-5 w-5 shrink-0"
              >
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <path d="M16 17l5-5-5-5" />
                <path d="M21 12H9" />
              </svg>
              Cerrar sesión
            </button>
            {logoutError !== null && (
              <p role="alert" className="px-4 pb-3 text-sm text-danger">
                {logoutError}
              </p>
            )}
          </div>
        </>
      )}
    </div>
  )
}
