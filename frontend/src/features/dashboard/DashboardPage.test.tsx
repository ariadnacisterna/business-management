import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DashboardPage } from './DashboardPage'

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })
}

const STOCK_COUNTS = { total: 1, stock_bajo: 0, sin_stock: 1 }

describe('DashboardPage', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  it('shows a placeholder while the panel is under construction', async () => {
    const fetchMock = fetch as ReturnType<typeof vi.fn>
    fetchMock.mockResolvedValue(jsonResponse({ total: 0, stock_bajo: 0, sin_stock: 0 }))

    render(<DashboardPage />)

    expect(screen.getByRole('heading', { name: 'Panel' })).toBeInTheDocument()
    expect(await screen.findByText('En construcción')).toBeInTheDocument()
  })

  it('shows only the loading spinner, not the summary or empty state, while loading', async () => {
    const fetchMock = fetch as ReturnType<typeof vi.fn>
    fetchMock.mockImplementationOnce(() => new Promise(() => {}))

    render(<DashboardPage />)

    expect(await screen.findByRole('status')).toHaveTextContent('Cargando…')
    expect(screen.queryByText('No hay inventario cargado')).not.toBeInTheDocument()
    expect(screen.queryByText('Variantes')).not.toBeInTheDocument()
  })

  it('shows the empty inventory state instead of zeroed summary cards when there is no stock yet', async () => {
    const fetchMock = fetch as ReturnType<typeof vi.fn>
    fetchMock.mockResolvedValueOnce(jsonResponse({ total: 0, stock_bajo: 0, sin_stock: 0 }))

    render(<DashboardPage />)

    expect(await screen.findByText('No hay inventario cargado')).toBeInTheDocument()
    expect(screen.queryByText('Variantes')).not.toBeInTheDocument()
    expect(screen.queryByText('Con stock bajo')).not.toBeInTheDocument()
    expect(screen.queryByText('Sin stock')).not.toBeInTheDocument()
  })

  it('shows inventory summary cards with variant, low stock and no stock counts', async () => {
    const fetchMock = fetch as ReturnType<typeof vi.fn>
    fetchMock.mockResolvedValueOnce(jsonResponse(STOCK_COUNTS))

    render(<DashboardPage />)

    const variantsValue = await screen.findByText('Variantes')
    expect(variantsValue.closest('div')).toHaveTextContent('1')

    expect(screen.getByText('Con stock bajo').closest('div')).toHaveTextContent('0')
    expect(screen.getByText('Sin stock').closest('div')).toHaveTextContent('1')
  })
})
