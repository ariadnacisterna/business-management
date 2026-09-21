import { PASSWORD_CHECKS } from './passwordRules'

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
