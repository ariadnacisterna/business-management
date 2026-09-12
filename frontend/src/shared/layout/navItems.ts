import type { Role } from '../../features/access/roles'

export type NavIcon =
  | 'panel'
  | 'products'
  | 'prices'
  | 'inventory'
  | 'sales'
  | 'suppliers'
  | 'accounts'
  | 'customers'

export interface NavItem {
  to: string
  label: string
  icon: NavIcon
  end?: boolean
  disabled?: boolean
  minRole?: Role
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Panel', icon: 'panel', end: true, minRole: 'Administrador' },
  { to: '/products', label: 'Productos', icon: 'products' },
  { to: '/precios', label: 'Precios', icon: 'prices' },
  { to: '/inventario', label: 'Inventario', icon: 'inventory' },
  { to: '/ventas', label: 'Ventas', icon: 'sales', disabled: true },
  { to: '/proveedores', label: 'Proveedores', icon: 'suppliers', minRole: 'Gerente' },
  { to: '/clientes', label: 'Clientes', icon: 'customers' },
  { to: '/cuentas', label: 'Cuentas', icon: 'accounts', minRole: 'Administrador' },
]
