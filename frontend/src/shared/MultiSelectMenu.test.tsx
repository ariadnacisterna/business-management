import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { MultiSelectMenu } from './MultiSelectMenu'

const OPTIONS = [
  { value: '1', label: 'Librería' },
  { value: '2', label: 'Manualidades' },
  { value: '3', label: 'Telas' },
]

function Harness() {
  const [value, setValue] = useState<string[]>([])
  return (
    <MultiSelectMenu
      value={value}
      options={OPTIONS}
      onChange={setValue}
      ariaLabel="Categorías"
      placeholder="Sin categorías"
    />
  )
}

describe('MultiSelectMenu', () => {
  it('shows the placeholder when nothing is selected', () => {
    render(<Harness />)

    expect(screen.getByRole('button', { name: 'Categorías' })).toHaveTextContent('Sin categorías')
  })

  it('checks an option on click and reflects it on the trigger', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    await user.click(screen.getByRole('button', { name: 'Categorías' }))
    await user.click(screen.getByRole('option', { name: 'Librería' }))

    expect(screen.getByRole('option', { name: 'Librería' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('button', { name: 'Categorías' })).toHaveTextContent('Librería')
  })

  it('supports selecting more than one option, and keeps the menu open between clicks', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    await user.click(screen.getByRole('button', { name: 'Categorías' }))
    await user.click(screen.getByRole('option', { name: 'Librería' }))
    await user.click(screen.getByRole('option', { name: 'Telas' }))

    expect(screen.getByRole('button', { name: 'Categorías' })).toHaveTextContent('Librería, Telas')
  })

  it('unchecks an option on a second click', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    await user.click(screen.getByRole('button', { name: 'Categorías' }))
    await user.click(screen.getByRole('option', { name: 'Librería' }))
    expect(screen.getByRole('option', { name: 'Librería' })).toHaveAttribute('aria-selected', 'true')

    await user.click(screen.getByRole('option', { name: 'Librería' }))

    expect(screen.getByRole('option', { name: 'Librería' })).toHaveAttribute('aria-selected', 'false')
    expect(screen.getByRole('button', { name: 'Categorías' })).toHaveTextContent('Sin categorías')
  })
})
