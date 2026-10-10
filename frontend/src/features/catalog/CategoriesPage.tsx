import { useMemo, useState } from 'react'
import { createCategory, fetchCategories, fetchProducts, updateCategory } from '../../api/catalog'
import { errorMessage } from '../../api/client'
import type { Category, Product } from '../../api/types'
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

const NO_CATEGORIES: Category[] = []
const NO_PRODUCTS: Product[] = []

const LOAD_ERROR_MESSAGE = 'No se pudieron cargar las categorías.'
const SAVE_ERROR_MESSAGE = 'No se pudo guardar la categoría. Intentá de nuevo.'

const inputClasses =
  'h-11 rounded-lg border border-line px-3 text-base focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/10'
const primaryButtonClasses =
  'min-h-11 rounded-lg bg-brand px-4 text-base font-bold text-brand-contrast transition-colors hover:bg-brand/90 disabled:opacity-40'
const secondaryButtonClasses =
  'min-h-11 rounded-lg border border-line px-3 text-base transition-colors hover:bg-surface-brand'
const rowButtonClasses = 'min-h-11 rounded-lg border border-line px-2.5 text-sm transition-colors hover:bg-surface-brand'

export function CategoriesPage() {
  const { account } = useAuth()
  const canManage = canManageCatalog(account)
  const { showSuccess, showError } = useToast()

  const { status, data, reload, setData } = useLoad(
    () => Promise.all([fetchCategories(), fetchProducts()]).then(([categories, products]) => ({ categories, products })),
    [account?.active_business_id],
  )
  const categories = data?.categories ?? NO_CATEGORIES
  const products = data?.products ?? NO_PRODUCTS

  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [savingNew, setSavingNew] = useState(false)

  const [editingId, setEditingId] = useState<number | null>(null)
  const [editingName, setEditingName] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)

  const [confirmingCreate, setConfirmingCreate] = useState(false)
  const [confirmingEdit, setConfirmingEdit] = useState<Category | null>(null)

  const productCountByCategory = useMemo(() => {
    const counts = new Map<number, number>()
    for (const product of products) {
      counts.set(product.category_id, (counts.get(product.category_id) ?? 0) + 1)
    }
    return counts
  }, [products])

  function handleCreate(event: React.FormEvent) {
    event.preventDefault()
    if (newName.trim() === '') return
    setConfirmingCreate(true)
  }

  async function createCategoryNow() {
    setConfirmingCreate(false)
    const trimmed = newName.trim()
    if (trimmed === '') return

    setSavingNew(true)
    try {
      const category = await createCategory(trimmed)
      setData((prev) => prev && { ...prev, categories: [...prev.categories, category] })
      setNewName('')
      setCreating(false)
      showSuccess('Categoría creada.')
    } catch (error) {
      showError(errorMessage(error, SAVE_ERROR_MESSAGE))
    } finally {
      setSavingNew(false)
    }
  }

  function startEdit(category: Category) {
    setEditingId(category.id)
    setEditingName(category.name)
  }

  function cancelEdit() {
    setEditingId(null)
    setEditingName('')
  }

  function handleSaveEdit(event: React.FormEvent) {
    event.preventDefault()
    if (editingId === null) return
    if (editingName.trim() === '') return
    const category = categories.find((item) => item.id === editingId)
    if (category === undefined) return
    setConfirmingEdit(category)
  }

  async function saveEditNow() {
    if (editingId === null) return
    const trimmed = editingName.trim()
    if (trimmed === '') return

    setConfirmingEdit(null)
    setSavingEdit(true)
    try {
      const updated = await updateCategory(editingId, trimmed)
      setData(
        (prev) =>
          prev && {
            ...prev,
            categories: prev.categories.map((category) => (category.id === updated.id ? updated : category)),
          },
      )
      cancelEdit()
      showSuccess('Categoría actualizada.')
    } catch (error) {
      showError(errorMessage(error, SAVE_ERROR_MESSAGE))
    } finally {
      setSavingEdit(false)
    }
  }

  return (
    <section className="-m-4 flex min-h-[calc(100svh-4rem)] flex-col gap-4 bg-line/10 p-4 md:-m-6 md:p-6">
      <div className="flex max-w-2xl flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold">Categorías</h1>
        {canManage && !creating && (
          <button type="button" onClick={() => setCreating(true)} className={primaryButtonClasses}>
            + Nueva categoría
          </button>
        )}
      </div>

      {creating && (
        <form
          onSubmit={handleCreate}
          className="flex max-w-2xl flex-wrap items-center gap-2 rounded-xl border border-line bg-surface p-4"
        >
          <label htmlFor="new-category-name" className="text-base font-semibold">
            Nueva categoría
          </label>
          <input
            id="new-category-name"
            type="text"
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            disabled={savingNew}
            className={inputClasses}
          />
          <button type="submit" disabled={savingNew || newName.trim() === ''} className={primaryButtonClasses}>
            Crear
          </button>
          <button
            type="button"
            onClick={() => {
              setCreating(false)
              setNewName('')
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

      {status === 'success' && categories.length === 0 && (
        <div className="flex max-w-2xl flex-col items-center gap-2 rounded-xl border border-line bg-surface px-6 py-12 text-center">
          <p className="text-xl font-semibold opacity-70">No hay categorías cargadas</p>
          <p className="text-lg opacity-50">
            {canManage ? 'Usá "+ Nueva categoría" para crear la primera.' : 'Cuando se carguen categorías, van a aparecer acá.'}
          </p>
        </div>
      )}

      {status === 'success' && categories.length > 0 && (
        <div className="max-w-2xl overflow-hidden rounded-xl border border-line bg-surface">
          <table className={STACKED_TABLE_CLASSES}>
            <thead className={STACKED_HEAD_CLASSES}>
              <tr className="border-b border-line bg-surface-brand/40">
                <th className="px-4 py-2.5 text-left text-sm font-semibold uppercase tracking-wide opacity-60">
                  Nombre
                </th>
                <th className="px-4 py-2.5 text-left text-sm font-semibold uppercase tracking-wide opacity-60">
                  Productos
                </th>
                <th className="px-4 py-2.5 text-left text-sm font-semibold uppercase tracking-wide opacity-60">
                  Estado
                </th>
                {canManage && <th className="px-4 py-2.5" />}
              </tr>
            </thead>
            <tbody className={STACKED_BODY_CLASSES}>
              {categories.map((category) => (
                <tr key={category.id} className={STACKED_ROW_CLASSES}>
                  {editingId === category.id ? (
                    <td colSpan={canManage ? 4 : 3} className={STACKED_FULL_CELL_CLASSES}>
                      <form onSubmit={handleSaveEdit} className="flex flex-wrap items-center gap-2">
                        <input
                          name="category-name-edit"
                          type="text"
                          aria-label="Nombre de la categoría"
                          value={editingName}
                          onChange={(event) => setEditingName(event.target.value)}
                          disabled={savingEdit}
                          className={inputClasses}
                        />
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
                        {category.name}
                      </td>
                      <td className={`${STACKED_CELL_CLASSES} text-base`}>
                        <span className={STACKED_LABEL_CLASSES}>Productos: </span>
                        <span className="opacity-70">{productCountByCategory.get(category.id) ?? 0}</span>
                      </td>
                      <td className={STACKED_CELL_CLASSES}>
                        <span
                          className={`text-sm font-semibold ${category.status === 'active' ? 'text-success' : 'opacity-50'}`}
                        >
                          ● {category.status === 'active' ? 'Activa' : 'Inactiva'}
                        </span>
                      </td>
                      {canManage && (
                        <td className={STACKED_ACTION_CELL_CLASSES}>
                          <button
                            type="button"
                            onClick={() => startEdit(category)}
                            aria-label={`Editar ${category.name}`}
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
          title="Crear categoría"
          description={`Se va a crear la categoría "${newName.trim()}".`}
          confirmLabel="Crear"
          breadcrumb={['Categorías', 'Crear categoría']}
          onConfirm={createCategoryNow}
          onCancel={() => setConfirmingCreate(false)}
        />
      )}

      {confirmingEdit !== null && (
        <ConfirmDialog
          title="Guardar categoría"
          description={`"${confirmingEdit.name}" va a pasar a llamarse "${editingName.trim()}".`}
          confirmLabel="Guardar"
          breadcrumb={['Categorías', confirmingEdit.name, 'Guardar categoría']}
          onConfirm={saveEditNow}
          onCancel={() => setConfirmingEdit(null)}
        />
      )}
    </section>
  )
}
