import type { Presentation } from '../api/types'
import { formatQuantity } from './formatQuantity'
import { describeChange, evaluateDelta, evaluateTargetStock, toUnits } from './signedDelta'
import type { DeltaEvaluation } from './signedDelta'

export type StockEntryMode = 'presentation' | 'unit'

const STOCK_SCALE = 1000
const WHOLE_PATTERN = /^\d+$/
const SIGNED_WHOLE_PATTERN = /^[+-]?\d+$/
const FLOOR_PREFIX = 'No podés descontar más de lo que hay'

export function presentationUnits(presentation: Presentation): number {
  return toUnits('stock', presentation.quantity)
}

export function presentationLabel(presentation: Presentation, count: number): string {
  return count === 1 ? presentation.name : presentation.plural_name
}

export function formatPresentationUnits(units: number, presentation: Presentation, abbreviation: string): string {
  const size = presentationUnits(presentation)
  const whole = Math.floor(units / size)
  const loose = units - whole * size
  const parts: string[] = []
  if (whole > 0) parts.push(`${whole} ${presentationLabel(presentation, whole)}`)
  if (loose > 0) parts.push(`${formatQuantity((loose / STOCK_SCALE).toFixed(3))} ${abbreviation}`.trim())
  if (parts.length === 0) return `0 ${presentation.plural_name}`
  return parts.join(' y ')
}

export function formatStock(
  quantity: string | number,
  presentation: Presentation | null | undefined,
  abbreviation: string,
): string {
  if (presentation) return formatPresentationUnits(toUnits('stock', quantity), presentation, abbreviation)
  const plain = formatQuantity(quantity)
  return abbreviation === '' ? plain : `${plain} ${abbreviation}`
}

export function describePresentation(presentation: Presentation, abbreviation: string): string {
  return `${presentation.name} de ${formatQuantity(presentation.quantity)} ${abbreviation}`.trim()
}

export function suggestPluralName(name: string): string {
  const trimmed = name.trim()
  if (trimmed === '') return ''
  if (/[aeiouáéó]$/i.test(trimmed)) return `${trimmed}s`
  if (/[sx]$/i.test(trimmed)) return trimmed
  if (/z$/i.test(trimmed)) return `${trimmed.slice(0, -1)}ces`
  if (/[lnrdj]$/i.test(trimmed)) {
    const withoutAccent = trimmed.replace(/[áéíóú](?=[^áéíóú]*$)/i, (vowel) => vowel.normalize('NFD')[0])
    return `${withoutAccent}es`
  }
  return `${trimmed}s`
}

export interface StockEntryRequest {
  delta: string
  in_presentations?: boolean
  presentation_quantity?: string
}

export interface StockEntry {
  evaluation: DeltaEvaluation
  request: StockEntryRequest | null
  change: string
}

interface StockEntryInput {
  current: string
  text: string
  allowDecimals: boolean
  presentation: Presentation | null | undefined
  abbreviation: string
  mode: StockEntryMode
  whole: boolean
}

function formatUnits(units: number, presentation: Presentation | null | undefined, abbreviation: string): string {
  return formatStock((units / STOCK_SCALE).toFixed(3), presentation, abbreviation)
}

function withPresentationFloor(
  evaluation: DeltaEvaluation,
  currentUnits: number,
  presentation: Presentation | null | undefined,
  abbreviation: string,
): DeltaEvaluation {
  if (!presentation || evaluation.error === null || !evaluation.error.startsWith(FLOOR_PREFIX)) return evaluation
  return { ...evaluation, error: `${FLOOR_PREFIX} (${formatUnits(currentUnits, presentation, abbreviation)})` }
}

function invalidEntry(error: string): DeltaEvaluation {
  return { state: 'invalid', error, delta: null, result: null }
}

export function evaluateStockEntry(input: StockEntryInput): StockEntry {
  const { current, text, allowDecimals, presentation, abbreviation, mode, whole } = input
  const currentUnits = toUnits('stock', current)
  const trimmed = text.trim()
  const inPresentations = mode === 'presentation' && presentation != null

  let evaluation: DeltaEvaluation
  let presentationCount: number | null = null
  if (!inPresentations) {
    evaluation = whole
      ? evaluateTargetStock(current, text, allowDecimals)
      : evaluateDelta('stock', current, text, allowDecimals)
  } else if (/^[+-]?$/.test(trimmed)) {
    evaluation = { state: 'empty', error: null, delta: null, result: null }
  } else if (!(whole ? WHOLE_PATTERN : SIGNED_WHOLE_PATTERN).test(trimmed)) {
    evaluation = invalidEntry(`Los ${presentation.plural_name} se cargan en números enteros.`)
  } else {
    presentationCount = Number(trimmed)
    const baseText = ((presentationCount * presentationUnits(presentation)) / STOCK_SCALE).toFixed(3)
    evaluation = whole ? evaluateTargetStock(current, baseText, true) : evaluateDelta('stock', current, baseText, true)
  }
  evaluation = withPresentationFloor(evaluation, currentUnits, presentation, abbreviation)

  if (evaluation.state !== 'ready' || evaluation.delta === null || evaluation.result === null) {
    return { evaluation, request: null, change: '' }
  }

  const deltaText = (evaluation.delta / STOCK_SCALE).toFixed(3)
  if (!presentation) {
    return { evaluation, request: { delta: deltaText }, change: describeChange('stock', current, evaluation.delta) }
  }
  let request: StockEntryRequest = { delta: deltaText }
  let difference: string
  if (inPresentations && !whole && presentationCount !== null) {
    request = { delta: String(presentationCount), in_presentations: true, presentation_quantity: presentation.quantity }
    const count = Math.abs(presentationCount)
    difference = `${presentationCount < 0 ? '-' : '+'}${count} ${presentationLabel(presentation, count)}`
  } else {
    if (inPresentations) request = { delta: deltaText, presentation_quantity: presentation.quantity }
    const sign = evaluation.delta < 0 ? '-' : '+'
    difference = `${sign}${formatQuantity((Math.abs(evaluation.delta) / STOCK_SCALE).toFixed(3))}${abbreviation === '' ? '' : ` ${abbreviation}`}`
  }
  const change = `${formatUnits(currentUnits, presentation, abbreviation)} → ${formatUnits(evaluation.result, presentation, abbreviation)} (diferencia ${difference})`
  return { evaluation, request, change }
}

export interface MinimumEntry {
  valid: boolean
  units: number | null
  quantity: string | null
  presentationQuantity: string | undefined
  error: string | null
}

export function evaluateMinimumEntry(
  text: string,
  allowDecimals: boolean,
  presentation: Presentation | null | undefined,
  mode: StockEntryMode,
): MinimumEntry {
  const trimmed = text.trim()
  const empty: MinimumEntry = { valid: false, units: null, quantity: null, presentationQuantity: undefined, error: null }
  if (trimmed === '') return empty
  if (mode === 'presentation' && presentation) {
    if (!WHOLE_PATTERN.test(trimmed)) {
      return { ...empty, error: `Los ${presentation.plural_name} se cargan en números enteros.` }
    }
    return {
      valid: true,
      units: Number(trimmed) * presentationUnits(presentation),
      quantity: trimmed,
      presentationQuantity: presentation.quantity,
      error: null,
    }
  }
  const pattern = allowDecimals ? /^\d+\.?\d{0,3}$/ : /^\d+$/
  if (!pattern.test(trimmed)) {
    return { ...empty, error: allowDecimals ? 'Usá como máximo 3 decimales.' : 'Esta unidad no admite decimales.' }
  }
  return {
    valid: true,
    units: toUnits('stock', trimmed),
    quantity: Number(trimmed).toFixed(3),
    presentationQuantity: undefined,
    error: null,
  }
}

export function formatStockDifference(
  before: string,
  after: string,
  presentation: Presentation | null | undefined,
  abbreviation: string,
): string {
  const difference = toUnits('stock', after) - toUnits('stock', before)
  const magnitude = (Math.abs(difference) / STOCK_SCALE).toFixed(3)
  if (!presentation) return difference > 0 ? `+${formatQuantity(magnitude)}` : `-${formatQuantity(magnitude)}`
  return `${difference > 0 ? '+' : '-'}${formatStock(magnitude, presentation, abbreviation)}`
}
