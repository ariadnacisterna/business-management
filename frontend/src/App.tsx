import { Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './features/access/AuthContext'
import { useAuth } from './features/access/useAuth'
import { ProtectedRoute } from './features/access/ProtectedRoute'
import { canManageAccounts, canManageSuppliers, canViewDashboard } from './features/access/roles'
import { AppLayout } from './shared/layout/AppLayout'
import { lazyWithReload } from './shared/lazyWithReload'
import { Loadable } from './shared/Loadable'
import { ToastProvider } from './shared/Toast'

const LoginPage = lazyWithReload(() => import('./features/access/LoginPage').then((m) => ({ default: m.LoginPage })))
const AccountsPage = lazyWithReload(() => import('./features/accounts/AccountsPage').then((m) => ({ default: m.AccountsPage })))
const AttributesPage = lazyWithReload(() => import('./features/catalog/AttributesPage').then((m) => ({ default: m.AttributesPage })))
const CategoriesPage = lazyWithReload(() => import('./features/catalog/CategoriesPage').then((m) => ({ default: m.CategoriesPage })))
const ProductDetailPage = lazyWithReload(() => import('./features/catalog/ProductDetailPage').then((m) => ({ default: m.ProductDetailPage })))
const ProductFormPage = lazyWithReload(() => import('./features/catalog/ProductFormPage').then((m) => ({ default: m.ProductFormPage })))
const ProductsPage = lazyWithReload(() => import('./features/catalog/ProductsPage').then((m) => ({ default: m.ProductsPage })))
const UnitsPage = lazyWithReload(() => import('./features/catalog/UnitsPage').then((m) => ({ default: m.UnitsPage })))
const CustomersPage = lazyWithReload(() => import('./features/customers/CustomersPage').then((m) => ({ default: m.CustomersPage })))
const DashboardPage = lazyWithReload(() => import('./features/dashboard/DashboardPage').then((m) => ({ default: m.DashboardPage })))
const InventoryPage = lazyWithReload(() => import('./features/inventory/InventoryPage').then((m) => ({ default: m.InventoryPage })))
const PricingPage = lazyWithReload(() => import('./features/pricing/PricingPage').then((m) => ({ default: m.PricingPage })))
const SettingsPage = lazyWithReload(() => import('./features/settings/SettingsPage').then((m) => ({ default: m.SettingsPage })))
const SuppliersPage = lazyWithReload(() => import('./features/suppliers/SuppliersPage').then((m) => ({ default: m.SuppliersPage })))

function HomeRoute() {
  const { account } = useAuth()

  if (!canViewDashboard(account)) {
    return <Navigate to="/products" replace />
  }

  return (
    <Loadable>
      <DashboardPage />
    </Loadable>
  )
}

function AccountsRoute() {
  const { account } = useAuth()

  if (!canManageAccounts(account)) {
    return <Navigate to="/products" replace />
  }

  return (
    <Loadable>
      <AccountsPage />
    </Loadable>
  )
}

function SuppliersRoute() {
  const { account } = useAuth()

  if (!canManageSuppliers(account)) {
    return <Navigate to="/products" replace />
  }

  return (
    <Loadable>
      <SuppliersPage />
    </Loadable>
  )
}

export function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Loadable><LoginPage /></Loadable>} />
          <Route element={<ProtectedRoute />}>
            <Route element={<AppLayout />}>
              <Route path="/" element={<HomeRoute />} />
              <Route path="/categories" element={<Loadable><CategoriesPage /></Loadable>} />
              <Route path="/units" element={<Loadable><UnitsPage /></Loadable>} />
              <Route path="/attributes" element={<Loadable><AttributesPage /></Loadable>} />
              <Route path="/products" element={<Loadable><ProductsPage /></Loadable>}>
                <Route path="new" element={<Loadable><ProductFormPage /></Loadable>} />
                <Route path=":productId" element={<Loadable><ProductDetailPage /></Loadable>} />
              </Route>
              <Route path="/precios" element={<Loadable><PricingPage /></Loadable>} />
              <Route path="/inventario" element={<Loadable><InventoryPage /></Loadable>} />
              <Route path="/proveedores" element={<SuppliersRoute />} />
              <Route path="/clientes" element={<Loadable><CustomersPage /></Loadable>} />
              <Route path="/cuentas" element={<AccountsRoute />} />
              <Route path="/configuraciones" element={<Loadable><SettingsPage /></Loadable>} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </ToastProvider>
  )
}

export default App
