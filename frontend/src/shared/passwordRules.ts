const PASSWORD_MIN_LENGTH = 4

export const PASSWORD_CHECKS: { label: string; test: (password: string) => boolean }[] = [
  { label: `Al menos ${PASSWORD_MIN_LENGTH} caracteres`, test: (password) => password.length >= PASSWORD_MIN_LENGTH },
  { label: 'Una letra mayúscula', test: (password) => /[A-Z]/.test(password) },
  { label: 'Una letra minúscula', test: (password) => /[a-z]/.test(password) },
  { label: 'Un número', test: (password) => /\d/.test(password) },
]

export function isPasswordSecure(password: string): boolean {
  return PASSWORD_CHECKS.every((check) => check.test(password))
}
