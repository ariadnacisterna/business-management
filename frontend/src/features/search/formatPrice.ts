const currencyFormatter = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  minimumFractionDigits: 2,
})

export function formatPrice(amount: string): string {
  return currencyFormatter.format(Number(amount))
}
