import { expect, test } from '@playwright/test'
import { errorToast, login, postAsCurrentUser, searchInventory, successToast, variantIdOf } from './support'

test.beforeEach(async ({ page }) => {
  await login(page, 'gerenta')
  await page.goto('/inventario')
})

test('ajustar stock sumando una diferencia', async ({ page }) => {
  await searchInventory(page, 'Cuaderno rayado')
  await page.getByRole('textbox', { name: 'Cuánto sumar o restar a Cuaderno rayado' }).fill('5')
  await expect(page.getByText('Stock: 10 → 15')).toBeVisible()
  await page.getByRole('button', { name: 'Actualizar' }).click()
  const dialog = page.getByRole('alertdialog', { name: 'Ajustar stock' })
  await expect(dialog).toContainText('10 → 15 (diferencia +5)')
  await dialog.getByRole('button', { name: 'Ajustar' }).click()
  await expect(successToast(page, 'Stock ajustado: 10 → 15.')).toBeVisible()

  await page.reload()
  await searchInventory(page, 'Cuaderno rayado')
  await expect(page.getByRole('main')).toContainText('15 u')
})

test('no deja que el stock quede negativo', async ({ page }) => {
  await searchInventory(page, 'Regla de 30 cm')
  await page.getByRole('textbox', { name: 'Cuánto sumar o restar a Regla de 30 cm' }).fill('-6')
  await expect(page.getByRole('main').getByRole('alert')).toContainText('4')
  await expect(page.getByRole('button', { name: 'Actualizar' })).toBeDisabled()

  const variantId = await variantIdOf(page, 'Regla de 30 cm')
  const response = await postAsCurrentUser(page, `/variants/${variantId}/stock/adjustments`, { delta: '-6' })
  expect(response.status).toBe(422)
  expect(String(response.detail)).toContain('No podés descontar más de lo que hay (4)')

  await page.reload()
  await searchInventory(page, 'Regla de 30 cm')
  await expect(page.getByRole('main')).toContainText('4 u')
})

test('ajustar stock con decimales en una unidad que los admite', async ({ page }) => {
  await searchInventory(page, 'Cinta de raso')
  await page.getByRole('textbox', { name: 'Cuánto sumar o restar a Cinta de raso' }).fill('-2,5')
  await expect(page.getByText(/Stock: 10 → 7[,.]5/)).toBeVisible()
  await page.getByRole('button', { name: 'Actualizar' }).click()
  await page.getByRole('alertdialog', { name: 'Ajustar stock' }).getByRole('button', { name: 'Ajustar' }).click()
  await expect(successToast(page, /Stock ajustado: 10 → 7[,.]5\./)).toBeVisible()

  await page.reload()
  await searchInventory(page, 'Cinta de raso')
  await expect(page.getByRole('main')).toContainText(/7[,.]5 m/)
})

test('un ajuste en unidades enteras rechaza decimales', async ({ page }) => {
  await searchInventory(page, 'Lapiz negro')
  const field = page.getByRole('textbox', { name: 'Cuánto sumar o restar a Lapiz negro' })
  await field.fill('1,5')
  await expect(page.getByRole('main').getByRole('alert')).toHaveText('Solo se permiten números enteros.')
  await expect(field).toHaveValue('15')

  const variantId = await variantIdOf(page, 'Lapiz negro')
  const response = await postAsCurrentUser(page, `/variants/${variantId}/stock/adjustments`, { delta: '1.5' })
  expect(response.status).toBe(422)
})

test('doble clic en Ajustar registra el ajuste una sola vez', async ({ page }) => {
  await searchInventory(page, 'Goma de borrar')
  await page.getByRole('textbox', { name: 'Cuánto sumar o restar a Goma de borrar' }).fill('2')
  await page.getByRole('button', { name: 'Actualizar' }).click()
  await page.getByRole('alertdialog', { name: 'Ajustar stock' }).getByRole('button', { name: 'Ajustar' }).dblclick()
  await expect(successToast(page, 'Stock ajustado: 3 → 5.')).toBeVisible()
  await expect(errorToast(page, /.+/)).toHaveCount(0)

  await page.reload()
  await searchInventory(page, 'Goma de borrar')
  await expect(page.getByRole('main')).toContainText('5 u')
  await page.getByRole('button', { name: 'Ver historial de stock de Goma de borrar' }).click()
  const history = page.getByRole('dialog', { name: 'Historial de stock de Goma de borrar' })
  await expect(history.getByRole('listitem')).toHaveCount(2)
  await expect(history.getByRole('listitem').first()).toContainText('3 → 5')
})

test('el campo de stock en metros no muestra el signo de pesos', async ({ page }) => {
  await searchInventory(page, 'Cinta de raso')
  const field = page.getByRole('textbox', { name: 'Cuánto sumar o restar a Cinta de raso' })
  await expect(field.locator('xpath=..')).not.toContainText('$')
})

test('avanzar el estado de un faltante', async ({ page }) => {
  await page.goto('/inventario/faltantes')
  await page.getByRole('button', { name: 'Marcar como Pedido' }).click()
  const dialog = page.getByRole('alertdialog', { name: 'Avanzar faltante' })
  await expect(dialog).toContainText('"Compas metalico" va a pasar de Faltante a Pedido.')
  await dialog.getByRole('button', { name: 'Confirmar' }).click()
  await expect(successToast(page, 'Faltante actualizado.')).toBeVisible()
  await expect(page.getByRole('main')).toContainText('Pedido')

  await page.getByRole('button', { name: 'Marcar como Recibido' }).click()
  await page.getByRole('alertdialog', { name: 'Avanzar faltante' }).getByRole('button', { name: 'Confirmar' }).click()
  await expect(page.getByText('No hay faltantes pendientes')).toBeVisible()
})

test('marcar un producto como faltante desde Productos', async ({ page }) => {
  await page.goto('/products')
  await page.getByRole('textbox', { name: 'Buscar productos', exact: true }).fill('Tijera escolar')
  await expect(page.getByRole('button', { name: /^Acciones para / })).toHaveCount(1)
  await page.getByRole('button', { name: 'Acciones para Tijera escolar' }).click()
  const markButton = page.getByRole('button', { name: /^Marcar como faltante/ })
  await expect(markButton).toBeEnabled()
  await markButton.click()
  await page.getByRole('alertdialog', { name: 'Marcar como faltante' }).getByRole('button', { name: 'Aceptar' }).click()
  await expect(successToast(page, 'La variante ahora figura como faltante.')).toBeVisible()
  await page.goto('/inventario')
  await page.goto('/inventario/faltantes')
  await expect(page.getByRole('main')).toContainText('Tijera escolar')
})

test('los faltantes se ven también como tabla con filas en barras separadas', async ({ page }) => {
  await page.goto('/inventario/faltantes')
  await page.getByRole('button', { name: 'Ver como tabla' }).click()
  const row = page.getByRole('row').filter({ hasText: 'Tijera escolar' })
  await expect(row).toBeVisible()
  await expect(row.getByRole('button', { name: 'Marcar como Pedido' })).toBeVisible()
  const cell = row.locator('td').first()
  await expect(cell).toHaveCSS('background-color', 'rgb(255, 255, 255)')
  const radius = await cell.evaluate((el) => getComputedStyle(el).borderTopLeftRadius)
  expect(parseFloat(radius)).toBeGreaterThan(0)
})
