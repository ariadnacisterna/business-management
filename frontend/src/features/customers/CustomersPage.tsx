import { useEffect, useMemo, useState } from 'react'
import {
  createCredit,
  createCustomer,
  fetchCustomerCredits,
  fetchCustomers,
  fetchCustomersWithPendingBalance,
  updateCustomer,
} from '../../api/catalog'
import { ApiError } from '../../api/client'
import type { Credit, Customer } from '../../api/types'
import { ConfirmDialog } from '../../shared/ConfirmDialog'
import { LoadErrorCard } from '../../shared/LoadErrorCard'
import { Pagination } from '../../shared/Pagination'
import { PriceInput } from '../../shared/PriceInput'
import { RowMenu } from '../../shared/RowMenu'
import { SearchInput } from '../../shared/SearchInput'
import { SelectMenu } from '../../shared/SelectMenu'
import { useToast } from '../../shared/Toast'

type Status = 'loading' | 'success' | 'error'

const LOAD_ERROR_MESSAGE = 'No se pudieron cargar los clientes.'
const SAVE_ERROR_MESSAGE = 'No se pudo guardar el cliente. Intentá de nuevo.'
const MOVEMENT_ERROR_MESSAGE = 'No se pudo registrar el movimiento. Intentá de nuevo.'

const inputClasses =
  'h-12 rounded-lg border border-line bg-surface px-3 text-lg focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/10'
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

function formatAmount(amount: string): string {
  const value = Number(amount)
  if (Number.isNaN(value)) return amount
  return value.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
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
        <h2 className="m-0 text-2xl font-bold">{title}</h2>

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

const CREDIT_TYPE_LABELS: Record<string, string> = { cargo: 'Cargo', pago: 'Pago' }

function CustomerDetailModal({
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
  const [status, setStatus] = useState<Status>('loading')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [credits, setCredits] = useState<Credit[]>([])
  const [movementType, setMovementType] = useState<'cargo' | 'pago'>('cargo')
  const [amount, setAmount] = useState('')
  const [attemptedSubmit, setAttemptedSubmit] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [saving, setSaving] = useState(false)

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
      setCredits((current) => [credit, ...current])
      onMovementRegistered(credit)
      setAmount('')
      setAttemptedSubmit(false)
      showSuccess(movementType === 'cargo' ? 'Cargo registrado.' : 'Pago registrado.')
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
        aria-label={`Movimientos de ${customer.name}`}
        className="relative flex max-h-[90vh] w-full max-w-lg flex-col gap-4 overflow-y-auto rounded-2xl bg-surface p-6 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="m-0 text-2xl font-bold">{customer.name}</h2>
            <p className="mt-1 text-base opacity-60">{customer.phone ?? 'Sin teléfono'}</p>
            <p className="mt-1 text-base opacity-60">{customer.address ?? 'Sin dirección'}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-line text-lg hover:bg-surface-brand"
          >
            ✕
          </button>
        </div>

        <div className="rounded-xl border border-line bg-surface-brand/40 px-4 py-3">
          <p className="m-0 text-sm font-semibold uppercase tracking-wide opacity-60">Saldo actual</p>
          <p className={`m-0 text-2xl font-bold ${Number(balance) > 0 ? 'text-danger' : ''}`}>
            ${formatAmount(balance)}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3 rounded-xl border border-line p-4">
          <h3 className="m-0 text-lg font-bold">Registrar movimiento</h3>
          <SelectMenu
            value={movementType}
            onChange={(value: 'cargo' | 'pago') => setMovementType(value)}
            ariaLabel="Tipo de movimiento"
            options={[
              { value: 'cargo', label: 'Cargo (fiado)' },
              { value: 'pago', label: 'Pago' },
            ]}
          />
          <div className="flex flex-col gap-1.5">
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
            {attemptedSubmit && amountError !== null && (
              <span role="alert" className="text-sm text-danger">
                {amountError}
              </span>
            )}
          </div>
          <button type="submit" disabled={!canSubmit || saving} className={primaryButtonClasses}>
            Registrar
          </button>
        </form>

        <div className="flex flex-col gap-2">
          <h3 className="m-0 text-lg font-bold">Movimientos</h3>
          {status === 'loading' && <p role="status">Cargando…</p>}
          {status === 'error' && <LoadErrorCard message={loadError ?? 'Error'} onRetry={load} />}
          {status === 'success' && credits.length === 0 && <p className="opacity-60">No hay movimientos registrados.</p>}
          {status === 'success' && credits.length > 0 && (
            <ul className="flex flex-col gap-2">
              {credits.map((credit) => (
                <li
                  key={credit.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-line px-3 py-2"
                >
                  <span
                    className={`text-base font-semibold ${credit.type === 'cargo' ? 'text-danger' : 'text-success'}`}
                  >
                    {CREDIT_TYPE_LABELS[credit.type] ?? credit.type}
                  </span>
                  <span className="text-base font-medium">${formatAmount(credit.amount)}</span>
                  <span className="text-sm opacity-60">{new Date(credit.created_at).toLocaleString('es-AR')}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {confirming && (
        <ConfirmDialog
          title={movementType === 'cargo' ? 'Registrar cargo' : 'Registrar pago'}
          description={`Se va a registrar un ${movementType === 'cargo' ? 'cargo' : 'pago'} de $${amount.trim()} para "${customer.name}".`}
          confirmLabel="Registrar"
          onConfirm={confirmSubmit}
          onCancel={() => setConfirming(false)}
        />
      )}
    </div>
  )
}

export function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [balances, setBalances] = useState<Record<number, string>>({})
  const [status, setStatus] = useState<Status>('loading')
  const [loadError, setLoadError] = useState<string | null>(null)

  const [searchInput, setSearchInput] = useState('')
  const [page, setPageState] = useState(1)
  const [pageSize, setPageSize] = useState(25)

  const [creating, setCreating] = useState(false)
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null)
  const [detailCustomer, setDetailCustomer] = useState<Customer | null>(null)

  function load() {
    setStatus('loading')
    setLoadError(null)
    Promise.all([fetchCustomers(), fetchCustomersWithPendingBalance()])
      .then(([customerResult, pendingResult]) => {
        setCustomers(customerResult)
        const balanceMap: Record<number, string> = {}
        for (const entry of pendingResult) {
          balanceMap[entry.customer.id] = entry.balance
        }
        setBalances(balanceMap)
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
  }

  function customerRowMenuItems(customer: Customer) {
    return [
      { label: 'Ver movimientos', onClick: () => setDetailCustomer(customer) },
      { label: 'Editar cliente', onClick: () => setEditingCustomer(customer) },
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
    <section className="-m-4 flex flex-col gap-4 bg-line/10 p-4 md:-m-6 md:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Clientes</h1>
          <p className="mt-1 text-base opacity-60 lg:text-lg">{customers.length} clientes registrados</p>
        </div>
        <button type="button" onClick={() => setCreating(true)} className={primaryButtonClasses}>
          + Nuevo cliente
        </button>
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

      {status === 'loading' && <p role="status">Cargando…</p>}

      {status === 'error' && <LoadErrorCard message={loadError ?? LOAD_ERROR_MESSAGE} onRetry={load} />}

      {status === 'success' && customers.length === 0 && (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-line bg-surface px-6 py-12 text-center">
          <p className="text-xl font-semibold">No hay clientes registrados.</p>
        </div>
      )}

      {status === 'success' && customers.length > 0 && filteredCustomers.length === 0 && (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-line bg-surface px-6 py-12 text-center">
          <p className="text-xl font-semibold">No hay clientes que coincidan.</p>
        </div>
      )}

      {status === 'success' && filteredCustomers.length > 0 && (
        <>
          <div className="hidden overflow-hidden rounded-xl border border-line bg-surface sm:block">
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
                    <td className="px-4 py-3 text-right">
                      <RowMenu title={customer.name} items={customerRowMenuItems(customer)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col gap-3 sm:hidden">
            {paginatedCustomers.map((customer) => (
              <div key={customer.id} className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-4">
                <div className="flex items-start justify-between gap-3">
                  <span className="text-xl font-bold">{customer.name}</span>
                  <RowMenu title={customer.name} items={customerRowMenuItems(customer)} />
                </div>
                <p className="m-0 text-base opacity-70">{customer.phone ?? 'Sin teléfono'}</p>
                <p className="m-0 text-base opacity-70">{customer.address ?? 'Sin dirección'}</p>
                <p
                  className={`m-0 text-lg font-semibold ${Number(balanceFor(customer.id)) > 0 ? 'text-danger' : 'opacity-60'}`}
                >
                  Saldo: ${formatAmount(balanceFor(customer.id))}
                </p>
              </div>
            ))}
          </div>

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

      {detailCustomer !== null && (
        <CustomerDetailModal
          customer={detailCustomer}
          balance={balanceFor(detailCustomer.id)}
          onClose={() => setDetailCustomer(null)}
          onMovementRegistered={handleMovementRegistered}
        />
      )}
    </section>
  )
}
