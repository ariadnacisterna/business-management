const integerFormatter = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})

const decimalFormatter = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

export function formatPrice(amount: number | string): string {
  const value = typeof amount === 'string' ? Number(amount) : amount
  const hasDecimals = Math.round(value * 100) % 100 !== 0
  return hasDecimals ? decimalFormatter.format(value) : integerFormatter.format(value)
}
