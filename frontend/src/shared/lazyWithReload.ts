import { lazy, type ComponentType } from 'react'

const STORAGE_KEY = 'lastChunkReloadAt'
const RELOAD_COOLDOWN_MS = 10_000
const CHUNK_ERROR_PATTERN =
  /dynamically imported module|importing a module script failed|failed to fetch|loading chunk|loading css chunk/i

function isChunkLoadError(error: unknown): boolean {
  return error instanceof Error && CHUNK_ERROR_PATTERN.test(error.message)
}

function claimReload(): boolean {
  try {
    const last = Number(window.sessionStorage.getItem(STORAGE_KEY))
    const now = Date.now()
    if (Number.isFinite(last) && last > 0 && now - last < RELOAD_COOLDOWN_MS) {
      return false
    }
    window.sessionStorage.setItem(STORAGE_KEY, String(now))
    return true
  } catch {
    return false
  }
}

export function loadWithReload<T>(factory: () => Promise<T>): Promise<T> {
  return factory().catch((error: unknown) => {
    if (isChunkLoadError(error) && claimReload()) {
      window.location.reload()
      return new Promise<T>(() => {})
    }
    throw error
  })
}

export function lazyWithReload<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
) {
  return lazy(() => loadWithReload(factory))
}
