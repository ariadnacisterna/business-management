export const STOCK_STATUS_LABELS: Record<string, string> = {
  normal: 'Normal',
  stock_bajo: 'Stock bajo',
  sin_stock: 'Sin stock',
}

export function stockStatusClasses(status: string): string {
  if (status === 'sin_stock') return 'bg-danger/10 text-danger'
  if (status === 'stock_bajo') return 'bg-warning/10 text-warning'
  return 'bg-success-soft text-success'
}

export function stockStatusTextColor(status: string): string {
  if (status === 'sin_stock') return 'text-danger'
  if (status === 'stock_bajo') return 'text-warning'
  return 'text-success'
}
