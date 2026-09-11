import { useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { fetchShortageCount } from '../../api/catalog'
import type { Account } from '../../api/types'
import { hasMinimumRole } from '../../features/access/roles'
import { Brand } from '../Brand'
import { NAV_ITEMS } from './navItems'
import { NavIconGlyph } from './NavIcon'

interface Props {
  isOpen: boolean
  onNavigate: () => void
  account: Account | null
}

function SidebarContent({
  account,
  onNavigate,
  collapsed = false,
  onToggleCollapse,
  shortageCount,
}: {
  account: Account | null
  onNavigate: () => void
  collapsed?: boolean
  onToggleCollapse?: () => void
  shortageCount: number
}) {
  const visibleNavItems = NAV_ITEMS.filter(
    (item) => item.minRole === undefined || hasMinimumRole(account, item.minRole),
  )

  return (
    <div className={`flex h-full shrink-0 flex-col bg-ink text-surface transition-[width] ${collapsed ? 'w-20' : 'w-64'}`}>
      <div
        className={`flex h-16 shrink-0 items-center gap-2 overflow-hidden border-b border-surface/10 ${
          collapsed ? 'justify-center px-2' : 'px-4'
        }`}
      >
        {collapsed ? (
          <button
            type="button"
            onClick={onToggleCollapse}
            aria-label="Expandir menú"
            title="Expandir menú"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand text-base font-bold text-brand-contrast transition-colors hover:bg-brand/90"
          >
            CD
          </button>
        ) : (
          <button
            type="button"
            onClick={onToggleCollapse}
            aria-label="Colapsar menú"
            title="Colapsar menú"
            className="flex w-full items-center rounded-lg py-1.5 transition-colors hover:bg-surface/10"
          >
            <Brand large={false} inverted />
          </button>
        )}
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {visibleNavItems.map((item) =>
          item.disabled === true ? (
            <span
              key={item.to}
              aria-disabled="true"
              title={collapsed ? `${item.label} (próximamente)` : undefined}
              className={`flex min-h-14 cursor-not-allowed items-center gap-3 rounded-lg px-4 py-3 text-lg font-medium text-surface/35 ${
                collapsed ? 'justify-center' : ''
              }`}
            >
              <NavIconGlyph icon={item.icon} className="h-6 w-6 shrink-0" />
              {!collapsed && (
                <span className="flex flex-col leading-tight">
                  <span>{item.label}</span>
                  <span className="text-sm font-normal">(próximamente)</span>
                </span>
              )}
            </span>
          ) : (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={onNavigate}
              title={collapsed ? item.label : undefined}
              className={({ isActive }) =>
                `flex min-h-14 items-center gap-3 rounded-lg px-4 py-3 text-lg font-medium transition-colors ${
                  collapsed ? 'justify-center' : ''
                } ${
                  isActive
                    ? 'bg-brand text-brand-contrast shadow-md'
                    : 'text-surface/70 hover:bg-surface/10 hover:text-surface'
                }`
              }
            >
              <NavIconGlyph icon={item.icon} className="h-6 w-6 shrink-0" />
              {!collapsed && <span className="flex-1">{item.label}</span>}
              {item.to === '/faltantes' && shortageCount > 0 && (
                <span
                  className={`flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full bg-danger px-1.5 text-sm font-bold text-white ${
                    collapsed ? 'absolute right-2 top-1' : ''
                  }`}
                >
                  {shortageCount}
                </span>
              )}
            </NavLink>
          ),
        )}
      </nav>
    </div>
  )
}

export function Sidebar({ isOpen, onNavigate, account }: Props) {
  const [collapsed, setCollapsed] = useState(false)
  const [shortageCount, setShortageCount] = useState(0)

  useEffect(() => {
    if (account === null) return
    fetchShortageCount()
      .then((result) => setShortageCount(result.count))
      .catch(() => {})
  }, [account])

  return (
    <>
      <div className="sticky top-0 hidden h-svh md:flex" aria-label="Navegación principal">
        <SidebarContent
          account={account}
          onNavigate={onNavigate}
          collapsed={collapsed}
          onToggleCollapse={() => setCollapsed((value) => !value)}
          shortageCount={shortageCount}
        />
      </div>

      {isOpen && (
        <div className="fixed inset-0 z-40 flex md:hidden" aria-label="Navegación principal">
          <SidebarContent account={account} onNavigate={onNavigate} shortageCount={shortageCount} />
          <div className="flex-1 bg-black/50" onClick={onNavigate} aria-hidden="true" />
        </div>
      )}
    </>
  )
}
