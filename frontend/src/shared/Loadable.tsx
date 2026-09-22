import { Suspense, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { ErrorBoundary } from './ErrorBoundary'
import { PageLoading } from './PageLoading'

export function Loadable({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()

  return (
    <ErrorBoundary resetKey={pathname}>
      <Suspense fallback={<PageLoading />}>{children}</Suspense>
    </ErrorBoundary>
  )
}
