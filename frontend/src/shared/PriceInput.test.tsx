import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { PriceInput } from './PriceInput'

function Harness() {
  const [value, setValue] = useState('')
  return <PriceInput value={value} onChange={setValue} ariaLabel="Precio" className="" />
}

describe('PriceInput', () => {
  it('accepts digits and a decimal point without showing an error', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    await user.type(screen.getByLabelText('Precio'), '45.50')

    expect(screen.getByLabelText('Precio')).toHaveValue('45.50')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('rejects a letter and explains why nothing was typed', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    await user.type(screen.getByLabelText('Precio'), '10a')

    expect(screen.getByLabelText('Precio')).toHaveValue('10')
    expect(screen.getByRole('alert')).toHaveTextContent('Solo se permiten números.')
  })

  it('clears the error as soon as a valid character is typed next', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    const input = screen.getByLabelText('Precio')
    await user.type(input, '10a')
    expect(screen.getByRole('alert')).toBeInTheDocument()

    await user.type(input, '5')

    expect(input).toHaveValue('105')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
