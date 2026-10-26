import { useEffect, useId, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { CASH_UPDATED_EVENT, fetchCurrentCashRegister } from '../../api/cash'
import { fetchLowStockCount, fetchShortageCount } from '../../api/catalog'
import type { Account } from '../../api/types'
import { hasMinimumRole } from '../../features/access/roles'
import { Brand } from '../Brand'
import { formatMoney } from '../formatPrice'
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

  if (item.children !== undefined && !collapsed) {
    return <NavDisclosure item={item} onNavigate={onNavigate} lowStockCount={lowStockCount} shortageCount={shortageCount} />
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
      {item.children !== undefined && lowStockCount > 0 && (
        <CountBadge tone="danger" count={lowStockCount} className={collapsed ? 'absolute -right-1 -top-1' : ''} />
      )}
    </NavLink>
  )
}

function MyCashBox({ account, collapsed, onNavigate }: { account: Account | null; collapsed: boolean; onNavigate: () => void }) {
  const [cash, setCash] = useState<string | null>(null)

  useEffect(() => {
    if (account === null) return
    let latestRequest = 0
    function refresh() {
      latestRequest += 1
      const request = latestRequest
      fetchCurrentCashRegister()
        .then((register) => {
          if (request === latestRequest) setCash(register.expected_cash)
        })
        .catch(() => {})
    }
    refresh()
    window.addEventListener(CASH_UPDATED_EVENT, refresh)
    return () => {
      latestRequest += 1
      window.removeEventListener(CASH_UPDATED_EVENT, refresh)
    }
  }, [account])

  if (collapsed || cash === null) return null

  return (
    <NavLink
      to="/caja"
      onClick={onNavigate}
      aria-label={`Mi caja: ${formatMoney(cash)}`}
      className="mb-2 flex flex-col gap-0.5 rounded-lg border border-surface/20 px-4 py-3 transition-colors hover:bg-surface/10"
    >
      <span className="text-sm font-semibold uppercase tracking-wider text-surface/60">Mi caja</span>
      <span className="text-xl font-bold text-surface">{formatMoney(cash)}</span>
    </NavLink>
  )
}

function CountBadge({ count, tone, className = '' }: { count: number; tone: 'danger' | 'warning'; className?: string }) {
  const toneClasses = tone === 'danger' ? 'bg-danger-soft text-danger' : 'bg-warning/20 text-warning'
  return (
    <span
      className={`flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full px-1.5 text-sm font-bold ${toneClasses} ${className}`}
    >
      {count}
    </span>
  )
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`h-5 w-5 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  )
}

function NavDisclosure({
  item,
  onNavigate,
  lowStockCount,
  shortageCount,
}: {
  item: NavItem
  onNavigate: () => void
  lowStockCount: number
  shortageCount: number
}) {
  const location = useLocation()
  const children = item.children ?? []
  const insideGroup = children.some((child) => location.pathname.startsWith(child.to))
  const [manualOpen, setManualOpen] = useState<boolean | null>(null)
  const open = manualOpen ?? insideGroup
  const panelId = useId()

  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setManualOpen(!open)}
        className="flex min-h-14 w-full items-center gap-3 rounded-lg px-4 py-3 text-left text-lg font-medium text-surface/70 transition-colors hover:bg-surface/10 hover:text-surface"
      >
        <NavIconGlyph icon={item.icon} className="h-6 w-6 shrink-0" />
        <span className="min-w-0 flex-1">{item.label}</span>
        {!open && lowStockCount > 0 && <CountBadge tone="danger" count={lowStockCount} />}
        <ChevronIcon open={open} />
      </button>
      {open && (
        <div id={panelId} className="mt-1 flex flex-col gap-1 pl-6">
          {children.map((child) => (
            <NavLink
              key={child.to}
              to={child.to}
              onClick={onNavigate}
              className={({ isActive }) =>
                `flex min-h-14 items-center gap-3 rounded-lg px-4 py-3 text-lg font-medium transition-colors ${
                  isActive ? 'bg-brand text-brand-contrast shadow-md' : 'text-surface/70 hover:bg-surface/10 hover:text-surface'
                }`
              }
            >
              <span className="min-w-0 flex-1">{child.label}</span>
              {child.to === '/inventario/stock' && lowStockCount > 0 && (
                <CountBadge tone="danger" count={lowStockCount} />
              )}
              {child.to === '/inventario/faltantes' && shortageCount > 0 && (
                <CountBadge tone="warning" count={shortageCount} />
              )}
            </NavLink>
          ))}
        </div>
      )}
    </div>
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
          <MyCashBox account={account} collapsed={collapsed} onNavigate={onNavigate} />
          <NavEntry item={SETTINGS_ITEM} {...entryProps} />
        </div>
      </nav>
    </div>
  )
}

function keepCountUpdated(
  fetchCount: () => Promise<{ count: number }>,
  updateEvent: string,
  setCount: (count: number) => void,
): () => void {
  let latestRequest = 0
  function refresh() {
    latestRequest += 1
    const request = latestRequest
    fetchCount()
      .then((result) => {
        if (request === latestRequest) setCount(result.count)
      })
      .catch(() => {})
  }
  refresh()
  window.addEventListener(updateEvent, refresh)
  return () => {
    latestRequest += 1
    window.removeEventListener(updateEvent, refresh)
  }
}

export function Sidebar({ isOpen, onNavigate, account }: Props) {
  const [collapsed, setCollapsed] = useState(false)
  const [lowStockCount, setLowStockCount] = useState(0)
  const [shortageCount, setShortageCount] = useState(0)

  useEffect(() => {
    if (account === null) return
    return keepCountUpdated(fetchLowStockCount, 'stock-updated', setLowStockCount)
  }, [account])

  useEffect(() => {
    if (account === null) return
    return keepCountUpdated(fetchShortageCount, 'shortages-updated', setShortageCount)
  }, [account])

  useEffect(() => {
    if (!isOpen) return
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !event.defaultPrevented) onNavigate()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onNavigate])

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
