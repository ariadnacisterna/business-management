import { Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './features/access/AuthContext'
import { LoginPage } from './features/access/LoginPage'
import { ProtectedRoute } from './features/access/ProtectedRoute'
import { HomePage } from './shared/HomePage'
import { AppLayout } from './shared/layout/AppLayout'

export function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<ProtectedRoute />}>
          <Route element={<AppLayout />}>
            <Route path="/" element={<HomePage />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  )
}

export default App
