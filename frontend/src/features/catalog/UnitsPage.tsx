import { useMemo, useState } from 'react'
import { Badge } from '../../shared/Badge'
import { createUnit, fetchProducts, fetchUnits, updateUnit } from '../../api/catalog'
import { errorMessage } from '../../api/client'
import type { Product, Unit } from '../../api/types'
import { ConfirmDialog } from '../../shared/ConfirmDialog'
import { LoadErrorCard } from '../../shared/LoadErrorCard'
import { PageLoading } from '../../shared/PageLoading'
import {
  STACKED_ACTION_CELL_CLASSES,
  STACKED_BODY_CLASSES,
  STACKED_CELL_CLASSES,
  STACKED_FULL_CELL_CLASSES,
  STACKED_HEAD_CLASSES,
  STACKED_LABEL_CLASSES,
  STACKED_ROW_CLASSES,
  STACKED_TABLE_CLASSES,
} from '../../shared/stackedTable'
import { useLoad } from '../../shared/useLoad'
import { useToast } from '../../shared/useToast'
import { useAuth } from '../access/useAuth'
import { canManageCatalog } from '../access/roles'

const NO_UNITS: Unit[] = []
const NO_PRODUCTS: Product[] = []

const LOAD_ERROR_MESSAGE = 'No se pudieron cargar las unidades.'
const SAVE_ERROR_MESSAGE = 'No se pudo guardar la unidad. Intentá de nuevo.'

interface UnitDraft {
  name: string
  abbreviation: string
  allowsFraction: boolean
}

const EMPTY_DRAFT: UnitDraft = { name: '', abbreviation: '', allowsFraction: false }

const inputClasses =
  'h-11 rounded-lg border border-line px-3 text-base focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/10'
const primaryButtonClasses =
  'min-h-11 rounded-lg bg-brand px-4 text-base font-bold text-brand-contrast transition-colors hover:bg-brand/90 disabled:opacity-40'
const secondaryButtonClasses =
  'min-h-11 rounded-lg border border-line px-3 text-base transition-colors hover:bg-surface-brand'
const rowButtonClasses = 'min-h-11 rounded-lg border border-line px-2.5 text-sm transition-colors hover:bg-surface-brand'

export function UnitsPage() {
  const { account } = useAuth()
  const canManage = canManageCatalog(account)
  const { showSuccess, showError } = useToast()

  const { status, data, reload, setData } = useLoad(
    () => Promise.all([fetchUnits(), fetchProducts()]).then(([units, products]) => ({ units, products })),
    [account?.active_business_id],
  )
  const units = data?.units ?? NO_UNITS
  const products = data?.products ?? NO_PRODUCTS

  const [creating, setCreating] = useState(false)
  const [draft, setDraft] = useState<UnitDraft>(EMPTY_DRAFT)
  const [savingNew, setSavingNew] = useState(false)

  const [editingId, setEditingId] = useState<number | null>(null)
  const [editingDraft, setEditingDraft] = useState<UnitDraft>(EMPTY_DRAFT)
  const [savingEdit, setSavingEdit] = useState(false)

  const [confirmingCreate, setConfirmingCreate] = useState(false)
  const [confirmingEdit, setConfirmingEdit] = useState<Unit | null>(null)

  const productCountByUnit = useMemo(() => {
    const counts = new Map<number, number>()
    for (const product of products) {
      counts.set(product.unit_id, (counts.get(product.unit_id) ?? 0) + 1)
    }
    return counts
  }, [products])

  function handleCreate(event: React.FormEvent) {
    event.preventDefault()
    if (draft.name.trim() === '' || draft.abbreviation.trim() === '') return
    setConfirmingCreate(true)
  }

  async function createUnitNow() {
    setConfirmingCreate(false)
    const name = draft.name.trim()
    const abbreviation = draft.abbreviation.trim()
    if (name === '' || abbreviation === '') return

    setSavingNew(true)
    try {
      const unit = await createUnit({ name, abbreviation, allows_fraction: draft.allowsFraction })
      setData((prev) => prev && { ...prev, units: [...prev.units, unit] })
      setDraft(EMPTY_DRAFT)
      setCreating(false)
      showSuccess('Unidad creada.')
    } catch (error) {
      showError(errorMessage(error, SAVE_ERROR_MESSAGE))
    } finally {
      setSavingNew(false)
    }
  }

  function startEdit(unit: Unit) {
    setEditingId(unit.id)
    setEditingDraft({ name: unit.name, abbreviation: unit.abbreviation, allowsFraction: unit.allows_fraction })
  }

  function cancelEdit() {
    setEditingId(null)
    setEditingDraft(EMPTY_DRAFT)
  }

  function handleSaveEdit(event: React.FormEvent) {
    event.preventDefault()
    if (editingId === null) return
    if (editingDraft.name.trim() === '' || editingDraft.abbreviation.trim() === '') return
    const unit = units.find((item) => item.id === editingId)
    if (unit === undefined) return
    setConfirmingEdit(unit)
  }

  async function saveEditNow() {
    if (editingId === null) return
    const name = editingDraft.name.trim()
    const abbreviation = editingDraft.abbreviation.trim()
    if (name === '' || abbreviation === '') return

    setConfirmingEdit(null)
    setSavingEdit(true)
    try {
      const updated = await updateUnit(editingId, {
        name,
        abbreviation,
        allows_fraction: editingDraft.allowsFraction,
      })
      setData(
        (prev) => prev && { ...prev, units: prev.units.map((unit) => (unit.id === updated.id ? updated : unit)) },
      )
      cancelEdit()
      showSuccess('Unidad actualizada.')
    } catch (error) {
      showError(errorMessage(error, SAVE_ERROR_MESSAGE))
    } finally {
      setSavingEdit(false)
    }
  }

  return (
    <section className="-m-4 flex flex-1 flex-col gap-4 bg-line/10 p-4 md:-m-6 md:p-6">
      <div className="flex max-w-3xl flex-wrap items-center justify-between gap-3">
        <h1 className="text-page-title">Unidades</h1>
        {canManage && !creating && (
          <button type="button" onClick={() => setCreating(true)} className={primaryButtonClasses}>
            + Nueva unidad
          </button>
        )}
      </div>

      {creating && (
        <form
          onSubmit={handleCreate}
          className="flex max-w-3xl flex-wrap items-center gap-2 rounded-xl border border-line bg-surface p-4"
        >
          <label htmlFor="new-unit-name" className="text-base font-semibold">
            Nueva unidad
          </label>
          <input
            id="new-unit-name"
            type="text"
            placeholder="Nombre"
            value={draft.name}
            onChange={(event) => setDraft((prev) => ({ ...prev, name: event.target.value }))}
            disabled={savingNew}
            className={inputClasses}
          />
          <input
            name="unit-abbreviation"
            aria-label="Abreviatura"
            type="text"
            placeholder="Abreviatura"
            value={draft.abbreviation}
            onChange={(event) => setDraft((prev) => ({ ...prev, abbreviation: event.target.value }))}
            disabled={savingNew}
            className={inputClasses}
          />
          <label className="flex items-center gap-1.5 text-base">
            <input
              name="unit-allows-fraction"
              type="checkbox"
              checked={draft.allowsFraction}
              onChange={(event) => setDraft((prev) => ({ ...prev, allowsFraction: event.target.checked }))}
              disabled={savingNew}
              className="accent-brand"
            />
            Admite fracciones
          </label>
          <button
            type="submit"
            disabled={savingNew || draft.name.trim() === '' || draft.abbreviation.trim() === ''}
            className={primaryButtonClasses}
          >
            Crear
          </button>
          <button
            type="button"
            onClick={() => {
              setCreating(false)
              setDraft(EMPTY_DRAFT)
            }}
            disabled={savingNew}
            className={secondaryButtonClasses}
          >
            Cancelar
          </button>
        </form>
      )}

      {status === 'loading' && <PageLoading />}

      {status === 'error' && <LoadErrorCard message={LOAD_ERROR_MESSAGE} onRetry={reload} />}

      {status === 'success' && units.length === 0 && (
        <div className="flex max-w-3xl flex-col items-center gap-2 rounded-xl border border-line bg-surface px-6 py-12 text-center">
          <p className="text-xl font-semibold opacity-70">No hay unidades cargadas</p>
          <p className="text-lg opacity-50">
            {canManage ? 'Usá "+ Nueva unidad" para crear la primera.' : 'Cuando se carguen unidades, van a aparecer acá.'}
          </p>
        </div>
      )}

      {status === 'success' && units.length > 0 && (
        <div className="max-w-3xl overflow-hidden rounded-xl border border-line bg-surface">
          <table className={STACKED_TABLE_CLASSES}>
            <thead className={STACKED_HEAD_CLASSES}>
              <tr className="border-b border-line bg-surface-brand/40">
                {['Nombre', 'Abreviatura', 'Fraccionable', 'Productos', 'Estado'].map((label) => (
                  <th key={label} className="whitespace-nowrap px-4 py-2.5 text-left text-sm font-semibold uppercase tracking-wide opacity-60">
                    {label}
                  </th>
                ))}
                {canManage && <th className="whitespace-nowrap px-4 py-3 text-center text-sm font-bold uppercase tracking-wide opacity-60">Acciones</th>}
              </tr>
            </thead>
            <tbody className={STACKED_BODY_CLASSES}>
              {units.map((unit) => (
                <tr key={unit.id} className={STACKED_ROW_CLASSES}>
                  {editingId === unit.id ? (
                    <td colSpan={canManage ? 6 : 5} className={STACKED_FULL_CELL_CLASSES}>
                      <form onSubmit={handleSaveEdit} className="flex flex-wrap items-center gap-2">
                        <input
                          name="unit-name-edit"
                          type="text"
                          aria-label="Nombre de la unidad"
                          value={editingDraft.name}
                          onChange={(event) => setEditingDraft((prev) => ({ ...prev, name: event.target.value }))}
                          disabled={savingEdit}
                          className={inputClasses}
                        />
                        <input
                          name="unit-abbreviation-edit"
                          type="text"
                          aria-label="Abreviatura"
                          value={editingDraft.abbreviation}
                          onChange={(event) =>
                            setEditingDraft((prev) => ({ ...prev, abbreviation: event.target.value }))
                          }
                          disabled={savingEdit}
                          className={inputClasses}
                        />
                        <label className="flex items-center gap-1.5 text-base">
                          <input
                            name="unit-allows-fraction-edit"
                            type="checkbox"
                            checked={editingDraft.allowsFraction}
                            onChange={(event) =>
                              setEditingDraft((prev) => ({ ...prev, allowsFraction: event.target.checked }))
                            }
                            disabled={savingEdit}
                            className="accent-brand"
                          />
                          Admite fracciones
                        </label>
                        <button type="submit" disabled={savingEdit} className={primaryButtonClasses}>
                          Guardar
                        </button>
                        <button type="button" onClick={cancelEdit} disabled={savingEdit} className={secondaryButtonClasses}>
                          Cancelar
                        </button>
                      </form>
                    </td>
                  ) : (
                    <>
                      <td className={`${STACKED_FULL_CELL_CLASSES} text-base font-medium [overflow-wrap:anywhere]`}>
                        {unit.name}
                      </td>
                      <td className={`${STACKED_CELL_CLASSES} text-base`}>
                        <span className={STACKED_LABEL_CLASSES}>Abreviatura: </span>
                        <span className="font-mono opacity-70">{unit.abbreviation}</span>
                      </td>
                      <td className={STACKED_CELL_CLASSES}>
                        <span className={`${STACKED_LABEL_CLASSES} text-base`}>Fraccionable: </span>
                        <span className={`text-sm font-semibold ${unit.allows_fraction ? 'text-success' : 'opacity-50'}`}>
                          {unit.allows_fraction ? 'Sí' : 'No'}
                        </span>
                      </td>
                      <td className={`${STACKED_CELL_CLASSES} text-base`}>
                        <span className={STACKED_LABEL_CLASSES}>Productos: </span>
                        <span className="opacity-70">{productCountByUnit.get(unit.id) ?? 0}</span>
                      </td>
                      <td className={STACKED_CELL_CLASSES}>
                        <Badge tone={unit.status === 'active' ? 'success' : 'muted'}>{unit.status === 'active' ? 'Activa' : 'Inactiva'}</Badge>
                      </td>
                      {canManage && (
                        <td className={STACKED_ACTION_CELL_CLASSES}>
                          <button
                            type="button"
                            onClick={() => startEdit(unit)}
                            aria-label={`Editar ${unit.name}`}
                            className={rowButtonClasses}
                          >
                            Editar
                          </button>
                        </td>
                      )}
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {confirmingCreate && (
        <ConfirmDialog
          title="Crear unidad"
          description={`Se va a crear la unidad "${draft.name.trim()}" (${draft.abbreviation.trim()}).`}
          confirmLabel="Crear"
          breadcrumb={['Unidades', 'Crear unidad']}
          onConfirm={createUnitNow}
          onCancel={() => setConfirmingCreate(false)}
        />
      )}

      {confirmingEdit !== null && (
        <ConfirmDialog
          title="Guardar unidad"
          description={`"${confirmingEdit.name}" (${confirmingEdit.abbreviation}) va a pasar a ser "${editingDraft.name.trim()}" (${editingDraft.abbreviation.trim()}).`}
          confirmLabel="Guardar"
          breadcrumb={['Unidades', confirmingEdit.name, 'Guardar unidad']}
          onConfirm={saveEditNow}
          onCancel={() => setConfirmingEdit(null)}
        />
      )}
    </section>
  )
}
