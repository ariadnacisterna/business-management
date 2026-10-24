import { formatMoney } from './formatPrice'

export function formatAmount(amount: string | number): string {
  return formatMoney(amount)
}
