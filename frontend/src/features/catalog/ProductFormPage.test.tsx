import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../../shared/Toast'
import { AuthProvider } from '../access/AuthContext'
import { useAuth } from '../access/useAuth'
import { ProductFormPage } from './ProductFormPage'

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

const EMPLOYEE_ACCOUNT = {
  id: 2,
  name: 'Grace Hopper',
  user_name: 'grace',
  status: 'activo',
  role: 'Empleado',
  active_business_id: 1,
  businesses: [{ id: 1, name: 'Mercería', industry: 'Mercería' }],
}

const CATEGORIES = [{ id: 1, name: 'Mercería', status: 'active' }]
const UNITS = [{ id: 1, name: 'Unidad', abbreviation: 'un', allows_fraction: false, status: 'active' }]
const ATTRIBUTES = [{ id: 1, name: 'Color', status: 'active' }]
const PROVIDERS: unknown[] = []
const EMPTY_PRODUCT_PAGE = { items: [], total: 0, page: 1, page_size: 10 }

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

async function pickOption(user: ReturnType<typeof userEvent.setup>, label: string, optionName: string) {
  await user.click(screen.getByRole('button', { name: label }))
  await user.click(await screen.findByRole('option', { name: optionName }))
}

function mockInitialLoad(fetchMock: ReturnType<typeof vi.fn>, account: unknown) {
  fetchMock
    .mockResolvedValueOnce(jsonResponse(account))
    .mockResolvedValueOnce(jsonResponse(CATEGORIES))
    .mockResolvedValueOnce(jsonResponse(UNITS))
    .mockResolvedValueOnce(jsonResponse(ATTRIBUTES))
    .mockResolvedValueOnce(jsonResponse(PROVIDERS))
}

async function fillStep1AndContinue(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.type(await screen.findByLabelText(/^Nombre \*?$/), name)
  await pickOption(user, 'Categoría', 'Mercería')
  await pickOption(user, 'Unidad', 'Unidad (un)')
  await user.click(screen.getByRole('button', { name: 'Continuar' }))
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/products/new']}>
      <ToastProvider>
        <AuthProvider>
          <ReadyGate>
            <ProductFormPage />
          </ReadyGate>
        </AuthProvider>
      </ToastProvider>
    </MemoryRouter>,
  )
}

function renderPageWithProductRoute() {
  return render(
    <MemoryRouter initialEntries={['/products/new']}>
      <ToastProvider>
        <AuthProvider>
          <ReadyGate>
            <Routes>
              <Route path="/products/new" element={<ProductFormPage />} />
              <Route path="/products/:productId" element={<p>Ficha del producto</p>} />
            </Routes>
          </ReadyGate>
        </AuthProvider>
      </ToastProvider>
    </MemoryRouter>,
  )
}

describe('ProductFormPage', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })

  it('creates an undifferentiated product without ever mentioning variants, optionally setting its price in the wizard', async () => {
    const user = userEvent.setup()
    mockInitialLoad(fetchMock, ADMIN_ACCOUNT)
    fetchMock
      .mockResolvedValueOnce(jsonResponse(EMPTY_PRODUCT_PAGE))
      .mockResolvedValueOnce(
        jsonResponse(
          {
            product: {
              id: 5,
              name: 'Hilo blanco',
              category_id: 1,
              unit_id: 1,
              status: 'active',
              variants: [
                { id: 10, product_id: 5, label: null, is_implicit: true, status: 'active', attribute_value_ids: [] },
              ],
            },
            possible_duplicates: [],
          },
          201,
        ),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          id: 100,
          variant_id: 10,
          business_id: 1,
          amount: '150.00',
          effective_from: '2026-01-01T00:00:00Z',
          effective_to: null,
          created_by_account_id: 1,
          created_at: '2026-01-01T00:00:00Z',
        }),
      )

    renderPage()

    await fillStep1AndContinue(user, 'Hilo blanco')

    expect(await screen.findByRole('button', { name: 'Producto único' })).toBeInTheDocument()
    expect(screen.queryByLabelText(/Nombre de la variante/)).not.toBeInTheDocument()

    await user.type(screen.getByLabelText('Precio'), '150')
    await user.click(screen.getByRole('button', { name: 'Continuar' }))

    await user.click(screen.getByRole('button', { name: 'Confirmar' }))

    expect(await screen.findByRole('status')).toHaveTextContent('Producto creado correctamente.')
    expect(fetchMock).toHaveBeenLastCalledWith(
      '/variants/10/price',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ amount: '150' }),
      }),
    )
  })

  it('shows an error and marks the name field as soon as it is left empty', async () => {
    const user = userEvent.setup()
    mockInitialLoad(fetchMock, ADMIN_ACCOUNT)

    renderPage()

    const nameInput = await screen.findByLabelText(/^Nombre \*?$/)
    await user.click(nameInput)
    await user.tab()

    expect(screen.getByText('El nombre es obligatorio.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Continuar' })).toBeDisabled()
  })

  it('sends the user to the created product with a pending warning when the initial price fails to save', async () => {
    const user = userEvent.setup()
    mockInitialLoad(fetchMock, ADMIN_ACCOUNT)
    fetchMock
      .mockResolvedValueOnce(jsonResponse(EMPTY_PRODUCT_PAGE))
      .mockResolvedValueOnce(
        jsonResponse(
          {
            product: {
              id: 5,
              name: 'Hilo blanco',
              category_id: 1,
              unit_id: 1,
              status: 'active',
              variants: [
                { id: 10, product_id: 5, label: null, is_implicit: true, status: 'active', attribute_value_ids: [] },
              ],
            },
            possible_duplicates: [],
          },
          201,
        ),
      )
      .mockResolvedValueOnce(jsonResponse({ detail: 'Error interno.' }, 500))

    renderPageWithProductRoute()

    await fillStep1AndContinue(user, 'Hilo blanco')
    await user.type(screen.getByLabelText('Precio'), '150')
    await user.click(screen.getByRole('button', { name: 'Continuar' }))
    await user.click(screen.getByRole('button', { name: 'Confirmar' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'El producto se creó, pero no se pudo guardar el precio inicial.',
    )
    expect(screen.queryByText('No se pudo crear el producto. Intentá de nuevo.')).not.toBeInTheDocument()
    expect(await screen.findByText('Ficha del producto')).toBeInTheDocument()
  })

  it('shows an error for categoría and unidad once they lose focus while empty', async () => {
    const user = userEvent.setup()
    mockInitialLoad(fetchMock, ADMIN_ACCOUNT)

    renderPage()

    await screen.findByLabelText(/^Nombre \*?$/)
    await user.click(screen.getByRole('button', { name: 'Categoría' }))
    expect(await screen.findByText('Elegí una categoría.')).toBeInTheDocument()
    await user.keyboard('{Escape}')

    await user.click(screen.getByRole('button', { name: 'Unidad' }))
    expect(await screen.findByText('Elegí una unidad.')).toBeInTheDocument()
  })

  it('blocks a duplicate product name before advancing to the next step', async () => {
    const user = userEvent.setup()
    mockInitialLoad(fetchMock, ADMIN_ACCOUNT)
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        items: [{ id: 9, name: 'Hilo Blanco', category_id: 1, unit_id: 1, status: 'active', image_url: null, variants: [] }],
        total: 1,
        page: 1,
        page_size: 10,
      }),
    )

    renderPage()

    await user.type(await screen.findByLabelText(/^Nombre \*?$/), 'hilo blanco')
    await pickOption(user, 'Categoría', 'Mercería')
    await pickOption(user, 'Unidad', 'Unidad (un)')
    await user.click(screen.getByRole('button', { name: 'Continuar' }))

    expect(await screen.findByText('Ya existe un producto con ese nombre.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Producto único' })).not.toBeInTheDocument()
  })

  it('warns without blocking step 2 when the duplicate name check fails', async () => {
    const user = userEvent.setup()
    mockInitialLoad(fetchMock, ADMIN_ACCOUNT)
    fetchMock.mockRejectedValueOnce(new Error('network error'))

    renderPage()

    await user.type(await screen.findByLabelText(/^Nombre \*?$/), 'Hilo blanco')
    await pickOption(user, 'Categoría', 'Mercería')
    await pickOption(user, 'Unidad', 'Unidad (un)')
    await user.click(screen.getByRole('button', { name: 'Continuar' }))

    expect(
      await screen.findByText('No se pudo verificar si el nombre está repetido. El producto se guardará igual.'),
    ).toBeInTheDocument()
    expect(screen.queryByText('Ya existe un producto con ese nombre.')).not.toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'Producto único' })).toBeInTheDocument()
  })

  it('does not create the product when the wizard is cancelled at the review step', async () => {
    const user = userEvent.setup()
    mockInitialLoad(fetchMock, ADMIN_ACCOUNT)
    fetchMock.mockResolvedValueOnce(jsonResponse(EMPTY_PRODUCT_PAGE))

    renderPage()

    await fillStep1AndContinue(user, 'Hilo blanco')
    await user.click(screen.getByRole('button', { name: 'Continuar' }))

    expect(await screen.findByRole('button', { name: 'Cancelar' })).toBeInTheDocument()
    const callsBeforeCancel = fetchMock.mock.calls.length

    await user.click(screen.getByRole('button', { name: 'Cancelar' }))

    expect(fetchMock.mock.calls.length).toBe(callsBeforeCancel)
    expect(screen.queryByRole('heading', { name: 'Producto creado' })).not.toBeInTheDocument()
  })

  it('shows an error toast when creating the product fails', async () => {
    const user = userEvent.setup()
    mockInitialLoad(fetchMock, ADMIN_ACCOUNT)
    fetchMock
      .mockResolvedValueOnce(jsonResponse(EMPTY_PRODUCT_PAGE))
      .mockResolvedValueOnce(jsonResponse({ detail: 'Ya existe un producto con ese nombre.' }, 409))

    renderPage()

    await fillStep1AndContinue(user, 'Hilo blanco')
    await user.click(screen.getByRole('button', { name: 'Continuar' }))
    await user.click(screen.getByRole('button', { name: 'Confirmar' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Ya existe un producto con ese nombre.')
    expect(screen.queryByRole('heading', { name: 'Producto creado' })).not.toBeInTheDocument()
  })

  it('lets the user add variants with attribute values and creates one variant per row', async () => {
    const user = userEvent.setup()
    mockInitialLoad(fetchMock, ADMIN_ACCOUNT)
    fetchMock
      .mockResolvedValueOnce(jsonResponse(EMPTY_PRODUCT_PAGE))
      .mockResolvedValueOnce(jsonResponse([{ id: 1, attribute_id: 1, value: 'Rojo', status: 'active' }]))
      .mockResolvedValueOnce(
        jsonResponse(
          {
            product: {
              id: 6,
              name: 'Cinta',
              category_id: 1,
              unit_id: 1,
              status: 'active',
              variants: [
                {
                  id: 20,
                  product_id: 6,
                  label: 'Roja',
                  is_implicit: false,
                  status: 'active',
                  attribute_value_ids: [1],
                },
              ],
            },
            possible_duplicates: [],
          },
          201,
        ),
      )

    renderPage()

    await fillStep1AndContinue(user, 'Cinta')

    await user.click(await screen.findByRole('button', { name: 'Producto con variantes' }))
    await user.type(screen.getByLabelText('Nombre de la variante'), 'Roja')
    await pickOption(user, 'Atributo', 'Color')
    await pickOption(user, 'Valor', 'Rojo')
    await user.click(screen.getByRole('button', { name: 'Agregar valor' }))

    await user.click(screen.getByRole('button', { name: 'Continuar' }))
    await user.click(screen.getByRole('button', { name: 'Confirmar' }))

    expect(fetchMock).toHaveBeenCalledWith(
      '/products',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          name: 'Cinta',
          category_id: 1,
          unit_id: 1,
          variants: [{ label: 'Roja', attribute_value_ids: [1] }],
        }),
      }),
    )
    expect(await screen.findByRole('status')).toHaveTextContent('Producto creado correctamente.')
  })

  describe('shared price across variants', () => {
    const TWO_VARIANT_PRODUCT = {
      product: {
        id: 7,
        name: 'Cinta bebé',
        category_id: 1,
        unit_id: 1,
        status: 'active',
        variants: [
          { id: 30, product_id: 7, label: 'Rosa', is_implicit: false, status: 'active', attribute_value_ids: [] },
          { id: 31, product_id: 7, label: 'Negra', is_implicit: false, status: 'active', attribute_value_ids: [] },
        ],
      },
      possible_duplicates: [],
    }

    function mockTwoVariantCreation() {
      mockInitialLoad(fetchMock, ADMIN_ACCOUNT)
      fetchMock.mockResolvedValueOnce(jsonResponse(EMPTY_PRODUCT_PAGE))
      fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
        if (url === '/products' && init?.method === 'POST') return jsonResponse(TWO_VARIANT_PRODUCT, 201)
        return jsonResponse({})
      })
    }

    async function openTwoVariants(user: ReturnType<typeof userEvent.setup>) {
      await fillStep1AndContinue(user, 'Cinta bebé')
      await user.click(await screen.findByRole('button', { name: 'Producto con variantes' }))
      await user.click(screen.getByRole('button', { name: '+ Agregar variante' }))
      const labels = screen.getAllByLabelText('Nombre de la variante')
      await user.type(labels[0], 'Rosa')
      await user.type(labels[1], 'Negra')
    }

    function callsTo(pattern: RegExp, method?: string) {
      return fetchMock.mock.calls.filter(
        ([url, init]) => pattern.test(String(url)) && (method === undefined || (init as RequestInit)?.method === method),
      )
    }

    function bodyOf(call: unknown[]) {
      return JSON.parse(String((call[1] as RequestInit).body))
    }

    async function confirmCreation(user: ReturnType<typeof userEvent.setup>) {
      await user.click(screen.getByRole('button', { name: 'Continuar' }))
      await user.click(screen.getByRole('button', { name: 'Confirmar' }))
      expect(await screen.findByRole('status')).toHaveTextContent('Producto creado correctamente.')
    }

    it('applies the shared price to every variant', async () => {
      const user = userEvent.setup()
      mockTwoVariantCreation()
      renderPage()

      await openTwoVariants(user)
      await user.type(screen.getByLabelText('Precio para todas las variantes'), '100')
      await confirmCreation(user)

      const priceCalls = callsTo(/\/variants\/\d+\/price$/, 'PUT')
      expect(priceCalls.map((call) => call[0])).toEqual(['/variants/30/price', '/variants/31/price'])
      expect(priceCalls.map((call) => bodyOf(call).amount)).toEqual(['100', '100'])
    })

    it('uses the own price of a variant that opted in and the shared price for the rest', async () => {
      const user = userEvent.setup()
      mockTwoVariantCreation()
      renderPage()

      await openTwoVariants(user)
      await user.type(screen.getByLabelText('Precio para todas las variantes'), '100')
      await user.click(screen.getByLabelText('Precio distinto para la variante 2'))
      await user.type(screen.getByLabelText('Precio de la variante 2'), '250')
      await confirmCreation(user)

      const priceCalls = callsTo(/\/variants\/\d+\/price$/, 'PUT')
      expect(priceCalls.map((call) => [call[0], bodyOf(call).amount])).toEqual([
        ['/variants/30/price', '100'],
        ['/variants/31/price', '250'],
      ])
    })

    it('does not set any price when neither the shared nor an own price is filled', async () => {
      const user = userEvent.setup()
      mockTwoVariantCreation()
      renderPage()

      await openTwoVariants(user)
      await user.click(screen.getByLabelText('Precio distinto para la variante 1'))
      await confirmCreation(user)

      expect(callsTo(/\/variants\/\d+\/price$/)).toHaveLength(0)
    })

    it('keeps current stock and minimum stock independent per variant', async () => {
      const user = userEvent.setup()
      mockTwoVariantCreation()
      renderPage()

      await openTwoVariants(user)
      await user.type(screen.getByLabelText('Precio para todas las variantes'), '100')
      await user.type(screen.getByLabelText('Stock actual de la variante 1'), '5')
      await user.type(screen.getByLabelText('Stock actual de la variante 2'), '8')
      await user.type(screen.getByLabelText('Stock min. de la variante 2'), '3')
      await confirmCreation(user)

      const stockCalls = callsTo(/\/variants\/\d+\/stock\/adjustments$/, 'POST')
      expect(stockCalls.map((call) => [call[0], bodyOf(call).delta])).toEqual([
        ['/variants/30/stock/adjustments', 5],
        ['/variants/31/stock/adjustments', 8],
      ])
      const minimumCalls = callsTo(/\/variants\/\d+\/stock\/minimum$/, 'PATCH')
      expect(minimumCalls.map((call) => [call[0], bodyOf(call).minimum_quantity])).toEqual([
        ['/variants/31/stock/minimum', 3],
      ])
    })

    it('does not call the stock adjustment when the initial stock is empty or zero', async () => {
      const user = userEvent.setup()
      mockTwoVariantCreation()
      renderPage()

      await openTwoVariants(user)
      await user.type(screen.getByLabelText('Precio para todas las variantes'), '100')
      await user.type(screen.getByLabelText('Stock actual de la variante 2'), '0')
      await confirmCreation(user)

      expect(callsTo(/\/variants\/\d+\/stock\/adjustments$/, 'POST')).toHaveLength(0)
    })

    it('shows the effective price of each variant in the review step', async () => {
      const user = userEvent.setup()
      mockTwoVariantCreation()
      renderPage()

      await openTwoVariants(user)
      await user.type(screen.getByLabelText('Precio para todas las variantes'), '100')
      await user.click(screen.getByLabelText('Precio distinto para la variante 2'))
      await user.type(screen.getByLabelText('Precio de la variante 2'), '250')
      await user.click(screen.getByRole('button', { name: 'Continuar' }))

      expect(screen.getByText('Rosa', { selector: 'p' }).closest('li')).toHaveTextContent('Precio: $100')
      expect(screen.getByText('Negra', { selector: 'p' }).closest('li')).toHaveTextContent('Precio: $250')
    })

    it('goes back to the shared price when the option is turned off, without losing what was typed', async () => {
      const user = userEvent.setup()
      mockTwoVariantCreation()
      renderPage()

      await openTwoVariants(user)
      await user.type(screen.getByLabelText('Precio para todas las variantes'), '100')
      await user.click(screen.getByLabelText('Precio distinto para la variante 2'))
      await user.type(screen.getByLabelText('Precio de la variante 2'), '250')
      await user.click(screen.getByLabelText('Precio distinto para la variante 2'))

      expect(screen.queryByLabelText('Precio de la variante 2')).not.toBeInTheDocument()
      expect(screen.getByLabelText('Precio para todas las variantes')).toHaveValue('100')

      await user.click(screen.getByRole('button', { name: 'Continuar' }))
      expect(screen.getByText('Negra', { selector: 'p' }).closest('li')).toHaveTextContent('Precio: $100')
    })
  })

  it('does not render the form for an account without catalog management permissions', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(EMPLOYEE_ACCOUNT))
      .mockResolvedValueOnce(jsonResponse(CATEGORIES))
      .mockResolvedValueOnce(jsonResponse(UNITS))
      .mockResolvedValueOnce(jsonResponse(ATTRIBUTES))

    renderPage()

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/auth/me', expect.anything()))
    expect(screen.queryByLabelText(/^Nombre \*?$/)).not.toBeInTheDocument()
  })

  it('loads the form for a Gerente account even if /providers responds 403', async () => {
    const GERENTE_ACCOUNT = { ...ADMIN_ACCOUNT, id: 3, name: 'Grace Manager', user_name: 'gracem', role: 'Gerente' }
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/providers')) return Promise.resolve(jsonResponse({ detail: 'Permiso denegado' }, 403))
      if (url === '/auth/me') return Promise.resolve(jsonResponse(GERENTE_ACCOUNT))
      if (url === '/categories') return Promise.resolve(jsonResponse(CATEGORIES))
      if (url === '/units') return Promise.resolve(jsonResponse(UNITS))
      if (url === '/attributes') return Promise.resolve(jsonResponse(ATTRIBUTES))
      return Promise.resolve(jsonResponse([]))
    })

    renderPage()

    expect(await screen.findByLabelText(/^Nombre \*?$/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Proveedor' })).not.toBeInTheDocument()
    expect(fetchMock.mock.calls.some((call) => String(call[0]).includes('/providers'))).toBe(false)
  })

  it('shows the breadcrumb without a link to the catalog', async () => {
    mockInitialLoad(fetchMock, ADMIN_ACCOUNT)
    fetchMock.mockResolvedValueOnce(jsonResponse(EMPTY_PRODUCT_PAGE))

    renderPage()

    expect(await screen.findByLabelText(/^Nombre \*?$/)).toBeInTheDocument()
    const breadcrumb = screen.getByText('Nuevo producto', { selector: 'span' })
    expect(breadcrumb).toHaveClass('text-brand')
    expect(breadcrumb.parentElement).toHaveTextContent('Productos › Nuevo producto')
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  it('lets the user create a missing category and unit inline while creating a product', async () => {
    const user = userEvent.setup()
    mockInitialLoad(fetchMock, ADMIN_ACCOUNT)
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ id: 2, name: 'Hilos', status: 'active' }))
      .mockResolvedValueOnce(
        jsonResponse({ id: 2, name: 'Metro', abbreviation: 'm', allows_fraction: true, status: 'active' }),
      )

    renderPage()

    await user.click(await screen.findByRole('button', { name: 'Categoría' }))
    await user.click(await screen.findByRole('option', { name: '+ Crear categoría nueva…' }))
    await user.type(screen.getByLabelText('Nombre de la categoría nueva'), 'Hilos')
    await user.click(screen.getByRole('button', { name: 'Crear' }))

    expect(await screen.findByText('Hilos')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith(
      '/categories',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ name: 'Hilos' }) }),
    )

    await user.click(screen.getByRole('button', { name: 'Unidad' }))
    await user.click(await screen.findByRole('option', { name: '+ Crear unidad nueva…' }))
    await user.type(screen.getByLabelText('Nombre de la unidad nueva'), 'Metro')
    await user.type(screen.getByLabelText('Abreviatura de la unidad nueva'), 'm')
    await user.click(screen.getByLabelText('Admite fracciones'))
    await user.click(screen.getByRole('button', { name: 'Crear' }))

    expect(await screen.findByText('Metro (m)')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith(
      '/units',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ name: 'Metro', abbreviation: 'm', allows_fraction: true }),
      }),
    )
  })

  it('lets the user create a missing attribute inline while adding a variant', async () => {
    const user = userEvent.setup()
    mockInitialLoad(fetchMock, ADMIN_ACCOUNT)
    fetchMock
      .mockResolvedValueOnce(jsonResponse(EMPTY_PRODUCT_PAGE))
      .mockResolvedValueOnce(jsonResponse({ id: 2, name: 'Talle', status: 'active' }))
      .mockResolvedValueOnce(jsonResponse({ id: 5, attribute_id: 2, value: 'M', status: 'active' }))

    renderPage()

    await fillStep1AndContinue(user, 'Cinta')
    await user.click(await screen.findByRole('button', { name: 'Producto con variantes' }))
    await pickOption(user, 'Atributo', '+ Crear atributo nuevo…')
    await user.type(screen.getByLabelText('Nombre del atributo nuevo'), 'Talle')
    await user.click(screen.getByRole('button', { name: 'Crear' }))

    expect(fetchMock).toHaveBeenCalledWith(
      '/attributes',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ name: 'Talle' }) }),
    )

    await user.type(await screen.findByLabelText('Nuevo valor'), 'M')
    await user.click(screen.getByRole('button', { name: 'Agregar' }))

    expect(await screen.findByText('M')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith(
      '/attributes/2/values',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ value: 'M' }) }),
    )
  })
})
