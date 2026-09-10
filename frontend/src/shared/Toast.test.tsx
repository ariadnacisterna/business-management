import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider, useToast } from './Toast'

function Trigger() {
  const { showSuccess, showError } = useToast()
  return (
    <>
      <button type="button" onClick={() => showSuccess('Guardado correctamente.')}>
        Éxito
      </button>
      <button type="button" onClick={() => showError('Algo salió mal.')}>
        Error
      </button>
    </>
  )
}

function renderTrigger() {
  return render(
    <ToastProvider>
      <Trigger />
    </ToastProvider>,
  )
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('Toast', () => {
  it('shows a success toast as a polite status message, with the ¡Listo! heading', () => {
    renderTrigger()

    fireEvent.click(screen.getByRole('button', { name: 'Éxito' }))

    const status = screen.getByRole('status')
    expect(status).toHaveTextContent('¡Listo!')
    expect(status).toHaveTextContent('Guardado correctamente.')
  })

  it('shows an error toast as an assertive alert, with the Error heading', () => {
    renderTrigger()

    fireEvent.click(screen.getByRole('button', { name: 'Error' }))

    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('Error')
    expect(alert).toHaveTextContent('Algo salió mal.')
  })

  it('stacks multiple toasts at once', () => {
    renderTrigger()

    fireEvent.click(screen.getByRole('button', { name: 'Éxito' }))
    fireEvent.click(screen.getByRole('button', { name: 'Error' }))

    expect(screen.getByText('Guardado correctamente.')).toBeInTheDocument()
    expect(screen.getByText('Algo salió mal.')).toBeInTheDocument()
  })

  it('can be closed manually before it auto-dismisses', () => {
    renderTrigger()

    fireEvent.click(screen.getByRole('button', { name: 'Éxito' }))
    expect(screen.getByRole('status')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }))
    act(() => {
      vi.advanceTimersByTime(150)
    })

    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('auto-dismisses after a few seconds', () => {
    renderTrigger()

    fireEvent.click(screen.getByRole('button', { name: 'Éxito' }))
    expect(screen.getByRole('status')).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(5000)
    })

    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('does not auto-dismiss while the pointer is hovering it', () => {
    renderTrigger()

    fireEvent.click(screen.getByRole('button', { name: 'Éxito' }))
    const toast = screen.getByRole('status')
    fireEvent.mouseEnter(toast)

    act(() => {
      vi.advanceTimersByTime(5000)
    })
    expect(screen.getByRole('status')).toBeInTheDocument()

    fireEvent.mouseLeave(toast)
    act(() => {
      vi.advanceTimersByTime(5000)
    })
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})
