const COMBINING_DIACRITICS_START = 0x0300
const COMBINING_DIACRITICS_END = 0x036f

function isCombiningDiacritic(charCode: number): boolean {
  return charCode >= COMBINING_DIACRITICS_START && charCode <= COMBINING_DIACRITICS_END
}

export function normalizeForComparison(text: string): string {
  const decomposed = text.trim().normalize('NFKD')
  let result = ''
  for (const char of decomposed) {
    if (!isCombiningDiacritic(char.codePointAt(0) ?? 0)) {
      result += char
    }
  }
  return result.toLowerCase()
}
