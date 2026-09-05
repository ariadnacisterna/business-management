import { useEffect, useMemo, useState } from 'react'
import { createUnit, fetchProducts, fetchUnits, updateUnit } from '../../api/catalog'
import { ApiError } from '../../api/client'
import type { Product, Unit } from '../../api/types'
import { useAuth } from '../access/AuthContext'
import { canManageCatalog } from '../access/roles'

type Status = 'loading' | 'success' | 'error'

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

  const [units, setUnits] = useState<Unit[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [status, setStatus] = useState<Status>('loading')
  const [loadError, setLoadError] = useState<string | null>(null)

  const [creating, setCreating] = useState(false)
  const [draft, setDraft] = useState<UnitDraft>(EMPTY_DRAFT)
  const [savingNew, setSavingNew] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  const [editingId, setEditingId] = useState<number | null>(null)
  const [editingDraft, setEditingDraft] = useState<UnitDraft>(EMPTY_DRAFT)
  const [savingEdit, setSavingEdit] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)

  function load() {
    setStatus('loading')
    setLoadError(null)
    Promise.all([fetchUnits(), fetchProducts()])
      .then(([unitResult, productResult]) => {
        setUnits(unitResult)
        setProducts(productResult)
        setStatus('success')
      })
      .catch(() => {
        setLoadError(LOAD_ERROR_MESSAGE)
        setStatus('error')
      })
  }

  useEffect(load, [])

  const productCountByUnit = useMemo(() => {
    const counts = new Map<number, number>()
    for (const product of products) {
      counts.set(product.unit_id, (counts.get(product.unit_id) ?? 0) + 1)
    }
    return counts
  }, [products])

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault()
    setCreateError(null)
    const name = draft.name.trim()
    const abbreviation = draft.abbreviation.trim()
    if (name === '' || abbreviation === '') return

    setSavingNew(true)
    try {
      const unit = await createUnit({ name, abbreviation, allows_fraction: draft.allowsFraction })
      setUnits((prev) => [...prev, unit])
      setDraft(EMPTY_DRAFT)
      setCreating(false)
    } catch (error) {
      setCreateError(error instanceof ApiError ? error.message : SAVE_ERROR_MESSAGE)
    } finally {
      setSavingNew(false)
    }
  }

  function startEdit(unit: Unit) {
    setEditingId(unit.id)
    setEditingDraft({ name: unit.name, abbreviation: unit.abbreviation, allowsFraction: unit.allows_fraction })
    setEditError(null)
  }

  function cancelEdit() {
    setEditingId(null)
    setEditingDraft(EMPTY_DRAFT)
    setEditError(null)
  }

  async function handleSaveEdit(event: React.FormEvent) {
    event.preventDefault()
    if (editingId === null) return
    const name = editingDraft.name.trim()
    const abbreviation = editingDraft.abbreviation.trim()
    if (name === '' || abbreviation === '') return

    setSavingEdit(true)
    setEditError(null)
    try {
      const updated = await updateUnit(editingId, {
        name,
        abbreviation,
        allows_fraction: editingDraft.allowsFraction,
      })
      setUnits((prev) => prev.map((unit) => (unit.id === updated.id ? updated : unit)))
      cancelEdit()
    } catch (error) {
      setEditError(error instanceof ApiError ? error.message : SAVE_ERROR_MESSAGE)
    } finally {
      setSavingEdit(false)
    }
  }

  return (
    <section className="-m-4 flex min-h-[calc(100svh-4rem)] flex-col gap-4 bg-line/10 p-4 md:-m-6 md:p-6">
      <div className="flex max-w-3xl flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold">Unidades</h1>
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
              setCreateError(null)
            }}
            disabled={savingNew}
            className={secondaryButtonClasses}
          >
            Cancelar
          </button>
          {createError !== null && (
            <p role="alert" className="m-0 w-full text-base text-danger">
              {createError}
            </p>
          )}
        </form>
      )}

      {status === 'loading' && <p role="status">Cargando…</p>}

      {status === 'error' && (
        <div className="flex items-center gap-3" role="alert">
          <p className="m-0 text-danger">{loadError}</p>
          <button type="button" onClick={load} className={secondaryButtonClasses}>
            Reintentar
          </button>
        </div>
      )}

      {status === 'success' && (
        <div className="max-w-3xl overflow-x-auto rounded-xl border border-line bg-surface">
          <table className="w-full">
            <thead>
              <tr className="border-b border-line bg-surface-brand/40">
                {['Nombre', 'Abreviatura', 'Fraccionable', 'Productos', 'Estado'].map((label) => (
                  <th key={label} className="whitespace-nowrap px-4 py-2.5 text-left text-sm font-semibold uppercase tracking-wide opacity-60">
                    {label}
                  </th>
                ))}
                {canManage && <th className="px-4 py-2.5" />}
              </tr>
            </thead>
            <tbody>
              {units.map((unit) => (
                <tr key={unit.id} className="border-t border-line">
                  {editingId === unit.id ? (
                    <td colSpan={canManage ? 6 : 5} className="px-4 py-3">
                      <form onSubmit={handleSaveEdit} className="flex flex-wrap items-center gap-2">
                        <input
                          type="text"
                          aria-label="Nombre de la unidad"
                          value={editingDraft.name}
                          onChange={(event) => setEditingDraft((prev) => ({ ...prev, name: event.target.value }))}
                          disabled={savingEdit}
                          className={inputClasses}
                        />
                        <input
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
                        {editError !== null && (
                          <p role="alert" className="m-0 w-full text-base text-danger">
                            {editError}
                          </p>
                        )}
                      </form>
                    </td>
                  ) : (
                    <>
                      <td className="px-4 py-3 text-base font-medium">{unit.name}</td>
                      <td className="px-4 py-3 font-mono text-base opacity-70">{unit.abbreviation}</td>
                      <td className="px-4 py-3">
                        <span className={`text-sm font-semibold ${unit.allows_fraction ? 'text-success' : 'opacity-50'}`}>
                          {unit.allows_fraction ? 'Sí' : 'No'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-base opacity-70">{productCountByUnit.get(unit.id) ?? 0}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`text-sm font-semibold ${unit.status === 'active' ? 'text-success' : 'opacity-50'}`}
                        >
                          ● {unit.status === 'active' ? 'Activa' : 'Inactiva'}
                        </span>
                      </td>
                      {canManage && (
                        <td className="px-4 py-3 text-right">
                          <button type="button" onClick={() => startEdit(unit)} className={rowButtonClasses}>
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
    </section>
  )
}
