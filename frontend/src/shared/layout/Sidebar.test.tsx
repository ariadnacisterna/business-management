import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import type { Account } from '../../api/types'
import { Sidebar } from './Sidebar'

const ADMINISTRADOR_ACCOUNT: Account = {
  id: 1,
  name: 'Cuenta de prueba',
  user_name: 'admin',
  status: 'activo',
  role: 'Administrador',
  active_business_id: 1,
  businesses: [{ id: 1, name: 'Negocio principal', industry: 'General' }],
}

function renderSidebar(
  initialPath: string,
  isOpen = false,
  onNavigate: () => void = vi.fn(),
  account: Account | null = ADMINISTRADOR_ACCOUNT,
) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Sidebar isOpen={isOpen} onNavigate={onNavigate} account={account} />
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

    for (const label of ['Inventario', 'Ventas', 'Proveedores']) {
      const item = screen.getByText(label).closest('[aria-disabled]')
      expect(item).toHaveAttribute('aria-disabled', 'true')
      expect(screen.queryByRole('link', { name: new RegExp(label) })).not.toBeInTheDocument()
    }
  })

  it('renders "Precios" as a navigable link', () => {
    renderSidebar('/products')

    expect(screen.getByRole('link', { name: 'Precios' })).toBeInTheDocument()
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

  it('hides "Panel" for roles that cannot view the dashboard', () => {
    renderSidebar('/products', false, vi.fn(), { ...ADMINISTRADOR_ACCOUNT, role: 'Gerente' })

    expect(screen.queryByRole('link', { name: 'Panel' })).not.toBeInTheDocument()
  })

  it('hides "Proveedores" but keeps "Inventario" for a gerente', () => {
    renderSidebar('/products', false, vi.fn(), { ...ADMINISTRADOR_ACCOUNT, role: 'Gerente' })

    expect(screen.queryByText('Proveedores')).not.toBeInTheDocument()
    expect(screen.getByText('Inventario')).toBeInTheDocument()
  })

  it('hides "Panel", "Inventario" and "Proveedores" for an empleado', () => {
    renderSidebar('/products', false, vi.fn(), { ...ADMINISTRADOR_ACCOUNT, role: 'Empleado' })

    expect(screen.queryByText('Panel')).not.toBeInTheDocument()
    expect(screen.queryByText('Inventario')).not.toBeInTheDocument()
    expect(screen.queryByText('Proveedores')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Productos' })).toBeInTheDocument()
    expect(screen.getByText('Ventas')).toBeInTheDocument()
  })

  it('shows "Cuentas" only for administrador and above', () => {
    renderSidebar('/products')
    expect(screen.getByRole('link', { name: 'Cuentas' })).toBeInTheDocument()
  })

  it('hides "Cuentas" for gerente and empleado', () => {
    renderSidebar('/products', false, vi.fn(), { ...ADMINISTRADOR_ACCOUNT, role: 'Gerente' })
    expect(screen.queryByText('Cuentas')).not.toBeInTheDocument()

    renderSidebar('/products', false, vi.fn(), { ...ADMINISTRADOR_ACCOUNT, role: 'Empleado' })
    expect(screen.queryAllByText('Cuentas')).toHaveLength(0)
  })
})
