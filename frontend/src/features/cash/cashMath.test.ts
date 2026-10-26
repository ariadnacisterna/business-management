import { describe, expect, it } from 'vitest'
import { differenceText, moneyProblem } from './cashMath'

describe('moneyProblem', () => {
  it('asks for an amount when empty', () => {
    expect(moneyProblem('', true)).toBe('Escribí el importe.')
  })

  it('rejects more than two decimals', () => {
    expect(moneyProblem('10.123', true)).toBe('Usá como máximo 2 decimales.')
  })

  it('accepts zero only when allowed', () => {
    expect(moneyProblem('0', true)).toBeNull()
    expect(moneyProblem('0', false)).toBe('El importe tiene que ser mayor que cero.')
  })

  it('accepts a normal amount', () => {
    expect(moneyProblem('1500.50', false)).toBeNull()
  })
})

describe('differenceText', () => {
  it('describes surplus, shortage and no difference', () => {
    expect(differenceText('10.00')).toContain('Sobran')
    expect(differenceText('-10.00')).toContain('Faltan')
    expect(differenceText('0.00')).toBe('Sin diferencia')
    expect(differenceText(null)).toBe('')
  })
})
