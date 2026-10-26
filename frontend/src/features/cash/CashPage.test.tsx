import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CashRegister } from '../../api/cash'
import type { Account } from '../../api/types'
import { ToastProvider } from '../../shared/Toast'
import { AuthContext, type AuthContextValue } from '../access/useAuth'
import { CashPage } from './CashPage'

const EMPLEADO: Account = {
  id: 1,
  name: 'Empleada de prueba',
  user_name: 'empleada',
  status: 'activo',
  role: 'Empleado',
  active_business_id: 1,
  businesses: [{ id: 1, name: 'Mercería', industry: 'Mercería' }],
} as Account

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
          <CashPage />
        </AuthContext.Provider>
      </ToastProvider>
    </MemoryRouter>,
  )
}

describe('CashPage', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  it('shows the cash of the shift', async () => {
    routeFetch({ 'GET /cash-registers/current': () => jsonResponse(REGISTER) })
    renderPage(EMPLEADO)

    expect(await screen.findByLabelText('Efectivo en caja')).toHaveTextContent('$ 300,00')
    expect(screen.getByRole('button', { name: 'Retirar efectivo' })).toBeInTheDocument()
  })

  it('withdraws cash with an optional reason', async () => {
    const user = userEvent.setup()
    let current = REGISTER
    const fetchMock = routeFetch({
      'GET /cash-registers/current': () => jsonResponse(current),
      'POST /cash-registers/current/movements': () => {
        current = { ...REGISTER, withdrawals: '50.00', expected_cash: '250.00' }
        return jsonResponse(current, 201)
      },
    })
    renderPage(EMPLEADO)

    await user.click(await screen.findByRole('button', { name: 'Retirar efectivo' }))
    const dialog = await screen.findByRole('dialog', { name: 'Retirar efectivo' })
    await user.click(within(dialog).getByRole('button', { name: 'Retirar' }))
    expect(within(dialog).getByText('Escribí el importe.')).toBeInTheDocument()

    await user.type(within(dialog).getByRole('textbox', { name: 'Importe' }), '50')
    await user.type(within(dialog).getByRole('textbox', { name: /Motivo/ }), 'Luz')
    await user.click(within(dialog).getByRole('button', { name: 'Retirar' }))

    const post = fetchMock.mock.calls.map(([, init]) => init as RequestInit | undefined).find((init) => init?.method === 'POST')
    expect(JSON.parse(String(post?.body))).toEqual({ kind: 'retiro', amount: '50', reason: 'Luz' })
    expect(await screen.findByLabelText('Efectivo en caja')).toHaveTextContent('$ 250,00')
  })
})
