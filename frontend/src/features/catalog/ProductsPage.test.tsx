import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider, useAuth } from '../access/AuthContext'
import { ProductDetailPage } from './ProductDetailPage'
import { ProductsPage } from './ProductsPage'

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

const EMPLOYEE_ACCOUNT = { ...ADMIN_ACCOUNT, role: 'Empleado' }

const CATEGORIES = [
  { id: 1, name: 'Cintas', status: 'active' },
  { id: 2, name: 'Telas', status: 'active' },
]
const UNITS = [
  { id: 1, name: 'Rollo', abbreviation: 'rol', allows_fraction: false, status: 'active' },
  { id: 2, name: 'Metro', abbreviation: 'm', allows_fraction: true, status: 'active' },
]

const PRODUCTS = [
  {
    id: 1,
    name: 'Cinta bebé',
    category_id: 1,
    unit_id: 1,
    status: 'active',
    variants: [{ id: 10, product_id: 1, label: null, is_implicit: true, status: 'active', attribute_value_ids: [] }],
  },
  {
    id: 2,
    name: 'Tela de lino',
    category_id: 2,
    unit_id: 2,
    status: 'active',
    variants: [{ id: 11, product_id: 2, label: 'Natural', is_implicit: false, status: 'active', attribute_value_ids: [] }],
  },
]

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function renderPage(account: unknown, initialPath = '/products') {
  const fetchMock = fetch as ReturnType<typeof vi.fn>
  fetchMock
    .mockResolvedValueOnce(jsonResponse(account))
    .mockResolvedValueOnce(jsonResponse(PRODUCTS))
    .mockResolvedValueOnce(jsonResponse(CATEGORIES))
    .mockResolvedValueOnce(jsonResponse(UNITS))

  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <AuthProvider>
        <ReadyGate>
          <Routes>
            <Route path="/products" element={<ProductsPage />} />
            <Route path="/products/new" element={<h1>Nuevo producto</h1>} />
            <Route path="/products/:productId" element={<h1>Detalle de producto</h1>} />
          </Routes>
        </ReadyGate>
      </AuthProvider>
    </MemoryRouter>,
  )
}

describe('ProductsPage', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  it('lists products with their category and unit', async () => {
    renderPage(ADMIN_ACCOUNT)

    expect(await screen.findByText('Cinta bebé')).toBeInTheDocument()
    expect(screen.getByText('Tela de lino')).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: 'Cintas' })).toBeInTheDocument()
    expect(screen.getByText('2 productos encontrados')).toBeInTheDocument()
  })

  it('filters the list by search text', async () => {
    const user = userEvent.setup()
    renderPage(ADMIN_ACCOUNT)

    await screen.findByText('Cinta bebé')
    await user.type(screen.getByLabelText('Buscar productos'), 'lino')

    expect(screen.queryByText('Cinta bebé')).not.toBeInTheDocument()
    expect(screen.getByText('Tela de lino')).toBeInTheDocument()
  })

  it('filters the list by category', async () => {
    const user = userEvent.setup()
    renderPage(ADMIN_ACCOUNT)

    await screen.findByText('Cinta bebé')
    await user.click(screen.getByRole('button', { name: 'Filtrar por categoría' }))
    await user.click(screen.getByRole('option', { name: 'Telas' }))

    expect(screen.queryByText('Cinta bebé')).not.toBeInTheDocument()
    expect(screen.getByText('Tela de lino')).toBeInTheDocument()
  })

  it('offers "Nuevo producto" and an edit action to an administrator, but not to an employee', async () => {
    renderPage(EMPLOYEE_ACCOUNT)

    await screen.findByText('Cinta bebé')
    expect(screen.queryByRole('link', { name: /nuevo producto/i })).not.toBeInTheDocument()

    const user = userEvent.setup()
    await user.click(screen.getAllByRole('button', { name: /Acciones para/ })[0])
    expect(screen.getByRole('button', { name: 'Ver detalle' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Editar producto' })).not.toBeInTheDocument()
  })

  it('navigates to the product detail from the row menu', async () => {
    const user = userEvent.setup()
    renderPage(ADMIN_ACCOUNT)

    await screen.findByText('Cinta bebé')
    await user.click(screen.getAllByRole('button', { name: /Acciones para/ })[0])
    await user.click(screen.getByRole('button', { name: 'Ver detalle' }))

    expect(await screen.findByRole('heading', { name: 'Detalle de producto' })).toBeInTheDocument()
  })

  it('deactivates a product from the row menu and updates its status', async () => {
    const user = userEvent.setup()
    const fetchMock = fetch as ReturnType<typeof vi.fn>
    renderPage(ADMIN_ACCOUNT)

    await screen.findByText('Cinta bebé')
    fetchMock.mockResolvedValueOnce(jsonResponse({ ...PRODUCTS[0], status: 'inactive' }))

    await user.click(screen.getAllByRole('button', { name: /Acciones para/ })[0])
    await user.click(screen.getByRole('button', { name: /^Desactivar$/ }))
    expect(screen.getByText(/dejar de aparecer/)).toBeInTheDocument()
    await user.click(await screen.findByRole('button', { name: /^Desactivar$/ }))

    expect(await screen.findAllByText(/Inactivo/)).not.toHaveLength(0)
    await user.click(screen.getAllByRole('button', { name: /Acciones para/ })[0])
    expect(screen.getByRole('button', { name: /^Activar$/ })).toBeInTheDocument()
  })

  it('does not deactivate a product when the confirmation is cancelled', async () => {
    const user = userEvent.setup()
    const fetchMock = fetch as ReturnType<typeof vi.fn>
    renderPage(ADMIN_ACCOUNT)

    await screen.findByText('Cinta bebé')
    const callsBeforeCancel = fetchMock.mock.calls.length

    await user.click(screen.getAllByRole('button', { name: /Acciones para/ })[0])
    await user.click(screen.getByRole('button', { name: /^Desactivar$/ }))
    await user.click(screen.getByRole('button', { name: 'Cancelar' }))

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(screen.queryAllByText(/Inactivo/)).toHaveLength(0)
    expect(fetchMock.mock.calls.length).toBe(callsBeforeCancel)
  })

  it('reflects a product edited from the detail modal in the table, without a full reload', async () => {
    const user = userEvent.setup()
    const fetchMock = fetch as ReturnType<typeof vi.fn>
    fetchMock
      .mockResolvedValueOnce(jsonResponse(ADMIN_ACCOUNT))
      .mockResolvedValueOnce(jsonResponse(PRODUCTS))
      .mockResolvedValueOnce(jsonResponse(CATEGORIES))
      .mockResolvedValueOnce(jsonResponse(UNITS))
      .mockResolvedValueOnce(jsonResponse(PRODUCTS[0]))
      .mockResolvedValueOnce(jsonResponse(CATEGORIES))
      .mockResolvedValueOnce(jsonResponse(UNITS))
      .mockResolvedValueOnce(jsonResponse([]))
      .mockResolvedValueOnce(jsonResponse({ variant_id: 10, price: null }))

    render(
      <MemoryRouter initialEntries={['/products']}>
        <AuthProvider>
          <ReadyGate>
            <Routes>
              <Route path="/products" element={<ProductsPage />}>
                <Route path=":productId" element={<ProductDetailPage />} />
              </Route>
            </Routes>
          </ReadyGate>
        </AuthProvider>
      </MemoryRouter>,
    )

    await screen.findByText('Cinta bebé')
    await user.click(screen.getAllByRole('button', { name: /Acciones para/ })[0])
    await user.click(screen.getByRole('button', { name: 'Editar producto' }))

    const nameInput = await screen.findByLabelText('Nombre')
    await user.clear(nameInput)
    await user.type(nameInput, 'Cinta bebé XL')

    fetchMock.mockResolvedValueOnce(jsonResponse({ ...PRODUCTS[0], name: 'Cinta bebé XL' }))
    await user.click(screen.getByRole('button', { name: 'Guardar' }))

    await user.click(await screen.findByRole('button', { name: 'Cerrar' }))

    expect(await screen.findByText('Cinta bebé XL')).toBeInTheDocument()
    expect(screen.queryByText('Cinta bebé', { exact: true })).not.toBeInTheDocument()
  })
})
