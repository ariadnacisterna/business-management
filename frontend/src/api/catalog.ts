import { apiFetch } from './client'
import type {
  Attribute,
  AttributeValue,
  Category,
  CurrentPrice,
  Price,
  Product,
  ProductCreationResult,
  ProductPage,
  Provider,
  Shortage,
  Unit,
  Variant,
  VariantCreationResult,
  VariantInput,
} from './types'

export function fetchCategories(): Promise<Category[]> {
  return apiFetch<Category[]>('/categories')
}

export function createCategory(name: string): Promise<Category> {
  return apiFetch<Category>('/categories', { method: 'POST', body: JSON.stringify({ name }) })
}

export function updateCategory(id: number, name: string): Promise<Category> {
  return apiFetch<Category>(`/categories/${id}`, { method: 'PATCH', body: JSON.stringify({ name }) })
}

export function fetchUnits(): Promise<Unit[]> {
  return apiFetch<Unit[]>('/units')
}

export function createUnit(input: {
  name: string
  abbreviation: string
  allows_fraction: boolean
}): Promise<Unit> {
  return apiFetch<Unit>('/units', { method: 'POST', body: JSON.stringify(input) })
}

export function updateUnit(
  id: number,
  input: { name: string; abbreviation: string; allows_fraction: boolean },
): Promise<Unit> {
  return apiFetch<Unit>(`/units/${id}`, { method: 'PATCH', body: JSON.stringify(input) })
}

export function fetchAttributes(): Promise<Attribute[]> {
  return apiFetch<Attribute[]>('/attributes')
}

export function createAttribute(name: string): Promise<Attribute> {
  return apiFetch<Attribute>('/attributes', { method: 'POST', body: JSON.stringify({ name }) })
}

export function fetchAttributeValues(attributeId: number): Promise<AttributeValue[]> {
  return apiFetch<AttributeValue[]>(`/attributes/${attributeId}/values`)
}

export function createAttributeValue(attributeId: number, value: string): Promise<AttributeValue> {
  return apiFetch<AttributeValue>(`/attributes/${attributeId}/values`, {
    method: 'POST',
    body: JSON.stringify({ value }),
  })
}

export function updateAttributeValue(id: number, value: string): Promise<AttributeValue> {
  return apiFetch<AttributeValue>(`/attribute-values/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ value }),
  })
}

export function deactivateAttributeValue(id: number): Promise<AttributeValue> {
  return apiFetch<AttributeValue>(`/attribute-values/${id}/deactivate`, { method: 'POST' })
}

export function reactivateAttributeValue(id: number): Promise<AttributeValue> {
  return apiFetch<AttributeValue>(`/attribute-values/${id}/reactivate`, { method: 'POST' })
}

export function fetchProducts(): Promise<Product[]> {
  return apiFetch<ProductPage>('/products').then((result) => result.items)
}

export interface ProductPageParams {
  page: number
  pageSize: number
  categoryId?: number
  status?: 'active' | 'inactive'
  search?: string
}

export function fetchProductsPage(params: ProductPageParams): Promise<ProductPage> {
  const query = new URLSearchParams()
  query.set('page', String(params.page))
  query.set('page_size', String(params.pageSize))
  if (params.categoryId !== undefined) query.set('category_id', String(params.categoryId))
  if (params.status !== undefined) query.set('status', params.status)
  if (params.search !== undefined && params.search !== '') query.set('search', params.search)
  return apiFetch<ProductPage>(`/products?${query.toString()}`)
}

export function fetchProduct(id: number): Promise<Product> {
  return apiFetch<Product>(`/products/${id}`)
}

export function createProduct(input: {
  name: string
  category_id: number
  unit_id: number
  variants?: VariantInput[]
}): Promise<ProductCreationResult> {
  return apiFetch<ProductCreationResult>('/products', { method: 'POST', body: JSON.stringify(input) })
}

export function updateProduct(
  id: number,
  input: { name?: string; category_id?: number; unit_id?: number },
): Promise<Product> {
  return apiFetch<Product>(`/products/${id}`, { method: 'PATCH', body: JSON.stringify(input) })
}

export function addVariant(productId: number, input: VariantInput): Promise<VariantCreationResult> {
  return apiFetch<VariantCreationResult>(`/products/${productId}/variants`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function updateVariant(id: number, input: VariantInput): Promise<VariantCreationResult> {
  return apiFetch<VariantCreationResult>(`/variants/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
}

export function setInitialVariantPrice(variantId: number, amount: string): Promise<Price> {
  return apiFetch<Price>(`/variants/${variantId}/price`, {
    method: 'PUT',
    body: JSON.stringify({ amount, expected_current_price_id: null }),
  })
}

export function fetchVariantCurrentPrice(variantId: number): Promise<CurrentPrice> {
  return apiFetch<CurrentPrice>(`/variants/${variantId}/price`)
}

export function fetchVariantPriceHistory(variantId: number): Promise<Price[]> {
  return apiFetch<Price[]>(`/variants/${variantId}/prices`)
}

export function changeVariantPrice(
  variantId: number,
  amount: string,
  expectedCurrentPriceId: number | null,
): Promise<Price> {
  return apiFetch<Price>(`/variants/${variantId}/price`, {
    method: 'PUT',
    body: JSON.stringify({ amount, expected_current_price_id: expectedCurrentPriceId }),
  })
}

export function changeProductPrice(
  productId: number,
  amount: string,
  expectedCurrentPriceIds: Record<number, number | null>,
): Promise<{ prices: Price[] }> {
  return apiFetch<{ prices: Price[] }>(`/products/${productId}/price`, {
    method: 'PUT',
    body: JSON.stringify({ amount, expected_current_price_ids: expectedCurrentPriceIds }),
  })
}

export function uploadProductImage(id: number, file: File): Promise<Product> {
  const formData = new FormData()
  formData.append('file', file)
  return apiFetch<Product>(`/products/${id}/image`, { method: 'POST', body: formData })
}

export function removeProductImage(id: number): Promise<Product> {
  return apiFetch<Product>(`/products/${id}/image`, { method: 'DELETE' })
}

export function deactivateProduct(id: number): Promise<Product> {
  return apiFetch<Product>(`/products/${id}/deactivate`, { method: 'POST' })
}

export function reactivateProduct(id: number): Promise<Product> {
  return apiFetch<Product>(`/products/${id}/reactivate`, { method: 'POST' })
}

export function deactivateVariant(variantId: number): Promise<Variant> {
  return apiFetch<Variant>(`/variants/${variantId}/deactivate`, { method: 'POST' })
}

export function reactivateVariant(variantId: number): Promise<Variant> {
  return apiFetch<Variant>(`/variants/${variantId}/reactivate`, { method: 'POST' })
}

export function fetchProviders(): Promise<Provider[]> {
  return apiFetch<Provider[]>('/providers')
}

export function fetchProvider(id: number): Promise<Provider> {
  return apiFetch<Provider>(`/providers/${id}`)
}

export function createProvider(input: {
  name: string
  contact_name?: string
  email?: string
  phone?: string
  category_ids?: number[]
}): Promise<Provider> {
  return apiFetch<Provider>('/providers', { method: 'POST', body: JSON.stringify(input) })
}

export function updateProvider(
  id: number,
  input: {
    name?: string
    contact_name?: string
    email?: string
    phone?: string
    last_purchase_at?: string
  },
): Promise<Provider> {
  return apiFetch<Provider>(`/providers/${id}`, { method: 'PATCH', body: JSON.stringify(input) })
}

export function setProviderCategories(id: number, categoryIds: number[]): Promise<Provider> {
  return apiFetch<Provider>(`/providers/${id}/categories`, {
    method: 'PUT',
    body: JSON.stringify({ category_ids: categoryIds }),
  })
}

export function deactivateProvider(id: number): Promise<Provider> {
  return apiFetch<Provider>(`/providers/${id}/deactivate`, { method: 'POST' })
}

export function reactivateProvider(id: number): Promise<Provider> {
  return apiFetch<Provider>(`/providers/${id}/reactivate`, { method: 'POST' })
}

export function setProductProvider(productId: number, providerId: number | null): Promise<Product> {
  return apiFetch<Product>(`/products/${productId}/provider`, {
    method: 'PUT',
    body: JSON.stringify({ provider_id: providerId }),
  })
}

export interface ShortageFilters {
  status?: string
  providerId?: number
  categoryId?: number
}

export function fetchShortages(filters: ShortageFilters = {}): Promise<Shortage[]> {
  const query = new URLSearchParams()
  if (filters.status !== undefined) query.set('status', filters.status)
  if (filters.providerId !== undefined) query.set('provider_id', String(filters.providerId))
  if (filters.categoryId !== undefined) query.set('category_id', String(filters.categoryId))
  const queryString = query.toString()
  return apiFetch<Shortage[]>(`/shortages${queryString === '' ? '' : `?${queryString}`}`)
}

export function createShortage(variantId: number): Promise<Shortage> {
  return apiFetch<Shortage>('/shortages', { method: 'POST', body: JSON.stringify({ variant_id: variantId }) })
}

export function changeShortageStatus(id: number, status: string): Promise<Shortage> {
  return apiFetch<Shortage>(`/shortages/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) })
}

export function fetchShortageCount(): Promise<{ count: number }> {
  return apiFetch<{ count: number }>('/shortages/count')
}
