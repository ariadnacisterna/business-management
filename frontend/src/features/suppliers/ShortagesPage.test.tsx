import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../../shared/Toast'
import { ShortagesPage } from './ShortagesPage'

const SHORTAGES = [
  {
    id: 10,
    variant_id: 100,
    product_id: 1,
    product_name: 'Hilo blanco',
    category_id: 1,
    provider_id: 1,
    status: 'faltante',
    created_at: '2026-09-01T00:00:00Z',
    created_by_account_id: 1,
  },
  {
    id: 11,
    variant_id: 101,
    product_id: 2,
    product_name: 'Botón dorado',
    category_id: 1,
    provider_id: null,
    status: 'pedido',
    created_at: '2026-09-02T00:00:00Z',
    created_by_account_id: 1,
  },
]

const PROVIDERS = [
  {
    id: 1,
    name: 'Distribuidora Norte',
    contact_name: null,
    email: null,
    phone: null,
    last_purchase_at: null,
    status: 'active',
    category_ids: [],
  },
]

const CATEGORIES = [{ id: 1, name: 'Mercería', status: 'active' }]

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function renderPage(shortages = SHORTAGES) {
  const fetchMock = fetch as ReturnType<typeof vi.fn>
  fetchMock
    .mockResolvedValueOnce(jsonResponse(shortages))
    .mockResolvedValueOnce(jsonResponse(PROVIDERS))
    .mockResolvedValueOnce(jsonResponse(CATEGORIES))

  return render(
    <ToastProvider>
      <ShortagesPage />
    </ToastProvider>,
  )
}

describe('ShortagesPage', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  it('lists shortages grouped by provider with their status', async () => {
    renderPage()

    expect(await screen.findByText('Hilo blanco')).toBeInTheDocument()
    expect(screen.getByText('Botón dorado')).toBeInTheDocument()
    expect(screen.getByText('Distribuidora Norte (1)')).toBeInTheDocument()
    expect(screen.getByText('Sin proveedor (1)')).toBeInTheDocument()
  })

  it('advances a faltante to pedido after confirmation', async () => {
    const user = userEvent.setup()
    const fetchMock = fetch as ReturnType<typeof vi.fn>
    renderPage()

    await screen.findByText('Hilo blanco')
    await user.click(screen.getByRole('button', { name: 'Marcar como pedido' }))

    fetchMock.mockResolvedValueOnce(jsonResponse({ ...SHORTAGES[0], status: 'pedido' }))
    const dialog = await screen.findByRole('alertdialog')
    await user.click(within(dialog).getByRole('button', { name: 'Marcar como pedido' }))

    const lastCall = fetchMock.mock.calls.at(-1)
    expect(lastCall?.[0]).toBe('/shortages/10')
    expect(JSON.parse(lastCall?.[1]?.body as string)).toEqual({ status: 'pedido' })
  })

  it('offers both advance and cancel actions for a pedido', async () => {
    renderPage()

    await screen.findByText('Botón dorado')
    expect(screen.getByRole('button', { name: 'Marcar como recibido' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Volver a faltante' })).toBeInTheDocument()
  })

  it('shows an empty state, not an error, when there are no shortages yet', async () => {
    renderPage([])

    expect(await screen.findByText('No hay faltantes que coincidan.')).toBeInTheDocument()
    expect(screen.queryByText(/No se pudieron cargar/)).not.toBeInTheDocument()
  })
})
