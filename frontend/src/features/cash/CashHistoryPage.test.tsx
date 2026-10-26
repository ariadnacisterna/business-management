import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CashRegister } from '../../api/cash'
import type { Account } from '../../api/types'
import { ToastProvider } from '../../shared/Toast'
import { AuthContext, type AuthContextValue } from '../access/useAuth'
import { CashHistoryPage } from './CashHistoryPage'

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

const REGISTER: CashRegister = {
  id: 4,
  account_id: 1,
  account_name: 'Empleada de prueba',
  opened_at: '2026-10-26T12:00:00Z',
  ends_at: '2026-10-26T16:15:00Z',
  closed_at: null,
  closed_by_account_id: null,
  closed_by_account_name: null,
  status: 'abierta',
  cash_sales: '300.00',
  cash_voided: '0.00',
  deposits: '0.00',
  withdrawals: '0.00',
  expected_cash: '300.00',
  counted_cash: null,
  cash_difference: null,
  fiado_sales: '0.00',
  transfers_visible: false,
  transfer_sales: null,
  transfer_voided: null,
  expected_transfer: null,
  counted_transfer: null,
  transfer_difference: null,
  transfers_closed_at: null,
  movements: [],
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
          <CashHistoryPage />
        </AuthContext.Provider>
      </ToastProvider>
    </MemoryRouter>,
  )
}

describe('CashHistoryPage', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  it('lets a Gerente close a pending register and shows the shortage', async () => {
    const user = userEvent.setup()
    const pending = { ...REGISTER, id: 9, status: 'pendiente' as const, account_name: 'Otra persona' }
    const fetchMock = routeFetch({
      'GET /cash-registers': () => jsonResponse({ items: [pending], total: 1, page: 1, page_size: 25 }),
      'POST /cash-registers/9/close': () =>
        jsonResponse({ ...pending, status: 'cerrada', counted_cash: '290.00', cash_difference: '-10.00', closed_at: '2026-10-26T17:00:00Z' }),
    })
    renderPage(GERENTE)

    await screen.findByRole('table', { name: 'Historial de cajas' })
    await user.click(screen.getByRole('button', { name: 'Acciones para Caja N° 9' }))
    await user.click(await screen.findByRole('button', { name: 'Cerrar caja' }))

    const dialog = await screen.findByRole('dialog', { name: 'Cerrar caja N° 9' })
    await user.type(within(dialog).getByRole('textbox', { name: 'Efectivo contado' }), '290')
    expect(within(dialog).getByText('Faltan $ 10,00')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Cerrar caja' }))

    const post = fetchMock.mock.calls.map(([, init]) => init as RequestInit | undefined).find((init) => init?.method === 'POST')
    expect(JSON.parse(String(post?.body))).toEqual({ counted_cash: '290' })
  })

  it('shows the count and filters by status, with a button to clear the filters', async () => {
    const user = userEvent.setup()
    const fetchMock = routeFetch({
      'GET /cash-registers': () =>
        jsonResponse({ items: [{ ...REGISTER, status: 'pendiente' as const }], total: 1, page: 1, page_size: 25 }),
    })
    renderPage(GERENTE)

    expect(await screen.findByText('1 caja registrada')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Limpiar filtros' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Filtrar por estado' }))
    await user.click(await screen.findByRole('option', { name: 'Pendiente de cierre' }))

    await user.click(await screen.findByRole('button', { name: 'Limpiar filtros' }))
    const urls = fetchMock.mock.calls.map(([path]) => String(path))
    expect(urls.some((url) => url.includes('status=pendiente'))).toBe(true)
    expect(screen.queryByRole('button', { name: 'Limpiar filtros' })).not.toBeInTheDocument()
  })
})
