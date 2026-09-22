export function formatQuantity(value: string | number): string {
  const text = typeof value === 'number' ? value.toFixed(3) : value
  if (!text.includes('.')) return text
  const trimmed = text.replace(/0+$/, '').replace(/\.$/, '')
  return trimmed === '' ? '0' : trimmed
}
