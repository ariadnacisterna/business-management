import { expect, test } from '@playwright/test'
import { login } from './support'

const SCREENS = [
  { width: 1280, height: 960 },
  { width: 1920, height: 1080 },
]

for (const screen of SCREENS) {
  test(`en computadora de ${screen.width} px la lista de Productos baja hasta el final con la rueda`, async ({ page }) => {
    await page.setViewportSize(screen)
    await login(page, 'duena')
    await page.goto('/products')
    await expect(page.getByRole('heading', { name: 'Productos' })).toBeVisible()

    await page.mouse.move(screen.width / 2, screen.height / 2)
    await page.mouse.wheel(0, 100000)
    await expect
      .poll(() => page.evaluate(() => Math.abs(window.scrollY + window.innerHeight - document.documentElement.scrollHeight)))
      .toBeLessThanOrEqual(2)
  })

  test(`en computadora de ${screen.width} px una página corta no tiene scroll vertical`, async ({ page }) => {
    await page.setViewportSize(screen)
    await login(page, 'empleada')
    await page.goto('/ventas')
    await expect(page.getByRole('textbox', { name: 'Buscar producto para vender' })).toBeVisible()

    const overflow = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight)
    expect(overflow).toBeLessThanOrEqual(0)
  })
}
