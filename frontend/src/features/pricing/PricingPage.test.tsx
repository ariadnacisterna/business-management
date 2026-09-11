import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Product } from '../../api/types'
import { ToastProvider } from '../../shared/Toast'
import { AuthProvider, useAuth } from '../access/AuthContext'
import { PricingPage } from './PricingPage'

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

const PRODUCTS: Product[] = [
  {
    id: 1,
    name: 'Cinta bebé',
    category_id: 1,
    unit_id: 1,
    status: 'active',
    image_url: null,
    provider_id: null,
    variants: [
      {
        id: 10,
        product_id: 1,
        label: null,
        is_implicit: true,
        status: 'active',
        attribute_value_ids: [],
        price_amount: '150.00',
      },
    ],
  },
  {
    id: 2,
    name: 'Botones surtidos',
    category_id: 1,
    unit_id: 1,
    status: 'active',
    image_url: null,
    provider_id: null,
    variants: [
      { id: 20, product_id: 2, label: 'Chico', is_implicit: false, status: 'active', attribute_value_ids: [], price_amount: '10.00' },
      { id: 21, product_id: 2, label: 'Grande', is_implicit: false, status: 'active', attribute_value_ids: [], price_amount: '20.00' },
    ],
  },
]

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function productPage(items: Product[], overrides: Partial<{ total: number; page: number; page_size: number }> = {}) {
  return jsonResponse({ items, total: overrides.total ?? items.length, page: overrides.page ?? 1, page_size: overrides.page_size ?? 25 })
}

function currentPrice(variantId: number, amount: string | null, priceId = variantId * 100) {
  return jsonResponse({
    variant_id: variantId,
    price:
      amount === null
        ? null
        : {
            id: priceId,
            variant_id: variantId,
            business_id: 1,
            amount,
            effective_from: new Date().toISOString(),
            effective_to: null,
            created_by_account_id: 1,
            created_by_account_name: 'Ada Lovelace',
            created_at: new Date().toISOString(),
          },
  })
}

function renderPage(account: unknown, products: Product[] = PRODUCTS) {
  const fetchMock = fetch as ReturnType<typeof vi.fn>
  fetchMock.mockResolvedValueOnce(jsonResponse(account)).mockResolvedValueOnce(productPage(products))

  const activeVariants = products.flatMap((product) => product.variants.filter((variant) => variant.status === 'active'))
  for (const variant of activeVariants) {
    fetchMock.mockResolvedValueOnce(currentPrice(variant.id, variant.price_amount))
  }

  return render(
    <MemoryRouter initialEntries={['/precios']}>
      <ToastProvider>
      <AuthProvider>
        <ReadyGate>
          <Routes>
            <Route path="/precios" element={<PricingPage />} />
          </Routes>
        </ReadyGate>
      </AuthProvider>
      </ToastProvider>
    </MemoryRouter>,
  )
}

describe('PricingPage', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  it('lists each active variant with its current price', async () => {
    renderPage(ADMIN_ACCOUNT)

    expect(await screen.findByText('Cinta bebé')).toBeInTheDocument()
    expect(screen.getAllByText('Botones surtidos').length).toBeGreaterThan(0)
    expect(screen.getByText('$ 150')).toBeInTheDocument()
    expect(screen.getByText('$ 10')).toBeInTheDocument()
    expect(screen.getByText('$ 20')).toBeInTheDocument()
    expect(screen.getAllByText(/por Ada$/).length).toBeGreaterThan(0)
  })

  it('searches by product name, debouncing the request', async () => {
    const user = userEvent.setup()
    const fetchMock = fetch as ReturnType<typeof vi.fn>
    renderPage(ADMIN_ACCOUNT)

    await screen.findByText('Cinta bebé')
    fetchMock.mockResolvedValueOnce(productPage([PRODUCTS[0]], { total: 1 }))
    fetchMock.mockResolvedValueOnce(currentPrice(10, '150.00'))
    fetchMock.mockResolvedValueOnce(jsonResponse(ADMIN_ACCOUNT))

    await user.type(screen.getByLabelText('Buscar productos'), 'cinta')

    await waitFor(() => expect(screen.queryByText('Botones surtidos')).not.toBeInTheDocument(), { timeout: 2000 })

    const productCalls = fetchMock.mock.calls.filter((call) => String(call[0]).includes('/products?'))
    expect(productCalls.at(-1)?.[0]).toContain('search=cinta')
  })

  it('changes the page size and clears the search with the clear-filters button', async () => {
    const user = userEvent.setup()
    const fetchMock = fetch as ReturnType<typeof vi.fn>
    renderPage(ADMIN_ACCOUNT)

    await screen.findByText('Cinta bebé')
    const clearButton = screen.getByRole('button', { name: 'Limpiar búsqueda' })
    expect(clearButton).toBeDisabled()

    fetchMock.mockResolvedValueOnce(productPage(PRODUCTS, { total: 2, page_size: 10 }))
    fetchMock.mockResolvedValueOnce(currentPrice(10, '150.00'))
    fetchMock.mockResolvedValueOnce(currentPrice(20, '10.00'))
    fetchMock.mockResolvedValueOnce(currentPrice(21, '20.00'))

    await user.click(screen.getByRole('button', { name: 'Cantidad por página' }))
    await user.click(screen.getByRole('option', { name: '10 por página' }))

    await waitFor(() => {
      const productCalls = fetchMock.mock.calls.filter((call) => String(call[0]).includes('/products?'))
      expect(productCalls.at(-1)?.[0]).toContain('page_size=10')
    })

    await user.type(screen.getByLabelText('Buscar productos'), 'cinta')
    await waitFor(() => expect(clearButton).toBeEnabled())

    fetchMock.mockResolvedValueOnce(productPage(PRODUCTS, { total: 2, page_size: 10 }))
    fetchMock.mockResolvedValueOnce(currentPrice(10, '150.00'))
    fetchMock.mockResolvedValueOnce(currentPrice(20, '10.00'))
    fetchMock.mockResolvedValueOnce(currentPrice(21, '20.00'))

    await user.click(clearButton)

    expect(screen.getByLabelText('Buscar productos')).toHaveValue('')
    await waitFor(() => expect(clearButton).toBeDisabled())
  })

  it('does not render an inline clear icon inside the search box', async () => {
    const user = userEvent.setup()
    renderPage(ADMIN_ACCOUNT)

    await screen.findByText('Cinta bebé')
    await user.type(screen.getByLabelText('Buscar productos'), 'cinta')

    expect(screen.queryByLabelText('Limpiar búsqueda')).not.toBeInTheDocument()
  })

  it('enables Actualizar only for the row whose price was edited, and changes it on confirm', async () => {
    const user = userEvent.setup()
    const fetchMock = fetch as ReturnType<typeof vi.fn>
    renderPage(ADMIN_ACCOUNT)

    await screen.findByText('Cinta bebé')

    const priceInput = screen.getByLabelText('Nuevo precio para Cinta bebé Estándar')
    const row = priceInput.closest('[data-testid="price-row"]') as HTMLElement
    const updateButton = within(row).getByRole('button', { name: 'Actualizar' })
    expect(updateButton).toBeDisabled()

    await user.clear(priceInput)
    await user.type(priceInput, '175')
    expect(updateButton).not.toBeDisabled()

    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        id: 999,
        variant_id: 10,
        business_id: 1,
        amount: '175.00',
        effective_from: new Date().toISOString(),
        effective_to: null,
        created_by_account_id: 1,
        created_by_account_name: 'Ada Lovelace',
        created_at: new Date().toISOString(),
      }),
    )

    await user.click(updateButton)
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Confirmar' }))

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    expect(await screen.findByText('$ 175')).toBeInTheDocument()
  })

  it('surfaces the current price and lets the user reconfirm on a 409 conflict', async () => {
    const user = userEvent.setup()
    const fetchMock = fetch as ReturnType<typeof vi.fn>
    renderPage(ADMIN_ACCOUNT)

    await screen.findByText('Cinta bebé')
    const priceInput = screen.getByLabelText('Nuevo precio para Cinta bebé Estándar')
    const row = priceInput.closest('[data-testid="price-row"]') as HTMLElement
    await user.clear(priceInput)
    await user.type(priceInput, '175')
    await user.click(within(row).getByRole('button', { name: 'Actualizar' }))

    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        {
          detail: {
            message: 'El precio cambió',
            current_price: {
              id: 555,
              variant_id: 10,
              business_id: 1,
              amount: '160.00',
              effective_from: new Date().toISOString(),
              effective_to: null,
              created_by_account_id: 1,
              created_by_account_name: 'Ada Lovelace',
              created_at: new Date().toISOString(),
            },
          },
        },
        409,
      ),
    )

    await user.click(screen.getByRole('button', { name: 'Confirmar' }))

    expect(await screen.findByText(/\$\s?160 mientras tanto/)).toBeInTheDocument()

    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        id: 999,
        variant_id: 10,
        business_id: 1,
        amount: '175.00',
        effective_from: new Date().toISOString(),
        effective_to: null,
        created_by_account_id: 1,
        created_by_account_name: 'Ada Lovelace',
        created_at: new Date().toISOString(),
      }),
    )
    await user.click(screen.getByRole('button', { name: 'Confirmar' }))

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    expect(await screen.findByText('$ 175')).toBeInTheDocument()
  })

  it('offers "apply to all variants" for a product with more than one active variant', async () => {
    const user = userEvent.setup()
    const fetchMock = fetch as ReturnType<typeof vi.fn>
    renderPage(ADMIN_ACCOUNT)

    await screen.findAllByText('Botones surtidos')
    const applyAllInput = screen.getByLabelText('Nuevo precio para todas las variantes de Botones surtidos')
    await user.type(applyAllInput, '30')
    await user.click(screen.getByRole('button', { name: 'Actualizar todas' }))

    expect(screen.getByRole('alertdialog')).toBeInTheDocument()

    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        prices: [
          {
            id: 201,
            variant_id: 20,
            business_id: 1,
            amount: '30.00',
            effective_from: new Date().toISOString(),
            effective_to: null,
            created_by_account_id: 1,
            created_by_account_name: 'Ada Lovelace',
            created_at: new Date().toISOString(),
          },
          {
            id: 211,
            variant_id: 21,
            business_id: 1,
            amount: '30.00',
            effective_from: new Date().toISOString(),
            effective_to: null,
            created_by_account_id: 1,
            created_by_account_name: 'Ada Lovelace',
            created_at: new Date().toISOString(),
          },
        ],
      }),
    )
    await user.click(screen.getByRole('button', { name: 'Confirmar' }))

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    expect(await screen.findAllByText('$ 30')).toHaveLength(2)
  })

  it('shows the price history for a variant', async () => {
    const user = userEvent.setup()
    const fetchMock = fetch as ReturnType<typeof vi.fn>
    renderPage(ADMIN_ACCOUNT)

    await screen.findByText('Cinta bebé')
    fetchMock.mockResolvedValueOnce(
      jsonResponse([
        {
          id: 1,
          variant_id: 10,
          business_id: 1,
          amount: '100.00',
          effective_from: '2026-01-01T00:00:00Z',
          effective_to: '2026-02-01T00:00:00Z',
          created_by_account_id: 1,
          created_by_account_name: 'Ada Lovelace',
          created_at: '2026-01-01T00:00:00Z',
        },
        {
          id: 2,
          variant_id: 10,
          business_id: 1,
          amount: '150.00',
          effective_from: '2026-02-01T00:00:00Z',
          effective_to: null,
          created_by_account_id: 1,
          created_by_account_name: 'Ada Lovelace',
          created_at: '2026-02-01T00:00:00Z',
        },
      ]),
    )

    await user.click(screen.getByRole('button', { name: 'Ver historial de precios de Cinta bebé Estándar' }))

    const dialog = await screen.findByRole('dialog', { name: 'Historial de precios de Cinta bebé' })
    expect(within(dialog).getByText('$ 100')).toBeInTheDocument()
    expect(within(dialog).getByText('$ 150')).toBeInTheDocument()
    expect(within(dialog).getAllByText('Ada')).toHaveLength(2)

    const accountRequests = fetchMock.mock.calls.filter((call) => String(call[0]).includes('/accounts/'))
    expect(accountRequests).toHaveLength(0)
  })

  it('renders read-only for an Empleado account, without price inputs or history access', async () => {
    renderPage(EMPLOYEE_ACCOUNT)

    await screen.findByText('Cinta bebé')
    expect(screen.queryByLabelText('Nuevo precio para Cinta bebé Estándar')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Actualizar' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Actualizar todas' })).not.toBeInTheDocument()
    expect(screen.queryByText('Último cambio')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Ver historial de precios de Cinta bebé Estándar' }),
    ).not.toBeInTheDocument()
  })
})
