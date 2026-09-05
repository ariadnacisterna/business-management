import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DashboardPage } from './DashboardPage'

describe('DashboardPage', () => {
  it('shows a placeholder while the panel is under construction', () => {
    render(<DashboardPage />)

    expect(screen.getByRole('heading', { name: 'Panel' })).toBeInTheDocument()
    expect(screen.getByText('En construcción')).toBeInTheDocument()
  })
})
