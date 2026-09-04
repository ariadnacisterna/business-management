import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { InvalidCredentialsError } from '../../api/auth'
import { Brand } from '../../shared/Brand'
import { useAuth } from './AuthContext'
import styles from './LoginPage.module.css'

export function LoginPage() {
  const { account, status, login } = useAuth()
  const [userName, setUserName] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (status === 'ready' && account !== null) {
    return <Navigate to="/" replace />
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await login(userName, password)
    } catch (submitError) {
      setError(
        submitError instanceof InvalidCredentialsError
          ? 'Usuario o contraseña incorrectos.'
          : 'No se pudo iniciar sesión. Intentá de nuevo.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className={styles.page}>
      <div className={styles.brandWrapper}>
        <Brand tagline="Desde 1982" large />
      </div>

      <form className={styles.form} onSubmit={handleSubmit}>
        <h1>Iniciar sesión</h1>

        <label htmlFor="user_name">Usuario</label>
        <input
          id="user_name"
          name="user_name"
          autoComplete="username"
          value={userName}
          onChange={(event) => setUserName(event.target.value)}
          required
        />

        <label htmlFor="password">Contraseña</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />

        {error !== null && (
          <p role="alert" className={styles.error}>
            {error}
          </p>
        )}

        <button type="submit" disabled={submitting}>
          {submitting ? 'Ingresando…' : 'Ingresar'}
        </button>
      </form>
    </main>
  )
}
