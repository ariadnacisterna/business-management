import type { Role } from '../../features/access/roles'

export type NavIcon =
  | 'panel'
  | 'products'
  | 'prices'
  | 'inventory'
  | 'sales'
  | 'receipt'
  | 'cash'
  | 'suppliers'
  | 'accounts'
  | 'customers'
  | 'settings'

export interface NavChild {
  to: string
  label: string
}

export interface NavItem {
  to: string
  label: string
  icon: NavIcon
  end?: boolean
  disabled?: boolean
  minRole?: Role
  children?: NavChild[]
}

export interface NavGroup {
  label: string | null
  items: NavItem[]
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Operación',
    items: [
      { to: '/ventas/nueva', label: 'Venta', icon: 'sales' },
      { to: '/ventas/registradas', label: 'Historial de ventas', icon: 'receipt' },
      { to: '/caja', label: 'Caja', icon: 'cash' },
    ],
  },
  {
    label: 'Catálogo',
    items: [
      { to: '/products', label: 'Productos', icon: 'products' },
      { to: '/precios', label: 'Precios', icon: 'prices' },
      {
        to: '/inventario/stock',
        label: 'Inventario',
        icon: 'inventory',
        children: [
          { to: '/inventario/stock', label: 'Stock' },
          { to: '/inventario/faltantes', label: 'Faltantes' },
        ],
      },
    ],
  },
  {
    label: 'Personas',
    items: [
      { to: '/proveedores', label: 'Proveedores', icon: 'suppliers', minRole: 'Administrador' },
      { to: '/clientes', label: 'Clientes', icon: 'customers' },
      { to: '/cuentas', label: 'Usuarios', icon: 'accounts', minRole: 'Administrador' },
    ],
  },
  {
    label: 'Análisis',
    items: [{ to: '/', label: 'Panel', icon: 'panel', end: true, minRole: 'Administrador' }],
  },
]

export const SETTINGS_ITEM: NavItem = {
  to: '/configuraciones',
  label: 'Configuración',
  icon: 'settings',
}

export function sectionOf(label: string): string | null {
  const group = NAV_GROUPS.find((candidate) => candidate.items.some((item) => item.label === label))
  return group?.label ?? null
}
