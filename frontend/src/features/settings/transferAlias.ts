export const TRANSFER_ALIAS_MAX_LENGTH = 50

export function transferAliasProblem(value: string): string | null {
  const alias = value.trim()
  if (/\s/.test(alias)) return 'El alias no puede tener espacios.'
  if (alias.length > TRANSFER_ALIAS_MAX_LENGTH) return `El alias puede tener hasta ${TRANSFER_ALIAS_MAX_LENGTH} caracteres.`
  return null
}
