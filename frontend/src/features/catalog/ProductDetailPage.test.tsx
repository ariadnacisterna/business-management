import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider, useAuth } from '../access/AuthContext'
import { ProductDetailPage } from './ProductDetailPage'

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

const CATEGORIES = [{ id: 1, name: 'Cintas', status: 'active' }]
const UNITS = [{ id: 1, name: 'Unidad', abbreviation: 'un', allows_fraction: false, status: 'active' }]

const PRODUCT = {
  id: 5,
  name: 'Cinta bebé',
  category_id: 1,
  unit_id: 1,
  status: 'active',
  variants: [{ id: 10, product_id: 5, label: 'Estándar', is_implicit: false, status: 'active', attribute_value_ids: [] }],
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function renderPage(initialPath: string) {
  const fetchMock = fetch as ReturnType<typeof vi.fn>
  fetchMock
    .mockResolvedValueOnce(jsonResponse(ADMIN_ACCOUNT))
    .mockResolvedValueOnce(jsonResponse(PRODUCT))
    .mockResolvedValueOnce(jsonResponse(CATEGORIES))
    .mockResolvedValueOnce(jsonResponse(UNITS))
    .mockResolvedValueOnce(jsonResponse([]))
    .mockResolvedValueOnce(jsonResponse({ variant_id: 10, price: null }))

  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <AuthProvider>
        <ReadyGate>
          <Routes>
            <Route path="/products" element={<h1>Productos</h1>} />
            <Route path="/products/:productId" element={<ProductDetailPage />} />
          </Routes>
        </ReadyGate>
      </AuthProvider>
    </MemoryRouter>,
  )
}

describe('ProductDetailPage', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  it('shows the product and returns to the product list when closed', async () => {
    const user = userEvent.setup()
    renderPage('/products/5')

    expect(await screen.findByRole('heading', { name: 'Cinta bebé' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Cerrar' }))

    expect(await screen.findByRole('heading', { name: 'Productos' })).toBeInTheDocument()
  })

  it('opens the edit form automatically when reached with ?edit=1', async () => {
    renderPage('/products/5?edit=1')

    expect(await screen.findByLabelText('Nombre')).toHaveValue('Cinta bebé')
  })

  it('changes a variant price through the modal', async () => {
    const user = userEvent.setup()
    const fetchMock = fetch as ReturnType<typeof vi.fn>
    renderPage('/products/5')

    expect(await screen.findByRole('heading', { name: 'Cinta bebé' })).toBeInTheDocument()
    expect(screen.getByText('Sin precio')).toBeInTheDocument()

    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        id: 1,
        variant_id: 10,
        business_id: 1,
        amount: '45.50',
        effective_from: new Date().toISOString(),
        effective_to: null,
        created_by_account_id: 1,
        created_at: new Date().toISOString(),
      }),
    )

    await user.click(screen.getByRole('button', { name: 'Cambiar precio' }))
    await user.type(screen.getByLabelText('Nuevo precio (ARS)'), '45.50')
    await user.click(screen.getByRole('button', { name: 'Confirmar' }))

    expect(await screen.findByText(/45,50/)).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Cambiar Precio' })).not.toBeInTheDocument()
  })
})
