import { useState } from 'react'
import { Brand } from '../../shared/Brand'
import { useAuth } from './AuthContext'

interface BusinessSelectorPageProps {
  onSelected: () => void
}

export function BusinessSelectorPage({ onSelected }: BusinessSelectorPageProps) {
  const { account, switchBusiness } = useAuth()
  const [error, setError] = useState<string | null>(null)
  const [submittingId, setSubmittingId] = useState<number | null>(null)

  if (account === null) {
    return null
  }

  async function handleSelect(businessId: number) {
    setError(null)
    setSubmittingId(businessId)
    try {
      await switchBusiness(businessId)
      onSelected()
    } catch {
      setError('No se pudo seleccionar el negocio. Intentá de nuevo.')
      setSubmittingId(null)
    }
  }

  return (
    <main className="flex min-h-svh flex-col items-center justify-center bg-surface-brand px-4">
      <div className="mb-8 flex flex-col items-center">
        <Brand large />
      </div>

      <div className="w-full max-w-md space-y-5 rounded-2xl border border-line bg-surface p-8 shadow-sm">
        <h1 className="text-2xl font-bold">¿Con qué negocio querés trabajar?</h1>

        <div className="space-y-3">
          {account.businesses.map((business) => (
            <button
              key={business.id}
              type="button"
              onClick={() => handleSelect(business.id)}
              disabled={submittingId !== null}
              className="flex w-full flex-col items-start rounded-lg border border-line px-5 py-4 text-left transition-colors hover:border-brand hover:bg-surface-brand disabled:opacity-60"
            >
              <span className="text-xl font-bold">{business.name}</span>
              {business.industry !== business.name && (
                <span className="text-base opacity-70">{business.industry}</span>
              )}
            </button>
          ))}
        </div>

        {error !== null && (
          <p
            role="alert"
            className="m-0 flex items-center gap-2 rounded-lg border border-danger/20 bg-danger/10 px-3.5 py-2.5 text-sm font-medium text-danger"
          >
            <span aria-hidden="true">⚠</span>
            {error}
          </p>
        )}
      </div>
    </main>
  )
}
