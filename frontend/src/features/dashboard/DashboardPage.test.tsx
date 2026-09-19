import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DashboardPage } from './DashboardPage'

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })
}

const STOCK_COUNTS = { total: 1, stock_bajo: 0, sin_stock: 1 }
const NO_STOCK = { total: 0, stock_bajo: 0, sin_stock: 0 }

function balance(customerId: number, amount: string) {
  return { customer_id: customerId, balance: amount, last_movement_at: null, last_movement_by_account_name: null }
}

function mockApi(stock: unknown, balances: unknown) {
  const fetchMock = fetch as ReturnType<typeof vi.fn>
  fetchMock.mockImplementation((input: RequestInfo | URL) => {
    const url = String(input)
    if (url.includes('/customers/balances')) return Promise.resolve(jsonResponse(balances))
    return Promise.resolve(jsonResponse(stock))
  })
}

describe('DashboardPage', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  it('no longer shows the under construction placeholder', async () => {
    mockApi(NO_STOCK, [])

    render(<DashboardPage />)

    expect(screen.getByRole('heading', { name: 'Panel' })).toBeInTheDocument()
    expect(await screen.findByText('No hay inventario cargado')).toBeInTheDocument()
    expect(screen.queryByText('En construcción')).not.toBeInTheDocument()
  })

  it('shows the loading spinner, not the summary or empty state, while loading', async () => {
    const fetchMock = fetch as ReturnType<typeof vi.fn>
    fetchMock.mockImplementation(() => new Promise(() => {}))

    render(<DashboardPage />)

    const statuses = await screen.findAllByRole('status')
    expect(statuses.length).toBeGreaterThan(0)
    statuses.forEach((element) => expect(element).toHaveTextContent('Cargando…'))
    expect(screen.queryByText('No hay inventario cargado')).not.toBeInTheDocument()
    expect(screen.queryByText('Variantes')).not.toBeInTheDocument()
  })

  it('shows the empty inventory state instead of zeroed summary cards when there is no stock yet', async () => {
    mockApi(NO_STOCK, [])

    render(<DashboardPage />)

    expect(await screen.findByText('No hay inventario cargado')).toBeInTheDocument()
    expect(screen.queryByText('Variantes')).not.toBeInTheDocument()
    expect(screen.queryByText('Con stock bajo')).not.toBeInTheDocument()
    expect(screen.queryByText('Sin stock')).not.toBeInTheDocument()
  })

  it('shows inventory summary cards with variant, low stock and no stock counts', async () => {
    mockApi(STOCK_COUNTS, [])

    render(<DashboardPage />)

    const variantsValue = await screen.findByText('Variantes')
    expect(variantsValue.closest('div')).toHaveTextContent('1')

    expect(screen.getByText('Con stock bajo').closest('div')).toHaveTextContent('0')
    expect(screen.getByText('Sin stock').closest('div')).toHaveTextContent('1')
  })

  it('shows the pending credit total summed across customers', async () => {
    mockApi(STOCK_COUNTS, [balance(1, '100.00'), balance(2, '50.50'), balance(3, '1234.50')])

    render(<DashboardPage />)

    expect(await screen.findByText('$1.385,00')).toBeInTheDocument()
    expect(screen.getByText('Fiado pendiente').closest('div')).toHaveTextContent('$1.385,00')
  })

  it('excludes negative balances from the pending credit total', async () => {
    mockApi(STOCK_COUNTS, [balance(1, '100.00'), balance(2, '-40.00'), balance(3, '50.00')])

    render(<DashboardPage />)

    expect(await screen.findByText('$150,00')).toBeInTheDocument()
  })

  it('shows $0,00 when nobody owes anything', async () => {
    mockApi(STOCK_COUNTS, [balance(1, '0.00'), balance(2, '-20.00')])

    render(<DashboardPage />)

    expect(await screen.findByText('$0,00')).toBeInTheDocument()
  })

  it('shows $0,00 when the business has no customers', async () => {
    mockApi(NO_STOCK, [])

    render(<DashboardPage />)

    expect(await screen.findByText('$0,00')).toBeInTheDocument()
    expect(screen.getByText('Fiado pendiente')).toBeInTheDocument()
  })

  it('shows an error in the credit card without hiding the stock cards when balances fail', async () => {
    const fetchMock = fetch as ReturnType<typeof vi.fn>
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      if (String(input).includes('/customers/balances')) {
        return Promise.resolve(new Response('{}', { status: 500 }))
      }
      return Promise.resolve(jsonResponse(STOCK_COUNTS))
    })

    render(<DashboardPage />)

    expect(await screen.findByText('No se pudo cargar')).toBeInTheDocument()
    expect(await screen.findByText('Variantes')).toBeInTheDocument()
  })
})
