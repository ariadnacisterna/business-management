import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SearchPage } from './SearchPage'

const CATEGORIES = [
  { id: 1, name: 'Mercería', status: 'active' },
  { id: 2, name: 'Despensa', status: 'active' },
  { id: 3, name: 'Descontinuada', status: 'inactive' },
]

const CINTA_ROJA = {
  variant_id: 10,
  product_id: 1,
  product_name: 'Cinta bebé N.º 2',
  category_id: 1,
  category_name: 'Mercería',
  label: null,
  attribute_values: [{ attribute_id: 1, attribute_name: 'Color', value: 'Roja' }],
  price_amount: '150.50',
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function setup(): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('SearchPage', () => {
  beforeEach(() => {
    setup()
  })

  it('shows matching results with enough detail to distinguish them', async () => {
    const user = userEvent.setup()
    const fetchMock = fetch as ReturnType<typeof vi.fn>
    fetchMock
      .mockResolvedValueOnce(jsonResponse(CATEGORIES))
      .mockResolvedValueOnce(jsonResponse({ results: [CINTA_ROJA] }))

    render(<SearchPage />)

    await user.type(await screen.findByLabelText('Buscar'), 'cinta bebe 2 roja')

    const productName = await screen.findByText('Cinta bebé N.º 2')
    const resultCard = productName.closest('li')
    expect(resultCard).not.toBeNull()
    const card = within(resultCard as HTMLElement)
    expect(card.getByText('Mercería')).toBeInTheDocument()
    expect(card.getByText('Color: Roja')).toBeInTheDocument()
    expect(card.getByText(/150,50/)).toBeInTheDocument()
  })

  it('tells the user clearly when there are no matches', async () => {
    const user = userEvent.setup()
    const fetchMock = fetch as ReturnType<typeof vi.fn>
    fetchMock
      .mockResolvedValueOnce(jsonResponse(CATEGORIES))
      .mockResolvedValueOnce(jsonResponse({ results: [] }))

    render(<SearchPage />)

    await user.type(await screen.findByLabelText('Buscar'), 'producto inexistente')

    expect(
      await screen.findByText(/no encontramos productos que coincidan/i),
    ).toBeInTheDocument()
  })

  it('filters results by category', async () => {
    const user = userEvent.setup()
    const fetchMock = fetch as ReturnType<typeof vi.fn>
    fetchMock
      .mockResolvedValueOnce(jsonResponse(CATEGORIES))
      .mockResolvedValueOnce(jsonResponse({ results: [CINTA_ROJA] }))

    render(<SearchPage />)

    const categoryButton = await screen.findByRole('button', { name: 'Mercería' })
    await user.click(categoryButton)

    await waitFor(() => {
      expect(fetchMock).toHaveBeenLastCalledWith('/search?category_id=1', expect.anything())
    })
    expect(await screen.findByText('Cinta bebé N.º 2')).toBeInTheDocument()

    const inactiveCategory = screen.queryByRole('button', { name: 'Descontinuada' })
    expect(inactiveCategory).not.toBeInTheDocument()
  })

  it('shows an explicit error message when the search request fails', async () => {
    const user = userEvent.setup()
    const fetchMock = fetch as ReturnType<typeof vi.fn>
    fetchMock
      .mockResolvedValueOnce(jsonResponse(CATEGORIES))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))

    render(<SearchPage />)

    await user.type(await screen.findByLabelText('Buscar'), 'cinta')

    expect(await screen.findByRole('alert')).toHaveTextContent(/no se pudo conectar/i)
  })
})
