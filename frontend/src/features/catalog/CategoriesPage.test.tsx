import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { AuthProvider, useAuth } from '../access/AuthContext'
import { CategoriesPage } from './CategoriesPage'

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

const EMPLOYEE_ACCOUNT = { ...ADMIN_ACCOUNT, role: 'Empleado' }

const CATEGORIES = [
  { id: 1, name: 'Mercería', status: 'active' },
  { id: 2, name: 'Despensa', status: 'active' },
]

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function renderPage() {
  return render(
    <AuthProvider>
      <ReadyGate>
        <CategoriesPage />
      </ReadyGate>
    </AuthProvider>,
  )
}

describe('CategoriesPage', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })

  it('lists existing categories with how many products each one has', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(ADMIN_ACCOUNT))
      .mockResolvedValueOnce(jsonResponse(CATEGORIES))
      .mockResolvedValueOnce(
        jsonResponse([
          { id: 1, name: 'Hilo', category_id: 1, unit_id: 1, status: 'active', variants: [] },
          { id: 2, name: 'Cinta', category_id: 1, unit_id: 1, status: 'active', variants: [] },
        ]),
      )

    renderPage()

    expect(await screen.findByText('Mercería')).toBeInTheDocument()
    expect(screen.getByText('Despensa')).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: '2' })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: '0' })).toBeInTheDocument()
  })

  it('lets an administrator create a new category', async () => {
    const user = userEvent.setup()
    fetchMock
      .mockResolvedValueOnce(jsonResponse(ADMIN_ACCOUNT))
      .mockResolvedValueOnce(jsonResponse(CATEGORIES))
      .mockResolvedValueOnce(jsonResponse([]))
      .mockResolvedValueOnce(jsonResponse({ id: 3, name: 'Bazar', status: 'active' }, 201))

    renderPage()

    await screen.findByText('Mercería')
    await user.click(screen.getByRole('button', { name: '+ Nueva categoría' }))
    await user.type(screen.getByLabelText('Nueva categoría'), 'Bazar')
    await user.click(screen.getByRole('button', { name: 'Crear' }))

    expect(await screen.findByText('Bazar')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenLastCalledWith(
      '/categories',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ name: 'Bazar' }) }),
    )
  })

  it('does not offer creation or edition to an employee', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(EMPLOYEE_ACCOUNT))
      .mockResolvedValueOnce(jsonResponse(CATEGORIES))
      .mockResolvedValueOnce(jsonResponse([]))

    renderPage()

    await screen.findByText('Mercería')
    expect(screen.queryByRole('button', { name: '+ Nueva categoría' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Editar' })).not.toBeInTheDocument()
  })

  it('shows an error message when categories fail to load', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(ADMIN_ACCOUNT))
      .mockRejectedValueOnce(new TypeError('fail'))
      .mockResolvedValueOnce(jsonResponse([]))

    renderPage()

    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudieron cargar las categorías.')
  })
})
