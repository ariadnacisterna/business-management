import type { BadgeTone } from './Badge'

export const STOCK_STATUS_LABELS: Record<string, string> = {
  normal: 'Normal',
  stock_bajo: 'Stock bajo',
  sin_stock: 'Sin stock',
}

export function stockStatusTone(status: string): BadgeTone {
  if (status === 'sin_stock') return 'danger'
  if (status === 'stock_bajo') return 'warning'
  return 'success'
}

export function stockStatusTextColor(status: string): string {
  if (status === 'sin_stock') return 'text-danger'
  if (status === 'stock_bajo') return 'text-warning'
  return 'text-success'
}
