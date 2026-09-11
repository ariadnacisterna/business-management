import { useEffect, useState } from 'react'
import {
  createProvider,
  deactivateProvider,
  fetchCategories,
  fetchProviders,
  reactivateProvider,
  setProviderCategories,
  updateProvider,
} from '../../api/catalog'
import { ApiError } from '../../api/client'
import type { Category, Provider } from '../../api/types'
import { ConfirmDialog } from '../../shared/ConfirmDialog'
import { LoadErrorCard } from '../../shared/LoadErrorCard'
import { RowMenu } from '../../shared/RowMenu'
import { useToast } from '../../shared/Toast'
import { useAuth } from '../access/AuthContext'
import { canManageCatalog } from '../access/roles'

type Status = 'loading' | 'success' | 'error'
type Tab = 'providers' | 'purchase-orders'

const LOAD_ERROR_MESSAGE = 'No se pudieron cargar los proveedores.'
const SAVE_ERROR_MESSAGE = 'No se pudo guardar el proveedor. Intentá de nuevo.'

const inputClasses =
  'h-12 rounded-lg border border-line bg-surface px-3 text-lg focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/10'
const primaryButtonClasses =
  'h-12 rounded-lg bg-brand px-5 text-base font-bold text-brand-contrast transition-colors hover:bg-brand/90 disabled:opacity-40'
const secondaryButtonClasses =
  'h-12 rounded-lg border border-line px-5 text-base font-semibold transition-colors hover:bg-surface-brand'

interface ProviderFormValues {
  name: string
  contact_name: string
  email: string
  phone: string
  last_purchase_at: string
  category_ids: number[]
}

const EMPTY_FORM: ProviderFormValues = {
  name: '',
  contact_name: '',
  email: '',
  phone: '',
  last_purchase_at: '',
  category_ids: [],
}

function ProviderFormModal({
  title,
  initialValues,
  categories,
  onSubmit,
  onCancel,
}: {
  title: string
  initialValues: ProviderFormValues
  categories: Category[]
  onSubmit: (values: ProviderFormValues) => Promise<void>
  onCancel: () => void
}) {
  const { showSuccess, showError } = useToast()
  const [values, setValues] = useState(initialValues)
  const [saving, setSaving] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [attemptedSubmit, setAttemptedSubmit] = useState(false)

  const nameError = values.name.trim() === '' ? 'El nombre es obligatorio.' : null
  const canSubmit = nameError === null

  function toggleCategory(categoryId: number) {
    setValues((prev) => ({
      ...prev,
      category_ids: prev.category_ids.includes(categoryId)
        ? prev.category_ids.filter((id) => id !== categoryId)
        : [...prev.category_ids, categoryId],
    }))
  }

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
      showSuccess(initialValues.name === '' ? 'Proveedor creado.' : 'Proveedor actualizado.')
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
          <span className="text-base font-semibold">Contacto</span>
          <input
            value={values.contact_name}
            onChange={(event) => setValues((prev) => ({ ...prev, contact_name: event.target.value }))}
            disabled={saving}
            className={inputClasses}
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-base font-semibold">Email</span>
          <input
            type="email"
            value={values.email}
            onChange={(event) => setValues((prev) => ({ ...prev, email: event.target.value }))}
            disabled={saving}
            className={inputClasses}
          />
        </label>

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
          <span className="text-base font-semibold">Última compra</span>
          <input
            type="date"
            value={values.last_purchase_at}
            onChange={(event) => setValues((prev) => ({ ...prev, last_purchase_at: event.target.value }))}
            disabled={saving}
            className={inputClasses}
          />
        </label>

        <div className="flex flex-col gap-1.5">
          <span className="text-base font-semibold">Categorías</span>
          <div className="flex flex-wrap gap-2">
            {categories.map((category) => (
              <button
                key={category.id}
                type="button"
                onClick={() => toggleCategory(category.id)}
                disabled={saving}
                className={`rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors ${
                  values.category_ids.includes(category.id)
                    ? 'border-brand bg-surface-brand text-brand'
                    : 'border-line text-ink/60 hover:bg-surface-brand'
                }`}
              >
                {category.name}
              </button>
            ))}
          </div>
        </div>

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
            initialValues.name === ''
              ? `Se va a crear el proveedor "${values.name.trim()}".`
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

function PurchaseOrdersTab() {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-line bg-surface px-6 py-16 text-center">
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
        <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76Z" />
      </svg>
      <p className="text-xl font-semibold opacity-70">En construcción</p>
      <p className="text-lg opacity-50">Próximamente vas a poder generar y seguir órdenes de compra a proveedores.</p>
    </div>
  )
}

export function SuppliersPage() {
  const { account } = useAuth()
  const canManage = canManageCatalog(account)
  const { showSuccess, showError } = useToast()

  const [tab, setTab] = useState<Tab>('providers')
  const [providers, setProviders] = useState<Provider[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [status, setStatus] = useState<Status>('loading')
  const [loadError, setLoadError] = useState<string | null>(null)

  const [creating, setCreating] = useState(false)
  const [editingProvider, setEditingProvider] = useState<Provider | null>(null)
  const [confirmingProvider, setConfirmingProvider] = useState<Provider | null>(null)

  function load() {
    setStatus('loading')
    setLoadError(null)
    Promise.all([fetchProviders(), fetchCategories()])
      .then(([providerResult, categoryResult]) => {
        setProviders(providerResult)
        setCategories(categoryResult)
        setStatus('success')
      })
      .catch(() => {
        setLoadError(LOAD_ERROR_MESSAGE)
        setStatus('error')
      })
  }

  useEffect(load, [account?.active_business_id])

  function categoryNames(categoryIds: number[]): string {
    if (categoryIds.length === 0) return '—'
    return categoryIds
      .map((id) => categories.find((category) => category.id === id)?.name)
      .filter((name): name is string => name !== undefined)
      .join(', ')
  }

  function applyProviderUpdate(updated: Provider) {
    setProviders((current) => current.map((item) => (item.id === updated.id ? updated : item)))
  }

  async function handleCreate(values: ProviderFormValues) {
    const created = await createProvider({
      name: values.name.trim(),
      contact_name: values.contact_name.trim() || undefined,
      email: values.email.trim() || undefined,
      phone: values.phone.trim() || undefined,
      category_ids: values.category_ids,
    })
    setProviders((current) => [...current, created])
    setCreating(false)
  }

  async function handleEdit(values: ProviderFormValues) {
    if (editingProvider === null) return
    let updated = await updateProvider(editingProvider.id, {
      name: values.name.trim(),
      contact_name: values.contact_name.trim(),
      email: values.email.trim(),
      phone: values.phone.trim(),
      last_purchase_at: values.last_purchase_at === '' ? undefined : values.last_purchase_at,
    })
    updated = await setProviderCategories(editingProvider.id, values.category_ids)
    applyProviderUpdate(updated)
    setEditingProvider(null)
  }

  function confirmToggleActive() {
    if (confirmingProvider === null) return
    const provider = confirmingProvider
    setConfirmingProvider(null)
    const activating = provider.status !== 'active'
    const request = provider.status === 'active' ? deactivateProvider(provider.id) : reactivateProvider(provider.id)
    request
      .then((updated) => {
        applyProviderUpdate(updated)
        showSuccess(activating ? 'Proveedor activado.' : 'Proveedor desactivado.')
      })
      .catch(() => {
        showError(activating ? 'No se pudo activar el proveedor.' : 'No se pudo desactivar el proveedor.')
      })
  }

  function providerRowMenuItems(provider: Provider) {
    if (!canManage) return []
    return [
      {
        label: 'Editar proveedor',
        onClick: () => setEditingProvider(provider),
      },
      {
        label: provider.status === 'active' ? 'Desactivar' : 'Activar',
        icon: '⊘',
        danger: provider.status === 'active',
        success: provider.status !== 'active',
        onClick: () => setConfirmingProvider(provider),
      },
    ]
  }

  return (
    <section className="-m-4 flex flex-col gap-4 bg-line/10 p-4 md:-m-6 md:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Proveedores</h1>
          <p className="mt-1 text-base opacity-60 lg:text-lg">{providers.length} proveedores registrados</p>
        </div>
        {tab === 'providers' && canManage && (
          <button type="button" onClick={() => setCreating(true)} className={primaryButtonClasses}>
            + Nuevo proveedor
          </button>
        )}
      </div>

      <div className="flex gap-2 border-b border-line">
        <button
          type="button"
          onClick={() => setTab('providers')}
          className={`min-h-12 px-4 text-lg font-semibold transition-colors ${
            tab === 'providers' ? 'border-b-2 border-brand text-brand' : 'text-ink/50 hover:text-ink'
          }`}
        >
          Proveedores
        </button>
        <button
          type="button"
          onClick={() => setTab('purchase-orders')}
          className={`min-h-12 px-4 text-lg font-semibold transition-colors ${
            tab === 'purchase-orders' ? 'border-b-2 border-brand text-brand' : 'text-ink/50 hover:text-ink'
          }`}
        >
          Órdenes de compra
        </button>
      </div>

      {tab === 'purchase-orders' && <PurchaseOrdersTab />}

      {tab === 'providers' && (
        <>
          {status === 'loading' && <p role="status">Cargando…</p>}

          {status === 'error' && <LoadErrorCard message={loadError ?? LOAD_ERROR_MESSAGE} onRetry={load} />}

          {status === 'success' && providers.length === 0 && (
            <div className="flex flex-col items-center gap-2 rounded-xl border border-line bg-surface px-6 py-12 text-center">
              <p className="text-xl font-semibold">No hay proveedores registrados.</p>
            </div>
          )}

          {status === 'success' && providers.length > 0 && (
            <>
              <div className="hidden overflow-hidden rounded-xl border border-line bg-surface sm:block">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-line bg-surface-brand/40">
                      <th className="px-4 py-2.5 text-left text-sm font-semibold uppercase tracking-wide opacity-60">
                        Nombre
                      </th>
                      <th className="px-4 py-2.5 text-left text-sm font-semibold uppercase tracking-wide opacity-60">
                        Contacto
                      </th>
                      <th className="px-4 py-2.5 text-left text-sm font-semibold uppercase tracking-wide opacity-60">
                        Categorías
                      </th>
                      <th className="px-4 py-2.5 text-left text-sm font-semibold uppercase tracking-wide opacity-60">
                        Última compra
                      </th>
                      <th className="px-4 py-2.5 text-left text-sm font-semibold uppercase tracking-wide opacity-60">
                        Estado
                      </th>
                      {canManage && <th className="px-4 py-2.5" />}
                    </tr>
                  </thead>
                  <tbody>
                    {providers.map((provider) => (
                      <tr key={provider.id} className="border-t border-line">
                        <td className="px-4 py-3 text-base font-medium">{provider.name}</td>
                        <td className="px-4 py-3 text-base opacity-70">
                          {provider.contact_name ?? '—'}
                          {provider.email !== null && <div className="text-sm opacity-60">{provider.email}</div>}
                          {provider.phone !== null && <div className="text-sm opacity-60">{provider.phone}</div>}
                        </td>
                        <td className="px-4 py-3 text-base opacity-70">{categoryNames(provider.category_ids)}</td>
                        <td className="px-4 py-3 text-base opacity-70">{provider.last_purchase_at ?? '—'}</td>
                        <td className="px-4 py-3">
                          <span
                            className={`text-sm font-semibold ${provider.status === 'active' ? 'text-success' : 'opacity-50'}`}
                          >
                            ● {provider.status === 'active' ? 'Activo' : 'Inactivo'}
                          </span>
                        </td>
                        {canManage && (
                          <td className="px-4 py-3 text-right">
                            <RowMenu title={provider.name} items={providerRowMenuItems(provider)} />
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-col gap-3 sm:hidden">
                {providers.map((provider) => (
                  <div key={provider.id} className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-4">
                    <div className="flex items-start justify-between gap-3">
                      <span className="text-xl font-bold">{provider.name}</span>
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-sm font-semibold ${provider.status === 'active' ? 'text-success' : 'opacity-50'}`}
                        >
                          ● {provider.status === 'active' ? 'Activo' : 'Inactivo'}
                        </span>
                        {canManage && <RowMenu title={provider.name} items={providerRowMenuItems(provider)} />}
                      </div>
                    </div>
                    <p className="m-0 text-base opacity-70">{provider.contact_name ?? '—'}</p>
                    <p className="m-0 text-base opacity-70">Categorías: {categoryNames(provider.category_ids)}</p>
                    <p className="m-0 text-base opacity-70">Última compra: {provider.last_purchase_at ?? '—'}</p>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}

      {creating && (
        <ProviderFormModal
          title="Nuevo proveedor"
          initialValues={EMPTY_FORM}
          categories={categories}
          onSubmit={handleCreate}
          onCancel={() => setCreating(false)}
        />
      )}

      {editingProvider !== null && (
        <ProviderFormModal
          title="Editar proveedor"
          initialValues={{
            name: editingProvider.name,
            contact_name: editingProvider.contact_name ?? '',
            email: editingProvider.email ?? '',
            phone: editingProvider.phone ?? '',
            last_purchase_at: editingProvider.last_purchase_at ?? '',
            category_ids: editingProvider.category_ids,
          }}
          categories={categories}
          onSubmit={handleEdit}
          onCancel={() => setEditingProvider(null)}
        />
      )}

      {confirmingProvider !== null && (
        <ConfirmDialog
          title={confirmingProvider.status === 'active' ? 'Desactivar proveedor' : 'Activar proveedor'}
          description={
            confirmingProvider.status === 'active'
              ? `"${confirmingProvider.name}" va a dejar de estar disponible para asignar a productos. Vas a poder reactivarlo cuando quieras.`
              : `"${confirmingProvider.name}" vuelve a estar disponible para asignar a productos.`
          }
          confirmLabel={confirmingProvider.status === 'active' ? 'Desactivar' : 'Activar'}
          danger={confirmingProvider.status === 'active'}
          onConfirm={confirmToggleActive}
          onCancel={() => setConfirmingProvider(null)}
        />
      )}
    </section>
  )
}
