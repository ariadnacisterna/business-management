import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../../shared/Toast'
import { AuthProvider, useAuth } from '../access/AuthContext'
import { SuppliersPage } from './SuppliersPage'

function ReadyGate({ children }: { children: ReactNode }) {
  const { status } = useAuth()
  return status === 'ready' ? <>{children}</> : null
}

const GERENTE_ACCOUNT = {
  id: 1,
  name: 'Gerente de prueba',
  user_name: 'gerente',
  status: 'activo',
  role: 'Gerente',
  active_business_id: 1,
  businesses: [{ id: 1, name: 'Mercería', industry: 'Mercería' }],
}

const EMPLEADO_ACCOUNT = { ...GERENTE_ACCOUNT, role: 'Empleado' }

const PROVIDERS = [
  {
    id: 1,
    name: 'Distribuidora Norte',
    contact_name: 'Juan Pérez',
    email: null,
    phone: null,
    last_purchase_at: null,
    status: 'active',
    category_ids: [],
  },
  {
    id: 2,
    name: 'Textiles del Sur',
    contact_name: null,
    email: null,
    phone: null,
    last_purchase_at: null,
    status: 'inactive',
    category_ids: [],
  },
]

const CATEGORIES = [{ id: 1, name: 'Mercería', status: 'active' }]

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function renderPage(account: unknown = GERENTE_ACCOUNT, providers = PROVIDERS) {
  const fetchMock = fetch as ReturnType<typeof vi.fn>
  fetchMock
    .mockResolvedValueOnce(jsonResponse(account))
    .mockResolvedValueOnce(jsonResponse(providers))
    .mockResolvedValueOnce(jsonResponse(CATEGORIES))

  return render(
    <MemoryRouter>
      <ToastProvider>
        <AuthProvider>
          <ReadyGate>
            <SuppliersPage />
          </ReadyGate>
        </AuthProvider>
      </ToastProvider>
    </MemoryRouter>,
  )
}

describe('SuppliersPage', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  it('lists providers with contact and status', async () => {
    renderPage()

    expect((await screen.findAllByText('Distribuidora Norte')).length).toBeGreaterThan(0)
    expect(screen.getAllByText('Textiles del Sur').length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Activo/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Inactivo/).length).toBeGreaterThan(0)
  })

  it('creates a new provider after confirmation', async () => {
    const user = userEvent.setup()
    const fetchMock = fetch as ReturnType<typeof vi.fn>
    renderPage()

    await screen.findAllByText('Distribuidora Norte')
    await user.click(screen.getByRole('button', { name: '+ Nuevo proveedor' }))
    await user.type(screen.getByLabelText(/^Nombre \*?$/), 'Papelera Central')

    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        {
          id: 3,
          name: 'Papelera Central',
          contact_name: null,
          email: null,
          phone: null,
          last_purchase_at: null,
          status: 'active',
          category_ids: [],
        },
        201,
      ),
    )
    await user.click(screen.getByRole('button', { name: 'Guardar' }))
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Guardar' }))

    expect((await screen.findAllByText('Papelera Central')).length).toBeGreaterThan(0)
    const lastCall = fetchMock.mock.calls.at(-1)
    expect(lastCall?.[0]).toBe('/providers')
  })

  it('does not create the provider when the confirmation is cancelled', async () => {
    const user = userEvent.setup()
    const fetchMock = fetch as ReturnType<typeof vi.fn>
    renderPage()

    await screen.findAllByText('Distribuidora Norte')
    await user.click(screen.getByRole('button', { name: '+ Nuevo proveedor' }))
    await user.type(screen.getByLabelText(/^Nombre \*?$/), 'Papelera Central')

    const callsBeforeConfirm = fetchMock.mock.calls.length
    await user.click(screen.getByRole('button', { name: 'Guardar' }))
    const dialog = await screen.findByRole('alertdialog')
    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }))

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(fetchMock.mock.calls.length).toBe(callsBeforeConfirm)
    expect(screen.queryByText('Papelera Central')).not.toBeInTheDocument()
  })

  it('deactivates a provider after confirmation', async () => {
    const user = userEvent.setup()
    const fetchMock = fetch as ReturnType<typeof vi.fn>
    renderPage()

    await screen.findAllByText('Distribuidora Norte')
    const actionButtons = screen.getAllByRole('button', { name: /Acciones para Distribuidora Norte/ })
    await user.click(actionButtons[0])
    await user.click(screen.getByRole('button', { name: /^Desactivar$/ }))

    fetchMock.mockResolvedValueOnce(jsonResponse({ ...PROVIDERS[0], status: 'inactive' }))
    await user.click(await screen.findByRole('button', { name: /^Desactivar$/ }))

    expect(await screen.findByText('¡Listo!')).toBeInTheDocument()
  })

  it('hides provider management actions for an employee', async () => {
    renderPage(EMPLEADO_ACCOUNT)

    await screen.findAllByText('Distribuidora Norte')
    expect(screen.queryByRole('button', { name: '+ Nuevo proveedor' })).not.toBeInTheDocument()
  })
})
