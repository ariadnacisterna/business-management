import { useState } from 'react'
import type { FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { createUnit } from '../../api/catalog'
import { errorMessage } from '../../api/client'
import type { Unit } from '../../api/types'
import { Breadcrumb } from '../../shared/Breadcrumb'
import { CloseButton } from '../../shared/CloseButton'
import { Dialog } from '../../shared/Dialog'

const CREATE_ERROR_MESSAGE = 'No se pudo crear la unidad. Intentá de nuevo.'

const inputClasses =
  'h-14 rounded-lg border border-line px-4 text-xl focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/10'

interface Props {
  breadcrumb: string[]
  onCreated: (unit: Unit) => void
  onClose: () => void
}

export function NewUnitDialog({ breadcrumb, onCreated, onClose }: Props) {
  const [name, setName] = useState('')
  const [abbreviation, setAbbreviation] = useState('')
  const [allowsFraction, setAllowsFraction] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const incomplete = name.trim() === '' || abbreviation.trim() === ''

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    event.stopPropagation()
    if (incomplete || saving) return

    setSaving(true)
    setError(null)
    try {
      const created = await createUnit({
        name: name.trim(),
        abbreviation: abbreviation.trim(),
        allows_fraction: allowsFraction,
      })
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
        label="Nueva unidad"
        onClose={onClose}
        onSubmit={handleSubmit}
        className="relative flex max-h-[calc(100svh-2rem)] w-full max-w-md flex-col gap-4 overflow-y-auto rounded-2xl bg-surface p-6 shadow-2xl"
      >
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <Breadcrumb segments={[...breadcrumb, 'Nueva unidad']} />
            </div>
            <CloseButton onClose={onClose} />
          </div>
          <h2 className="m-0 text-2xl font-bold">Nueva unidad</h2>
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="new-unit-name" className="text-base font-semibold">
            Nombre <span className="text-danger">*</span>
          </label>
          <input
            id="new-unit-name"
            type="text"
            placeholder="Ej. Kilogramo"
            value={name}
            onChange={(event) => setName(event.target.value)}
            disabled={saving}
            autoFocus
            className={inputClasses}
          />
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="new-unit-abbreviation" className="text-base font-semibold">
            Abreviatura <span className="text-danger">*</span>
          </label>
          <input
            id="new-unit-abbreviation"
            type="text"
            placeholder="Ej. kg"
            value={abbreviation}
            onChange={(event) => setAbbreviation(event.target.value)}
            disabled={saving}
            className={inputClasses}
          />
        </div>

        <label className="flex min-h-12 items-center gap-3 text-lg">
          <input
            name="new-unit-allows-fraction"
            type="checkbox"
            checked={allowsFraction}
            onChange={(event) => setAllowsFraction(event.target.checked)}
            disabled={saving}
            className="h-6 w-6 accent-brand"
          />
          Admite fracciones
        </label>

        {error !== null && (
          <p role="alert" className="m-0 text-lg text-danger">
            {error}
          </p>
        )}

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={saving || incomplete}
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
