import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from './launcher'

test('first start without a session offers to sign in and shows the news', async ({ launch }) => {
  const { window, problems } = await launch()

  await expect(window.getByRole('heading', { level: 1, name: 'Orvian' })).toBeVisible()
  await expect(window.locator('.play-label')).toHaveText('Iniciar sesión')
  await expect(window.locator('.play-sub')).toContainText('cuenta de Minecraft Java')
  // The changelog of the published pack comes from the manifest served by the test
  await expect(window.getByText('Cambio de prueba uno')).toBeVisible()

  // Without an account the launcher shows only its sign-in screen: no navigation
  await expect(window.getByRole('navigation', { name: 'Principal' })).toHaveCount(0)
  await expect(window.getByRole('button', { name: 'Más opciones' })).toHaveCount(0)
  // Keyboard: the skip link is the first stop
  await window.keyboard.press('Tab')
  await expect(window.getByRole('link', { name: 'Saltar al contenido' })).toBeFocused()

  expect(problems).toEqual([])
})

test('signed in, the navigation is operable with the keyboard', async ({ launch }) => {
  const { window, problems } = await launch({ signedIn: true })
  await window.getByRole('button', { name: 'Ajustes' }).focus()
  await window.keyboard.press('Enter')
  await expect(window.getByRole('heading', { level: 1, name: 'Ajustes' })).toBeVisible()
  await expect(window.getByRole('button', { name: 'Ajustes' })).toHaveAttribute('aria-current', 'page')
  expect(problems).toEqual([])
})

test('the window cannot be navigated away and exposes no Node.js', async ({ launch }) => {
  const { window } = await launch()
  const appUrl = window.url()

  await window.evaluate(() => {
    globalThis.location.href = 'https://example.com/'
  })
  await window.waitForTimeout(1000)
  expect(window.url()).toBe(appUrl)

  expect(await window.evaluate(() => `${typeof require}/${typeof process}`)).toBe('undefined/undefined')
  // No secret ever lives in the window's own storage
  expect(await window.evaluate(() => Object.keys(localStorage).filter((key) => /token|secret/i.test(key)))).toEqual([])
})

test('the memory setting is changed with the keyboard and survives a restart', async ({ launch }) => {
  const launcher = await launch({ signedIn: true })
  await launcher.window.getByRole('button', { name: 'Ajustes' }).click()

  const slider = launcher.window.getByRole('slider', { name: 'Memoria RAM' })
  const before = Number(await slider.inputValue())
  await slider.focus()
  await launcher.window.keyboard.press('ArrowLeft')
  await expect(launcher.window.getByText('Guardado.')).toBeVisible()
  const after = before - 1

  await launcher.restart()
  await launcher.window.getByRole('button', { name: 'Ajustes' }).click()
  await expect(launcher.window.getByRole('slider', { name: 'Memoria RAM' })).toHaveValue(String(after))
})

test('installed mods: Esc cancels the delete dialog, confirming removes the file', async ({ launch }) => {
  const { window, dataDir } = await launch({ signedIn: true, seed: { 'instances/orvian/mods/mi-mod-1.0.jar': 'jar', 'instances/orvian/mods/otro-mod.jar': 'jar' } })
  await window.getByRole('button', { name: 'Mods' }).click()

  await expect(window.getByText('mi-mod-1.0.jar')).toBeVisible()
  const trash = window.getByRole('button', { name: 'Eliminar mi-mod-1.0.jar' })
  await trash.focus()
  await window.keyboard.press('Enter')
  const dialog = window.getByRole('dialog', { name: '¿Eliminar este mod?' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Cancelar' })).toBeFocused()

  await window.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(trash).toBeFocused()
  expect(existsSync(join(dataDir, 'instances/orvian/mods/mi-mod-1.0.jar'))).toBe(true)

  await trash.click()
  await dialog.getByRole('button', { name: 'Eliminar' }).click()
  await expect(window.getByText('mi-mod-1.0.jar', { exact: true })).toBeHidden()
  expect(existsSync(join(dataDir, 'instances/orvian/mods/mi-mod-1.0.jar'))).toBe(false)
  expect(existsSync(join(dataDir, 'instances/orvian/mods/otro-mod.jar'))).toBe(true)
})

test('resetting keeps the worlds; deleting them needs the typed word', async ({ launch }) => {
  const seed = { 'instances/orvian/saves/mundo/level.dat': 'datos', 'instances/orvian/options.txt': 'fov:90', 'launcher/config.json': '{"ramGb":4}' }
  const { window, dataDir } = await launch({ seed, signedIn: true })
  await window.getByRole('button', { name: 'Ajustes' }).click()

  await window.getByRole('button', { name: 'Restablecer el launcher' }).click()
  const dialog = window.getByRole('dialog', { name: '¿Restablecer el launcher?' })
  await dialog.getByRole('button', { name: 'Restablecer' }).click()
  await expect(window.getByText('Se conservaron tus mundos', { exact: false })).toBeVisible()
  expect(existsSync(join(dataDir, 'instances/orvian/saves/mundo/level.dat'))).toBe(true)
  expect(existsSync(join(dataDir, 'instances/orvian/options.txt'))).toBe(true)
  expect(existsSync(join(dataDir, 'launcher/config.json'))).toBe(false)

  // Second reset, this time asking to delete the worlds
  await window.getByRole('button', { name: 'Restablecer el launcher' }).click()
  const second = window.getByRole('dialog', { name: '¿Restablecer el launcher?' })
  await second.getByRole('checkbox').check()
  const confirm = second.getByRole('button', { name: 'Restablecer', exact: true })
  await expect(confirm).toBeDisabled()
  await second.getByRole('textbox').fill('RESTABLECER')
  await expect(confirm).toBeEnabled()
  await confirm.click()
  await expect(window.getByText('Todo ha quedado como nuevo', { exact: false })).toBeVisible()
  expect(existsSync(join(dataDir, 'instances/orvian/saves/mundo/level.dat'))).toBe(false)
})

test('resource packs from the modpack are locked; the player\'s own can be removed', async ({ launch }) => {
  const seed = {
    'instances/orvian/resourcepacks/Orvian Oficial.zip': 'zip',
    'instances/orvian/resourcepacks/Mio.zip': 'zip',
    'instances/orvian/.orvian/official-state.json': JSON.stringify({ files: { 'resourcepacks/Orvian Oficial.zip': 'hash' } })
  }
  const { window } = await launch({ seed, signedIn: true })
  await window.getByRole('button', { name: 'Recursos', exact: true }).click()

  await expect(window.getByText('Orvian Oficial.zip')).toBeVisible()
  await expect(window.getByRole('button', { name: 'Borrar Orvian Oficial.zip' })).toHaveCount(0)
  await expect(window.getByRole('switch', { name: /Orvian Oficial\.zip/ })).toHaveCount(0)
  await expect(window.getByRole('button', { name: 'Borrar Mio.zip' })).toBeVisible()
})

test('skin editor: the tour can be followed, a template loads and painting can be undone', async ({ launch }) => {
  const { window, problems } = await launch({ signedIn: true })
  await window.getByRole('button', { name: 'Editor', exact: true }).click()

  const tour = window.getByRole('dialog', { name: 'Empieza con una skin' })
  // The tour opens by itself the first time; the window's storage may remember an earlier run
  await window.waitForTimeout(500)
  if (!(await tour.isVisible())) await window.getByRole('button', { name: 'Ver el tutorial' }).click()
  await expect(tour).toBeVisible()
  await tour.getByRole('button', { name: 'Siguiente' }).click()
  await expect(window.getByRole('dialog', { name: 'Tres formas de ver la misma skin' })).toBeVisible()
  await window.getByRole('dialog').getByRole('button', { name: 'Atrás' }).click()
  await tour.getByRole('button', { name: 'Saltar' }).click()
  await expect(tour).toBeHidden()

  await window.getByRole('button', { name: 'Mapa UV' }).click()
  await window.getByRole('button', { name: '2D', exact: true }).click()
  const undo = window.getByRole('button', { name: /Deshacer/ })
  const canvas = window.getByRole('img', { name: 'Textura de la skin en 2D' })
  const box = await canvas.boundingBox()
  expect(box).not.toBeNull()
  if (box) await window.mouse.click(box.x + box.width * 0.2, box.y + box.height * 0.2)
  // Two steps to undo: the stroke, then loading the template; after that there is nothing left
  await expect(undo).toBeEnabled()
  await window.keyboard.press('Control+z')
  await window.keyboard.press('Control+z')
  await expect(undo).toBeDisabled()
  expect(problems).toEqual([])
})
