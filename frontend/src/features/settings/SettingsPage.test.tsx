import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AccountMenu } from '../../shared/layout/AccountMenu'
import { ToastProvider } from '../../shared/Toast'
import { AuthProvider } from '../access/AuthContext'
import { useAuth } from '../access/useAuth'
import { SettingsPage } from './SettingsPage'

function ReadyGate({ children }: { children: ReactNode }) {
  const { status } = useAuth()
  return status === 'ready' ? <>{children}</> : null
}

function MenuProbe() {
  const { account, logout, switchBusiness } = useAuth()
  return account === null ? null : (
    <AccountMenu account={account} onLogout={logout} onSwitchBusiness={switchBusiness} />
  )
}

const ACCOUNT = {
  id: 1,
  name: 'Ada Lovelace',
  user_name: 'ada',
  status: 'active',
  font_size: 2,
  role: 'Empleado',
  active_business_id: 1,
  businesses: [{ id: 1, name: 'Mercería', industry: 'Mercería' }],
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function renderPage(account: unknown = ACCOUNT) {
  const fetchMock = fetch as ReturnType<typeof vi.fn>
  fetchMock.mockResolvedValueOnce(jsonResponse(account))

  return render(
    <MemoryRouter initialEntries={['/configuraciones']}>
      <ToastProvider>
        <AuthProvider>
          <ReadyGate>
            <MenuProbe />
            <Routes>
              <Route path="/configuraciones" element={<SettingsPage />} />
            </Routes>
          </ReadyGate>
        </AuthProvider>
      </ToastProvider>
    </MemoryRouter>,
  )
}

async function waitForPage() {
  await screen.findByRole('heading', { name: 'Configuración' })
}

describe('SettingsPage', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
    document.documentElement.style.fontSize = ''
    window.localStorage.clear()
  })

  it('shows the name, username, role and active business', async () => {
    renderPage()

    expect(await screen.findByText('Ada Lovelace')).toBeInTheDocument()
    expect(screen.getByText('ada')).toBeInTheDocument()
    expect(screen.getByText('Empleado')).toBeInTheDocument()
    expect(screen.getByText('Mercería')).toBeInTheDocument()
  })

  it('lists the five sizes and marks the current one', async () => {
    renderPage()

    await waitForPage()
    for (const label of ['Chica', 'Mediana', 'Grande', 'Muy grande', 'Enorme']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument()
    }
    expect(screen.getByRole('button', { name: 'Mediana' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Grande' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('applies the account size to the page when the account loads', async () => {
    renderPage({ ...ACCOUNT, font_size: 4 })

    await waitForPage()

    expect(document.documentElement.style.fontSize).toBe('18px')
    expect(window.localStorage.getItem('font_size')).toBe('4')
  })

  it('previews the chosen size without saving or changing the page until Guardar is pressed', async () => {
    const user = userEvent.setup()
    renderPage()
    await waitForPage()
    const fetchMock = fetch as ReturnType<typeof vi.fn>

    expect(screen.getByRole('button', { name: 'Guardar' })).toBeDisabled()

    await user.click(screen.getByRole('button', { name: 'Enorme' }))

    expect(screen.getByRole('button', { name: 'Enorme' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('Vista previa').parentElement).toHaveStyle({ fontSize: '20px' })
    expect(document.documentElement.style.fontSize).toBe('14px')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'Guardar' })).toBeEnabled()
  })

  it('saves the chosen size on Guardar, applies it and confirms with a toast', async () => {
    const user = userEvent.setup()
    renderPage()
    await waitForPage()
    const fetchMock = fetch as ReturnType<typeof vi.fn>
    fetchMock.mockResolvedValueOnce(jsonResponse({ ...ACCOUNT, font_size: 5 }))

    await user.click(screen.getByRole('button', { name: 'Enorme' }))
    await user.click(screen.getByRole('button', { name: 'Guardar' }))

    await waitFor(() => expect(document.documentElement.style.fontSize).toBe('20px'))
    const [url, init] = fetchMock.mock.calls[1] as [string, RequestInit]
    expect(url).toBe('/auth/me/preferences')
    expect(init.method).toBe('PATCH')
    expect(JSON.parse(init.body as string)).toEqual({ font_size: 5 })
    expect(await screen.findByText('Tamaño de letra: Enorme.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Enorme' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Guardar' })).toBeDisabled()
  })

  it('goes back to the saved size and shows an error when saving fails', async () => {
    const user = userEvent.setup()
    renderPage()
    await waitForPage()
    const fetchMock = fetch as ReturnType<typeof vi.fn>
    fetchMock.mockResolvedValueOnce(jsonResponse({ detail: 'Error' }, 500))

    await user.click(screen.getByRole('button', { name: 'Muy grande' }))
    await user.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(
      await screen.findByText('No se pudo guardar el tamaño de letra. Intentá de nuevo.'),
    ).toBeInTheDocument()
    expect(document.documentElement.style.fontSize).toBe('14px')
    expect(screen.getByRole('button', { name: 'Mediana' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Muy grande' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  })

  it('lets an empleado edit their own name in a popup, and the account menu shows it', async () => {
    const user = userEvent.setup()
    renderPage()
    await waitForPage()
    const fetchMock = fetch as ReturnType<typeof vi.fn>
    fetchMock.mockResolvedValueOnce(jsonResponse({ ...ACCOUNT, name: 'Grace Hopper' }))

    await user.click(screen.getByRole('button', { name: 'Editar nombre' }))
    const nameDialog = screen.getByRole('dialog', { name: 'Cambiar nombre' })
    expect(nameDialog.querySelector('p.opacity-60')).toHaveTextContent('Configuración › Cambiar nombre')
    const dialog = within(nameDialog)
    expect(dialog.getByRole('button', { name: 'Guardar' })).toBeDisabled()

    await user.clear(dialog.getByLabelText('Nombre'))
    await user.type(dialog.getByLabelText('Nombre'), 'Grace Hopper')
    await user.click(dialog.getByRole('button', { name: 'Guardar' }))

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const confirmation = within(screen.getByRole('alertdialog', { name: 'Cambiar nombre' }))
    expect(confirmation.getByText('¿Cambiar tu nombre a "Grace Hopper"?')).toBeInTheDocument()

    await user.click(confirmation.getByRole('button', { name: 'Confirmar' }))

    const [url, init] = fetchMock.mock.calls[1] as [string, RequestInit]
    expect(url).toBe('/auth/me')
    expect(init.method).toBe('PATCH')
    expect(JSON.parse(init.body as string)).toEqual({ name: 'Grace Hopper' })
    expect(await screen.findByText('Nombre cambiado.')).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Cambiar nombre' })).not.toBeInTheDocument()
    expect(screen.getByText('Grace Hopper')).toBeInTheDocument()
    expect(screen.getByText('Grace')).toBeInTheDocument()
  })

  it('does not send the new name when the confirmation is cancelled', async () => {
    const user = userEvent.setup()
    renderPage()
    await waitForPage()
    const fetchMock = fetch as ReturnType<typeof vi.fn>

    await user.click(screen.getByRole('button', { name: 'Editar nombre' }))
    const dialog = within(screen.getByRole('dialog', { name: 'Cambiar nombre' }))
    await user.clear(dialog.getByLabelText('Nombre'))
    await user.type(dialog.getByLabelText('Nombre'), 'Otra Persona')
    await user.click(dialog.getByRole('button', { name: 'Guardar' }))
    const confirmation = within(screen.getByRole('alertdialog', { name: 'Cambiar nombre' }))
    await user.click(confirmation.getByRole('button', { name: 'Cancelar' }))

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'Cambiar nombre' })).toBeInTheDocument()
  })

  it('does not send the new name when the popup is cancelled', async () => {
    const user = userEvent.setup()
    renderPage()
    await waitForPage()
    const fetchMock = fetch as ReturnType<typeof vi.fn>

    await user.click(screen.getByRole('button', { name: 'Editar nombre' }))
    const dialog = within(screen.getByRole('dialog', { name: 'Cambiar nombre' }))
    await user.clear(dialog.getByLabelText('Nombre'))
    await user.type(dialog.getByLabelText('Nombre'), 'Otra Persona')
    await user.click(dialog.getByRole('button', { name: 'Cancelar' }))

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('dialog', { name: 'Cambiar nombre' })).not.toBeInTheDocument()
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument()
  })

  it('does not allow saving an empty name', async () => {
    const user = userEvent.setup()
    renderPage()
    await waitForPage()

    await user.click(screen.getByRole('button', { name: 'Editar nombre' }))
    const dialog = within(screen.getByRole('dialog', { name: 'Cambiar nombre' }))
    await user.clear(dialog.getByLabelText('Nombre'))

    expect(dialog.getByRole('button', { name: 'Guardar' })).toBeDisabled()
  })

  async function openPasswordModal(user: ReturnType<typeof userEvent.setup>) {
    await waitForPage()
    await user.click(screen.getByRole('button', { name: 'Cambiar contraseña' }))
    return within(screen.getByRole('dialog', { name: 'Cambiar contraseña' }))
  }

  async function fillPasswords(
    user: ReturnType<typeof userEvent.setup>,
    dialog: ReturnType<typeof within>,
    current: string,
    next: string,
    repeat: string,
  ) {
    await user.type(dialog.getByLabelText(/^Contraseña actual/), current)
    await user.type(dialog.getByLabelText(/^Contraseña nueva/), next)
    await user.type(dialog.getByLabelText(/^Repetir contraseña/), repeat)
  }

  it('shows "Cambiar contraseña" as a row that opens a popup with the three fields', async () => {
    const user = userEvent.setup()
    renderPage()

    const dialog = await openPasswordModal(user)

    expect(dialog.getByLabelText(/^Contraseña actual/)).toBeInTheDocument()
    expect(dialog.getByLabelText(/^Contraseña nueva/)).toBeInTheDocument()
    expect(dialog.getByLabelText(/^Repetir contraseña/)).toBeInTheDocument()
    expect(dialog.getByText('Al menos 4 caracteres')).toBeInTheDocument()

    const rawDialog = screen.getByRole('dialog', { name: 'Cambiar contraseña' })
    expect(rawDialog.querySelector('p.opacity-60')).toHaveTextContent('Configuración › Cambiar contraseña')
  })

  it('lets an empleado change their own password in the popup', async () => {
    const user = userEvent.setup()
    renderPage()
    const dialog = await openPasswordModal(user)
    await fillPasswords(user, dialog, 'Actual-1', 'Nueva-2', 'Nueva-2')
    const fetchMock = fetch as ReturnType<typeof vi.fn>
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }))

    await user.click(dialog.getByRole('button', { name: 'Cambiar' }))

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const confirmation = within(screen.getByRole('alertdialog', { name: 'Cambiar contraseña' }))
    expect(
      confirmation.getByText(
        '¿Cambiar tu contraseña? Se van a cerrar las demás sesiones abiertas de tu cuenta.',
      ),
    ).toBeInTheDocument()

    await user.click(confirmation.getByRole('button', { name: 'Confirmar' }))

    const [url, init] = fetchMock.mock.calls[1] as [string, RequestInit]
    expect(url).toBe('/auth/me/password')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({
      current_password: 'Actual-1',
      new_password: 'Nueva-2',
    })
    expect(await screen.findByText(/Se cerraron las demás sesiones/)).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Cambiar contraseña' })).not.toBeInTheDocument()
  })

  it('does not send anything when the repeated password does not match', async () => {
    const user = userEvent.setup()
    renderPage()
    const dialog = await openPasswordModal(user)
    await fillPasswords(user, dialog, 'Actual-1', 'Nueva-2', 'Nueva-3')
    const fetchMock = fetch as ReturnType<typeof vi.fn>

    await user.click(dialog.getByRole('button', { name: 'Cambiar' }))

    expect(dialog.getByText('Las contraseñas no coinciden.')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('does not send anything when the new password does not meet the rules', async () => {
    const user = userEvent.setup()
    renderPage()
    const dialog = await openPasswordModal(user)
    await fillPasswords(user, dialog, 'Actual-1', 'sololetras', 'sololetras')
    const fetchMock = fetch as ReturnType<typeof vi.fn>

    await user.click(dialog.getByRole('button', { name: 'Cambiar' }))

    expect(dialog.getByText('La contraseña nueva no cumple los requisitos.')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('shows the server error inside the popup when the current password is wrong', async () => {
    const user = userEvent.setup()
    renderPage()
    const dialog = await openPasswordModal(user)
    await fillPasswords(user, dialog, 'Equivocada-1', 'Nueva-2', 'Nueva-2')
    const fetchMock = fetch as ReturnType<typeof vi.fn>
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ detail: 'La contraseña actual no es correcta' }, 403),
    )

    await user.click(dialog.getByRole('button', { name: 'Cambiar' }))
    await user.click(
      within(screen.getByRole('alertdialog', { name: 'Cambiar contraseña' })).getByRole('button', {
        name: 'Confirmar',
      }),
    )

    expect(await dialog.findByText('La contraseña actual no es correcta')).toBeInTheDocument()
    expect(dialog.getByLabelText(/^Contraseña actual/)).toHaveValue('Equivocada-1')
  })

  it('does not send the new password when the confirmation is cancelled', async () => {
    const user = userEvent.setup()
    renderPage()
    const dialog = await openPasswordModal(user)
    await fillPasswords(user, dialog, 'Actual-1', 'Nueva-2', 'Nueva-2')
    const fetchMock = fetch as ReturnType<typeof vi.fn>

    await user.click(dialog.getByRole('button', { name: 'Cambiar' }))
    const confirmation = within(screen.getByRole('alertdialog', { name: 'Cambiar contraseña' }))
    await user.click(confirmation.getByRole('button', { name: 'Cancelar' }))

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'Cambiar contraseña' })).toBeInTheDocument()
  })

  it('does not send anything when the popup is cancelled', async () => {
    const user = userEvent.setup()
    renderPage()
    const dialog = await openPasswordModal(user)
    await fillPasswords(user, dialog, 'Actual-1', 'Nueva-2', 'Nueva-2')
    const fetchMock = fetch as ReturnType<typeof vi.fn>

    await user.click(dialog.getByRole('button', { name: 'Cancelar' }))

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('dialog', { name: 'Cambiar contraseña' })).not.toBeInTheDocument()
  })

  it('shows and hides the typed passwords', async () => {
    const user = userEvent.setup()
    renderPage()
    const dialog = await openPasswordModal(user)
    const current = dialog.getByLabelText(/^Contraseña actual/)

    expect(current).toHaveAttribute('type', 'password')

    await user.click(dialog.getByRole('button', { name: 'Mostrar contraseñas' }))

    expect(current).toHaveAttribute('type', 'text')
    expect(dialog.getByLabelText(/^Contraseña nueva/)).toHaveAttribute('type', 'text')

    await user.click(dialog.getByRole('button', { name: 'Ocultar contraseñas' }))

    expect(current).toHaveAttribute('type', 'password')
  })
})
