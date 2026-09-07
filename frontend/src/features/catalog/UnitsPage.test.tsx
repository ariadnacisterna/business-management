import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { AuthProvider, useAuth } from '../access/AuthContext'
import { UnitsPage } from './UnitsPage'

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

const UNITS = [
  { id: 1, name: 'Kilogramo', abbreviation: 'kg', allows_fraction: true, status: 'active' },
  { id: 2, name: 'Unidad', abbreviation: 'un', allows_fraction: false, status: 'active' },
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
        <UnitsPage />
      </ReadyGate>
    </AuthProvider>,
  )
}

describe('UnitsPage', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })

  it('lists existing units', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(ADMIN_ACCOUNT))
      .mockResolvedValueOnce(jsonResponse(UNITS))
      .mockResolvedValueOnce(jsonResponse({ items: [], total: 0, page: 1, page_size: 0 }))

    renderPage()

    expect(await screen.findByText('Kilogramo')).toBeInTheDocument()
    expect(screen.getByText('Unidad')).toBeInTheDocument()
  })

  it('asks for confirmation before creating a unit, and applies it only when confirmed', async () => {
    const user = userEvent.setup()
    fetchMock
      .mockResolvedValueOnce(jsonResponse(ADMIN_ACCOUNT))
      .mockResolvedValueOnce(jsonResponse(UNITS))
      .mockResolvedValueOnce(jsonResponse({ items: [], total: 0, page: 1, page_size: 0 }))
      .mockResolvedValueOnce(
        jsonResponse({ id: 3, name: 'Metro', abbreviation: 'm', allows_fraction: true, status: 'active' }, 201),
      )

    renderPage()

    await screen.findByText('Kilogramo')
    await user.click(screen.getByRole('button', { name: '+ Nueva unidad' }))
    await user.type(screen.getByLabelText('Nueva unidad'), 'Metro')
    await user.type(screen.getByLabelText('Abreviatura'), 'm')

    const callsBeforeConfirm = fetchMock.mock.calls.length
    await user.click(screen.getByRole('button', { name: 'Crear' }))

    const dialog = await screen.findByRole('alertdialog')
    expect(fetchMock.mock.calls.length).toBe(callsBeforeConfirm)

    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(fetchMock.mock.calls.length).toBe(callsBeforeConfirm)
    expect(screen.queryByText('Metro')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Crear' }))
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Crear' }))

    expect(await screen.findByText('Metro')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenLastCalledWith(
      '/units',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ name: 'Metro', abbreviation: 'm', allows_fraction: false }),
      }),
    )
  })

  it('does not offer creation or edition to an employee', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ ...ADMIN_ACCOUNT, role: 'Empleado' }))
      .mockResolvedValueOnce(jsonResponse(UNITS))
      .mockResolvedValueOnce(jsonResponse({ items: [], total: 0, page: 1, page_size: 0 }))

    renderPage()

    await screen.findByText('Kilogramo')
    expect(screen.queryByRole('button', { name: '+ Nueva unidad' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Editar' })).not.toBeInTheDocument()
  })
})
