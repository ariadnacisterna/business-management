import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { ToastProvider } from '../../shared/Toast'
import { AuthProvider, useAuth } from '../access/AuthContext'
import { AttributesPage } from './AttributesPage'

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

const ATTRIBUTES = [{ id: 1, name: 'color', status: 'active' }]

const VALUES = [
  { id: 10, attribute_id: 1, value: 'Rojo', status: 'active' },
  { id: 11, attribute_id: 1, value: 'Azul', status: 'active' },
]

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function renderPage() {
  return render(
    <ToastProvider>
      <AuthProvider>
        <ReadyGate>
          <AttributesPage />
        </ReadyGate>
      </AuthProvider>
    </ToastProvider>,
  )
}

describe('AttributesPage', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })

  it('deactivates and reactivates an attribute value after confirmation', async () => {
    const user = userEvent.setup()
    fetchMock
      .mockResolvedValueOnce(jsonResponse(ADMIN_ACCOUNT))
      .mockResolvedValueOnce(jsonResponse(ATTRIBUTES))
      .mockResolvedValueOnce(jsonResponse(VALUES))
      .mockResolvedValueOnce(jsonResponse({ ...VALUES[0], status: 'inactive' }))
      .mockResolvedValueOnce(jsonResponse({ ...VALUES[0], status: 'active' }))

    renderPage()

    await screen.findByText('color')
    await user.click(screen.getByRole('button', { name: 'Ver valores' }))
    await screen.findByText('Rojo')

    const [desactivarButton] = screen.getAllByRole('button', { name: 'Desactivar' })
    await user.click(desactivarButton)

    const deactivateDialog = await screen.findByRole('alertdialog', { name: 'Desactivar valor' })
    await user.click(within(deactivateDialog).getByRole('button', { name: 'Desactivar' }))

    expect(fetchMock).toHaveBeenLastCalledWith(
      '/attribute-values/10/deactivate',
      expect.objectContaining({ method: 'POST' }),
    )
    expect(await screen.findByRole('status')).toHaveTextContent('Valor desactivado.')

    const activarButton = await screen.findByRole('button', { name: 'Activar' })
    await user.click(activarButton)
    const reactivateDialog = await screen.findByRole('alertdialog', { name: 'Activar valor' })
    await user.click(within(reactivateDialog).getByRole('button', { name: 'Activar' }))

    expect(fetchMock).toHaveBeenLastCalledWith(
      '/attribute-values/10/reactivate',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('asks for confirmation before creating an attribute, and does nothing on cancel', async () => {
    const user = userEvent.setup()
    fetchMock
      .mockResolvedValueOnce(jsonResponse(ADMIN_ACCOUNT))
      .mockResolvedValueOnce(jsonResponse(ATTRIBUTES))

    renderPage()

    await screen.findByText('color')
    await user.click(screen.getByRole('button', { name: '+ Nuevo atributo' }))
    await user.type(screen.getByLabelText('Nuevo atributo'), 'Talle')
    const callsBeforeConfirm = fetchMock.mock.calls.length
    await user.click(screen.getByRole('button', { name: 'Crear' }))

    const dialog = await screen.findByRole('alertdialog')
    expect(fetchMock.mock.calls.length).toBe(callsBeforeConfirm)

    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(fetchMock.mock.calls.length).toBe(callsBeforeConfirm)
    expect(screen.getByLabelText('Nuevo atributo')).toHaveValue('Talle')

    fetchMock.mockResolvedValueOnce(jsonResponse({ id: 2, name: 'Talle', status: 'active' }))
    await user.click(screen.getByRole('button', { name: 'Crear' }))
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Crear' }))

    expect(fetchMock).toHaveBeenLastCalledWith(
      '/attributes',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ name: 'Talle' }) }),
    )
  })

  it('does not offer status changes to an employee', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ ...ADMIN_ACCOUNT, role: 'Empleado' }))
      .mockResolvedValueOnce(jsonResponse(ATTRIBUTES))
      .mockResolvedValueOnce(jsonResponse(VALUES))

    const user = userEvent.setup()
    renderPage()

    await screen.findByText('color')
    await user.click(screen.getByRole('button', { name: 'Ver valores' }))
    await screen.findByText('Rojo')

    expect(screen.queryByRole('button', { name: 'Desactivar' })).not.toBeInTheDocument()
  })
})
