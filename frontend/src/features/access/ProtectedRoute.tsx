import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from './AuthContext'

export function ProtectedRoute() {
  const { account, status } = useAuth()

  if (status === 'loading') {
    return <p role="status">Cargando…</p>
  }

  if (account === null) {
    return <Navigate to="/login" replace />
  }

  return <Outlet />
}
