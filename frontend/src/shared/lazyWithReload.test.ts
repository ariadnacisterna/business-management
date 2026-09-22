import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadWithReload } from './lazyWithReload'

const CHUNK_ERROR = new TypeError('Failed to fetch dynamically imported module: /assets/x.js')

describe('loadWithReload', () => {
  const reload = vi.fn()

  beforeEach(() => {
    reload.mockClear()
    window.sessionStorage.clear()
    vi.stubGlobal('location', { ...window.location, reload })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('returns the module when the import succeeds', async () => {
    await expect(loadWithReload(() => Promise.resolve('ok'))).resolves.toBe('ok')
    expect(reload).not.toHaveBeenCalled()
  })

  it('reloads the page once when the import fails with a module load error', () => {
    void loadWithReload(() => Promise.reject(CHUNK_ERROR))

    return vi.waitFor(() => expect(reload).toHaveBeenCalledTimes(1))
  })

  it('does not reload again within ten seconds and rethrows the error', async () => {
    void loadWithReload(() => Promise.reject(CHUNK_ERROR))
    await vi.waitFor(() => expect(reload).toHaveBeenCalledTimes(1))

    await expect(loadWithReload(() => Promise.reject(CHUNK_ERROR))).rejects.toBe(CHUNK_ERROR)
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('reloads again after the cooldown has passed', async () => {
    window.sessionStorage.setItem('lastChunkReloadAt', String(Date.now() - 11_000))

    void loadWithReload(() => Promise.reject(CHUNK_ERROR))

    await vi.waitFor(() => expect(reload).toHaveBeenCalledTimes(1))
  })

  it('does not reload for errors that are not module load errors', async () => {
    const error = new Error('boom')

    await expect(loadWithReload(() => Promise.reject(error))).rejects.toBe(error)
    expect(reload).not.toHaveBeenCalled()
  })

  it('does not reload when sessionStorage is unavailable', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })

    await expect(loadWithReload(() => Promise.reject(CHUNK_ERROR))).rejects.toBe(CHUNK_ERROR)
    expect(reload).not.toHaveBeenCalled()
    vi.restoreAllMocks()
  })
})
