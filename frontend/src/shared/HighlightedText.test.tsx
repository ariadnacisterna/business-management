import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { HighlightedText } from './HighlightedText'

describe('HighlightedText', () => {
  it('wraps the matching substring in a red span, case-insensitively', () => {
    render(<HighlightedText text="Catulina" query="tul" />)

    const highlighted = screen.getByText('tul')
    expect(highlighted).toHaveClass('text-danger')
    expect(highlighted.parentElement).toHaveTextContent('Catulina')
  })

  it('renders the plain text when the query is empty', () => {
    render(<HighlightedText text="Catulina" query="" />)

    expect(screen.getByText('Catulina')).toBeInTheDocument()
    expect(screen.queryByText('Catulina')).not.toHaveClass('text-danger')
  })

  it('does not highlight anything when there is no match', () => {
    const { container } = render(<HighlightedText text="Catulina" query="xyz" />)

    expect(container.querySelector('.text-danger')).not.toBeInTheDocument()
  })
})
