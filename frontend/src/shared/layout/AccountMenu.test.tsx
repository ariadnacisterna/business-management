import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Account } from '../../api/types'
import { ToastProvider } from '../Toast'
import { AccountMenu } from './AccountMenu'

const ACCOUNT: Account = {
  id: 1,
  name: 'Ada Lovelace',
  user_name: 'ada',
  status: 'activo',
  font_size: 3,
  role: 'Administrador',
  active_business_id: 1,
  businesses: [{ id: 1, name: 'Negocio principal', industry: 'General' }],
}

function renderMenu(onLogout: () => Promise<void>) {
  return render(
    <ToastProvider>
      <AccountMenu account={ACCOUNT} onLogout={onLogout} onSwitchBusiness={vi.fn()} />
    </ToastProvider>,
  )
}

describe('AccountMenu', () => {
  it('disables "Cerrar sesión" while the logout is in flight, so it is sent only once', async () => {
    const user = userEvent.setup()
    let finishLogout: () => void = () => {}
    const onLogout = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishLogout = resolve
        }),
    )
    renderMenu(onLogout)

    await user.click(screen.getByRole('button', { name: 'Menú de la cuenta de Ada Lovelace' }))
    await user.click(screen.getByRole('button', { name: 'Cerrar sesión' }))

    const busyButton = screen.getByRole('button', { name: 'Cerrando sesión…' })
    expect(busyButton).toBeDisabled()
    await user.click(busyButton)
    expect(onLogout).toHaveBeenCalledTimes(1)

    finishLogout()
  })

  it('closes the menu with the Escape key', async () => {
    const user = userEvent.setup()
    renderMenu(vi.fn(() => Promise.resolve()))

    await user.click(screen.getByRole('button', { name: 'Menú de la cuenta de Ada Lovelace' }))
    expect(screen.getByRole('button', { name: 'Cerrar sesión' })).toBeInTheDocument()

    await user.keyboard('{Escape}')

    expect(screen.queryByRole('button', { name: 'Cerrar sesión' })).not.toBeInTheDocument()
  })
})
