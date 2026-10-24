export function formatMoney(amount: number | string): string {
  const value = typeof amount === 'string' ? Number(amount) : amount
  if (Number.isNaN(value)) return String(amount)
  const digits = Math.abs(value).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const isZero = Math.round(Math.abs(value) * 100) === 0
  return `${value < 0 && !isZero ? '-' : ''}$ ${digits}`
}

export const formatPrice = formatMoney
export const formatPriceExact = formatMoney
