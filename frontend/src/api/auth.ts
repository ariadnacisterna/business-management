import { ApiError, apiFetch } from './client'
import type { Account } from './types'

export class InvalidCredentialsError extends Error {}

interface LoginPayload {
  user_name: string
  password: string
}

export async function login(userName: string, password: string): Promise<Account> {
  try {
    return await apiFetch<Account>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ user_name: userName, password } satisfies LoginPayload),
    })
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      throw new InvalidCredentialsError()
    }
    throw error
  }
}

export function fetchCurrentAccount(): Promise<Account> {
  return apiFetch<Account>('/auth/me')
}

export function logout(): Promise<void> {
  return apiFetch<void>('/auth/logout', { method: 'POST' })
}

interface ChangeActiveBusinessPayload {
  business_id: number
}

export function changeActiveBusiness(businessId: number): Promise<Account> {
  return apiFetch<Account>('/auth/active-business', {
    method: 'POST',
    body: JSON.stringify({ business_id: businessId } satisfies ChangeActiveBusinessPayload),
  })
}
