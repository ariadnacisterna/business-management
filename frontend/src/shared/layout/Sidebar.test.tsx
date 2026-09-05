import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { Sidebar } from './Sidebar'

function renderSidebar(initialPath: string, isOpen = false, onNavigate: () => void = vi.fn()) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Sidebar isOpen={isOpen} onNavigate={onNavigate} />
      <Routes>
        <Route path="/" element={<h1>Panel</h1>} />
        <Route path="/products" element={<h1>Productos</h1>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('Sidebar', () => {
  it('marks the current section as active', () => {
    renderSidebar('/products')

    expect(screen.getByRole('link', { name: 'Productos' })).toHaveAttribute('aria-current', 'page')
  })

  it('navigates to the selected section and notifies the caller (mobile drawer open)', async () => {
    const user = userEvent.setup()
    const onNavigate = vi.fn()
    // With the mobile drawer open, both the permanent desktop rail and the
    // overlay drawer are in the DOM (CSS breakpoints hide one of them, which
    // jsdom does not evaluate) — the overlay's copy is the last one rendered.
    renderSidebar('/products', true, onNavigate)

    const productLinks = screen.getAllByRole('link', { name: 'Productos' })
    await user.click(productLinks[productLinks.length - 1])

    expect(await screen.findByRole('heading', { name: 'Productos' })).toBeInTheDocument()
    expect(onNavigate).toHaveBeenCalled()
  })

  it('renders unbuilt sections as disabled, non-navigable items', () => {
    renderSidebar('/products')

    for (const label of ['Precios', 'Inventario', 'Ventas', 'Proveedores']) {
      const item = screen.getByText(label).closest('[aria-disabled]')
      expect(item).toHaveAttribute('aria-disabled', 'true')
      expect(screen.queryByRole('link', { name: new RegExp(label) })).not.toBeInTheDocument()
    }
  })

  it('navigates to the dashboard from "Panel"', async () => {
    const user = userEvent.setup()
    renderSidebar('/products')

    await user.click(screen.getByRole('link', { name: 'Panel' }))

    expect(await screen.findByRole('heading', { name: 'Panel' })).toBeInTheDocument()
  })

  it('collapses the desktop rail to icons only, and can expand it back', async () => {
    const user = userEvent.setup()
    renderSidebar('/products')
    const nav = within(screen.getByRole('navigation'))

    expect(nav.getAllByText('Productos').length).toBeGreaterThan(0)

    await user.click(screen.getByRole('button', { name: 'Colapsar menú' }))
    expect(nav.queryByText('Productos')).not.toBeInTheDocument()
    expect(nav.getByRole('link', { name: 'Productos' })).toHaveAttribute('title', 'Productos')

    await user.click(screen.getByRole('button', { name: 'Expandir menú' }))
    expect(nav.getAllByText('Productos').length).toBeGreaterThan(0)
  })
})
