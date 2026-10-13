import { describe, expect, it } from 'vitest'
import {
  evaluateMinimumEntry,
  evaluateStockEntry,
  formatStock,
  formatStockDifference,
  suggestPluralName,
} from './presentation'
import { draftToPresentation, presentationDraftError, samePresentation } from './presentationDraft'

const ROLL = { name: 'rollo', plural_name: 'rollos', quantity: '50.000' }

describe('formatStock', () => {
  it.each([
    ['138.000', '2 rollos y 38 m'],
    ['150.000', '3 rollos'],
    ['50.000', '1 rollo'],
    ['38.000', '38 m'],
    ['88.500', '1 rollo y 38.5 m'],
    ['0.000', '0 rollos'],
  ])('shows %s as %s', (quantity, expected) => {
    expect(formatStock(quantity, ROLL, 'm')).toBe(expected)
  })

  it('keeps the plain quantity without a presentation', () => {
    expect(formatStock('12.500', null, 'm')).toBe('12.5 m')
    expect(formatStock('12.500', null, '')).toBe('12.5')
  })
})

describe('suggestPluralName', () => {
  it.each([
    ['rollo', 'rollos'],
    ['caja', 'cajas'],
    ['pack', 'packs'],
    ['carretel', 'carreteles'],
    ['cartón', 'cartones'],
    ['', ''],
  ])('suggests the plural of %s', (name, plural) => {
    expect(suggestPluralName(name)).toBe(plural)
  })
})

describe('evaluateStockEntry', () => {
  const base = { current: '88.000', allowDecimals: true, presentation: ROLL, abbreviation: 'm', whole: false }

  it('adds whole presentations and asks the server to convert them', () => {
    const entry = evaluateStockEntry({ ...base, text: '+2', mode: 'presentation' })

    expect(entry.request).toEqual({ delta: '2', in_presentations: true, presentation_quantity: '50.000' })
    expect(entry.evaluation.result).toBe(188000)
    expect(entry.change).toBe('1 rollo y 38 m → 3 rollos y 38 m (diferencia +2 rollos)')
  })

  it('subtracts loose units', () => {
    const entry = evaluateStockEntry({ ...base, text: '-12', mode: 'unit' })

    expect(entry.request).toEqual({ delta: '-12.000' })
    expect(entry.change).toBe('1 rollo y 38 m → 1 rollo y 26 m (diferencia -12 m)')
  })

  it('rejects fractions of a presentation', () => {
    const entry = evaluateStockEntry({ ...base, text: '1.5', mode: 'presentation' })

    expect(entry.evaluation.error).toBe('Los rollos se cargan en números enteros.')
    expect(entry.request).toBeNull()
  })

  it('shows the floor in presentations and loose units', () => {
    const entry = evaluateStockEntry({ ...base, text: '-2', mode: 'presentation' })

    expect(entry.evaluation.error).toBe('No podés descontar más de lo que hay (1 rollo y 38 m)')
  })

  it('sets the whole quantity in presentations as a difference in the product unit', () => {
    const entry = evaluateStockEntry({ ...base, text: '3', mode: 'presentation', whole: true })

    expect(entry.request).toEqual({ delta: '62.000', presentation_quantity: '50.000' })
  })

  it('works as before without a presentation', () => {
    const entry = evaluateStockEntry({ ...base, presentation: null, text: '5', mode: 'presentation' })

    expect(entry.request).toEqual({ delta: '5.000' })
    expect(entry.change).toBe('88 → 93 (diferencia +5)')
  })
})

describe('evaluateMinimumEntry', () => {
  it('converts presentations on the server', () => {
    expect(evaluateMinimumEntry('2', true, ROLL, 'presentation')).toMatchObject({
      valid: true,
      units: 100000,
      quantity: '2',
      presentationQuantity: '50.000',
    })
  })

  it('accepts loose units with the unit decimals', () => {
    expect(evaluateMinimumEntry('12.5', true, ROLL, 'unit')).toMatchObject({ valid: true, quantity: '12.500' })
    expect(evaluateMinimumEntry('1.5', true, ROLL, 'presentation').error).toBe('Los rollos se cargan en números enteros.')
  })
})

describe('formatStockDifference', () => {
  it('shows the movement in presentations', () => {
    expect(formatStockDifference('0.000', '100.000', ROLL, 'm')).toBe('+2 rollos')
    expect(formatStockDifference('100.000', '88.000', ROLL, 'm')).toBe('-12 m')
    expect(formatStockDifference('100.000', '88.000', null, '')).toBe('-12')
  })
})

describe('presentation drafts', () => {
  const draft = { enabled: true, name: 'rollo', pluralName: 'rollos', pluralEdited: false, quantity: '50' }

  it('validates the quantity against the unit', () => {
    expect(presentationDraftError(draft, false)).toBeNull()
    expect(presentationDraftError({ ...draft, quantity: '2.5' }, false)).toBe('Esta unidad no admite decimales.')
    expect(presentationDraftError({ ...draft, quantity: '0' }, true)).toBe(
      'La cantidad de la presentación tiene que ser mayor que cero.',
    )
    expect(presentationDraftError({ ...draft, pluralName: ' ' }, true)).toBe(
      'Escribí el nombre de la presentación en singular y en plural.',
    )
  })

  it('compares presentations by value', () => {
    expect(samePresentation(ROLL, draftToPresentation(draft))).toBe(true)
    expect(samePresentation(ROLL, null)).toBe(false)
    expect(samePresentation(null, undefined)).toBe(true)
  })
})
