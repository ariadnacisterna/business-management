import { apiFetch } from './client'
import type {
  Attribute,
  AttributeValue,
  Category,
  CurrentPrice,
  Price,
  Product,
  ProductCreationResult,
  Unit,
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

export function fetchProducts(): Promise<Product[]> {
  return apiFetch<Product[]>('/products')
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

export function deactivateProduct(id: number): Promise<Product> {
  return apiFetch<Product>(`/products/${id}/deactivate`, { method: 'POST' })
}

export function reactivateProduct(id: number): Promise<Product> {
  return apiFetch<Product>(`/products/${id}/reactivate`, { method: 'POST' })
}
