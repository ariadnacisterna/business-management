import { expect, test } from '@playwright/test'
import { login } from './support'

const SCREENS = [
  { width: 1280, height: 960 },
  { width: 1920, height: 1080 },
]

const LARGEST_FONT_STEP = '5'
const LARGEST_FONT_SIZE = '20px'

for (const screen of SCREENS) {
  test(`en computadora de ${screen.width} px la lista de Productos baja hasta el final con la rueda y la página no tiene scroll propio`, async ({ page }) => {
    await page.setViewportSize(screen)
    await login(page, 'duena')
    await page.goto('/products')
    await expect(page.getByRole('heading', { name: 'Productos' })).toBeVisible()
    await expect(page.getByRole('button', { name: /^Acciones para / }).first()).toBeVisible()

    const pageOverflow = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight)
    expect(pageOverflow).toBeLessThanOrEqual(0)

    await page.mouse.move(screen.width / 2, screen.height / 2)
    await page.mouse.wheel(0, 100000)
    await expect
      .poll(() =>
        page.evaluate(() =>
          Array.from(document.querySelectorAll<HTMLElement>('*')).some((element) => {
            const { overflowY } = getComputedStyle(element)
            const scrollable = overflowY === 'auto' || overflowY === 'scroll'
            return (
              scrollable &&
              element.scrollHeight - element.clientHeight > 2 &&
              Math.abs(element.scrollTop + element.clientHeight - element.scrollHeight) <= 2
            )
          }),
        ),
      )
      .toBe(true)
  })

  test(`en computadora de ${screen.width} px una página corta no tiene scroll vertical`, async ({ page }) => {
    await page.setViewportSize(screen)
    await login(page, 'empleada')
    await page.goto('/ventas')
    await expect(page.getByRole('textbox', { name: 'Buscar producto para vender' })).toBeVisible()

    const overflow = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight)
    expect(overflow).toBeLessThanOrEqual(0)
  })

  test(`en computadora de ${screen.width} px con letra Enorme los botones de forma de pago entran sin cortar el texto`, async ({ page }) => {
    await page.setViewportSize(screen)
    await page.addInitScript((step) => {
      window.localStorage.setItem('font_size', step)
    }, LARGEST_FONT_STEP)
    await login(page, 'empleada')
    await page.goto('/ventas/nueva')
    await expect(page.locator('html')).toHaveCSS('font-size', LARGEST_FONT_SIZE)

    for (const name of ['Efectivo', 'Transferencia', 'Fiado']) {
      const button = page.getByRole('button', { name, exact: true })
      await expect(button).toBeVisible()
      const fits = await button.evaluate((element) => element.scrollWidth <= element.clientWidth)
      expect(fits).toBe(true)
    }
  })
}
