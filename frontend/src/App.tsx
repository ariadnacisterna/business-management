import { Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './features/access/AuthContext'
import { LoginPage } from './features/access/LoginPage'
import { ProtectedRoute } from './features/access/ProtectedRoute'
import { canManageAccounts, canManageCatalog, canViewDashboard } from './features/access/roles'
import { AccountsPage } from './features/accounts/AccountsPage'
import { AttributesPage } from './features/catalog/AttributesPage'
import { CategoriesPage } from './features/catalog/CategoriesPage'
import { ProductDetailPage } from './features/catalog/ProductDetailPage'
import { ProductFormPage } from './features/catalog/ProductFormPage'
import { ProductsPage } from './features/catalog/ProductsPage'
import { UnitsPage } from './features/catalog/UnitsPage'
import { DashboardPage } from './features/dashboard/DashboardPage'
import { PricingPage } from './features/pricing/PricingPage'
import { ShortagesPage } from './features/suppliers/ShortagesPage'
import { SuppliersPage } from './features/suppliers/SuppliersPage'
import { AppLayout } from './shared/layout/AppLayout'
import { ToastProvider } from './shared/Toast'

function HomeRoute() {
  const { account } = useAuth()

  if (!canViewDashboard(account)) {
    return <Navigate to="/products" replace />
  }

  return <DashboardPage />
}

function AccountsRoute() {
  const { account } = useAuth()

  if (!canManageAccounts(account)) {
    return <Navigate to="/products" replace />
  }

  return <AccountsPage />
}

function SuppliersRoute() {
  const { account } = useAuth()

  if (!canManageCatalog(account)) {
    return <Navigate to="/products" replace />
  }

  return <SuppliersPage />
}

export function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<ProtectedRoute />}>
            <Route element={<AppLayout />}>
              <Route path="/" element={<HomeRoute />} />
              <Route path="/categories" element={<CategoriesPage />} />
              <Route path="/units" element={<UnitsPage />} />
              <Route path="/attributes" element={<AttributesPage />} />
              <Route path="/products" element={<ProductsPage />}>
                <Route path="new" element={<ProductFormPage />} />
                <Route path=":productId" element={<ProductDetailPage />} />
              </Route>
              <Route path="/precios" element={<PricingPage />} />
              <Route path="/proveedores" element={<SuppliersRoute />} />
              <Route path="/faltantes" element={<ShortagesPage />} />
              <Route path="/cuentas" element={<AccountsRoute />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </ToastProvider>
  )
}

export default App
