import { expect, test, type Page } from '@playwright/test'
import { login, postAsCurrentUser, searchInventory, successToast } from './support'

async function idByName(page: Page, path: string, name: string): Promise<number> {
  return page.evaluate(
    async ({ path, name }) => {
      const response = await fetch(path, { headers: { Accept: 'application/json' } })
      const items = (await response.json()) as { id: number; name: string }[]
      const found = items.find((item) => item.name === name)
      if (found === undefined) throw new Error(`No existe ${name} en ${path}`)
      return found.id
    },
    { path, name },
  )
}

async function openNewProductForm(page: Page) {
  await page.goto('/products')
  await page.getByRole('link', { name: 'Nuevo Producto' }).click()
  return page.getByRole('dialog', { name: 'Nuevo producto' })
}

async function fillStep1(page: Page, name: string, unit: string) {
  const form = page.getByRole('dialog', { name: 'Nuevo producto' })
  await form.getByRole('textbox', { name: 'Nombre *' }).fill(name)
  await form.getByRole('button', { name: 'Categoría' }).click()
  await page.getByRole('option', { name: 'Escolares' }).click()
  await form.getByRole('button', { name: 'Unidad' }).click()
  await page.getByRole('option', { name: unit }).click()
  return form
}

test.beforeEach(async ({ page }) => {
  await login(page, 'gerenta')
})

test('alta con presentación cargando el stock en rollos y el mínimo en rollos', async ({ page }) => {
  const name = 'Cinta raso presentacion alta'
  const form = await openNewProductForm(page)
  await fillStep1(page, name, 'Metro (m)')
  await expect(form).toContainText('La unidad es cómo se vende')
  await form.getByRole('checkbox', { name: /Se compra o se cuenta por presentación/ }).check()
  await form.getByRole('textbox', { name: 'Nombre en singular' }).fill('rollo')
  await form.getByRole('textbox', { name: 'Cuánto trae cada rollo (en m)' }).fill('50')
  await form.getByRole('button', { name: 'Continuar' }).click()

  await expect(form.getByRole('radio', { name: 'Rollos' })).toBeChecked()
  const stock = form.getByRole('spinbutton', { name: 'Stock actual' })
  const minimum = form.getByRole('spinbutton', { name: 'Stock mínimo' })
  await stock.fill('1.5')
  await expect(form).toContainText('Los rollos se cargan en números enteros.')
  await expect(form.getByRole('button', { name: 'Continuar' })).toBeDisabled()
  await stock.fill('3')
  await minimum.fill('1')
  const stockBox = await stock.boundingBox()
  const minimumBox = await minimum.boundingBox()
  expect(stockBox?.height).toBe(minimumBox?.height)
  await form.getByRole('button', { name: 'Continuar' }).click()

  await expect(form).toContainText('Rollo de 50 m')
  await expect(form).toContainText('3 rollos')
  await form.getByRole('button', { name: 'Confirmar' }).click()
  await expect(successToast(page, 'Producto creado correctamente.')).toBeVisible()

  await page.goto('/inventario')
  await searchInventory(page, name)
  await expect(page.getByTestId('stock-amount')).toHaveText('3 rollos')
})

test('avisa con amabilidad cuando la presentación se llama igual que la unidad', async ({ page }) => {
  await postAsCurrentUser(page, '/units', { name: 'Rollo', abbreviation: 'ro', allows_fraction: false })
  await openNewProductForm(page)
  const form = await fillStep1(page, 'Cinta unidad rollo', 'Rollo (ro)')
  await form.getByRole('checkbox', { name: /Se compra o se cuenta por presentación/ }).check()
  await form.getByRole('textbox', { name: 'Nombre en singular' }).fill('rollo')
  await expect(form.getByRole('status')).toContainText('probá con la unidad Metro (m)')
})

test('desde Confirmar se puede volver con Atrás y, si el servidor rechaza, ir al campo con el problema', async ({
  page,
}) => {
  const name = 'Cinta nombre repetido tardio'
  const form = await openNewProductForm(page)
  await fillStep1(page, name, 'Unidad (u)')
  await form.getByRole('button', { name: 'Continuar' }).click()
  await form.getByRole('button', { name: 'Continuar' }).click()

  await form.getByRole('button', { name: 'Atrás' }).click()
  await expect(form.getByRole('button', { name: 'Producto único' })).toBeVisible()
  await form.getByRole('button', { name: 'Continuar' }).click()

  const categoryId = await idByName(page, '/categories', 'Escolares')
  const unitId = await idByName(page, '/units', 'Unidad')
  const created = await postAsCurrentUser(page, '/products', { name, category_id: categoryId, unit_id: unitId })
  expect(created.status).toBe(201)

  await form.getByRole('button', { name: 'Confirmar' }).click()
  await expect(form.getByRole('alert')).toContainText('Ya existe un producto con ese nombre.')
  await form.getByRole('button', { name: 'Corregir el nombre' }).click()
  await expect(form.getByRole('textbox', { name: 'Nombre *' })).toBeFocused()
  await expect(form.getByRole('button', { name: 'Continuar' })).toBeVisible()
})
