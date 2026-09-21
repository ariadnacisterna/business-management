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
  | 'settings'

export interface NavItem {
  to: string
  label: string
  icon: NavIcon
  end?: boolean
  disabled?: boolean
  minRole?: Role
}

export interface NavGroup {
  label: string | null
  items: NavItem[]
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: null,
    items: [{ to: '/', label: 'Panel', icon: 'panel', end: true, minRole: 'Administrador' }],
  },
  {
    label: 'Catálogo',
    items: [
      { to: '/products', label: 'Productos', icon: 'products' },
      { to: '/precios', label: 'Precios', icon: 'prices' },
      { to: '/inventario', label: 'Inventario', icon: 'inventory' },
    ],
  },
  {
    label: 'Comercial',
    items: [
      { to: '/ventas', label: 'Ventas', icon: 'sales', disabled: true },
      { to: '/clientes', label: 'Clientes', icon: 'customers' },
      { to: '/proveedores', label: 'Proveedores', icon: 'suppliers', minRole: 'Administrador' },
    ],
  },
  {
    label: 'Administración',
    items: [{ to: '/cuentas', label: 'Cuentas', icon: 'accounts', minRole: 'Administrador' }],
  },
]

export const SETTINGS_ITEM: NavItem = {
  to: '/configuraciones',
  label: 'Configuración',
  icon: 'settings',
}
