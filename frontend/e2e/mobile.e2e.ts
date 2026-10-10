import { expect, test } from '@playwright/test'
import { expectNoHorizontalScroll, login } from './support'

const LARGEST_FONT_STEP = '5'
const LARGEST_FONT_SIZE = '20px'

test.use({ viewport: { width: 360, height: 740 }, hasTouch: true, isMobile: true })

test.beforeEach(async ({ page }) => {
  await page.addInitScript((step) => {
    window.localStorage.setItem('font_size', step)
  }, LARGEST_FONT_STEP)
})

test('el inicio de sesión entra en un celular con letra Enorme', async ({ page }) => {
  await page.goto('/login')
  await expect(page.getByRole('button', { name: 'Iniciar Sesión' })).toBeVisible()
  await expect(page.locator('html')).toHaveCSS('font-size', LARGEST_FONT_SIZE)
  await expectNoHorizontalScroll(page)
  await expect(page.getByLabel('Usuario')).toBeInViewport()
  await expect(page.getByLabel('Contraseña')).toBeInViewport()
})

for (const screen of [
  { path: '/products', heading: 'Productos', item: 'Cuaderno rayado' },
  { path: '/clientes', heading: 'Clientes', item: 'Marta Fiado' },
  { path: '/inventario', heading: 'Inventario', item: 'Cuaderno rayado' },
]) {
  test(`la lista de ${screen.heading} no se corre de costado en un celular con letra Enorme`, async ({ page }) => {
    await login(page, 'lectora')
    await page.goto(screen.path)
    await expect(page.getByRole('heading', { name: screen.heading, level: 1 })).toBeVisible()
    await expect(page.getByRole('main')).toContainText(screen.item)
    await expect(page.locator('html')).toHaveCSS('font-size', LARGEST_FONT_SIZE)
    await expectNoHorizontalScroll(page)
  })
}

test('el menú se abre en un celular y lleva a otra pantalla', async ({ page }) => {
  await login(page, 'lectora')
  await page.goto('/products')
  await page.getByRole('button', { name: 'Abrir menú' }).click()
  await page.getByRole('navigation').getByRole('link', { name: 'Clientes' }).click()
  await expect(page.getByRole('heading', { name: 'Clientes', level: 1 })).toBeVisible()
  await expectNoHorizontalScroll(page)
})
