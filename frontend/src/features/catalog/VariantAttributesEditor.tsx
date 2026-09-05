import { useState } from 'react'
import { createAttribute, createAttributeValue, fetchAttributeValues } from '../../api/catalog'
import { ApiError } from '../../api/client'
import type { Attribute, AttributeValue } from '../../api/types'

const LOAD_ERROR_MESSAGE = 'No se pudieron cargar los valores.'
const SAVE_ERROR_MESSAGE = 'No se pudo agregar el valor. Intentá de nuevo.'
const SAVE_ATTRIBUTE_ERROR_MESSAGE = 'No se pudo crear el atributo. Intentá de nuevo.'

const CREATE_NEW_ATTRIBUTE = '__create__'

export interface SelectedAttributeValue {
  id: number
  attribute_id: number
  value: string
}

interface Props {
  attributes: Attribute[]
  selectedValues: SelectedAttributeValue[]
  onAdd: (value: SelectedAttributeValue) => void
  onRemove: (valueId: number) => void
  onAttributeCreated: (attribute: Attribute) => void
  disabled?: boolean
}

const selectClasses = 'h-11 rounded-lg border border-line px-3 text-base focus:border-brand focus:outline-none'
const smallButtonClasses = 'min-h-11 rounded-lg border border-line px-3 py-1.5 text-sm'

export function VariantAttributesEditor({
  attributes,
  selectedValues,
  onAdd,
  onRemove,
  onAttributeCreated,
  disabled,
}: Props) {
  const [pickerAttributeId, setPickerAttributeId] = useState<number | ''>('')
  const [availableValues, setAvailableValues] = useState<AttributeValue[]>([])
  const [loadingValues, setLoadingValues] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [showNewValueInput, setShowNewValueInput] = useState(false)
  const [newValueText, setNewValueText] = useState('')
  const [savingNewValue, setSavingNewValue] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const [showNewAttributeInput, setShowNewAttributeInput] = useState(false)
  const [newAttributeName, setNewAttributeName] = useState('')
  const [savingNewAttribute, setSavingNewAttribute] = useState(false)
  const [attributeSaveError, setAttributeSaveError] = useState<string | null>(null)

  function handleAttributeChange(rawId: string) {
    setLoadError(null)
    setShowNewValueInput(false)
    setNewValueText('')

    if (rawId === CREATE_NEW_ATTRIBUTE) {
      setPickerAttributeId('')
      setAvailableValues([])
      setShowNewAttributeInput(true)
      setNewAttributeName('')
      setAttributeSaveError(null)
      return
    }

    setShowNewAttributeInput(false)
    if (rawId === '') {
      setPickerAttributeId('')
      setAvailableValues([])
      return
    }

    const attributeId = Number(rawId)
    setPickerAttributeId(attributeId)
    setLoadingValues(true)
    fetchAttributeValues(attributeId)
      .then((values) => {
        setAvailableValues(values.filter((value) => value.status === 'active'))
      })
      .catch(() => {
        setLoadError(LOAD_ERROR_MESSAGE)
      })
      .finally(() => setLoadingValues(false))
  }

  async function handleCreateAttribute() {
    const trimmed = newAttributeName.trim()
    if (trimmed === '') return

    setSavingNewAttribute(true)
    setAttributeSaveError(null)
    try {
      const created = await createAttribute(trimmed)
      onAttributeCreated(created)
      setPickerAttributeId(created.id)
      setAvailableValues([])
      setShowNewAttributeInput(false)
      setNewAttributeName('')
      setShowNewValueInput(true)
    } catch (error) {
      setAttributeSaveError(error instanceof ApiError ? error.message : SAVE_ATTRIBUTE_ERROR_MESSAGE)
    } finally {
      setSavingNewAttribute(false)
    }
  }

  function handlePickValue(rawId: string) {
    if (rawId === '') return
    const value = availableValues.find((candidate) => candidate.id === Number(rawId))
    if (value === undefined) return
    onAdd({ id: value.id, attribute_id: value.attribute_id, value: value.value })
  }

  async function handleCreateNewValue() {
    if (pickerAttributeId === '') return
    const trimmed = newValueText.trim()
    if (trimmed === '') return

    setSavingNewValue(true)
    setSaveError(null)
    try {
      const created = await createAttributeValue(pickerAttributeId, trimmed)
      setAvailableValues((prev) => [...prev, created])
      onAdd({ id: created.id, attribute_id: created.attribute_id, value: created.value })
      setNewValueText('')
      setShowNewValueInput(false)
    } catch (error) {
      setSaveError(error instanceof ApiError ? error.message : SAVE_ERROR_MESSAGE)
    } finally {
      setSavingNewValue(false)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {selectedValues.length > 0 && (
        <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
          {selectedValues.map((value) => (
            <li
              key={value.id}
              className="flex items-center gap-1.5 rounded-full border border-line py-1 pl-3 pr-1 text-sm"
            >
              {value.value}
              {!disabled && (
                <button
                  type="button"
                  aria-label={`Quitar ${value.value}`}
                  onClick={() => onRemove(value.id)}
                  className="rounded-full px-1 leading-none hover:bg-surface-brand"
                >
                  ×
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {!disabled && (
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Atributo"
            value={pickerAttributeId}
            onChange={(event) => handleAttributeChange(event.target.value)}
            className={selectClasses}
          >
            <option value="">Agregar atributo…</option>
            {attributes.map((attribute) => (
              <option key={attribute.id} value={attribute.id}>
                {attribute.name}
              </option>
            ))}
            <option value={CREATE_NEW_ATTRIBUTE}>+ Crear atributo nuevo…</option>
          </select>

          {showNewAttributeInput && (
            <span className="flex items-center gap-2">
              <input
                type="text"
                aria-label="Nombre del atributo nuevo"
                placeholder="Nombre del atributo (ej. Talle)"
                value={newAttributeName}
                onChange={(event) => setNewAttributeName(event.target.value)}
                disabled={savingNewAttribute}
                className="h-11 rounded-lg border border-line px-3 text-base focus:border-brand focus:outline-none"
              />
              <button
                type="button"
                onClick={handleCreateAttribute}
                disabled={savingNewAttribute || newAttributeName.trim() === ''}
                className={smallButtonClasses}
              >
                Crear
              </button>
              {attributeSaveError !== null && (
                <p role="alert" className="m-0 text-sm text-danger">
                  {attributeSaveError}
                </p>
              )}
            </span>
          )}

          {pickerAttributeId !== '' && loadingValues && <span role="status">Cargando…</span>}

          {pickerAttributeId !== '' && !loadingValues && loadError === null && (
            <select
              aria-label="Valor"
              value=""
              onChange={(event) => handlePickValue(event.target.value)}
              className={selectClasses}
            >
              <option value="">Elegir valor…</option>
              {availableValues
                .filter((value) => !selectedValues.some((selected) => selected.id === value.id))
                .map((value) => (
                  <option key={value.id} value={value.id}>
                    {value.value}
                  </option>
                ))}
            </select>
          )}

          {loadError !== null && (
            <p role="alert" className="m-0 w-full text-sm text-danger">
              {loadError}
            </p>
          )}

          {pickerAttributeId !== '' && !loadingValues && loadError === null && !showNewValueInput && (
            <button type="button" onClick={() => setShowNewValueInput(true)} className={smallButtonClasses}>
              + Nuevo valor
            </button>
          )}

          {showNewValueInput && (
            <span className="flex items-center gap-2">
              <input
                type="text"
                aria-label="Nuevo valor"
                value={newValueText}
                onChange={(event) => setNewValueText(event.target.value)}
                disabled={savingNewValue}
                className="h-11 rounded-lg border border-line px-3 text-base focus:border-brand focus:outline-none"
              />
              <button
                type="button"
                onClick={handleCreateNewValue}
                disabled={savingNewValue || newValueText.trim() === ''}
                className={smallButtonClasses}
              >
                Agregar
              </button>
              {saveError !== null && (
                <p role="alert" className="m-0 text-sm text-danger">
                  {saveError}
                </p>
              )}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
