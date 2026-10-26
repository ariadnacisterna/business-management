import { expect, test, type Locator, type Page } from '@playwright/test'
import { expectNoHorizontalScroll, FIRST_BUSINESS, login, postAsCurrentUser, successToast } from './support'

function searchBox(page: Page) {
  return page.getByRole('combobox', { name: 'Buscar producto para vender' })
}

async function pickProduct(page: Page, product: string) {
  await searchBox(page).fill(product)
  await page.getByRole('option', { name: `Agregar ${product}` }).click()
}

async function addProduct(page: Page, product: string, quantity: string) {
  await pickProduct(page, product)
  const quantityInput = page.getByRole('textbox', { name: `Cantidad de ${product}` })
  await quantityInput.fill(quantity)
}

async function openCheckout(page: Page) {
  await page.getByRole('button', { name: 'Confirmar venta' }).click()
  const checkout = page.getByRole('dialog', { name: 'Confirmar venta' })
  await expect(checkout).toBeVisible()
  return checkout
}

async function finishSale(page: Page, checkout: Locator) {
  await checkout.getByRole('button', { name: 'Confirmar venta' }).click()
  const registered = page.getByRole('dialog', { name: 'Venta registrada' })
  await expect(registered).toBeVisible()
  const saleNumber = await registered.getByText(/^Venta N\.º \d+$/).textContent()
  await registered.getByRole('button', { name: 'Nueva venta' }).click()
  await expect(registered).toHaveCount(0)
  return Number(saleNumber?.replace(/\D/g, ''))
}

async function confirmSale(page: Page) {
  return finishSale(page, await openCheckout(page))
}

async function splitBetween(checkout: Locator, ...methods: string[]) {
  await checkout.getByRole('button', { name: 'Repartir entre varias' }).click()
  for (const method of methods) {
    await checkout.getByRole('button', { name: method, exact: true }).click()
  }
}

async function chooseFiadoCustomer(page: Page, checkout: Locator, customer: string) {
  await checkout.getByRole('button', { name: 'Cliente del fiado' }).click()
  await page.getByRole('option', { name: customer }).click()
}

async function customerBalanceText(page: Page, customer: string) {
  await page.goto('/clientes')
  await page.getByRole('textbox', { name: 'Buscar clientes' }).fill(customer)
  await expect(page.getByRole('textbox', { name: /^Importe para / })).toHaveCount(1)
  return page.getByRole('main')
}

async function openLatestSale(page: Page) {
  await page.goto('/historial/ventas')
  await page.getByRole('button', { name: /^Ver venta N° / }).first().click()
  return page.getByRole('dialog', { name: /^Venta N° / })
}

test('un Empleado registra una venta en efectivo y baja el stock', async ({ page }) => {
  await login(page, 'empleada')
  await page.goto('/ventas')

  await addProduct(page, 'Sacapuntas doble', '2')
  await expect(page.getByLabel('Total de la venta')).toHaveText('$ 700,00')
  await confirmSale(page)

  const sale = await openLatestSale(page)
  await expect(sale).toContainText('Sacapuntas doble')
  await expect(sale).toContainText('Efectivo')
  await expect(sale).toContainText('$ 700,00')
  await sale.getByRole('button', { name: 'Cerrar' }).click()

  await page.goto('/ventas/nueva')
  await searchBox(page).fill('Sacapuntas doble')
  await expect(page.getByRole('option', { name: 'Agregar Sacapuntas doble' })).toContainText('Stock: 18 u')
})

test('elegir un producto dos veces suma uno y el descuento baja el total', async ({ page }) => {
  await login(page, 'empleada')
  await page.goto('/ventas')
  await expect(page.getByText('El carrito está vacío')).toBeVisible()
  await expect(page.getByRole('option', { name: 'Agregar Sacapuntas doble' })).toHaveCount(0)

  await pickProduct(page, 'Sacapuntas doble')
  await expect(page.getByRole('listbox')).toHaveCount(0)
  await pickProduct(page, 'Sacapuntas doble')
  await expect(page.getByRole('textbox', { name: 'Cantidad de Sacapuntas doble' })).toHaveValue('2')
  await page.getByRole('textbox', { name: 'Descuento en pesos' }).fill('100')
  await expect(page.getByLabel('Total de la venta')).toHaveText('$ 600,00')
  await page.getByRole('button', { name: 'Vaciar carrito' }).click()
  await expect(page.getByText('El carrito está vacío')).toBeVisible()
})

test('con ventas registradas, Ventas muestra los filtros', async ({ page }) => {
  await login(page, 'empleada')
  await page.goto('/ventas')
  await page.goto('/historial/ventas')
  await expect(page.getByText('Desde', { exact: true })).toBeVisible()
  await expect(page.getByText('No hay ventas registradas', { exact: true })).toHaveCount(0)
})

test('el descuento en porcentaje se calcula sobre el total', async ({ page }) => {
  await login(page, 'empleada')
  await page.goto('/ventas')

  await pickProduct(page, 'Sacapuntas doble')
  await pickProduct(page, 'Sacapuntas doble')
  await expect(page.getByLabel('Total de la venta')).toHaveText('$ 700,00')
  await page.getByRole('textbox', { name: 'Descuento en porcentaje' }).fill('10')
  await expect(page.getByRole('textbox', { name: 'Descuento en pesos' })).toHaveValue('70.00')
  await expect(page.getByLabel('Total de la venta')).toHaveText('$ 630,00')
})

test('una venta en fiado suma al saldo del cliente', async ({ page }) => {
  await login(page, 'empleada')
  await page.goto('/ventas')

  await addProduct(page, 'Marcador fluo', '1')
  const checkout = await openCheckout(page)
  await checkout.getByRole('button', { name: 'Fiado' }).click()
  await chooseFiadoCustomer(page, checkout, 'Clara Ventas')
  await finishSale(page, checkout)

  await expect(await customerBalanceText(page, 'Clara Ventas')).toContainText('$ 900,00')
})

test('se vende aunque no alcance el stock y la venta queda marcada', async ({ page }) => {
  await login(page, 'empleada')
  await page.goto('/ventas')

  await addProduct(page, 'Pegamento en barra', '3')
  await expect(page.getByRole('main')).toContainText('Stock insuficiente: hay 1 u')
  const checkout = await openCheckout(page)
  await checkout.getByRole('button', { name: 'Confirmar venta' }).click()

  const registered = page.getByRole('dialog', { name: 'Venta registrada' })
  await expect(registered.getByRole('alert')).toContainText('Stock insuficiente en:')
  await expect(registered.getByRole('alert')).toContainText('Pegamento en barra')
  await registered.getByRole('button', { name: 'Nueva venta' }).click()
  await expect(registered).toHaveCount(0)
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
    await expect(page.getByLabel('Total de la venta')).toHaveText('$ 1.800,00')
    await expectNoHorizontalScroll(page)
    const checkout = await openCheckout(page)
    await checkout.getByRole('button', { name: 'Transferencia' }).click()
    await splitBetween(checkout, 'Efectivo', 'Transferencia')
    await expect(checkout.getByRole('textbox', { name: 'Importe en efectivo' })).toBeVisible()
    await expect(checkout.getByRole('button', { name: 'Confirmar venta' })).toBeDisabled()
    await expectNoHorizontalScroll(page)
    await checkout.getByRole('button', { name: 'Pagar con una sola' }).click()
    await checkout.getByRole('button', { name: 'Transferencia' }).click()
    await finishSale(page, checkout)

    await page.goto('/historial/ventas')
    await expect(page.getByRole('button', { name: /^Ver venta N° / }).first()).toBeVisible()
    await expectNoHorizontalScroll(page)
  })
})

test('el Historial de ventas muestra la cantidad y permite limpiar los filtros', async ({ page }) => {
  await login(page, 'empleada')
  await page.goto('/historial/ventas')
  await expect(page.getByText(/ventas? registradas?$/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Limpiar filtros' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Filtrar por forma de pago' }).click()
  await page.getByRole('option', { name: 'Transferencia' }).click()
  await page.getByRole('button', { name: 'Limpiar filtros' }).click()
  await expect(page.getByRole('button', { name: 'Limpiar filtros' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Filtrar por forma de pago' })).toContainText('Todas')
})

test('una venta repartida entre efectivo y transferencia calcula el vuelto', async ({ page }, testInfo) => {
  await login(page, 'empleada')
  await page.goto('/ventas')

  await addProduct(page, 'Marcador fluo', '2')
  const checkout = await openCheckout(page)
  await splitBetween(checkout, 'Efectivo', 'Transferencia')
  await checkout.getByRole('textbox', { name: 'Importe en efectivo' }).fill('1000')
  await expect(checkout).toContainText('Falta asignar')
  await expect(checkout).toContainText('$ 800,00')
  await expect(checkout.getByRole('button', { name: 'Confirmar venta' })).toBeDisabled()
  await checkout.getByRole('textbox', { name: 'Importe en transferencia' }).fill('800')
  await expect(checkout).toContainText('Completo')
  await expect(checkout.getByRole('button', { name: 'Confirmar venta' })).toBeEnabled()
  await checkout.getByRole('textbox', { name: 'Paga con' }).fill('2000')
  await expect(checkout.getByTestId('change-amount')).toHaveText('$ 1.000,00')
  await checkout.screenshot({ path: testInfo.outputPath('confirmar-venta-repartida.png') })
  await finishSale(page, checkout)

  const sale = await openLatestSale(page)
  const payments = sale.getByRole('region', { name: 'Formas de pago' })
  await expect(payments).toContainText('Efectivo')
  await expect(payments).toContainText('$ 1.000,00')
  await expect(payments).toContainText('Transferencia')
  await expect(payments).toContainText('$ 800,00')
  await expect(sale).not.toContainText('2.000')
})

test('una venta con una parte en fiado suma solo esa parte al saldo del cliente', async ({ page }) => {
  await login(page, 'empleada')
  await page.goto('/ventas')

  await addProduct(page, 'Marcador fluo', '1')
  const checkout = await openCheckout(page)
  await splitBetween(checkout, 'Efectivo', 'Fiado')
  await checkout.getByRole('textbox', { name: 'Importe en efectivo' }).fill('300')
  await checkout.getByRole('textbox', { name: 'Importe en fiado' }).fill('600')
  await expect(checkout.getByRole('button', { name: 'Confirmar venta' })).toBeDisabled()
  await chooseFiadoCustomer(page, checkout, 'Clara Ventas')
  await expect(checkout.getByRole('button', { name: 'Confirmar venta' })).toBeEnabled()
  await finishSale(page, checkout)

  await expect(await customerBalanceText(page, 'Clara Ventas')).toContainText('$ 1.500,00')
  await page.goto('/historial/ventas')
  await expect(page.getByRole('table', { name: 'Historial de ventas' })).toContainText('Efectivo $ 300,00 + Fiado $ 600,00')
})

test('un monto libre se cobra sin producto y Consultar precio no agrega nada', async ({ page }) => {
  await login(page, 'empleada')
  await page.goto('/ventas')

  await page.getByRole('button', { name: 'Consultar precio' }).click()
  const priceCheck = page.getByRole('dialog', { name: 'Consultar precio' })
  await priceCheck.getByRole('combobox', { name: 'Buscar producto para consultar' }).fill('Marcador')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await expect(priceCheck.getByRole('region', { name: 'Precio consultado' })).toContainText('$ 900,00')
  await page.keyboard.press('Escape')
  await expect(priceCheck).toHaveCount(0)
  await expect(page.getByText('El carrito está vacío')).toBeVisible()

  await page.getByRole('button', { name: 'Agregar monto' }).click()
  const freeAmount = page.getByRole('dialog', { name: 'Agregar monto' })
  await freeAmount.getByRole('textbox', { name: /Nombre/ }).fill('Arreglo de cierre')
  await freeAmount.getByRole('textbox', { name: 'Importe del monto' }).fill('450')
  await page.keyboard.press('Enter')
  await expect(freeAmount).toHaveCount(0)
  await expect(page.getByLabel('Total de la venta')).toHaveText('$ 450,00')

  const checkout = await openCheckout(page)
  await checkout.getByRole('button', { name: 'Transferencia' }).click()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('dialog', { name: 'Venta registrada' })).toContainText('$ 450,00')
  await page.getByRole('button', { name: 'Nueva venta' }).click()

  const sale = await openLatestSale(page)
  await expect(sale).toContainText('Arreglo de cierre')
  await expect(sale).toContainText('Monto libre')
  await expect(sale).toContainText('Transferencia')
})

test('un Gerente anula una venta repartida y se revierte la parte en fiado', async ({ page }) => {
  await login(page, 'gerenta')
  await page.goto('/ventas')

  await addProduct(page, 'Marcador fluo', '1')
  const checkout = await openCheckout(page)
  await splitBetween(checkout, 'Transferencia', 'Fiado')
  await checkout.getByRole('textbox', { name: 'Importe en transferencia' }).fill('400')
  await checkout.getByRole('textbox', { name: 'Importe en fiado' }).fill('500')
  await chooseFiadoCustomer(page, checkout, 'Clara Ventas')
  await page.keyboard.press('Escape')
  await expect(checkout).toHaveCount(0)
  const reopened = await openCheckout(page)
  await splitBetween(reopened, 'Transferencia', 'Fiado')
  await reopened.getByRole('textbox', { name: 'Importe en transferencia' }).fill('400')
  await reopened.getByRole('textbox', { name: 'Importe en fiado' }).fill('500')
  await chooseFiadoCustomer(page, reopened, 'Clara Ventas')
  await finishSale(page, reopened)
  await expect(await customerBalanceText(page, 'Clara Ventas')).toContainText('$ 2.000,00')

  const sale = await openLatestSale(page)
  await sale.getByRole('button', { name: 'Anular venta' }).click()
  await sale.getByRole('textbox', { name: /Motivo/ }).fill('Pagó de otra forma')
  await sale.getByRole('button', { name: 'Confirmar anulación' }).click()
  await expect(successToast(page, 'Venta anulada.')).toBeVisible()
  await expect(sale.getByRole('region', { name: 'Formas de pago' })).toContainText('Transferencia')

  await expect(await customerBalanceText(page, 'Clara Ventas')).toContainText('$ 1.500,00')
})

test('un Administrador carga el alias, se ve y se copia al cobrar con transferencia, y se puede borrar', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await login(page, 'administradora')
  await page.goto('/configuraciones')
  await page.getByRole('region', { name: 'Alias para transferencias' }).getByRole('button', { name: 'Editar' }).click()
  const aliasField = page.getByRole('textbox', { name: 'Alias para transferencias' })
  await aliasField.fill('con espacio')
  await expect(page.getByText('El alias no puede tener espacios.')).toBeVisible()
  await expect(page.getByRole('region', { name: 'Alias para transferencias' }).getByRole('button', { name: 'Guardar' })).toBeDisabled()
  await aliasField.fill('alias.e2e.prueba')
  await page.getByRole('region', { name: 'Alias para transferencias' }).getByRole('button', { name: 'Guardar' }).click()
  await expect(successToast(page, 'Alias guardado.')).toBeVisible()

  await page.goto('/ventas')
  await addProduct(page, 'Marcador fluo', '1')
  const checkout = await openCheckout(page)
  await expect(checkout.getByText('Alias', { exact: true })).toHaveCount(0)
  await checkout.getByRole('button', { name: 'Transferencia' }).click()
  await expect(checkout.getByTestId('transfer-alias')).toHaveText('alias.e2e.prueba')
  await checkout.getByRole('button', { name: 'Copiar alias' }).click()
  await expect(checkout.getByRole('status')).toHaveText('Alias copiado')
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('alias.e2e.prueba')
  await checkout.getByRole('button', { name: 'Cancelar' }).click()

  await page.goto('/configuraciones')
  await page.getByRole('region', { name: 'Alias para transferencias' }).getByRole('button', { name: 'Editar' }).click()
  await page.getByRole('textbox', { name: 'Alias para transferencias' }).fill('')
  await page.getByRole('region', { name: 'Alias para transferencias' }).getByRole('button', { name: 'Guardar' }).click()
  await expect(successToast(page, 'Alias borrado.')).toBeVisible()

  await page.goto('/ventas')
  await addProduct(page, 'Marcador fluo', '1')
  const reopened = await openCheckout(page)
  await reopened.getByRole('button', { name: 'Transferencia' }).click()
  await expect(reopened.getByText('Sin alias cargado')).toBeVisible()
  await expect(reopened.getByRole('link', { name: /Configuración/ })).toBeVisible()
})

test('un Empleado no ve el alias en Configuración y el comprobante se arma con los datos de la venta', async ({ page }) => {
  await page.addInitScript(() => {
    const target = window as unknown as { printed: string[] }
    target.printed = []
    window.print = () => {
      target.printed.push(document.querySelector('[data-testid="receipt"]')?.textContent ?? '')
    }
  })
  await login(page, 'empleada')
  await page.goto('/configuraciones')
  await expect(page.getByRole('heading', { name: 'Configuración' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Alias para transferencias' })).toHaveCount(0)

  await page.goto('/ventas')
  await addProduct(page, 'Marcador fluo', '1')
  const checkout = await openCheckout(page)
  await checkout.getByRole('button', { name: 'Fiado' }).click()
  await chooseFiadoCustomer(page, checkout, 'Clara Ventas')
  await checkout.getByRole('button', { name: 'Confirmar venta' }).click()
  const registered = page.getByRole('dialog', { name: 'Venta registrada' })
  await registered.getByRole('button', { name: 'Imprimir comprobante' }).click()

  const printed = await page.evaluate(() => (window as unknown as { printed: string[] }).printed)
  expect(printed).toHaveLength(1)
  expect(printed[0]).toContain(FIRST_BUSINESS)
  expect(printed[0]).toContain('Marcador fluo')
  expect(printed[0]).toContain('$ 900,00')
  expect(printed[0]).toContain('Fiado')
  expect(printed[0]).toContain('Cliente: Clara Ventas')
  expect(printed[0]).toContain('No válido como factura')
  await expect(page.getByTestId('receipt')).toHaveCount(0)
  await registered.getByRole('button', { name: 'Nueva venta' }).click()

  const sale = await openLatestSale(page)
  await sale.getByRole('button', { name: 'Imprimir comprobante' }).click()
  const afterDetail = await page.evaluate(() => (window as unknown as { printed: string[] }).printed)
  expect(afterDetail).toHaveLength(1)
  expect(afterDetail[0]).toContain('Marcador fluo')
  expect(afterDetail[0]).toContain('No válido como factura')
})
