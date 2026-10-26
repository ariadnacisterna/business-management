import { expect, test } from '@playwright/test'
import { expectNoHorizontalScroll, login, successToast } from './support'

test('un Empleado ve su caja, retira efectivo con motivo y no ve el historial', async ({ page }) => {
  await login(page, 'empleada')
  await expect(page.getByRole('link', { name: /^Mi caja:/ })).toBeVisible()

  await page.getByRole('link', { name: 'Caja', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Caja', exact: true })).toBeVisible()
  await expect(page.getByLabel('Efectivo en caja')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Historial de cajas' })).toHaveCount(0)

  await page.getByRole('button', { name: 'Retirar efectivo' }).click()
  const dialog = page.getByRole('dialog', { name: 'Retirar efectivo' })
  await dialog.getByRole('textbox', { name: 'Importe' }).fill('50')
  await dialog.getByRole('textbox', { name: /Motivo/ }).fill('Luz')
  await dialog.getByRole('button', { name: 'Retirar' }).click()

  await expect(successToast(page, 'Efectivo retirado.')).toBeVisible()
  await expect(page.getByRole('region', { name: 'Ingresos y retiros' })).toContainText('Retiro: Luz')
  await expectNoHorizontalScroll(page)
})

test('un Gerente cierra la caja de una persona y ve el faltante o sobrante', async ({ page }) => {
  await login(page, 'gerenta')
  await page.goto('/caja')

  const history = page.getByRole('table', { name: 'Historial de cajas' })
  await expect(history).toBeVisible()
  const row = history.getByRole('row').filter({ hasText: 'Elsa Empleada' }).first()
  await row.scrollIntoViewIfNeeded()
  await row.getByRole('button', { name: /^Acciones para Caja N° / }).click()
  await page.getByRole('button', { name: 'Cerrar caja', exact: true }).click()

  const dialog = page.getByRole('dialog', { name: /^Cerrar caja N° / })
  await expect(dialog.getByRole('region', { name: 'Transferencias' })).toHaveCount(0)
  await dialog.getByRole('textbox', { name: 'Efectivo contado' }).fill('0')
  await expect(dialog).toContainText('Sobran')
  await dialog.getByRole('button', { name: 'Cerrar caja' }).click()

  await expect(successToast(page, 'Caja cerrada.')).toBeVisible()
  await expect(history.getByRole('row').filter({ hasText: 'Elsa Empleada' }).first()).toContainText('Cerrada')
})
