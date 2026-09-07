import { useEffect, useMemo, useState } from 'react'
import {
  activateAccount,
  createAccount,
  deactivateAccount,
  fetchAccounts,
  resetAccountPassword,
  updateAccount,
} from '../../api/accounts'
import { ApiError } from '../../api/client'
import type { Business, ManagedAccount } from '../../api/types'
import { ROLES, type Role } from '../access/roles'
import { ConfirmDialog } from '../../shared/ConfirmDialog'
import { HighlightedText } from '../../shared/HighlightedText'
import { Pagination } from '../../shared/Pagination'
import { RowMenu } from '../../shared/RowMenu'
import { SelectMenu } from '../../shared/SelectMenu'
import { useTableScrollbar } from '../../shared/useTableScrollbar'

type Status = 'loading' | 'success' | 'error'
type RoleFilter = Role | 'all'
type BusinessFilter = number | 'all'
type StatusFilter = 'all' | 'active' | 'inactive'

const LOAD_ERROR_MESSAGE = 'No se pudieron cargar las cuentas.'
const SAVE_ERROR_MESSAGE = 'No se pudo guardar. Intentá de nuevo.'

const inputClasses =
  'h-12 rounded-lg border border-line bg-surface px-3 text-lg focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/10'
const primaryButtonClasses =
  'h-12 rounded-lg bg-brand px-5 text-base font-bold text-brand-contrast transition-colors hover:bg-brand/90 disabled:opacity-40'
const secondaryButtonClasses =
  'h-12 rounded-lg border border-line px-5 text-base font-semibold transition-colors hover:bg-surface-brand'

function initials(name: string): string {
  return name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

const ROLE_BADGE_CLASSES: Record<Role, string> = {
  Empleado: 'bg-role-empleado-soft text-role-empleado',
  Gerente: 'bg-role-gerente-soft text-role-gerente',
  Administrador: 'bg-role-administrador-soft text-role-administrador',
  Dueño: 'bg-role-dueno-soft text-role-dueno',
}

const BUSINESS_NAME_BADGE_CLASSES: Record<string, string> = {
  merceria: 'bg-business-merceria-soft text-business-merceria',
  despensa: 'bg-business-despensa-soft text-business-despensa',
}

const BUSINESS_BADGE_CLASSES = [
  'bg-business-1-soft text-business-1',
  'bg-business-2-soft text-business-2',
  'bg-business-3-soft text-business-3',
  'bg-business-4-soft text-business-4',
]

function normalizeBusinessName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
}

function businessBadgeClasses(business: Business): string {
  return (
    BUSINESS_NAME_BADGE_CLASSES[normalizeBusinessName(business.name)] ??
    BUSINESS_BADGE_CLASSES[business.id % BUSINESS_BADGE_CLASSES.length]
  )
}

interface AccountFormValues {
  name: string
  user_name: string
  role: Role
}

function AccountFormModal({
  title,
  initialValues,
  showPassword,
  onSubmit,
  onCancel,
}: {
  title: string
  initialValues: AccountFormValues
  showPassword: boolean
  onSubmit: (values: AccountFormValues & { initial_password?: string }) => Promise<void>
  onCancel: () => void
}) {
  const [name, setName] = useState(initialValues.name)
  const [userName, setUserName] = useState(initialValues.user_name)
  const [role, setRole] = useState<Role>(initialValues.role)
  const [password, setPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canSubmit =
    name.trim() !== '' && userName.trim() !== '' && (!showPassword || password.trim() !== '')

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!canSubmit) return
    setSaving(true)
    setError(null)
    try {
      await onSubmit({
        name: name.trim(),
        user_name: userName.trim(),
        role,
        ...(showPassword ? { initial_password: password } : {}),
      })
    } catch (submitError) {
      setError(submitError instanceof ApiError ? submitError.message : SAVE_ERROR_MESSAGE)
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink/20 backdrop-blur-sm" onClick={onCancel} aria-hidden="true" />
      <form
        onSubmit={handleSubmit}
        role="dialog"
        aria-label={title}
        className="relative flex w-full max-w-md flex-col gap-4 rounded-2xl bg-surface p-6 shadow-2xl"
      >
        <h2 className="m-0 text-2xl font-bold">{title}</h2>

        <label className="flex flex-col gap-1.5">
          <span className="text-base font-semibold">Nombre</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            disabled={saving}
            className={inputClasses}
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-base font-semibold">Usuario</span>
          <input
            value={userName}
            onChange={(event) => setUserName(event.target.value)}
            disabled={saving}
            className={inputClasses}
          />
        </label>

        {showPassword && (
          <label className="flex flex-col gap-1.5">
            <span className="text-base font-semibold">Contraseña inicial</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              disabled={saving}
              className={inputClasses}
            />
          </label>
        )}

        <label className="flex flex-col gap-1.5">
          <span className="text-base font-semibold">Rol</span>
          <SelectMenu
            value={role}
            onChange={(value: Role) => setRole(value)}
            ariaLabel="Rol"
            options={ROLES.map((candidate) => ({ value: candidate, label: candidate }))}
          />
        </label>

        {error !== null && (
          <p role="alert" className="m-0 text-base text-danger">
            {error}
          </p>
        )}

        <div className="flex gap-2">
          <button type="submit" disabled={!canSubmit || saving} className={`${primaryButtonClasses} flex-1`}>
            Guardar
          </button>
          <button type="button" onClick={onCancel} disabled={saving} className={`${secondaryButtonClasses} flex-1`}>
            Cancelar
          </button>
        </div>
      </form>
    </div>
  )
}

function ResetPasswordModal({
  accountName,
  onSubmit,
  onCancel,
}: {
  accountName: string
  onSubmit: (newPassword: string) => Promise<void>
  onCancel: () => void
}) {
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const mismatch = confirmation !== '' && password !== confirmation
  const canSubmit = password.trim() !== '' && password === confirmation

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!canSubmit) return
    setSaving(true)
    setError(null)
    try {
      await onSubmit(password)
    } catch (submitError) {
      setError(submitError instanceof ApiError ? submitError.message : SAVE_ERROR_MESSAGE)
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink/20 backdrop-blur-sm" onClick={onCancel} aria-hidden="true" />
      <form
        onSubmit={handleSubmit}
        role="dialog"
        aria-label="Restablecer contraseña"
        className="relative flex w-full max-w-sm flex-col gap-4 rounded-2xl bg-surface p-6 shadow-2xl"
      >
        <h2 className="m-0 text-2xl font-bold">Restablecer contraseña</h2>
        <p className="m-0 text-lg opacity-70">Nueva contraseña para "{accountName}".</p>

        <label className="flex flex-col gap-1.5">
          <span className="text-base font-semibold">Contraseña nueva</span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            disabled={saving}
            className={inputClasses}
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-base font-semibold">Repetir contraseña</span>
          <input
            type="password"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            disabled={saving}
            className={inputClasses}
          />
        </label>

        {mismatch && (
          <p role="alert" className="m-0 text-base text-danger">
            Las contraseñas no coinciden.
          </p>
        )}

        {error !== null && (
          <p role="alert" className="m-0 text-base text-danger">
            {error}
          </p>
        )}

        <div className="flex gap-2">
          <button type="submit" disabled={!canSubmit || saving} className={`${primaryButtonClasses} flex-1`}>
            Restablecer
          </button>
          <button type="button" onClick={onCancel} disabled={saving} className={`${secondaryButtonClasses} flex-1`}>
            Cancelar
          </button>
        </div>
      </form>
    </div>
  )
}

export function AccountsPage() {
  const [accounts, setAccounts] = useState<ManagedAccount[]>([])
  const [status, setStatus] = useState<Status>('loading')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const [searchInput, setSearchInput] = useState('')
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all')
  const [businessFilter, setBusinessFilter] = useState<BusinessFilter>('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [creating, setCreating] = useState(false)
  const [editingAccount, setEditingAccount] = useState<ManagedAccount | null>(null)
  const [resettingAccount, setResettingAccount] = useState<ManagedAccount | null>(null)
  const [confirmingAccount, setConfirmingAccount] = useState<ManagedAccount | null>(null)

  const { tableScrollRef, theadRef, scrollbar, updateScrollbar, handleThumbPointerDown } = useTableScrollbar([
    accounts,
  ])

  function load() {
    setStatus('loading')
    setLoadError(null)
    fetchAccounts()
      .then((result) => {
        setAccounts(result)
        setStatus('success')
      })
      .catch(() => {
        setLoadError(LOAD_ERROR_MESSAGE)
        setStatus('error')
      })
  }

  useEffect(load, [])

  const businessOptions = useMemo(() => {
    const byId = new Map<number, string>()
    for (const account of accounts) {
      for (const business of account.businesses) {
        byId.set(business.id, business.name)
      }
    }
    return [...byId.entries()]
      .sort(([a], [b]) => a - b)
      .map(([id, name]) => ({ id, name }))
  }, [accounts])

  const filtered = useMemo(() => {
    const query = searchInput.trim().toLowerCase()
    return accounts.filter((account) => {
      const matchesQuery =
        query === '' ||
        account.name.toLowerCase().includes(query) ||
        account.user_name.toLowerCase().includes(query)
      const matchesRole = roleFilter === 'all' || account.role === roleFilter
      const matchesBusiness =
        businessFilter === 'all' || account.businesses.some((business) => business.id === businessFilter)
      const matchesStatus = statusFilter === 'all' || account.status === statusFilter
      return matchesQuery && matchesRole && matchesBusiness && matchesStatus
    })
  }, [accounts, searchInput, roleFilter, businessFilter, statusFilter])

  const hasActiveFilters =
    searchInput !== '' || roleFilter !== 'all' || businessFilter !== 'all' || statusFilter !== 'all'

  function clearFilters() {
    setSearchInput('')
    setRoleFilter('all')
    setBusinessFilter('all')
    setStatusFilter('all')
    setPage(1)
  }

  function toggleSort() {
    setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'))
  }

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const comparison = a.name.localeCompare(b.name)
      return sortDir === 'asc' ? comparison : -comparison
    })
  }, [filtered, sortDir])

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize))
  const currentPage = Math.min(page, totalPages)
  const paginated = useMemo(
    () => sorted.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [sorted, currentPage, pageSize],
  )

  useEffect(() => {
    setPage(1)
  }, [searchInput, roleFilter, businessFilter, statusFilter, pageSize])

  function applyAccountUpdate(updated: ManagedAccount) {
    setAccounts((current) => current.map((item) => (item.id === updated.id ? updated : item)))
  }

  async function handleCreate(values: AccountFormValues & { initial_password?: string }) {
    const created = await createAccount({
      name: values.name,
      user_name: values.user_name,
      role: values.role,
      initial_password: values.initial_password ?? '',
    })
    setAccounts((current) => [...current, created])
    setCreating(false)
  }

  async function handleEdit(values: AccountFormValues) {
    if (editingAccount === null) return
    const updated = await updateAccount(editingAccount.id, {
      name: values.name,
      user_name: values.user_name,
      role: values.role,
    })
    applyAccountUpdate(updated)
    setEditingAccount(null)
  }

  async function handleResetPassword(newPassword: string) {
    if (resettingAccount === null) return
    const updated = await resetAccountPassword(resettingAccount.id, newPassword)
    applyAccountUpdate(updated)
    setResettingAccount(null)
  }

  function confirmToggleActive() {
    if (confirmingAccount === null) return
    const account = confirmingAccount
    setConfirmingAccount(null)
    setActionError(null)
    const request = account.status === 'active' ? deactivateAccount(account.id) : activateAccount(account.id)
    request.then(applyAccountUpdate).catch(() => {
      setActionError(
        account.status === 'active' ? 'No se pudo desactivar la cuenta.' : 'No se pudo activar la cuenta.',
      )
    })
  }

  return (
    <section className="-m-4 flex h-[calc(100svh-4rem)] flex-col gap-4 overflow-hidden bg-line/10 p-4 md:-m-6 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Cuentas</h1>
          <p className="mt-1 text-lg opacity-60">{accounts.length} cuentas registradas</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setCreating(true)}
            className={`${primaryButtonClasses} flex items-center gap-2`}
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-5 w-5"
            >
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Nueva cuenta
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <input
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          placeholder="Buscar nombre o usuario…"
          aria-label="Buscar cuentas"
          className={`${inputClasses} min-w-48 flex-1`}
        />
        <SelectMenu
          value={roleFilter}
          onChange={(value: RoleFilter) => setRoleFilter(value)}
          ariaLabel="Filtrar por rol"
          className="w-56"
          options={[
            { value: 'all', label: 'Todos los roles' },
            ...ROLES.map((role) => ({ value: role, label: role })),
          ]}
        />
        <SelectMenu
          value={businessFilter === 'all' ? 'all' : String(businessFilter)}
          onChange={(value) => setBusinessFilter(value === 'all' ? 'all' : Number(value))}
          ariaLabel="Filtrar por negocio"
          className="w-56"
          options={[
            { value: 'all', label: 'Todos los negocios' },
            ...businessOptions.map((business) => ({ value: String(business.id), label: business.name })),
          ]}
        />
        <SelectMenu
          value={statusFilter}
          onChange={(value: StatusFilter) => setStatusFilter(value)}
          ariaLabel="Filtrar por estado"
          className="w-56"
          options={[
            { value: 'all', label: 'Todos los estados' },
            { value: 'active', label: 'Activo' },
            { value: 'inactive', label: 'Inactivo' },
          ]}
        />
        {sorted.length > 10 && (
          <SelectMenu
            value={String(pageSize)}
            onChange={(value) => setPageSize(Number(value))}
            ariaLabel="Cantidad por página"
            className="w-56"
            options={[
              { value: '10', label: '10 por página' },
              { value: '25', label: '25 por página' },
              { value: '50', label: '50 por página' },
            ]}
          />
        )}
        <button
          type="button"
          disabled={!hasActiveFilters}
          onClick={clearFilters}
          className="h-12 w-56 rounded-lg border-2 border-brand bg-surface text-lg font-semibold text-brand transition-colors hover:bg-brand hover:text-brand-contrast disabled:cursor-not-allowed disabled:border-line disabled:bg-surface disabled:font-normal disabled:text-ink/40 disabled:hover:bg-surface disabled:hover:text-ink/40"
        >
          Limpiar búsqueda
        </button>
      </div>

      {actionError !== null && (
        <p
          role="alert"
          className="m-0 rounded-lg border border-danger/20 bg-danger/10 px-3.5 py-2.5 text-lg font-medium text-danger"
        >
          {actionError}
        </p>
      )}

      {status === 'loading' && (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-line bg-surface px-6 py-12 text-center" role="status">
          <span className="h-10 w-10 animate-spin rounded-full border-4 border-line border-t-brand" />
          <p className="text-xl font-semibold">Cargando…</p>
        </div>
      )}

      {status === 'error' && (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-line bg-surface px-6 py-12 text-center" role="alert">
          <p className="m-0 text-xl font-semibold">{loadError}</p>
          <button type="button" onClick={load} className={`${primaryButtonClasses} flex items-center gap-2`}>
            Reintentar
          </button>
        </div>
      )}

      {status === 'success' && sorted.length === 0 && (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-line bg-surface px-6 py-12 text-center">
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-10 w-10 opacity-40"
          >
            <circle cx="11" cy="11" r="7" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <p className="text-xl font-semibold">No hay cuentas que coincidan.</p>
        </div>
      )}

      {status === 'success' && sorted.length > 0 && (
        <>
        <div className="relative flex min-h-0 shrink flex-col overflow-hidden rounded-xl border border-line bg-surface">
          <div
            ref={tableScrollRef}
            onScroll={updateScrollbar}
            className="scrollbar-hidden min-h-0 flex-1 overflow-auto"
          >
            <table className="w-full min-w-[900px]">
              <thead ref={theadRef} className="sticky top-0 z-10">
                <tr className="table-header border-b border-line">
                  <th
                    onClick={toggleSort}
                    className="cursor-pointer whitespace-nowrap px-4 py-3 text-left text-sm font-bold uppercase tracking-wide opacity-60 transition-colors hover:text-brand"
                  >
                    Nombre
                    <span className="ml-1.5 text-lg leading-none">{sortDir === 'asc' ? '↑' : '↓'}</span>
                  </th>
                  <th className="whitespace-nowrap px-4 py-3 text-left text-sm font-bold uppercase tracking-wide opacity-60">Usuario</th>
                  <th className="whitespace-nowrap px-4 py-3 text-left text-sm font-bold uppercase tracking-wide opacity-60">Rol</th>
                  <th className="whitespace-nowrap px-4 py-3 text-left text-sm font-bold uppercase tracking-wide opacity-60">Negocio</th>
                  <th className="whitespace-nowrap py-3 pl-8 pr-4 text-left text-sm font-bold uppercase tracking-wide opacity-60">Estado</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {paginated.map((account) => (
                  <tr key={account.id} className="border-t border-line transition-colors hover:bg-surface-brand/60">
                    <td className="max-w-xs px-4 py-3.5">
                      <div className="flex items-center gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand text-sm font-bold text-brand-contrast">
                          {initials(account.name)}
                        </span>
                        <span className="text-lg font-semibold">
                          <HighlightedText text={account.name} query={searchInput} />
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-lg opacity-70">
                      <HighlightedText text={account.user_name} query={searchInput} />
                    </td>
                    <td className="px-4 py-3.5">
                      {account.role !== null ? (
                        <span
                          className={`inline-flex items-center whitespace-nowrap rounded-full px-4 py-2 text-base font-semibold ${ROLE_BADGE_CLASSES[account.role as Role]}`}
                        >
                          {account.role}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex flex-wrap gap-1.5">
                        {account.businesses.map((business) => (
                          <span
                            key={business.id}
                            className={`inline-flex items-center whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-semibold ${businessBadgeClasses(business)}`}
                          >
                            {business.name}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="py-3.5 pl-8 pr-4">
                      <span
                        className={`inline-flex items-center gap-2 whitespace-nowrap rounded-full px-4 py-2 text-base font-semibold ${
                          account.status === 'active' ? 'bg-success-soft text-success' : 'bg-ink/5 text-ink/50'
                        }`}
                      >
                        ● {account.status === 'active' ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td className="py-3.5 pl-4 pr-8 text-center">
                      <RowMenu
                        title={account.name}
                        items={[
                          {
                            label: 'Editar cuenta',
                            icon: '✎',
                            onClick: () => setEditingAccount(account),
                          },
                          {
                            label: 'Restablecer contraseña',
                            icon: '🔑',
                            onClick: () => setResettingAccount(account),
                          },
                          {
                            label: account.status === 'active' ? 'Desactivar' : 'Activar',
                            icon: '⊘',
                            danger: account.status === 'active',
                            success: account.status !== 'active',
                            onClick: () => setConfirmingAccount(account),
                          },
                        ]}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {scrollbar.visible && (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute right-0 w-3 rounded-full bg-line/40"
              style={{ top: scrollbar.headerHeight, bottom: 0 }}
            >
              <div
                onPointerDown={handleThumbPointerDown}
                className="pointer-events-auto absolute right-0 w-3 cursor-grab rounded-full bg-brand active:cursor-grabbing"
                style={{ top: scrollbar.thumbTop - scrollbar.headerHeight, height: scrollbar.thumbHeight }}
              />
            </div>
          )}
        </div>

        <div className="mt-auto pt-1">
          <Pagination page={currentPage} totalPages={totalPages} onPageChange={setPage} />
        </div>
        </>
      )}

      {creating && (
        <AccountFormModal
          title="Nueva cuenta"
          initialValues={{ name: '', user_name: '', role: 'Empleado' }}
          showPassword
          onSubmit={handleCreate}
          onCancel={() => setCreating(false)}
        />
      )}

      {editingAccount !== null && (
        <AccountFormModal
          title="Editar cuenta"
          initialValues={{
            name: editingAccount.name,
            user_name: editingAccount.user_name,
            role: (editingAccount.role ?? 'Empleado') as Role,
          }}
          showPassword={false}
          onSubmit={handleEdit}
          onCancel={() => setEditingAccount(null)}
        />
      )}

      {resettingAccount !== null && (
        <ResetPasswordModal
          accountName={resettingAccount.name}
          onSubmit={handleResetPassword}
          onCancel={() => setResettingAccount(null)}
        />
      )}

      {confirmingAccount !== null && (
        <ConfirmDialog
          title={confirmingAccount.status === 'active' ? 'Desactivar cuenta' : 'Activar cuenta'}
          description={
            confirmingAccount.status === 'active'
              ? `"${confirmingAccount.name}" no va a poder iniciar sesión hasta que la reactives.`
              : `"${confirmingAccount.name}" va a poder volver a iniciar sesión.`
          }
          confirmLabel={confirmingAccount.status === 'active' ? 'Desactivar' : 'Activar'}
          danger={confirmingAccount.status === 'active'}
          onConfirm={confirmToggleActive}
          onCancel={() => setConfirmingAccount(null)}
        />
      )}
    </section>
  )
}
