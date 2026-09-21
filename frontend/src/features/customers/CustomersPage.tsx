import { useEffect, useMemo, useState } from 'react'
import {
  createCredit,
  createCustomer,
  deactivateCustomer,
  fetchCustomerBalances,
  fetchCustomerCredits,
  fetchCustomers,
  reactivateCustomer,
  updateCustomer,
} from '../../api/catalog'
import { ApiError } from '../../api/client'
import type { Credit, Customer } from '../../api/types'
import { CloseButton } from '../../shared/CloseButton'
import { ConfirmDialog } from '../../shared/ConfirmDialog'
import { FieldRow } from '../../shared/FieldRow'
import { formatAmount } from '../../shared/formatAmount'
import { formatDateTime } from '../../shared/formatDateTime'
import { firstName, initials } from '../../shared/formatName'
import { formatRelativeTime } from '../../shared/formatRelativeTime'
import { HEADER_ACTION_BUTTON_CLASSES } from '../../shared/headerActionButton'
import { PencilIcon } from '../../shared/icons'
import { LoadErrorCard } from '../../shared/LoadErrorCard'
import { Pagination } from '../../shared/Pagination'
import { PriceInput } from '../../shared/PriceInput'
import { RowMenu } from '../../shared/RowMenu'
import { SearchInput } from '../../shared/SearchInput'
import { SelectMenu } from '../../shared/SelectMenu'
import { useToast } from '../../shared/useToast'
import { useScrollbar } from '../../shared/useScrollbar'
import { NavIconGlyph } from '../../shared/layout/NavIcon'
import type { ViewMode } from '../../shared/ViewToggle'
import { ViewToggle } from '../../shared/ViewToggle'
import { useAuth } from '../access/useAuth'
import { canManageCustomers, canViewCustomerHistory } from '../access/roles'

type Status = 'loading' | 'success' | 'error'

const LOAD_ERROR_MESSAGE = 'No se pudieron cargar los clientes.'
const SAVE_ERROR_MESSAGE = 'No se pudo guardar el cliente. Intentá de nuevo.'
const MOVEMENT_ERROR_MESSAGE = 'No se pudo registrar el movimiento. Intentá de nuevo.'

const inputClasses =
  'h-12 rounded-lg border border-line bg-surface px-3 text-lg focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/10'
const editedInputClasses =
  'h-12 rounded-lg border-2 border-brand bg-surface px-3 text-lg font-semibold focus:outline-none focus:ring-2 focus:ring-brand/10'
const primaryButtonClasses =
  'h-12 rounded-lg bg-brand px-5 text-base font-bold text-brand-contrast transition-colors hover:bg-brand/90 disabled:opacity-40'
const secondaryButtonClasses =
  'h-12 rounded-lg border border-line px-5 text-base font-semibold transition-colors hover:bg-surface-brand'

interface CustomerFormValues {
  name: string
  phone: string
  address: string
}

const EMPTY_FORM: CustomerFormValues = { name: '', phone: '', address: '' }

function HistoryIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
    >
      <circle cx="12" cy="12" r="9" />
      <polyline points="12 7 12 12 15.5 14" />
    </svg>
  )
}

function CustomerFormModal({
  title,
  initialValues,
  onSubmit,
  onCancel,
}: {
  title: string
  initialValues: CustomerFormValues
  onSubmit: (values: CustomerFormValues) => Promise<void>
  onCancel: () => void
}) {
  const { showSuccess, showError } = useToast()
  const [values, setValues] = useState(initialValues)
  const [saving, setSaving] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [attemptedSubmit, setAttemptedSubmit] = useState(false)
  const isCreate = initialValues.name === ''

  const nameError = values.name.trim() === '' ? 'El nombre es obligatorio.' : null
  const canSubmit = nameError === null

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setAttemptedSubmit(true)
    if (!canSubmit) return
    setConfirming(true)
  }

  async function confirmSubmit() {
    setConfirming(false)
    setSaving(true)
    try {
      await onSubmit(values)
      showSuccess(isCreate ? 'Cliente creado.' : 'Cliente actualizado.')
    } catch (submitError) {
      showError(submitError instanceof ApiError ? submitError.message : SAVE_ERROR_MESSAGE)
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
        className="relative flex max-h-[90vh] w-full max-w-md flex-col gap-4 overflow-y-auto rounded-2xl bg-surface p-6 shadow-2xl"
      >
        <div className="flex items-start justify-between">
          <h2 className="m-0 text-2xl font-bold">{title}</h2>
          <CloseButton onClose={onCancel} />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="flex flex-col gap-1.5">
            <span className="text-base font-semibold">
              Nombre <span className="text-danger">*</span>
            </span>
            <input
              value={values.name}
              onChange={(event) => setValues((prev) => ({ ...prev, name: event.target.value }))}
              disabled={saving}
              className={inputClasses}
            />
          </label>
          {attemptedSubmit && nameError !== null && (
            <span role="alert" className="text-sm text-danger">
              {nameError}
            </span>
          )}
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="text-base font-semibold">Teléfono</span>
          <input
            value={values.phone}
            onChange={(event) => setValues((prev) => ({ ...prev, phone: event.target.value }))}
            disabled={saving}
            className={inputClasses}
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-base font-semibold">Dirección</span>
          <input
            value={values.address}
            onChange={(event) => setValues((prev) => ({ ...prev, address: event.target.value }))}
            disabled={saving}
            className={inputClasses}
          />
        </label>

        <div className="flex gap-2">
          <button type="submit" disabled={!canSubmit || saving} className={`${primaryButtonClasses} flex-1`}>
            Guardar
          </button>
          <button type="button" onClick={onCancel} disabled={saving} className={`${secondaryButtonClasses} flex-1`}>
            Cancelar
          </button>
        </div>
      </form>

      {confirming && (
        <ConfirmDialog
          title={title}
          description={
            isCreate
              ? `Se va a crear el cliente "${values.name.trim()}".`
              : `Se van a guardar los cambios de "${initialValues.name}".`
          }
          confirmLabel="Guardar"
          onConfirm={confirmSubmit}
          onCancel={() => setConfirming(false)}
        />
      )}
    </div>
  )
}

const CREDIT_TYPE_LABELS: Record<string, string> = { cargo: 'Fiado', pago: 'Pago' }

function CustomerPaymentModal({
  customer,
  balance,
  onClose,
  onMovementRegistered,
}: {
  customer: Customer
  balance: string
  onClose: () => void
  onMovementRegistered: (credit: Credit) => void
}) {
  const { showSuccess, showError } = useToast()
  const [movementType, setMovementType] = useState<'cargo' | 'pago'>('cargo')
  const [amount, setAmount] = useState('')
  const [attemptedSubmit, setAttemptedSubmit] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [saving, setSaving] = useState(false)

  const amountValue = Number(amount)
  const amountError =
    amount.trim() === '' || Number.isNaN(amountValue) || amountValue <= 0 ? 'Ingresá un importe válido.' : null
  const canSubmit = amountError === null

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setAttemptedSubmit(true)
    if (!canSubmit) return
    setConfirming(true)
  }

  async function confirmSubmit() {
    setConfirming(false)
    setSaving(true)
    try {
      const credit = await createCredit(customer.id, movementType, amount.trim())
      onMovementRegistered(credit)
      setAmount('')
      setAttemptedSubmit(false)
      showSuccess(movementType === 'cargo' ? 'Fiado registrado.' : 'Pago registrado.')
    } catch (submitError) {
      showError(submitError instanceof ApiError ? submitError.message : MOVEMENT_ERROR_MESSAGE)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink/20 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-label={`Registrar pago de ${customer.name}`}
        className="relative flex max-h-[90vh] w-full max-w-md flex-col gap-4 overflow-y-auto rounded-2xl bg-surface p-6 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3">
          <h2 className="m-0 text-2xl font-bold">{customer.name}</h2>
          <CloseButton onClose={onClose} />
        </div>

        <div className="rounded-xl border border-line bg-surface-brand/40 px-4 py-3">
          <p className="m-0 text-sm font-semibold uppercase tracking-wide opacity-60">Saldo actual</p>
          <p className={`m-0 text-2xl font-bold ${Number(balance) > 0 ? 'text-danger' : ''}`}>
            ${formatAmount(balance)}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3 rounded-xl border border-line p-4">
          <h3 className="m-0 text-lg font-bold">Registrar movimiento</h3>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-base font-semibold">Importe</span>
              <PriceInput
                value={amount}
                onChange={setAmount}
                ariaLabel="Importe"
                disabled={saving}
                className={`${inputClasses} pl-8`}
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-base font-semibold">Motivo</span>
              <SelectMenu
                value={movementType}
                onChange={(value: 'cargo' | 'pago') => setMovementType(value)}
                ariaLabel="Tipo de movimiento"
                options={[
                  { value: 'cargo', label: 'Fiado' },
                  { value: 'pago', label: 'Pago' },
                ]}
              />
            </label>
          </div>
          {attemptedSubmit && amountError !== null && (
            <span role="alert" className="text-sm text-danger">
              {amountError}
            </span>
          )}
          <button type="submit" disabled={!canSubmit || saving} className={primaryButtonClasses}>
            Registrar
          </button>
        </form>
      </div>

      {confirming && (
        <ConfirmDialog
          title={movementType === 'cargo' ? 'Registrar fiado' : 'Registrar pago'}
          description={`Se va a registrar un ${movementType === 'cargo' ? 'fiado' : 'pago'} de $${amount.trim()} para "${customer.name}".`}
          confirmLabel="Registrar"
          onConfirm={confirmSubmit}
          onCancel={() => setConfirming(false)}
        />
      )}
    </div>
  )
}

function CustomerHistoryModal({ customer, onClose }: { customer: Customer; onClose: () => void }) {
  const [status, setStatus] = useState<Status>('loading')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [credits, setCredits] = useState<Credit[]>([])
  const { scrollRef, scrollbar, updateScrollbar, handleThumbPointerDown } = useScrollbar([credits])

  function load() {
    setStatus('loading')
    setLoadError(null)
    fetchCustomerCredits(customer.id)
      .then((result) => {
        setCredits(result)
        setStatus('success')
      })
      .catch(() => {
        setLoadError('No se pudieron cargar los movimientos.')
        setStatus('error')
      })
  }

  useEffect(load, [customer.id])

  const withBalance = credits.reduce<{ credit: Credit; before: number; after: number }[]>((entries, credit) => {
    const before = entries.at(-1)?.after ?? 0
    const change = credit.type === 'cargo' ? Number(credit.amount) : -Number(credit.amount)
    entries.push({ credit, before, after: before + change })
    return entries
  }, [])
  const sorted = [...withBalance].reverse()

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink/20 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-label={`Historial de ${customer.name}`}
        className="relative grid max-h-[80vh] w-full max-w-lg grid-rows-[auto_1fr] gap-4 overflow-hidden rounded-2xl bg-surface p-6 shadow-2xl"
      >
        <div className="flex items-start justify-between">
          <div>
            <p className="m-0 text-base opacity-60">
              Clientes › {customer.name} › <span className="text-brand">Historial</span>
            </p>
            <h2 className="m-0 text-2xl font-bold">Historial</h2>
          </div>
          <CloseButton onClose={onClose} />
        </div>

        {status === 'loading' && <p role="status">Cargando…</p>}
        {status === 'error' && <LoadErrorCard message={loadError ?? 'Error'} onRetry={load} />}
        {status === 'success' && credits.length === 0 && (
          <p className="text-lg opacity-60">No hay movimientos registrados.</p>
        )}
        {status === 'success' && credits.length > 0 && (
          <div className="relative min-h-0">
            <div
              ref={scrollRef}
              onScroll={updateScrollbar}
              className={`scrollbar-hidden h-full overflow-auto ${scrollbar.visible ? 'pr-5' : ''}`}
            >
              <ul className="flex flex-col gap-3">
                {sorted.map(({ credit, before, after }) => (
                  <li key={credit.id} className="flex flex-col gap-1 rounded-lg border border-line px-4 py-3">
                    <div className="flex items-center justify-between text-lg">
                      <span className={`font-bold ${credit.type === 'cargo' ? 'text-danger' : 'text-success'}`}>
                        {credit.type === 'cargo' ? '+' : '-'}${formatAmount(credit.amount)}
                      </span>
                      <span className="opacity-60">{formatDateTime(credit.created_at)}</span>
                    </div>
                    <p className="m-0 text-base opacity-70">
                      ${formatAmount(String(before))} → ${formatAmount(String(after))}
                    </p>
                    <p className="m-0 text-base opacity-70">Tipo: {CREDIT_TYPE_LABELS[credit.type] ?? credit.type}</p>
                    <p className="m-0 text-base opacity-70">Cambiado por: {firstName(credit.created_by_account_name)}</p>
                  </li>
                ))}
              </ul>
            </div>

            {scrollbar.visible && (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute right-0 top-0 w-3 rounded-full bg-line/40"
                style={{ bottom: 0 }}
              >
                <div
                  onPointerDown={handleThumbPointerDown}
                  className="pointer-events-auto absolute right-0 w-3 cursor-grab rounded-full bg-brand active:cursor-grabbing"
                  style={{ top: scrollbar.thumbTop, height: scrollbar.thumbHeight }}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

interface LastMovement {
  at: string
  byAccountName: string
}

function CustomerBalanceEditor({
  customer,
  lastMovement,
  canViewHistory,
  onMovementRegistered,
  onOpenHistory,
}: {
  customer: Customer
  lastMovement: LastMovement | undefined
  canViewHistory: boolean
  onMovementRegistered: (credit: Credit) => void
  onOpenHistory: () => void
}) {
  const { showSuccess, showError } = useToast()
  const [amount, setAmount] = useState('')
  const [movementType, setMovementType] = useState<'cargo' | 'pago'>('cargo')
  const [confirming, setConfirming] = useState(false)
  const [saving, setSaving] = useState(false)

  const trimmedAmount = amount.trim()
  const parsedAmount = Number(trimmedAmount)
  const edited = trimmedAmount !== '' && !Number.isNaN(parsedAmount) && parsedAmount > 0

  async function confirmUpdate() {
    setConfirming(false)
    setSaving(true)
    try {
      const credit = await createCredit(customer.id, movementType, trimmedAmount)
      onMovementRegistered(credit)
      setAmount('')
      showSuccess(movementType === 'cargo' ? 'Fiado registrado.' : 'Pago registrado.')
    } catch (error) {
      showError(error instanceof ApiError ? error.message : MOVEMENT_ERROR_MESSAGE)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_110px]">
        <PriceInput
          value={amount}
          onChange={setAmount}
          ariaLabel={`Importe para ${customer.name}`}
          disabled={saving}
          className={`${edited ? editedInputClasses : inputClasses} pl-8 w-full`}
        />
        <SelectMenu
          value={movementType}
          onChange={(value: 'cargo' | 'pago') => setMovementType(value)}
          ariaLabel={`Tipo de movimiento para ${customer.name}`}
          className="w-full"
          options={[
            { value: 'cargo', label: 'Fiado' },
            { value: 'pago', label: 'Pago' },
          ]}
        />
        <button
          type="button"
          disabled={!edited || saving}
          onClick={() => setConfirming(true)}
          className={
            edited
              ? 'h-12 w-full rounded-lg bg-brand px-3 text-base font-bold text-brand-contrast transition-colors hover:bg-brand/90'
              : 'h-12 w-full cursor-not-allowed rounded-lg bg-line px-3 text-base font-bold text-ink/40'
          }
        >
          Actualizar
        </button>
      </div>

      {canViewHistory && lastMovement !== undefined && (
        <div className="flex items-center justify-between gap-3 text-lg">
          <span className="opacity-60">Último cambio</span>
          <span className="font-semibold">
            {formatRelativeTime(lastMovement.at)} por {firstName(lastMovement.byAccountName)}
          </span>
        </div>
      )}

      {canViewHistory && (
        <button
          type="button"
          onClick={onOpenHistory}
          className="flex h-12 items-center justify-center gap-2 rounded-lg border border-line text-base font-semibold text-ink/70 transition-colors hover:bg-surface-brand hover:text-brand"
        >
          <HistoryIcon /> Ver historial
        </button>
      )}

      {confirming && (
        <ConfirmDialog
          title={movementType === 'cargo' ? 'Registrar fiado' : 'Registrar pago'}
          description={`Se va a registrar un ${movementType === 'cargo' ? 'fiado' : 'pago'} de $${trimmedAmount} para "${customer.name}".`}
          confirmLabel="Actualizar"
          onConfirm={confirmUpdate}
          onCancel={() => setConfirming(false)}
        />
      )}
    </div>
  )
}

export function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [balances, setBalances] = useState<Record<number, string>>({})
  const [lastMovements, setLastMovements] = useState<Record<number, LastMovement>>({})
  const [status, setStatus] = useState<Status>('loading')
  const [loadError, setLoadError] = useState<string | null>(null)

  const [searchInput, setSearchInput] = useState('')
  const [page, setPageState] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [viewMode, setViewMode] = useState<ViewMode>('cards')

  const [creating, setCreating] = useState(false)
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null)
  const [payingCustomer, setPayingCustomer] = useState<Customer | null>(null)
  const [historyCustomer, setHistoryCustomer] = useState<Customer | null>(null)
  const [confirmingCustomer, setConfirmingCustomer] = useState<Customer | null>(null)

  const { showSuccess, showError } = useToast()
  const { account } = useAuth()
  const canManage = canManageCustomers(account)
  const canViewHistory = canViewCustomerHistory(account)

  function load() {
    setStatus('loading')
    setLoadError(null)
    Promise.all([fetchCustomers(), fetchCustomerBalances()])
      .then(([customerResult, balanceResult]) => {
        setCustomers(customerResult)
        const balanceMap: Record<number, string> = {}
        const lastMovementMap: Record<number, LastMovement> = {}
        for (const entry of balanceResult) {
          balanceMap[entry.customer_id] = entry.balance
          if (entry.last_movement_at !== null && entry.last_movement_by_account_name !== null) {
            lastMovementMap[entry.customer_id] = {
              at: entry.last_movement_at,
              byAccountName: entry.last_movement_by_account_name,
            }
          }
        }
        setBalances(balanceMap)
        setLastMovements(lastMovementMap)
        setStatus('success')
      })
      .catch(() => {
        setLoadError(LOAD_ERROR_MESSAGE)
        setStatus('error')
      })
  }

  useEffect(load, [])

  function applyCustomerUpdate(updated: Customer) {
    setCustomers((current) => current.map((item) => (item.id === updated.id ? updated : item)))
  }

  function balanceFor(customerId: number): string {
    return balances[customerId] ?? '0'
  }

  async function handleCreate(values: CustomerFormValues) {
    const created = await createCustomer({
      name: values.name.trim(),
      phone: values.phone.trim() || undefined,
      address: values.address.trim() || undefined,
    })
    setCustomers((current) => [...current, created])
    setCreating(false)
  }

  async function handleEdit(values: CustomerFormValues) {
    if (editingCustomer === null) return
    const updated = await updateCustomer(editingCustomer.id, {
      name: values.name.trim(),
      phone: values.phone.trim(),
      address: values.address.trim(),
    })
    applyCustomerUpdate(updated)
    setEditingCustomer(null)
  }

  function handleMovementRegistered(credit: Credit) {
    setBalances((current) => {
      const previous = Number(current[credit.customer_id] ?? '0')
      const delta = credit.type === 'cargo' ? Number(credit.amount) : -Number(credit.amount)
      return { ...current, [credit.customer_id]: String(previous + delta) }
    })
    setLastMovements((current) => ({
      ...current,
      [credit.customer_id]: { at: credit.created_at, byAccountName: credit.created_by_account_name },
    }))
  }

  function confirmToggleActive() {
    if (confirmingCustomer === null) return
    const customer = confirmingCustomer
    setConfirmingCustomer(null)
    const activating = customer.status !== 'active'
    const request = customer.status === 'active' ? deactivateCustomer(customer.id) : reactivateCustomer(customer.id)
    request
      .then((updated) => {
        applyCustomerUpdate(updated)
        showSuccess(activating ? 'Cliente activado.' : 'Cliente desactivado.')
      })
      .catch(() => {
        showError(activating ? 'No se pudo activar el cliente.' : 'No se pudo desactivar el cliente.')
      })
  }

  function customerRowMenuItems(customer: Customer, includeMovementActions: boolean) {
    return [
      ...(includeMovementActions
        ? [
            { label: 'Registrar pago', icon: '$', onClick: () => setPayingCustomer(customer) },
            ...(canViewHistory
              ? [{ label: 'Ver historial', icon: <HistoryIcon />, onClick: () => setHistoryCustomer(customer) }]
              : []),
          ]
        : []),
      ...(canManage
        ? [
            { label: 'Editar cliente', icon: <PencilIcon />, onClick: () => setEditingCustomer(customer) },
            {
              label: customer.status === 'active' ? 'Desactivar' : 'Activar',
              icon: '⊘',
              danger: customer.status === 'active',
              success: customer.status !== 'active',
              onClick: () => setConfirmingCustomer(customer),
            },
          ]
        : []),
    ]
  }

  const filteredCustomers = useMemo(() => {
    const query = searchInput.trim().toLowerCase()
    if (query === '') return customers
    return customers.filter((customer) => customer.name.toLowerCase().includes(query))
  }, [customers, searchInput])

  const totalPages = Math.max(1, Math.ceil(filteredCustomers.length / pageSize))
  const currentPage = Math.min(page, totalPages)
  const paginatedCustomers = useMemo(
    () => filteredCustomers.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [filteredCustomers, currentPage, pageSize],
  )

  useEffect(() => {
    setPageState(1)
  }, [searchInput, pageSize])

  return (
    <section className="-m-4 flex min-h-[calc(100svh-4rem)] flex-col gap-4 bg-line/10 p-4 md:-m-6 md:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Clientes</h1>
          <p className="mt-1 text-base opacity-60 lg:text-lg">{customers.length} clientes registrados</p>
        </div>
        <div className="flex items-center gap-3">
          {status === 'success' && customers.length > 0 && <ViewToggle mode={viewMode} onChange={setViewMode} />}
          {canManage && (
            <button
              type="button"
              onClick={() => setCreating(true)}
              className={`${HEADER_ACTION_BUTTON_CLASSES} bg-brand text-brand-contrast hover:bg-brand/90`}
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
              Nuevo cliente
            </button>
          )}
        </div>
      </div>

      {status === 'success' && customers.length > 0 && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <SearchInput
            value={searchInput}
            onChange={setSearchInput}
            placeholder="Buscar por nombre…"
            ariaLabel="Buscar clientes"
            className="sm:min-w-64 sm:flex-1"
          />
          {filteredCustomers.length > 10 && (
            <SelectMenu
              value={String(pageSize)}
              onChange={(value) => setPageSize(Number(value))}
              ariaLabel="Cantidad por página"
              className="w-full sm:w-56"
              options={[
                { value: '10', label: '10 por página' },
                { value: '25', label: '25 por página' },
                { value: '50', label: '50 por página' },
              ]}
            />
          )}
        </div>
      )}

      {status === 'loading' && (
        <div className="flex flex-col items-center gap-3 py-12 text-center" role="status">
          <span className="h-10 w-10 animate-spin rounded-full border-4 border-line border-t-brand" />
          <p className="text-xl font-semibold">Cargando…</p>
        </div>
      )}

      {status === 'error' && <LoadErrorCard message={loadError ?? LOAD_ERROR_MESSAGE} onRetry={load} />}

      {status === 'success' && customers.length === 0 && (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-line bg-surface px-6 py-16 text-center">
          <NavIconGlyph icon="customers" className="h-10 w-10 opacity-40" />
          <p className="text-xl font-semibold opacity-70">No hay clientes registrados</p>
          <p className="text-lg opacity-50">Cuando cargues clientes, van a aparecer acá.</p>
        </div>
      )}

      {status === 'success' && customers.length > 0 && filteredCustomers.length === 0 && (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-line bg-surface px-6 py-12 text-center">
          <p className="text-xl font-semibold">No hay clientes que coincidan.</p>
        </div>
      )}

      {status === 'success' && filteredCustomers.length > 0 && (
        <>
          {viewMode === 'table' && (
          <div className="overflow-hidden rounded-xl border border-line bg-surface">
            <table className="w-full">
              <thead>
                <tr className="border-b border-line bg-surface-brand/40">
                  <th className="px-4 py-2.5 text-left text-sm font-semibold uppercase tracking-wide opacity-60">
                    Nombre
                  </th>
                  <th className="px-4 py-2.5 text-left text-sm font-semibold uppercase tracking-wide opacity-60">
                    Teléfono
                  </th>
                  <th className="px-4 py-2.5 text-left text-sm font-semibold uppercase tracking-wide opacity-60">
                    Dirección
                  </th>
                  <th className="px-4 py-2.5 text-left text-sm font-semibold uppercase tracking-wide opacity-60">
                    Saldo
                  </th>
                  <th className="px-4 py-2.5 text-left text-sm font-semibold uppercase tracking-wide opacity-60">
                    Estado
                  </th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {paginatedCustomers.map((customer) => (
                  <tr key={customer.id} className="border-t border-line">
                    <td className="px-4 py-3 text-base font-medium">{customer.name}</td>
                    <td className="px-4 py-3 text-base opacity-70">{customer.phone ?? '—'}</td>
                    <td className="px-4 py-3 text-base opacity-70">{customer.address ?? '—'}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`text-base font-semibold ${Number(balanceFor(customer.id)) > 0 ? 'text-danger' : 'opacity-60'}`}
                      >
                        ${formatAmount(balanceFor(customer.id))}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center gap-2 whitespace-nowrap rounded-full px-4 py-2 text-base font-semibold ${
                          customer.status === 'active' ? 'bg-success-soft text-success' : 'bg-ink/5 text-ink/50'
                        }`}
                      >
                        ● {customer.status === 'active' ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <RowMenu title={customer.name} items={customerRowMenuItems(customer, true)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          )}

          {viewMode === 'cards' && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {paginatedCustomers.map((customer) => (
              <div key={customer.id} className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4">
                <div className="flex items-center gap-3 border-b border-line pb-3">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand text-lg font-bold text-brand-contrast">
                    {initials(customer.name)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xl font-bold leading-tight">{customer.name}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`whitespace-nowrap text-2xl font-bold ${Number(balanceFor(customer.id)) > 0 ? 'text-danger' : 'opacity-60'}`}
                    >
                      ${formatAmount(balanceFor(customer.id))}
                    </span>
                    {canManage && <RowMenu title={customer.name} items={customerRowMenuItems(customer, false)} />}
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <FieldRow label="Teléfono" value={customer.phone ?? '—'} />
                  <FieldRow label="Dirección" value={customer.address ?? '—'} />
                  <FieldRow
                    label="Estado"
                    value={
                      <span
                        className={`inline-flex items-center gap-2 whitespace-nowrap rounded-full px-4 py-2 text-base font-semibold ${
                          customer.status === 'active' ? 'bg-success-soft text-success' : 'bg-ink/5 text-ink/50'
                        }`}
                      >
                        ● {customer.status === 'active' ? 'Activo' : 'Inactivo'}
                      </span>
                    }
                  />
                </div>

                <div className="border-t border-line pt-3">
                  <CustomerBalanceEditor
                    customer={customer}
                    lastMovement={lastMovements[customer.id]}
                    canViewHistory={canViewHistory}
                    onMovementRegistered={handleMovementRegistered}
                    onOpenHistory={() => setHistoryCustomer(customer)}
                  />
                </div>
              </div>
            ))}
          </div>
          )}

          {filteredCustomers.length > pageSize && (
            <Pagination page={currentPage} totalPages={totalPages} onPageChange={setPageState} />
          )}
        </>
      )}

      {creating && (
        <CustomerFormModal title="Nuevo cliente" initialValues={EMPTY_FORM} onSubmit={handleCreate} onCancel={() => setCreating(false)} />
      )}

      {editingCustomer !== null && (
        <CustomerFormModal
          title="Editar cliente"
          initialValues={{
            name: editingCustomer.name,
            phone: editingCustomer.phone ?? '',
            address: editingCustomer.address ?? '',
          }}
          onSubmit={handleEdit}
          onCancel={() => setEditingCustomer(null)}
        />
      )}

      {payingCustomer !== null && (
        <CustomerPaymentModal
          customer={payingCustomer}
          balance={balanceFor(payingCustomer.id)}
          onClose={() => setPayingCustomer(null)}
          onMovementRegistered={handleMovementRegistered}
        />
      )}

      {historyCustomer !== null && (
        <CustomerHistoryModal customer={historyCustomer} onClose={() => setHistoryCustomer(null)} />
      )}

      {confirmingCustomer !== null && (
        <ConfirmDialog
          title={confirmingCustomer.status === 'active' ? 'Desactivar cliente' : 'Activar cliente'}
          description={
            confirmingCustomer.status === 'active'
              ? `"${confirmingCustomer.name}" va a dejar de estar disponible para registrar movimientos. Vas a poder reactivarlo cuando quieras.`
              : `"${confirmingCustomer.name}" vuelve a estar disponible para registrar movimientos.`
          }
          confirmLabel={confirmingCustomer.status === 'active' ? 'Desactivar' : 'Activar'}
          danger={confirmingCustomer.status === 'active'}
          onConfirm={confirmToggleActive}
          onCancel={() => setConfirmingCustomer(null)}
        />
      )}
    </section>
  )
}
