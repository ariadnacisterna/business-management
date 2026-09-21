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
  font_size: 3,
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

  it('renders "Ventas" as a disabled, non-navigable item', () => {
    renderSidebar('/products')

    const item = screen.getByText('Ventas').closest('[aria-disabled]')
    expect(item).toHaveAttribute('aria-disabled', 'true')
    expect(screen.queryByRole('link', { name: /Ventas/ })).not.toBeInTheDocument()
  })

  it('groups the sections under Catálogo, Comercial and Administración for an administrador', () => {
    renderSidebar('/products')

    const catalogo = within(screen.getByRole('group', { name: 'Catálogo' }))
    expect(catalogo.getAllByRole('link').map((link) => link.textContent)).toEqual([
      'Productos',
      'Precios',
      'Inventario',
    ])

    const comercial = within(screen.getByRole('group', { name: 'Comercial' }))
    expect(comercial.getByText('Ventas')).toBeInTheDocument()
    expect(comercial.getByRole('link', { name: 'Clientes' })).toBeInTheDocument()
    expect(comercial.getByRole('link', { name: 'Proveedores' })).toBeInTheDocument()

    const administracion = within(screen.getByRole('group', { name: 'Administración' }))
    expect(administracion.getByRole('link', { name: 'Cuentas' })).toBeInTheDocument()
  })

  it('does not render a group with no visible items for the role', () => {
    renderSidebar('/products', false, vi.fn(), { ...ADMINISTRADOR_ACCOUNT, role: 'Gerente' })

    expect(screen.queryByRole('group', { name: 'Administración' })).not.toBeInTheDocument()
    expect(screen.queryByText('Administración')).not.toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Catálogo' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Comercial' })).toBeInTheDocument()
  })

  it('shows "Configuración" as a link for every role', () => {
    for (const role of ['Empleado', 'Gerente', 'Administrador', 'Dueño']) {
      const { unmount } = renderSidebar('/products', false, vi.fn(), {
        ...ADMINISTRADOR_ACCOUNT,
        role,
      })

      expect(screen.getByRole('link', { name: 'Configuración' })).toHaveAttribute(
        'href',
        '/configuraciones',
      )
      unmount()
    }
  })

  it('shows only divider lines between groups when the rail is collapsed', async () => {
    const user = userEvent.setup()
    renderSidebar('/products')

    await user.click(screen.getByRole('button', { name: 'Colapsar menú' }))

    expect(screen.queryByText('Catálogo')).not.toBeInTheDocument()
    expect(screen.queryByText('Comercial')).not.toBeInTheDocument()
    expect(screen.getAllByRole('separator')).toHaveLength(3)
  })

  it('renders "Inventario" as a navigable link for every role', () => {
    renderSidebar('/products')

    expect(screen.getByRole('link', { name: 'Inventario' })).toBeInTheDocument()
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

  it('shows "Inventario" but hides "Proveedores" for a gerente', () => {
    renderSidebar('/products', false, vi.fn(), { ...ADMINISTRADOR_ACCOUNT, role: 'Gerente' })

    expect(screen.getByText('Inventario')).toBeInTheDocument()
    expect(screen.queryByText('Proveedores')).not.toBeInTheDocument()
  })

  it('hides "Panel" and "Proveedores" for an empleado, but keeps "Inventario"', () => {
    renderSidebar('/products', false, vi.fn(), { ...ADMINISTRADOR_ACCOUNT, role: 'Empleado' })

    expect(screen.queryByText('Panel')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Inventario' })).toBeInTheDocument()
    expect(screen.queryByText('Proveedores')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Productos' })).toBeInTheDocument()
    expect(screen.getByText('Ventas')).toBeInTheDocument()
  })

  it('shows "Cuentas" only for administrador and above', () => {
    renderSidebar('/products')
    expect(screen.getByRole('link', { name: 'Cuentas' })).toBeInTheDocument()
  })

  it('shows "Proveedores" only for administrador and above', () => {
    renderSidebar('/products')
    expect(screen.getByRole('link', { name: 'Proveedores' })).toBeInTheDocument()
  })

  it('hides "Cuentas" for gerente and empleado', () => {
    renderSidebar('/products', false, vi.fn(), { ...ADMINISTRADOR_ACCOUNT, role: 'Gerente' })
    expect(screen.queryByText('Cuentas')).not.toBeInTheDocument()

    renderSidebar('/products', false, vi.fn(), { ...ADMINISTRADOR_ACCOUNT, role: 'Empleado' })
    expect(screen.queryAllByText('Cuentas')).toHaveLength(0)
  })

  it('shows the low-stock badge using the sin-stock danger color and refreshes it when stock changes', async () => {
    let lowStockCount = 3
    const fetchMock = vi.fn((url: string) => {
      const count = url.includes('/shortages/count') ? 0 : lowStockCount
      return Promise.resolve(new Response(JSON.stringify({ count }), { status: 200 }))
    })
    vi.stubGlobal('fetch', fetchMock)

    renderSidebar('/products')

    const badge = await screen.findByText('3')
    expect(badge).toHaveClass('bg-[#f1c9c9]')
    expect(badge).toHaveClass('text-danger')

    lowStockCount = 9
    window.dispatchEvent(new Event('stock-updated'))

    expect(await screen.findByText('9')).toBeInTheDocument()

    vi.unstubAllGlobals()
  })

  it('shows the shortage badge and refreshes it when shortages change', async () => {
    let shortageCount = 2
    const fetchMock = vi.fn((url: string) => {
      const count = url.includes('/shortages/count') ? shortageCount : 0
      return Promise.resolve(new Response(JSON.stringify({ count }), { status: 200 }))
    })
    vi.stubGlobal('fetch', fetchMock)

    renderSidebar('/products')

    const badge = await screen.findByText('2')
    expect(badge).toHaveClass('bg-warning/20')
    expect(badge).toHaveClass('text-warning')

    shortageCount = 5
    window.dispatchEvent(new Event('shortages-updated'))

    expect(await screen.findByText('5')).toBeInTheDocument()

    vi.unstubAllGlobals()
  })
})
