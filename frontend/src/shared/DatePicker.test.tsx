import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { DatePicker, formatISODateDisplay } from './DatePicker'

function Harness({ disableFuture = false }: { disableFuture?: boolean }) {
  const [value, setValue] = useState('')
  return <DatePicker value={value} onChange={setValue} ariaLabel="Última compra" disableFuture={disableFuture} />
}

function dayLabel(date: Date): string {
  return date.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

describe('formatISODateDisplay', () => {
  it('formats an ISO date as dd/mm/aaaa', () => {
    expect(formatISODateDisplay('2023-01-07')).toBe('07/01/2023')
  })
})

describe('DatePicker', () => {
  it('shows the placeholder when there is no value', () => {
    render(<Harness />)

    expect(screen.getByRole('button', { name: 'Última compra' })).toHaveTextContent('Seleccionar fecha')
  })

  it('picks a day from the calendar and shows it formatted as dd/mm/aaaa', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    const today = new Date()
    const target = new Date(today.getFullYear(), today.getMonth(), 7)

    await user.click(screen.getByRole('button', { name: 'Última compra' }))
    await user.click(screen.getByRole('button', { name: dayLabel(target) }))
    await user.click(screen.getByRole('button', { name: 'Listo' }))

    expect(screen.getByRole('button', { name: 'Última compra' })).toHaveTextContent(dayLabel(target))
  })

  it('jumps to a year through the year grid instead of paging month by month', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    const currentYear = new Date().getFullYear()
    const targetYear = currentYear - 3

    await user.click(screen.getByRole('button', { name: 'Última compra' }))
    await user.click(screen.getByRole('button', { name: String(currentYear) }))
    await user.click(screen.getByRole('button', { name: String(targetYear) }))

    expect(screen.getByRole('button', { name: String(targetYear) })).toBeInTheDocument()
  })

  it('disables tomorrow when disableFuture is set', async () => {
    const user = userEvent.setup()
    render(<Harness disableFuture />)

    const today = new Date()
    const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1)

    await user.click(screen.getByRole('button', { name: 'Última compra' }))

    expect(screen.getByRole('button', { name: dayLabel(tomorrow) })).toBeDisabled()
  })

  it('does not disable tomorrow when disableFuture is not set', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    const today = new Date()
    const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1)

    await user.click(screen.getByRole('button', { name: 'Última compra' }))

    expect(screen.getByRole('button', { name: dayLabel(tomorrow) })).not.toBeDisabled()
  })
})
