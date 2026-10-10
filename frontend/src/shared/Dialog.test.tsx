import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { Dialog } from './Dialog'

function DialogWithTrigger({ onOuterClose = () => {} }: { onOuterClose?: () => void }) {
  const [outerOpen, setOuterOpen] = useState(false)
  const [innerOpen, setInnerOpen] = useState(false)

  return (
    <>
      <button type="button" onClick={() => setOuterOpen(true)}>
        Abrir
      </button>
      {outerOpen && (
        <Dialog
          label="Externo"
          onClose={() => {
            onOuterClose()
            setOuterOpen(false)
          }}
          className=""
        >
          <input aria-label="Primero" />
          <button type="button" onClick={() => setInnerOpen(true)}>
            Abrir interno
          </button>
          {innerOpen && (
            <Dialog label="Interno" onClose={() => setInnerOpen(false)} className="">
              <button type="button">Aceptar</button>
            </Dialog>
          )}
        </Dialog>
      )}
    </>
  )
}

describe('Dialog', () => {
  it('is announced as a modal dialog and receives the focus when it opens', async () => {
    const user = userEvent.setup()
    render(<DialogWithTrigger />)

    await user.click(screen.getByRole('button', { name: 'Abrir' }))

    const dialog = screen.getByRole('dialog', { name: 'Externo' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveFocus()
  })

  it('keeps the Tab key inside the dialog', async () => {
    const user = userEvent.setup()
    render(<DialogWithTrigger />)

    await user.click(screen.getByRole('button', { name: 'Abrir' }))
    await user.tab()
    expect(screen.getByLabelText('Primero')).toHaveFocus()
    await user.tab()
    expect(screen.getByRole('button', { name: 'Abrir interno' })).toHaveFocus()
    await user.tab()
    expect(screen.getByLabelText('Primero')).toHaveFocus()
    await user.tab({ shift: true })
    expect(screen.getByRole('button', { name: 'Abrir interno' })).toHaveFocus()
  })

  it('closes with Escape and gives the focus back to the button that opened it', async () => {
    const user = userEvent.setup()
    render(<DialogWithTrigger />)

    await user.click(screen.getByRole('button', { name: 'Abrir' }))
    await user.keyboard('{Escape}')

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Abrir' })).toHaveFocus()
  })

  it('closes only the dialog on top when two are open', async () => {
    const user = userEvent.setup()
    const onOuterClose = vi.fn()
    render(<DialogWithTrigger onOuterClose={onOuterClose} />)

    await user.click(screen.getByRole('button', { name: 'Abrir' }))
    await user.click(screen.getByRole('button', { name: 'Abrir interno' }))
    expect(screen.getByRole('dialog', { name: 'Interno' })).toHaveFocus()

    await user.keyboard('{Escape}')

    expect(screen.queryByRole('dialog', { name: 'Interno' })).not.toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'Externo' })).toBeInTheDocument()
    expect(onOuterClose).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Abrir interno' })).toHaveFocus()
  })

  it('leaves Escape alone when an inner control already handled it', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(
      <Dialog label="Con menú" onClose={onClose} className="">
        <input
          aria-label="Campo"
          onKeyDown={(event) => {
            if (event.key === 'Escape') event.preventDefault()
          }}
        />
      </Dialog>,
    )

    await user.click(screen.getByLabelText('Campo'))
    await user.keyboard('{Escape}')

    expect(onClose).not.toHaveBeenCalled()
  })
})
