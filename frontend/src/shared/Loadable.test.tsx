import { lazy, type JSX, type ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Loadable } from './Loadable'

function renderWithLayout(page: ReactNode) {
  return render(
    <MemoryRouter>
      <nav>Menú lateral</nav>
      <Loadable>{page}</Loadable>
    </MemoryRouter>,
  )
}

describe('Loadable', () => {
  const reload = vi.fn()

  beforeEach(() => {
    reload.mockClear()
    vi.stubGlobal('location', { ...window.location, reload })
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('shows the loading status and keeps the layout while a screen loads', async () => {
    let finish: (module: { default: () => JSX.Element }) => void = () => {}
    const Page = lazy(
      () =>
        new Promise<{ default: () => JSX.Element }>((resolve) => {
          finish = resolve
        }),
    )

    renderWithLayout(<Page />)

    expect(screen.getByRole('status')).toHaveTextContent('Cargando…')
    expect(screen.getByText('Menú lateral')).toBeInTheDocument()

    finish({ default: () => <h1>Pantalla lista</h1> })

    expect(await screen.findByRole('heading', { name: 'Pantalla lista' })).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('shows the error message with a reload button and keeps the layout when the import fails', async () => {
    const user = userEvent.setup()
    const Page = lazy(() => Promise.reject(new Error('boom')))

    renderWithLayout(<Page />)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No se pudo cargar esta pantalla. Puede ser un corte de conexión o una versión nueva de la aplicación.',
    )
    expect(screen.getByText('Menú lateral')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Recargar' }))

    expect(reload).toHaveBeenCalledTimes(1)
  })
})
