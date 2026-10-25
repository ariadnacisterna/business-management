import type { Customer } from '../../api/types'
import { normalizeForComparison } from '../../shared/normalizeForComparison'

export function filterCustomers(customers: Customer[], query: string): Customer[] {
  const needle = normalizeForComparison(query)
  if (needle === '') return customers
  return customers.filter((customer) => normalizeForComparison(customer.name).includes(needle))
}
