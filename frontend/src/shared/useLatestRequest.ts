import { useCallback, useRef } from 'react'

export function useLatestRequest(): () => () => boolean {
  const latestRef = useRef(0)
  return useCallback(() => {
    latestRef.current += 1
    const request = latestRef.current
    return () => latestRef.current === request
  }, [])
}
