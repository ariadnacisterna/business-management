import { expect, test } from '@playwright/test'
import { errorToast, FIRST_BUSINESS, login, logout, PASSWORD, SECOND_BUSINESS, submitLogin, USERS } from './support'

test('Empleado inicia sesión, ve Productos y cierra sesión', async ({ page }) => {
  await login(page, 'empleada')
  await expect(page).toHaveURL(/\/products$/)
  await expect(page.getByRole('heading', { name: 'Productos', level: 1 })).toBeVisible()
  await logout(page, 'empleada')
  await page.goto('/products')
  await expect(page).toHaveURL(/\/login$/)
})

test('Gerente inicia sesión, ve Productos y cierra sesión', async ({ page }) => {
  await login(page, 'gerenta')
  await expect(page).toHaveURL(/\/products$/)
  await expect(page.getByRole('heading', { name: 'Productos', level: 1 })).toBeVisible()
  await logout(page, 'gerenta')
})

test('Administrador inicia sesión en el Panel y cierra sesión', async ({ page }) => {
  await login(page, 'administradora')
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByRole('heading', { name: 'Panel', level: 1 })).toBeVisible()
  await logout(page, 'administradora')
})

test('Dueño elige el negocio al iniciar sesión y cierra sesión', async ({ page }) => {
  await submitLogin(page, USERS.duena.userName, PASSWORD)
  await expect(page.getByRole('heading', { name: '¿Con qué negocio querés trabajar?' })).toBeVisible()
  await expect(page.getByRole('button', { name: new RegExp(SECOND_BUSINESS) })).toBeVisible()
  await page.getByRole('button', { name: new RegExp(FIRST_BUSINESS) }).click()
  await page.getByRole('alertdialog', { name: 'Bienvenida' }).getByRole('button', { name: 'Cerrar' }).click()
  await expect(page.getByRole('heading', { name: 'Panel', level: 1 })).toBeVisible()
  await expect(page.getByRole('banner').getByText(FIRST_BUSINESS)).toBeVisible()
  await logout(page, 'duena')
})

test('una contraseña incorrecta no deja entrar', async ({ page }) => {
  await submitLogin(page, USERS.gerenta.userName, 'Incorrecta1')
  await expect(errorToast(page, 'Usuario o contraseña incorrectos.')).toBeVisible()
  await expect(page).toHaveURL(/\/login$/)
})

test('un usuario que no existe no deja entrar', async ({ page }) => {
  await submitLogin(page, 'nadie', PASSWORD)
  await expect(errorToast(page, 'Usuario o contraseña incorrectos.')).toBeVisible()
  await expect(page).toHaveURL(/\/login$/)
})
