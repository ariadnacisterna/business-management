import { Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './features/access/AuthContext'
import { LoginPage } from './features/access/LoginPage'
import { ProtectedRoute } from './features/access/ProtectedRoute'
import { AttributesPage } from './features/catalog/AttributesPage'
import { CategoriesPage } from './features/catalog/CategoriesPage'
import { ProductDetailPage } from './features/catalog/ProductDetailPage'
import { ProductFormPage } from './features/catalog/ProductFormPage'
import { ProductsPage } from './features/catalog/ProductsPage'
import { UnitsPage } from './features/catalog/UnitsPage'
import { DashboardPage } from './features/dashboard/DashboardPage'
import { AppLayout } from './shared/layout/AppLayout'

export function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<ProtectedRoute />}>
          <Route element={<AppLayout />}>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/categories" element={<CategoriesPage />} />
            <Route path="/units" element={<UnitsPage />} />
            <Route path="/attributes" element={<AttributesPage />} />
            <Route path="/products" element={<ProductsPage />}>
              <Route path="new" element={<ProductFormPage />} />
              <Route path=":productId" element={<ProductDetailPage />} />
            </Route>
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  )
}

export default App
