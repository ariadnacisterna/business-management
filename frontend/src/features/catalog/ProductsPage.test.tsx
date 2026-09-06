import { render, screen, waitFor } from '@testing-library/react'
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

function productPage(items: typeof PRODUCTS, overrides: Partial<{ total: number; page: number; page_size: number }> = {}) {
  return jsonResponse({ items, total: overrides.total ?? items.length, page: overrides.page ?? 1, page_size: overrides.page_size ?? 25 })
}

function renderPage(account: unknown, initialPath = '/products') {
  const fetchMock = fetch as ReturnType<typeof vi.fn>
  fetchMock
    .mockResolvedValueOnce(jsonResponse(account))
    .mockResolvedValueOnce(jsonResponse(CATEGORIES))
    .mockResolvedValueOnce(jsonResponse(UNITS))
    .mockResolvedValueOnce(productPage(PRODUCTS))

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

  it('asks the server to filter by search text, debouncing the request', async () => {
    const user = userEvent.setup()
    const fetchMock = fetch as ReturnType<typeof vi.fn>
    renderPage(ADMIN_ACCOUNT)

    await screen.findByText('Cinta bebé')
    fetchMock.mockResolvedValueOnce(productPage([PRODUCTS[1]], { total: 1 }))

    await user.type(screen.getByLabelText('Buscar productos'), 'lino')

    await waitFor(() => expect(screen.queryByText('Cinta bebé')).not.toBeInTheDocument(), { timeout: 2000 })
    expect(screen.getByText('Tela de lino')).toBeInTheDocument()

    const lastCall = fetchMock.mock.calls.at(-1)?.[0] as string
    expect(lastCall).toContain('search=lino')
  })

  it('asks the server to filter by category', async () => {
    const user = userEvent.setup()
    const fetchMock = fetch as ReturnType<typeof vi.fn>
    renderPage(ADMIN_ACCOUNT)

    await screen.findByText('Cinta bebé')
    fetchMock.mockResolvedValueOnce(productPage([PRODUCTS[1]], { total: 1 }))

    await user.click(screen.getByRole('button', { name: 'Filtrar por categoría' }))
    await user.click(screen.getByRole('option', { name: 'Telas' }))

    expect(await screen.findByText('Tela de lino')).toBeInTheDocument()
    expect(screen.queryByText('Cinta bebé')).not.toBeInTheDocument()

    const lastCall = fetchMock.mock.calls.at(-1)?.[0] as string
    expect(lastCall).toContain('category_id=2')
  })

  it('shows page-number controls compressed when there are many pages, always keeping pages 1 and 2', async () => {
    const fetchMock = fetch as ReturnType<typeof vi.fn>
    fetchMock
      .mockResolvedValueOnce(jsonResponse(ADMIN_ACCOUNT))
      .mockResolvedValueOnce(jsonResponse(CATEGORIES))
      .mockResolvedValueOnce(jsonResponse(UNITS))
      .mockResolvedValueOnce(productPage(PRODUCTS, { total: 500, page: 5, page_size: 25 }))

    render(
      <MemoryRouter initialEntries={['/products']}>
        <AuthProvider>
          <ReadyGate>
            <Routes>
              <Route path="/products" element={<ProductsPage />} />
            </Routes>
          </ReadyGate>
        </AuthProvider>
      </MemoryRouter>,
    )

    await screen.findByText('Cinta bebé')
    expect(screen.getByRole('button', { name: 'Anterior' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Siguiente' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '1' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '2' })).toBeInTheDocument()
    expect(screen.getAllByText('…').length).toBeGreaterThan(0)
  })

  it('requests the next page when "Siguiente" is clicked', async () => {
    const user = userEvent.setup()
    const fetchMock = fetch as ReturnType<typeof vi.fn>
    fetchMock
      .mockResolvedValueOnce(jsonResponse(ADMIN_ACCOUNT))
      .mockResolvedValueOnce(jsonResponse(CATEGORIES))
      .mockResolvedValueOnce(jsonResponse(UNITS))
      .mockResolvedValueOnce(productPage(PRODUCTS, { total: 60, page: 1, page_size: 25 }))

    render(
      <MemoryRouter initialEntries={['/products']}>
        <AuthProvider>
          <ReadyGate>
            <Routes>
              <Route path="/products" element={<ProductsPage />} />
            </Routes>
          </ReadyGate>
        </AuthProvider>
      </MemoryRouter>,
    )

    await screen.findByText('Cinta bebé')
    fetchMock.mockResolvedValueOnce(productPage([PRODUCTS[1]], { total: 60, page: 2, page_size: 25 }))
    await user.click(screen.getByRole('button', { name: 'Siguiente' }))

    await screen.findByText('Tela de lino')
    const lastCall = fetchMock.mock.calls.at(-1)?.[0] as string
    expect(lastCall).toContain('page=2')
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
      .mockResolvedValueOnce(jsonResponse(CATEGORIES))
      .mockResolvedValueOnce(jsonResponse(UNITS))
      .mockResolvedValueOnce(productPage(PRODUCTS))
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

    const nameInput = await screen.findByLabelText(/^Nombre\s?\*?$/)
    await user.clear(nameInput)
    await user.type(nameInput, 'Cinta bebé XL')

    fetchMock.mockResolvedValueOnce(jsonResponse({ ...PRODUCTS[0], name: 'Cinta bebé XL' }))
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    await user.click(await screen.findByRole('button', { name: 'Cerrar' }))

    expect(await screen.findByText('Cinta bebé XL')).toBeInTheDocument()
    expect(screen.queryByText('Cinta bebé', { exact: true })).not.toBeInTheDocument()
  })
})
