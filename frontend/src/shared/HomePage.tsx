import { useAuth } from '../features/access/AuthContext'

export function HomePage() {
  const { account } = useAuth()

  return (
    <section>
      <h1>Bienvenido{account !== null ? `, ${account.name}` : ''}</h1>
      <p>Sesión iniciada correctamente.</p>
    </section>
  )
}
