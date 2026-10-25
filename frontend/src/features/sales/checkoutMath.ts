import type { PaymentMethod } from '../../api/types'
import { amountCents } from './saleMath'

const AMOUNT_PATTERN = /^\d+(\.\d{1,2})?$/

export type PaymentMode = 'single' | 'split'

export type SplitAmounts = Record<PaymentMethod, string>

export interface PaymentPart {
  method: PaymentMethod
  cents: number
}

export interface PaymentPlan {
  parts: PaymentPart[]
  assignedCents: number
  remainingCents: number
  problem: string | null
}

export const EMPTY_SPLIT: SplitAmounts = { efectivo: '', transferencia: '', fiado: '' }

export function splitAmountProblem(amount: string): string | null {
  if (amount.trim() === '') return null
  if (!AMOUNT_PATTERN.test(amount)) return 'Usá como máximo 2 decimales.'
  return null
}

export function paymentPlan(
  mode: PaymentMode,
  singleMethod: PaymentMethod,
  split: SplitAmounts,
  totalCents: number,
  methods: PaymentMethod[],
): PaymentPlan {
  if (mode === 'single') {
    const problem =
      singleMethod === 'fiado' && totalCents === 0
        ? 'Una venta en fiado tiene que tener un importe mayor que cero.'
        : null
    return { parts: [{ method: singleMethod, cents: totalCents }], assignedCents: totalCents, remainingCents: 0, problem }
  }
  const formatProblem = methods.map((method) => splitAmountProblem(split[method])).find((problem) => problem !== null)
  const parts = methods
    .map((method) => ({ method, cents: amountCents(split[method]) }))
    .filter((part) => part.cents > 0)
  const assignedCents = parts.reduce((sum, part) => sum + part.cents, 0)
  const remainingCents = totalCents - assignedCents
  let problem: string | null = formatProblem ?? null
  if (problem === null && parts.length === 0) problem = 'Escribí cuánto se paga con cada forma de pago.'
  if (problem === null && remainingCents > 0) problem = 'Todavía falta asignar parte del total.'
  if (problem === null && remainingCents < 0) problem = 'Las formas de pago suman más que el total.'
  return { parts, assignedCents, remainingCents, problem }
}

export function cashCents(plan: PaymentPlan): number {
  return plan.parts.find((part) => part.method === 'efectivo')?.cents ?? 0
}

export function includesFiado(plan: PaymentPlan): boolean {
  return plan.parts.some((part) => part.method === 'fiado')
}

export function changeCents(paidWith: string, cash: number): number | null {
  if (paidWith.trim() === '' || !AMOUNT_PATTERN.test(paidWith)) return null
  return amountCents(paidWith) - cash
}
