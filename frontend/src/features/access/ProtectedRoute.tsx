import { useState } from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import { lazyWithReload } from '../../shared/lazyWithReload'
import { Loadable } from '../../shared/Loadable'
import { useAuth } from './useAuth'
import { isDueno } from './roles'

const BusinessSelectorPage = lazyWithReload(() =>
  import('./BusinessSelectorPage').then((m) => ({ default: m.BusinessSelectorPage })),
)

export function ProtectedRoute() {
  const { account, status, justLoggedIn } = useAuth()
  const [businessConfirmed, setBusinessConfirmed] = useState(false)

  if (status === 'loading') {
    return <p role="status">Cargando…</p>
  }

  if (account === null) {
    return <Navigate to="/login" replace />
  }

  if (
    justLoggedIn &&
    !businessConfirmed &&
    isDueno(account) &&
    account.businesses.length > 1
  ) {
    return (
      <Loadable>
        <BusinessSelectorPage onSelected={() => setBusinessConfirmed(true)} />
      </Loadable>
    )
  }

  return <Outlet />
}
