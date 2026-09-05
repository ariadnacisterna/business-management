import { useEffect } from 'react'
import { useAuth } from '../../features/access/AuthContext'

const PHRASES_BY_GREETING: Record<'Buen día' | 'Buenas tardes' | 'Buenas noches', string> = {
  'Buen día': 'Que tengas una jornada productiva.',
  'Buenas tardes': 'Esperamos que el día venga yendo bien.',
  'Buenas noches': 'Gracias por seguir trabajando a esta hora.',
}

function currentGreeting(): 'Buen día' | 'Buenas tardes' | 'Buenas noches' {
  const hour = new Date().getHours()
  if (hour >= 6 && hour < 12) return 'Buen día'
  if (hour >= 12 && hour < 20) return 'Buenas tardes'
  return 'Buenas noches'
}

const AUTO_CLOSE_MS = 5000

export function WelcomeModal() {
  const { account, justLoggedIn, acknowledgeLogin } = useAuth()

  useEffect(() => {
    if (!justLoggedIn) return
    const timer = setTimeout(acknowledgeLogin, AUTO_CLOSE_MS)
    return () => clearTimeout(timer)
  }, [justLoggedIn, acknowledgeLogin])

  if (!justLoggedIn || account === null) {
    return null
  }

  const greeting = currentGreeting()
  const firstName = account.name.split(' ')[0]

  return (
    <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink/20 backdrop-blur-sm" aria-hidden="true" />

      <div
        role="alertdialog"
        aria-label="Bienvenida"
        className="pointer-events-auto relative flex w-full max-w-sm flex-col items-center gap-3 rounded-2xl bg-surface p-8 text-center shadow-2xl"
      >
        <h2 className="text-3xl font-bold">
          {greeting}, {firstName}
        </h2>
        <p className="text-xl opacity-70">{PHRASES_BY_GREETING[greeting]}</p>

        <button
          type="button"
          onClick={acknowledgeLogin}
          className="mt-2 h-12 w-full rounded-lg bg-brand text-sm font-bold tracking-wide text-brand-contrast transition-colors hover:bg-brand/90"
        >
          Cerrar
        </button>
      </div>
    </div>
  )
}
