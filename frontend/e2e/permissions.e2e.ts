import { expect, test } from '@playwright/test'
import { FIRST_BUSINESS, login, postAsCurrentUser, SECOND_BUSINESS, successToast, USERS, variantIdOf } from './support'

test('un Empleado no ve Panel, Proveedores ni Cuentas en el menú', async ({ page }) => {
  await login(page, 'empleada')
  const navigation = page.getByRole('navigation')
  await expect(navigation.getByRole('link', { name: 'Productos' })).toBeVisible()
  await expect(navigation.getByRole('link', { name: 'Clientes' })).toBeVisible()
  await expect(navigation.getByRole('link', { name: 'Panel' })).toHaveCount(0)
  await expect(navigation.getByRole('link', { name: 'Proveedores' })).toHaveCount(0)
  await expect(navigation.getByRole('link', { name: 'Cuentas' })).toHaveCount(0)
})

test('un Empleado que escribe la dirección de Cuentas, Proveedores o el Panel vuelve a Productos', async ({ page }) => {
  await login(page, 'empleada')
  for (const path of ['/cuentas', '/proveedores', '/']) {
    await page.goto(path)
    await expect(page).toHaveURL(/\/products$/)
    await expect(page.getByRole('heading', { name: 'Productos', level: 1 })).toBeVisible()
  }
})

test('un Empleado ve el stock pero no puede ajustarlo', async ({ page }) => {
  await login(page, 'empleada')
  await page.goto('/inventario')
  await expect(page.getByRole('main')).toContainText('Cuaderno rayado')
  await expect(page.getByRole('textbox', { name: /^Cuánto sumar o restar a / })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /^Editar stock mínimo de / })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /^Ver historial de stock de / })).toHaveCount(0)

  const variantId = await variantIdOf(page, 'Carpeta escolar')
  const response = await postAsCurrentUser(page, `/variants/${variantId}/stock/adjustments`, { delta: '1' })
  expect(response.status).toBe(403)
})

test('un Empleado ve los precios pero no puede cambiarlos', async ({ page }) => {
  await login(page, 'empleada')
  await page.goto('/precios')
  await expect(page.getByRole('main')).toContainText('Carpeta escolar')
  await expect(page.getByRole('textbox', { name: /^Cuánto sumar o restar a / })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Actualizar' })).toHaveCount(0)

  const variantId = await variantIdOf(page, 'Carpeta escolar')
  const response = await page.evaluate(async (id) => {
    const csrf = document.cookie
      .split('; ')
      .find((cookie) => cookie.startsWith('csrf_token='))
      ?.slice('csrf_token='.length)
    const result = await fetch(`/variants/${id}/price`, {
      method: 'PUT',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-CSRF-Token': decodeURIComponent(csrf ?? ''),
        'Idempotency-Key': crypto.randomUUID().replaceAll('-', ''),
      },
      body: JSON.stringify({ delta: '100' }),
    })
    return result.status
  }, variantId)
  expect(response).toBe(403)
})

test('un Empleado no puede crear productos ni clientes', async ({ page }) => {
  await login(page, 'empleada')
  await page.goto('/products')
  await expect(page.getByRole('heading', { name: 'Productos', level: 1 })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Nuevo Producto' })).toHaveCount(0)
  await page.goto('/clientes')
  await expect(page.getByRole('heading', { name: 'Clientes', level: 1 })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Nuevo cliente' })).toHaveCount(0)
})

test('el selector de negocio no aparece para un Administrador con acceso a dos negocios', async ({ page }) => {
  await login(page, 'administradora')
  await expect(page.getByRole('banner').getByText(FIRST_BUSINESS)).toBeVisible()
  await page.getByRole('button', { name: `Menú de la cuenta de ${USERS.administradora.name}` }).click()
  await expect(page.getByRole('button', { name: 'Cerrar sesión' })).toBeVisible()
  await expect(page.getByRole('button', { name: SECOND_BUSINESS })).toHaveCount(0)
})

test('el selector de negocio no aparece para un Empleado', async ({ page }) => {
  await login(page, 'empleada')
  await page.getByRole('button', { name: `Menú de la cuenta de ${USERS.empleada.name}` }).click()
  await expect(page.getByRole('button', { name: 'Cerrar sesión' })).toBeVisible()
  await expect(page.getByRole('button', { name: SECOND_BUSINESS })).toHaveCount(0)
})

test('el Dueño cambia de negocio desde el menú de su cuenta', async ({ page }) => {
  await login(page, 'duena')
  await page.getByRole('button', { name: `Menú de la cuenta de ${USERS.duena.name}` }).click()
  await page.getByRole('button', { name: SECOND_BUSINESS }).click()
  await page.getByRole('alertdialog', { name: 'Cambiar de negocio' }).getByRole('button', { name: 'Cambiar' }).click()
  await expect(successToast(page, 'Negocio cambiado.')).toBeVisible()
  await expect(page.getByRole('banner').getByRole('paragraph').filter({ hasText: SECOND_BUSINESS })).toBeVisible()

  await page.goto('/products')
  await expect(page.getByText('No hay productos cargados')).toBeVisible()
  await expect(page.getByRole('main')).not.toContainText('Cuaderno rayado')
})
