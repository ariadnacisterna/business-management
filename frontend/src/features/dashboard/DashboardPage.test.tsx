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

function loginAlert(accountId: number, name: string, userName: string, blockedAttempts: number) {
  return {
    account_id: accountId,
    name,
    user_name: userName,
    blocked_attempts: blockedAttempts,
    last_blocked_at: '2026-10-10T03:15:00Z',
  }
}

function mockApi(stock: unknown, balances: unknown, loginAlerts: unknown = []) {
  const fetchMock = fetch as ReturnType<typeof vi.fn>
  fetchMock.mockImplementation((input: RequestInfo | URL) => {
    const url = String(input)
    if (url.includes('/customers/balances')) return Promise.resolve(jsonResponse(balances))
    if (url.includes('/accounts/login-alerts')) return Promise.resolve(jsonResponse(loginAlerts))
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
      if (String(input).includes('/accounts/login-alerts')) return Promise.resolve(jsonResponse([]))
      return Promise.resolve(jsonResponse(STOCK_COUNTS))
    })

    render(<DashboardPage />)

    expect(await screen.findByText('No se pudo cargar')).toBeInTheDocument()
    expect(await screen.findByText('Variantes')).toBeInTheDocument()
  })

  it('shows no access alert when nobody was blocked', async () => {
    mockApi(STOCK_COUNTS, [], [])

    render(<DashboardPage />)

    expect(await screen.findByText('Variantes')).toBeInTheDocument()
    expect(screen.queryByText(/intentos de entrar sin permiso/)).not.toBeInTheDocument()
  })

  it('shows a large alert naming each blocked account, how many times and what to do', async () => {
    mockApi(STOCK_COUNTS, [], [loginAlert(7, 'Ana Pérez', 'ana', 3), loginAlert(8, 'Beto Gómez', 'beto', 1)])

    render(<DashboardPage />)

    const title = await screen.findByText('Atención: posibles intentos de entrar sin permiso')
    const alert = title.closest('[role="alert"]')
    expect(alert).toHaveTextContent('Ana Pérez (usuario ana): se bloqueó la entrada 3 veces')
    expect(alert).toHaveTextContent('Beto Gómez (usuario beto): se bloqueó la entrada 1 vez')
    expect(alert).toHaveTextContent('En las últimas 24 horas')
    expect(alert).toHaveTextContent('cambiale la contraseña desde Cuentas')
  })

  it('keeps the rest of the panel working when the access alert cannot be loaded', async () => {
    const fetchMock = fetch as ReturnType<typeof vi.fn>
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/accounts/login-alerts')) return Promise.resolve(new Response('{}', { status: 403 }))
      if (url.includes('/customers/balances')) return Promise.resolve(jsonResponse([]))
      return Promise.resolve(jsonResponse(STOCK_COUNTS))
    })

    render(<DashboardPage />)

    expect(await screen.findByText('Variantes')).toBeInTheDocument()
    expect(screen.queryByText(/intentos de entrar sin permiso/)).not.toBeInTheDocument()
  })
})
