import { describe, expect, it } from 'vitest'
import { buildPageList } from './paginationList'

describe('buildPageList', () => {
  it('returns every page when there are 10 or fewer', () => {
    expect(buildPageList(1, 10)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    expect(buildPageList(3, 5)).toEqual([1, 2, 3, 4, 5])
  })

  it('always keeps pages 1 and 2 visible when compressing', () => {
    const result = buildPageList(20, 30)
    expect(result[0]).toBe(1)
    expect(result[1]).toBe(2)
  })

  it('shows the current page and its neighbors', () => {
    const result = buildPageList(15, 30)
    expect(result).toContain(14)
    expect(result).toContain(15)
    expect(result).toContain(16)
  })

  it('always keeps the last page visible', () => {
    const result = buildPageList(15, 30)
    expect(result.at(-1)).toBe(30)
  })

  it('inserts ellipsis markers for gaps', () => {
    const result = buildPageList(15, 30)
    expect(result.filter((item) => item === 'ellipsis').length).toBeGreaterThan(0)
  })

  it('does not duplicate pages when the current page is near the edges', () => {
    const result = buildPageList(2, 30)
    expect(result.filter((page) => page === 2).length).toBe(1)
  })
})
