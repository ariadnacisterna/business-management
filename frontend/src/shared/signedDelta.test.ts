import { describe, expect, it } from 'vitest'
import {
  deltaToApi,
  describeChange,
  evaluateDelta,
  evaluateForAll,
  evaluateTargetPrice,
  evaluateTargetStock,
  formatSignedDelta,
  sanitizeSignedDelta,
} from './signedDelta'

describe('evaluateDelta for stock (unit without fraction)', () => {
  it('adds a positive amount, with or without the plus sign', () => {
    expect(evaluateDelta('stock', 50, '5')).toMatchObject({ state: 'ready', delta: 5000, result: 55000 })
    expect(evaluateDelta('stock', 50, '+5')).toMatchObject({ state: 'ready', delta: 5000, result: 55000 })
  })

  it('subtracts a negative amount', () => {
    expect(evaluateDelta('stock', 50, '-20')).toMatchObject({ state: 'ready', delta: -20000, result: 30000 })
  })

  it('accepts leaving the stock exactly at zero', () => {
    expect(evaluateDelta('stock', 50, '-50')).toMatchObject({ state: 'ready', result: 0 })
  })

  it('rejects taking out more than there is, naming the current stock', () => {
    expect(evaluateDelta('stock', 50, '-52')).toMatchObject({
      state: 'invalid',
      error: 'No podés descontar más de lo que hay (50)',
    })
  })

  it('rejects a zero adjustment', () => {
    expect(evaluateDelta('stock', 50, '0')).toMatchObject({ state: 'invalid', error: 'El ajuste no puede ser cero.' })
  })

  it('treats an empty field or a lone sign as not filled in yet', () => {
    expect(evaluateDelta('stock', 50, '').state).toBe('empty')
    expect(evaluateDelta('stock', 50, '-').state).toBe('empty')
  })

  it('rejects decimals when the unit does not allow them', () => {
    expect(evaluateDelta('stock', 50, '1.5').state).toBe('invalid')
    expect(evaluateDelta('stock', 50, '1.5').error).toBe('Ingresá un número entero.')
  })
})

describe('evaluateDelta for stock (unit with fraction)', () => {
  it('accepts up to three decimals', () => {
    expect(evaluateDelta('stock', '2.5', '0.750', true)).toMatchObject({
      state: 'ready',
      delta: 750,
      result: 3250,
    })
  })

  it('rejects more than three decimals', () => {
    expect(evaluateDelta('stock', 50, '2.5001', true)).toMatchObject({
      state: 'invalid',
      error: 'Usá como máximo 3 decimales.',
    })
  })

  it('rejects taking out more than there is, naming the current stock without trailing zeros', () => {
    expect(evaluateDelta('stock', '2.5', '-3', true)).toMatchObject({
      state: 'invalid',
      error: 'No podés descontar más de lo que hay (2.5)',
    })
  })

  it('accepts leaving the stock exactly at zero', () => {
    expect(evaluateDelta('stock', '2.5', '-2.5', true)).toMatchObject({ state: 'ready', result: 0 })
  })
})

describe('evaluateDelta for price', () => {
  it('adds and subtracts amounts with decimals', () => {
    expect(evaluateDelta('price', '1000.00', '+500')).toMatchObject({ state: 'ready', delta: 50000, result: 150000 })
    expect(evaluateDelta('price', '1000.00', '-200.50')).toMatchObject({ state: 'ready', result: 79950 })
  })

  it('rejects a result of zero or less', () => {
    expect(evaluateDelta('price', '1000.00', '-1000')).toMatchObject({
      state: 'invalid',
      error: 'El precio no puede quedar en cero o menos',
    })
    expect(evaluateDelta('price', '1000.00', '-1500').state).toBe('invalid')
  })

  it('accepts the smallest positive result', () => {
    expect(evaluateDelta('price', '1000.00', '-999.99')).toMatchObject({ state: 'ready', result: 1 })
  })

  it('rejects more than two decimals and a zero difference', () => {
    expect(evaluateDelta('price', '10.00', '1.005')).toMatchObject({
      state: 'invalid',
      error: 'Usá como máximo 2 decimales.',
    })
    expect(evaluateDelta('price', '10.00', '0').state).toBe('invalid')
  })
})

describe('evaluateTargetStock', () => {
  it('turns a final quantity into the difference from the current one', () => {
    expect(evaluateTargetStock(50, '42')).toMatchObject({ state: 'ready', delta: -8000, result: 42000 })
    expect(evaluateTargetStock(50, '0')).toMatchObject({ state: 'ready', delta: -50000, result: 0 })
  })

  it('rejects the same quantity and, without allowDecimals, non-integers', () => {
    expect(evaluateTargetStock(50, '50')).toMatchObject({ error: 'La cantidad nueva es igual a la actual.' })
    expect(evaluateTargetStock(50, '1.5').state).toBe('invalid')
    expect(evaluateTargetStock(50, '').state).toBe('empty')
  })

  it('accepts decimals when the unit allows them', () => {
    expect(evaluateTargetStock('2.5', '3.250', true)).toMatchObject({ state: 'ready', delta: 750, result: 3250 })
    expect(evaluateTargetStock(50, '1.5001', true).state).toBe('invalid')
  })
})

describe('evaluateTargetPrice', () => {
  it('turns a final price into the difference from the current one', () => {
    expect(evaluateTargetPrice('150.00', '200')).toMatchObject({ state: 'ready', delta: 5000, result: 20000 })
    expect(evaluateTargetPrice('150.00', '100.50')).toMatchObject({ state: 'ready', delta: -4950 })
  })

  it('rejects zero, the same price and more than two decimals', () => {
    expect(evaluateTargetPrice('150.00', '0').state).toBe('invalid')
    expect(evaluateTargetPrice('150.00', '150')).toMatchObject({ error: 'El precio nuevo es igual al actual.' })
    expect(evaluateTargetPrice('150.00', '1.005').state).toBe('invalid')
    expect(evaluateTargetPrice('150.00', '').state).toBe('empty')
  })
})

describe('evaluateForAll', () => {
  it('names the variants that would break the floor', () => {
    const result = evaluateForAll(
      [
        { label: 'Chico', current: '10.00' },
        { label: 'Grande', current: '100.00' },
      ],
      '-50',
    )
    expect(result.ready).toBe(false)
    expect(result.error).toBe('El precio no puede quedar en cero o menos en: Chico')
  })

  it('is ready with the shared delta when every variant stays above zero', () => {
    const result = evaluateForAll(
      [
        { label: 'Chico', current: '10.00' },
        { label: 'Grande', current: '20.00' },
      ],
      '5',
    )
    expect(result).toMatchObject({ ready: true, error: null, delta: 500 })
  })

  it('is not ready when no variant has a price', () => {
    expect(evaluateForAll([], '5').ready).toBe(false)
  })
})

describe('formatting helpers', () => {
  it('formats the signed difference and the transition, trimming stock decimals', () => {
    expect(formatSignedDelta('stock', -50000)).toBe('-50')
    expect(formatSignedDelta('stock', 5000)).toBe('+5')
    expect(formatSignedDelta('stock', 2500)).toBe('+2.5')
    expect(describeChange('stock', 50, 5000)).toBe('50 → 55 (diferencia +5)')
    expect(describeChange('price', '1000.00', 50000)).toMatch(/^\$\s1\.000,00 → \$\s1\.500,00 \(diferencia \+\$\s500,00\)$/)
  })

  it('sends prices with two decimals and stock with three, trimmed by the server side only', () => {
    expect(deltaToApi('price', -20050)).toBe('-200.50')
    expect(deltaToApi('stock', -3000)).toBe('-3.000')
    expect(deltaToApi('stock', 2500)).toBe('2.500')
  })
})

describe('sanitizeSignedDelta', () => {
  it('keeps a leading sign and turns the comma into a point', () => {
    expect(sanitizeSignedDelta('-1,5', true)).toBe('-1.5')
    expect(sanitizeSignedDelta('+20', false)).toBe('+20')
    expect(sanitizeSignedDelta('5-3', false)).toBe('53')
    expect(sanitizeSignedDelta('−30', false)).toBe('-30')
  })
})
