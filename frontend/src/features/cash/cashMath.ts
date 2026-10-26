import type { CashRegisterStatus } from '../../api/cash'
import { formatMoney } from '../../shared/formatPrice'

const MONEY_PATTERN = /^\d+(\.\d{1,2})?$/

export const STATUS_LABELS: Record<CashRegisterStatus, string> = {
  abierta: 'Abierta',
  pendiente: 'Pendiente de cierre',
  cerrada: 'Cerrada',
}

export const REASON_MAX_LENGTH = 200

export function moneyProblem(value: string, allowZero: boolean): string | null {
  if (value.trim() === '') return 'Escribí el importe.'
  if (!MONEY_PATTERN.test(value)) return 'Usá como máximo 2 decimales.'
  if (!allowZero && Number(value) <= 0) return 'El importe tiene que ser mayor que cero.'
  return null
}

export function differenceText(difference: string | null): string {
  if (difference === null) return ''
  const value = Number(difference)
  if (Math.round(Math.abs(value) * 100) === 0) return 'Sin diferencia'
  return value > 0 ? `Sobran ${formatMoney(value)}` : `Faltan ${formatMoney(Math.abs(value))}`
}

export function differenceTone(difference: string | null): string {
  if (difference === null) return ''
  const value = Number(difference)
  if (Math.round(Math.abs(value) * 100) === 0) return 'text-success'
  return value > 0 ? 'text-warning' : 'text-danger'
}
