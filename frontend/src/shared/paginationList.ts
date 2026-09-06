export type PageItem = number | 'ellipsis'

export function buildPageList(current: number, totalPages: number): PageItem[] {
  if (totalPages <= 10) {
    return Array.from({ length: totalPages }, (_, index) => index + 1)
  }

  const clampedCurrent = Math.max(1, Math.min(current, totalPages))
  const pages = new Set<number>([1, 2, totalPages - 1, totalPages])
  for (let page = clampedCurrent - 1; page <= clampedCurrent + 1; page += 1) {
    if (page >= 1 && page <= totalPages) pages.add(page)
  }

  const sorted = Array.from(pages).sort((a, b) => a - b)
  const result: PageItem[] = []
  let previous = 0
  for (const page of sorted) {
    if (previous !== 0 && page - previous > 1) result.push('ellipsis')
    result.push(page)
    previous = page
  }
  return result
}
