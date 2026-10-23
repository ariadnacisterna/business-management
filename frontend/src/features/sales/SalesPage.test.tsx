import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Account, Sale } from '../../api/types'
import { ToastProvider } from '../../shared/Toast'
import { AuthContext, type AuthContextValue } from '../access/useAuth'
import { SalesPage } from './SalesPage'

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
  payment_method: 'fiado',
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

function renderPage(account: Account) {
  const value = { account, status: 'ready' } as AuthContextValue
  return render(
    <MemoryRouter>
      <ToastProvider>
        <AuthContext.Provider value={value}>
          <SalesPage />
        </AuthContext.Provider>
      </ToastProvider>
    </MemoryRouter>,
  )
}

describe('SalesPage', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  it('adds a product, warns about the stock and registers a fiado sale', async () => {
    const user = userEvent.setup()
    const fetchMock = routeFetch({
      'GET /search': () => jsonResponse({ results: VARIANTS }),
      'GET /customers': () => jsonResponse(CUSTOMERS),
      'POST /sales': () => jsonResponse(SALE, 201),
    })
    renderPage(EMPLEADO)

    await user.type(screen.getByRole('textbox', { name: 'Buscar producto para vender' }), 'cinta')
    await user.click(await screen.findByRole('button', { name: 'Agregar Cinta de raso' }))
    await user.click(screen.getByRole('button', { name: 'Agregar Cinta de raso' }))
    expect(screen.getByRole('textbox', { name: 'Cantidad de Cinta de raso' })).toHaveValue('2')
    await user.click(screen.getByRole('button', { name: 'Restar uno a Cinta de raso' }))
    await user.click(screen.getByRole('button', { name: 'Sumar uno a Cinta de raso' }))
    const quantity =screen.getByRole('textbox', { name: 'Cantidad de Cinta de raso' })
    await user.clear(quantity)
    await user.type(quantity, '3')

    expect(screen.getByText(/Hay 2 m en stock/)).toBeInTheDocument()
    expect(screen.getByText(/algún producto supera el stock/)).toBeInTheDocument()
    expect(screen.getByLabelText('Total de la venta')).toHaveTextContent('$900,00')

    await user.click(screen.getByRole('button', { name: 'Fiado' }))
    await user.click(screen.getByRole('button', { name: 'Confirmar venta' }))
    expect(screen.getByText('Para vender en fiado elegí el cliente.')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Cliente del fiado' }))
    await user.click(await screen.findByRole('option', { name: 'Clara Ventas' }))
    await user.click(screen.getByRole('button', { name: 'Confirmar venta' }))
    await user.click(within(screen.getByRole('alertdialog', { name: 'Registrar venta' })).getByRole('button', { name: 'Registrar' }))

    expect(await screen.findByText('Venta N° 5 registrada sin stock suficiente')).toBeInTheDocument()
    const postInit = fetchMock.mock.calls
      .map(([, init]) => init as RequestInit | undefined)
      .find((init) => init?.method === 'POST')
    expect(JSON.parse(String(postInit?.body))).toEqual({
      lines: [{ variant_id: 10, quantity: '3' }],
      payment_method: 'fiado',
      customer_id: 7,
      discount: '0',
    })
  })

  it('does not let a discount go over the total', async () => {
    const user = userEvent.setup()
    routeFetch({
      'GET /search': () => jsonResponse({ results: VARIANTS }),
      'GET /customers': () => jsonResponse(CUSTOMERS),
    })
    renderPage(EMPLEADO)

    await user.type(screen.getByRole('textbox', { name: 'Buscar producto para vender' }), 'cinta')
    await user.click(await screen.findByRole('button', { name: 'Agregar Cinta de raso' }))
    await user.type(screen.getByRole('textbox', { name: 'Descuento' }), '301')

    expect(screen.getByText('El descuento no puede ser mayor que el total.')).toBeInTheDocument()
    expect(screen.getByLabelText('Total de la venta')).toHaveTextContent('$300,00')

    await user.clear(screen.getByRole('textbox', { name: 'Descuento' }))
    await user.type(screen.getByRole('textbox', { name: 'Descuento' }), '50')
    expect(screen.getByLabelText('Total de la venta')).toHaveTextContent('$250,00')

    await user.click(screen.getByRole('button', { name: 'Vaciar ticket' }))
    expect(screen.getByText('Todavía no agregaste productos.')).toBeInTheDocument()
    expect(screen.getByLabelText('Total de la venta')).toHaveTextContent('$0,00')
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
    renderPage(GERENTE)

    await user.click(screen.getByRole('button', { name: 'Ventas registradas' }))
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
    renderPage(EMPLEADO)

    await user.click(screen.getByRole('button', { name: 'Ventas registradas' }))
    await user.click(await screen.findByRole('button', { name: 'Ver venta N° 5' }))
    const dialog = await screen.findByRole('dialog', { name: 'Venta N° 5' })

    expect(await within(dialog).findByText('Clara Ventas')).toBeInTheDocument()
    expect(within(dialog).queryByRole('button', { name: 'Anular venta' })).not.toBeInTheDocument()
  })
})
