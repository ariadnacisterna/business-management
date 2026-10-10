import { useState } from 'react'
import {
  createAttribute,
  createAttributeValue,
  deactivateAttributeValue,
  fetchAttributeValues,
  fetchAttributes,
  reactivateAttributeValue,
  updateAttributeValue,
} from '../../api/catalog'
import { errorMessage } from '../../api/client'
import type { Attribute, AttributeValue } from '../../api/types'
import { useAuth } from '../access/useAuth'
import { canManageCatalog } from '../access/roles'
import { ConfirmDialog } from '../../shared/ConfirmDialog'
import { LoadErrorCard } from '../../shared/LoadErrorCard'
import { PageLoading } from '../../shared/PageLoading'
import { useLatestRequest } from '../../shared/useLatestRequest'
import {
  STACKED_ACTION_CELL_CLASSES,
  STACKED_BODY_CLASSES,
  STACKED_CELL_CLASSES,
  STACKED_FULL_CELL_CLASSES,
  STACKED_HEAD_CLASSES,
  STACKED_ROW_CLASSES,
  STACKED_TABLE_CLASSES,
} from '../../shared/stackedTable'
import { useLoad } from '../../shared/useLoad'
import { useToast } from '../../shared/useToast'

type Status = 'loading' | 'success' | 'error'

const NO_ATTRIBUTES: Attribute[] = []

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
  return <AttributesContent key={account?.active_business_id} />
}

function AttributesContent() {
  const { account } = useAuth()
  const canManage = canManageCatalog(account)
  const { showSuccess, showError } = useToast()

  const {
    status,
    data,
    reload: loadAttributes,
    setData,
  } = useLoad(() => fetchAttributes(), [account?.active_business_id])
  const attributes = data ?? NO_ATTRIBUTES

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
  const startValuesRequest = useLatestRequest()

  function loadValues(attributeId: number) {
    const isLatest = startValuesRequest()
    setValuesStatus('loading')
    setValuesError(null)
    fetchAttributeValues(attributeId)
      .then((result) => {
        if (!isLatest()) return
        setValues(result)
        setValuesStatus('success')
      })
      .catch(() => {
        if (!isLatest()) return
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
      setData((prev) => prev && [...prev, attribute])
      setNewAttributeName('')
      setCreatingAttribute(false)
      showSuccess('Atributo creado.')
    } catch (error) {
      showError(errorMessage(error, SAVE_ERROR_MESSAGE))
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
      showError(errorMessage(error, SAVE_ERROR_MESSAGE))
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
      showError(errorMessage(error, SAVE_ERROR_MESSAGE))
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
      setStatusChangeError(errorMessage(error, SAVE_ERROR_MESSAGE))
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

      {status === 'loading' && <PageLoading />}

      {status === 'error' && <LoadErrorCard message={LOAD_ERROR_MESSAGE} onRetry={loadAttributes} />}

      {status === 'success' && attributes.length === 0 && (
        <div className="flex max-w-3xl flex-col items-center gap-2 rounded-xl border border-line bg-surface px-6 py-12 text-center">
          <p className="text-xl font-semibold opacity-70">No hay atributos cargados</p>
          <p className="text-lg opacity-50">
            {canManage ? 'Usá "+ Nuevo atributo" para crear el primero.' : 'Cuando se carguen atributos, van a aparecer acá.'}
          </p>
        </div>
      )}

      {status === 'success' && attributes.length > 0 && (
        <div className="max-w-3xl overflow-hidden rounded-xl border border-line bg-surface">
          <table className={STACKED_TABLE_CLASSES}>
            <thead className={STACKED_HEAD_CLASSES}>
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
            <tbody className={STACKED_BODY_CLASSES}>
              {attributes.map((attribute) => (
                <tr key={attribute.id} className={STACKED_ROW_CLASSES}>
                  <td className={`${STACKED_FULL_CELL_CLASSES} text-base font-medium [overflow-wrap:anywhere]`}>
                    {attribute.name}
                  </td>
                  <td className={STACKED_CELL_CLASSES}>
                    <span className={`text-sm font-semibold ${attribute.status === 'active' ? 'text-success' : 'opacity-50'}`}>
                      ● {attribute.status === 'active' ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td className={STACKED_ACTION_CELL_CLASSES}>
                    <button
                      type="button"
                      onClick={() => selectAttribute(attribute.id)}
                      aria-label={`Ver valores de ${attribute.name}`}
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

          {valuesStatus === 'loading' && <PageLoading />}

          {valuesStatus === 'error' && (
            <LoadErrorCard
              message={valuesError ?? LOAD_VALUES_ERROR_MESSAGE}
              onRetry={() => loadValues(selectedAttribute.id)}
            />
          )}

          {valuesStatus === 'success' && values.length === 0 && (
            <p className="m-0 text-lg opacity-60">Este atributo todavía no tiene valores.</p>
          )}

          {valuesStatus === 'success' && values.length > 0 && (
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {values.map((value) => (
                <li
                  key={value.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line px-3 py-2"
                >
                  {editingValueId === value.id ? (
                    <form onSubmit={handleSaveValue} className="flex w-full flex-wrap items-center gap-2">
                      <input
                        name="attribute-value-edit"
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
                      <span
                        className={`min-w-0 text-base [overflow-wrap:anywhere] ${value.status !== 'active' ? 'opacity-50 line-through' : ''}`}
                      >
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
          breadcrumb={[
            'Atributos',
            selectedAttribute?.name ?? '',
            confirmingStatusChange.status === 'active' ? 'Desactivar valor' : 'Activar valor',
          ]}
          onConfirm={confirmStatusChange}
          onCancel={() => setConfirmingStatusChange(null)}
        />
      )}

      {confirmingCreateAttribute && (
        <ConfirmDialog
          title="Crear atributo"
          description={`Se va a crear el atributo "${newAttributeName.trim()}".`}
          confirmLabel="Crear"
          breadcrumb={['Atributos', 'Crear atributo']}
          onConfirm={createAttributeNow}
          onCancel={() => setConfirmingCreateAttribute(false)}
        />
      )}

      {confirmingCreateValue && (
        <ConfirmDialog
          title="Crear valor"
          description={`Se va a crear el valor "${newValue.trim()}" para ${selectedAttribute?.name ?? ''}.`}
          confirmLabel="Crear"
          breadcrumb={['Atributos', selectedAttribute?.name ?? '', 'Crear valor']}
          onConfirm={createValueNow}
          onCancel={() => setConfirmingCreateValue(false)}
        />
      )}

      {confirmingEditValue !== null && (
        <ConfirmDialog
          title="Guardar valor"
          description={`"${confirmingEditValue.value}" va a pasar a ser "${editingValue.trim()}".`}
          confirmLabel="Guardar"
          breadcrumb={['Atributos', confirmingEditValue.value, 'Guardar valor']}
          onConfirm={saveValueNow}
          onCancel={() => setConfirmingEditValue(null)}
        />
      )}
    </section>
  )
}
