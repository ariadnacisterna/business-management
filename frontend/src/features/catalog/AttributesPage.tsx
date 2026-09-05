import { useEffect, useState } from 'react'
import {
  createAttribute,
  createAttributeValue,
  fetchAttributeValues,
  fetchAttributes,
  updateAttributeValue,
} from '../../api/catalog'
import { ApiError } from '../../api/client'
import type { Attribute, AttributeValue } from '../../api/types'
import { useAuth } from '../access/AuthContext'
import { canManageCatalog } from '../access/roles'

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
  const [createAttributeError, setCreateAttributeError] = useState<string | null>(null)

  const [newValue, setNewValue] = useState('')
  const [creatingValue, setCreatingValue] = useState(false)
  const [createValueError, setCreateValueError] = useState<string | null>(null)

  const [editingValueId, setEditingValueId] = useState<number | null>(null)
  const [editingValue, setEditingValue] = useState('')
  const [savingValue, setSavingValue] = useState(false)
  const [editValueError, setEditValueError] = useState<string | null>(null)

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

  useEffect(loadAttributes, [])

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

  async function handleCreateAttribute(event: React.FormEvent) {
    event.preventDefault()
    setCreateAttributeError(null)
    const trimmed = newAttributeName.trim()
    if (trimmed === '') return

    setSavingAttribute(true)
    try {
      const attribute = await createAttribute(trimmed)
      setAttributes((prev) => [...prev, attribute])
      setNewAttributeName('')
      setCreatingAttribute(false)
    } catch (error) {
      setCreateAttributeError(error instanceof ApiError ? error.message : SAVE_ERROR_MESSAGE)
    } finally {
      setSavingAttribute(false)
    }
  }

  async function handleCreateValue(event: React.FormEvent) {
    event.preventDefault()
    if (selectedId === null) return
    setCreateValueError(null)
    const trimmed = newValue.trim()
    if (trimmed === '') return

    setCreatingValue(true)
    try {
      const value = await createAttributeValue(selectedId, trimmed)
      setValues((prev) => [...prev, value])
      setNewValue('')
    } catch (error) {
      setCreateValueError(error instanceof ApiError ? error.message : SAVE_ERROR_MESSAGE)
    } finally {
      setCreatingValue(false)
    }
  }

  function startEditValue(value: AttributeValue) {
    setEditingValueId(value.id)
    setEditingValue(value.value)
    setEditValueError(null)
  }

  function cancelEditValue() {
    setEditingValueId(null)
    setEditingValue('')
    setEditValueError(null)
  }

  async function handleSaveValue(event: React.FormEvent) {
    event.preventDefault()
    if (editingValueId === null) return
    const trimmed = editingValue.trim()
    if (trimmed === '') return

    setSavingValue(true)
    setEditValueError(null)
    try {
      const updated = await updateAttributeValue(editingValueId, trimmed)
      setValues((prev) => prev.map((value) => (value.id === updated.id ? updated : value)))
      cancelEditValue()
    } catch (error) {
      setEditValueError(error instanceof ApiError ? error.message : SAVE_ERROR_MESSAGE)
    } finally {
      setSavingValue(false)
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
              setCreateAttributeError(null)
            }}
            disabled={savingAttribute}
            className={secondaryButtonClasses}
          >
            Cancelar
          </button>
          {createAttributeError !== null && (
            <p role="alert" className="m-0 w-full text-base text-danger">
              {createAttributeError}
            </p>
          )}
        </form>
      )}

      {status === 'loading' && <p role="status">Cargando…</p>}

      {status === 'error' && (
        <div className="flex items-center gap-3" role="alert">
          <p className="m-0 text-danger">{loadError}</p>
          <button type="button" onClick={loadAttributes} className={secondaryButtonClasses}>
            Reintentar
          </button>
        </div>
      )}

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
            <div className="flex items-center gap-3" role="alert">
              <p className="m-0 text-danger">{valuesError}</p>
              <button type="button" onClick={() => loadValues(selectedAttribute.id)} className={secondaryButtonClasses}>
                Reintentar
              </button>
            </div>
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
                      {editValueError !== null && (
                        <p role="alert" className="m-0 w-full text-base text-danger">
                          {editValueError}
                        </p>
                      )}
                    </form>
                  ) : (
                    <>
                      <span className={`text-base ${value.status !== 'active' ? 'opacity-50 line-through' : ''}`}>
                        {value.value}
                      </span>
                      {canManage && (
                        <button
                          type="button"
                          onClick={() => startEditValue(value)}
                          className="min-h-11 rounded-lg border border-line px-2.5 text-sm transition-colors hover:bg-surface-brand"
                        >
                          Editar
                        </button>
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
              {createValueError !== null && (
                <p role="alert" className="m-0 w-full text-base text-danger">
                  {createValueError}
                </p>
              )}
            </form>
          )}
        </div>
      )}
    </section>
  )
}
