import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { useAuth } from '../../features/access/AuthContext'
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
      <Sidebar isOpen={sidebarOpen} onNavigate={() => setSidebarOpen(false)} />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="relative flex h-16 items-center gap-4 border-b border-line px-4 md:px-6">
          <button
            type="button"
            onClick={() => setSidebarOpen((open) => !open)}
            aria-label="Abrir menú"
            aria-expanded={sidebarOpen}
            className="flex h-11 w-11 items-center justify-center rounded-lg transition-colors hover:bg-surface-brand md:hidden"
          >
            <span aria-hidden="true">☰</span>
          </button>

          <HeaderClock />

          {activeBusinessName !== undefined && (
            <p className="absolute left-1/2 hidden -translate-x-1/2 text-2xl font-bold uppercase tracking-wide text-ink sm:block">
              {activeBusinessName}
            </p>
          )}

          <div className="ml-auto flex items-center gap-3">
            <AccountMenu account={account} onLogout={logout} onSwitchBusiness={switchBusiness} />
          </div>
        </header>

        <main className="flex-1 p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
