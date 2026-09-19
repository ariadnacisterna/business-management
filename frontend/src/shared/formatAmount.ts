export function formatAmount(amount: string): string {
  const value = Number(amount)
  if (Number.isNaN(value)) return amount
  return value.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
