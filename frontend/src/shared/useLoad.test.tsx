import { StrictMode } from 'react'
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useLoad } from './useLoad'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useLoad', () => {
  it('starts loading and then exposes the loaded data', async () => {
    const request = deferred<string>()
    const { result } = renderHook(() => useLoad(() => request.promise, []))

    expect(result.current.status).toBe('loading')
    expect(result.current.data).toBeUndefined()

    await act(async () => request.resolve('hola'))

    expect(result.current.status).toBe('success')
    expect(result.current.data).toBe('hola')
    expect(result.current.error).toBeNull()
  })

  it('ignores an old response when the dependencies change while a request is in flight', async () => {
    const requests: Record<number, ReturnType<typeof deferred<string>>> = {
      1: deferred<string>(),
      2: deferred<string>(),
    }
    const { result, rerender } = renderHook(
      ({ id }: { id: number }) => useLoad(() => requests[id].promise, [id]),
      { initialProps: { id: 1 } },
    )

    rerender({ id: 2 })
    await act(async () => requests[2].resolve('nuevo'))
    await act(async () => requests[1].resolve('viejo'))

    expect(result.current.status).toBe('success')
    expect(result.current.data).toBe('nuevo')
  })

  it('does not update state after unmounting', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const onSuccess = vi.fn()
    const request = deferred<string>()
    const { unmount } = renderHook(() => useLoad(() => request.promise, [], onSuccess))

    unmount()
    await act(async () => request.resolve('tarde'))

    expect(onSuccess).not.toHaveBeenCalled()
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it('reload requests again and goes through loading', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce('uno')
    const { result } = renderHook(() => useLoad(fetcher, []))
    await waitFor(() => expect(result.current.status).toBe('success'))

    const request = deferred<string>()
    fetcher.mockReturnValueOnce(request.promise)
    act(() => result.current.reload())

    expect(result.current.status).toBe('loading')
    expect(fetcher).toHaveBeenCalledTimes(2)

    await act(async () => request.resolve('dos'))

    expect(result.current.status).toBe('success')
    expect(result.current.data).toBe('dos')
  })

  it('goes through loading when the dependencies change and keeps the previous data until the new result arrives', async () => {
    const requests: Record<number, ReturnType<typeof deferred<string>>> = {
      1: deferred<string>(),
      2: deferred<string>(),
    }
    const { result, rerender } = renderHook(
      ({ id }: { id: number }) => useLoad(() => requests[id].promise, [id]),
      { initialProps: { id: 1 } },
    )
    await act(async () => requests[1].resolve('primero'))
    expect(result.current.data).toBe('primero')

    rerender({ id: 2 })

    expect(result.current.status).toBe('loading')
    expect(result.current.data).toBe('primero')

    await act(async () => requests[2].resolve('segundo'))

    expect(result.current.status).toBe('success')
    expect(result.current.data).toBe('segundo')
  })

  it('reports an error and recovers with reload', async () => {
    const failure = new Error('falló')
    const fetcher = vi.fn().mockRejectedValueOnce(failure)
    const { result } = renderHook(() => useLoad(fetcher, []))

    await waitFor(() => expect(result.current.status).toBe('error'))
    expect(result.current.error).toBe(failure)

    fetcher.mockResolvedValueOnce('ok')
    act(() => result.current.reload())
    expect(result.current.status).toBe('loading')
    expect(result.current.error).toBeNull()

    await waitFor(() => expect(result.current.status).toBe('success'))
    expect(result.current.data).toBe('ok')
  })

  it('keeps the last loaded data when a later request fails', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce('bueno')
    const { result } = renderHook(() => useLoad(fetcher, []))
    await waitFor(() => expect(result.current.status).toBe('success'))

    fetcher.mockRejectedValueOnce(new Error('falló'))
    act(() => result.current.reload())

    await waitFor(() => expect(result.current.status).toBe('error'))
    expect(result.current.data).toBe('bueno')
  })

  it('setData updates the data with a value and with a function', async () => {
    const { result } = renderHook(() => useLoad(() => Promise.resolve(1), []))
    await waitFor(() => expect(result.current.status).toBe('success'))

    act(() => result.current.setData(10))
    expect(result.current.data).toBe(10)

    act(() => result.current.setData((current) => (current ?? 0) + 5))
    expect(result.current.data).toBe(15)
    expect(result.current.status).toBe('success')
  })

  it('setData does nothing while there is no loaded data yet', async () => {
    const request = deferred<number>()
    const { result } = renderHook(() => useLoad(() => request.promise, []))

    act(() => result.current.setData(99))
    expect(result.current.data).toBeUndefined()
    expect(result.current.status).toBe('loading')

    await act(async () => request.resolve(1))
    expect(result.current.data).toBe(1)
  })

  it('calls onSuccess once per successful load, and not for failed or old ones', async () => {
    const onSuccess = vi.fn()
    const requests: Record<number, ReturnType<typeof deferred<string>>> = {
      1: deferred<string>(),
      2: deferred<string>(),
      3: deferred<string>(),
    }
    const { result, rerender } = renderHook(
      ({ id }: { id: number }) => useLoad(() => requests[id].promise, [id], onSuccess),
      { initialProps: { id: 1 } },
    )

    rerender({ id: 2 })
    await act(async () => requests[1].resolve('viejo'))
    expect(onSuccess).not.toHaveBeenCalled()

    await act(async () => requests[2].resolve('dos'))
    expect(onSuccess).toHaveBeenCalledTimes(1)
    expect(onSuccess).toHaveBeenLastCalledWith('dos')

    rerender({ id: 3 })
    await act(async () => requests[3].reject(new Error('falló')))
    await waitFor(() => expect(result.current.status).toBe('error'))
    expect(onSuccess).toHaveBeenCalledTimes(1)
  })

  it('turns an exception thrown by onSuccess into an error state instead of an unhandled rejection', async () => {
    const failure = new Error('onSuccess falló')
    const onSuccess = vi.fn(() => {
      throw failure
    })
    const { result } = renderHook(() => useLoad(() => Promise.resolve('datos'), [], onSuccess))

    await waitFor(() => expect(result.current.status).toBe('error'))

    expect(onSuccess).toHaveBeenCalledTimes(1)
    expect(result.current.error).toBe(failure)
    expect(result.current.data).toBe('datos')
  })

  it('is safe under StrictMode: the double mount leaves a coherent state', async () => {
    const fetcher = vi.fn(() => Promise.resolve('datos'))
    const onSuccess = vi.fn()
    const { result } = renderHook(() => useLoad(fetcher, [], onSuccess), { wrapper: StrictMode })

    await waitFor(() => expect(result.current.status).toBe('success'))

    expect(result.current.data).toBe('datos')
    expect(result.current.error).toBeNull()
    expect(fetcher.mock.calls.length).toBeGreaterThanOrEqual(1)
    expect(onSuccess).toHaveBeenCalledTimes(1)

    await act(async () => {})
    expect(result.current.status).toBe('success')
  })
})
