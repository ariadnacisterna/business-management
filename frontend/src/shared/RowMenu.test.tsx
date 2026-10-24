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

  it('draws a divider before the items marked with divider', async () => {
    const user = userEvent.setup()
    render(
      <RowMenu
        title="Cinta bebé"
        items={[
          { label: 'Ver detalle', onClick: vi.fn() },
          { label: 'Desactivar', onClick: vi.fn(), divider: true },
        ]}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Acciones para Cinta bebé' }))

    expect(screen.getAllByRole('separator')).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Desactivar' }).previousElementSibling).toBe(screen.getByRole('separator'))
  })
})
