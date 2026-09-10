import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { LoadErrorCard } from './LoadErrorCard'

describe('LoadErrorCard', () => {
  it('shows the message as an assertive alert with a retry button', () => {
    const onRetry = vi.fn()
    render(<LoadErrorCard message="No se pudieron cargar los productos." onRetry={onRetry} />)

    expect(screen.getByRole('alert')).toHaveTextContent('No se pudieron cargar los productos.')

    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })
})
