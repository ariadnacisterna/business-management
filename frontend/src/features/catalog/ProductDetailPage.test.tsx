import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../../shared/Toast'
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
  provider_id: null,
  variants: [{ id: 10, product_id: 5, label: 'Estándar', is_implicit: false, status: 'active', attribute_value_ids: [] }],
}

const EMPTY_PRODUCT_PAGE = { items: [], total: 0, page: 1, page_size: 10 }

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function stockResponse(variantId: number, overrides: Partial<{ quantity: number; status: string }> = {}) {
  return jsonResponse({
    items: [
      {
        product_id: 5,
        product_name: 'Producto',
        image_url: null,
        category_id: 1,
        unit_id: 1,
        variant_id: variantId,
        variant_label: null,
        quantity: overrides.quantity ?? 0,
        minimum_quantity: null,
        effective_minimum_quantity: 10,
        status: overrides.status ?? 'sin_stock',
        last_movement_at: null,
        last_movement_by_account_name: null,
      },
    ],
    total: 1,
    page: 1,
    page_size: 25,
  })
}

function reasonsResponse() {
  return jsonResponse([])
}

function multiStockResponse(variantIds: number[]) {
  return jsonResponse({
    items: variantIds.map((variantId) => ({
      product_id: 5,
      product_name: 'Producto',
      image_url: null,
      category_id: 1,
      unit_id: 1,
      variant_id: variantId,
      variant_label: null,
      quantity: 0,
      minimum_quantity: null,
      effective_minimum_quantity: 10,
      status: 'sin_stock',
      last_movement_at: null,
      last_movement_by_account_name: null,
    })),
    total: variantIds.length,
    page: 1,
    page_size: 25,
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
    .mockResolvedValueOnce(jsonResponse([]))
    .mockResolvedValueOnce(jsonResponse({ variant_id: 10, price: null }))
    .mockResolvedValueOnce(stockResponse(10))
    .mockResolvedValueOnce(reasonsResponse())

  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <ToastProvider>
      <AuthProvider>
        <ReadyGate>
          <Routes>
            <Route path="/products" element={<h1>Productos</h1>} />
            <Route path="/products/:productId" element={<ProductDetailPage />} />
          </Routes>
        </ReadyGate>
      </AuthProvider>
      </ToastProvider>
    </MemoryRouter>,
  )
}

const SINGLE_VARIANT_PRODUCT = {
  id: 6,
  name: 'Tijera',
  category_id: 1,
  unit_id: 1,
  status: 'active',
  variants: [{ id: 20, product_id: 6, label: null, is_implicit: true, status: 'active', attribute_value_ids: [] }],
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

    expect(await screen.findByLabelText(/^Nombre\s?\*?$/)).toHaveValue('Cinta bebé')
  })

  it('changes a variant price through the modal', async () => {
    const user = userEvent.setup()
    const fetchMock = fetch as ReturnType<typeof vi.fn>
    renderPage('/products/5?edit=1')

    expect(await screen.findByLabelText(/^Nombre\s?\*?$/)).toHaveValue('Cinta bebé')
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
        created_by_account_name: 'Ada Lovelace',
        created_at: new Date().toISOString(),
      }),
    )

    await user.click(screen.getByRole('button', { name: 'Cambiar precio' }))

    await user.type(screen.getByLabelText('Nuevo precio (ARS)'), '45.50')
    await user.click(screen.getByRole('button', { name: 'Confirmar' }))

    expect(await screen.findByText(/45,50/)).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Cambiar Precio' })).not.toBeInTheDocument()
  })

  it('opens the price history dialog for a variant', async () => {
    const user = userEvent.setup()
    const fetchMock = fetch as ReturnType<typeof vi.fn>
    renderPage('/products/5')

    expect(await screen.findByRole('heading', { name: 'Cinta bebé' })).toBeInTheDocument()

    fetchMock.mockResolvedValueOnce(
      jsonResponse([
        {
          id: 1,
          variant_id: 10,
          business_id: 1,
          amount: '45.50',
          effective_from: '2026-01-01T00:00:00Z',
          effective_to: null,
          created_by_account_id: 1,
          created_by_account_name: 'Ada Lovelace',
          created_at: '2026-01-01T00:00:00Z',
        },
      ]),
    )

    await user.click(screen.getAllByRole('button', { name: 'Ver historial' })[0])

    expect(await screen.findByRole('dialog', { name: /Historial de precios/ })).toBeInTheDocument()
    expect(await screen.findByText(/45,50/)).toBeInTheDocument()
  })

  it('shows a single price with a "Cambiar precio" action for a product without real variants', async () => {
    const fetchMock = fetch as ReturnType<typeof vi.fn>
    fetchMock
      .mockResolvedValueOnce(jsonResponse(ADMIN_ACCOUNT))
      .mockResolvedValueOnce(jsonResponse(SINGLE_VARIANT_PRODUCT))
      .mockResolvedValueOnce(jsonResponse(CATEGORIES))
      .mockResolvedValueOnce(jsonResponse(UNITS))
      .mockResolvedValueOnce(jsonResponse([]))
      .mockResolvedValueOnce(jsonResponse([]))
      .mockResolvedValueOnce(jsonResponse({ variant_id: 20, price: null }))
      .mockResolvedValueOnce(stockResponse(20))
      .mockResolvedValueOnce(reasonsResponse())

    render(
      <MemoryRouter initialEntries={['/products/6?edit=1']}>
        <ToastProvider>
        <AuthProvider>
          <ReadyGate>
            <Routes>
              <Route path="/products" element={<h1>Productos</h1>} />
              <Route path="/products/:productId" element={<ProductDetailPage />} />
            </Routes>
          </ReadyGate>
        </AuthProvider>
        </ToastProvider>
      </MemoryRouter>,
    )

    expect(await screen.findByRole('heading', { name: 'Precio' })).toBeInTheDocument()
    expect(screen.getByText('Sin precio')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cambiar precio' })).toBeInTheDocument()
  })

  it('hides "Último cambio" and "Ver historial" for an empleado', async () => {
    const fetchMock = fetch as ReturnType<typeof vi.fn>
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ ...ADMIN_ACCOUNT, role: 'Empleado' }))
      .mockResolvedValueOnce(jsonResponse(SINGLE_VARIANT_PRODUCT))
      .mockResolvedValueOnce(jsonResponse(CATEGORIES))
      .mockResolvedValueOnce(jsonResponse(UNITS))
      .mockResolvedValueOnce(jsonResponse([]))
      .mockResolvedValueOnce(jsonResponse([]))
      .mockResolvedValueOnce(jsonResponse({ variant_id: 20, price: null }))

    render(
      <MemoryRouter initialEntries={['/products/6']}>
        <ToastProvider>
        <AuthProvider>
          <ReadyGate>
            <Routes>
              <Route path="/products" element={<h1>Productos</h1>} />
              <Route path="/products/:productId" element={<ProductDetailPage />} />
            </Routes>
          </ReadyGate>
        </AuthProvider>
        </ToastProvider>
      </MemoryRouter>,
    )

    expect(await screen.findByRole('heading', { name: 'Precio' })).toBeInTheDocument()
    expect(screen.queryByText(/Último cambio/)).not.toBeInTheDocument()
    expect(screen.queryByText(/^Stock:/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Ver historial' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Cambiar precio' })).not.toBeInTheDocument()
  })

  it('shows read-only stock quantity and status for a Gerente or above', async () => {
    const fetchMock = fetch as ReturnType<typeof vi.fn>
    fetchMock
      .mockResolvedValueOnce(jsonResponse(ADMIN_ACCOUNT))
      .mockResolvedValueOnce(jsonResponse(SINGLE_VARIANT_PRODUCT))
      .mockResolvedValueOnce(jsonResponse(CATEGORIES))
      .mockResolvedValueOnce(jsonResponse(UNITS))
      .mockResolvedValueOnce(jsonResponse([]))
      .mockResolvedValueOnce(jsonResponse([]))
      .mockResolvedValueOnce(jsonResponse({ variant_id: 20, price: null }))
      .mockResolvedValueOnce(
        jsonResponse({
          items: [
            {
              product_id: 6,
              product_name: 'Tijera',
              image_url: null,
              category_id: 1,
              unit_id: 1,
              variant_id: 20,
              variant_label: null,
              quantity: 7,
              minimum_quantity: null,
              effective_minimum_quantity: 10,
              status: 'stock_bajo',
              last_movement_at: '2026-01-01T00:00:00Z',
              last_movement_by_account_name: 'Ada Lovelace',
            },
          ],
          total: 1,
          page: 1,
          page_size: 25,
        }),
      )
      .mockResolvedValueOnce(reasonsResponse())

    render(
      <MemoryRouter initialEntries={['/products/6?edit=1']}>
        <ToastProvider>
        <AuthProvider>
          <ReadyGate>
            <Routes>
              <Route path="/products" element={<h1>Productos</h1>} />
              <Route path="/products/:productId" element={<ProductDetailPage />} />
            </Routes>
          </ReadyGate>
        </AuthProvider>
        </ToastProvider>
      </MemoryRouter>,
    )

    expect(await screen.findByRole('heading', { name: 'Precio' })).toBeInTheDocument()
    expect(
      await screen.findByText((_, element) => element?.tagName === 'P' && element.textContent === '7 (Stock bajo)'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Actualizar stock' })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Ver historial' }).length).toBe(2)
    expect(screen.getByText(/hace.*por Ada/)).toBeInTheDocument()
  })

  it('adjusts stock through the "Actualizar stock" modal after confirming', async () => {
    const user = userEvent.setup()
    const fetchMock = fetch as ReturnType<typeof vi.fn>
    fetchMock
      .mockResolvedValueOnce(jsonResponse(ADMIN_ACCOUNT))
      .mockResolvedValueOnce(jsonResponse(SINGLE_VARIANT_PRODUCT))
      .mockResolvedValueOnce(jsonResponse(CATEGORIES))
      .mockResolvedValueOnce(jsonResponse(UNITS))
      .mockResolvedValueOnce(jsonResponse([]))
      .mockResolvedValueOnce(jsonResponse([]))
      .mockResolvedValueOnce(jsonResponse({ variant_id: 20, price: null }))
      .mockResolvedValueOnce(stockResponse(20, { quantity: 7, status: 'stock_bajo' }))
      .mockResolvedValueOnce(jsonResponse([{ id: 1, name: 'Conteo físico', status: 'active' }]))

    render(
      <MemoryRouter initialEntries={['/products/6?edit=1']}>
        <ToastProvider>
        <AuthProvider>
          <ReadyGate>
            <Routes>
              <Route path="/products" element={<h1>Productos</h1>} />
              <Route path="/products/:productId" element={<ProductDetailPage />} />
            </Routes>
          </ReadyGate>
        </AuthProvider>
        </ToastProvider>
      </MemoryRouter>,
    )

    expect(
      await screen.findByText((_, element) => element?.tagName === 'P' && element.textContent === '7 (Stock bajo)'),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Actualizar stock' }))

    await user.type(screen.getByLabelText(/^Cantidad nueva/), '20')
    await user.click(screen.getByRole('button', { name: 'Motivo del ajuste' }))
    await user.click(screen.getByRole('option', { name: 'Conteo físico' }))

    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        id: 1,
        variant_id: 20,
        reason_id: 1,
        quantity_before: 7,
        quantity_after: 20,
        observation: null,
        created_at: new Date().toISOString(),
        created_by_account_id: 1,
        created_by_account_name: 'Ada Lovelace',
      }),
    )
    await user.click(screen.getByRole('button', { name: 'Confirmar' }))
    expect(await screen.findByRole('alertdialog')).toBeInTheDocument()

    fetchMock.mockResolvedValueOnce(stockResponse(20, { quantity: 20, status: 'normal' }))
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Confirmar' }))

    expect(await screen.findByText('¡Listo!')).toBeInTheDocument()
    expect(
      await screen.findByText((_, element) => element?.tagName === 'P' && element.textContent === '20 (Normal)'),
    ).toBeInTheDocument()
  })

  it('warns when the stock refetch fails after adjusting stock', async () => {
    const user = userEvent.setup()
    const fetchMock = fetch as ReturnType<typeof vi.fn>
    fetchMock
      .mockResolvedValueOnce(jsonResponse(ADMIN_ACCOUNT))
      .mockResolvedValueOnce(jsonResponse(SINGLE_VARIANT_PRODUCT))
      .mockResolvedValueOnce(jsonResponse(CATEGORIES))
      .mockResolvedValueOnce(jsonResponse(UNITS))
      .mockResolvedValueOnce(jsonResponse([]))
      .mockResolvedValueOnce(jsonResponse([]))
      .mockResolvedValueOnce(jsonResponse({ variant_id: 20, price: null }))
      .mockResolvedValueOnce(stockResponse(20, { quantity: 7, status: 'stock_bajo' }))
      .mockResolvedValueOnce(jsonResponse([{ id: 1, name: 'Conteo físico', status: 'active' }]))

    render(
      <MemoryRouter initialEntries={['/products/6?edit=1']}>
        <ToastProvider>
        <AuthProvider>
          <ReadyGate>
            <Routes>
              <Route path="/products" element={<h1>Productos</h1>} />
              <Route path="/products/:productId" element={<ProductDetailPage />} />
            </Routes>
          </ReadyGate>
        </AuthProvider>
        </ToastProvider>
      </MemoryRouter>,
    )

    expect(
      await screen.findByText((_, element) => element?.tagName === 'P' && element.textContent === '7 (Stock bajo)'),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Actualizar stock' }))

    await user.type(screen.getByLabelText(/^Cantidad nueva/), '20')
    await user.click(screen.getByRole('button', { name: 'Motivo del ajuste' }))
    await user.click(screen.getByRole('option', { name: 'Conteo físico' }))

    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        id: 1,
        variant_id: 20,
        reason_id: 1,
        quantity_before: 7,
        quantity_after: 20,
        observation: null,
        created_at: new Date().toISOString(),
        created_by_account_id: 1,
        created_by_account_name: 'Ada Lovelace',
      }),
    )
    await user.click(screen.getByRole('button', { name: 'Confirmar' }))
    expect(await screen.findByRole('alertdialog')).toBeInTheDocument()

    fetchMock.mockRejectedValueOnce(new Error('network error'))
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Confirmar' }))

    expect(await screen.findByText('Stock actualizado.')).toBeInTheDocument()
    expect(
      await screen.findByText('El ajuste de stock se guardó, pero no se pudo actualizar la pantalla. Recargá para ver el stock actual.'),
    ).toBeInTheDocument()
  })

  it('asks for confirmation before deactivating and saves after confirming', async () => {
    const user = userEvent.setup()
    const fetchMock = fetch as ReturnType<typeof vi.fn>
    renderPage('/products/5?edit=1')

    await screen.findByLabelText(/^Nombre\s?\*?$/)
    await user.click(screen.getByRole('button', { name: '○ Inactivo' }))
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    expect(await screen.findByRole('alertdialog', { name: 'Desactivar producto' })).toBeInTheDocument()

    fetchMock
      .mockResolvedValueOnce(jsonResponse(PRODUCT))
      .mockResolvedValueOnce(jsonResponse({ ...PRODUCT, status: 'inactive' }))
    await user.click(screen.getByRole('button', { name: 'Desactivar' }))

    expect(await screen.findByRole('heading', { name: 'Productos' })).toBeInTheDocument()
  })

  it('navigates back to the products list when canceling the edit', async () => {
    const user = userEvent.setup()
    renderPage('/products/5?edit=1')

    await screen.findByLabelText(/^Nombre\s?\*?$/)
    await user.click(screen.getByRole('button', { name: 'Cancelar' }))

    expect(await screen.findByRole('heading', { name: 'Productos' })).toBeInTheDocument()
  })

  it('deactivates a variant after confirming, marking it inactive but still visible', async () => {
    const user = userEvent.setup()
    const fetchMock = fetch as ReturnType<typeof vi.fn>
    const multiVariantProduct = {
      ...PRODUCT,
      variants: [
        { id: 10, product_id: 5, label: 'Chico', is_implicit: false, status: 'active', attribute_value_ids: [] },
        { id: 11, product_id: 5, label: 'Grande', is_implicit: false, status: 'active', attribute_value_ids: [] },
      ],
    }
    fetchMock
      .mockResolvedValueOnce(jsonResponse(ADMIN_ACCOUNT))
      .mockResolvedValueOnce(jsonResponse(multiVariantProduct))
      .mockResolvedValueOnce(jsonResponse(CATEGORIES))
      .mockResolvedValueOnce(jsonResponse(UNITS))
      .mockResolvedValueOnce(jsonResponse([]))
      .mockResolvedValueOnce(jsonResponse([]))
      .mockResolvedValueOnce(jsonResponse({ variant_id: 10, price: null }))
      .mockResolvedValueOnce(jsonResponse({ variant_id: 11, price: null }))
      .mockResolvedValueOnce(multiStockResponse([10, 11]))
      .mockResolvedValueOnce(reasonsResponse())

    render(
      <MemoryRouter initialEntries={['/products/5?edit=1']}>
        <ToastProvider>
        <AuthProvider>
          <ReadyGate>
            <Routes>
              <Route path="/products" element={<h1>Productos</h1>} />
              <Route path="/products/:productId" element={<ProductDetailPage />} />
            </Routes>
          </ReadyGate>
        </AuthProvider>
        </ToastProvider>
      </MemoryRouter>,
    )

    expect(await screen.findByText('Chico')).toBeInTheDocument()

    const chicoItem = screen.getByText('Chico').closest('li') as HTMLElement
    await user.click(within(chicoItem).getByRole('button', { name: 'Acciones para Chico' }))
    await user.click(await screen.findByRole('button', { name: 'Desactivar' }))

    const dialog = await screen.findByRole('alertdialog', { name: 'Desactivar variante' })
    expect(dialog).toHaveTextContent('Chico')

    fetchMock.mockResolvedValueOnce(
      jsonResponse({ id: 10, product_id: 5, label: 'Chico', is_implicit: false, status: 'inactive', attribute_value_ids: [] }),
    )
    await user.click(within(dialog).getByRole('button', { name: 'Desactivar' }))

    await screen.findByText('Inactiva')
    expect(screen.getByText('Chico')).toBeInTheDocument()
    expect(within(chicoItem).queryByRole('button', { name: 'Cambiar precio' })).not.toBeInTheDocument()

    await user.click(within(chicoItem).getByRole('button', { name: 'Acciones para Chico' }))
    expect(await screen.findByRole('button', { name: 'Activar' })).toBeInTheDocument()
  })

  it('cancels a variant status change without applying it', async () => {
    const user = userEvent.setup()
    const fetchMock = fetch as ReturnType<typeof vi.fn>
    const multiVariantProduct = {
      ...PRODUCT,
      variants: [
        { id: 10, product_id: 5, label: 'Chico', is_implicit: false, status: 'active', attribute_value_ids: [] },
        { id: 11, product_id: 5, label: 'Grande', is_implicit: false, status: 'active', attribute_value_ids: [] },
      ],
    }
    fetchMock
      .mockResolvedValueOnce(jsonResponse(ADMIN_ACCOUNT))
      .mockResolvedValueOnce(jsonResponse(multiVariantProduct))
      .mockResolvedValueOnce(jsonResponse(CATEGORIES))
      .mockResolvedValueOnce(jsonResponse(UNITS))
      .mockResolvedValueOnce(jsonResponse([]))
      .mockResolvedValueOnce(jsonResponse([]))
      .mockResolvedValueOnce(jsonResponse({ variant_id: 10, price: null }))
      .mockResolvedValueOnce(jsonResponse({ variant_id: 11, price: null }))
      .mockResolvedValueOnce(multiStockResponse([10, 11]))
      .mockResolvedValueOnce(reasonsResponse())

    render(
      <MemoryRouter initialEntries={['/products/5?edit=1']}>
        <ToastProvider>
        <AuthProvider>
          <ReadyGate>
            <Routes>
              <Route path="/products" element={<h1>Productos</h1>} />
              <Route path="/products/:productId" element={<ProductDetailPage />} />
            </Routes>
          </ReadyGate>
        </AuthProvider>
        </ToastProvider>
      </MemoryRouter>,
    )

    expect(await screen.findByText('Chico')).toBeInTheDocument()
    const chicoItem = screen.getByText('Chico').closest('li') as HTMLElement
    await user.click(within(chicoItem).getByRole('button', { name: 'Acciones para Chico' }))
    await user.click(await screen.findByRole('button', { name: 'Desactivar' }))

    const dialog = await screen.findByRole('alertdialog', { name: 'Desactivar variante' })
    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }))

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(screen.queryByText('Inactiva')).not.toBeInTheDocument()

    await user.click(within(chicoItem).getByRole('button', { name: 'Acciones para Chico' }))
    expect(await screen.findByRole('button', { name: 'Desactivar' })).toBeInTheDocument()
  })

  it('does not allow deactivating the only implicit variant of a product', async () => {
    const fetchMock = fetch as ReturnType<typeof vi.fn>
    fetchMock
      .mockResolvedValueOnce(jsonResponse(ADMIN_ACCOUNT))
      .mockResolvedValueOnce(jsonResponse(SINGLE_VARIANT_PRODUCT))
      .mockResolvedValueOnce(jsonResponse(CATEGORIES))
      .mockResolvedValueOnce(jsonResponse(UNITS))
      .mockResolvedValueOnce(jsonResponse([]))
      .mockResolvedValueOnce(jsonResponse([]))
      .mockResolvedValueOnce(jsonResponse({ variant_id: 20, price: null }))
      .mockResolvedValueOnce(stockResponse(20))
      .mockResolvedValueOnce(reasonsResponse())

    render(
      <MemoryRouter initialEntries={['/products/6']}>
        <ToastProvider>
        <AuthProvider>
          <ReadyGate>
            <Routes>
              <Route path="/products" element={<h1>Productos</h1>} />
              <Route path="/products/:productId" element={<ProductDetailPage />} />
            </Routes>
          </ReadyGate>
        </AuthProvider>
        </ToastProvider>
      </MemoryRouter>,
    )

    expect(await screen.findByRole('heading', { name: 'Precio' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Desactivar' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Activar' })).not.toBeInTheDocument()
  })

  it('keeps the edit draft when canceling the status change confirmation', async () => {
    const user = userEvent.setup()
    const fetchMock = fetch as ReturnType<typeof vi.fn>
    renderPage('/products/5?edit=1')

    const nameInput = await screen.findByLabelText(/^Nombre\s?\*?$/)
    await user.clear(nameInput)
    await user.type(nameInput, 'Cinta nueva')
    await user.click(screen.getByRole('button', { name: '○ Inactivo' }))

    fetchMock.mockResolvedValueOnce(jsonResponse(EMPTY_PRODUCT_PAGE))
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    const dialog = await screen.findByRole('alertdialog', { name: 'Desactivar producto' })
    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }))

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(screen.getByLabelText(/^Nombre\s?\*?$/)).toHaveValue('Cinta nueva')
    expect(screen.getByRole('button', { name: '○ Inactivo' })).toBeInTheDocument()
  })

  it('shows an error and marks the name field as soon as it is left empty', async () => {
    const user = userEvent.setup()
    renderPage('/products/5?edit=1')

    const nameInput = await screen.findByLabelText(/^Nombre\s?\*?$/)
    await user.clear(nameInput)
    await user.tab()

    expect(screen.getByText('El nombre es obligatorio.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeDisabled()
  })

  it('changes the preferred provider and saves after confirming', async () => {
    const user = userEvent.setup()
    const fetchMock = fetch as ReturnType<typeof vi.fn>
    const providers = [
      { id: 1, name: 'Textiles del Sur', contact_name: null, email: null, phone: null, last_purchase_at: null, status: 'active', category_ids: [] },
      { id: 2, name: 'Mercería Central', contact_name: null, email: null, phone: null, last_purchase_at: null, status: 'active', category_ids: [] },
    ]
    fetchMock
      .mockResolvedValueOnce(jsonResponse(ADMIN_ACCOUNT))
      .mockResolvedValueOnce(jsonResponse(PRODUCT))
      .mockResolvedValueOnce(jsonResponse(CATEGORIES))
      .mockResolvedValueOnce(jsonResponse(UNITS))
      .mockResolvedValueOnce(jsonResponse([]))
      .mockResolvedValueOnce(jsonResponse(providers))
      .mockResolvedValueOnce(jsonResponse({ variant_id: 10, price: null }))
      .mockResolvedValueOnce(stockResponse(10))
      .mockResolvedValueOnce(reasonsResponse())

    render(
      <MemoryRouter initialEntries={['/products/5?edit=1']}>
        <ToastProvider>
        <AuthProvider>
          <ReadyGate>
            <Routes>
              <Route path="/products" element={<h1>Productos</h1>} />
              <Route path="/products/:productId" element={<ProductDetailPage />} />
            </Routes>
          </ReadyGate>
        </AuthProvider>
        </ToastProvider>
      </MemoryRouter>,
    )

    expect(await screen.findByLabelText(/^Nombre\s?\*?$/)).toHaveValue('Cinta bebé')
    expect(screen.getByRole('button', { name: 'Proveedor' })).toHaveTextContent('Sin proveedor asignado')

    await user.click(screen.getByRole('button', { name: 'Proveedor' }))
    await user.click(await screen.findByRole('option', { name: 'Mercería Central' }))

    fetchMock
      .mockResolvedValueOnce(jsonResponse(PRODUCT))
      .mockResolvedValueOnce(jsonResponse({ ...PRODUCT, provider_id: 2 }))
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    const dialog = await screen.findByRole('alertdialog', { name: 'Guardar cambios' })
    await user.click(within(dialog).getByRole('button', { name: 'Guardar' }))

    expect(await screen.findByText('¡Listo!')).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'Productos' })).toBeInTheDocument()
    const lastCall = fetchMock.mock.calls.at(-1)!
    expect(lastCall[0]).toContain('/products/5/provider')
    expect(JSON.parse((lastCall[1] as RequestInit).body as string)).toEqual({ provider_id: 2 })
  })

  it('loads the product for a Gerente account even if /providers responds 403', async () => {
    const fetchMock = fetch as ReturnType<typeof vi.fn>
    const GERENTE_ACCOUNT = { ...ADMIN_ACCOUNT, role: 'Gerente' }
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/providers')) return Promise.resolve(jsonResponse({ detail: 'Permiso denegado' }, 403))
      if (url === '/auth/me') return Promise.resolve(jsonResponse(GERENTE_ACCOUNT))
      if (url === '/products/5') return Promise.resolve(jsonResponse(PRODUCT))
      if (url === '/categories') return Promise.resolve(jsonResponse(CATEGORIES))
      if (url === '/units') return Promise.resolve(jsonResponse(UNITS))
      if (url === '/attributes') return Promise.resolve(jsonResponse([]))
      if (url === '/variants/10/price') return Promise.resolve(jsonResponse({ variant_id: 10, price: null }))
      if (url === '/stock') return Promise.resolve(stockResponse(10))
      if (url === '/movement-reasons') return Promise.resolve(reasonsResponse())
      return Promise.resolve(jsonResponse([]))
    })

    render(
      <MemoryRouter initialEntries={['/products/5']}>
        <ToastProvider>
        <AuthProvider>
          <ReadyGate>
            <Routes>
              <Route path="/products" element={<h1>Productos</h1>} />
              <Route path="/products/:productId" element={<ProductDetailPage />} />
            </Routes>
          </ReadyGate>
        </AuthProvider>
        </ToastProvider>
      </MemoryRouter>,
    )

    expect(await screen.findByRole('heading', { name: 'Cinta bebé' })).toBeInTheDocument()
    expect(screen.queryByText('Proveedor')).not.toBeInTheDocument()
    expect(fetchMock.mock.calls.some((call) => String(call[0]).includes('/providers'))).toBe(false)
  })

  it('blocks renaming to a duplicate product name before showing the confirmation', async () => {
    const user = userEvent.setup()
    const fetchMock = fetch as ReturnType<typeof vi.fn>
    renderPage('/products/5?edit=1')

    const nameInput = await screen.findByLabelText(/^Nombre\s?\*?$/)
    await user.clear(nameInput)
    await user.type(nameInput, 'Otro producto')

    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        items: [{ id: 9, name: 'Otro producto', category_id: 1, unit_id: 1, status: 'active', image_url: null, variants: [] }],
        total: 1,
        page: 1,
        page_size: 10,
      }),
    )
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    expect(await screen.findByText('Ya existe un producto con ese nombre.')).toBeInTheDocument()
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('warns without blocking the save when the duplicate name check fails', async () => {
    const user = userEvent.setup()
    const fetchMock = fetch as ReturnType<typeof vi.fn>
    renderPage('/products/5?edit=1')

    const nameInput = await screen.findByLabelText(/^Nombre\s?\*?$/)
    await user.clear(nameInput)
    await user.type(nameInput, 'Otro producto')

    fetchMock.mockRejectedValueOnce(new Error('network error'))
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    expect(
      await screen.findByText('No se pudo verificar si el nombre está repetido. El producto se guardará igual.'),
    ).toBeInTheDocument()
    expect(await screen.findByRole('alertdialog', { name: 'Guardar cambios' })).toBeInTheDocument()
  })
})
