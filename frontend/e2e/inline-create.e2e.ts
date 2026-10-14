import { expect, test } from '@playwright/test'
import { login } from './support'

test.beforeEach(async ({ page }) => {
  await login(page, 'gerenta')
  await page.goto('/products')
  await page.getByRole('link', { name: 'Nuevo Producto' }).click()
})

test('crear una unidad desde el alta de producto la deja elegida', async ({ page }) => {
  const form = page.getByRole('dialog', { name: 'Nuevo producto' })
  await form.getByRole('button', { name: 'Unidad' }).click()
  await page.getByRole('option', { name: '+ Crear unidad nueva…' }).click()

  const dialog = page.getByRole('dialog', { name: 'Nueva unidad' })
  await dialog.getByLabel('Nombre').fill('Docena e2e')
  await dialog.getByLabel('Abreviatura').fill('dz')
  await dialog.getByLabel('Admite fracciones').check()
  await dialog.getByLabel('Abreviatura').press('Enter')

  await expect(dialog).toBeHidden()
  await expect(form.getByRole('button', { name: 'Unidad' })).toContainText('Docena e2e (dz)')
  await expect(form).not.toContainText('Elegí una unidad.')
})

test('crear una unidad repetida muestra el error dentro de la ventana', async ({ page }) => {
  const form = page.getByRole('dialog', { name: 'Nuevo producto' })
  await form.getByRole('button', { name: 'Unidad' }).click()
  await page.getByRole('option', { name: '+ Crear unidad nueva…' }).click()

  const dialog = page.getByRole('dialog', { name: 'Nueva unidad' })
  await dialog.getByLabel('Nombre').fill('Unidad')
  await dialog.getByLabel('Abreviatura').fill('u')
  await dialog.getByRole('button', { name: 'Crear' }).click()

  await expect(dialog.getByRole('alert')).toContainText('La unidad ya existe')
  await dialog.getByRole('button', { name: 'Cancelar' }).click()
  await expect(dialog).toBeHidden()
})

test('crear una categoría desde el alta de producto la deja elegida', async ({ page }) => {
  const form = page.getByRole('dialog', { name: 'Nuevo producto' })
  await form.getByRole('button', { name: 'Categoría' }).click()
  await page.getByRole('option', { name: '+ Crear categoría nueva…' }).click()

  const dialog = page.getByRole('dialog', { name: 'Nueva categoría' })
  await dialog.getByLabel('Nombre').fill('Categoría e2e')
  await dialog.getByRole('button', { name: 'Crear' }).click()

  await expect(dialog).toBeHidden()
  await expect(form.getByRole('button', { name: 'Categoría' })).toContainText('Categoría e2e')
})
