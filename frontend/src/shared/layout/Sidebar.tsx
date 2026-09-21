import { useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { fetchLowStockCount, fetchShortageCount } from '../../api/catalog'
import type { Account } from '../../api/types'
import { hasMinimumRole } from '../../features/access/roles'
import { Brand } from '../Brand'
import { NAV_GROUPS, SETTINGS_ITEM, type NavItem } from './navItems'
import { NavIconGlyph } from './NavIcon'

interface Props {
  isOpen: boolean
  onNavigate: () => void
  account: Account | null
}

function NavEntry({
  item,
  collapsed,
  onNavigate,
  lowStockCount,
  shortageCount,
}: {
  item: NavItem
  collapsed: boolean
  onNavigate: () => void
  lowStockCount: number
  shortageCount: number
}) {
  if (item.disabled === true) {
    return (
      <span
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
    )
  }

  return (
    <NavLink
      to={item.to}
      end={item.end}
      onClick={onNavigate}
      title={collapsed ? item.label : undefined}
      className={({ isActive }) =>
        `relative flex min-h-14 items-center gap-3 rounded-lg px-4 py-3 text-lg font-medium transition-colors ${
          collapsed ? 'justify-center' : ''
        } ${
          isActive
            ? 'bg-brand text-brand-contrast shadow-md'
            : 'text-surface/70 hover:bg-surface/10 hover:text-surface'
        }`
      }
    >
      <NavIconGlyph icon={item.icon} className="h-6 w-6 shrink-0" />
      {!collapsed && <span className="min-w-0 flex-1">{item.label}</span>}
      {item.to === '/inventario' && lowStockCount > 0 && (
        <span
          className={`flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full bg-[#f1c9c9] px-1.5 text-sm font-bold text-danger ${
            collapsed ? 'absolute -right-1 -top-1' : ''
          }`}
        >
          {lowStockCount}
        </span>
      )}
      {item.to === '/inventario' && shortageCount > 0 && (
        <span
          className={`flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full bg-warning/20 px-1.5 text-sm font-bold text-warning ${
            collapsed ? 'absolute -right-1 -bottom-1' : ''
          }`}
        >
          {shortageCount}
        </span>
      )}
    </NavLink>
  )
}

function SidebarContent({
  account,
  onNavigate,
  collapsed = false,
  onToggleCollapse,
  lowStockCount,
  shortageCount,
}: {
  account: Account | null
  onNavigate: () => void
  collapsed?: boolean
  onToggleCollapse?: () => void
  lowStockCount: number
  shortageCount: number
}) {
  const visibleGroups = NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter(
      (item) => item.minRole === undefined || hasMinimumRole(account, item.minRole),
    ),
  })).filter((group) => group.items.length > 0)

  const entryProps = { collapsed, onNavigate, lowStockCount, shortageCount }

  return (
    <div
      className={`flex h-full shrink-0 flex-col bg-ink text-surface transition-[width] ${
        collapsed ? 'w-20' : 'w-64 max-w-[85vw]'
      }`}
    >
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

      <nav className="flex min-h-0 flex-1 flex-col">
        <div className="flex-1 overflow-y-auto px-3 py-4">
          {visibleGroups.map((group, index) => (
            <div
              key={group.label ?? 'top'}
              role="group"
              aria-label={group.label ?? undefined}
              className="space-y-1"
            >
              {collapsed
                ? index > 0 && <div role="separator" className="mx-2 my-3 border-t border-surface/20" />
                : group.label !== null && (
                    <p className="m-0 px-4 pb-1 pt-4 text-sm font-semibold uppercase tracking-wider text-surface/50">
                      {group.label}
                    </p>
                  )}
              {group.items.map((item) => (
                <NavEntry key={item.to} item={item} {...entryProps} />
              ))}
            </div>
          ))}
        </div>

        <div className="shrink-0 border-t border-surface/10 px-3 py-3">
          <NavEntry item={SETTINGS_ITEM} {...entryProps} />
        </div>
      </nav>
    </div>
  )
}

export function Sidebar({ isOpen, onNavigate, account }: Props) {
  const [collapsed, setCollapsed] = useState(false)
  const [lowStockCount, setLowStockCount] = useState(0)
  const [shortageCount, setShortageCount] = useState(0)

  useEffect(() => {
    if (account === null) return
    function refresh() {
      fetchLowStockCount()
        .then((result) => setLowStockCount(result.count))
        .catch(() => {})
    }
    refresh()
    window.addEventListener('stock-updated', refresh)
    return () => window.removeEventListener('stock-updated', refresh)
  }, [account])

  useEffect(() => {
    if (account === null) return
    function refresh() {
      fetchShortageCount()
        .then((result) => setShortageCount(result.count))
        .catch(() => {})
    }
    refresh()
    window.addEventListener('shortages-updated', refresh)
    return () => window.removeEventListener('shortages-updated', refresh)
  }, [account])

  return (
    <>
      <div className="sticky top-0 hidden h-svh md:flex" aria-label="Navegación principal">
        <SidebarContent
          account={account}
          onNavigate={onNavigate}
          collapsed={collapsed}
          onToggleCollapse={() => setCollapsed((value) => !value)}
          lowStockCount={lowStockCount}
          shortageCount={shortageCount}
        />
      </div>

      {isOpen && (
        <div className="fixed inset-0 z-40 flex md:hidden" aria-label="Navegación principal">
          <SidebarContent
            account={account}
            onNavigate={onNavigate}
            lowStockCount={lowStockCount}
            shortageCount={shortageCount}
          />
          <div className="flex-1 bg-black/50" onClick={onNavigate} aria-hidden="true" />
        </div>
      )}
    </>
  )
}
