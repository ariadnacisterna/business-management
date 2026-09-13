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
  { id: 1, name: 'Ana Gómez', phone: '111-2222', address: 'Calle Falsa 123', status: 'active' },
  { id: 2, name: 'Beto Ruiz', phone: null, address: null, status: 'active' },
]

const BALANCES = [
  {
    customer_id: 1,
    balance: '150.00',
    last_movement_at: '2026-01-01T10:00:00Z',
    last_movement_by_account_name: 'Empleada de prueba',
  },
  { customer_id: 2, balance: '0.00', last_movement_at: null, last_movement_by_account_name: null },
]

const CREDITS = [
  {
    id: 1,
    customer_id: 1,
    type: 'cargo',
    amount: '150.00',
    created_at: '2026-01-01T10:00:00Z',
    created_by_account_id: 1,
    created_by_account_name: 'Empleada de prueba',
  },
]

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function renderPage(customers = CUSTOMERS, balances = BALANCES) {
  const fetchMock = fetch as ReturnType<typeof vi.fn>
  fetchMock
    .mockResolvedValueOnce(jsonResponse(ACCOUNT))
    .mockResolvedValueOnce(jsonResponse(customers))
    .mockResolvedValueOnce(jsonResponse(balances))

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

  it('shows only the loading spinner, not search/view toggle, while loading', async () => {
    const fetchMock = fetch as ReturnType<typeof vi.fn>
    fetchMock.mockResolvedValueOnce(jsonResponse(ACCOUNT)).mockImplementationOnce(() => new Promise(() => {}))

    render(
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

    expect(await screen.findByRole('status')).toHaveTextContent('Cargando…')
    expect(screen.queryByRole('textbox', { name: 'Buscar clientes' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Ver como tarjetas')).not.toBeInTheDocument()
  })

  it('lists customers with phone, address and pending balance', async () => {
    renderPage()

    expect((await screen.findAllByText('Ana Gómez')).length).toBeGreaterThan(0)
    expect(screen.getAllByText('Beto Ruiz').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Calle Falsa 123').length).toBeGreaterThan(0)
    expect(screen.getAllByText('$150,00').length).toBeGreaterThan(0)
    expect(screen.getAllByText('$0,00').length).toBeGreaterThan(0)
  })

  it('shows the card/table view toggle once there are customers, and switches views', async () => {
    const user = userEvent.setup()
    renderPage()

    await screen.findAllByText('Ana Gómez')
    expect(screen.getByLabelText('Ver como tarjetas')).toBeInTheDocument()
    expect(screen.getByLabelText('Ver como tabla')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()

    await user.click(screen.getByLabelText('Ver como tabla'))
    expect(screen.getByRole('table')).toBeInTheDocument()
  })

  it('shows an empty state, not an error, when there are no customers yet', async () => {
    renderPage([], [])

    expect(await screen.findByText('No hay clientes registrados')).toBeInTheDocument()
    expect(screen.queryByText(/No se pudieron cargar/)).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Ver como tarjetas')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Ver como tabla')).not.toBeInTheDocument()
  })

  it('filters customers by name', async () => {
    const user = userEvent.setup()
    renderPage()

    await screen.findAllByText('Ana Gómez')
    await user.type(screen.getByRole('textbox', { name: 'Buscar clientes' }), 'Beto')

    expect(screen.getAllByText('Beto Ruiz').length).toBeGreaterThan(0)
    expect(screen.queryByText('Ana Gómez')).not.toBeInTheDocument()
  })

  it('shows the page-size selector once there are more than 10 customers', async () => {
    const manyCustomers = Array.from({ length: 11 }, (_, index) => ({
      id: index + 1,
      name: `Cliente ${String(index + 1).padStart(2, '0')}`,
      phone: null,
      address: null,
      status: 'active',
    }))
    renderPage(manyCustomers, [])

    await screen.findAllByText('Cliente 01')
    expect(screen.getByRole('button', { name: 'Cantidad por página' })).toBeInTheDocument()
  })

  it('hides the page-size selector when there are 10 or fewer customers', async () => {
    renderPage()

    await screen.findAllByText('Ana Gómez')
    expect(screen.queryByRole('button', { name: 'Cantidad por página' })).not.toBeInTheDocument()
  })

  it('creates a new customer after confirmation', async () => {
    const user = userEvent.setup()
    const fetchMock = fetch as ReturnType<typeof vi.fn>
    renderPage()

    await screen.findAllByText('Ana Gómez')
    await user.click(screen.getByRole('button', { name: 'Nuevo cliente' }))
    await user.type(screen.getByLabelText(/^Nombre \*?$/), 'Carla Díaz')

    fetchMock.mockResolvedValueOnce(
      jsonResponse({ id: 3, name: 'Carla Díaz', phone: null, address: null, status: 'active' }, 201),
    )
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
    await user.click(screen.getByRole('button', { name: 'Nuevo cliente' }))
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

    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        id: 1,
        name: 'Ana Gómez López',
        phone: '111-2222',
        address: 'Calle Falsa 123',
        status: 'active',
      }),
    )
    await user.click(screen.getByRole('button', { name: 'Guardar' }))
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Guardar' }))

    expect((await screen.findAllByText('Ana Gómez López')).length).toBeGreaterThan(0)
  })

  it('registers a charge (cargo) after confirmation', async () => {
    const user = userEvent.setup()
    const fetchMock = fetch as ReturnType<typeof vi.fn>
    renderPage()

    await screen.findAllByText('Ana Gómez')
    await user.click(screen.getByLabelText('Ver como tabla'))
    await user.click(screen.getByRole('button', { name: /Acciones para Ana Gómez/ }))
    await user.click(screen.getByRole('button', { name: 'Registrar pago' }))

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
    await user.click(screen.getByLabelText('Ver como tabla'))
    await user.click(screen.getByRole('button', { name: /Acciones para Ana Gómez/ }))
    await user.click(screen.getByRole('button', { name: 'Registrar pago' }))

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

  it('deactivates a customer after confirmation', async () => {
    const user = userEvent.setup()
    const fetchMock = fetch as ReturnType<typeof vi.fn>
    renderPage()

    await screen.findAllByText('Ana Gómez')
    const actionButtons = screen.getAllByRole('button', { name: /Acciones para Ana Gómez/ })
    await user.click(actionButtons[0])
    await user.click(screen.getByRole('button', { name: /^Desactivar$/ }))

    fetchMock.mockResolvedValueOnce(
      jsonResponse({ id: 1, name: 'Ana Gómez', phone: '111-2222', address: 'Calle Falsa 123', status: 'inactive' }),
    )
    await user.click(await screen.findByRole('button', { name: /^Desactivar$/ }))

    expect(await screen.findByText('¡Listo!')).toBeInTheDocument()
    expect((await screen.findAllByText(/Inactivo/)).length).toBeGreaterThan(0)
  })

  it('reactivates a customer after confirmation', async () => {
    const user = userEvent.setup()
    const fetchMock = fetch as ReturnType<typeof vi.fn>
    const inactiveCustomer = { id: 1, name: 'Ana Gómez', phone: '111-2222', address: 'Calle Falsa 123', status: 'inactive' }
    renderPage([inactiveCustomer, CUSTOMERS[1]], [])

    await screen.findAllByText('Ana Gómez')
    const actionButtons = screen.getAllByRole('button', { name: /Acciones para Ana Gómez/ })
    await user.click(actionButtons[0])
    await user.click(screen.getByRole('button', { name: /^Activar$/ }))

    fetchMock.mockResolvedValueOnce(
      jsonResponse({ id: 1, name: 'Ana Gómez', phone: '111-2222', address: 'Calle Falsa 123', status: 'active' }),
    )
    await user.click(await screen.findByRole('button', { name: /^Activar$/ }))

    expect(await screen.findByText('¡Listo!')).toBeInTheDocument()
    expect((await screen.findAllByText(/Activo/)).length).toBeGreaterThan(0)
  })

  it('shows the customer balance in the payment view', async () => {
    const user = userEvent.setup()
    renderPage()

    await screen.findAllByText('Ana Gómez')
    await user.click(screen.getByLabelText('Ver como tabla'))
    await user.click(screen.getByRole('button', { name: /Acciones para Ana Gómez/ }))
    await user.click(screen.getByRole('button', { name: 'Registrar pago' }))

    expect(await screen.findByText('Saldo actual')).toBeInTheDocument()
    expect(screen.getAllByText('$150,00').length).toBeGreaterThan(0)
  })

  it('shows the movement history in the history view', async () => {
    const user = userEvent.setup()
    const fetchMock = fetch as ReturnType<typeof vi.fn>
    renderPage()

    await screen.findAllByText('Ana Gómez')

    fetchMock.mockResolvedValueOnce(jsonResponse(CREDITS))
    await user.click(screen.getAllByRole('button', { name: 'Ver historial' })[0])

    expect(await screen.findByText('Tipo: Fiado')).toBeInTheDocument()
    expect(screen.getByText('+$150,00')).toBeInTheDocument()
    expect(screen.getByText('Cambiado por: Empleada')).toBeInTheDocument()
  })

  it('updates the balance directly from the card', async () => {
    const user = userEvent.setup()
    const fetchMock = fetch as ReturnType<typeof vi.fn>
    renderPage([CUSTOMERS[0]], [BALANCES[0]])

    await screen.findAllByText('Ana Gómez')
    await user.type(screen.getByLabelText('Importe para Ana Gómez'), '50')
    await user.click(screen.getByRole('button', { name: 'Actualizar' }))

    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        {
          id: 2,
          customer_id: 1,
          type: 'cargo',
          amount: '50.00',
          created_at: '2026-02-01T10:00:00Z',
          created_by_account_id: 1,
          created_by_account_name: 'Empleada de prueba',
        },
        201,
      ),
    )
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Actualizar' }))

    expect(await screen.findByText('¡Listo!')).toBeInTheDocument()
    expect(screen.getAllByText('$200,00').length).toBeGreaterThan(0)
    expect(screen.getByText(/por Empleada/)).toBeInTheDocument()
  })
})
