import { expect, test, type Page } from '@playwright/test'
import {
  expectNoHorizontalScroll,
  login,
  postAsCurrentUser,
  searchInventory,
  successToast,
  variantIdOf,
} from './support'

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

async function productIdOf(page: Page, name: string): Promise<number> {
  return page.evaluate(async (name) => {
    const response = await fetch(`/products?search=${encodeURIComponent(name)}`, {
      headers: { Accept: 'application/json' },
    })
    const body = (await response.json()) as { items: { id: number; name: string }[] }
    const product = body.items.find((item) => item.name === name)
    if (product === undefined) throw new Error(`No existe el producto ${name}`)
    return product.id
  }, name)
}

async function saveFontStep(page: Page, step: number): Promise<number> {
  return page.evaluate(async (fontSize) => {
    const current = (await (await fetch('/auth/me', { headers: { Accept: 'application/json' } })).json()) as {
      font_size: number
    }
    const csrf = document.cookie
      .split('; ')
      .find((cookie) => cookie.startsWith('csrf_token='))
      ?.slice('csrf_token='.length)
    const response = await fetch('/auth/me/preferences', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': decodeURIComponent(csrf ?? '') },
      body: JSON.stringify({ font_size: fontSize }),
    })
    if (response.status !== 200) throw new Error('No se pudo cambiar el tamaño de letra')
    return current.font_size
  }, step)
}

async function adjustIn(page: Page, productName: string, mode: string, amount: string, preview: string) {
  const editor = page.getByTestId('stock-editor')
  await editor.getByRole('radio', { name: mode }).click()
  await page.getByRole('textbox', { name: `Cuánto sumar o restar a ${productName}` }).fill(amount)
  await expect(editor.getByTestId('delta-preview')).toContainText(preview)
  await editor.getByRole('button', { name: 'Actualizar' }).click()
  await page.getByRole('alertdialog', { name: 'Ajustar stock' }).getByRole('button', { name: 'Ajustar' }).click()
}

test.describe('en computadora', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, 'gerenta')
  })

  test('crear un producto con presentación, ajustar en rollos y en metros y verlo en Inventario', async ({ page }) => {
    const name = 'Cinta gros presentacion'
    await page.goto('/products')
    await page.getByRole('link', { name: 'Nuevo Producto' }).click()
    const form = page.getByRole('dialog', { name: 'Nuevo producto' })
    await form.getByRole('textbox', { name: 'Nombre *' }).fill(name)
    await form.getByRole('button', { name: 'Categoría' }).click()
    await page.getByRole('option', { name: 'Escolares' }).click()
    await form.getByRole('button', { name: 'Unidad' }).click()
    await page.getByRole('option', { name: 'Metro (m)' }).click()
    await form.getByRole('checkbox', { name: /Se compra o se cuenta por presentación/ }).check()
    await form.getByRole('textbox', { name: 'Nombre en singular' }).fill('rollo')
    await expect(form.getByRole('textbox', { name: 'Nombre en plural' })).toHaveValue('rollos')
    await form.getByRole('textbox', { name: 'Cuánto trae cada rollo (en m)' }).fill('50')
    await form.getByRole('button', { name: 'Continuar' }).click()
    await form.getByRole('button', { name: 'Continuar' }).click()
    await expect(form).toContainText('rollo de 50 m')
    await form.getByRole('button', { name: 'Confirmar' }).click()
    await expect(successToast(page, 'Producto creado correctamente.')).toBeVisible()

    await page.goto('/inventario')
    await searchInventory(page, name)
    await adjustIn(page, name, 'Rollos', '+2', 'Stock: 0 rollos → 2 rollos')
    await expect(successToast(page, 'Stock ajustado: 0 rollos → 2 rollos.')).toBeVisible()
    await adjustIn(page, name, 'Sueltos (m)', '-12', 'Stock: 2 rollos → 1 rollo y 38 m')
    await expect(successToast(page, 'Stock ajustado: 2 rollos → 1 rollo y 38 m.')).toBeVisible()

    await page.reload()
    await searchInventory(page, name)
    await expect(page.getByRole('main')).toContainText('1 rollo y 38 m')

    const productId = await productIdOf(page, name)
    await page.goto(`/products/${productId}?edit=1`)
    await page.getByRole('textbox', { name: 'Cuánto trae cada rollo (en m)' }).fill('100')
    await page.getByRole('button', { name: 'Guardar cambios' }).click()
    const confirm = page.getByRole('alertdialog', { name: 'Guardar cambios' })
    await expect(confirm.getByTestId('presentation-preview')).toContainText('hoy 1 rollo y 38 m → se va a ver 88 m')
    await confirm.getByRole('button', { name: 'Guardar' }).click()
    await expect(successToast(page, 'Producto actualizado.')).toBeVisible()

    await page.goto('/inventario')
    await searchInventory(page, name)
    await expect(page.getByRole('main')).toContainText('88 m')
  })
})

test.describe('en un celular con letra Enorme', () => {
  test.use({ viewport: { width: 360, height: 740 }, hasTouch: true, isMobile: true })

  test.beforeEach(async ({ page }) => {
    await login(page, 'gerenta')
  })

  test('el stock se ve en rollos y metros y se ajusta en rollos', async ({ page }) => {
    const name = 'Cinta bebe presentacion'
    const categoryId = await idByName(page, '/categories', 'Escolares')
    const unitId = await idByName(page, '/units', 'Metro')
    const created = await postAsCurrentUser(page, '/products', {
      name,
      category_id: categoryId,
      unit_id: unitId,
      presentation: { name: 'rollo', plural_name: 'rollos', quantity: '50' },
    })
    expect(created.status).toBe(201)
    const variantId = await variantIdOf(page, name)
    const adjusted = await postAsCurrentUser(page, `/variants/${variantId}/stock/adjustments`, { delta: '138' })
    expect(adjusted.status).toBe(201)

    const previousFontStep = await saveFontStep(page, 5)
    try {
      await page.goto('/inventario')
      await searchInventory(page, name)
      await expect(page.locator('html')).toHaveCSS('font-size', '20px')
      await expect(page.getByTestId('stock-amount')).toHaveText('2 rollos y 38 m')
      await expectNoHorizontalScroll(page)

      await adjustIn(page, name, 'Rollos', '1', 'Stock: 2 rollos y 38 m → 3 rollos y 38 m')
      await expect(page.getByTestId('stock-amount')).toHaveText('3 rollos y 38 m')
      await expectNoHorizontalScroll(page)
    } finally {
      await saveFontStep(page, previousFontStep)
    }
  })
})
