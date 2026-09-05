import type { Account } from '../../api/types'

const CATALOG_MANAGER_ROLES = new Set(['Administrador', 'Gerente'])

export function canManageCatalog(account: Account | null): boolean {
  return account !== null && account.role !== null && CATALOG_MANAGER_ROLES.has(account.role)
}
