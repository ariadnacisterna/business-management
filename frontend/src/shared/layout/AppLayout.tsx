import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { useAuth } from '../../features/access/useAuth'
import { ScrollToTopButton } from '../ScrollToTopButton'
import { AccountMenu } from './AccountMenu'
import { HeaderClock } from './HeaderClock'
import { Sidebar } from './Sidebar'
import { WelcomeModal } from './WelcomeModal'

export function AppLayout() {
  const { account, logout, switchBusiness } = useAuth()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  if (account === null) {
    return null
  }

  const activeBusinessName = account.businesses.find(
    (business) => business.id === account.active_business_id,
  )?.name

  return (
    <div className="flex min-h-svh bg-surface text-ink">
      <WelcomeModal />
      <Sidebar isOpen={sidebarOpen} onNavigate={() => setSidebarOpen(false)} account={account} />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex min-h-16 items-center gap-4 border-b border-line bg-surface px-4 py-2 md:relative md:z-auto md:px-6">
          <button
            type="button"
            onClick={() => setSidebarOpen((open) => !open)}
            aria-label="Abrir menú"
            aria-expanded={sidebarOpen}
            className="flex h-11 w-11 items-center justify-center rounded-lg transition-colors hover:bg-surface-brand md:hidden"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.25"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-6 w-6"
            >
              <line x1="4" y1="6" x2="20" y2="6" />
              <line x1="4" y1="12" x2="20" y2="12" />
              <line x1="4" y1="18" x2="20" y2="18" />
            </svg>
          </button>

          <HeaderClock />

          {activeBusinessName !== undefined && (
            <p className="m-0 hidden min-w-0 flex-1 text-center text-2xl font-bold uppercase leading-tight tracking-wide text-ink [overflow-wrap:break-word] sm:block">
              {activeBusinessName}
            </p>
          )}

          <div className="ml-auto flex shrink-0 items-center gap-3">
            <AccountMenu account={account} onLogout={logout} onSwitchBusiness={switchBusiness} />
          </div>
        </header>

        <main className="flex flex-1 flex-col p-4 md:p-6">
          <Outlet />
        </main>
      </div>

      <ScrollToTopButton />
    </div>
  )
}
