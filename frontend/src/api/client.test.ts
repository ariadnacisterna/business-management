import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { apiFetch, errorMessage, forgetPendingSubmissions } from './client'

const SUBMISSION_KEY_HEADER_NAME = 'Idempotency-Key'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function sentKey(fetchMock: ReturnType<typeof vi.fn>, callIndex: number): string | null {
  const init = fetchMock.mock.calls[callIndex][1] as RequestInit
  return new Headers(init.headers).get(SUBMISSION_KEY_HEADER_NAME)
}

function adjustStock(delta: string): Promise<unknown> {
  return apiFetch('/variants/1/stock/adjustments', { method: 'POST', body: JSON.stringify({ delta }) })
}

describe('apiFetch submission key', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    forgetPendingSubmissions()
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('sends a key with every change but not with reads or session requests', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(jsonResponse({})))

    await adjustStock('5')
    await apiFetch('/variants/1/stock')
    await apiFetch('/auth/logout', { method: 'POST' })

    expect(sentKey(fetchMock, 0)).toMatch(/^[0-9a-f]{32}$/)
    expect(sentKey(fetchMock, 1)).toBeNull()
    expect(sentKey(fetchMock, 2)).toBeNull()
  })

  it('reuses the key when the same change is retried after a network failure', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    fetchMock.mockResolvedValueOnce(jsonResponse({}, 201))

    await expect(adjustStock('5')).rejects.toThrow('Failed to fetch')
    await adjustStock('5')

    expect(sentKey(fetchMock, 1)).toBe(sentKey(fetchMock, 0))
  })

  it('reuses the key when the server failed and the change is retried', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ detail: 'Error' }, 500))
    fetchMock.mockResolvedValueOnce(jsonResponse({}, 201))

    await expect(adjustStock('5')).rejects.toThrow()
    await adjustStock('5')

    expect(sentKey(fetchMock, 1)).toBe(sentKey(fetchMock, 0))
  })

  it('reuses the key for a double tap while the first request is still running', async () => {
    let finishFirst: (response: Response) => void = () => {}
    fetchMock.mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          finishFirst = resolve
        }),
    )
    fetchMock.mockResolvedValueOnce(jsonResponse({}, 201))

    const first = adjustStock('5')
    const second = adjustStock('5')
    finishFirst(jsonResponse({}, 201))
    await Promise.all([first, second])

    expect(sentKey(fetchMock, 1)).toBe(sentKey(fetchMock, 0))
  })

  it('uses a new key once the server answered, so the same change can be made again on purpose', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(jsonResponse({}, 201)))

    await adjustStock('5')
    await adjustStock('5')

    expect(sentKey(fetchMock, 1)).not.toBe(sentKey(fetchMock, 0))
  })

  it('uses a new key when the change is different', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    fetchMock.mockResolvedValueOnce(jsonResponse({}, 201))

    await expect(adjustStock('5')).rejects.toThrow()
    await adjustStock('6')

    expect(sentKey(fetchMock, 1)).not.toBe(sentKey(fetchMock, 0))
  })

  it('stops reusing a key after five minutes', async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(0)
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    fetchMock.mockResolvedValueOnce(jsonResponse({}, 201))

    await expect(adjustStock('5')).rejects.toThrow()
    now.mockReturnValue(5 * 60 * 1000)
    await adjustStock('5')

    expect(sentKey(fetchMock, 1)).not.toBe(sentKey(fetchMock, 0))
  })

  it('sends a key with file uploads and reuses it for the same file', async () => {
    const file = new File(['category,product_name'], 'catalogo.csv', { lastModified: 1 })
    const upload = () => {
      const body = new FormData()
      body.append('file', file)
      return apiFetch('/imports', { method: 'POST', body })
    }
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    fetchMock.mockResolvedValueOnce(jsonResponse({}, 201))

    await expect(upload()).rejects.toThrow()
    await upload()

    expect(sentKey(fetchMock, 0)).not.toBeNull()
    expect(sentKey(fetchMock, 1)).toBe(sentKey(fetchMock, 0))
  })
})

describe('errorMessage', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('shows the text the server sent as the reason', async () => {
    const fetchMock = fetch as ReturnType<typeof vi.fn>
    fetchMock.mockResolvedValueOnce(jsonResponse({ detail: 'Ya existe una categoría con ese nombre.' }, 409))

    const error = await apiFetch('/categories').catch((caught: unknown) => caught)

    expect(errorMessage(error, 'No se pudo guardar.')).toBe('Ya existe una categoría con ese nombre.')
  })

  it('falls back to the screen message instead of a technical one when the server gives no text', async () => {
    const fetchMock = fetch as ReturnType<typeof vi.fn>
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: [{ loc: ['body', 'name'], msg: 'field required' }] }), {
        status: 422,
        statusText: 'Unprocessable Entity',
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    fetchMock.mockResolvedValueOnce(new Response('<html>Bad Gateway</html>', { status: 502, statusText: 'Bad Gateway' }))

    const validationError = await apiFetch('/categories').catch((caught: unknown) => caught)
    const gatewayError = await apiFetch('/categories').catch((caught: unknown) => caught)

    expect(errorMessage(validationError, 'No se pudo guardar.')).toBe('No se pudo guardar.')
    expect(errorMessage(gatewayError, 'No se pudo guardar.')).toBe('No se pudo guardar.')
    expect(errorMessage(new TypeError('Failed to fetch'), 'No se pudo guardar.')).toBe('No se pudo guardar.')
  })
})
