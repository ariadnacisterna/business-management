import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { InvalidCredentialsError } from '../../api/auth'
import { Brand } from '../../shared/Brand'
import { useToast } from '../../shared/Toast'
import { useAuth } from './AuthContext'
import { LoginHelpDialog } from './LoginHelpDialog'

export function LoginPage() {
  const { account, status, login } = useAuth()
  const { showError } = useToast()
  const [userName, setUserName] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [showHelp, setShowHelp] = useState(false)

  if (status === 'ready' && account !== null) {
    return <Navigate to="/" replace />
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    try {
      await login(userName, password)
    } catch (submitError) {
      showError(
        submitError instanceof InvalidCredentialsError
          ? 'Usuario o contraseña incorrectos.'
          : 'No se pudo iniciar sesión. Intentá de nuevo.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="flex min-h-svh flex-col items-center justify-center bg-surface-brand px-4">
      <div className="mb-8 flex flex-col items-center">
        <Brand large />
      </div>

      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm space-y-5 rounded-2xl border border-line bg-surface p-8 shadow-sm"
      >
        <h1 className="sr-only">Iniciar sesión</h1>

        <div>
          <label
            htmlFor="user_name"
            className="mb-1.5 block text-xs font-semibold uppercase tracking-wider opacity-70"
          >
            Usuario
          </label>
          <input
            id="user_name"
            name="user_name"
            autoComplete="username"
            placeholder="juan.gomez"
            value={userName}
            onChange={(event) => setUserName(event.target.value)}
            required
            className="h-11 w-full rounded-lg border border-line px-3.5 text-base transition-colors focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/10"
          />
        </div>

        <div>
          <label
            htmlFor="password"
            className="mb-1.5 block text-xs font-semibold uppercase tracking-wider opacity-70"
          >
            Contraseña
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            className="h-11 w-full rounded-lg border border-line px-3.5 text-base transition-colors focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/10"
          />
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="mt-4 h-12 w-full rounded-lg bg-brand text-sm font-bold tracking-wide text-brand-contrast transition-colors hover:bg-brand/90 disabled:opacity-60"
        >
          {submitting ? 'Ingresando…' : 'Iniciar Sesión'}
        </button>
      </form>

      <button
        type="button"
        onClick={() => setShowHelp(true)}
        className="mt-4 text-sm text-ink/60 hover:text-brand hover:underline"
      >
        ¿Problemas para acceder?
      </button>

      {showHelp && <LoginHelpDialog onClose={() => setShowHelp(false)} />}
    </main>
  )
}
