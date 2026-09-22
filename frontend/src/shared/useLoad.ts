import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'

type LoadStatus = 'loading' | 'success' | 'error'

interface Settled<T> {
  deps: readonly unknown[]
  reloads: number
  data: T | undefined
  failed: boolean
  error: unknown
}

interface LoadResult<T> {
  status: LoadStatus
  data: T | undefined
  error: unknown
  reload: () => void
  setData: Dispatch<SetStateAction<T | undefined>>
}

function sameDeps(a: readonly unknown[], b: readonly unknown[]): boolean {
  return a.length === b.length && a.every((value, index) => Object.is(value, b[index]))
}

export function useLoad<T>(
  fetcher: () => Promise<T>,
  deps: readonly unknown[],
  onSuccess?: (data: T) => void,
): LoadResult<T> {
  const [reloads, setReloads] = useState(0)
  const [settled, setSettled] = useState<Settled<T> | null>(null)
  const fetcherRef = useRef(fetcher)
  const onSuccessRef = useRef(onSuccess)
  const requestRef = useRef<object | null>(null)
  const startedRef = useRef<{ deps: readonly unknown[]; reloads: number } | null>(null)

  useEffect(() => {
    fetcherRef.current = fetcher
    onSuccessRef.current = onSuccess
  })

  useEffect(() => {
    return () => {
      requestRef.current = null
      startedRef.current = null
    }
  }, [])

  useEffect(() => {
    const started = startedRef.current
    if (started !== null && started.reloads === reloads && sameDeps(started.deps, deps)) return
    startedRef.current = { deps, reloads }
    const request = {}
    requestRef.current = request
    let pending: Promise<T>
    try {
      pending = fetcherRef.current()
    } catch (error) {
      pending = Promise.reject(error)
    }
    pending.then(
      (data) => {
        if (requestRef.current !== request) return
        setSettled({ deps, reloads, data, failed: false, error: null })
        try {
          onSuccessRef.current?.(data)
        } catch (error) {
          setSettled({ deps, reloads, data, failed: true, error })
        }
      },
      (error: unknown) => {
        if (requestRef.current !== request) return
        setSettled((previous) => ({ deps, reloads, data: previous?.data, failed: true, error }))
      },
    )
  })

  const isCurrent = settled !== null && settled.reloads === reloads && sameDeps(settled.deps, deps)
  let status: LoadStatus = 'loading'
  if (isCurrent) status = settled.failed ? 'error' : 'success'

  function setData(update: SetStateAction<T | undefined>) {
    setSettled((previous) => {
      if (previous === null) return previous
      const next = typeof update === 'function' ? (update as (value: T | undefined) => T | undefined)(previous.data) : update
      return { ...previous, data: next }
    })
  }

  return {
    status,
    data: settled?.data,
    error: isCurrent && settled.failed ? settled.error : null,
    reload: () => setReloads((count) => count + 1),
    setData,
  }
}
