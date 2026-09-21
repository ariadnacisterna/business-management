import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Product } from '../../api/types'
import { ToastProvider } from '../../shared/Toast'
import { AuthProvider } from '../access/AuthContext'
import { useAuth } from '../access/useAuth'
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

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

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

function priceBody(id: number, variantId: number, amount: string) {
  return {
    id,
    variant_id: variantId,
    business_id: 1,
    amount,
    effective_from: new Date().toISOString(),
    effective_to: null,
    created_by_account_id: 1,
    created_by_account_name: 'Ada Lovelace',
    created_at: new Date().toISOString(),
  }
}

function priceResponse(id: number, variantId: number, amount: string) {
  return jsonResponse(priceBody(id, variantId, amount))
}

const CATEGORIES = [
  { id: 1, name: 'Cintas', status: 'active' },
  { id: 2, name: 'Botones', status: 'active' },
]

function renderPage(account: unknown, products: Product[] = PRODUCTS) {
  const fetchMock = fetch as ReturnType<typeof vi.fn>
  fetchMock
    .mockResolvedValueOnce(jsonResponse(account))
    .mockResolvedValueOnce(jsonResponse(CATEGORIES))
    .mockResolvedValueOnce(productPage(products))

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

  it('shows only the loading spinner, not search/view toggle, while loading', async () => {
    const fetchMock = fetch as ReturnType<typeof vi.fn>
    fetchMock
      .mockResolvedValueOnce(jsonResponse(ADMIN_ACCOUNT))
      .mockResolvedValueOnce(jsonResponse(CATEGORIES))
      .mockImplementationOnce(() => new Promise(() => {}))

    render(
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

    expect(await screen.findByRole('status')).toHaveTextContent('Cargando…')
    expect(screen.queryByPlaceholderText('Buscar por nombre…')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Ver como tarjetas')).not.toBeInTheDocument()
  })

  it('shows a normal empty state when there are no products yet, not an error', async () => {
    renderPage(ADMIN_ACCOUNT, [])

    expect(await screen.findByText('No hay precios cargados')).toBeInTheDocument()
    expect(screen.queryByText('No hay productos que coincidan.')).not.toBeInTheDocument()
    expect(screen.queryByPlaceholderText('Buscar por nombre…')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Ver como tarjetas')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Ver como tabla')).not.toBeInTheDocument()
  })

  it('shows the no-matches state when a search finds nothing', async () => {
    const user = userEvent.setup()
    const fetchMock = fetch as ReturnType<typeof vi.fn>
    renderPage(ADMIN_ACCOUNT)

    await screen.findByText('Cinta bebé')
    fetchMock.mockResolvedValueOnce(productPage([], { total: 0 }))

    await user.type(screen.getByPlaceholderText('Buscar por nombre…'), 'inexistente')

    expect(await screen.findByText('No hay productos que coincidan.')).toBeInTheDocument()
    expect(screen.getByText('Probá cambiar la búsqueda.')).toBeInTheDocument()
  })

  it('lists each active variant with its current price', async () => {
    renderPage(ADMIN_ACCOUNT)

    expect(await screen.findByText('Cinta bebé')).toBeInTheDocument()
    expect(screen.getAllByText('Botones surtidos').length).toBeGreaterThan(0)
    expect(screen.getByText('$ 150')).toBeInTheDocument()
    expect(screen.getByText('$ 10')).toBeInTheDocument()
    expect(screen.getByText('$ 20')).toBeInTheDocument()
    expect(screen.getAllByText(/por Ada$/).length).toBeGreaterThan(0)
    expect(screen.getAllByText('Cintas').length).toBeGreaterThan(0)
  })

  it('shows the category in the table view too', async () => {
    const user = userEvent.setup()
    renderPage(ADMIN_ACCOUNT)

    await screen.findByText('Cinta bebé')
    await user.click(screen.getByLabelText('Ver como tabla'))

    expect(screen.getByRole('columnheader', { name: 'Categoría' })).toBeInTheDocument()
    expect(screen.getAllByText('Cintas').length).toBeGreaterThan(0)
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

  it('asks the server to filter by category', async () => {
    const user = userEvent.setup()
    const fetchMock = fetch as ReturnType<typeof vi.fn>
    renderPage(ADMIN_ACCOUNT)

    await screen.findByText('Cinta bebé')
    fetchMock.mockResolvedValueOnce(productPage([PRODUCTS[0]], { total: 1 }))
    fetchMock.mockResolvedValueOnce(currentPrice(10, '150.00'))

    await user.click(screen.getByRole('button', { name: 'Filtrar por categoría' }))
    await user.click(screen.getByRole('option', { name: 'Cintas' }))

    await waitFor(() => expect(screen.queryByText('Botones surtidos')).not.toBeInTheDocument())
    expect(screen.getByText('Cinta bebé')).toBeInTheDocument()

    const productCalls = fetchMock.mock.calls.filter((call) => String(call[0]).includes('/products?'))
    expect(productCalls.at(-1)?.[0]).toContain('category_id=1')
  })

  it('changes the page size and clears the search with the clear-filters button', async () => {
    const user = userEvent.setup()
    const fetchMock = fetch as ReturnType<typeof vi.fn>
    renderPage(ADMIN_ACCOUNT)

    await screen.findByText('Cinta bebé')
    expect(screen.getByRole('button', { name: 'Limpiar búsqueda' })).toBeDisabled()

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

    fetchMock.mockResolvedValueOnce(productPage([PRODUCTS[0]], { total: 1, page_size: 10 }))
    fetchMock.mockResolvedValueOnce(currentPrice(10, '150.00'))

    await user.type(screen.getByLabelText('Buscar productos'), 'cinta')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Limpiar búsqueda' })).toBeEnabled())

    fetchMock.mockResolvedValueOnce(productPage(PRODUCTS, { total: 2, page_size: 10 }))
    fetchMock.mockResolvedValueOnce(currentPrice(10, '150.00'))
    fetchMock.mockResolvedValueOnce(currentPrice(20, '10.00'))
    fetchMock.mockResolvedValueOnce(currentPrice(21, '20.00'))

    await user.click(screen.getByRole('button', { name: 'Limpiar búsqueda' }))

    expect(screen.getByLabelText('Buscar productos')).toHaveValue('')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Limpiar búsqueda' })).toBeDisabled())
  })

  it('does not render an inline clear icon inside the search box', async () => {
    const user = userEvent.setup()
    renderPage(ADMIN_ACCOUNT)

    await screen.findByText('Cinta bebé')
    await user.type(screen.getByLabelText('Buscar productos'), 'cinta')

    expect(screen.queryByLabelText('Limpiar búsqueda')).not.toBeInTheDocument()
  })

  it('adds a typed amount to the current price and shows the resulting price before confirming', async () => {
    const user = userEvent.setup()
    const fetchMock = fetch as ReturnType<typeof vi.fn>
    renderPage(ADMIN_ACCOUNT)

    await screen.findByText('Cinta bebé')

    const deltaInput = screen.getByLabelText('Cuánto sumar o restar a Cinta bebé Estándar')
    const row = deltaInput.closest('[data-testid="price-row"]') as HTMLElement
    const updateButton = within(row).getByRole('button', { name: 'Actualizar' })
    expect(updateButton).toBeDisabled()

    await user.type(deltaInput, '+25')
    expect(within(row).getByTestId('delta-preview')).toHaveTextContent(/Precio:\s*\$\s150,00\s*→\s*\$\s175,00/)
    expect(updateButton).not.toBeDisabled()

    fetchMock.mockResolvedValueOnce(priceResponse(999, 10, '175.00'))

    await user.click(updateButton)
    const dialog = screen.getByRole('alertdialog')
    expect(dialog).toHaveTextContent(/\$\s150,00\s*→\s*\$\s175,00\s*\(diferencia \+\$\s25,00\)/)
    await user.click(screen.getByRole('button', { name: 'Confirmar' }))

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    expect(await screen.findByText(/^\$\s175$/)).toBeInTheDocument()
    const lastCall = fetchMock.mock.calls.at(-1)
    expect(lastCall?.[0]).toBe('/variants/10/price')
    expect(JSON.parse(lastCall?.[1]?.body as string)).toEqual({ delta: '25.00' })
    expect(await screen.findByText(/Precio actualizado:\s*\$\s150,00\s*→\s*\$\s175,00/)).toBeInTheDocument()
  })

  it('subtracts a negative amount typed with the minus sign', async () => {
    const user = userEvent.setup()
    const fetchMock = fetch as ReturnType<typeof vi.fn>
    renderPage(ADMIN_ACCOUNT)

    await screen.findByText('Cinta bebé')
    const deltaInput = screen.getByLabelText('Cuánto sumar o restar a Cinta bebé Estándar')
    const row = deltaInput.closest('[data-testid="price-row"]') as HTMLElement

    await user.type(deltaInput, '-50')
    expect(within(row).getByTestId('delta-preview')).toHaveTextContent(/Precio:\s*\$\s150,00\s*→\s*\$\s100,00/)

    fetchMock.mockResolvedValueOnce(priceResponse(999, 10, '100.00'))
    await user.click(within(row).getByRole('button', { name: 'Actualizar' }))
    expect(screen.getByRole('alertdialog')).toHaveTextContent(/\(diferencia -\$\s50,00\)/)
    await user.click(screen.getByRole('button', { name: 'Confirmar' }))

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    const lastCall = fetchMock.mock.calls.at(-1)
    expect(JSON.parse(lastCall?.[1]?.body as string)).toEqual({ delta: '-50.00' })
  })

  it('changes the whole price when the option is checked, sending the difference to the server', async () => {
    const user = userEvent.setup()
    const fetchMock = fetch as ReturnType<typeof vi.fn>
    renderPage(ADMIN_ACCOUNT)

    await screen.findByText('Cinta bebé')
    const deltaInput = screen.getByLabelText('Cuánto sumar o restar a Cinta bebé Estándar')
    const row = deltaInput.closest('[data-testid="price-row"]') as HTMLElement

    await user.click(within(row).getByLabelText('Cambiar todo el precio'))
    const wholeInput = within(row).getByLabelText('Precio nuevo para Cinta bebé Estándar')
    await user.type(wholeInput, '200')
    expect(within(row).getByTestId('delta-preview')).toHaveTextContent(/Precio:\s*\$\s150,00\s*→\s*\$\s200,00/)

    fetchMock.mockResolvedValueOnce(priceResponse(999, 10, '200.00'))
    await user.click(within(row).getByRole('button', { name: 'Actualizar' }))
    expect(screen.getByRole('alertdialog')).toHaveTextContent(/\(diferencia \+\$\s50,00\)/)
    await user.click(screen.getByRole('button', { name: 'Confirmar' }))

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    const lastCall = fetchMock.mock.calls.at(-1)
    expect(lastCall?.[0]).toBe('/variants/10/price')
    expect(JSON.parse(lastCall?.[1]?.body as string)).toEqual({ delta: '50.00' })
  })

  it('rejects a whole price equal to the current one or zero', async () => {
    const user = userEvent.setup()
    renderPage(ADMIN_ACCOUNT)

    await screen.findByText('Cinta bebé')
    const row = screen
      .getByLabelText('Cuánto sumar o restar a Cinta bebé Estándar')
      .closest('[data-testid="price-row"]') as HTMLElement
    await user.click(within(row).getByLabelText('Cambiar todo el precio'))
    const wholeInput = within(row).getByLabelText('Precio nuevo para Cinta bebé Estándar')

    await user.type(wholeInput, '150')
    expect(within(row).getByRole('alert')).toHaveTextContent('El precio nuevo es igual al actual.')
    expect(within(row).getByRole('button', { name: 'Actualizar' })).toBeDisabled()

    await user.clear(wholeInput)
    await user.type(wholeInput, '0')
    expect(within(row).getByRole('alert')).toHaveTextContent('El precio no puede quedar en cero o menos')
    expect(within(row).getByRole('button', { name: 'Actualizar' })).toBeDisabled()
  })

  it('rejects a difference that would leave the price at zero or below', async () => {
    const user = userEvent.setup()
    renderPage(ADMIN_ACCOUNT)

    await screen.findByText('Cinta bebé')
    const deltaInput = screen.getByLabelText('Cuánto sumar o restar a Cinta bebé Estándar')
    const row = deltaInput.closest('[data-testid="price-row"]') as HTMLElement

    await user.type(deltaInput, '-150')

    expect(within(row).getByRole('alert')).toHaveTextContent('El precio no puede quedar en cero o menos')
    expect(within(row).getByRole('button', { name: 'Actualizar' })).toBeDisabled()
  })

  it('rejects a zero difference', async () => {
    const user = userEvent.setup()
    renderPage(ADMIN_ACCOUNT)

    await screen.findByText('Cinta bebé')
    const deltaInput = screen.getByLabelText('Cuánto sumar o restar a Cinta bebé Estándar')
    const row = deltaInput.closest('[data-testid="price-row"]') as HTMLElement

    await user.type(deltaInput, '0')

    expect(within(row).getByRole('alert')).toHaveTextContent('La diferencia no puede ser cero.')
    expect(within(row).getByRole('button', { name: 'Actualizar' })).toBeDisabled()
  })

  it('loads the initial price of a variant without price using the absolute amount', async () => {
    const user = userEvent.setup()
    const fetchMock = fetch as ReturnType<typeof vi.fn>
    const products: Product[] = [
      {
        ...PRODUCTS[0],
        variants: [{ ...PRODUCTS[0].variants[0], price_amount: null }],
      },
    ]
    renderPage(ADMIN_ACCOUNT, products)

    await screen.findByText('Cinta bebé')
    const initialInput = screen.getByLabelText('Precio inicial para Cinta bebé Estándar')
    const row = initialInput.closest('[data-testid="price-row"]') as HTMLElement
    
    await user.type(initialInput, '80')
    fetchMock.mockResolvedValueOnce(priceResponse(999, 10, '80.00'))
    await user.click(within(row).getByRole('button', { name: 'Cargar precio' }))
    await user.click(screen.getByRole('button', { name: 'Confirmar' }))

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    const lastCall = fetchMock.mock.calls.at(-1)
    expect(lastCall?.[0]).toBe('/variants/10/price')
    expect(JSON.parse(lastCall?.[1]?.body as string)).toEqual({ amount: '80' })
    expect(await screen.findByText(/^\$\s80$/)).toBeInTheDocument()
  })

  it('offers "apply to all variants" and applies the difference to each variant', async () => {
    const user = userEvent.setup()
    const fetchMock = fetch as ReturnType<typeof vi.fn>
    renderPage(ADMIN_ACCOUNT)

    await screen.findAllByText('Botones surtidos')
    const applyAllInput = screen.getByLabelText('Cuánto sumar o restar a todas las variantes de Botones surtidos')
    await user.type(applyAllInput, '5')

    const preview = screen.getByTestId('apply-all-preview')
    expect(preview).toHaveTextContent(/Chico:\s*\$\s10,00\s*→\s*\$\s15,00/)
    expect(preview).toHaveTextContent(/Grande:\s*\$\s20,00\s*→\s*\$\s25,00/)

    await user.click(screen.getByRole('button', { name: 'Actualizar todas' }))
    expect(screen.getByRole('alertdialog')).toHaveTextContent(/\(diferencia \+\$\s5,00\)/)

    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        prices: [priceBody(201, 20, '15.00'), priceBody(211, 21, '25.00')],
        skipped_variant_ids: [],
      }),
    )
    await user.click(screen.getByRole('button', { name: 'Confirmar' }))

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    expect(await screen.findByText(/^\$\s15$/)).toBeInTheDocument()
    expect(await screen.findByText(/^\$\s25$/)).toBeInTheDocument()
    const lastCall = fetchMock.mock.calls.at(-1)
    expect(lastCall?.[0]).toBe('/products/2/price')
    expect(JSON.parse(lastCall?.[1]?.body as string)).toEqual({ delta: '5.00' })
  })

  it('blocks "apply to all" and names the variants that would reach zero', async () => {
    const user = userEvent.setup()
    renderPage(ADMIN_ACCOUNT)

    await screen.findAllByText('Botones surtidos')
    const applyAllInput = screen.getByLabelText('Cuánto sumar o restar a todas las variantes de Botones surtidos')
    await user.type(applyAllInput, '-10')

    expect(screen.getByTestId('apply-all-preview')).toHaveTextContent(
      'El precio no puede quedar en cero o menos en: Chico',
    )
    expect(screen.getByRole('button', { name: 'Actualizar todas' })).toBeDisabled()
  })

  it('reports the variants without price that "apply to all" skipped', async () => {
    const user = userEvent.setup()
    const fetchMock = fetch as ReturnType<typeof vi.fn>
    const products: Product[] = [
      {
        ...PRODUCTS[1],
        variants: [
          PRODUCTS[1].variants[0],
          { ...PRODUCTS[1].variants[1], price_amount: null },
        ],
      },
    ]
    renderPage(ADMIN_ACCOUNT, products)

    await screen.findAllByText('Botones surtidos')
    const applyAllInput = screen.getByLabelText('Cuánto sumar o restar a todas las variantes de Botones surtidos')
    await user.type(applyAllInput, '5')
    expect(screen.getByTestId('apply-all-preview')).toHaveTextContent('Grande: sin precio, no se modifica')

    fetchMock.mockResolvedValueOnce(
      jsonResponse({ prices: [priceBody(201, 20, '15.00')], skipped_variant_ids: [21] }),
    )
    await user.click(screen.getByRole('button', { name: 'Actualizar todas' }))
    expect(screen.getByRole('alertdialog')).toHaveTextContent('Sin precio, no se modifican: Grande.')
    await user.click(screen.getByRole('button', { name: 'Confirmar' }))

    expect(await screen.findByText(/Se omitieron por no tener precio: Grande/)).toBeInTheDocument()
  })

  it('shows the server message when the change is rejected', async () => {
    const user = userEvent.setup()
    const fetchMock = fetch as ReturnType<typeof vi.fn>
    renderPage(ADMIN_ACCOUNT)

    await screen.findByText('Cinta bebé')
    const deltaInput = screen.getByLabelText('Cuánto sumar o restar a Cinta bebé Estándar')
    const row = deltaInput.closest('[data-testid="price-row"]') as HTMLElement
    await user.type(deltaInput, '10')
    fetchMock.mockResolvedValueOnce(jsonResponse({ detail: 'El precio no puede quedar en cero o menos' }, 422))
    await user.click(within(row).getByRole('button', { name: 'Actualizar' }))
    await user.click(screen.getByRole('button', { name: 'Confirmar' }))

    expect(await screen.findByText('El precio no puede quedar en cero o menos')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
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
    const [newestEntry, oldestEntry] = within(dialog).getAllByRole('listitem')
    expect(within(newestEntry).getByText('$ 150')).toBeInTheDocument()
    expect(within(newestEntry).getByText('$ 100 → $ 150')).toBeInTheDocument()
    expect(within(oldestEntry).getByText('$ 100', { selector: 'span' })).toBeInTheDocument()
    expect(within(dialog).getAllByText('Cambiado por: Ada')).toHaveLength(2)

    const accountRequests = fetchMock.mock.calls.filter((call) => String(call[0]).includes('/accounts/'))
    expect(accountRequests).toHaveLength(0)
  })

  it('discards a stale category-filter response that resolves after a newer one', async () => {
    const user = userEvent.setup()
    const fetchMock = fetch as ReturnType<typeof vi.fn>
    renderPage(ADMIN_ACCOUNT)

    await screen.findByText('Cinta bebé')
    const baseCallCount = fetchMock.mock.calls.length

    const staleProduct: Product = {
      ...PRODUCTS[0],
      id: 101,
      name: 'Resultado viejo',
      variants: [{ ...PRODUCTS[0].variants[0], id: 910 }],
    }
    const freshProduct: Product = {
      ...PRODUCTS[0],
      id: 102,
      name: 'Resultado nuevo',
      variants: [{ ...PRODUCTS[0].variants[0], id: 920 }],
    }

    const stale = deferred<Response>()
    const fresh = deferred<Response>()
    // Call #1: fired by the category click below (search not applied yet).
    fetchMock.mockImplementationOnce(() => stale.promise)
    // Call #2: fired once the search debounce settles a moment later.
    fetchMock.mockImplementationOnce(() => fresh.promise)
    fetchMock.mockResolvedValueOnce(currentPrice(920, '10.00'))

    fireEvent.change(screen.getByLabelText('Buscar productos'), { target: { value: 'cinta' } })

    await user.click(screen.getByRole('button', { name: 'Filtrar por categoría' }))
    await user.click(screen.getByRole('option', { name: 'Cintas' }))
    await waitFor(() => expect(fetchMock.mock.calls.length).toBe(baseCallCount + 1))

    await waitFor(() => expect(fetchMock.mock.calls.length).toBe(baseCallCount + 2), { timeout: 2000 })

    fresh.resolve(productPage([freshProduct], { total: 1 }))
    await waitFor(() => expect(screen.getByText('Resultado nuevo')).toBeInTheDocument())
    expect(screen.queryByText('Resultado viejo')).not.toBeInTheDocument()

    stale.resolve(productPage([staleProduct], { total: 1 }))

    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(screen.getByText('Resultado nuevo')).toBeInTheDocument()
    expect(screen.queryByText('Resultado viejo')).not.toBeInTheDocument()
  })

  it('renders read-only for an Empleado account, without price inputs or history access', async () => {
    renderPage(EMPLOYEE_ACCOUNT)

    await screen.findByText('Cinta bebé')
    expect(screen.queryByLabelText('Cuánto sumar o restar a Cinta bebé Estándar')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Actualizar' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Actualizar todas' })).not.toBeInTheDocument()
    expect(screen.queryByText('Último cambio')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Ver historial de precios de Cinta bebé Estándar' }),
    ).not.toBeInTheDocument()
  })
})
