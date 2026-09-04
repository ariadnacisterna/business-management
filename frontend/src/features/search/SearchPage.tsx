import { useEffect, useRef, useState } from 'react'
import { ApiError } from '../../api/client'
import { fetchCategories, searchVariants } from '../../api/search'
import type { Category, SearchResultItem } from '../../api/types'
import { formatPrice } from './formatPrice'
import styles from './SearchPage.module.css'

const SEARCH_DEBOUNCE_MS = 300
const NETWORK_ERROR_MESSAGE = 'No se pudo conectar con el servidor. Revisá tu conexión e intentá de nuevo.'
const SERVER_ERROR_MESSAGE = 'No se pudo completar la búsqueda. Intentá de nuevo.'

type SearchStatus = 'idle' | 'loading' | 'success' | 'error'

function describeVariant(result: SearchResultItem): string | null {
  const parts = [
    result.label,
    ...result.attribute_values.map((value) => `${value.attribute_name}: ${value.value}`),
  ].filter((part): part is string => part !== null && part !== '')

  return parts.length > 0 ? parts.join(' · ') : null
}

export function SearchPage() {
  const [searchText, setSearchText] = useState('')
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [categoriesError, setCategoriesError] = useState<string | null>(null)
  const [results, setResults] = useState<SearchResultItem[]>([])
  const [status, setStatus] = useState<SearchStatus>('idle')
  const [searchError, setSearchError] = useState<string | null>(null)
  const requestIdRef = useRef(0)

  useEffect(() => {
    fetchCategories()
      .then((allCategories) => {
        setCategories(allCategories.filter((category) => category.status === 'active'))
      })
      .catch(() => {
        setCategoriesError('No se pudieron cargar las categorías.')
      })
  }, [])

  function runSearch(text: string, categoryId: number | null) {
    const requestId = ++requestIdRef.current
    setStatus('loading')
    setSearchError(null)

    searchVariants({ q: text === '' ? undefined : text, categoryId: categoryId ?? undefined })
      .then((response) => {
        if (requestIdRef.current !== requestId) return
        setResults(response.results)
        setStatus('success')
      })
      .catch((error: unknown) => {
        if (requestIdRef.current !== requestId) return
        setStatus('error')
        setSearchError(error instanceof ApiError ? SERVER_ERROR_MESSAGE : NETWORK_ERROR_MESSAGE)
      })
  }

  useEffect(() => {
    const trimmedText = searchText.trim()
    if (trimmedText === '' && selectedCategoryId === null) {
      requestIdRef.current += 1
      return
    }

    const timeoutId = window.setTimeout(() => {
      runSearch(trimmedText, selectedCategoryId)
    }, SEARCH_DEBOUNCE_MS)

    return () => window.clearTimeout(timeoutId)
  }, [searchText, selectedCategoryId])

  function resetToIdle() {
    setStatus('idle')
    setResults([])
    setSearchError(null)
  }

  function handleRetry() {
    runSearch(searchText.trim(), selectedCategoryId)
  }

  function handleSearchTextChange(value: string) {
    setSearchText(value)
    if (value.trim() === '' && selectedCategoryId === null) {
      resetToIdle()
    }
  }

  function handleCategoryClick(categoryId: number | null) {
    const nextCategoryId = categoryId !== null && selectedCategoryId === categoryId ? null : categoryId
    setSelectedCategoryId(nextCategoryId)
    if (searchText.trim() === '' && nextCategoryId === null) {
      resetToIdle()
    }
  }

  return (
    <section className={styles.page}>
      <h1>Buscar productos</h1>

      <label htmlFor="search-text" className={styles.label}>
        Buscar
      </label>
      <input
        id="search-text"
        type="search"
        className={styles.searchInput}
        placeholder="Nombre, categoría o característica…"
        value={searchText}
        onChange={(event) => handleSearchTextChange(event.target.value)}
      />

      {categoriesError !== null && (
        <p role="alert" className={styles.error}>
          {categoriesError}
        </p>
      )}

      {categories.length > 0 && (
        <div className={styles.categories} role="group" aria-label="Categorías">
          <button
            type="button"
            className={selectedCategoryId === null ? styles.categoryActive : styles.category}
            aria-pressed={selectedCategoryId === null}
            onClick={() => handleCategoryClick(null)}
          >
            Todas
          </button>
          {categories.map((category) => (
            <button
              key={category.id}
              type="button"
              className={selectedCategoryId === category.id ? styles.categoryActive : styles.category}
              aria-pressed={selectedCategoryId === category.id}
              onClick={() => handleCategoryClick(category.id)}
            >
              {category.name}
            </button>
          ))}
        </div>
      )}

      {status === 'idle' && (
        <p className={styles.hint}>Escribí un término o elegí una categoría para empezar a buscar.</p>
      )}

      {status === 'loading' && <p role="status">Buscando…</p>}

      {status === 'error' && (
        <div className={styles.errorBox} role="alert">
          <p>{searchError}</p>
          <button type="button" onClick={handleRetry}>
            Reintentar
          </button>
        </div>
      )}

      {status === 'success' && results.length === 0 && (
        <p className={styles.hint}>
          No encontramos productos que coincidan con la búsqueda. Probá con otros términos.
        </p>
      )}

      {status === 'success' && results.length > 0 && (
        <ul className={styles.results}>
          {results.map((result) => {
            const variantDescription = describeVariant(result)
            return (
              <li key={result.variant_id} className={styles.card}>
                <p className={styles.productName}>{result.product_name}</p>
                <p className={styles.resultCategory}>{result.category_name}</p>
                {variantDescription !== null && (
                  <p className={styles.variant}>{variantDescription}</p>
                )}
                <p className={styles.price}>{formatPrice(result.price_amount)}</p>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
