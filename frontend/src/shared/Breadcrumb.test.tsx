import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Breadcrumb } from './Breadcrumb'

describe('Breadcrumb', () => {
  it('renders every segment with the separator, last segment in brand color', () => {
    render(<Breadcrumb segments={['A', 'B', 'C']} />)

    const last = screen.getByText('C')
    expect(last).toHaveClass('text-brand')
    expect(last.parentElement).toHaveTextContent('A › B › C')
  })

  it('renders a single segment without a leading separator', () => {
    render(<Breadcrumb segments={['Solo']} />)

    const last = screen.getByText('Solo')
    expect(last).toHaveClass('text-brand')
    expect(last.parentElement).toHaveTextContent('Solo')
  })

  it('does not render any link', () => {
    render(<Breadcrumb segments={['Clientes', 'Ana Gómez', 'Historial']} />)

    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })
})
