import { formatPriceExact } from './formatPrice'

export type DeltaKind = 'stock' | 'price'

export interface DeltaEvaluation {
  state: 'empty' | 'invalid' | 'ready'
  error: string | null
  delta: number | null
  result: number | null
}

const MAX_STOCK = 2_147_483_647
const STOCK_SCALE = 1000
const MAX_STOCK_UNITS = MAX_STOCK * STOCK_SCALE
const MAX_PRICE_CENTS = 1_000_000_000_000
const STOCK_INTEGER_PATTERN = /^[+-]?\d+$/
const STOCK_DECIMAL_PATTERN = /^[+-]?(\d+\.?\d{0,3}|\.\d{1,3})$/
const PRICE_PATTERN = /^[+-]?(\d+\.?\d{0,2}|\.\d{1,2})$/
const SIGN_PATTERN = /^\s*[+\-−]/

export const PRICE_FLOOR_MESSAGE = 'El precio no puede quedar en cero o menos'

function trimTrailingZeros(text: string): string {
  if (!text.includes('.')) return text
  return text.replace(/0+$/, '').replace(/\.$/, '')
}

export function stockFloorMessage(current: number): string {
  return `No podés descontar más de lo que hay (${formatDeltaValue('stock', current)})`
}

const EMPTY: DeltaEvaluation = { state: 'empty', error: null, delta: null, result: null }

function invalid(error: string, delta: number | null = null, result: number | null = null): DeltaEvaluation {
  return { state: 'invalid', error, delta, result }
}

export function toUnits(kind: DeltaKind, value: number | string): number {
  const numeric = typeof value === 'string' ? Number(value) : value
  return kind === 'price' ? Math.round(numeric * 100) : Math.round(numeric * STOCK_SCALE)
}

export function sanitizeSignedDelta(raw: string, allowDecimals: boolean): string {
  const normalized = raw.replace(/[−–—]/g, '-').replace(/,/g, '.').trimStart()
  const sign = normalized.startsWith('-') ? '-' : normalized.startsWith('+') ? '+' : ''
  const unsigned = sign === '' ? normalized : normalized.slice(1)
  if (!allowDecimals) return sign + unsigned.replace(/\D/g, '')
  const cleaned = unsigned.replace(/[^\d.]/g, '')
  const [whole, ...rest] = cleaned.split('.')
  return sign + (rest.length > 0 ? `${whole}.${rest.join('')}` : cleaned)
}

export function hasInvalidDeltaChars(raw: string, allowDecimals: boolean): boolean {
  const unsigned = raw.replace(SIGN_PATTERN, '')
  return allowDecimals ? /[^\d.,]/.test(unsigned) : /\D/.test(unsigned)
}

export function evaluateDelta(
  kind: DeltaKind,
  current: number | string,
  text: string,
  allowDecimals = false,
): DeltaEvaluation {
  const trimmed = text.trim()
  if (/^[+-]?$/.test(trimmed)) return EMPTY

  const currentUnits = toUnits(kind, current)

  if (kind === 'stock') {
    const pattern = allowDecimals ? STOCK_DECIMAL_PATTERN : STOCK_INTEGER_PATTERN
    if (!pattern.test(trimmed)) {
      return invalid(allowDecimals ? 'Usá como máximo 3 decimales.' : 'Ingresá un número entero.')
    }
    const delta = Math.round(Number(trimmed) * STOCK_SCALE)
    if (Math.abs(delta) > MAX_STOCK_UNITS) return invalid('La cantidad es demasiado grande.')
    if (delta === 0) return invalid('El ajuste no puede ser cero.', 0, currentUnits)
    const result = currentUnits + delta
    if (result < 0) return invalid(stockFloorMessage(currentUnits), delta, result)
    if (result > MAX_STOCK_UNITS) return invalid('La cantidad resultante es demasiado grande.', delta, result)
    return { state: 'ready', error: null, delta, result }
  }

  if (!PRICE_PATTERN.test(trimmed)) return invalid('Usá como máximo 2 decimales.')
  const delta = Math.round(Number(trimmed) * 100)
  if (Math.abs(delta) >= MAX_PRICE_CENTS) return invalid('El importe es demasiado grande.')
  if (delta === 0) return invalid('La diferencia no puede ser cero.', 0, currentUnits)
  const result = currentUnits + delta
  if (result <= 0) return invalid(PRICE_FLOOR_MESSAGE, delta, result)
  if (result >= MAX_PRICE_CENTS) return invalid('El precio resultante es demasiado grande.', delta, result)
  return { state: 'ready', error: null, delta, result }
}

export function evaluateTargetStock(
  current: number | string,
  text: string,
  allowDecimals = false,
): DeltaEvaluation {
  const trimmed = text.trim()
  if (trimmed === '') return EMPTY
  const pattern = allowDecimals ? /^\d+\.?\d{0,3}$/ : /^\d+$/
  if (!pattern.test(trimmed)) {
    return invalid(allowDecimals ? 'Usá como máximo 3 decimales.' : 'Ingresá un número entero.')
  }
  const target = Math.round(Number(trimmed) * STOCK_SCALE)
  if (target > MAX_STOCK_UNITS) return invalid('La cantidad es demasiado grande.')
  const currentUnits = toUnits('stock', current)
  if (target === currentUnits) return invalid('La cantidad nueva es igual a la actual.', 0, target)
  return { state: 'ready', error: null, delta: target - currentUnits, result: target }
}

export function evaluateTargetPrice(current: number | string, text: string): DeltaEvaluation {
  const trimmed = text.trim()
  if (trimmed === '' || trimmed === '.') return EMPTY
  if (!/^(\d+\.?\d{0,2}|\.\d{1,2})$/.test(trimmed)) return invalid('Usá como máximo 2 decimales.')
  const target = Math.round(Number(trimmed) * 100)
  if (target >= MAX_PRICE_CENTS) return invalid('El precio resultante es demasiado grande.')
  if (target <= 0) return invalid(PRICE_FLOOR_MESSAGE, null, target)
  const currentUnits = toUnits('price', current)
  if (target === currentUnits) return invalid('El precio nuevo es igual al actual.', 0, target)
  return { state: 'ready', error: null, delta: target - currentUnits, result: target }
}

export function formatDeltaValue(kind: DeltaKind, units: number): string {
  if (kind === 'price') return formatPriceExact(units / 100)
  return trimTrailingZeros((units / STOCK_SCALE).toFixed(3))
}

export function formatSignedDelta(kind: DeltaKind, delta: number): string {
  const sign = delta < 0 ? '-' : '+'
  return `${sign}${formatDeltaValue(kind, Math.abs(delta))}`
}

export function deltaToApi(kind: DeltaKind, delta: number): string {
  return kind === 'price' ? (delta / 100).toFixed(2) : (delta / STOCK_SCALE).toFixed(3)
}

export function describeChange(kind: DeltaKind, current: number | string, delta: number): string {
  const currentUnits = toUnits(kind, current)
  const from = formatDeltaValue(kind, currentUnits)
  const to = formatDeltaValue(kind, currentUnits + delta)
  return `${from} → ${to} (diferencia ${formatSignedDelta(kind, delta)})`
}

export interface VariantDeltaEntry {
  label: string
  current: string
  evaluation: DeltaEvaluation
}

export interface AllVariantsEvaluation {
  entries: VariantDeltaEntry[]
  error: string | null
  ready: boolean
  delta: number | null
}

export function evaluateForAll(variants: { label: string; current: string }[], text: string): AllVariantsEvaluation {
  const entries = variants.map((variant) => ({
    ...variant,
    evaluation: evaluateDelta('price', variant.current, text),
  }))
  const broken = entries.filter((entry) => entry.evaluation.state === 'invalid')
  let error: string | null = null
  if (broken.length > 0) {
    const first = broken[0].evaluation.error
    error =
      first === PRICE_FLOOR_MESSAGE ? `${PRICE_FLOOR_MESSAGE} en: ${broken.map((entry) => entry.label).join(', ')}` : first
  }
  const ready = entries.length > 0 && entries.every((entry) => entry.evaluation.state === 'ready')
  return { entries, error, ready, delta: ready ? entries[0].evaluation.delta : null }
}
