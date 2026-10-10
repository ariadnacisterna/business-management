const CSRF_COOKIE_NAME = 'csrf_token'
const CSRF_HEADER_NAME = 'X-CSRF-Token'
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])
const SUBMISSION_KEY_HEADER_NAME = 'Idempotency-Key'
const SUBMISSION_KEY_BYTES = 16
const SUBMISSION_KEY_LIFETIME_MS = 5 * 60 * 1000
const SUBMISSION_KEY_EXEMPT_PATH_PREFIX = '/auth/'
const FIRST_SERVER_ERROR_STATUS = 500

interface PendingSubmission {
  key: string
  createdAt: number
}

const pendingSubmissions = new Map<string, PendingSubmission>()

function newSubmissionKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(SUBMISSION_KEY_BYTES))
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function describeBody(body: BodyInit | null | undefined): string {
  if (body instanceof FormData) {
    return Array.from(body.entries(), ([name, value]) =>
      typeof value === 'string' ? `${name}=${value}` : `${name}=${value.name}:${value.size}:${value.lastModified}`,
    ).join('&')
  }
  return typeof body === 'string' ? body : ''
}

function submissionIdentity(method: string, path: string, body: BodyInit | null | undefined): string | null {
  if (!MUTATING_METHODS.has(method) || path.startsWith(SUBMISSION_KEY_EXEMPT_PATH_PREFIX)) {
    return null
  }
  return `${method} ${path} ${describeBody(body)}`
}

function submissionKeyFor(identity: string): string {
  const now = Date.now()
  const pending = pendingSubmissions.get(identity)
  if (pending !== undefined && now - pending.createdAt < SUBMISSION_KEY_LIFETIME_MS) {
    return pending.key
  }
  const key = newSubmissionKey()
  pendingSubmissions.set(identity, { key, createdAt: now })
  return key
}

export function forgetPendingSubmissions(): void {
  pendingSubmissions.clear()
}

export class ApiError extends Error {
  readonly status: number
  readonly body: unknown

  constructor(status: number, message: string, body: unknown = null) {
    super(message)
    this.status = status
    this.body = body
  }
}

type UnauthorizedHandler = () => void

let unauthorizedHandler: UnauthorizedHandler | null = null

export function setUnauthorizedHandler(handler: UnauthorizedHandler | null): void {
  unauthorizedHandler = handler
}

function readCsrfToken(): string | null {
  for (const cookie of document.cookie.split('; ')) {
    const [name, ...rest] = cookie.split('=')
    if (name === CSRF_COOKIE_NAME) {
      return decodeURIComponent(rest.join('='))
    }
  }
  return null
}

async function readErrorBody(response: Response): Promise<{ message: string; detail: unknown }> {
  const body: unknown = await response.json().catch(() => null)
  if (body !== null && typeof body === 'object' && 'detail' in body) {
    const detail = (body as { detail: unknown }).detail
    if (typeof detail === 'string') {
      return { message: detail, detail }
    }
    return { message: response.statusText, detail }
  }
  return { message: response.statusText, detail: null }
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = (init.method ?? 'GET').toUpperCase()
  const headers = new Headers(init.headers)

  if (init.body !== undefined && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  if (MUTATING_METHODS.has(method)) {
    const csrfToken = readCsrfToken()
    if (csrfToken !== null) {
      headers.set(CSRF_HEADER_NAME, csrfToken)
    }
  }

  const identity = submissionIdentity(method, path, init.body)
  if (identity !== null) {
    headers.set(SUBMISSION_KEY_HEADER_NAME, submissionKeyFor(identity))
  }

  const response = await fetch(path, { ...init, method, headers, credentials: 'same-origin' })

  if (identity !== null && response.status < FIRST_SERVER_ERROR_STATUS) {
    pendingSubmissions.delete(identity)
  }

  if (response.status === 401) {
    const { message, detail } = await readErrorBody(response)
    unauthorizedHandler?.()
    throw new ApiError(response.status, message, detail)
  }

  if (!response.ok) {
    const { message, detail } = await readErrorBody(response)
    throw new ApiError(response.status, message, detail)
  }

  if (response.status === 204) {
    return undefined as T
  }

  return (await response.json()) as T
}
