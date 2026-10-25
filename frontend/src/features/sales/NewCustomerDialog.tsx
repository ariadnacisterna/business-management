import { useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { createCustomer } from '../../api/catalog'
import { errorMessage } from '../../api/client'
import type { Customer } from '../../api/types'
import { Breadcrumb } from '../../shared/Breadcrumb'
import { CloseButton } from '../../shared/CloseButton'
import { Dialog } from '../../shared/Dialog'
import { fieldClasses, primaryButtonClasses, secondaryButtonClasses } from './SaleDialogs'

const CREATE_ERROR_MESSAGE = 'No se pudo crear el cliente. Intentá de nuevo.'

interface Props {
  initialName?: string
  onCreated: (customer: Customer) => void
  onClose: () => void
}

export function NewCustomerDialog({ initialName = '', onCreated, onClose }: Props) {
  const [name, setName] = useState(initialName)
  const [phone, setPhone] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const incomplete = name.trim() === ''

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    event.stopPropagation()
    if (incomplete || saving) return

    setSaving(true)
    setError(null)
    try {
      const trimmedPhone = phone.trim()
      const created = await createCustomer({
        name: name.trim(),
        ...(trimmedPhone !== '' && { phone: trimmedPhone }),
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
        label="Nuevo cliente"
        onClose={onClose}
        onSubmit={handleSubmit}
        noValidate
        className="scrollbar-clean relative flex max-h-[calc(100svh-2rem)] w-full max-w-md flex-col gap-4 overflow-y-auto rounded-2xl bg-surface p-6 shadow-2xl"
      >
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <Breadcrumb segments={['Venta', 'Confirmar venta', 'Nuevo cliente']} />
            </div>
            <CloseButton onClose={onClose} />
          </div>
          <h2 className="m-0 text-2xl font-bold">Nuevo cliente</h2>
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="new-customer-name" className="text-lg font-semibold">
            Nombre <span className="text-danger">*</span>
          </label>
          <input
            id="new-customer-name"
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            disabled={saving}
            autoFocus
            className={fieldClasses}
          />
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="new-customer-phone" className="text-lg font-semibold">
            Teléfono
          </label>
          <input
            id="new-customer-phone"
            type="tel"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            disabled={saving}
            className={fieldClasses}
          />
        </div>

        {error !== null && (
          <p role="alert" className="m-0 text-lg text-danger">
            {error}
          </p>
        )}

        <div className="flex gap-2">
          <button type="submit" disabled={saving || incomplete} className={primaryButtonClasses}>
            Crear cliente
          </button>
          <button type="button" onClick={onClose} disabled={saving} className={secondaryButtonClasses}>
            Cancelar
          </button>
        </div>
      </Dialog>
    </div>,
    document.body,
  )
}
