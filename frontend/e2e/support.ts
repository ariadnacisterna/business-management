import { expect, type Page } from '@playwright/test'

export const PASSWORD = 'Prueba123'

export const USERS = {
  empleada: { userName: 'empleada', name: 'Elsa Empleada', role: 'Empleado' },
  gerenta: { userName: 'gerenta', name: 'Gabriela Gerenta', role: 'Gerente' },
  administradora: { userName: 'administradora', name: 'Ana Administradora', role: 'Administrador' },
  duena: { userName: 'duena', name: 'Dora Duena', role: 'Dueño' },
  lectora: { userName: 'lectora', name: 'Luisa Lectora', role: 'Empleado' },
} as const

export type UserKey = keyof typeof USERS

export const FIRST_BUSINESS = 'Libreria Ejemplo'
export const SECOND_BUSINESS = 'Almacen Ejemplo'

export async function submitLogin(page: Page, userName: string, password: string) {
  await page.goto('/login')
  await page.getByLabel('Usuario').fill(userName)
  await page.getByLabel('Contraseña').fill(password)
  await page.getByRole('button', { name: 'Iniciar Sesión' }).click()
}

export async function login(page: Page, user: UserKey) {
  await submitLogin(page, USERS[user].userName, PASSWORD)
  if (user === 'duena') {
    await page.getByRole('button', { name: new RegExp(FIRST_BUSINESS) }).click()
  }
  await page.getByRole('alertdialog', { name: 'Bienvenida' }).getByRole('button', { name: 'Cerrar' }).click()
  await expect(page.getByRole('alertdialog', { name: 'Bienvenida' })).toBeHidden()
}

export async function logout(page: Page, user: UserKey) {
  await page.getByRole('button', { name: `Menú de la cuenta de ${USERS[user].name}` }).click()
  await page.getByRole('button', { name: 'Cerrar sesión' }).click()
  await expect(page).toHaveURL(/\/login$/)
}

export function successToast(page: Page, message: string | RegExp) {
  return page.getByRole('status').filter({ hasText: message })
}

export function errorToast(page: Page, message: string | RegExp) {
  return page.getByRole('alert').filter({ hasText: message })
}

export async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow).toBeLessThanOrEqual(0)
}

export async function searchInventory(page: Page, search: string) {
  await page.getByRole('textbox', { name: 'Buscar producto' }).fill(search)
  await expect(page.getByRole('textbox', { name: /^Cuánto sumar o restar a / })).toHaveCount(1)
}

export async function variantIdOf(page: Page, productName: string): Promise<number> {
  return page.evaluate(async (name) => {
    const response = await fetch(`/products?search=${encodeURIComponent(name)}`, {
      headers: { Accept: 'application/json' },
    })
    const body = (await response.json()) as { items: { name: string; variants: { id: number }[] }[] }
    const product = body.items.find((item) => item.name === name)
    if (product === undefined) throw new Error(`No existe el producto ${name}`)
    return product.variants[0].id
  }, productName)
}

export async function postAsCurrentUser(
  page: Page,
  path: string,
  body: unknown,
): Promise<{ status: number; detail: unknown }> {
  return page.evaluate(
    async ({ path, body }) => {
      const csrf = document.cookie
        .split('; ')
        .find((cookie) => cookie.startsWith('csrf_token='))
        ?.slice('csrf_token='.length)
      const response = await fetch(path, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'X-CSRF-Token': decodeURIComponent(csrf ?? ''),
          'Idempotency-Key': crypto.randomUUID().replaceAll('-', ''),
        },
        body: JSON.stringify(body),
      })
      const json = (await response.json().catch(() => null)) as { detail?: unknown } | null
      return { status: response.status, detail: json?.detail ?? null }
    },
    { path, body },
  )
}
