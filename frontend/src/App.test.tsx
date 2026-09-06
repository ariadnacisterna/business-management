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

const ADMIN_TWO_BUSINESS_ACCOUNT = {
  id: 2,
  name: 'Diaco',
  user_name: 'diaco',
  status: 'activo',
  role: 'Administrador',
  active_business_id: 1,
  businesses: [
    { id: 1, name: 'Mercería', industry: 'Mercería' },
    { id: 2, name: 'Despensa', industry: 'Despensa' },
  ],
}

const GERENTE_TWO_BUSINESS_ACCOUNT = {
  ...ADMIN_TWO_BUSINESS_ACCOUNT,
  id: 3,
  user_name: 'gerenta',
  role: 'Gerente',
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
      .mockResolvedValueOnce(jsonResponse([]))

    renderApp()

    await screen.findByRole('heading', { name: 'Iniciar sesión' })
    await user.type(screen.getByLabelText('Usuario'), 'ada')
    await user.type(screen.getByLabelText('Contraseña'), 'secreta')
    await user.click(screen.getByRole('button', { name: 'Iniciar Sesión' }))

    expect(await screen.findByText('Ada')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Ada/ }))
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
    await user.click(screen.getByRole('button', { name: 'Iniciar Sesión' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Usuario o contraseña incorrectos.',
    )
  })

  it('shows a full-screen business selector for an administrador with more than one business', async () => {
    const user = userEvent.setup()
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ detail: 'Sesion invalida' }, 401))
      .mockResolvedValueOnce(jsonResponse(ADMIN_TWO_BUSINESS_ACCOUNT))
      .mockResolvedValueOnce(
        jsonResponse({ ...ADMIN_TWO_BUSINESS_ACCOUNT, active_business_id: 2 }),
      )
      .mockResolvedValue(jsonResponse([]))

    renderApp()

    await screen.findByRole('heading', { name: 'Iniciar sesión' })
    await user.type(screen.getByLabelText('Usuario'), 'diaco')
    await user.type(screen.getByLabelText('Contraseña'), 'secreta')
    await user.click(screen.getByRole('button', { name: 'Iniciar Sesión' }))

    expect(
      await screen.findByRole('heading', { name: '¿Con qué negocio querés trabajar?' }),
    ).toBeInTheDocument()
    expect(screen.queryByText('Diaco')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Despensa/ }))

    expect(fetchMock).toHaveBeenLastCalledWith(
      '/auth/active-business',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ business_id: 2 }),
      }),
    )
    expect(
      screen.queryByRole('heading', { name: '¿Con qué negocio querés trabajar?' }),
    ).not.toBeInTheDocument()
    expect(await screen.findByText('Diaco')).toBeInTheDocument()
  })

  it('skips the business selector when the administrador has a single business', async () => {
    const user = userEvent.setup()
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ detail: 'Sesion invalida' }, 401))
      .mockResolvedValueOnce(jsonResponse(ACCOUNT))
      .mockResolvedValue(jsonResponse([]))

    renderApp()

    await screen.findByRole('heading', { name: 'Iniciar sesión' })
    await user.type(screen.getByLabelText('Usuario'), 'ada')
    await user.type(screen.getByLabelText('Contraseña'), 'secreta')
    await user.click(screen.getByRole('button', { name: 'Iniciar Sesión' }))

    expect(await screen.findByText('Ada')).toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: '¿Con qué negocio querés trabajar?' }),
    ).not.toBeInTheDocument()
  })

  it('skips the business selector for non-administrador roles even with more than one business', async () => {
    const user = userEvent.setup()
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ detail: 'Sesion invalida' }, 401))
      .mockResolvedValueOnce(jsonResponse(GERENTE_TWO_BUSINESS_ACCOUNT))
      .mockResolvedValue(jsonResponse([]))

    renderApp()

    await screen.findByRole('heading', { name: 'Iniciar sesión' })
    await user.type(screen.getByLabelText('Usuario'), 'gerenta')
    await user.type(screen.getByLabelText('Contraseña'), 'secreta')
    await user.click(screen.getByRole('button', { name: 'Iniciar Sesión' }))

    expect(await screen.findByText('Diaco')).toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: '¿Con qué negocio querés trabajar?' }),
    ).not.toBeInTheDocument()
  })

  it('switches the active business from the account menu', async () => {
    const user = userEvent.setup()
    fetchMock
      .mockResolvedValueOnce(jsonResponse(ADMIN_TWO_BUSINESS_ACCOUNT))
      .mockResolvedValueOnce(
        jsonResponse({ ...ADMIN_TWO_BUSINESS_ACCOUNT, active_business_id: 2 }),
      )
      .mockResolvedValue(jsonResponse([]))

    renderApp()

    await screen.findByText('Diaco')
    await user.click(screen.getByRole('button', { name: /Diaco/ }))
    expect(screen.getByRole('button', { name: 'Mercería' })).toHaveAttribute(
      'aria-current',
      'true',
    )

    await user.click(screen.getByRole('button', { name: 'Despensa' }))

    expect(fetchMock).toHaveBeenLastCalledWith(
      '/auth/active-business',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ business_id: 2 }),
      }),
    )
    expect(await screen.findByRole('button', { name: 'Despensa' })).toHaveAttribute(
      'aria-current',
      'true',
    )
  })

  it('returns to the login screen after logging out', async () => {
    const user = userEvent.setup()
    fetchMock
      .mockResolvedValueOnce(jsonResponse(ACCOUNT))
      .mockResolvedValueOnce(jsonResponse([]))
      .mockResolvedValueOnce(noContentResponse())

    renderApp()

    await screen.findByText('Ada')
    await user.click(screen.getByRole('button', { name: /Ada/ }))
    await user.click(screen.getByRole('button', { name: 'Cerrar sesión' }))

    expect(await screen.findByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument()
  })
})
