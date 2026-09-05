import { useState, type ChangeEvent } from 'react'
import { useAuth } from './AuthContext'

export function BusinessSwitcher() {
  const { account, switchBusiness } = useAuth()
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (account === null || account.businesses.length < 2) {
    return null
  }

  async function handleChange(event: ChangeEvent<HTMLSelectElement>) {
    const businessId = Number(event.target.value)
    setError(null)
    setSubmitting(true)
    try {
      await switchBusiness(businessId)
    } catch {
      setError('No se pudo cambiar de negocio. Intentá de nuevo.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex items-center gap-2">
      <label htmlFor="active-business" className="text-sm font-medium opacity-70">
        Negocio
      </label>
      <select
        id="active-business"
        value={account.active_business_id}
        onChange={handleChange}
        disabled={submitting}
        className="h-11 rounded-lg border border-line bg-transparent px-2.5 text-sm"
      >
        {account.businesses.map((business) => (
          <option key={business.id} value={business.id}>
            {business.name}
          </option>
        ))}
      </select>
      {error !== null && (
        <p role="alert" className="m-0 text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  )
}
