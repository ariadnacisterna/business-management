export function formatISODateDisplay(value: string): string {
  const date = parseISODate(value)
  return date !== null ? formatDisplayDate(date) : value
}

export function parseISODate(value: string): Date | null {
  if (value === '') return null
  const [year, month, day] = value.split('-').map(Number)
  if (year === undefined || month === undefined || day === undefined) return null
  const date = new Date(year, month - 1, day)
  return Number.isNaN(date.getTime()) ? null : date
}

export function formatDisplayDate(date: Date): string {
  return date.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}
