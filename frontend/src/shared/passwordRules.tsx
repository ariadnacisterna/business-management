const PASSWORD_MIN_LENGTH = 4

const PASSWORD_CHECKS: { label: string; test: (password: string) => boolean }[] = [
  { label: `Al menos ${PASSWORD_MIN_LENGTH} caracteres`, test: (password) => password.length >= PASSWORD_MIN_LENGTH },
  { label: 'Una letra mayúscula', test: (password) => /[A-Z]/.test(password) },
  { label: 'Una letra minúscula', test: (password) => /[a-z]/.test(password) },
  { label: 'Un número', test: (password) => /\d/.test(password) },
]

export function isPasswordSecure(password: string): boolean {
  return PASSWORD_CHECKS.every((check) => check.test(password))
}

export function PasswordChecklist({ password }: { password: string }) {
  return (
    <ul className="m-0 flex list-none flex-col gap-1 p-0">
      {PASSWORD_CHECKS.map((check) => {
        const passed = check.test(password)
        return (
          <li
            key={check.label}
            className={`flex items-center gap-2 text-base font-medium ${passed ? 'text-success' : 'text-ink/50'}`}
          >
            <span aria-hidden="true">{passed ? '✓' : '○'}</span>
            <span className="sr-only">{passed ? 'Cumplido: ' : 'Falta: '}</span>
            {check.label}
          </li>
        )
      })}
    </ul>
  )
}
