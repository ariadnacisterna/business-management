const UNITS: { limit: number; divisor: number; unit: Intl.RelativeTimeFormatUnit }[] = [
  { limit: 60, divisor: 1, unit: 'second' },
  { limit: 3600, divisor: 60, unit: 'minute' },
  { limit: 86400, divisor: 3600, unit: 'hour' },
  { limit: 2592000, divisor: 86400, unit: 'day' },
  { limit: 31536000, divisor: 2592000, unit: 'month' },
  { limit: Infinity, divisor: 31536000, unit: 'year' },
]

const FORMATTER = new Intl.RelativeTimeFormat('es-AR', { numeric: 'auto' })

export function formatRelativeTime(isoDate: string): string {
  const seconds = (Date.now() - new Date(isoDate).getTime()) / 1000
  const { divisor, unit } = UNITS.find((entry) => seconds < entry.limit) ?? UNITS.at(-1)!
  return FORMATTER.format(-Math.round(seconds / divisor), unit)
}
