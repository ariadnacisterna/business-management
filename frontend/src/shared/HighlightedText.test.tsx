import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { HighlightedText } from './HighlightedText'

describe('HighlightedText', () => {
  it('wraps the matching substring in a brand span, case-insensitively', () => {
    render(<HighlightedText text="Catulina" query="tul" />)

    const highlighted = screen.getByText('tul')
    expect(highlighted).toHaveClass('text-brand')
    expect(highlighted.parentElement).toHaveTextContent('Catulina')
  })

  it('renders the plain text when the query is empty', () => {
    render(<HighlightedText text="Catulina" query="" />)

    expect(screen.getByText('Catulina')).toBeInTheDocument()
    expect(screen.queryByText('Catulina')).not.toHaveClass('text-brand')
  })

  it('does not highlight anything when there is no match', () => {
    const { container } = render(<HighlightedText text="Catulina" query="xyz" />)

    expect(container.querySelector('.text-brand')).not.toBeInTheDocument()
  })
})
