import { CASH_UPDATED_EVENT } from './cash'
import { apiFetch } from './client'
import type { PaymentMethod, Sale, SalePage, SalePayment, SellableVariant } from './types'

export type NewSaleLine = { variant_id: number; quantity: string } | { description: string; amount: string }

export interface NewSale {
  lines: NewSaleLine[]
  payments: SalePayment[]
  customer_id?: number
  discount: string
}

export interface SaleFilters {
  page: number
  pageSize: number
  createdFrom?: string
  createdTo?: string
  paymentMethod?: PaymentMethod
}

export async function fetchSellableVariants(): Promise<SellableVariant[]> {
  const response = await apiFetch<{ results: SellableVariant[] }>('/search')
  return response.results
}

function announceCashChange(sale: Sale): Sale {
  window.dispatchEvent(new Event(CASH_UPDATED_EVENT))
  return sale
}

export function createSale(sale: NewSale): Promise<Sale> {
  return apiFetch<Sale>('/sales', { method: 'POST', body: JSON.stringify(sale) }).then(announceCashChange)
}

export function fetchSales(filters: SaleFilters): Promise<SalePage> {
  const query = new URLSearchParams({ page: String(filters.page), page_size: String(filters.pageSize) })
  if (filters.createdFrom !== undefined) query.set('created_from', filters.createdFrom)
  if (filters.createdTo !== undefined) query.set('created_to', filters.createdTo)
  if (filters.paymentMethod !== undefined) query.set('payment_method', filters.paymentMethod)
  return apiFetch<SalePage>(`/sales?${query.toString()}`)
}

export function fetchSale(id: number): Promise<Sale> {
  return apiFetch<Sale>(`/sales/${id}`)
}

export function voidSale(id: number, reason: string): Promise<Sale> {
  return apiFetch<Sale>(`/sales/${id}/void`, { method: 'POST', body: JSON.stringify({ reason }) }).then(announceCashChange)
}
