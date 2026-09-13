import { describe, expect, it } from 'vitest'
import { formatDateTime } from './formatDateTime'

describe('formatDateTime', () => {
  it('formats date and time in 24-hour format without seconds', () => {
    expect(formatDateTime('2026-09-12T18:03:39Z')).toBe('12/9/2026, 15:03')
  })
})
