import { useState } from 'react'
import type { FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { createCategory } from '../../api/catalog'
import { errorMessage } from '../../api/client'
import type { Category } from '../../api/types'
import { Breadcrumb } from '../../shared/Breadcrumb'
import { CloseButton } from '../../shared/CloseButton'
import { Dialog } from '../../shared/Dialog'

const CREATE_ERROR_MESSAGE = 'No se pudo crear la categoría. Intentá de nuevo.'

interface Props {
  breadcrumb: string[]
  onCreated: (category: Category) => void
  onClose: () => void
}

export function NewCategoryDialog({ breadcrumb, onCreated, onClose }: Props) {
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    event.stopPropagation()
    const trimmed = name.trim()
    if (trimmed === '' || saving) return

    setSaving(true)
    setError(null)
    try {
      const created = await createCategory(trimmed)
      onCreated(created)
    } catch (caught) {
      setError(errorMessage(caught, CREATE_ERROR_MESSAGE))
      setSaving(false)
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink/20" onClick={onClose} aria-hidden="true" />
      <Dialog
        label="Nueva categoría"
        onClose={onClose}
        onSubmit={handleSubmit}
        className="relative flex max-h-[calc(100svh-2rem)] w-full max-w-md flex-col gap-4 overflow-y-auto rounded-2xl bg-surface p-6 shadow-2xl"
      >
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <Breadcrumb segments={[...breadcrumb, 'Nueva categoría']} />
            </div>
            <CloseButton onClose={onClose} />
          </div>
          <h2 className="m-0 text-2xl font-bold">Nueva categoría</h2>
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="new-category-name" className="text-lg font-semibold">
            Nombre <span className="text-danger">*</span>
          </label>
          <input
            id="new-category-name"
            type="text"
            placeholder="Ej. Ropa interior"
            value={name}
            onChange={(event) => setName(event.target.value)}
            disabled={saving}
            autoFocus
            className="h-14 rounded-lg border border-line px-4 text-xl focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/10"
          />
        </div>

        {error !== null && (
          <p role="alert" className="m-0 text-lg text-danger">
            {error}
          </p>
        )}

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={saving || name.trim() === ''}
            className="min-h-14 flex-1 rounded-lg bg-brand px-4 text-lg font-bold text-brand-contrast transition-colors hover:bg-brand/90 disabled:opacity-40"
          >
            Crear
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="min-h-14 flex-1 rounded-lg border border-line px-4 text-lg transition-colors hover:bg-surface-brand"
          >
            Cancelar
          </button>
        </div>
      </Dialog>
    </div>,
    document.body,
  )
}
