import type { PaymentMethod, SellableVariant } from '../../api/types'
import { normalizeForComparison } from '../../shared/normalizeForComparison'
import { toUnits } from '../../shared/signedDelta'

const STOCK_SCALE = 1000
const CENTS_PER_UNIT = 100
const WHOLE_QUANTITY_PATTERN = /^\d+$/
const DECIMAL_QUANTITY_PATTERN = /^\d+(\.\d{1,3})?$/
const DISCOUNT_PATTERN = /^\d+(\.\d{1,2})?$/

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  fiado: 'Fiado',
}

export const PAYMENT_METHODS: PaymentMethod[] = ['efectivo', 'transferencia', 'fiado']

export function sanitizeQuantity(raw: string, allowsFraction: boolean): string {
  const normalized = raw.replace(/,/g, '.')
  if (!allowsFraction) return normalized.replace(/\D/g, '')
  const [whole, ...rest] = normalized.replace(/[^\d.]/g, '').split('.')
  return rest.length > 0 ? `${whole}.${rest.join('')}` : whole
}

export function quantityProblem(quantity: string, allowsFraction: boolean): string | null {
  if (quantity.trim() === '') return 'Escribí la cantidad.'
  const pattern = allowsFraction ? DECIMAL_QUANTITY_PATTERN : WHOLE_QUANTITY_PATTERN
  if (!pattern.test(quantity)) {
    return allowsFraction ? 'Usá como máximo 3 decimales.' : 'Esta unidad no admite decimales.'
  }
  if (toUnits('stock', quantity) <= 0) return 'La cantidad tiene que ser mayor que cero.'
  return null
}

export function stepQuantity(quantity: string, delta: number): string | null {
  if (quantityProblem(quantity, true) !== null) return null
  const next = toUnits('stock', quantity) + delta * STOCK_SCALE
  if (next <= 0) return null
  return String(next / STOCK_SCALE)
}

export function discountProblem(discount: string, subtotalCents: number): string | null {
  if (discount.trim() === '') return null
  if (!DISCOUNT_PATTERN.test(discount)) return 'Usá como máximo 2 decimales.'
  if (toUnits('price', discount) > subtotalCents) return 'El descuento no puede ser mayor que el total.'
  return null
}

export function lineTotalCents(quantity: string, price: string): number {
  if (quantity.trim() === '' || Number.isNaN(Number(quantity))) return 0
  return Math.round((toUnits('price', price) * toUnits('stock', quantity)) / STOCK_SCALE)
}

export function discountCents(discount: string): number {
  if (discount.trim() === '' || Number.isNaN(Number(discount))) return 0
  return toUnits('price', discount)
}

export function sanitizePercent(raw: string): string {
  const [whole, ...rest] = raw.replace(/,/g, '.').replace(/[^\d.]/g, '').split('.')
  return rest.length > 0 ? `${whole}.${rest.join('').slice(0, 2)}` : whole
}

export function percentProblem(percent: string): string | null {
  if (percent.trim() === '') return null
  if (!DISCOUNT_PATTERN.test(percent)) return 'Escribí un porcentaje entre 0 y 100.'
  if (Number(percent) > 100) return 'El descuento no puede ser mayor al 100%.'
  return null
}

export function percentFromCents(cents: number, subtotalCents: number): string {
  if (subtotalCents <= 0) return ''
  return String(Math.round((cents * 10000) / subtotalCents) / 100)
}

export function percentDiscountCents(percent: string, subtotalCents: number): number {
  if (percent.trim() === '' || percentProblem(percent) !== null) return 0
  return Math.round((subtotalCents * Number(percent)) / 100)
}

export function centsToAmount(cents: number): string {
  return (cents / CENTS_PER_UNIT).toFixed(2)
}

export function exceedsStock(quantity: string, stock: string): boolean {
  if (quantity.trim() === '' || Number.isNaN(Number(quantity))) return false
  return toUnits('stock', quantity) > toUnits('stock', stock)
}

export function variantDescription(variant: SellableVariant): string {
  if (variant.label) return variant.label
  return variant.attribute_values.map((item) => item.value).join(', ')
}

export function matchesSearch(variant: SellableVariant, search: string): boolean {
  const terms = normalizeForComparison(search).split(/\s+/).filter((term) => term !== '')
  const text = normalizeForComparison(
    [variant.product_name, variant.category_name, variantDescription(variant)].join(' '),
  )
  return terms.every((term) => text.includes(term))
}

export function startOfDayIso(date: string): string {
  return new Date(`${date}T00:00:00`).toISOString()
}

export function startOfNextDayIso(date: string): string {
  const next = new Date(`${date}T00:00:00`)
  next.setDate(next.getDate() + 1)
  return next.toISOString()
}
