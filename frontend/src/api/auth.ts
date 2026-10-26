import { ApiError, apiFetch, forgetPendingSubmissions } from './client'
import type { Account } from './types'

const DEFAULT_LOCK_SECONDS = 15 * 60

export class InvalidCredentialsError extends Error {}

export class LoginLockedError extends Error {
  readonly retryAfterSeconds: number

  constructor(retryAfterSeconds: number) {
    super('Login locked')
    this.retryAfterSeconds = retryAfterSeconds
  }
}

function readRetryAfterSeconds(detail: unknown): number | null {
  if (detail !== null && typeof detail === 'object' && 'retry_after_seconds' in detail) {
    const value = (detail as { retry_after_seconds: unknown }).retry_after_seconds
    if (typeof value === 'number' && value > 0) return value
  }
  return null
}

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
    if (error instanceof ApiError && error.status === 429) {
      throw new LoginLockedError(readRetryAfterSeconds(error.body) ?? DEFAULT_LOCK_SECONDS)
    }
    throw error
  }
}

export function fetchCurrentAccount(): Promise<Account> {
  return apiFetch<Account>('/auth/me')
}

export function logout(): Promise<void> {
  forgetPendingSubmissions()
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

export function updateTransferAlias(alias: string): Promise<Account> {
  return apiFetch<Account>('/auth/business/transfer-alias', {
    method: 'PATCH',
    body: JSON.stringify({ transfer_alias: alias }),
  })
}

interface UpdatePreferencesPayload {
  font_size: number
}

export function updatePreferences(fontSize: number): Promise<Account> {
  return apiFetch<Account>('/auth/me/preferences', {
    method: 'PATCH',
    body: JSON.stringify({ font_size: fontSize } satisfies UpdatePreferencesPayload),
  })
}

export function updateOwnName(name: string): Promise<Account> {
  return apiFetch<Account>('/auth/me', {
    method: 'PATCH',
    body: JSON.stringify({ name }),
  })
}

interface ChangeOwnPasswordPayload {
  current_password: string
  new_password: string
}

export function changeOwnPassword(currentPassword: string, newPassword: string): Promise<void> {
  return apiFetch<void>('/auth/me/password', {
    method: 'POST',
    body: JSON.stringify({
      current_password: currentPassword,
      new_password: newPassword,
    } satisfies ChangeOwnPasswordPayload),
  })
}
