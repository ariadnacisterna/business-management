import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ManagedAccount } from '../../api/types'
import { AuthProvider, useAuth } from '../access/AuthContext'
import { AccountsPage } from './AccountsPage'

function ReadyGate({ children }: { children: ReactNode }) {
  const { status } = useAuth()
  return status === 'ready' ? <>{children}</> : null
}

const ADMIN_ACCOUNT = {
  id: 1,
  name: 'Ada Lovelace',
  user_name: 'ada',
  status: 'activo',
  role: 'Administrador',
  active_business_id: 1,
  businesses: [{ id: 1, name: 'Mercería', industry: 'Mercería' }],
}

const MANAGED_ACCOUNTS: ManagedAccount[] = [
  {
    id: 1,
    name: 'Ada Lovelace',
    user_name: 'ada',
    status: 'active',
    role: 'Dueño',
    businesses: [
      { id: 1, name: 'Mercería', industry: 'Mercería' },
      { id: 2, name: 'Despensa', industry: 'Despensa' },
    ],
  },
  {
    id: 2,
    name: 'Grace Hopper',
    user_name: 'grace',
    status: 'active',
    role: 'Empleado',
    businesses: [{ id: 1, name: 'Mercería', industry: 'Mercería' }],
  },
  {
    id: 3,
    name: 'Marisol Díaz',
    user_name: 'marisol',
    status: 'inactive',
    role: 'Gerente',
    businesses: [{ id: 2, name: 'Despensa', industry: 'Despensa' }],
  },
]

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function renderPage(account: unknown, accounts: ManagedAccount[] = MANAGED_ACCOUNTS) {
  const fetchMock = fetch as ReturnType<typeof vi.fn>
  fetchMock.mockResolvedValueOnce(jsonResponse(account)).mockResolvedValueOnce(jsonResponse(accounts))

  return render(
    <MemoryRouter initialEntries={['/cuentas']}>
      <AuthProvider>
        <ReadyGate>
          <Routes>
            <Route path="/cuentas" element={<AccountsPage />} />
          </Routes>
        </ReadyGate>
      </AuthProvider>
    </MemoryRouter>,
  )
}

describe('AccountsPage', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  it('lists accounts with their username, role, business and status', async () => {
    renderPage(ADMIN_ACCOUNT)

    expect(await screen.findByText('Ada Lovelace')).toBeInTheDocument()
    expect(screen.getByText('Grace Hopper')).toBeInTheDocument()
    expect(screen.getByText('Marisol Díaz')).toBeInTheDocument()
    expect(screen.getByText('ada')).toBeInTheDocument()
    expect(screen.getAllByText('Dueño').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Mercería').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Despensa').length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Activo/).length).toBe(2)
    expect(screen.getAllByText(/Inactivo/).length).toBe(1)
  })

  it('paginates when there are more accounts than fit on one page', async () => {
    const user = userEvent.setup()
    const manyAccounts: ManagedAccount[] = Array.from({ length: 32 }, (_, index) => ({
      id: index + 1,
      name: `Empleada ${String(index + 1).padStart(2, '0')}`,
      user_name: `empleada${index + 1}`,
      status: 'active',
      role: 'Empleado',
      businesses: [{ id: 1, name: 'Mercería', industry: 'Mercería' }],
    }))
    renderPage(ADMIN_ACCOUNT, manyAccounts)

    await screen.findByText('Empleada 01')
    expect(screen.getByText('Empleada 25')).toBeInTheDocument()
    expect(screen.queryByText('Empleada 26')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Siguiente' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Siguiente' }))

    expect(await screen.findByText('Empleada 26')).toBeInTheDocument()
    expect(screen.queryByText('Empleada 01')).not.toBeInTheDocument()
  })

  it('hides the page-size filter when there are 10 or fewer accounts, and shows it otherwise', async () => {
    renderPage(ADMIN_ACCOUNT)
    await screen.findByText('Ada Lovelace')
    expect(screen.queryByRole('button', { name: 'Cantidad por página' })).not.toBeInTheDocument()
  })

  it('shows the page-size filter once there are more than 10 accounts', async () => {
    const manyAccounts: ManagedAccount[] = Array.from({ length: 11 }, (_, index) => ({
      id: index + 1,
      name: `Empleada ${String(index + 1).padStart(2, '0')}`,
      user_name: `empleada${index + 1}`,
      status: 'active',
      role: 'Empleado',
      businesses: [{ id: 1, name: 'Mercería', industry: 'Mercería' }],
    }))
    renderPage(ADMIN_ACCOUNT, manyAccounts)
    await screen.findByText('Empleada 01')
    expect(screen.getByRole('button', { name: 'Cantidad por página' })).toBeInTheDocument()
  })

  it('sorts by name ascending and descending', async () => {
    const user = userEvent.setup()
    renderPage(ADMIN_ACCOUNT)

    await screen.findByText('Ada Lovelace')
    await user.click(screen.getByRole('button', { name: 'Ver como tabla' }))
    const names = ['Ada Lovelace', 'Grace Hopper', 'Marisol Díaz']
    const namesInOrder = () =>
      screen
        .getAllByRole('row')
        .slice(1)
        .map((row) => names.find((name) => within(row).queryByText(name) !== null))

    expect(namesInOrder()).toEqual(['Ada Lovelace', 'Grace Hopper', 'Marisol Díaz'])

    await user.click(screen.getByText('Nombre'))
    expect(namesInOrder()).toEqual(['Marisol Díaz', 'Grace Hopper', 'Ada Lovelace'])

    await user.click(screen.getByText('Nombre'))
    expect(namesInOrder()).toEqual(['Ada Lovelace', 'Grace Hopper', 'Marisol Díaz'])
  })

  it('colors Mercería with the pink business badge and Despensa with the blue one, regardless of accents', async () => {
    renderPage(ADMIN_ACCOUNT, [
      {
        id: 1,
        name: 'Ada Lovelace',
        user_name: 'ada',
        status: 'active',
        role: 'Dueño',
        businesses: [
          { id: 1, name: 'Merceria', industry: 'Merceria' },
          { id: 2, name: 'Despensa', industry: 'Despensa' },
        ],
      },
    ])

    const merceriaBadge = await screen.findByText('Merceria')
    const despensaBadge = screen.getByText('Despensa')
    expect(merceriaBadge).toHaveClass('text-business-merceria')
    expect(despensaBadge).toHaveClass('text-business-despensa')
  })

  it('filters by role, business and status, and clears all filters at once', async () => {
    const user = userEvent.setup()
    renderPage(ADMIN_ACCOUNT)

    await screen.findByText('Ada Lovelace')
    const clearButton = screen.getByRole('button', { name: 'Limpiar búsqueda' })
    expect(clearButton).toBeDisabled()

    await user.click(screen.getByRole('button', { name: 'Filtrar por rol' }))
    await user.click(screen.getByRole('option', { name: 'Empleado' }))

    expect(screen.getByText('Grace Hopper')).toBeInTheDocument()
    expect(screen.queryByText('Ada Lovelace')).not.toBeInTheDocument()
    expect(screen.queryByText('Marisol Díaz')).not.toBeInTheDocument()
    expect(clearButton).toBeEnabled()

    await user.click(screen.getByRole('button', { name: 'Filtrar por rol' }))
    await user.click(screen.getByRole('option', { name: 'Todos los roles' }))

    await user.click(screen.getByRole('button', { name: 'Filtrar por negocio' }))
    await user.click(screen.getByRole('option', { name: 'Despensa' }))

    expect(screen.getByText('Marisol Díaz')).toBeInTheDocument()
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument()
    expect(screen.queryByText('Grace Hopper')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Filtrar por negocio' }))
    await user.click(screen.getByRole('option', { name: 'Todos los negocios' }))

    await user.click(screen.getByRole('button', { name: 'Filtrar por estado' }))
    await user.click(screen.getByRole('option', { name: 'Inactivo' }))

    expect(screen.getByText('Marisol Díaz')).toBeInTheDocument()
    expect(screen.queryByText('Ada Lovelace')).not.toBeInTheDocument()
    expect(screen.queryByText('Grace Hopper')).not.toBeInTheDocument()

    await user.click(clearButton)

    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument()
    expect(screen.getByText('Grace Hopper')).toBeInTheDocument()
    expect(screen.getByText('Marisol Díaz')).toBeInTheDocument()
    expect(clearButton).toBeDisabled()
  })

  it('creates a new account', async () => {
    const user = userEvent.setup()
    const fetchMock = fetch as ReturnType<typeof vi.fn>
    renderPage(ADMIN_ACCOUNT)

    await screen.findByText('Ada Lovelace')
    await user.click(screen.getAllByRole('button', { name: /nueva cuenta/i })[0])

    await user.type(screen.getByLabelText('Nombre'), 'Nuevo Empleado')
    await user.type(screen.getByLabelText('Usuario'), 'nuevo')
    await user.type(screen.getByLabelText('Contraseña inicial'), 'clave123')

    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        id: 3,
        name: 'Nuevo Empleado',
        user_name: 'nuevo',
        status: 'active',
        role: 'Empleado',
        businesses: [],
      }),
    )
    await user.click(screen.getByRole('button', { name: 'Guardar' }))
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Guardar' }))

    expect(await screen.findByText('Nuevo Empleado')).toBeInTheDocument()
    const lastCall = fetchMock.mock.calls.at(-1)
    expect(lastCall?.[0]).toBe('/accounts')
    expect(JSON.parse(lastCall?.[1]?.body as string)).toEqual({
      name: 'Nuevo Empleado',
      user_name: 'nuevo',
      role: 'Empleado',
      initial_password: 'clave123',
    })
  })

  it('does not create the account when the confirmation is cancelled', async () => {
    const user = userEvent.setup()
    const fetchMock = fetch as ReturnType<typeof vi.fn>
    renderPage(ADMIN_ACCOUNT)

    await screen.findByText('Ada Lovelace')
    await user.click(screen.getAllByRole('button', { name: /nueva cuenta/i })[0])

    await user.type(screen.getByLabelText('Nombre'), 'Nuevo Empleado')
    await user.type(screen.getByLabelText('Usuario'), 'nuevo')
    await user.type(screen.getByLabelText('Contraseña inicial'), 'clave123')

    const callsBeforeConfirm = fetchMock.mock.calls.length
    await user.click(screen.getByRole('button', { name: 'Guardar' }))

    const dialog = await screen.findByRole('alertdialog')
    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }))

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(fetchMock.mock.calls.length).toBe(callsBeforeConfirm)
    expect(screen.queryByText('Nuevo Empleado')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Nombre')).toHaveValue('Nuevo Empleado')
  })

  it('edits an existing account', async () => {
    const user = userEvent.setup()
    const fetchMock = fetch as ReturnType<typeof vi.fn>
    renderPage(ADMIN_ACCOUNT)

    await screen.findByText('Grace Hopper')
    await user.click(screen.getAllByRole('button', { name: /Acciones para/ })[1])
    await user.click(screen.getByRole('button', { name: 'Editar cuenta' }))

    const nameInput = await screen.findByLabelText('Nombre')
    await user.clear(nameInput)
    await user.type(nameInput, 'Grace Hopper Rear Admiral')

    fetchMock.mockResolvedValueOnce(
      jsonResponse({ ...MANAGED_ACCOUNTS[1], name: 'Grace Hopper Rear Admiral' }),
    )
    await user.click(screen.getByRole('button', { name: 'Guardar' }))
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Guardar' }))

    expect(await screen.findByText('Grace Hopper Rear Admiral')).toBeInTheDocument()
  })

  it('deactivates and reactivates an account after confirmation', async () => {
    const user = userEvent.setup()
    const fetchMock = fetch as ReturnType<typeof vi.fn>
    renderPage(ADMIN_ACCOUNT)

    await screen.findByText('Grace Hopper')
    await user.click(screen.getAllByRole('button', { name: /Acciones para/ })[1])
    await user.click(screen.getByRole('button', { name: /^Desactivar$/ }))

    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
    fetchMock.mockResolvedValueOnce(jsonResponse({ ...MANAGED_ACCOUNTS[1], status: 'inactive' }))
    await user.click(await screen.findByRole('button', { name: /^Desactivar$/ }))

    await waitFor(() => expect(screen.getAllByText(/Inactivo/).length).toBe(2))

    await user.click(screen.getAllByRole('button', { name: /Acciones para/ })[1])
    fetchMock.mockResolvedValueOnce(jsonResponse({ ...MANAGED_ACCOUNTS[1], status: 'active' }))
    await user.click(screen.getByRole('button', { name: /^Activar$/ }))
    await user.click(await screen.findByRole('button', { name: /^Activar$/ }))

    await waitFor(() => expect(screen.getAllByText(/Inactivo/).length).toBe(1))
  })

  it('does not deactivate an account when the confirmation is cancelled', async () => {
    const user = userEvent.setup()
    const fetchMock = fetch as ReturnType<typeof vi.fn>
    renderPage(ADMIN_ACCOUNT)

    await screen.findByText('Grace Hopper')
    const callsBeforeCancel = fetchMock.mock.calls.length

    await user.click(screen.getAllByRole('button', { name: /Acciones para/ })[1])
    await user.click(screen.getByRole('button', { name: /^Desactivar$/ }))
    await user.click(screen.getByRole('button', { name: 'Cancelar' }))

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(fetchMock.mock.calls.length).toBe(callsBeforeCancel)
  })

  it('resets an account password with a matching confirmation', async () => {
    const user = userEvent.setup()
    const fetchMock = fetch as ReturnType<typeof vi.fn>
    renderPage(ADMIN_ACCOUNT)

    await screen.findByText('Grace Hopper')
    await user.click(screen.getAllByRole('button', { name: /Acciones para/ })[1])
    await user.click(screen.getByRole('button', { name: 'Restablecer contraseña' }))

    await user.type(screen.getByLabelText('Contraseña nueva'), 'nuevaClave1')
    await user.type(screen.getByLabelText('Repetir contraseña'), 'otraClave2')
    expect(screen.getByText('Las contraseñas no coinciden.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Restablecer' })).toBeDisabled()

    await user.clear(screen.getByLabelText('Repetir contraseña'))
    await user.type(screen.getByLabelText('Repetir contraseña'), 'nuevaClave1')

    fetchMock.mockResolvedValueOnce(jsonResponse(MANAGED_ACCOUNTS[1]))
    await user.click(screen.getByRole('button', { name: 'Restablecer' }))

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Restablecer contraseña' })).not.toBeInTheDocument())
    const lastCall = fetchMock.mock.calls.at(-1)
    expect(lastCall?.[0]).toBe('/accounts/2/reset-password')
    expect(JSON.parse(lastCall?.[1]?.body as string)).toEqual({ new_password: 'nuevaClave1' })
  })
})
