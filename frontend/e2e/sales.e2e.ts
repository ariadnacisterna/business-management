import { expect, test, type Page } from '@playwright/test'
import { expectNoHorizontalScroll, login, postAsCurrentUser, successToast } from './support'

async function addProduct(page: Page, product: string, quantity: string) {
  await page.getByRole('textbox', { name: 'Buscar producto para vender' }).fill(product)
  await page.getByRole('button', { name: `Agregar ${product}` }).click()
  const quantityInput = page.getByRole('textbox', { name: `Cantidad de ${product}` })
  await quantityInput.fill(quantity)
}

async function confirmSale(page: Page) {
  await page.getByRole('button', { name: 'Confirmar venta' }).click()
  await page.getByRole('alertdialog', { name: 'Registrar venta' }).getByRole('button', { name: 'Registrar' }).click()
  await expect(successToast(page, /Venta N° \d+ registrada\./)).toBeVisible()
}

async function openLatestSale(page: Page) {
  await page.getByRole('button', { name: 'Ventas registradas' }).click()
  await page.getByRole('button', { name: /^Ver venta N° / }).first().click()
  return page.getByRole('dialog', { name: /^Venta N° / })
}

test('un Empleado registra una venta en efectivo y baja el stock', async ({ page }) => {
  await login(page, 'empleada')
  await page.goto('/ventas')

  await addProduct(page, 'Sacapuntas doble', '2')
  await expect(page.getByLabel('Total de la venta')).toHaveText('$700,00')
  await confirmSale(page)

  const sale = await openLatestSale(page)
  await expect(sale).toContainText('Sacapuntas doble')
  await expect(sale).toContainText('Efectivo')
  await expect(sale).toContainText('$700,00')
  await sale.getByRole('button', { name: 'Cerrar' }).click()

  await page.getByRole('button', { name: 'Nueva venta' }).click()
  await page.getByRole('textbox', { name: 'Buscar producto para vender' }).fill('Sacapuntas doble')
  await expect(page.getByRole('button', { name: 'Agregar Sacapuntas doble' })).toContainText('Stock: 18 u')
})

test('tocar una tarjeta dos veces suma uno y el descuento baja el total', async ({ page }) => {
  await login(page, 'empleada')
  await page.goto('/ventas')
  await expect(page.getByText('El carrito está vacío')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Agregar Sacapuntas doble' })).toHaveCount(0)

  await page.getByRole('textbox', { name: 'Buscar producto para vender' }).fill('Sacapuntas doble')
  await page.getByRole('button', { name: 'Agregar Sacapuntas doble' }).click()
  await page.getByRole('textbox', { name: 'Buscar producto para vender' }).fill('Sacapuntas doble')
  await page.getByRole('button', { name: 'Agregar Sacapuntas doble' }).click()
  await expect(page.getByRole('textbox', { name: 'Cantidad de Sacapuntas doble' })).toHaveValue('2')
  await page.getByRole('textbox', { name: 'Descuento en pesos' }).fill('100')
  await expect(page.getByLabel('Total de la venta')).toHaveText('$600,00')
  await page.getByRole('button', { name: 'Vaciar carrito' }).click()
  await expect(page.getByText('El carrito está vacío')).toBeVisible()
})

test('con ventas registradas, Ventas muestra los filtros', async ({ page }) => {
  await login(page, 'empleada')
  await page.goto('/ventas')
  await page.getByRole('button', { name: 'Ventas registradas' }).click()
  await expect(page.getByText('Desde', { exact: true })).toBeVisible()
  await expect(page.getByText('No hay ventas registradas', { exact: true })).toHaveCount(0)
})

test('el descuento en porcentaje se calcula sobre el total', async ({ page }) => {
  await login(page, 'empleada')
  await page.goto('/ventas')

  await page.getByRole('textbox', { name: 'Buscar producto para vender' }).fill('Sacapuntas doble')
  await page.getByRole('button', { name: 'Agregar Sacapuntas doble' }).click()
  await page.getByRole('textbox', { name: 'Buscar producto para vender' }).fill('Sacapuntas doble')
  await page.getByRole('button', { name: 'Agregar Sacapuntas doble' }).click()
  await expect(page.getByLabel('Total de la venta')).toHaveText('$700,00')
  await page.getByRole('textbox', { name: 'Descuento en porcentaje' }).fill('10')
  await expect(page.getByRole('textbox', { name: 'Descuento en pesos' })).toHaveValue('70.00')
  await expect(page.getByLabel('Total de la venta')).toHaveText('$630,00')
})

test('una venta en fiado suma al saldo del cliente', async ({ page }) => {
  await login(page, 'empleada')
  await page.goto('/ventas')

  await addProduct(page, 'Marcador fluo', '1')
  await page.getByRole('button', { name: 'Fiado' }).click()
  await page.getByRole('button', { name: 'Cliente' }).click()
  await page.getByRole('option', { name: 'Clara Ventas' }).click()
  await confirmSale(page)

  await page.goto('/clientes')
  await page.getByRole('textbox', { name: 'Buscar clientes' }).fill('Clara Ventas')
  await expect(page.getByRole('textbox', { name: /^Importe para / })).toHaveCount(1)
  await expect(page.getByRole('main')).toContainText('$900,00')
})

test('se vende aunque no alcance el stock y la venta queda marcada', async ({ page }) => {
  await login(page, 'empleada')
  await page.goto('/ventas')

  await addProduct(page, 'Pegamento en barra', '3')
  await expect(page.getByRole('main')).toContainText('Stock insuficiente: hay 1 u')
  await confirmSale(page)

  await expect(page.getByRole('alert').filter({ hasText: 'sin stock suficiente' })).toBeVisible()
  const sale = await openLatestSale(page)
  await expect(sale).toContainText('Sin stock suficiente')
})

test('un Gerente anula una venta y un Empleado no puede', async ({ page }) => {
  await login(page, 'empleada')
  await page.goto('/ventas')
  await addProduct(page, 'Sacapuntas doble', '1')
  await confirmSale(page)
  const employeeView = await openLatestSale(page)
  await expect(employeeView).toContainText('Sacapuntas doble')
  await expect(employeeView.getByRole('button', { name: 'Anular venta' })).toHaveCount(0)
  const saleTitle = await employeeView.getByRole('heading', { level: 2 }).textContent()
  const saleId = Number(saleTitle?.replace(/\D/g, ''))
  const rejected = await postAsCurrentUser(page, `/sales/${saleId}/void`, { reason: 'Intento' })
  expect(rejected.status).toBe(403)

  await page.context().clearCookies()
  await login(page, 'gerenta')
  await page.goto('/ventas')
  const sale = await openLatestSale(page)
  await sale.getByRole('button', { name: 'Anular venta' }).click()
  await sale.getByRole('textbox', { name: /Motivo/ }).fill('El cliente lo devolvió')
  await sale.getByRole('button', { name: 'Confirmar anulación' }).click()

  await expect(successToast(page, 'Venta anulada.')).toBeVisible()
  await expect(sale).toContainText('Motivo: El cliente lo devolvió')
  await expect(sale).toContainText('Gabriela Gerenta')
})

test.describe('en un celular con letra Enorme', () => {
  test.use({ viewport: { width: 360, height: 740 }, hasTouch: true, isMobile: true })

  test('la venta se carga sin correrse de costado', async ({ page }) => {
    await login(page, 'lectora')
    await page.goto('/ventas')
    await expect(page.locator('html')).toHaveCSS('font-size', '20px')

    await addProduct(page, 'Marcador fluo', '2')
    await page.getByRole('button', { name: 'Transferencia' }).click()
    await expect(page.getByLabel('Total de la venta')).toHaveText('$1.800,00')
    await expectNoHorizontalScroll(page)
    await confirmSale(page)

    await page.getByRole('button', { name: 'Ventas registradas' }).click()
    await expect(page.getByRole('button', { name: /^Ver venta N° / }).first()).toBeVisible()
    await expectNoHorizontalScroll(page)
  })
})
