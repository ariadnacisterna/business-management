import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../../shared/Toast'
import { AuthProvider } from '../access/AuthContext'
import { useAuth } from '../access/useAuth'
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
const STOCK_ROW = {
  product_id: 1,
  product_name: 'Hilo blanco',
  image_url: null as string | null,
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

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

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

  it('shows only the loading spinner, not search/filters/view toggle, while loading', async () => {
    const fetchMock = fetch as ReturnType<typeof vi.fn>
    fetchMock.mockResolvedValueOnce(jsonResponse(GERENTE_ACCOUNT)).mockImplementationOnce(() => new Promise(() => {}))

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

    expect(await screen.findByRole('status')).toHaveTextContent('Cargando…')
    expect(screen.queryByLabelText('Ver como tarjetas')).not.toBeInTheDocument()
    expect(screen.queryByPlaceholderText('Buscar producto…')).not.toBeInTheDocument()
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

  it('discards a stale stock list response that resolves after a newer one', async () => {
    const user = userEvent.setup()
    const fetchMock = fetch as ReturnType<typeof vi.fn>
    renderPage()

    await screen.findAllByText('Hilo blanco')
    const baseCallCount = fetchMock.mock.calls.length

    const stale = deferred<Response>()
    const fresh = deferred<Response>()
    // Call #1: fired by selecting "Con stock" below.
    fetchMock.mockImplementationOnce(() => stale.promise)
    // Call #2: fired right after by selecting "Bajo", before call #1 resolves.
    fetchMock.mockImplementationOnce(() => fresh.promise)

    await user.click(screen.getByRole('button', { name: 'Filtrar por estado de stock' }))
    await user.click(await screen.findByRole('option', { name: 'Con stock' }))
    await waitFor(() => expect(fetchMock.mock.calls.length).toBe(baseCallCount + 1))

    await user.click(screen.getByRole('button', { name: 'Filtrar por estado de stock' }))
    await user.click(await screen.findByRole('option', { name: 'Bajo' }))
    await waitFor(() => expect(fetchMock.mock.calls.length).toBe(baseCallCount + 2))

    fresh.resolve(jsonResponse(stockPage([{ ...STOCK_ROW, product_name: 'Resultado nuevo' }])))
    await waitFor(() => expect(screen.getByText('Resultado nuevo')).toBeInTheDocument())
    expect(screen.queryByText('Resultado viejo')).not.toBeInTheDocument()

    stale.resolve(jsonResponse(stockPage([{ ...STOCK_ROW, product_name: 'Resultado viejo' }])))

    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(screen.getByText('Resultado nuevo')).toBeInTheDocument()
    expect(screen.queryByText('Resultado viejo')).not.toBeInTheDocument()
  })

  const SUM_LABEL = /Cuánto sumar o restar a Hilo blanco/

  function movementResponse(before: number, after: number) {
    return jsonResponse({
      id: 99,
      variant_id: 10,
      quantity_before: before,
      quantity_after: after,
      observation: null,
      created_at: '2026-01-01T00:00:00Z',
      created_by_account_id: 1,
      created_by_account_name: 'Ada Lovelace',
    })
  }

  it('adds a typed amount to the current stock, previews the result and adjusts on confirm', async () => {
    const user = userEvent.setup()
    const fetchMock = fetch as ReturnType<typeof vi.fn>
    renderPage()

    await screen.findAllByText('Hilo blanco')

    const deltaInput = screen.getAllByLabelText(SUM_LABEL)[0]
    const row = deltaInput.closest('[data-testid="stock-editor"]') as HTMLElement
    const updateButton = within(row).getByRole('button', { name: 'Actualizar' })
    expect(updateButton).toBeDisabled()
    expect(within(row).queryByTestId('delta-preview')).not.toBeInTheDocument()

    await user.type(deltaInput, '6')
    expect(within(row).getByTestId('delta-preview')).toHaveTextContent('Stock: 2 → 8')
    expect(updateButton).not.toBeDisabled()
    expect(screen.queryByRole('button', { name: /Motivo del ajuste/ })).not.toBeInTheDocument()

    fetchMock.mockResolvedValueOnce(movementResponse(2, 8))
    fetchMock.mockResolvedValueOnce(jsonResponse({ ...STOCK, quantity: 8, status: 'normal' }))
    fetchMock.mockResolvedValueOnce(jsonResponse(summaryFor([{ status: 'normal' }])))

    await user.click(updateButton)
    expect(screen.getByRole('alertdialog')).toHaveTextContent('2 → 8 (diferencia +6)')
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Ajustar' }))

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    expect(await screen.findByText('¡Listo!')).toBeInTheDocument()
    expect(screen.getByText('Stock ajustado: 2 → 8.')).toBeInTheDocument()
    const adjustCall = fetchMock.mock.calls.find((call) => call[0] === '/variants/10/stock/adjustments')
    expect(JSON.parse(adjustCall?.[1]?.body as string)).toEqual({ delta: 6 })
  })

  it('subtracts a negative amount typed with the minus sign', async () => {
    const user = userEvent.setup()
    const fetchMock = fetch as ReturnType<typeof vi.fn>
    renderPage()

    await screen.findAllByText('Hilo blanco')

    const deltaInput = screen.getAllByLabelText(SUM_LABEL)[0]
    const row = deltaInput.closest('[data-testid="stock-editor"]') as HTMLElement
    await user.type(deltaInput, '-1')
    expect(within(row).getByTestId('delta-preview')).toHaveTextContent('Stock: 2 → 1')

    fetchMock.mockResolvedValueOnce(movementResponse(2, 1))
    fetchMock.mockResolvedValueOnce(jsonResponse({ ...STOCK, quantity: 1 }))
    fetchMock.mockResolvedValueOnce(jsonResponse(summaryFor([{ status: 'stock_bajo' }])))
    await user.click(within(row).getByRole('button', { name: 'Actualizar' }))
    expect(screen.getByRole('alertdialog')).toHaveTextContent('2 → 1 (diferencia -1)')
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Ajustar' }))

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    const adjustCall = fetchMock.mock.calls.find((call) => call[0] === '/variants/10/stock/adjustments')
    expect(JSON.parse(adjustCall?.[1]?.body as string)).toEqual({ delta: -1 })
  })

  it('changes the whole quantity when the option is checked, sending the difference to the server', async () => {
    const user = userEvent.setup()
    const fetchMock = fetch as ReturnType<typeof vi.fn>
    renderPage(GERENTE_ACCOUNT, { ...STOCK_ROW, quantity: 50, status: 'normal' })

    await screen.findAllByText('Hilo blanco')
    const row = screen.getAllByLabelText(SUM_LABEL)[0].closest('[data-testid="stock-editor"]') as HTMLElement

    await user.click(within(row).getByLabelText('Cambiar toda la cantidad'))
    const wholeInput = within(row).getByLabelText(/Cantidad nueva para Hilo blanco/)
    await user.type(wholeInput, '-')
    expect(wholeInput).toHaveValue('')
    await user.type(wholeInput, '42')
    expect(within(row).getByTestId('delta-preview')).toHaveTextContent('Stock: 50 → 42')

    fetchMock.mockResolvedValueOnce(movementResponse(50, 42))
    fetchMock.mockResolvedValueOnce(jsonResponse({ ...STOCK, quantity: 42, status: 'normal' }))
    fetchMock.mockResolvedValueOnce(jsonResponse(summaryFor([{ status: 'normal' }])))
    await user.click(within(row).getByRole('button', { name: 'Actualizar' }))
    expect(screen.getByRole('alertdialog')).toHaveTextContent('50 → 42 (diferencia -8)')
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Ajustar' }))

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    const adjustCall = fetchMock.mock.calls.find((call) => call[0] === '/variants/10/stock/adjustments')
    expect(JSON.parse(adjustCall?.[1]?.body as string)).toEqual({ delta: -8 })
  })

  it('rejects a whole quantity equal to the current one', async () => {
    const user = userEvent.setup()
    renderPage(GERENTE_ACCOUNT, { ...STOCK_ROW, quantity: 50, status: 'normal' })

    await screen.findAllByText('Hilo blanco')
    const row = screen.getAllByLabelText(SUM_LABEL)[0].closest('[data-testid="stock-editor"]') as HTMLElement
    await user.click(within(row).getByLabelText('Cambiar toda la cantidad'))
    await user.type(within(row).getByLabelText(/Cantidad nueva para Hilo blanco/), '50')

    expect(within(row).getByRole('alert')).toHaveTextContent('La cantidad nueva es igual a la actual.')
    expect(within(row).getByRole('button', { name: 'Actualizar' })).toBeDisabled()
  })

  it('rejects taking out more than there is and accepts leaving exactly zero', async () => {
    const user = userEvent.setup()
    renderPage(GERENTE_ACCOUNT, { ...STOCK_ROW, quantity: 50, status: 'normal' })

    await screen.findAllByText('Hilo blanco')

    const deltaInput = screen.getAllByLabelText(SUM_LABEL)[0]
    const row = deltaInput.closest('[data-testid="stock-editor"]') as HTMLElement
    const updateButton = within(row).getByRole('button', { name: 'Actualizar' })

    await user.type(deltaInput, '-52')
    expect(within(row).getByRole('alert')).toHaveTextContent('No podés descontar más de lo que hay (50)')
    expect(updateButton).toBeDisabled()

    await user.clear(deltaInput)
    await user.type(deltaInput, '-50')
    expect(within(row).queryByRole('alert')).not.toBeInTheDocument()
    expect(within(row).getByTestId('delta-preview')).toHaveTextContent('Stock: 50 → 0')
    expect(updateButton).not.toBeDisabled()
  })

  it('rejects a zero adjustment', async () => {
    const user = userEvent.setup()
    renderPage()

    await screen.findAllByText('Hilo blanco')

    const deltaInput = screen.getAllByLabelText(SUM_LABEL)[0]
    const row = deltaInput.closest('[data-testid="stock-editor"]') as HTMLElement
    await user.type(deltaInput, '0')

    expect(within(row).getByRole('alert')).toHaveTextContent('El ajuste no puede ser cero.')
    expect(within(row).getByRole('button', { name: 'Actualizar' })).toBeDisabled()
  })

  it('treats the adjustment as successful even when the refetch afterward fails', async () => {
    const user = userEvent.setup()
    const fetchMock = fetch as ReturnType<typeof vi.fn>
    const onAdjustedSpy = vi.fn()
    window.addEventListener('stock-updated', onAdjustedSpy)
    renderPage()

    await screen.findAllByText('Hilo blanco')

    const deltaInput = screen.getAllByLabelText(SUM_LABEL)[0]
    const row = deltaInput.closest('[data-testid="stock-editor"]') as HTMLElement
    const updateButton = within(row).getByRole('button', { name: 'Actualizar' })

    await user.type(deltaInput, '6')

    fetchMock.mockResolvedValueOnce(movementResponse(2, 8))
    fetchMock.mockRejectedValueOnce(new Error('network error'))
    fetchMock.mockResolvedValueOnce(jsonResponse(summaryFor([{ status: 'normal' }])))

    await user.click(updateButton)
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Ajustar' }))

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    expect(await screen.findByText('¡Listo!')).toBeInTheDocument()
    expect(screen.queryByText(/No se pudo guardar el ajuste/)).not.toBeInTheDocument()
    await waitFor(() => expect(onAdjustedSpy).toHaveBeenCalled())

    window.removeEventListener('stock-updated', onAdjustedSpy)
  })

  it('hides the inline stock editor for an employee', async () => {
    renderPage(EMPLEADO_ACCOUNT)

    await screen.findAllByText('Hilo blanco')
    expect(screen.queryByLabelText(/Cuánto sumar o restar a Hilo blanco/)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/Ver historial de stock/)).not.toBeInTheDocument()
  })

  it('shows quantity, status and the status filter to an employee, without minimum stock, adjust or history', async () => {
    renderPage(EMPLEADO_ACCOUNT, { ...STOCK_ROW, minimum_quantity: null, effective_minimum_quantity: null as unknown as number })

    await screen.findAllByText('Hilo blanco')
    expect(screen.getByText('Estado')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getAllByText(/Stock bajo/).length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: 'Filtrar por estado de stock' })).toBeInTheDocument()
    expect(screen.queryByText('Stock mín.')).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/Editar stock mínimo/)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/Ajustar stock de/)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/Ver historial de stock/)).not.toBeInTheDocument()
    expect(screen.queryByText('Último cambio')).not.toBeInTheDocument()
    expect(screen.queryByText(/con stock bajo/)).not.toBeInTheDocument()
    expect(screen.queryByText(/sin stock/)).not.toBeInTheDocument()
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
    expect(screen.queryByLabelText('Ver como tarjetas')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Ver como tabla')).not.toBeInTheDocument()
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
          quantity_before: 5,
          quantity_after: 2,
          observation: 'Conteo de fin de mes',
          created_at: '2026-01-01T00:00:00Z',
          created_by_account_id: 1,
          created_by_account_name: 'Ada Lovelace',
        },
      ]),
    )

    await user.click(screen.getAllByRole('button', { name: /Ver historial de stock de Hilo blanco/ })[0])

    const dialog = await screen.findByRole('dialog', { name: /Historial de stock de Hilo blanco/ })
    expect(within(dialog).getByText('5 → 2')).toBeInTheDocument()
    expect(within(dialog).getByText('-3')).toBeInTheDocument()
    expect(within(dialog).queryByText(/Motivo/)).not.toBeInTheDocument()
    expect(within(dialog).getByText('Conteo de fin de mes')).toBeInTheDocument()
    expect(within(dialog).getByText('Cambiado por: Ada')).toBeInTheDocument()
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

  describe('Faltantes tab', () => {
    const SHORTAGE = {
      id: 1,
      variant_id: 10,
      product_id: 1,
      product_name: 'Hilo blanco',
      category_id: 1,
      category_name: 'Hilados',
      provider_id: 5,
      provider_name: 'Distribuidora Norte',
      status: 'faltante',
      created_at: '2026-01-01T00:00:00Z',
      created_by_account_id: 1,
    }

    it('switches to the Faltantes tab and lists pending shortages', async () => {
      const user = userEvent.setup()
      const fetchMock = fetch as ReturnType<typeof vi.fn>
      renderPage()

      await screen.findAllByText('Hilo blanco')
      fetchMock.mockResolvedValueOnce(jsonResponse([SHORTAGE]))
      await user.click(screen.getByRole('button', { name: 'Faltantes' }))

      expect(await screen.findByText('Distribuidora Norte')).toBeInTheDocument()
      expect(screen.getByText('● Faltante')).toBeInTheDocument()
    })

    it('does not call fetchProviders when loading the Faltantes tab', async () => {
      const user = userEvent.setup()
      const fetchMock = fetch as ReturnType<typeof vi.fn>
      renderPage(EMPLEADO_ACCOUNT)

      await screen.findAllByText('Hilo blanco')
      fetchMock.mockResolvedValueOnce(jsonResponse([SHORTAGE]))
      await user.click(screen.getByRole('button', { name: 'Faltantes' }))

      await screen.findByText('Distribuidora Norte')
      const calledProviders = fetchMock.mock.calls.some((call) => String(call[0]).includes('/providers'))
      expect(calledProviders).toBe(false)
    })

    it('filters shortages by product name using the search box', async () => {
      const user = userEvent.setup()
      const fetchMock = fetch as ReturnType<typeof vi.fn>
      renderPage()

      await screen.findAllByText('Hilo blanco')
      fetchMock.mockResolvedValueOnce(
        jsonResponse([SHORTAGE, { ...SHORTAGE, id: 2, product_name: 'Botón dorado' }]),
      )
      await user.click(screen.getByRole('button', { name: 'Faltantes' }))
      await screen.findByText('Hilo blanco')
      expect(screen.getByText('Botón dorado')).toBeInTheDocument()

      await user.type(screen.getByLabelText('Buscar producto'), 'botón')

      expect(screen.queryByText('Hilo blanco')).not.toBeInTheDocument()
      expect(screen.getByText('Botón dorado')).toBeInTheDocument()
    })

    it('opens the filters sheet and filters from inside it', async () => {
      const user = userEvent.setup()
      const fetchMock = fetch as ReturnType<typeof vi.fn>
      renderPage()

      await screen.findAllByText('Hilo blanco')
      fetchMock.mockResolvedValueOnce(jsonResponse([SHORTAGE]))
      await user.click(screen.getByRole('button', { name: 'Faltantes' }))
      await screen.findByText('Distribuidora Norte')

      await user.click(screen.getByRole('button', { name: 'Filtros' }))
      const dialog = await screen.findByRole('dialog', { name: 'Filtros' })

      fetchMock.mockResolvedValueOnce(jsonResponse([]))
      await user.click(within(dialog).getByRole('button', { name: 'Filtrar por estado del faltante' }))
      await user.click(await screen.findByRole('option', { name: 'Recibido' }))

      expect(await screen.findByText('No hay faltantes que coincidan.')).toBeInTheDocument()
    })

    it('shows an empty state when there are no pending shortages', async () => {
      const user = userEvent.setup()
      const fetchMock = fetch as ReturnType<typeof vi.fn>
      renderPage()

      await screen.findAllByText('Hilo blanco')
      fetchMock.mockResolvedValueOnce(jsonResponse([]))
      await user.click(screen.getByRole('button', { name: 'Faltantes' }))

      expect(await screen.findByText('No hay faltantes que coincidan.')).toBeInTheDocument()
    })

    it('groups shortages by provider when selected', async () => {
      const user = userEvent.setup()
      const fetchMock = fetch as ReturnType<typeof vi.fn>
      renderPage()

      await screen.findAllByText('Hilo blanco')
      fetchMock.mockResolvedValueOnce(jsonResponse([SHORTAGE, { ...SHORTAGE, id: 2, product_name: 'Hilo negro', provider_id: null, provider_name: null }]))
      await user.click(screen.getByRole('button', { name: 'Faltantes' }))
      await screen.findByText('Hilo blanco')

      await user.click(screen.getByRole('button', { name: 'Agrupar faltantes' }))
      await user.click(await screen.findByRole('option', { name: 'Agrupar por proveedor' }))

      expect(await screen.findByRole('heading', { name: 'Distribuidora Norte' })).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: 'Sin proveedor' })).toBeInTheDocument()
    })

    it('advances a shortage from Faltante to Pedido', async () => {
      const user = userEvent.setup()
      const fetchMock = fetch as ReturnType<typeof vi.fn>
      renderPage()

      await screen.findAllByText('Hilo blanco')
      fetchMock.mockResolvedValueOnce(jsonResponse([SHORTAGE]))
      await user.click(screen.getByRole('button', { name: 'Faltantes' }))
      await screen.findByText('Distribuidora Norte')

      await user.click(screen.getByRole('button', { name: 'Marcar como Pedido' }))
      expect(screen.getByRole('alertdialog')).toBeInTheDocument()

      fetchMock.mockResolvedValueOnce(jsonResponse({ ...SHORTAGE, status: 'pedido' }))
      fetchMock.mockResolvedValueOnce(jsonResponse([{ ...SHORTAGE, status: 'pedido' }]))
      await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Confirmar' }))

      await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
      expect(await screen.findByText('¡Listo!')).toBeInTheDocument()
      const patchCall = fetchMock.mock.calls.find((call) => String(call[0]).includes('/shortages/1'))
      expect(patchCall?.[1]?.method).toBe('PATCH')
    })

    it('cancels a Pedido shortage back to Faltante', async () => {
      const user = userEvent.setup()
      const fetchMock = fetch as ReturnType<typeof vi.fn>
      renderPage()

      await screen.findAllByText('Hilo blanco')
      fetchMock.mockResolvedValueOnce(jsonResponse([{ ...SHORTAGE, status: 'pedido' }]))
      await user.click(screen.getByRole('button', { name: 'Faltantes' }))
      await screen.findByText('Distribuidora Norte')

      await user.click(screen.getByRole('button', { name: 'Cancelar' }))
      fetchMock.mockResolvedValueOnce(jsonResponse({ ...SHORTAGE, status: 'faltante' }))
      fetchMock.mockResolvedValueOnce(jsonResponse([{ ...SHORTAGE, status: 'faltante' }]))
      await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Confirmar' }))

      await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
      expect(await screen.findByText('¡Listo!')).toBeInTheDocument()
    })

    it('does not show advance or cancel actions for a received shortage', async () => {
      const user = userEvent.setup()
      const fetchMock = fetch as ReturnType<typeof vi.fn>
      renderPage()

      await screen.findAllByText('Hilo blanco')
      fetchMock.mockResolvedValueOnce(jsonResponse([{ ...SHORTAGE, status: 'recibido' }]))
      await user.click(screen.getByRole('button', { name: 'Faltantes' }))
      await screen.findByText('Distribuidora Norte')

      expect(screen.queryByRole('button', { name: /Marcar como/ })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Cancelar' })).not.toBeInTheDocument()
    })
  })
})
