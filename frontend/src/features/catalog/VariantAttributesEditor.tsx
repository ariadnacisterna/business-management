import { useState } from 'react'
import { createAttribute, createAttributeValue, fetchAttributeValues } from '../../api/catalog'
import { ApiError } from '../../api/client'
import type { Attribute, AttributeValue } from '../../api/types'
import { SelectMenu } from '../../shared/SelectMenu'
import { TrashIcon } from '../../shared/icons'

const LOAD_ERROR_MESSAGE = 'No se pudieron cargar los valores.'
const SAVE_ERROR_MESSAGE = 'No se pudo agregar el valor. Intentá de nuevo.'
const SAVE_ATTRIBUTE_ERROR_MESSAGE = 'No se pudo crear el atributo. Intentá de nuevo.'

const CREATE_NEW_ATTRIBUTE = '__create__'
const CREATE_NEW_VALUE = '__create_value__'

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

const smallButtonClasses = 'min-h-11 rounded-lg border border-line px-3 py-1.5 text-sm'
const fieldInputClasses = 'h-12 rounded-lg border border-line px-3 text-base focus:border-brand focus:outline-none'
const fieldLabelClasses = 'text-sm font-bold'

export function VariantAttributesEditor({
  attributes,
  selectedValues,
  onAdd,
  onRemove,
  onAttributeCreated,
  disabled,
}: Props) {
  const [pickerAttributeId, setPickerAttributeId] = useState<number | ''>('')
  const [pendingValueId, setPendingValueId] = useState('')
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
    setPendingValueId('')

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

  function handleValueChange(rawId: string) {
    if (rawId === CREATE_NEW_VALUE) {
      setPendingValueId('')
      setShowNewValueInput(true)
      setNewValueText('')
      setSaveError(null)
      return
    }
    setShowNewValueInput(false)
    setPendingValueId(rawId)
  }

  function handleAddPendingValue() {
    if (pendingValueId === '') return
    const value = availableValues.find((candidate) => candidate.id === Number(pendingValueId))
    if (value === undefined) return
    onAdd({ id: value.id, attribute_id: value.attribute_id, value: value.value })
    setPendingValueId('')
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
    <div className="flex flex-col gap-4">
      <div className="rounded-xl bg-line/10 p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="m-0 text-base font-bold">Valores seleccionados</p>
          <p className="m-0 text-sm opacity-60">{selectedValues.length} seleccionados</p>
        </div>
        {selectedValues.length > 0 ? (
          <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
            {selectedValues.map((value) => (
              <li
                key={value.id}
                className="flex items-center gap-1.5 rounded-full border border-line bg-surface py-1 pl-3 pr-1 text-sm"
              >
                {value.value}
                {!disabled && (
                  <button
                    type="button"
                    aria-label={`Quitar ${value.value}`}
                    onClick={() => onRemove(value.id)}
                    className="flex h-6 w-6 items-center justify-center rounded-full text-danger transition-colors hover:bg-danger/10"
                  >
                    <TrashIcon className="h-3.5 w-3.5" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="m-0 text-sm italic opacity-40">Todavía no agregaste valores.</p>
        )}
      </div>

      {!disabled && (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <p className={`m-0 ${fieldLabelClasses}`}>Atributo</p>
              <SelectMenu
                ariaLabel="Atributo"
                value={pickerAttributeId === '' ? '' : String(pickerAttributeId)}
                onChange={(rawId) => handleAttributeChange(rawId)}
                options={[
                  { value: '', label: 'Agregar atributo…' },
                  ...attributes.map((attribute) => ({ value: String(attribute.id), label: attribute.name })),
                  { value: CREATE_NEW_ATTRIBUTE, label: '+ Crear atributo nuevo…' },
                ]}
              />
            </div>

            <div className="flex flex-col gap-1">
              <p className={`m-0 ${fieldLabelClasses}`}>Valor</p>
              <SelectMenu
                ariaLabel="Valor"
                disabled={pickerAttributeId === '' || loadingValues || loadError !== null}
                value={pendingValueId}
                onChange={handleValueChange}
                options={[
                  { value: '', label: 'Elegir valor…' },
                  ...availableValues
                    .filter((value) => !selectedValues.some((selected) => selected.id === value.id))
                    .map((value) => ({ value: String(value.id), label: value.value })),
                  { value: CREATE_NEW_VALUE, label: '+ Nuevo valor…' },
                ]}
              />
            </div>
          </div>

          {showNewAttributeInput && (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <input
                type="text"
                aria-label="Nombre del atributo nuevo"
                placeholder="Nombre del atributo (ej. Talle)"
                value={newAttributeName}
                onChange={(event) => setNewAttributeName(event.target.value)}
                disabled={savingNewAttribute}
                className={`${fieldInputClasses} h-11 flex-1`}
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
            </div>
          )}

          {pickerAttributeId !== '' && loadingValues && <span role="status">Cargando…</span>}

          {loadError !== null && (
            <p role="alert" className="m-0 text-sm text-danger">
              {loadError}
            </p>
          )}

          {showNewValueInput && (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <input
                type="text"
                aria-label="Nuevo valor"
                value={newValueText}
                onChange={(event) => setNewValueText(event.target.value)}
                disabled={savingNewValue}
                className={`${fieldInputClasses} h-11 flex-1`}
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
            </div>
          )}

          <button
            type="button"
            onClick={handleAddPendingValue}
            disabled={pendingValueId === ''}
            className="h-12 w-full rounded-lg bg-brand text-base font-bold text-brand-contrast transition-colors hover:bg-brand/90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Agregar valor
          </button>
        </div>
      )}
    </div>
  )
}
