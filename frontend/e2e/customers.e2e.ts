import { expect, type Page, test } from '@playwright/test'
import { errorToast, login, successToast } from './support'

async function searchCustomer(page: Page, name: string) {
  await page.getByRole('textbox', { name: 'Buscar clientes' }).fill(name)
  await expect(page.getByRole('textbox', { name: /^Importe para / })).toHaveCount(1)
}

async function registerMovement(page: Page, customer: string, type: 'Fiado' | 'Pago', amount: string) {
  await page.getByRole('textbox', { name: `Importe para ${customer}` }).fill(amount)
  await page.getByRole('button', { name: `Tipo de movimiento para ${customer}` }).click()
  await page.getByRole('option', { name: type }).click()
  await page.getByRole('main').getByRole('button', { name: 'Actualizar' }).click()
  const title = type === 'Fiado' ? 'Registrar fiado' : 'Registrar pago'
  return page.getByRole('alertdialog', { name: title }).getByRole('button', { name: 'Actualizar' })
}

test('un Gerente da de alta un cliente', async ({ page }) => {
  await login(page, 'gerenta')
  await page.goto('/clientes')
  await page.getByRole('button', { name: 'Nuevo cliente' }).click()
  const form = page.getByRole('dialog', { name: 'Nuevo cliente' })
  await form.getByRole('textbox', { name: 'Nombre *' }).fill('Rosa Nueva')
  await form.getByRole('textbox', { name: 'Teléfono' }).fill('15-0000-1111')
  await form.getByRole('button', { name: 'Guardar' }).click()
  await page.getByRole('alertdialog', { name: 'Nuevo cliente' }).getByRole('button', { name: 'Guardar' }).click()
  await expect(successToast(page, 'Cliente creado.')).toBeVisible()

  await page.reload()
  await searchCustomer(page, 'Rosa Nueva')
  await expect(page.getByRole('main')).toContainText('15-0000-1111')
  await expect(page.getByRole('main')).toContainText('$0,00')
})

test('un Empleado registra un fiado y un pago y el saldo queda bien', async ({ page }) => {
  await login(page, 'empleada')
  await page.goto('/clientes')
  await searchCustomer(page, 'Marta Fiado')

  await (await registerMovement(page, 'Marta Fiado', 'Fiado', '1500')).click()
  await expect(successToast(page, 'Fiado registrado.')).toBeVisible()
  await expect(page.getByRole('main')).toContainText('$1.500,00')

  await (await registerMovement(page, 'Marta Fiado', 'Pago', '400')).click()
  await expect(successToast(page, 'Pago registrado.')).toBeVisible()
  await expect(page.getByRole('main')).toContainText('$1.100,00')

  await page.reload()
  await searchCustomer(page, 'Marta Fiado')
  await expect(page.getByRole('main')).toContainText('$1.100,00')
})

test('doble clic al registrar un fiado lo registra una sola vez', async ({ page }) => {
  await login(page, 'empleada')
  await page.goto('/clientes')
  await searchCustomer(page, 'Pedro Doble')

  await (await registerMovement(page, 'Pedro Doble', 'Fiado', '700')).dblclick()
  await expect(successToast(page, 'Fiado registrado.')).toBeVisible()
  await expect(errorToast(page, /.+/)).toHaveCount(0)

  await page.reload()
  await searchCustomer(page, 'Pedro Doble')
  await expect(page.getByRole('main')).toContainText('$700,00')
})
