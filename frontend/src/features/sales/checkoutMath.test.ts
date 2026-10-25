import { describe, expect, it } from 'vitest'
import { cashCents, changeCents, EMPTY_SPLIT, includesFiado, paymentPlan } from './checkoutMath'
import { PAYMENT_METHODS } from './saleMath'

describe('paymentPlan', () => {
  it('uses the whole total for a single payment method', () => {
    const plan = paymentPlan('single', 'transferencia', EMPTY_SPLIT, 90000, PAYMENT_METHODS)

    expect(plan.parts).toEqual([{ method: 'transferencia', cents: 90000 }])
    expect(plan.problem).toBeNull()
    expect(cashCents(plan)).toBe(0)
  })

  it('rejects a single fiado payment for a zero total', () => {
    expect(paymentPlan('single', 'fiado', EMPTY_SPLIT, 0, PAYMENT_METHODS).problem).not.toBeNull()
  })

  it('keeps only the methods with an amount and reports what is left to assign', () => {
    const split = { ...EMPTY_SPLIT, efectivo: '200', fiado: '150.50' }
    const plan = paymentPlan('split', 'efectivo', split, 50000, PAYMENT_METHODS)

    expect(plan.parts).toEqual([
      { method: 'efectivo', cents: 20000 },
      { method: 'fiado', cents: 15050 },
    ])
    expect(plan.remainingCents).toBe(14950)
    expect(plan.problem).toBe('Todavía falta asignar parte del total.')
    expect(includesFiado(plan)).toBe(true)
  })

  it('accepts parts that add up exactly and rejects going over or bad decimals', () => {
    const exact = paymentPlan('split', 'efectivo', { ...EMPTY_SPLIT, efectivo: '600', transferencia: '400' }, 100000, PAYMENT_METHODS)
    const over = paymentPlan('split', 'efectivo', { ...EMPTY_SPLIT, efectivo: '1000.01' }, 100000, PAYMENT_METHODS)
    const decimals = paymentPlan('split', 'efectivo', { ...EMPTY_SPLIT, efectivo: '1.234' }, 100000, PAYMENT_METHODS)
    const empty = paymentPlan('split', 'efectivo', EMPTY_SPLIT, 100000, PAYMENT_METHODS)

    expect(exact.problem).toBeNull()
    expect(exact.remainingCents).toBe(0)
    expect(over.problem).toBe('Las formas de pago suman más que el total.')
    expect(decimals.problem).toBe('Usá como máximo 2 decimales.')
    expect(empty.problem).not.toBeNull()
  })
})

describe('changeCents', () => {
  it('calculates the change for the cash part', () => {
    expect(changeCents('1000', 60000)).toBe(40000)
    expect(changeCents('500', 60000)).toBe(-10000)
    expect(changeCents('', 60000)).toBeNull()
  })
})
