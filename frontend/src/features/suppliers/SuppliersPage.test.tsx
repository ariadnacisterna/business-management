import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../../shared/Toast'
import { AuthProvider } from '../access/AuthContext'
import { useAuth } from '../access/useAuth'
import { SuppliersPage } from './SuppliersPage'

function ReadyGate({ children }: { children: ReactNode }) {
  const { status } = useAuth()
  return status === 'ready' ? <>{children}</> : null
}

const ADMIN_ACCOUNT = {
  id: 1,
  name: 'Administradora de prueba',
  user_name: 'admin',
  status: 'activo',
  role: 'Administrador',
  active_business_id: 1,
  businesses: [{ id: 1, name: 'Mercería', industry: 'Mercería' }],
}

const GERENTE_ACCOUNT = { ...ADMIN_ACCOUNT, role: 'Gerente' }
const EMPLEADO_ACCOUNT = { ...ADMIN_ACCOUNT, role: 'Empleado' }

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

function renderPage(account: unknown = ADMIN_ACCOUNT, providers = PROVIDERS) {
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

  it('shows only the loading spinner, not tabs/search/view toggle, while loading', async () => {
    const fetchMock = fetch as ReturnType<typeof vi.fn>
    fetchMock.mockResolvedValueOnce(jsonResponse(ADMIN_ACCOUNT)).mockImplementationOnce(() => new Promise(() => {}))

    render(
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

    expect(await screen.findByRole('status')).toHaveTextContent('Cargando…')
    expect(screen.queryByRole('button', { name: 'Órdenes de compra' })).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'Buscar proveedores' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Ver como tarjetas')).not.toBeInTheDocument()
  })

  it('lists providers with contact and status', async () => {
    renderPage()

    expect((await screen.findAllByText('Distribuidora Norte')).length).toBeGreaterThan(0)
    expect(screen.getAllByText('Textiles del Sur').length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Activo/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Inactivo/).length).toBeGreaterThan(0)
  })

  it('shows the card/table view toggle once there are providers, and switches views', async () => {
    const user = userEvent.setup()
    renderPage()

    await screen.findAllByText('Distribuidora Norte')
    expect(screen.getByLabelText('Ver como tarjetas')).toBeInTheDocument()
    expect(screen.getByLabelText('Ver como tabla')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()

    await user.click(screen.getByLabelText('Ver como tabla'))
    expect(screen.getByRole('table')).toBeInTheDocument()
  })

  it('shows an empty state, not an error, when there are no providers yet', async () => {
    renderPage(ADMIN_ACCOUNT, [])

    expect(await screen.findByText('No hay proveedores registrados')).toBeInTheDocument()
    expect(screen.queryByText(/No se pudieron cargar/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Órdenes de compra' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Ver como tarjetas')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Ver como tabla')).not.toBeInTheDocument()
  })

  it('filters providers by name', async () => {
    const user = userEvent.setup()
    renderPage()

    await screen.findAllByText('Distribuidora Norte')
    await user.type(screen.getByRole('textbox', { name: 'Buscar proveedores' }), 'Textiles')

    expect(screen.getAllByText('Textiles del Sur').length).toBeGreaterThan(0)
    expect(screen.queryByText('Distribuidora Norte')).not.toBeInTheDocument()
  })

  it('shows the page-size selector once there are more than 10 providers', async () => {
    const manyProviders = Array.from({ length: 11 }, (_, index) => ({
      id: index + 1,
      name: `Proveedor ${String(index + 1).padStart(2, '0')}`,
      contact_name: null,
      email: null,
      phone: null,
      last_purchase_at: null,
      status: 'active',
      category_ids: [],
    }))
    renderPage(ADMIN_ACCOUNT, manyProviders)

    await screen.findAllByText('Proveedor 01')
    expect(screen.getByRole('button', { name: 'Cantidad por página' })).toBeInTheDocument()
  })

  it('hides the page-size selector when there are 10 or fewer providers', async () => {
    renderPage()

    await screen.findAllByText('Distribuidora Norte')
    expect(screen.queryByRole('button', { name: 'Cantidad por página' })).not.toBeInTheDocument()
  })

  it('creates a new category inline from the provider form', async () => {
    const user = userEvent.setup()
    const fetchMock = fetch as ReturnType<typeof vi.fn>
    renderPage()

    await screen.findAllByText('Distribuidora Norte')
    await user.click(screen.getByRole('button', { name: 'Nuevo proveedor' }))
    await user.type(screen.getByLabelText(/^Nombre \*?$/), 'Papelera Central')

    await user.click(screen.getByRole('button', { name: '+ Nueva' }))
    const categoryDialog = await screen.findByRole('dialog', { name: 'Nueva categoría' })
    expect(categoryDialog.querySelector('p.opacity-60')).toHaveTextContent('Proveedores › Nueva categoría')
    await user.type(within(categoryDialog).getByLabelText(/^Nombre \*?$/), 'Librería')

    fetchMock.mockResolvedValueOnce(jsonResponse({ id: 2, name: 'Librería', status: 'active' }, 201))
    await user.click(within(categoryDialog).getByRole('button', { name: 'Crear' }))

    expect(await screen.findByRole('button', { name: 'Categorías' })).toHaveTextContent('Librería')
    const lastCall = fetchMock.mock.calls.at(-1)
    expect(lastCall?.[0]).toBe('/categories')
  })

  it('creates a new provider after confirmation', async () => {
    const user = userEvent.setup()
    const fetchMock = fetch as ReturnType<typeof vi.fn>
    renderPage()

    await screen.findAllByText('Distribuidora Norte')
    await user.click(screen.getByRole('button', { name: 'Nuevo proveedor' }))
    const dialog = screen.getByRole('dialog', { name: 'Nuevo proveedor' })
    expect(dialog.querySelector('p.opacity-60')).toHaveTextContent('Proveedores › Nuevo proveedor')
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

  it('picks a purchase date from the DatePicker calendar and submits it', async () => {
    const user = userEvent.setup()
    const fetchMock = fetch as ReturnType<typeof vi.fn>
    renderPage()

    await screen.findAllByText('Distribuidora Norte')
    await user.click(screen.getByRole('button', { name: 'Nuevo proveedor' }))
    await user.type(screen.getByLabelText(/^Nombre \*?$/), 'Papelera Central')

    const today = new Date()
    const target = new Date(today.getFullYear(), today.getMonth(), 7)
    const targetLabel = target.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })

    await user.click(screen.getByRole('button', { name: 'Última compra' }))
    await user.click(screen.getByRole('button', { name: targetLabel }))
    await user.click(screen.getByRole('button', { name: 'Listo' }))

    const expectedIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-07`

    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        {
          id: 3,
          name: 'Papelera Central',
          contact_name: null,
          email: null,
          phone: null,
          last_purchase_at: expectedIso,
          status: 'active',
          category_ids: [],
        },
        201,
      ),
    )
    await user.click(screen.getByRole('button', { name: 'Guardar' }))
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Guardar' }))

    await screen.findAllByText('Papelera Central')
    const lastCall = fetchMock.mock.calls.at(-1)
    expect(lastCall).toBeDefined()
    const [, requestInit] = lastCall as [string, RequestInit]
    const body = JSON.parse(requestInit.body as string)
    expect(body.last_purchase_at).toBe(expectedIso)
  })

  it('checks and unchecks a category from the checklist', async () => {
    const user = userEvent.setup()
    const fetchMock = fetch as ReturnType<typeof vi.fn>
    renderPage()

    await screen.findAllByText('Distribuidora Norte')
    await user.click(screen.getByRole('button', { name: 'Nuevo proveedor' }))
    await user.type(screen.getByLabelText(/^Nombre \*?$/), 'Papelera Central')

    await user.click(screen.getByRole('button', { name: 'Categorías' }))
    await user.click(screen.getByRole('option', { name: 'Mercería' }))
    expect(screen.getByRole('option', { name: 'Mercería' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('button', { name: 'Categorías' })).toHaveTextContent('Mercería')

    await user.click(screen.getByRole('option', { name: 'Mercería' }))
    expect(screen.getByRole('option', { name: 'Mercería' })).toHaveAttribute('aria-selected', 'false')
    expect(screen.getByRole('button', { name: 'Categorías' })).toHaveTextContent('Sin categorías')

    await user.click(screen.getByRole('option', { name: 'Mercería' }))

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
          category_ids: [1],
        },
        201,
      ),
    )
    await user.click(screen.getByRole('button', { name: 'Guardar' }))
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Guardar' }))

    await screen.findAllByText('Papelera Central')
    const lastCall = fetchMock.mock.calls.at(-1)
    expect(lastCall).toBeDefined()
    const [, requestInit] = lastCall as [string, RequestInit]
    const body = JSON.parse(requestInit.body as string)
    expect(body.category_ids).toEqual([1])
  })

  it('does not create the provider when the confirmation is cancelled', async () => {
    const user = userEvent.setup()
    const fetchMock = fetch as ReturnType<typeof vi.fn>
    renderPage()

    await screen.findAllByText('Distribuidora Norte')
    await user.click(screen.getByRole('button', { name: 'Nuevo proveedor' }))
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
    expect(screen.queryByRole('button', { name: 'Nuevo proveedor' })).not.toBeInTheDocument()
  })

  it('hides provider management actions for a gerente (D-055: administrador and above only)', async () => {
    renderPage(GERENTE_ACCOUNT)

    await screen.findAllByText('Distribuidora Norte')
    expect(screen.queryByRole('button', { name: 'Nuevo proveedor' })).not.toBeInTheDocument()
  })
})
