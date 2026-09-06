import { useState } from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import { BusinessSelectorPage } from './BusinessSelectorPage'
import { useAuth } from './AuthContext'
import { isAdministrador } from './roles'

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
    isAdministrador(account) &&
    account.businesses.length > 1
  ) {
    return <BusinessSelectorPage onSelected={() => setBusinessConfirmed(true)} />
  }

  return <Outlet />
}
