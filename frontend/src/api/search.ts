import { apiFetch } from './client'
import type { Category, SearchResponse } from './types'

export function fetchCategories(): Promise<Category[]> {
  return apiFetch<Category[]>('/categories')
}

interface SearchParams {
  q?: string
  categoryId?: number
}

export function searchVariants({ q, categoryId }: SearchParams): Promise<SearchResponse> {
  const params = new URLSearchParams()
  if (q !== undefined && q !== '') {
    params.set('q', q)
  }
  if (categoryId !== undefined) {
    params.set('category_id', String(categoryId))
  }

  const query = params.toString()
  return apiFetch<SearchResponse>(`/search${query !== '' ? `?${query}` : ''}`)
}
