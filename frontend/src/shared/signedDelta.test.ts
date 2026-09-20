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

describe('evaluateDelta for stock', () => {
  it('adds a positive amount, with or without the plus sign', () => {
    expect(evaluateDelta('stock', 50, '5')).toMatchObject({ state: 'ready', delta: 5, result: 55 })
    expect(evaluateDelta('stock', 50, '+5')).toMatchObject({ state: 'ready', delta: 5, result: 55 })
  })

  it('subtracts a negative amount', () => {
    expect(evaluateDelta('stock', 50, '-20')).toMatchObject({ state: 'ready', delta: -20, result: 30 })
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

  it('rejects decimals', () => {
    expect(evaluateDelta('stock', 50, '1.5').state).toBe('invalid')
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
    expect(evaluateTargetStock(50, '42')).toMatchObject({ state: 'ready', delta: -8, result: 42 })
    expect(evaluateTargetStock(50, '0')).toMatchObject({ state: 'ready', delta: -50, result: 0 })
  })

  it('rejects the same quantity and non-integers', () => {
    expect(evaluateTargetStock(50, '50')).toMatchObject({ error: 'La cantidad nueva es igual a la actual.' })
    expect(evaluateTargetStock(50, '1.5').state).toBe('invalid')
    expect(evaluateTargetStock(50, '').state).toBe('empty')
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
  it('formats the signed difference and the transition', () => {
    expect(formatSignedDelta('stock', -50)).toBe('-50')
    expect(formatSignedDelta('stock', 5)).toBe('+5')
    expect(describeChange('stock', 50, 5)).toBe('50 → 55 (diferencia +5)')
    expect(describeChange('price', '1000.00', 50000)).toMatch(/^\$\s1\.000,00 → \$\s1\.500,00 \(diferencia \+\$\s500,00\)$/)
  })

  it('sends prices with two decimals and stock as an integer', () => {
    expect(deltaToApi('price', -20050)).toBe('-200.50')
    expect(deltaToApi('stock', -3)).toBe(-3)
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
