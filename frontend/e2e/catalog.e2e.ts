import { expect, test } from '@playwright/test'
import { login, searchInventory, successToast } from './support'

test.beforeEach(async ({ page }) => {
  await login(page, 'gerenta')
})

test('alta de producto con una variante, precio inicial y stock inicial', async ({ page }) => {
  await page.goto('/products')
  await page.getByRole('link', { name: 'Nuevo Producto' }).click()
  const form = page.getByRole('dialog', { name: 'Nuevo producto' })

  await form.getByRole('textbox', { name: 'Nombre *' }).fill('Cartuchera de tela')
  await form.getByRole('button', { name: 'Categoría' }).click()
  await page.getByRole('option', { name: 'Escolares' }).click()
  await form.getByRole('button', { name: 'Unidad' }).click()
  await page.getByRole('option', { name: 'Unidad (u)' }).click()
  await form.getByRole('button', { name: 'Continuar' }).click()

  await form.getByRole('button', { name: 'Producto con variantes' }).click()
  await form.getByRole('textbox', { name: 'Precio para todas las variantes' }).fill('1200')
  await form.getByRole('textbox', { name: 'Nombre de la variante' }).fill('Roja')
  await form.getByRole('spinbutton', { name: 'Stock actual de la variante 1' }).fill('7')
  await form.getByRole('button', { name: 'Continuar' }).click()

  await expect(form).toContainText('Cartuchera de tela')
  await expect(form).toContainText('Roja')
  await form.getByRole('button', { name: 'Confirmar' }).click()
  await expect(successToast(page, 'Producto creado correctamente.')).toBeVisible()

  await page.goto('/inventario')
  await searchInventory(page, 'Cartuchera de tela')
  const inventory = page.getByRole('main')
  await expect(inventory).toContainText('7 u')
  await expect(inventory).toContainText('Roja')

  await page.goto('/precios')
  await page.getByRole('textbox', { name: 'Buscar productos' }).fill('Cartuchera de tela')
  await expect(page.getByRole('textbox', { name: /^Cuánto sumar o restar a / })).toHaveCount(1)
  await expect(page.getByRole('main')).toContainText(/\$\s?1\.200/)
})

test('cambiar un precio por diferencia', async ({ page }) => {
  await page.goto('/precios')
  await page.getByRole('textbox', { name: 'Buscar productos' }).fill('Lapiz negro')
  const field = page.getByRole('textbox', { name: 'Cuánto sumar o restar a Lapiz negro Estándar' })
  await expect(page.getByRole('textbox', { name: /^Cuánto sumar o restar a / })).toHaveCount(1)
  await field.fill('150')
  await page.getByRole('button', { name: 'Actualizar' }).click()
  const dialog = page.getByRole('alertdialog', { name: 'Confirmar cambio de precio' })
  await expect(dialog).toContainText(/500.*650/)
  await dialog.getByRole('button', { name: 'Confirmar' }).click()
  await expect(successToast(page, /Precio actualizado: \$\s?500,00 → \$\s?650,00\./)).toBeVisible()

  await page.reload()
  await page.getByRole('textbox', { name: 'Buscar productos' }).fill('Lapiz negro')
  await expect(page.getByRole('textbox', { name: /^Cuánto sumar o restar a / })).toHaveCount(1)
  await expect(page.getByRole('main')).toContainText(/\$\s?650/)
})

test('no deja que un precio quede en cero', async ({ page }) => {
  await page.goto('/precios')
  await page.getByRole('textbox', { name: 'Buscar productos' }).fill('Boligrafo azul')
  await expect(page.getByRole('textbox', { name: /^Cuánto sumar o restar a / })).toHaveCount(1)
  await page.getByRole('textbox', { name: 'Cuánto sumar o restar a Boligrafo azul Estándar' }).fill('-450')
  await expect(page.getByRole('main').getByRole('alert')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Actualizar' })).toBeDisabled()
})
