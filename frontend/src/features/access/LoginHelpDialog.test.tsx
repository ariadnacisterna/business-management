import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { LoginHelpDialog } from './LoginHelpDialog'

describe('LoginHelpDialog', () => {
  it('has the shared close button (D-054) and closes with the Escape key', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<LoginHelpDialog onClose={onClose} />)

    expect(screen.getByRole('alertdialog', { name: '¿Problemas para acceder?' })).toHaveFocus()

    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)

    await user.click(screen.getByRole('button', { name: 'Cerrar' }))
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(2))
  })
})
