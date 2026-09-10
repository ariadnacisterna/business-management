import { useEffect, useState } from 'react'
import {
  createAttribute,
  createAttributeValue,
  deactivateAttributeValue,
  fetchAttributeValues,
  fetchAttributes,
  reactivateAttributeValue,
  updateAttributeValue,
} from '../../api/catalog'
import { ApiError } from '../../api/client'
import type { Attribute, AttributeValue } from '../../api/types'
import { useAuth } from '../access/AuthContext'
import { canManageCatalog } from '../access/roles'
import { ConfirmDialog } from '../../shared/ConfirmDialog'
import { LoadErrorCard } from '../../shared/LoadErrorCard'
import { useToast } from '../../shared/Toast'

type Status = 'loading' | 'success' | 'error'

const LOAD_ERROR_MESSAGE = 'No se pudieron cargar los atributos.'
const LOAD_VALUES_ERROR_MESSAGE = 'No se pudieron cargar los valores.'
const SAVE_ERROR_MESSAGE = 'No se pudo guardar. Intentá de nuevo.'

const inputClasses =
  'h-11 rounded-lg border border-line px-3 text-base focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/10'
const primaryButtonClasses =
  'min-h-11 rounded-lg bg-brand px-4 text-base font-bold text-brand-contrast transition-colors hover:bg-brand/90 disabled:opacity-40'
const secondaryButtonClasses = 'h-11 rounded-lg border border-line px-3 text-base transition-colors hover:bg-surface-brand'

export function AttributesPage() {
  const { account } = useAuth()
  const canManage = canManageCatalog(account)
  const { showSuccess, showError } = useToast()

  const [attributes, setAttributes] = useState<Attribute[]>([])
  const [status, setStatus] = useState<Status>('loading')
  const [loadError, setLoadError] = useState<string | null>(null)

  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [values, setValues] = useState<AttributeValue[]>([])
  const [valuesStatus, setValuesStatus] = useState<Status>('success')
  const [valuesError, setValuesError] = useState<string | null>(null)

  const [creatingAttribute, setCreatingAttribute] = useState(false)
  const [newAttributeName, setNewAttributeName] = useState('')
  const [savingAttribute, setSavingAttribute] = useState(false)

  const [newValue, setNewValue] = useState('')
  const [creatingValue, setCreatingValue] = useState(false)

  const [editingValueId, setEditingValueId] = useState<number | null>(null)
  const [editingValue, setEditingValue] = useState('')
  const [savingValue, setSavingValue] = useState(false)

  const [confirmingStatusChange, setConfirmingStatusChange] = useState<AttributeValue | null>(null)
  const [statusChangeError, setStatusChangeError] = useState<string | null>(null)

  const [confirmingCreateAttribute, setConfirmingCreateAttribute] = useState(false)
  const [confirmingCreateValue, setConfirmingCreateValue] = useState(false)
  const [confirmingEditValue, setConfirmingEditValue] = useState<AttributeValue | null>(null)

  function loadAttributes() {
    setStatus('loading')
    setLoadError(null)
    fetchAttributes()
      .then((result) => {
        setAttributes(result)
        setStatus('success')
      })
      .catch(() => {
        setLoadError(LOAD_ERROR_MESSAGE)
        setStatus('error')
      })
  }

  useEffect(() => {
    setSelectedId(null)
    setValues([])
    loadAttributes()
  }, [account?.active_business_id])

  function loadValues(attributeId: number) {
    setValuesStatus('loading')
    setValuesError(null)
    fetchAttributeValues(attributeId)
      .then((result) => {
        setValues(result)
        setValuesStatus('success')
      })
      .catch(() => {
        setValuesError(LOAD_VALUES_ERROR_MESSAGE)
        setValuesStatus('error')
      })
  }

  function selectAttribute(attributeId: number) {
    setSelectedId(attributeId)
    setEditingValueId(null)
    loadValues(attributeId)
  }

  function handleCreateAttribute(event: React.FormEvent) {
    event.preventDefault()
    if (newAttributeName.trim() === '') return
    setConfirmingCreateAttribute(true)
  }

  async function createAttributeNow() {
    setConfirmingCreateAttribute(false)
    const trimmed = newAttributeName.trim()
    if (trimmed === '') return

    setSavingAttribute(true)
    try {
      const attribute = await createAttribute(trimmed)
      setAttributes((prev) => [...prev, attribute])
      setNewAttributeName('')
      setCreatingAttribute(false)
      showSuccess('Atributo creado.')
    } catch (error) {
      showError(error instanceof ApiError ? error.message : SAVE_ERROR_MESSAGE)
    } finally {
      setSavingAttribute(false)
    }
  }

  function handleCreateValue(event: React.FormEvent) {
    event.preventDefault()
    if (selectedId === null) return
    if (newValue.trim() === '') return
    setConfirmingCreateValue(true)
  }

  async function createValueNow() {
    if (selectedId === null) return
    setConfirmingCreateValue(false)
    const trimmed = newValue.trim()
    if (trimmed === '') return

    setCreatingValue(true)
    try {
      const value = await createAttributeValue(selectedId, trimmed)
      setValues((prev) => [...prev, value])
      setNewValue('')
      showSuccess('Valor agregado.')
    } catch (error) {
      showError(error instanceof ApiError ? error.message : SAVE_ERROR_MESSAGE)
    } finally {
      setCreatingValue(false)
    }
  }

  function startEditValue(value: AttributeValue) {
    setEditingValueId(value.id)
    setEditingValue(value.value)
  }

  function cancelEditValue() {
    setEditingValueId(null)
    setEditingValue('')
  }

  function handleSaveValue(event: React.FormEvent) {
    event.preventDefault()
    if (editingValueId === null) return
    if (editingValue.trim() === '') return
    const value = values.find((item) => item.id === editingValueId)
    if (value === undefined) return
    setConfirmingEditValue(value)
  }

  async function saveValueNow() {
    if (editingValueId === null) return
    const trimmed = editingValue.trim()
    if (trimmed === '') return

    setConfirmingEditValue(null)
    setSavingValue(true)
    try {
      const updated = await updateAttributeValue(editingValueId, trimmed)
      setValues((prev) => prev.map((value) => (value.id === updated.id ? updated : value)))
      cancelEditValue()
      showSuccess('Valor actualizado.')
    } catch (error) {
      showError(error instanceof ApiError ? error.message : SAVE_ERROR_MESSAGE)
    } finally {
      setSavingValue(false)
    }
  }

  async function confirmStatusChange() {
    if (confirmingStatusChange === null) return
    const value = confirmingStatusChange

    setStatusChangeError(null)
    try {
      const updated =
        value.status === 'active' ? await deactivateAttributeValue(value.id) : await reactivateAttributeValue(value.id)
      setValues((prev) => prev.map((candidate) => (candidate.id === updated.id ? updated : candidate)))
      setConfirmingStatusChange(null)
      showSuccess(updated.status === 'active' ? 'Valor activado.' : 'Valor desactivado.')
    } catch (error) {
      setStatusChangeError(error instanceof ApiError ? error.message : SAVE_ERROR_MESSAGE)
    }
  }

  const selectedAttribute = attributes.find((attribute) => attribute.id === selectedId) ?? null

  return (
    <section className="-m-4 flex min-h-[calc(100svh-4rem)] flex-col gap-4 bg-line/10 p-4 md:-m-6 md:p-6">
      <div className="flex max-w-3xl flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold">Atributos</h1>
        {canManage && !creatingAttribute && (
          <button type="button" onClick={() => setCreatingAttribute(true)} className={primaryButtonClasses}>
            + Nuevo atributo
          </button>
        )}
      </div>

      {creatingAttribute && (
        <form
          onSubmit={handleCreateAttribute}
          className="flex max-w-3xl flex-wrap items-center gap-2 rounded-xl border border-line bg-surface p-4"
        >
          <label htmlFor="new-attribute-name" className="text-base font-semibold">
            Nuevo atributo
          </label>
          <input
            id="new-attribute-name"
            type="text"
            value={newAttributeName}
            onChange={(event) => setNewAttributeName(event.target.value)}
            disabled={savingAttribute}
            className={inputClasses}
          />
          <button
            type="submit"
            disabled={savingAttribute || newAttributeName.trim() === ''}
            className={primaryButtonClasses}
          >
            Crear
          </button>
          <button
            type="button"
            onClick={() => {
              setCreatingAttribute(false)
              setNewAttributeName('')
            }}
            disabled={savingAttribute}
            className={secondaryButtonClasses}
          >
            Cancelar
          </button>
        </form>
      )}

      {status === 'loading' && <p role="status">Cargando…</p>}

      {status === 'error' && <LoadErrorCard message={loadError ?? LOAD_ERROR_MESSAGE} onRetry={loadAttributes} />}

      {status === 'success' && (
        <div className="max-w-3xl overflow-hidden rounded-xl border border-line bg-surface">
          <table className="w-full">
            <thead>
              <tr className="border-b border-line bg-surface-brand/40">
                <th className="px-4 py-2.5 text-left text-sm font-semibold uppercase tracking-wide opacity-60">
                  Nombre
                </th>
                <th className="px-4 py-2.5 text-left text-sm font-semibold uppercase tracking-wide opacity-60">
                  Estado
                </th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {attributes.map((attribute) => (
                <tr key={attribute.id} className="border-t border-line">
                  <td className="px-4 py-3 text-base font-medium">{attribute.name}</td>
                  <td className="px-4 py-3">
                    <span className={`text-sm font-semibold ${attribute.status === 'active' ? 'text-success' : 'opacity-50'}`}>
                      ● {attribute.status === 'active' ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => selectAttribute(attribute.id)}
                      className="min-h-11 rounded-lg border border-line px-2.5 text-sm transition-colors hover:bg-surface-brand"
                    >
                      Ver valores
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selectedAttribute !== null && (
        <div className="flex max-w-3xl flex-col gap-3 rounded-xl border border-line bg-surface p-4">
          <h2 className="text-base font-semibold">Valores de {selectedAttribute.name}</h2>

          {valuesStatus === 'loading' && <p role="status">Cargando…</p>}

          {valuesStatus === 'error' && (
            <LoadErrorCard
              message={valuesError ?? LOAD_VALUES_ERROR_MESSAGE}
              onRetry={() => loadValues(selectedAttribute.id)}
            />
          )}

          {valuesStatus === 'success' && (
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {values.map((value) => (
                <li
                  key={value.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-line px-3 py-2"
                >
                  {editingValueId === value.id ? (
                    <form onSubmit={handleSaveValue} className="flex w-full flex-wrap items-center gap-2">
                      <input
                        type="text"
                        aria-label="Valor"
                        value={editingValue}
                        onChange={(event) => setEditingValue(event.target.value)}
                        disabled={savingValue}
                        className={inputClasses}
                      />
                      <button type="submit" disabled={savingValue} className={primaryButtonClasses}>
                        Guardar
                      </button>
                      <button type="button" onClick={cancelEditValue} disabled={savingValue} className={secondaryButtonClasses}>
                        Cancelar
                      </button>
                    </form>
                  ) : (
                    <>
                      <span className={`text-base ${value.status !== 'active' ? 'opacity-50 line-through' : ''}`}>
                        {value.value}
                      </span>
                      {canManage && (
                        <span className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => startEditValue(value)}
                            className="min-h-11 rounded-lg border border-line px-2.5 text-sm transition-colors hover:bg-surface-brand"
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setStatusChangeError(null)
                              setConfirmingStatusChange(value)
                            }}
                            className="min-h-11 rounded-lg border border-line px-2.5 text-sm transition-colors hover:bg-surface-brand"
                          >
                            {value.status === 'active' ? 'Desactivar' : 'Activar'}
                          </button>
                        </span>
                      )}
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}

          {canManage && (
            <form onSubmit={handleCreateValue} className="flex flex-wrap items-center gap-2">
              <label htmlFor="new-attribute-value" className="text-base font-semibold">
                Nuevo valor
              </label>
              <input
                id="new-attribute-value"
                type="text"
                value={newValue}
                onChange={(event) => setNewValue(event.target.value)}
                disabled={creatingValue}
                className={inputClasses}
              />
              <button type="submit" disabled={creatingValue || newValue.trim() === ''} className={primaryButtonClasses}>
                Crear
              </button>
            </form>
          )}
        </div>
      )}

      {confirmingStatusChange !== null && (
        <ConfirmDialog
          title={confirmingStatusChange.status === 'active' ? 'Desactivar valor' : 'Activar valor'}
          description={
            (statusChangeError ?? '') +
            (statusChangeError !== null ? ' ' : '') +
            (confirmingStatusChange.status === 'active'
              ? `"${confirmingStatusChange.value}" ya no va a poder asignarse a variantes nuevas. Las variantes que ya lo usan lo conservan.`
              : `"${confirmingStatusChange.value}" vuelve a estar disponible para asignarse a variantes nuevas.`)
          }
          confirmLabel={confirmingStatusChange.status === 'active' ? 'Desactivar' : 'Activar'}
          danger={confirmingStatusChange.status === 'active'}
          onConfirm={confirmStatusChange}
          onCancel={() => setConfirmingStatusChange(null)}
        />
      )}

      {confirmingCreateAttribute && (
        <ConfirmDialog
          title="Crear atributo"
          description={`Se va a crear el atributo "${newAttributeName.trim()}".`}
          confirmLabel="Crear"
          onConfirm={createAttributeNow}
          onCancel={() => setConfirmingCreateAttribute(false)}
        />
      )}

      {confirmingCreateValue && (
        <ConfirmDialog
          title="Crear valor"
          description={`Se va a crear el valor "${newValue.trim()}" para ${selectedAttribute?.name ?? ''}.`}
          confirmLabel="Crear"
          onConfirm={createValueNow}
          onCancel={() => setConfirmingCreateValue(false)}
        />
      )}

      {confirmingEditValue !== null && (
        <ConfirmDialog
          title="Guardar valor"
          description={`"${confirmingEditValue.value}" va a pasar a ser "${editingValue.trim()}".`}
          confirmLabel="Guardar"
          onConfirm={saveValueNow}
          onCancel={() => setConfirmingEditValue(null)}
        />
      )}
    </section>
  )
}
