import { useEffect, useMemo, useState } from 'react'
import { createCategory, fetchCategories, fetchProducts, updateCategory } from '../../api/catalog'
import { ApiError } from '../../api/client'
import type { Category, Product } from '../../api/types'
import { useAuth } from '../access/AuthContext'
import { canManageCatalog } from '../access/roles'

type Status = 'loading' | 'success' | 'error'

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

  const [categories, setCategories] = useState<Category[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [status, setStatus] = useState<Status>('loading')
  const [loadError, setLoadError] = useState<string | null>(null)

  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [savingNew, setSavingNew] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  const [editingId, setEditingId] = useState<number | null>(null)
  const [editingName, setEditingName] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)

  function load() {
    setStatus('loading')
    setLoadError(null)
    Promise.all([fetchCategories(), fetchProducts()])
      .then(([categoryResult, productResult]) => {
        setCategories(categoryResult)
        setProducts(productResult)
        setStatus('success')
      })
      .catch(() => {
        setLoadError(LOAD_ERROR_MESSAGE)
        setStatus('error')
      })
  }

  useEffect(load, [])

  const productCountByCategory = useMemo(() => {
    const counts = new Map<number, number>()
    for (const product of products) {
      counts.set(product.category_id, (counts.get(product.category_id) ?? 0) + 1)
    }
    return counts
  }, [products])

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault()
    setCreateError(null)
    const trimmed = newName.trim()
    if (trimmed === '') return

    setSavingNew(true)
    try {
      const category = await createCategory(trimmed)
      setCategories((prev) => [...prev, category])
      setNewName('')
      setCreating(false)
    } catch (error) {
      setCreateError(error instanceof ApiError ? error.message : SAVE_ERROR_MESSAGE)
    } finally {
      setSavingNew(false)
    }
  }

  function startEdit(category: Category) {
    setEditingId(category.id)
    setEditingName(category.name)
    setEditError(null)
  }

  function cancelEdit() {
    setEditingId(null)
    setEditingName('')
    setEditError(null)
  }

  async function handleSaveEdit(event: React.FormEvent) {
    event.preventDefault()
    if (editingId === null) return
    const trimmed = editingName.trim()
    if (trimmed === '') return

    setSavingEdit(true)
    setEditError(null)
    try {
      const updated = await updateCategory(editingId, trimmed)
      setCategories((prev) => prev.map((category) => (category.id === updated.id ? updated : category)))
      cancelEdit()
    } catch (error) {
      setEditError(error instanceof ApiError ? error.message : SAVE_ERROR_MESSAGE)
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
        <div className="max-w-2xl overflow-hidden rounded-xl border border-line bg-surface">
          <table className="w-full">
            <thead>
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
            <tbody>
              {categories.map((category) => (
                <tr key={category.id} className="border-t border-line">
                  {editingId === category.id ? (
                    <td colSpan={canManage ? 4 : 3} className="px-4 py-3">
                      <form onSubmit={handleSaveEdit} className="flex flex-wrap items-center gap-2">
                        <input
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
                        {editError !== null && (
                          <p role="alert" className="m-0 w-full text-base text-danger">
                            {editError}
                          </p>
                        )}
                      </form>
                    </td>
                  ) : (
                    <>
                      <td className="px-4 py-3 text-base font-medium">{category.name}</td>
                      <td className="px-4 py-3 text-base opacity-70">{productCountByCategory.get(category.id) ?? 0}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`text-sm font-semibold ${category.status === 'active' ? 'text-success' : 'opacity-50'}`}
                        >
                          ● {category.status === 'active' ? 'Activa' : 'Inactiva'}
                        </span>
                      </td>
                      {canManage && (
                        <td className="px-4 py-3 text-right">
                          <button type="button" onClick={() => startEdit(category)} className={rowButtonClasses}>
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
