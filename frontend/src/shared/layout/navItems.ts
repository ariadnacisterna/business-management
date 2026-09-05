export type NavIcon = 'panel' | 'products' | 'prices' | 'inventory' | 'sales' | 'suppliers'

export interface NavItem {
  to: string
  label: string
  icon: NavIcon
  end?: boolean
  disabled?: boolean
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Panel', icon: 'panel', end: true },
  { to: '/products', label: 'Productos', icon: 'products' },
  { to: '/precios', label: 'Precios', icon: 'prices', disabled: true },
  { to: '/inventario', label: 'Inventario', icon: 'inventory', disabled: true },
  { to: '/ventas', label: 'Ventas', icon: 'sales', disabled: true },
  { to: '/proveedores', label: 'Proveedores', icon: 'suppliers', disabled: true },
]
