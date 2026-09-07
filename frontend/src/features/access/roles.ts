import type { Account } from '../../api/types'

export type Role = 'Empleado' | 'Gerente' | 'Administrador' | 'Dueño'

export const ROLES: Role[] = ['Empleado', 'Gerente', 'Administrador', 'Dueño']

const ROLE_RANK: Record<Role, number> = {
  Empleado: 0,
  Gerente: 1,
  Administrador: 2,
  Dueño: 3,
}

export function hasMinimumRole(account: Account | null, minRole: Role): boolean {
  if (account === null || account.role === null) return false
  const rank = ROLE_RANK[account.role as Role] as number | undefined
  return rank !== undefined && rank >= ROLE_RANK[minRole]
}

export function canManageCatalog(account: Account | null): boolean {
  return hasMinimumRole(account, 'Gerente')
}

export function isDueno(account: Account | null): boolean {
  return account !== null && account.role === 'Dueño'
}

export function canViewDashboard(account: Account | null): boolean {
  return hasMinimumRole(account, 'Administrador')
}

export function canManageAccounts(account: Account | null): boolean {
  return hasMinimumRole(account, 'Administrador')
}
