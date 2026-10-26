import { apiFetch } from './client'

export const CASH_UPDATED_EVENT = 'cash-updated'

export type CashRegisterStatus = 'abierta' | 'pendiente' | 'cerrada'
export type CashMovementKind = 'ingreso' | 'retiro'

export interface CashMovement {
  id: number
  kind: CashMovementKind
  amount: string
  reason: string | null
  created_by_account_id: number
  created_by_account_name: string
  created_at: string
}

export interface CashRegister {
  id: number
  account_id: number
  account_name: string
  opened_at: string
  ends_at: string
  closed_at: string | null
  closed_by_account_id: number | null
  closed_by_account_name: string | null
  status: CashRegisterStatus
  cash_sales: string
  cash_voided: string
  deposits: string
  withdrawals: string
  expected_cash: string
  counted_cash: string | null
  cash_difference: string | null
  fiado_sales: string
  transfers_visible: boolean
  transfer_sales: string | null
  transfer_voided: string | null
  expected_transfer: string | null
  counted_transfer: string | null
  transfer_difference: string | null
  transfers_closed_at: string | null
  movements: CashMovement[]
}

export interface CashRegisterPage {
  items: CashRegister[]
  total: number
  page: number
  page_size: number
}

function announceCashChange<T>(result: T): T {
  window.dispatchEvent(new Event(CASH_UPDATED_EVENT))
  return result
}

export function fetchCurrentCashRegister(): Promise<CashRegister> {
  return apiFetch<CashRegister>('/cash-registers/current')
}

export function addCashMovement(kind: CashMovementKind, amount: string, reason: string): Promise<CashRegister> {
  const body: { kind: CashMovementKind; amount: string; reason?: string } = { kind, amount }
  if (reason.trim() !== '') body.reason = reason.trim()
  return apiFetch<CashRegister>('/cash-registers/current/movements', {
    method: 'POST',
    body: JSON.stringify(body),
  }).then(announceCashChange)
}

export interface CashRegisterFilters {
  openedFrom?: string
  openedTo?: string
  status?: CashRegisterStatus
}

export function fetchCashRegisters(page: number, pageSize: number, filters: CashRegisterFilters = {}): Promise<CashRegisterPage> {
  const query = new URLSearchParams({ page: String(page), page_size: String(pageSize) })
  if (filters.openedFrom !== undefined) query.set('opened_from', filters.openedFrom)
  if (filters.openedTo !== undefined) query.set('opened_to', filters.openedTo)
  if (filters.status !== undefined) query.set('status', filters.status)
  return apiFetch<CashRegisterPage>(`/cash-registers?${query.toString()}`)
}

export function closeCashRegister(id: number, countedCash: string, countedTransfer?: string): Promise<CashRegister> {
  const body: { counted_cash: string; counted_transfer?: string } = { counted_cash: countedCash }
  if (countedTransfer !== undefined) body.counted_transfer = countedTransfer
  return apiFetch<CashRegister>(`/cash-registers/${id}/close`, {
    method: 'POST',
    body: JSON.stringify(body),
  }).then(announceCashChange)
}

export function closeCashRegisterTransfers(id: number, countedTransfer: string): Promise<CashRegister> {
  return apiFetch<CashRegister>(`/cash-registers/${id}/close-transfers`, {
    method: 'POST',
    body: JSON.stringify({ counted_transfer: countedTransfer }),
  }).then(announceCashChange)
}
