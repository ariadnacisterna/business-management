import { describe, expect, it } from 'vitest'
import {
  discountProblem,
  exceedsStock,
  lineTotalCents,
  quantityProblem,
  sanitizeQuantity,
  startOfDayIso,
  startOfNextDayIso,
} from './saleMath'

describe('saleMath', () => {
  it('keeps only digits for whole units and one decimal point for fractional ones', () => {
    expect(sanitizeQuantity('1,5', false)).toBe('15')
    expect(sanitizeQuantity('1,5', true)).toBe('1.5')
    expect(sanitizeQuantity('2.5.1', true)).toBe('2.51')
  })

  it('explains what is wrong with a quantity', () => {
    expect(quantityProblem('', false)).toBe('Escribí la cantidad.')
    expect(quantityProblem('0', false)).toBe('La cantidad tiene que ser mayor que cero.')
    expect(quantityProblem('1.5', false)).toBe('Esta unidad no admite decimales.')
    expect(quantityProblem('1.2345', true)).toBe('Usá como máximo 3 decimales.')
    expect(quantityProblem('1.234', true)).toBeNull()
  })

  it('rounds the line total to cents', () => {
    expect(lineTotalCents('1.5', '33.33')).toBe(5000)
    expect(lineTotalCents('3', '80')).toBe(24000)
    expect(lineTotalCents('', '80')).toBe(0)
  })

  it('does not accept a discount larger than the total', () => {
    expect(discountProblem('', 1000)).toBeNull()
    expect(discountProblem('10', 1000)).toBeNull()
    expect(discountProblem('10.01', 1000)).toBe('El descuento no puede ser mayor que el total.')
  })

  it('warns when the quantity is more than the stock', () => {
    expect(exceedsStock('5', '2.000')).toBe(true)
    expect(exceedsStock('2', '2.000')).toBe(false)
  })

  it('turns a day into the range of local instants it covers', () => {
    const start = new Date(startOfDayIso('2026-10-23'))
    const end = new Date(startOfNextDayIso('2026-10-23'))
    expect(start.getDate()).toBe(23)
    expect(start.getHours()).toBe(0)
    expect(end.getDate()).toBe(24)
    expect(end.getHours()).toBe(0)
  })
})
