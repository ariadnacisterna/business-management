import { describe, expect, it } from 'vitest'
import type { Customer } from '../../api/types'
import { filterCustomers } from './customerSearch'

const CUSTOMERS = [
  { id: 1, name: 'Clara Ventas' },
  { id: 2, name: 'José Pérez' },
  { id: 3, name: 'Nora Nueva' },
] as Customer[]

describe('filterCustomers', () => {
  it('returns everyone for an empty search', () => {
    expect(filterCustomers(CUSTOMERS, '  ')).toHaveLength(3)
  })

  it('ignores case and accents', () => {
    expect(filterCustomers(CUSTOMERS, 'JOSE').map((customer) => customer.id)).toEqual([2])
    expect(filterCustomers(CUSTOMERS, 'perez').map((customer) => customer.id)).toEqual([2])
  })

  it('matches inside the name and returns nothing when nothing matches', () => {
    expect(filterCustomers(CUSTOMERS, 'nu').map((customer) => customer.id)).toEqual([3])
    expect(filterCustomers(CUSTOMERS, 'zzz')).toEqual([])
  })
})
