import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from './AuthContext'
import { BusinessSwitcher } from './BusinessSwitcher'

const SINGLE_BUSINESS_ACCOUNT = {
  id: 1,
  name: 'Ada Lovelace',
  user_name: 'ada',
  status: 'activo',
  role: 'Administrador',
  active_business_id: 1,
  businesses: [{ id: 1, name: 'Mercería', industry: 'Mercería' }],
}

const TWO_BUSINESS_ACCOUNT = {
  id: 2,
  name: 'Diaco',
  user_name: 'diaco',
  status: 'activo',
  role: 'Administrador',
  active_business_id: 1,
  businesses: [
    { id: 1, name: 'Mercería', industry: 'Mercería' },
    { id: 2, name: 'Despensa', industry: 'Despensa' },
  ],
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function renderSwitcher() {
  return render(
    <AuthProvider>
      <BusinessSwitcher />
    </AuthProvider>,
  )
}

describe('BusinessSwitcher', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })

  it('renders nothing when the account has access to a single business', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(SINGLE_BUSINESS_ACCOUNT))

    renderSwitcher()

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    expect(screen.queryByLabelText('Negocio')).not.toBeInTheDocument()
  })

  it('shows a selector and switches the active business when the account has more than one', async () => {
    const user = userEvent.setup()
    fetchMock
      .mockResolvedValueOnce(jsonResponse(TWO_BUSINESS_ACCOUNT))
      .mockResolvedValueOnce(
        jsonResponse({ ...TWO_BUSINESS_ACCOUNT, active_business_id: 2 }),
      )

    renderSwitcher()

    const select = await screen.findByLabelText('Negocio')
    expect(select).toHaveValue('1')

    await user.selectOptions(select, '2')

    expect(fetchMock).toHaveBeenLastCalledWith(
      '/auth/active-business',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ business_id: 2 }),
      }),
    )
    expect(await screen.findByLabelText('Negocio')).toHaveValue('2')
  })

  it('shows an error message when switching business fails', async () => {
    const user = userEvent.setup()
    fetchMock
      .mockResolvedValueOnce(jsonResponse(TWO_BUSINESS_ACCOUNT))
      .mockResolvedValueOnce(jsonResponse({ detail: 'La cuenta no tiene acceso a ese negocio' }, 403))

    renderSwitcher()

    const select = await screen.findByLabelText('Negocio')
    await user.selectOptions(select, '2')

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No se pudo cambiar de negocio. Intentá de nuevo.',
    )
  })
})
