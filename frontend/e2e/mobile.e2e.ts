import { expect, test, type Locator, type Page } from '@playwright/test'
import { expectNoHorizontalScroll, FIRST_BUSINESS, login } from './support'

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

const LONG_PRODUCT_NAME = 'PERCAL COLOR: ROJO_ORO_CELESTE_BLANCO_ROSA_VERDE_AZUL (Blanco y oro hay cantidad)'

async function expectInsideViewportWidth(page: Page, locator: Locator) {
  const box = await locator.boundingBox()
  const viewportWidth = page.viewportSize()?.width ?? 0
  expect(box).not.toBeNull()
  expect(box!.x).toBeGreaterThanOrEqual(0)
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewportWidth)
}

for (const screen of [
  { path: '/precios', heading: 'Precios', value: /4\.200/, search: 'Buscar productos' },
  { path: '/products', heading: 'Productos', value: /4\.200/, search: 'Buscar productos' },
  { path: '/inventario', heading: 'Inventario', value: /15 m/, search: 'Buscar producto' },
]) {
  test(`un nombre de producto muy largo no corre de costado ${screen.heading} en un celular con letra Enorme`, async ({ page }) => {
    await login(page, 'lectora')
    await page.goto(screen.path)
    await expect(page.getByRole('heading', { name: screen.heading, level: 1 })).toBeVisible()
    await page.getByRole('textbox', { name: screen.search, exact: true }).fill('ROJO_ORO')
    const name = page.getByRole('main').getByText(LONG_PRODUCT_NAME).first()
    await expect(name).toBeVisible()
    await expect(page.locator('html')).toHaveCSS('font-size', LARGEST_FONT_SIZE)
    await expectNoHorizontalScroll(page)
    await expectInsideViewportWidth(page, name)
    const value = page.getByRole('main').getByText(screen.value).first()
    await expect(value).toBeVisible()
    await expectInsideViewportWidth(page, value)
  })
}

test('en la tabla de Precios un nombre muy largo no pisa la columna Categoría', async ({ page }) => {
  await login(page, 'lectora')
  await page.goto('/precios')
  await expect(page.locator('html')).toHaveCSS('font-size', LARGEST_FONT_SIZE)
  await page.getByRole('textbox', { name: 'Buscar productos', exact: true }).fill('can')
  await page.getByRole('button', { name: 'Ver como tabla' }).click()
  const row = page.getByTestId('price-row').filter({ hasText: LONG_PRODUCT_NAME })
  await expect(row).toBeVisible()
  const nameCell = row.locator('td').nth(1)
  const categoryCell = row.locator('td').nth(2)
  const overflow = await nameCell.evaluate((cell) => cell.scrollWidth - cell.clientWidth)
  expect(overflow).toBeLessThanOrEqual(0)
  const nameBox = await nameCell.boundingBox()
  const categoryBox = await categoryCell.boundingBox()
  expect(nameBox!.x + nameBox!.width).toBeLessThanOrEqual(categoryBox!.x)
  await expectNoHorizontalScroll(page)
})

test('el menú sigue a mano al final de una lista larga en un celular', async ({ page }) => {
  await login(page, 'lectora')
  await page.goto('/products')
  const heading = page.getByRole('heading', { name: 'Productos', level: 1 })
  await expect(heading).toBeVisible()
  await expect(page.getByRole('main')).toContainText('Tijera escolar')
  const headerBox = await page.getByRole('banner').boundingBox()
  const headingBox = await heading.boundingBox()
  expect(headingBox!.y).toBeGreaterThanOrEqual(headerBox!.y + headerBox!.height)

  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0)
  const menuButton = page.getByRole('button', { name: 'Abrir menú' })
  await expect(menuButton).toBeInViewport()
  await menuButton.click()
  await page.getByRole('navigation').getByRole('link', { name: 'Clientes' }).click()
  await expect(page.getByRole('heading', { name: 'Clientes', level: 1 })).toBeVisible()
})

test.describe('en computadora', () => {
  test.use({ viewport: { width: 1280, height: 600 }, hasTouch: false, isMobile: false })

  test('el menú lateral queda fijo al bajar por una lista larga', async ({ page }) => {
    await login(page, 'lectora')
    await page.goto('/products')
    await expect(page.getByRole('main')).toContainText('Cuaderno rayado')
    await page.evaluate(() => {
      window.scrollTo(0, document.documentElement.scrollHeight)
      for (const element of Array.from(document.querySelectorAll('main *'))) {
        if (element.scrollHeight > element.clientHeight) element.scrollTop = element.scrollHeight
      }
    })
    const navigation = page.getByRole('navigation')
    const navigationBox = await navigation.boundingBox()
    expect(navigationBox!.y).toBeGreaterThanOrEqual(0)
    expect(navigationBox!.y + navigationBox!.height).toBeLessThanOrEqual(600)
    await navigation.getByRole('link', { name: 'Clientes' }).click()
    await expect(page.getByRole('heading', { name: 'Clientes', level: 1 })).toBeVisible()
  })
})

async function saveFontStep(page: Page, step: number) {
  const status = await page.evaluate(async (fontSize) => {
    const csrf = document.cookie
      .split('; ')
      .find((cookie) => cookie.startsWith('csrf_token='))
      ?.slice('csrf_token='.length)
    const response = await fetch('/auth/me/preferences', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': decodeURIComponent(csrf ?? '') },
      body: JSON.stringify({ font_size: fontSize }),
    })
    return response.status
  }, step)
  expect(status).toBe(200)
}

test.describe('barra superior en computadora', () => {
  test.use({ viewport: { width: 1280, height: 720 }, hasTouch: false, isMobile: false })

  for (const fontStep of [1, 2, 3, 4, 5]) {
    test(`el reloj y el nombre del negocio no se superponen con letra ${fontStep}`, async ({ page }) => {
      await login(page, 'lectora')
      await saveFontStep(page, fontStep)
      try {
        await page.goto('/products')
        if (String(fontStep) === LARGEST_FONT_STEP) {
          await expect(page.locator('html')).toHaveCSS('font-size', LARGEST_FONT_SIZE)
        }
        const banner = page.getByRole('banner')
        const businessName = banner.getByText(FIRST_BUSINESS, { exact: true })
        const clock = banner.getByText(/ del \d{4}$/)
        await expect(businessName).toBeVisible()
        await expect(clock).toBeVisible()
        const nameBox = await businessName.boundingBox()
        const clockBox = await clock.locator('xpath=..').boundingBox()
        const accountBox = await banner.getByRole('button', { name: /^Menú de la cuenta de / }).boundingBox()
        expect(clockBox!.x + clockBox!.width).toBeLessThanOrEqual(nameBox!.x)
        expect(nameBox!.x + nameBox!.width).toBeLessThanOrEqual(accountBox!.x)
        await expectNoHorizontalScroll(page)
      } finally {
        await saveFontStep(page, Number(LARGEST_FONT_STEP))
      }
    })
  }
})
