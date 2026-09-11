import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../../shared/Toast'
import { AuthProvider, useAuth } from '../access/AuthContext'
import { CustomersPage } from './CustomersPage'

function ReadyGate({ children }: { children: ReactNode }) {
  const { status } = useAuth()
  return status === 'ready' ? <>{children}</> : null
}

const ACCOUNT = {
  id: 1,
  name: 'Empleada de prueba',
  user_name: 'empleada',
  status: 'activo',
  role: 'Empleado',
  active_business_id: 1,
  businesses: [{ id: 1, name: 'Mercería', industry: 'Mercería' }],
}

const CUSTOMERS = [
  { id: 1, name: 'Ana Gómez', phone: '111-2222', status: 'active' },
  { id: 2, name: 'Beto Ruiz', phone: null, status: 'active' },
]

const PENDING_BALANCE = [{ customer: CUSTOMERS[0], balance: '150.00' }]

const CREDITS = [
  { id: 1, customer_id: 1, type: 'cargo', amount: '150.00', created_at: '2026-01-01T10:00:00Z', created_by_account_id: 1 },
]

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function renderPage(customers = CUSTOMERS, pendingBalance = PENDING_BALANCE) {
  const fetchMock = fetch as ReturnType<typeof vi.fn>
  fetchMock
    .mockResolvedValueOnce(jsonResponse(ACCOUNT))
    .mockResolvedValueOnce(jsonResponse(customers))
    .mockResolvedValueOnce(jsonResponse(pendingBalance))

  return render(
    <MemoryRouter>
      <ToastProvider>
        <AuthProvider>
          <ReadyGate>
            <CustomersPage />
          </ReadyGate>
        </AuthProvider>
      </ToastProvider>
    </MemoryRouter>,
  )
}

describe('CustomersPage', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  it('lists customers with phone and pending balance', async () => {
    renderPage()

    expect((await screen.findAllByText('Ana Gómez')).length).toBeGreaterThan(0)
    expect(screen.getAllByText('Beto Ruiz').length).toBeGreaterThan(0)
    expect(screen.getAllByText('$150,00').length).toBeGreaterThan(0)
    expect(screen.getAllByText('$0,00').length).toBeGreaterThan(0)
  })

  it('creates a new customer after confirmation', async () => {
    const user = userEvent.setup()
    const fetchMock = fetch as ReturnType<typeof vi.fn>
    renderPage()

    await screen.findAllByText('Ana Gómez')
    await user.click(screen.getByRole('button', { name: '+ Nuevo cliente' }))
    await user.type(screen.getByLabelText(/^Nombre \*?$/), 'Carla Díaz')

    fetchMock.mockResolvedValueOnce(jsonResponse({ id: 3, name: 'Carla Díaz', phone: null, status: 'active' }, 201))
    await user.click(screen.getByRole('button', { name: 'Guardar' }))
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Guardar' }))

    expect((await screen.findAllByText('Carla Díaz')).length).toBeGreaterThan(0)
    const lastCall = fetchMock.mock.calls.at(-1)
    expect(lastCall?.[0]).toBe('/customers')
  })

  it('does not create the customer when the confirmation is cancelled', async () => {
    const user = userEvent.setup()
    const fetchMock = fetch as ReturnType<typeof vi.fn>
    renderPage()

    await screen.findAllByText('Ana Gómez')
    await user.click(screen.getByRole('button', { name: '+ Nuevo cliente' }))
    await user.type(screen.getByLabelText(/^Nombre \*?$/), 'Carla Díaz')

    const callsBeforeConfirm = fetchMock.mock.calls.length
    await user.click(screen.getByRole('button', { name: 'Guardar' }))
    const dialog = await screen.findByRole('alertdialog')
    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }))

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(fetchMock.mock.calls.length).toBe(callsBeforeConfirm)
    expect(screen.queryByText('Carla Díaz')).not.toBeInTheDocument()
  })

  it('edits an existing customer after confirmation', async () => {
    const user = userEvent.setup()
    const fetchMock = fetch as ReturnType<typeof vi.fn>
    renderPage()

    await screen.findAllByText('Ana Gómez')
    const actionButtons = screen.getAllByRole('button', { name: /Acciones para Ana Gómez/ })
    await user.click(actionButtons[0])
    await user.click(screen.getByRole('button', { name: 'Editar cliente' }))

    const nameInput = screen.getByLabelText(/^Nombre \*?$/)
    await user.clear(nameInput)
    await user.type(nameInput, 'Ana Gómez López')

    fetchMock.mockResolvedValueOnce(jsonResponse({ id: 1, name: 'Ana Gómez López', phone: '111-2222', status: 'active' }))
    await user.click(screen.getByRole('button', { name: 'Guardar' }))
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Guardar' }))

    expect((await screen.findAllByText('Ana Gómez López')).length).toBeGreaterThan(0)
  })

  it('registers a charge (cargo) after confirmation', async () => {
    const user = userEvent.setup()
    const fetchMock = fetch as ReturnType<typeof vi.fn>
    renderPage()

    await screen.findAllByText('Ana Gómez')
    const actionButtons = screen.getAllByRole('button', { name: /Acciones para Ana Gómez/ })
    await user.click(actionButtons[0])

    fetchMock.mockResolvedValueOnce(jsonResponse(CREDITS))
    await user.click(screen.getByRole('button', { name: 'Ver movimientos' }))

    await screen.findByText('Registrar movimiento')
    await user.type(screen.getByLabelText('Importe'), '50')

    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        { id: 2, customer_id: 1, type: 'cargo', amount: '50', created_at: '2026-02-01T10:00:00Z', created_by_account_id: 1 },
        201,
      ),
    )
    await user.click(screen.getByRole('button', { name: 'Registrar' }))
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Registrar' }))

    expect(await screen.findByText('¡Listo!')).toBeInTheDocument()
    const lastCall = fetchMock.mock.calls.at(-1)
    expect(lastCall?.[0]).toBe('/customers/1/credits')
  })

  it('registers a payment (pago) after confirmation', async () => {
    const user = userEvent.setup()
    const fetchMock = fetch as ReturnType<typeof vi.fn>
    renderPage()

    await screen.findAllByText('Ana Gómez')
    const actionButtons = screen.getAllByRole('button', { name: /Acciones para Ana Gómez/ })
    await user.click(actionButtons[0])

    fetchMock.mockResolvedValueOnce(jsonResponse(CREDITS))
    await user.click(screen.getByRole('button', { name: 'Ver movimientos' }))

    await screen.findByText('Registrar movimiento')
    await user.click(screen.getByRole('button', { name: 'Tipo de movimiento' }))
    await user.click(screen.getByRole('option', { name: 'Pago' }))
    await user.type(screen.getByLabelText('Importe'), '30')

    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        { id: 3, customer_id: 1, type: 'pago', amount: '30', created_at: '2026-02-02T10:00:00Z', created_by_account_id: 1 },
        201,
      ),
    )
    await user.click(screen.getByRole('button', { name: 'Registrar' }))
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Registrar' }))

    expect(await screen.findByText('¡Listo!')).toBeInTheDocument()
  })

  it('shows the customer balance and movement history in the detail view', async () => {
    const user = userEvent.setup()
    const fetchMock = fetch as ReturnType<typeof vi.fn>
    renderPage()

    await screen.findAllByText('Ana Gómez')
    const actionButtons = screen.getAllByRole('button', { name: /Acciones para Ana Gómez/ })
    await user.click(actionButtons[0])

    fetchMock.mockResolvedValueOnce(jsonResponse(CREDITS))
    await user.click(screen.getByRole('button', { name: 'Ver movimientos' }))

    expect(await screen.findByText('Saldo actual')).toBeInTheDocument()
    expect(screen.getAllByText('$150,00').length).toBeGreaterThan(0)
    expect(screen.getByText('Cargo')).toBeInTheDocument()
  })
})
