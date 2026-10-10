import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { RowMenu } from './RowMenu'

describe('RowMenu', () => {
  it('moves the focus to the first action and closes with the Escape key', async () => {
    const user = userEvent.setup()
    const onEdit = vi.fn()
    render(
      <RowMenu
        title="Cinta bebé"
        items={[
          { label: 'Próxima acción', onClick: vi.fn(), disabled: true },
          { label: 'Editar', onClick: onEdit },
        ]}
      />,
    )

    const trigger = screen.getByRole('button', { name: 'Acciones para Cinta bebé' })
    await user.click(trigger)

    expect(screen.getByRole('button', { name: 'Editar' })).toHaveFocus()

    await user.keyboard('{Escape}')

    expect(screen.queryByRole('button', { name: 'Editar' })).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
    expect(onEdit).not.toHaveBeenCalled()
  })
})
