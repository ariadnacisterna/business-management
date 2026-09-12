import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../../shared/Toast'
import { AuthProvider, useAuth } from '../access/AuthContext'
import { InventoryPage } from './InventoryPage'

function ReadyGate({ children }: { children: ReactNode }) {
  const { status } = useAuth()
  return status === 'ready' ? <>{children}</> : null
}

const GERENTE_ACCOUNT = {
  id: 1,
  name: 'Gerente de prueba',
  user_name: 'gerente',
  status: 'activo',
  role: 'Gerente',
  active_business_id: 1,
  businesses: [{ id: 1, name: 'Mercería', industry: 'Mercería' }],
}

const EMPLEADO_ACCOUNT = { ...GERENTE_ACCOUNT, role: 'Empleado' }

const CATEGORIES = [{ id: 1, name: 'Hilados', status: 'active' }]
const UNITS = [{ id: 1, name: 'Unidad', abbreviation: 'un', allows_fraction: false, status: 'active' }]
const REASONS = [{ id: 1, name: 'Conteo físico', status: 'active' }]
const STOCK_ROW = {
  product_id: 1,
  product_name: 'Hilo blanco',
  category_id: 1,
  unit_id: 1,
  variant_id: 10,
  variant_label: null,
  quantity: 2,
  minimum_quantity: null,
  effective_minimum_quantity: 5,
  status: 'stock_bajo',
  last_movement_at: '2026-01-01T00:00:00Z' as string | null,
  last_movement_by_account_name: 'Juan Pérez' as string | null,
}
const STOCK = { variant_id: 10, quantity: 2, minimum_quantity: null, effective_minimum_quantity: 5, status: 'stock_bajo' }

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function stockPage(rows: unknown[]) {
  return { items: rows, total: rows.length, page: 1, page_size: 25 }
}

function summaryFor(rows: { status: string }[]) {
  return {
    total: rows.length,
    stock_bajo: rows.filter((row) => row.status === 'stock_bajo').length,
    sin_stock: rows.filter((row) => row.status === 'sin_stock').length,
  }
}

function renderPage(account: unknown = GERENTE_ACCOUNT, stockRow = STOCK_ROW) {
  const fetchMock = fetch as ReturnType<typeof vi.fn>
  fetchMock
    .mockResolvedValueOnce(jsonResponse(account))
    .mockResolvedValueOnce(jsonResponse(CATEGORIES))
    .mockResolvedValueOnce(jsonResponse(UNITS))
    .mockResolvedValueOnce(jsonResponse(REASONS))
    .mockResolvedValueOnce(jsonResponse(summaryFor([stockRow])))
    .mockResolvedValueOnce(jsonResponse(stockPage([stockRow])))

  return render(
    <MemoryRouter>
      <ToastProvider>
        <AuthProvider>
          <ReadyGate>
            <InventoryPage />
          </ReadyGate>
        </AuthProvider>
      </ToastProvider>
    </MemoryRouter>,
  )
}

describe('InventoryPage', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  it('lists stock with counts and status', async () => {
    renderPage()

    expect((await screen.findAllByText('Hilo blanco')).length).toBeGreaterThan(0)
    expect(screen.getByText(/1 con stock bajo/)).toBeInTheDocument()
    expect(screen.queryByText(/variantes/)).not.toBeInTheDocument()
    expect(screen.getAllByText(/Stock bajo/).length).toBeGreaterThan(0)
  })

  it('shows a banner with a link to the critical filter when there is stock missing', async () => {
    const user = userEvent.setup()
    renderPage(GERENTE_ACCOUNT, { ...STOCK_ROW, quantity: 0, status: 'sin_stock' })

    await screen.findAllByText('Hilo blanco')
    expect(screen.getByText('Hay 1 variante sin stock.')).toBeInTheDocument()

    const fetchMock = fetch as ReturnType<typeof vi.fn>
    fetchMock.mockResolvedValueOnce(jsonResponse(stockPage([{ ...STOCK_ROW, quantity: 0, status: 'sin_stock' }])))
    await user.click(screen.getByRole('button', { name: 'Ver' }))

    expect(screen.getByRole('button', { name: 'Filtrar por estado de stock' })).toHaveTextContent('Crítico')
  })

  it('filters by stock status using the dropdown', async () => {
    const user = userEvent.setup()
    const fetchMock = fetch as ReturnType<typeof vi.fn>
    renderPage()

    await screen.findAllByText('Hilo blanco')
    fetchMock.mockResolvedValueOnce(jsonResponse(stockPage([])))
    await user.click(screen.getByRole('button', { name: 'Filtrar por estado de stock' }))
    await user.click(await screen.findByRole('option', { name: 'Con stock' }))

    expect(await screen.findByText('No hay variantes que coincidan.')).toBeInTheDocument()
    const lastCall = fetchMock.mock.calls.at(-1)
    expect(String(lastCall?.[0])).toContain('quick_filter=normal')
  })

  it('enables Actualizar only once quantity and reason are set, and adjusts stock on confirm', async () => {
    const user = userEvent.setup()
    const fetchMock = fetch as ReturnType<typeof vi.fn>
    renderPage()

    await screen.findAllByText('Hilo blanco')

    const quantityInput = screen.getAllByLabelText(/Cantidad nueva para Hilo blanco/)[0]
    const row = quantityInput.closest('div')?.parentElement as HTMLElement
    const updateButton = within(row).getByRole('button', { name: 'Actualizar' })
    expect(updateButton).toBeDisabled()

    await user.clear(quantityInput)
    await user.type(quantityInput, '8')
    expect(updateButton).toBeDisabled()

    await user.click(within(row).getByRole('button', { name: /Motivo del ajuste/ }))
    await user.click(await screen.findByRole('option', { name: 'Conteo físico' }))
    expect(updateButton).not.toBeDisabled()

    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        id: 99,
        variant_id: 10,
        reason_id: 1,
        quantity_before: 2,
        quantity_after: 8,
        observation: null,
        created_at: '2026-01-01T00:00:00Z',
        created_by_account_id: 1,
      }),
    )
    fetchMock.mockResolvedValueOnce(jsonResponse({ ...STOCK, quantity: 8, status: 'normal' }))
    fetchMock.mockResolvedValueOnce(jsonResponse(summaryFor([{ status: 'normal' }])))

    await user.click(updateButton)
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Ajustar' }))

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    expect(await screen.findByText('¡Listo!')).toBeInTheDocument()
  })

  it('hides the inline stock editor for an employee', async () => {
    renderPage(EMPLEADO_ACCOUNT)

    await screen.findAllByText('Hilo blanco')
    expect(screen.queryByLabelText(/Cantidad nueva para Hilo blanco/)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/Ver historial de stock/)).not.toBeInTheDocument()
  })

  it('switches between card and table view while keeping the data visible', async () => {
    const user = userEvent.setup()
    renderPage()

    await screen.findAllByText('Hilo blanco')
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(screen.getByText('Categoría')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Ver como tabla' }))

    expect(screen.getByRole('table')).toBeInTheDocument()
    expect(screen.getAllByText('Hilo blanco').length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Stock bajo/).length).toBeGreaterThan(0)

    await user.click(screen.getByRole('button', { name: 'Ver como tarjetas' }))

    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(screen.getAllByText('Hilo blanco').length).toBeGreaterThan(0)
  })

  it('filters by category using the dropdown', async () => {
    const user = userEvent.setup()
    const fetchMock = fetch as ReturnType<typeof vi.fn>
    renderPage()

    await screen.findAllByText('Hilo blanco')
    fetchMock.mockResolvedValueOnce(jsonResponse(stockPage([])))
    await user.click(screen.getByRole('button', { name: 'Filtrar por categoría' }))
    await user.click(await screen.findByRole('option', { name: 'Hilados' }))

    expect(await screen.findByText('No hay variantes que coincidan.')).toBeInTheDocument()
  })

  it('clears the search filters with the reset button', async () => {
    const user = userEvent.setup()
    renderPage()

    await screen.findAllByText('Hilo blanco')
    const searchInput = screen.getByLabelText('Buscar producto')
    await user.type(searchInput, 'algo')

    const clearButton = screen.getByRole('button', { name: 'Limpiar búsqueda' })
    expect(clearButton).toBeEnabled()
    await user.click(clearButton)

    expect(searchInput).toHaveValue('')
  })

  it('paginates results when there is more than one page', async () => {
    const fetchMock = fetch as ReturnType<typeof vi.fn>
    fetchMock
      .mockResolvedValueOnce(jsonResponse(GERENTE_ACCOUNT))
      .mockResolvedValueOnce(jsonResponse(CATEGORIES))
      .mockResolvedValueOnce(jsonResponse(UNITS))
      .mockResolvedValueOnce(jsonResponse(REASONS))
      .mockResolvedValueOnce(jsonResponse(summaryFor([STOCK_ROW])))
      .mockResolvedValueOnce(jsonResponse({ items: [STOCK_ROW], total: 40, page: 1, page_size: 25 }))

    render(
      <MemoryRouter>
        <ToastProvider>
          <AuthProvider>
            <ReadyGate>
              <InventoryPage />
            </ReadyGate>
          </AuthProvider>
        </ToastProvider>
      </MemoryRouter>,
    )

    await screen.findAllByText('Hilo blanco')
    expect(screen.getByRole('navigation', { name: 'Paginación' })).toBeInTheDocument()
  })

  it('shows the table/cards view toggle in the header instead of a menu', async () => {
    renderPage()

    await screen.findAllByText('Hilo blanco')
    expect(screen.queryByRole('button', { name: 'Acciones para Inventario' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ver como tabla' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ver como tarjetas' })).toBeInTheDocument()
  })

  it('creates a new movement reason inline from the row editor', async () => {
    const user = userEvent.setup()
    const fetchMock = fetch as ReturnType<typeof vi.fn>
    renderPage()

    await screen.findAllByText('Hilo blanco')

    await user.click(screen.getAllByRole('button', { name: /Motivo del ajuste/ })[0])
    await user.click(await screen.findByRole('option', { name: '+ Crear motivo nuevo…' }))

    const nameInput = screen.getByLabelText('Nombre del motivo nuevo')
    await user.type(nameInput, 'Rotura')

    fetchMock.mockResolvedValueOnce(jsonResponse({ id: 2, name: 'Rotura', status: 'active' }))

    await user.click(screen.getByRole('button', { name: 'Crear' }))

    expect(screen.queryByLabelText('Nombre del motivo nuevo')).not.toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /Motivo del ajuste/ })[0]).toHaveTextContent('Rotura')
  })

  it('shows the estado y categoría select labels with context when collapsed', async () => {
    renderPage()

    await screen.findAllByText('Hilo blanco')
    expect(screen.getByRole('button', { name: 'Filtrar por estado de stock' })).toHaveTextContent('Todos los estados')
    expect(screen.getByRole('button', { name: 'Filtrar por categoría' })).toHaveTextContent('Todas las categorías')
  })

  it('opens the filters sheet and filters from inside it', async () => {
    const user = userEvent.setup()
    const fetchMock = fetch as ReturnType<typeof vi.fn>
    renderPage()

    await screen.findAllByText('Hilo blanco')
    await user.click(screen.getByRole('button', { name: 'Filtros' }))

    const dialog = await screen.findByRole('dialog', { name: 'Filtros' })
    fetchMock.mockResolvedValueOnce(jsonResponse(stockPage([])))
    await user.click(within(dialog).getByRole('button', { name: 'Filtrar por estado de stock' }))
    await user.click(await screen.findByRole('option', { name: 'Con stock' }))

    expect(await screen.findByText('No hay variantes que coincidan.')).toBeInTheDocument()
    const lastCall = fetchMock.mock.calls.at(-1)
    expect(String(lastCall?.[0])).toContain('quick_filter=normal')
  })

  it('shows a friendly empty state instead of an error when there is no inventory loaded', async () => {
    const fetchMock = fetch as ReturnType<typeof vi.fn>
    fetchMock
      .mockResolvedValueOnce(jsonResponse(GERENTE_ACCOUNT))
      .mockResolvedValueOnce(jsonResponse(CATEGORIES))
      .mockResolvedValueOnce(jsonResponse(UNITS))
      .mockResolvedValueOnce(jsonResponse(REASONS))
      .mockResolvedValueOnce(jsonResponse(summaryFor([])))

    render(
      <MemoryRouter>
        <ToastProvider>
          <AuthProvider>
            <ReadyGate>
              <InventoryPage />
            </ReadyGate>
          </AuthProvider>
        </ToastProvider>
      </MemoryRouter>,
    )

    expect(await screen.findByText('No hay inventario cargado')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('opens the per-variant stock history modal with its movements', async () => {
    const user = userEvent.setup()
    const fetchMock = fetch as ReturnType<typeof vi.fn>
    renderPage()

    await screen.findAllByText('Hilo blanco')
    fetchMock.mockResolvedValueOnce(
      jsonResponse([
        {
          id: 1,
          variant_id: 10,
          reason_id: 1,
          quantity_before: 5,
          quantity_after: 2,
          observation: 'Conteo de fin de mes',
          created_at: '2026-01-01T00:00:00Z',
          created_by_account_id: 1,
        },
      ]),
    )

    await user.click(screen.getAllByRole('button', { name: /Ver historial de stock de Hilo blanco/ })[0])

    const dialog = await screen.findByRole('dialog', { name: /Historial de stock de Hilo blanco/ })
    expect(within(dialog).getByText('5 → 2')).toBeInTheDocument()
    expect(within(dialog).getByText('-3')).toBeInTheDocument()
    expect(within(dialog).getByText('Motivo: Conteo físico')).toBeInTheDocument()
    expect(within(dialog).getByText('Conteo de fin de mes')).toBeInTheDocument()
  })

  it('shows an empty history message when the variant has no movements', async () => {
    const user = userEvent.setup()
    const fetchMock = fetch as ReturnType<typeof vi.fn>
    renderPage()

    await screen.findAllByText('Hilo blanco')
    fetchMock.mockResolvedValueOnce(jsonResponse([]))

    await user.click(screen.getAllByRole('button', { name: /Ver historial de stock de Hilo blanco/ })[0])

    expect(await screen.findByText('Todavía no hay movimientos registrados.')).toBeInTheDocument()
  })

  it('shows the variant name under the title, falling back to Estándar', async () => {
    renderPage()

    await screen.findAllByText('Hilo blanco')
    expect(screen.getAllByText('Estándar').length).toBeGreaterThan(0)
  })

  it('shows who made the last change before the history button', async () => {
    renderPage()

    await screen.findAllByText('Hilo blanco')
    expect(screen.getAllByText(/por Juan/).length).toBeGreaterThan(0)
  })

  it('shows Sin registro when a variant never had a stock adjustment', async () => {
    renderPage(GERENTE_ACCOUNT, {
      ...STOCK_ROW,
      last_movement_at: null,
      last_movement_by_account_name: null,
    })

    await screen.findAllByText('Hilo blanco')
    expect(screen.getAllByText('Sin registro').length).toBeGreaterThan(0)
  })

  it('lets a gerente edit the minimum stock through the modal', async () => {
    const user = userEvent.setup()
    const fetchMock = fetch as ReturnType<typeof vi.fn>
    renderPage()

    await screen.findAllByText('Hilo blanco')
    await user.click(screen.getAllByLabelText(/Editar stock mínimo de Hilo blanco/)[0])

    const dialog = await screen.findByRole('dialog', { name: /Editar stock mínimo de Hilo blanco/ })
    const input = within(dialog).getByLabelText(/Nuevo stock mínimo para Hilo blanco/)
    await user.type(input, '3')

    fetchMock.mockResolvedValueOnce(
      jsonResponse({ variant_id: 10, quantity: 2, minimum_quantity: 3, effective_minimum_quantity: 3, status: 'normal' }),
    )

    await user.click(within(dialog).getByRole('button', { name: 'Actualizar' }))

    await waitFor(() => expect(screen.queryByRole('dialog', { name: /Editar stock mínimo de Hilo blanco/ })).not.toBeInTheDocument())
    const lastCall = fetchMock.mock.calls.at(-1)
    expect(String(lastCall?.[0])).toContain('/variants/10/stock/minimum')
  })
})
