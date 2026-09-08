import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ScrollToTopButton } from './ScrollToTopButton'

function setScrollY(value: number) {
  Object.defineProperty(window, 'scrollY', { value, writable: true, configurable: true })
}

afterEach(() => {
  setScrollY(0)
})

describe('ScrollToTopButton', () => {
  it('does not render at the top of the page', () => {
    setScrollY(0)
    render(<ScrollToTopButton />)

    expect(screen.queryByLabelText('Volver arriba')).not.toBeInTheDocument()
  })

  it('appears after scrolling the window past the threshold', () => {
    setScrollY(0)
    render(<ScrollToTopButton />)

    setScrollY(500)
    fireEvent.scroll(window)

    expect(screen.getByLabelText('Volver arriba')).toBeInTheDocument()
  })

  it('scrolls the window smoothly to the top on click', () => {
    setScrollY(500)
    render(<ScrollToTopButton />)
    fireEvent.scroll(window)

    const scrollTo = vi.fn()
    window.scrollTo = scrollTo

    fireEvent.click(screen.getByLabelText('Volver arriba'))

    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' })
  })

  it('appears after scrolling a nested container (e.g. desktop table view) past the threshold', () => {
    const { container } = render(
      <div>
        <div data-testid="inner" style={{ overflow: 'auto' }}>
          content
        </div>
        <ScrollToTopButton />
      </div>,
    )

    const inner = screen.getByTestId('inner')
    Object.defineProperty(inner, 'scrollTop', { value: 500, writable: true, configurable: true })
    fireEvent.scroll(inner)

    expect(screen.getByLabelText('Volver arriba')).toBeInTheDocument()

    const innerScrollTo = vi.fn()
    inner.scrollTo = innerScrollTo

    fireEvent.click(screen.getByLabelText('Volver arriba'))

    expect(innerScrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' })
    expect(container).toBeTruthy()
  })
})
