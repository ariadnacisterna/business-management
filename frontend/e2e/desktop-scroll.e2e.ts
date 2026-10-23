import { expect, test } from '@playwright/test'
import { login } from './support'

const SCREENS = [
  { width: 1280, height: 720 },
  { width: 1920, height: 1080 },
]

for (const screen of SCREENS) {
  test(`en computadora de ${screen.width} px una página corta no tiene scroll vertical`, async ({ page }) => {
    await page.setViewportSize(screen)
    await login(page, 'empleada')
    await page.goto('/ventas')
    await expect(page.getByRole('textbox', { name: 'Buscar producto para vender' })).toBeVisible()

    const overflow = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight)
    expect(overflow).toBeLessThanOrEqual(0)
  })
}
