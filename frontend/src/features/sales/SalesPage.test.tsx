import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Account, Sale } from '../../api/types'
import { ToastProvider } from '../../shared/Toast'
import { AuthContext, type AuthContextValue } from '../access/useAuth'
import { SalesPage, type SalesView } from './SalesPage'

const EMPLEADO: Account = {
  id: 1,
  name: 'Empleada de prueba',
  user_name: 'empleada',
  status: 'activo',
  role: 'Empleado',
  active_business_id: 1,
  businesses: [{ id: 1, name: 'Mercería', industry: 'Mercería' }],
} as Account

const GERENTE: Account = { ...EMPLEADO, id: 2, name: 'Gerenta de prueba', role: 'Gerente' } as Account

const VARIANTS = [
  {
    variant_id: 10,
    product_id: 1,
    product_name: 'Cinta de raso',
    category_name: 'Mercería',
    label: null,
    attribute_values: [],
    price_amount: '300.00',
    unit_abbreviation: 'm',
    unit_allows_fraction: true,
    quantity: '2.000',
    presentation: null,
  },
]

const CUSTOMERS = [{ id: 7, name: 'Clara Ventas', phone: null, address: null, status: 'active' }]

const SALE: Sale = {
  id: 5,
  created_at: '2026-10-23T12:00:00Z',
  created_by_account_id: 1,
  created_by_account_name: 'Empleada de prueba',
  payments: [{ method: 'fiado', amount: '900.00' }],
  customer_id: 7,
  customer_name: 'Clara Ventas',
  subtotal: '900.00',
  discount: '0.00',
  total: '900.00',
  insufficient_stock: true,
  line_count: 1,
  voided_at: null,
  voided_by_account_id: null,
  voided_by_account_name: null,
  void_reason: null,
  lines: [
    {
      id: 1,
      variant_id: 10,
      product_id: 1,
      product_name: 'Cinta de raso',
      variant_description: '',
      description: null,
      unit_abbreviation: 'm',
      quantity: '3.000',
      unit_price: '300.00',
      line_total: '900.00',
      stock_taken: '2.000',
      insufficient_stock: true,
    },
  ],
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function routeFetch(handlers: Record<string, (init?: RequestInit) => Response>) {
  const fetchMock = fetch as ReturnType<typeof vi.fn>
  fetchMock.mockImplementation((path: string, init?: RequestInit) => {
    const method = (init?.method ?? 'GET').toUpperCase()
    const route = Object.keys(handlers).find((key) => {
      const [keyMethod, keyPath] = key.split(' ')
      return keyMethod === method && path.split('?')[0] === keyPath
    })
    if (route === undefined) return Promise.resolve(jsonResponse({ detail: 'no encontrado' }, 404))
    return Promise.resolve(handlers[route](init))
  })
  return fetchMock
}

function renderPage(account: Account, view: SalesView = 'new') {
  const value = { account, status: 'ready' } as AuthContextValue
  return render(
    <MemoryRouter>
      <ToastProvider>
        <AuthContext.Provider value={value}>
          <SalesPage view={view} />
        </AuthContext.Provider>
      </ToastProvider>
    </MemoryRouter>,
  )
}

type User = ReturnType<typeof userEvent.setup>

async function addCinta(user: User) {
  await user.type(screen.getByRole('combobox', { name: 'Buscar producto para vender' }), 'cinta')
  await user.click(await screen.findByRole('option', { name: 'Agregar Cinta de raso' }))
}

function postedBody(fetchMock: ReturnType<typeof vi.fn>) {
  const postInit = fetchMock.mock.calls
    .map(([, init]) => init as RequestInit | undefined)
    .find((init) => init?.method === 'POST')
  return JSON.parse(String(postInit?.body))
}

describe('SalesPage', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  it('shows the search results in a dropdown only while searching', async () => {
    const user = userEvent.setup()
    routeFetch({
      'GET /search': () => jsonResponse({ results: VARIANTS }),
      'GET /customers': () => jsonResponse(CUSTOMERS),
    })
    renderPage(EMPLEADO)

    expect(await screen.findByRole('combobox', { name: 'Buscar producto para vender' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'Agregar Cinta de raso' })).not.toBeInTheDocument()
    expect(screen.getByText('El carrito está vacío')).toBeInTheDocument()

    const search = screen.getByRole('combobox', { name: 'Buscar producto para vender' })
    await user.type(search, 'cinta')
    expect(await screen.findByRole('option', { name: 'Agregar Cinta de raso' })).toBeInTheDocument()
    expect(search).toHaveAttribute('aria-expanded', 'true')

    await user.clear(search)
    expect(screen.queryByRole('option', { name: 'Agregar Cinta de raso' })).not.toBeInTheDocument()
  })

  it('adds a product, warns about the stock and registers a fiado sale', async () => {
    const user = userEvent.setup()
    const fetchMock = routeFetch({
      'GET /search': () => jsonResponse({ results: VARIANTS }),
      'GET /customers': () => jsonResponse(CUSTOMERS),
      'POST /sales': () => jsonResponse(SALE, 201),
    })
    renderPage(EMPLEADO)

    await addCinta(user)
    expect(screen.queryByRole('option', { name: 'Agregar Cinta de raso' })).not.toBeInTheDocument()
    await addCinta(user)
    expect(screen.getByRole('textbox', { name: 'Cantidad de Cinta de raso' })).toHaveValue('2')
    await user.click(screen.getByRole('button', { name: 'Restar uno a Cinta de raso' }))
    await user.click(screen.getByRole('button', { name: 'Sumar uno a Cinta de raso' }))
    const quantity =screen.getByRole('textbox', { name: 'Cantidad de Cinta de raso' })
    await user.clear(quantity)
    await user.type(quantity, '3')

    expect(screen.getByText(/Stock insuficiente: hay 2 m/)).toBeInTheDocument()
    expect(screen.getByLabelText('Total de la venta')).toHaveTextContent('$ 900,00')

    await user.click(screen.getByRole('button', { name: 'Confirmar venta' }))
    const checkout = screen.getByRole('dialog', { name: 'Confirmar venta' })
    expect(within(checkout).getByLabelText('Total a cobrar')).toHaveTextContent('$ 900,00')
    await user.click(within(checkout).getByRole('button', { name: /^Fiado/ }))
    await user.click(within(checkout).getByRole('button', { name: 'Confirmar venta' }))
    expect(within(checkout).getByText('Para vender en fiado elegí el cliente.')).toBeInTheDocument()

    await user.click(within(checkout).getByRole('button', { name: 'Cliente del fiado' }))
    await user.click(await screen.findByRole('option', { name: 'Clara Ventas' }))
    await user.click(within(checkout).getByRole('button', { name: 'Confirmar venta' }))

    const registered = await screen.findByRole('dialog', { name: 'Venta registrada' })
    expect(within(registered).getByText('Venta N° 5')).toBeInTheDocument()
    expect(within(registered).getByLabelText('Total registrado')).toHaveTextContent('$ 900,00')
    expect(within(registered).getByRole('button', { name: 'Imprimir comprobante' })).toBeDisabled()
    expect(within(registered).getByText('Próximamente')).toBeInTheDocument()
    await user.click(within(registered).getByRole('button', { name: 'Nueva venta' }))
    expect(screen.queryByRole('dialog', { name: 'Venta registrada' })).not.toBeInTheDocument()
    expect(screen.getByText('Venta N° 5 registrada sin stock suficiente')).toBeInTheDocument()
    const postInit = fetchMock.mock.calls
      .map(([, init]) => init as RequestInit | undefined)
      .find((init) => init?.method === 'POST')
    expect(JSON.parse(String(postInit?.body))).toEqual({
      lines: [{ variant_id: 10, quantity: '3' }],
      payments: [{ method: 'fiado', amount: '900.00' }],
      customer_id: 7,
      discount: '0',
    })
  })

  it('shows only the loading indicator, without filters, while the sales list loads for the first time', async () => {
    routeFetch({
      'GET /search': () => jsonResponse({ results: VARIANTS }),
      'GET /customers': () => jsonResponse(CUSTOMERS),
      'GET /sales': () => new Promise<Response>(() => {}) as unknown as Response,
    })
    renderPage(EMPLEADO, 'list')

    expect(await screen.findByText('Cargando…')).toBeInTheDocument()
    expect(screen.queryByText('Desde')).not.toBeInTheDocument()
  })

  it('shows an empty state without filters when there are no sales yet', async () => {
    routeFetch({
      'GET /search': () => jsonResponse({ results: VARIANTS }),
      'GET /customers': () => jsonResponse(CUSTOMERS),
      'GET /sales': () => jsonResponse({ items: [], total: 0, page: 1, page_size: 25 }),
    })
    renderPage(EMPLEADO, 'list')

    expect(await screen.findByText('No hay ventas registradas')).toBeInTheDocument()
    expect(screen.getByText('Cuando registres una venta, va a aparecer acá.')).toBeInTheDocument()
    expect(screen.queryByText('Desde')).not.toBeInTheDocument()
  })

  it('shows the filters and a no-results message when the filters find no sales', async () => {
    const user = userEvent.setup()
    let salesCalls = 0
    routeFetch({
      'GET /search': () => jsonResponse({ results: VARIANTS }),
      'GET /customers': () => jsonResponse(CUSTOMERS),
      'GET /sales': () => {
        salesCalls += 1
        return salesCalls === 1
          ? jsonResponse({ items: [SALE], total: 1, page: 1, page_size: 25 })
          : jsonResponse({ items: [], total: 0, page: 1, page_size: 25 })
      },
    })
    renderPage(EMPLEADO, 'list')

    expect(await screen.findByText('Desde')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Filtrar por forma de pago' }))
    await user.click(await screen.findByRole('option', { name: 'Transferencia' }))
    expect(await screen.findByText('No hay ventas con esos filtros.')).toBeInTheDocument()
  })

  it('shows the sales count, the Normal label and clears the applied filters', async () => {
    const user = userEvent.setup()
    routeFetch({
      'GET /search': () => jsonResponse({ results: VARIANTS }),
      'GET /customers': () => jsonResponse(CUSTOMERS),
      'GET /sales': () => jsonResponse({ items: [{ ...SALE, insufficient_stock: false }], total: 1, page: 1, page_size: 25 }),
    })
    renderPage(EMPLEADO, 'list')

    expect(await screen.findByText('1 venta registrada')).toBeInTheDocument()
    expect(screen.getByText('● Normal')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Limpiar filtros' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Filtrar por forma de pago' }))
    await user.click(await screen.findByRole('option', { name: 'Transferencia' }))
    await user.click(await screen.findByRole('button', { name: 'Limpiar filtros' }))

    expect(screen.queryByRole('button', { name: 'Limpiar filtros' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Filtrar por forma de pago' })).toHaveTextContent('Todas')
  })

  it('applies a percentage discount and sends the amount in pesos', async () => {
    const user = userEvent.setup()
    const fetchMock = routeFetch({
      'GET /search': () => jsonResponse({ results: VARIANTS }),
      'GET /customers': () => jsonResponse(CUSTOMERS),
      'POST /sales': () => jsonResponse(SALE, 201),
    })
    renderPage(EMPLEADO)

    await addCinta(user)
    const percent = screen.getByRole('textbox', { name: 'Descuento en porcentaje' })
    await user.type(percent, '10')

    expect(screen.getByRole('textbox', { name: 'Descuento en pesos' })).toHaveValue('30.00')
    expect(screen.getByLabelText('Total de la venta')).toHaveTextContent('$ 270,00')

    await user.clear(percent)
    await user.type(percent, '101')
    expect(screen.getByText('El descuento no puede ser mayor al 100%.')).toBeInTheDocument()

    await user.clear(percent)
    await user.type(percent, '10')
    await user.click(screen.getByRole('button', { name: 'Confirmar venta' }))
    await user.click(within(screen.getByRole('dialog', { name: 'Confirmar venta' })).getByRole('button', { name: 'Confirmar venta' }))

    expect(await screen.findByRole('dialog', { name: 'Venta registrada' })).toBeInTheDocument()
    const postInit = fetchMock.mock.calls
      .map(([, init]) => init as RequestInit | undefined)
      .find((init) => init?.method === 'POST')
    expect(JSON.parse(String(postInit?.body)).discount).toBe('30.00')
  })

  it('does not let a discount go over the total', async () => {
    const user = userEvent.setup()
    routeFetch({
      'GET /search': () => jsonResponse({ results: VARIANTS }),
      'GET /customers': () => jsonResponse(CUSTOMERS),
    })
    renderPage(EMPLEADO)

    await addCinta(user)
    await user.type(screen.getByRole('textbox', { name: 'Descuento en pesos' }), '301')

    expect(screen.getByText('El descuento no puede ser mayor que el total.')).toBeInTheDocument()
    expect(screen.getByLabelText('Total de la venta')).toHaveTextContent('$ 300,00')

    await user.clear(screen.getByRole('textbox', { name: 'Descuento en pesos' }))
    await user.type(screen.getByRole('textbox', { name: 'Descuento en pesos' }), '50')
    expect(screen.getByLabelText('Total de la venta')).toHaveTextContent('$ 250,00')

    await user.click(screen.getByRole('button', { name: 'Vaciar carrito' }))
    expect(screen.getByText('El carrito está vacío')).toBeInTheDocument()
    expect(screen.getByLabelText('Total de la venta')).toHaveTextContent('$ 0,00')
  })

  it('lets a Gerente void a sale with a reason', async () => {
    const user = userEvent.setup()
    const voided = {
      ...SALE,
      voided_at: '2026-10-23T13:00:00Z',
      voided_by_account_id: 2,
      voided_by_account_name: 'Gerenta de prueba',
      void_reason: 'Devolvió todo',
    }
    routeFetch({
      'GET /search': () => jsonResponse({ results: VARIANTS }),
      'GET /customers': () => jsonResponse(CUSTOMERS),
      'GET /sales': () => jsonResponse({ items: [SALE], total: 1, page: 1, page_size: 25 }),
      'GET /sales/5': () => jsonResponse(SALE),
      'POST /sales/5/void': () => jsonResponse(voided),
    })
    renderPage(GERENTE, 'list')

    await user.click(await screen.findByRole('button', { name: 'Ver venta N° 5' }))
    const dialog = await screen.findByRole('dialog', { name: 'Venta N° 5' })
    await user.click(await within(dialog).findByRole('button', { name: 'Anular venta' }))
    await user.click(within(dialog).getByRole('button', { name: 'Confirmar anulación' }))
    expect(within(dialog).getByText('Escribí el motivo de la anulación.')).toBeInTheDocument()

    await user.type(within(dialog).getByRole('textbox', { name: /Motivo/ }), 'Devolvió todo')
    await user.click(within(dialog).getByRole('button', { name: 'Confirmar anulación' }))

    expect(await within(dialog).findByText('Venta anulada')).toBeInTheDocument()
    expect(within(dialog).getByText(/Motivo: Devolvió todo/)).toBeInTheDocument()
  })

  it('does not offer voiding to an Empleado', async () => {
    const user = userEvent.setup()
    routeFetch({
      'GET /search': () => jsonResponse({ results: VARIANTS }),
      'GET /customers': () => jsonResponse(CUSTOMERS),
      'GET /sales': () => jsonResponse({ items: [SALE], total: 1, page: 1, page_size: 25 }),
      'GET /sales/5': () => jsonResponse(SALE),
    })
    renderPage(EMPLEADO, 'list')

    await user.click(await screen.findByRole('button', { name: 'Ver venta N° 5' }))
    const dialog = await screen.findByRole('dialog', { name: 'Venta N° 5' })

    expect(await within(dialog).findByText('Clara Ventas')).toBeInTheDocument()
    expect(within(dialog).queryByRole('button', { name: 'Anular venta' })).not.toBeInTheDocument()
  })

  it('adds a product with the arrow keys and Enter and closes the dropdown', async () => {
    const user = userEvent.setup()
    routeFetch({
      'GET /search': () =>
        jsonResponse({
          results: [...VARIANTS, { ...VARIANTS[0], variant_id: 11, product_name: 'Cinta bebé', price_amount: '120.00' }],
        }),
      'GET /customers': () => jsonResponse(CUSTOMERS),
    })
    renderPage(EMPLEADO)

    const search = await screen.findByRole('combobox', { name: 'Buscar producto para vender' })
    await user.type(search, 'cinta')
    expect(await screen.findAllByRole('option')).toHaveLength(2)
    await user.keyboard('{ArrowDown}')
    expect(screen.getByRole('option', { name: 'Agregar Cinta bebé' })).toHaveAttribute('aria-selected', 'true')
    await user.keyboard('{Enter}')

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(search).toHaveValue('')
    expect(screen.getByRole('textbox', { name: 'Cantidad de Cinta bebé' })).toHaveValue('1')
    expect(screen.getByLabelText('Total de la venta')).toHaveTextContent('$ 120,00')
  })

  it('checks a price and its stock without adding it to the cart', async () => {
    const user = userEvent.setup()
    routeFetch({
      'GET /search': () => jsonResponse({ results: VARIANTS }),
      'GET /customers': () => jsonResponse(CUSTOMERS),
    })
    renderPage(EMPLEADO)

    await user.click(await screen.findByRole('button', { name: 'Consultar precio' }))
    const dialog = screen.getByRole('dialog', { name: 'Consultar precio' })
    await user.type(within(dialog).getByRole('combobox', { name: 'Buscar producto para consultar' }), 'cinta')
    await user.click(await within(dialog).findByRole('option', { name: 'Consultar Cinta de raso' }))

    const checked = within(dialog).getByRole('region', { name: 'Precio consultado' })
    expect(checked).toHaveTextContent('$ 300,00')
    expect(checked).toHaveTextContent('Stock: 2 m')
    const closeButtons = within(dialog).getAllByRole('button', { name: 'Cerrar' })
    await user.click(closeButtons[closeButtons.length - 1])
    expect(screen.getByText('El carrito está vacío')).toBeInTheDocument()
  })

  it('adds a free amount line and sends it with the sale', async () => {
    const user = userEvent.setup()
    const fetchMock = routeFetch({
      'GET /search': () => jsonResponse({ results: VARIANTS }),
      'GET /customers': () => jsonResponse(CUSTOMERS),
      'POST /sales': () => jsonResponse({ ...SALE, insufficient_stock: false }, 201),
    })
    renderPage(EMPLEADO)

    await user.click(await screen.findByRole('button', { name: 'Agregar monto' }))
    const dialog = screen.getByRole('dialog', { name: 'Agregar monto' })
    await user.click(within(dialog).getByRole('button', { name: 'Agregar' }))
    expect(within(dialog).getByText('Escribí el nombre.')).toBeInTheDocument()
    expect(within(dialog).getByText('Escribí el importe.')).toBeInTheDocument()
    await user.type(within(dialog).getByRole('textbox', { name: /Nombre/ }), 'Varios')
    await user.type(within(dialog).getByRole('textbox', { name: 'Importe del monto' }), '150{Enter}')

    expect(screen.queryByRole('dialog', { name: 'Agregar monto' })).not.toBeInTheDocument()
    expect(screen.getByText('Monto libre')).toBeInTheDocument()
    expect(screen.getByLabelText('Total de la venta')).toHaveTextContent('$ 150,00')

    await user.click(screen.getByRole('button', { name: 'Confirmar venta' }))
    await user.keyboard('{Enter}')
    await screen.findByRole('dialog', { name: 'Venta registrada' })
    expect(postedBody(fetchMock)).toEqual({
      lines: [{ description: 'Varios', amount: '150' }],
      payments: [{ method: 'efectivo', amount: '150.00' }],
      discount: '0',
    })
  })

  it('splits the total between cash and transfer and shows the change only on screen', async () => {
    const user = userEvent.setup()
    const fetchMock = routeFetch({
      'GET /search': () => jsonResponse({ results: VARIANTS }),
      'GET /customers': () => jsonResponse(CUSTOMERS),
      'POST /sales': () => jsonResponse({ ...SALE, insufficient_stock: false }, 201),
    })
    renderPage(EMPLEADO)
    await addCinta(user)
    await user.click(screen.getByRole('button', { name: 'Sumar uno a Cinta de raso' }))

    await user.click(screen.getByRole('button', { name: 'Confirmar venta' }))
    const checkout = screen.getByRole('dialog', { name: 'Confirmar venta' })
    await user.type(within(checkout).getByRole('textbox', { name: 'Paga con' }), '1000')
    expect(within(checkout).getByTestId('change-amount')).toHaveTextContent('$ 400,00')

    await user.click(within(checkout).getByRole('button', { name: 'Repartir entre varias' }))
    expect(within(checkout).getByText('Falta asignar')).toBeInTheDocument()
    await user.click(within(checkout).getByRole('button', { name: 'Efectivo' }))
    await user.click(within(checkout).getByRole('button', { name: 'Transferencia' }))
    await user.type(within(checkout).getByRole('textbox', { name: 'Importe en efectivo' }), '200')
    expect(within(checkout).getByText('$ 400,00')).toBeInTheDocument()
    await user.click(within(checkout).getByRole('button', { name: 'Confirmar venta' }))
    expect(within(checkout).getByText('Todavía falta asignar parte del total.')).toBeInTheDocument()

    await user.type(within(checkout).getByRole('textbox', { name: 'Importe en transferencia' }), '400')
    expect(within(checkout).getByText('$ 0,00')).toBeInTheDocument()
    await user.clear(within(checkout).getByRole('textbox', { name: 'Paga con' }))
    await user.type(within(checkout).getByRole('textbox', { name: 'Paga con' }), '500')
    expect(within(checkout).getByTestId('change-amount')).toHaveTextContent('$ 300,00')
    await user.type(within(checkout).getByRole('textbox', { name: 'Importe en transferencia' }), '{Enter}')

    await screen.findByRole('dialog', { name: 'Venta registrada' })
    const body = postedBody(fetchMock)
    expect(body.payments).toEqual([
      { method: 'efectivo', amount: '200.00' },
      { method: 'transferencia', amount: '400.00' },
    ])
    expect(body.customer_id).toBeUndefined()
    expect(JSON.stringify(body)).not.toContain('500')
  })

  it('applies the discount from the checkout and keeps it in sync with the cart', async () => {
    const user = userEvent.setup()
    routeFetch({
      'GET /search': () => jsonResponse({ results: VARIANTS }),
      'GET /customers': () => jsonResponse(CUSTOMERS),
    })
    renderPage(EMPLEADO)
    await addCinta(user)
    await user.click(screen.getByRole('button', { name: 'Sumar uno a Cinta de raso' }))

    await user.click(screen.getByRole('button', { name: 'Confirmar venta' }))
    const checkout = screen.getByRole('dialog', { name: 'Confirmar venta' })
    await user.type(within(checkout).getByRole('textbox', { name: 'Descuento en porcentaje' }), '10')
    expect(within(checkout).getByRole('textbox', { name: 'Descuento en pesos' })).toHaveValue('60.00')
    expect(within(checkout).getByLabelText('Total a cobrar')).toHaveTextContent('$ 540,00')

    await user.click(within(checkout).getByRole('button', { name: 'Repartir entre varias' }))
    expect(within(checkout).getByText('Falta asignar')).toBeInTheDocument()
    expect(within(checkout).getByText('$ 540,00', { selector: 'span.text-2xl' })).toBeInTheDocument()
    await user.click(within(checkout).getByRole('button', { name: 'Efectivo' }))
    await user.type(within(checkout).getByRole('textbox', { name: 'Importe en efectivo' }), '200')
    expect(within(checkout).getByText('$ 340,00', { selector: 'span.text-2xl' })).toBeInTheDocument()

    await user.keyboard('{Escape}')
    expect(screen.getByRole('textbox', { name: 'Descuento en pesos' })).toHaveValue('60.00')
    expect(screen.getByRole('textbox', { name: 'Descuento en porcentaje' })).toHaveValue('10')
  })

  it('closes the checkout with Esc without registering the sale', async () => {
    const user = userEvent.setup()
    const fetchMock = routeFetch({
      'GET /search': () => jsonResponse({ results: VARIANTS }),
      'GET /customers': () => jsonResponse(CUSTOMERS),
    })
    renderPage(EMPLEADO)
    await addCinta(user)

    await user.click(screen.getByRole('button', { name: 'Confirmar venta' }))
    expect(screen.getByRole('dialog', { name: 'Confirmar venta' })).toBeInTheDocument()
    await user.keyboard('{Escape}')

    expect(screen.queryByRole('dialog', { name: 'Confirmar venta' })).not.toBeInTheDocument()
    expect(fetchMock.mock.calls.some(([, init]) => (init as RequestInit | undefined)?.method === 'POST')).toBe(false)
    expect(screen.getByRole('textbox', { name: 'Cantidad de Cinta de raso' })).toBeInTheDocument()
  })

  it('shows every payment part in the history and in the detail', async () => {
    const user = userEvent.setup()
    const split = {
      ...SALE,
      insufficient_stock: false,
      payments: [
        { method: 'efectivo', amount: '600.00' },
        { method: 'fiado', amount: '300.00' },
      ],
      lines: [...SALE.lines, { ...SALE.lines[0], id: 2, variant_id: null, product_id: null, product_name: null, description: 'Varios', unit_abbreviation: null }],
    } as Sale
    routeFetch({
      'GET /search': () => jsonResponse({ results: VARIANTS }),
      'GET /customers': () => jsonResponse(CUSTOMERS),
      'GET /sales': () => jsonResponse({ items: [split], total: 1, page: 1, page_size: 25 }),
      'GET /sales/5': () => jsonResponse(split),
    })
    renderPage(EMPLEADO, 'list')

    const table = await screen.findByRole('table', { name: 'Historial de ventas' })
    expect(within(table).getByText('Efectivo $ 600,00 + Fiado $ 300,00')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Ver venta N° 5' }))
    const dialog = await screen.findByRole('dialog', { name: 'Venta N° 5' })
    const parts = await within(dialog).findByRole('region', { name: 'Formas de pago' })
    expect(parts).toHaveTextContent('Efectivo$ 600,00')
    expect(parts).toHaveTextContent('Fiado$ 300,00')
    expect(within(dialog).getByText('Varios')).toBeInTheDocument()
    expect(within(dialog).getByText('Monto libre')).toBeInTheDocument()
  })

  async function openFiadoCheckout(user: User) {
    await addCinta(user)
    await user.click(screen.getByRole('button', { name: 'Confirmar venta' }))
    const checkout = screen.getByRole('dialog', { name: 'Confirmar venta' })
    await user.click(within(checkout).getByRole('button', { name: /^Fiado/ }))
    return checkout
  }

  it('lets a manager create a customer from the checkout and picks it', async () => {
    const user = userEvent.setup()
    const fetchMock = routeFetch({
      'GET /search': () => jsonResponse({ results: VARIANTS }),
      'GET /customers': () => jsonResponse(CUSTOMERS),
      'POST /customers': () => jsonResponse({ id: 9, name: 'Nora Nueva', phone: '381555', address: null, status: 'active' }, 201),
    })
    renderPage(GERENTE)

    const checkout = await openFiadoCheckout(user)
    await user.click(within(checkout).getByRole('button', { name: 'Cliente del fiado' }))
    await user.click(await screen.findByRole('option', { name: '+ Nuevo cliente' }))
    const dialog = await screen.findByRole('dialog', { name: 'Nuevo cliente' })
    await user.type(within(dialog).getByLabelText(/Nombre/), 'Nora Nueva')
    await user.type(within(dialog).getByLabelText('Teléfono'), '381555')
    await user.click(within(dialog).getByRole('button', { name: 'Crear cliente' }))

    expect(screen.queryByRole('dialog', { name: 'Nuevo cliente' })).not.toBeInTheDocument()
    expect(within(checkout).getByRole('button', { name: 'Cliente del fiado' })).toHaveTextContent('Nora Nueva')
    expect(postedBody(fetchMock)).toEqual({ name: 'Nora Nueva', phone: '381555' })
  })

  it('shows a server error inside the new customer dialog', async () => {
    const user = userEvent.setup()
    routeFetch({
      'GET /search': () => jsonResponse({ results: VARIANTS }),
      'GET /customers': () => jsonResponse(CUSTOMERS),
      'POST /customers': () => jsonResponse({ detail: 'Ya existe un cliente con ese nombre.' }, 409),
    })
    renderPage(GERENTE)

    const checkout = await openFiadoCheckout(user)
    await user.click(within(checkout).getByRole('button', { name: 'Cliente del fiado' }))
    await user.click(await screen.findByRole('option', { name: '+ Nuevo cliente' }))
    const dialog = await screen.findByRole('dialog', { name: 'Nuevo cliente' })
    await user.type(within(dialog).getByLabelText(/Nombre/), 'Clara Ventas')
    await user.click(within(dialog).getByRole('button', { name: 'Crear cliente' }))

    expect(await within(dialog).findByRole('alert')).toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'Confirmar venta' })).toBeInTheDocument()
  })

  it('tells an employee to ask a manager instead of offering to create a customer', async () => {
    const user = userEvent.setup()
    routeFetch({
      'GET /search': () => jsonResponse({ results: VARIANTS }),
      'GET /customers': () => jsonResponse(CUSTOMERS),
    })
    renderPage(EMPLEADO)

    const checkout = await openFiadoCheckout(user)
    expect(within(checkout).getByText('Si el cliente no está, pedile a un Gerente que lo cree.')).toBeInTheDocument()
    await user.click(within(checkout).getByRole('button', { name: 'Cliente del fiado' }))
    expect(await screen.findByRole('option', { name: 'Clara Ventas' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: '+ Nuevo cliente' })).not.toBeInTheDocument()
  })
})
