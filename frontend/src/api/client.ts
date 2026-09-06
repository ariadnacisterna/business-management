const CSRF_COOKIE_NAME = 'csrf_token'
const CSRF_HEADER_NAME = 'X-CSRF-Token'
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

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

  if (init.body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  if (MUTATING_METHODS.has(method)) {
    const csrfToken = readCsrfToken()
    if (csrfToken !== null) {
      headers.set(CSRF_HEADER_NAME, csrfToken)
    }
  }

  const response = await fetch(path, { ...init, method, headers, credentials: 'same-origin' })

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
