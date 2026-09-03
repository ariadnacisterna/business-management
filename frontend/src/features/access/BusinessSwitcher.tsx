import { useState, type ChangeEvent } from 'react'
import { useAuth } from './AuthContext'
import styles from './BusinessSwitcher.module.css'

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
    <div className={styles.switcher}>
      <label htmlFor="active-business">Negocio</label>
      <select
        id="active-business"
        value={account.active_business_id}
        onChange={handleChange}
        disabled={submitting}
      >
        {account.businesses.map((business) => (
          <option key={business.id} value={business.id}>
            {business.name}
          </option>
        ))}
      </select>
      {error !== null && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
    </div>
  )
}
