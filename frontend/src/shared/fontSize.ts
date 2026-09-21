export interface FontSizeStep {
  step: number
  label: string
  basePx: number
}

export const FONT_SIZE_STEPS: FontSizeStep[] = [
  { step: 1, label: 'Chica', basePx: 12 },
  { step: 2, label: 'Mediana', basePx: 14 },
  { step: 3, label: 'Grande', basePx: 16 },
  { step: 4, label: 'Muy grande', basePx: 18 },
  { step: 5, label: 'Enorme', basePx: 20 },
]

export const DEFAULT_FONT_SIZE = 2

const STORAGE_KEY = 'font_size'

function stepFor(step: number | null | undefined): FontSizeStep {
  return (
    FONT_SIZE_STEPS.find((candidate) => candidate.step === step) ??
    FONT_SIZE_STEPS[DEFAULT_FONT_SIZE - 1]
  )
}

export function applyFontSize(step: number | null | undefined): void {
  document.documentElement.style.fontSize = `${stepFor(step).basePx}px`
}

export function readCachedFontSize(): number | null {
  try {
    const stored = Number(window.localStorage.getItem(STORAGE_KEY))
    return FONT_SIZE_STEPS.some((candidate) => candidate.step === stored) ? stored : null
  } catch {
    return null
  }
}

export function cacheFontSize(step: number): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, String(step))
  } catch {
    return
  }
}

export function applyCachedFontSize(): void {
  applyFontSize(readCachedFontSize() ?? DEFAULT_FONT_SIZE)
}
