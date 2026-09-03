import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'

const ACCOUNT = {
  id: 1,
  name: 'Ada Lovelace',
  user_name: 'ada',
  status: 'activo',
  role: 'Administrador',
  active_business_id: 1,
  businesses: [{ id: 1, name: 'Negocio principal', industry: 'General' }],
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function noContentResponse(): Response {
  return new Response(null, { status: 204 })
}

function renderApp() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <App />
    </MemoryRouter>,
  )
}

describe('App', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })

  it('redirects to the login screen when there is no valid session', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ detail: 'Sesion invalida' }, 401))

    renderApp()

    expect(await screen.findByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument()
  })

  it('shows the app layout after a successful login', async () => {
    const user = userEvent.setup()
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ detail: 'Sesion invalida' }, 401))
      .mockResolvedValueOnce(jsonResponse(ACCOUNT))

    renderApp()

    await screen.findByRole('heading', { name: 'Iniciar sesión' })
    await user.type(screen.getByLabelText('Usuario'), 'ada')
    await user.type(screen.getByLabelText('Contraseña'), 'secreta')
    await user.click(screen.getByRole('button', { name: 'Ingresar' }))

    expect(await screen.findByText('Ada Lovelace')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cerrar sesión' })).toBeInTheDocument()
  })

  it('shows an error message when the credentials are invalid', async () => {
    const user = userEvent.setup()
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ detail: 'Sesion invalida' }, 401))
      .mockResolvedValueOnce(jsonResponse({ detail: 'Usuario o contrasena incorrectos' }, 401))

    renderApp()

    await screen.findByRole('heading', { name: 'Iniciar sesión' })
    await user.type(screen.getByLabelText('Usuario'), 'ada')
    await user.type(screen.getByLabelText('Contraseña'), 'mala')
    await user.click(screen.getByRole('button', { name: 'Ingresar' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Usuario o contraseña incorrectos.',
    )
  })

  it('returns to the login screen after logging out', async () => {
    const user = userEvent.setup()
    fetchMock.mockResolvedValueOnce(jsonResponse(ACCOUNT)).mockResolvedValueOnce(noContentResponse())

    renderApp()

    await screen.findByText('Ada Lovelace')
    await user.click(screen.getByRole('button', { name: 'Cerrar sesión' }))

    expect(await screen.findByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument()
  })
})
