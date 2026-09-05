import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider, useAuth } from '../access/AuthContext'
import { ProductFormPage } from './ProductFormPage'

function ReadyGate({ children }: { children: ReactNode }) {
  const { status } = useAuth()
  return status === 'ready' ? <>{children}</> : null
}

const ADMIN_ACCOUNT = {
  id: 1,
  name: 'Ada Lovelace',
  user_name: 'ada',
  status: 'activo',
  role: 'Administrador',
  active_business_id: 1,
  businesses: [{ id: 1, name: 'Mercería', industry: 'Mercería' }],
}

const EMPLOYEE_ACCOUNT = {
  id: 2,
  name: 'Grace Hopper',
  user_name: 'grace',
  status: 'activo',
  role: 'Empleado',
  active_business_id: 1,
  businesses: [{ id: 1, name: 'Mercería', industry: 'Mercería' }],
}

const CATEGORIES = [{ id: 1, name: 'Mercería', status: 'active' }]
const UNITS = [{ id: 1, name: 'Unidad', abbreviation: 'un', allows_fraction: false, status: 'active' }]
const ATTRIBUTES = [{ id: 1, name: 'Color', status: 'active' }]

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

async function pickOption(user: ReturnType<typeof userEvent.setup>, label: string, optionName: string) {
  await user.click(screen.getByRole('button', { name: label }))
  await user.click(await screen.findByRole('option', { name: optionName }))
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/products/new']}>
      <AuthProvider>
        <ReadyGate>
          <ProductFormPage />
        </ReadyGate>
      </AuthProvider>
    </MemoryRouter>,
  )
}

describe('ProductFormPage', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })

  it('creates an undifferentiated product without ever mentioning variants, then requires its price', async () => {
    const user = userEvent.setup()
    fetchMock
      .mockResolvedValueOnce(jsonResponse(ADMIN_ACCOUNT))
      .mockResolvedValueOnce(jsonResponse(CATEGORIES))
      .mockResolvedValueOnce(jsonResponse(UNITS))
      .mockResolvedValueOnce(jsonResponse(ATTRIBUTES))
      .mockResolvedValueOnce(
        jsonResponse(
          {
            product: {
              id: 5,
              name: 'Hilo blanco',
              category_id: 1,
              unit_id: 1,
              status: 'active',
              variants: [
                { id: 10, product_id: 5, label: null, is_implicit: true, status: 'active', attribute_value_ids: [] },
              ],
            },
            possible_duplicates: [],
          },
          201,
        ),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          id: 100,
          variant_id: 10,
          business_id: 1,
          amount: '150.00',
          effective_from: '2026-01-01T00:00:00Z',
          effective_to: null,
          created_by_account_id: 1,
          created_at: '2026-01-01T00:00:00Z',
        }),
      )

    renderPage()

    await user.type(await screen.findByLabelText('Nombre'), 'Hilo blanco')
    await pickOption(user, 'Categoría', 'Mercería')
    await pickOption(user, 'Unidad', 'Unidad (un)')
    await user.click(screen.getByRole('button', { name: 'Guardar producto' }))

    const heading = await screen.findByRole('heading', { name: 'Precio inicial' })
    expect(heading).toBeInTheDocument()
    expect(screen.queryByText(/variante/i)).not.toBeInTheDocument()

    await user.type(screen.getByLabelText('Precio'), '150')
    await user.click(screen.getByRole('button', { name: /guardar precio/i }))

    expect(fetchMock).toHaveBeenLastCalledWith(
      '/variants/10/price',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ amount: '150', expected_current_price_id: null }),
      }),
    )
  })

  it('lets the user add variants with attribute values and creates one variant per row', async () => {
    const user = userEvent.setup()
    fetchMock
      .mockResolvedValueOnce(jsonResponse(ADMIN_ACCOUNT))
      .mockResolvedValueOnce(jsonResponse(CATEGORIES))
      .mockResolvedValueOnce(jsonResponse(UNITS))
      .mockResolvedValueOnce(jsonResponse(ATTRIBUTES))
      .mockResolvedValueOnce(jsonResponse([{ id: 1, attribute_id: 1, value: 'Rojo', status: 'active' }]))
      .mockResolvedValueOnce(
        jsonResponse(
          {
            product: {
              id: 6,
              name: 'Cinta',
              category_id: 1,
              unit_id: 1,
              status: 'active',
              variants: [
                {
                  id: 20,
                  product_id: 6,
                  label: 'Roja',
                  is_implicit: false,
                  status: 'active',
                  attribute_value_ids: [1],
                },
              ],
            },
            possible_duplicates: [],
          },
          201,
        ),
      )

    renderPage()

    await user.type(await screen.findByLabelText('Nombre'), 'Cinta')
    await pickOption(user, 'Categoría', 'Mercería')
    await pickOption(user, 'Unidad', 'Unidad (un)')
    await user.click(
      screen.getByLabelText(/este producto tiene distintas presentaciones/i),
    )
    await user.click(screen.getByRole('button', { name: '+ Agregar variante' }))
    await user.type(screen.getByLabelText('Nombre de la variante'), 'Roja')
    await user.selectOptions(screen.getByLabelText('Atributo'), '1')
    await user.selectOptions(await screen.findByLabelText('Valor'), '1')

    await user.click(screen.getByRole('button', { name: 'Guardar producto' }))

    expect(fetchMock).toHaveBeenLastCalledWith(
      '/products',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          name: 'Cinta',
          category_id: 1,
          unit_id: 1,
          variants: [{ label: 'Roja', attribute_value_ids: [1] }],
        }),
      }),
    )
    expect(await screen.findByRole('heading', { name: 'Precio inicial' })).toBeInTheDocument()
  })

  it('does not render the form for an account without catalog management permissions', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(EMPLOYEE_ACCOUNT))
      .mockResolvedValueOnce(jsonResponse(CATEGORIES))
      .mockResolvedValueOnce(jsonResponse(UNITS))
      .mockResolvedValueOnce(jsonResponse(ATTRIBUTES))

    renderPage()

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/auth/me', expect.anything()))
    expect(screen.queryByRole('heading', { name: 'Nuevo producto' })).not.toBeInTheDocument()
  })

  it('lets the user create a missing category and unit inline while creating a product', async () => {
    const user = userEvent.setup()
    fetchMock
      .mockResolvedValueOnce(jsonResponse(ADMIN_ACCOUNT))
      .mockResolvedValueOnce(jsonResponse(CATEGORIES))
      .mockResolvedValueOnce(jsonResponse(UNITS))
      .mockResolvedValueOnce(jsonResponse(ATTRIBUTES))
      .mockResolvedValueOnce(jsonResponse({ id: 2, name: 'Hilos', status: 'active' }))
      .mockResolvedValueOnce(
        jsonResponse({ id: 2, name: 'Metro', abbreviation: 'm', allows_fraction: true, status: 'active' }),
      )

    renderPage()

    await user.click(await screen.findByRole('button', { name: 'Categoría' }))
    await user.click(await screen.findByRole('option', { name: '+ Crear categoría nueva…' }))
    await user.type(screen.getByLabelText('Nombre de la categoría nueva'), 'Hilos')
    await user.click(screen.getByRole('button', { name: 'Crear' }))

    expect(await screen.findByText('Hilos')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith(
      '/categories',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ name: 'Hilos' }) }),
    )

    await user.click(screen.getByRole('button', { name: 'Unidad' }))
    await user.click(await screen.findByRole('option', { name: '+ Crear unidad nueva…' }))
    await user.type(screen.getByLabelText('Nombre de la unidad nueva'), 'Metro')
    await user.type(screen.getByLabelText('Abreviatura de la unidad nueva'), 'm')
    await user.click(screen.getByLabelText('Admite fracciones'))
    await user.click(screen.getByRole('button', { name: 'Crear' }))

    expect(await screen.findByText('Metro (m)')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith(
      '/units',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ name: 'Metro', abbreviation: 'm', allows_fraction: true }),
      }),
    )
  })

  it('lets the user create a missing attribute inline while adding a variant', async () => {
    const user = userEvent.setup()
    fetchMock
      .mockResolvedValueOnce(jsonResponse(ADMIN_ACCOUNT))
      .mockResolvedValueOnce(jsonResponse(CATEGORIES))
      .mockResolvedValueOnce(jsonResponse(UNITS))
      .mockResolvedValueOnce(jsonResponse(ATTRIBUTES))
      .mockResolvedValueOnce(jsonResponse({ id: 2, name: 'Talle', status: 'active' }))
      .mockResolvedValueOnce(jsonResponse({ id: 5, attribute_id: 2, value: 'M', status: 'active' }))

    renderPage()

    await screen.findByLabelText('Nombre')
    await user.click(screen.getByLabelText(/este producto tiene distintas presentaciones/i))
    await user.click(screen.getByRole('button', { name: '+ Agregar variante' }))
    await user.selectOptions(screen.getByLabelText('Atributo'), '__create__')
    await user.type(screen.getByLabelText('Nombre del atributo nuevo'), 'Talle')
    await user.click(screen.getByRole('button', { name: 'Crear' }))

    expect(fetchMock).toHaveBeenCalledWith(
      '/attributes',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ name: 'Talle' }) }),
    )

    await user.type(await screen.findByLabelText('Nuevo valor'), 'M')
    await user.click(screen.getByRole('button', { name: 'Agregar' }))

    expect(await screen.findByText('M')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith(
      '/attributes/2/values',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ value: 'M' }) }),
    )
  })
})
