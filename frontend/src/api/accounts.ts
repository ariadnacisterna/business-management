import { apiFetch } from './client'
import type { ManagedAccount } from './types'

export function fetchAccounts(): Promise<ManagedAccount[]> {
  return apiFetch<ManagedAccount[]>('/accounts')
}

export function createAccount(input: {
  name: string
  user_name: string
  initial_password: string
  role: string
}): Promise<ManagedAccount> {
  return apiFetch<ManagedAccount>('/accounts', { method: 'POST', body: JSON.stringify(input) })
}

export function updateAccount(
  id: number,
  input: { name?: string; user_name?: string; role?: string },
): Promise<ManagedAccount> {
  return apiFetch<ManagedAccount>(`/accounts/${id}`, { method: 'PATCH', body: JSON.stringify(input) })
}

export function deactivateAccount(id: number): Promise<ManagedAccount> {
  return apiFetch<ManagedAccount>(`/accounts/${id}/deactivate`, { method: 'POST' })
}

export function activateAccount(id: number): Promise<ManagedAccount> {
  return apiFetch<ManagedAccount>(`/accounts/${id}/activate`, { method: 'POST' })
}

export function resetAccountPassword(id: number, newPassword: string): Promise<ManagedAccount> {
  return apiFetch<ManagedAccount>(`/accounts/${id}/reset-password`, {
    method: 'POST',
    body: JSON.stringify({ new_password: newPassword }),
  })
}
