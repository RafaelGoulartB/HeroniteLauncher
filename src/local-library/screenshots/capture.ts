import { app, desktopCapturer, globalShortcut, screen } from 'electron'
import { execFile, execFileSync } from 'child_process'
import { existsSync, readdirSync } from 'graceful-fs'
import { mkdir, rename, writeFile } from 'fs/promises'
import { join, resolve } from 'path'
import sanitize from 'sanitize-filename'
import { t } from 'i18next'
import type { Runner } from 'common/types'
import type {
  CollectionScreenshotCaptureResult,
  CollectionScreenshotCaptureStatus
} from 'common/types/local-library'
import { sendFrontendMessage } from 'backend/ipc'
import { logError, logInfo, logWarning, LogPrefix } from 'backend/logger'
import { getCollectionSettings } from '../settings'
import { getLocalGameMeta } from '../stores'
import { getGameMetadata } from '../metadata/store'
import { pickScreenshotFolder } from './match'

type ActiveGame = {
  appName: string
  runner: Runner
  title: string
  aliases: string[]
  steamAppId?: string
  startedAt: number
}

const activeGames = new Map<string, ActiveGame>()
const HYPRLAND_BIND_DESCRIPTION = 'Heronite game screenshot'
let registeredAccelerator = ''
let hyprlandAccelerator = ''
let hyprlandKeys = ''
let registrationError = ''
let captureBusy = false
let initialized = false
let portalDesktopName = ''
let lastNotifiedRegistrationError = ''

async function showScreenshotNotification(title: string, body: string) {
  try {
    const { notify } = await import('backend/dialog/dialog')
    notify({ title, body })
  } catch (error) {
    logError(
      ['Collection screenshot notification failed:', error],
      LogPrefix.Backend
    )
  }
}

function showScreenshotOsd(message: string, value: string) {
  if (!isHyprlandSession()) return Promise.resolve(false)
  return new Promise<boolean>((resolve) => {
    execFile(
      'omarchy-shell',
      [
        'osd',
        'show',
        JSON.stringify({ icon: '', message, value, duration: 2_000 })
      ],
      { timeout: 2_000 },
      (error) => resolve(!error)
    )
  })
}

async function showScreenshotSavedFeedback(game: ActiveGame, path: string) {
  const title = t('notify.screenshot.savedTitle')
  if (await showScreenshotOsd(title, game.title)) return
  await showScreenshotNotification(
    title,
    t('notify.screenshot.savedBody', { game: game.title, path })
  )
}

function notifyRegistrationFailure(error: string) {
  if (!currentGame() || error === lastNotifiedRegistrationError) return
  lastNotifiedRegistrationError = error
  void showScreenshotNotification(
    t('notify.screenshot.shortcutFailedTitle'),
    t('notify.screenshot.shortcutFailedBody', { error })
  )
}

function gameKey(appName: string, runner: Runner) {
  return `${runner}:${appName}`
}

function currentGame(): ActiveGame | undefined {
  return [...activeGames.values()].sort(
    (left, right) => right.startedAt - left.startedAt
  )[0]
}

function captureFolder(game: ActiveGame, root: string) {
  let folders: string[] = []
  try {
    folders = readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
      .map((entry) => entry.name)
  } catch {
    // The configured root may not exist yet; it is created before this runs.
  }

  const match = pickScreenshotFolder(
    [game.title, ...game.aliases],
    folders,
    game.steamAppId
  )
  if (match) return join(root, match.folder)

  const safeTitle = sanitize(game.title).trim() || sanitize(game.appName).trim()
  return join(root, safeTitle || 'Game')
}

function timestampName(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
    2,
    '0'
  )}-${String(date.getDate()).padStart(2, '0')}_${String(
    date.getHours()
  ).padStart(2, '0')}-${String(date.getMinutes()).padStart(2, '0')}-${String(
    date.getSeconds()
  ).padStart(2, '0')}-${String(date.getMilliseconds()).padStart(3, '0')}.png`
}

function uniqueScreenshotPath(folder: string) {
  const initial = timestampName()
  let candidate = join(folder, initial)
  let suffix = 2
  while (existsSync(candidate)) {
    candidate = join(folder, initial.replace(/\.png$/, `-${suffix}.png`))
    suffix += 1
  }
  return candidate
}

function isHyprlandSession() {
  return (
    process.platform === 'linux' &&
    Boolean(process.env.HYPRLAND_INSTANCE_SIGNATURE)
  )
}

function captureDisplayWithGrim(bounds: Electron.Rectangle) {
  const geometry = `${bounds.x},${bounds.y} ${bounds.width}x${bounds.height}`
  return new Promise<Buffer>((resolve, reject) => {
    execFile(
      'grim',
      ['-g', geometry, '-'],
      { encoding: 'buffer', maxBuffer: 100 * 1024 * 1024 },
      (error, stdout) => {
        if (error) reject(new Error(error.message))
        else resolve(stdout)
      }
    )
  })
}

async function captureDisplayPng() {
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
  if (isHyprlandSession()) {
    try {
      const png = await captureDisplayWithGrim(display.bounds)
      if (png.length) return png
      throw new Error('grim returned an empty image')
    } catch (error) {
      logWarning(
        ['Native Hyprland screenshot failed; trying Electron capture:', error],
        LogPrefix.Backend
      )
    }
  }
  const thumbnailSize = {
    width: Math.max(1, Math.round(display.bounds.width * display.scaleFactor)),
    height: Math.max(1, Math.round(display.bounds.height * display.scaleFactor))
  }
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize
  })
  const source =
    sources.find((item) => item.display_id === String(display.id)) ?? sources[0]
  if (!source || source.thumbnail.isEmpty()) {
    throw new Error(
      'No screen image was returned by the desktop capture service'
    )
  }
  return source.thumbnail.toPNG()
}

type HyprlandBind = {
  key?: string
  modmask?: number
  description?: string
}

function toHyprlandAccelerator(accelerator: string) {
  const parts = accelerator
    .split('+')
    .map((part) => part.trim())
    .filter(Boolean)
  const rawKey = parts.pop()
  if (!rawKey || !/^[A-Za-z0-9_ -]+$/.test(rawKey)) return undefined

  const modifierMap: Record<string, { name: string; mask: number }> = {
    commandorcontrol: { name: 'CTRL', mask: 4 },
    command: { name: 'SUPER', mask: 64 },
    control: { name: 'CTRL', mask: 4 },
    ctrl: { name: 'CTRL', mask: 4 },
    alt: { name: 'ALT', mask: 8 },
    option: { name: 'ALT', mask: 8 },
    shift: { name: 'SHIFT', mask: 1 },
    super: { name: 'SUPER', mask: 64 },
    meta: { name: 'SUPER', mask: 64 }
  }
  const modifiers = parts.map((part) => modifierMap[part.toLowerCase()])
  if (modifiers.some((modifier) => !modifier)) return undefined

  const keyAliases: Record<string, string> = {
    Esc: 'Escape',
    Up: 'UP',
    Down: 'DOWN',
    Left: 'LEFT',
    Right: 'RIGHT',
    PrintScreen: 'Print'
  }
  const key = keyAliases[rawKey] ?? rawKey
  return {
    keys: [...modifiers.map((modifier) => modifier.name), key].join(' + '),
    key,
    modmask: modifiers.reduce((mask, modifier) => mask | modifier.mask, 0)
  }
}

function getHyprlandBinds(): HyprlandBind[] {
  const output = execFileSync('hyprctl', ['binds', '-j'], {
    encoding: 'utf8',
    timeout: 2_000
  })
  return JSON.parse(output) as HyprlandBind[]
}

function unregisterHyprlandHotkey() {
  if (!hyprlandKeys) return
  try {
    execFileSync(
      'hyprctl',
      ['eval', `hl.unbind(${JSON.stringify(hyprlandKeys)})`],
      { encoding: 'utf8', timeout: 2_000 }
    )
  } catch (error) {
    logWarning(
      ['Could not remove the Hyprland screenshot shortcut:', error],
      LogPrefix.Backend
    )
  }
  hyprlandKeys = ''
  hyprlandAccelerator = ''
}

function registerHyprlandHotkey(accelerator: string) {
  if (!isHyprlandSession()) return false
  const parsed = toHyprlandAccelerator(accelerator)
  if (!parsed) {
    throw new Error(`The shortcut ${accelerator} is not supported by Hyprland`)
  }

  let binds = getHyprlandBinds()
  const stale = binds.some(
    (bind) =>
      bind.description === HYPRLAND_BIND_DESCRIPTION &&
      bind.key?.toUpperCase() === parsed.key.toUpperCase() &&
      bind.modmask === parsed.modmask
  )
  if (stale) {
    execFileSync(
      'hyprctl',
      ['eval', `hl.unbind(${JSON.stringify(parsed.keys)})`],
      { encoding: 'utf8', timeout: 2_000 }
    )
    binds = getHyprlandBinds()
  }

  const conflict = binds.some(
    (bind) =>
      bind.key?.toUpperCase() === parsed.key.toUpperCase() &&
      bind.modmask === parsed.modmask
  )
  if (conflict) throw new Error(`The shortcut ${accelerator} is already in use`)

  const command = `kill -USR2 ${process.pid}`
  const expression = `hl.bind(${JSON.stringify(
    parsed.keys
  )}, hl.dsp.exec_cmd(${JSON.stringify(command)}), { non_consuming = true, dont_inhibit = true, allow_input_capture = true, description = ${JSON.stringify(
    HYPRLAND_BIND_DESCRIPTION
  )} })`
  execFileSync('hyprctl', ['eval', expression], {
    encoding: 'utf8',
    timeout: 2_000
  })

  const registered = getHyprlandBinds().some(
    (bind) =>
      bind.description === HYPRLAND_BIND_DESCRIPTION &&
      bind.key?.toUpperCase() === parsed.key.toUpperCase() &&
      bind.modmask === parsed.modmask
  )
  if (!registered) throw new Error('Hyprland did not retain the shortcut')
  hyprlandKeys = parsed.keys
  hyprlandAccelerator = accelerator
  return true
}

function shortcutPressed(accelerator: string, source: string) {
  logInfo(
    `Collection screenshot shortcut ${accelerator} pressed via ${source}`,
    LogPrefix.Backend
  )
  void captureActiveGameScreenshot()
}

export async function captureActiveGameScreenshot(): Promise<CollectionScreenshotCaptureResult> {
  const settings = getCollectionSettings().screenshots
  if (!settings.captureEnabled) return { ok: false, skippedReason: 'disabled' }
  const game = currentGame()
  if (!game) return { ok: false, skippedReason: 'no-active-game' }
  if (!settings.folder.trim()) {
    return { ok: false, skippedReason: 'folder-not-configured' }
  }
  if (captureBusy) return { ok: false, skippedReason: 'busy' }

  captureBusy = true
  try {
    const root = resolve(settings.folder)
    await mkdir(root, { recursive: true })
    const folder = captureFolder(game, root)
    await mkdir(folder, { recursive: true })
    const target = uniqueScreenshotPath(folder)
    const temporary = join(
      folder,
      `.${sanitize(game.appName) || 'game'}-capture.tmp`
    )
    const png = await captureDisplayPng()
    await writeFile(temporary, png)
    await rename(temporary, target)
    sendFrontendMessage('collectionScreenshotSaved', {
      appName: game.appName,
      runner: game.runner,
      path: target
    })
    logInfo(`Collection screenshot saved to ${target}`, LogPrefix.Backend)
    await showScreenshotSavedFeedback(game, target)
    return { ok: true, path: target }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logError(
      ['Collection screenshot capture failed:', error],
      LogPrefix.Backend
    )
    await showScreenshotNotification(
      t('notify.screenshot.failedTitle'),
      t('notify.screenshot.failedBody', { error: message })
    )
    return {
      ok: false,
      skippedReason: 'capture-unavailable',
      error: message
    }
  } finally {
    captureBusy = false
  }
}

export function configureScreenshotCaptureHotkey(): CollectionScreenshotCaptureStatus {
  unregisterHyprlandHotkey()
  if (registeredAccelerator) {
    globalShortcut.unregister(registeredAccelerator)
    registeredAccelerator = ''
  }
  registrationError = ''

  const settings = getCollectionSettings().screenshots
  if (!settings.captureEnabled || !currentGame()) {
    return getScreenshotCaptureStatus()
  }

  try {
    logInfo(
      `Registering Collection screenshot shortcut ${settings.captureAccelerator}`,
      LogPrefix.Backend
    )
    if (registerHyprlandHotkey(settings.captureAccelerator)) {
      lastNotifiedRegistrationError = ''
      logInfo(
        `Collection screenshot shortcut ${settings.captureAccelerator} registered through Hyprland`,
        LogPrefix.Backend
      )
      return getScreenshotCaptureStatus()
    }
    const registered = globalShortcut.register(
      settings.captureAccelerator,
      () => shortcutPressed(settings.captureAccelerator, 'Electron')
    )
    if (registered) {
      registeredAccelerator = settings.captureAccelerator
      lastNotifiedRegistrationError = ''
      logInfo(
        `Collection screenshot shortcut ${settings.captureAccelerator} registered`,
        LogPrefix.Backend
      )
    } else {
      registrationError = `The shortcut ${settings.captureAccelerator} is unavailable`
      logError(registrationError, LogPrefix.Backend)
      notifyRegistrationFailure(registrationError)
    }
  } catch (error) {
    registrationError = error instanceof Error ? error.message : String(error)
    logError(
      ['Collection screenshot shortcut registration failed:', error],
      LogPrefix.Backend
    )
    notifyRegistrationFailure(registrationError)
  }
  return getScreenshotCaptureStatus()
}

export function getScreenshotCaptureStatus(): CollectionScreenshotCaptureStatus {
  const game = currentGame()
  const accelerator = getCollectionSettings().screenshots.captureAccelerator
  return {
    registered:
      Boolean(hyprlandAccelerator) ||
      (Boolean(registeredAccelerator) &&
        globalShortcut.isRegistered(registeredAccelerator)),
    accelerator,
    activeGame: game
      ? { appName: game.appName, runner: game.runner, title: game.title }
      : undefined,
    error: registrationError || undefined
  }
}

export function beginScreenshotCaptureSession(args: {
  appName: string
  runner: Runner
  title: string
}) {
  const meta = getLocalGameMeta(args.appName)
  const metadata = getGameMetadata(
    args.runner === 'zoom' ? 'sideload' : args.runner,
    args.appName
  )
  const title = metadata?.title?.trim() || meta?.title?.trim() || args.title
  activeGames.set(gameKey(args.appName, args.runner), {
    appName: args.appName,
    runner: args.runner,
    title,
    aliases: [
      ...new Set(
        [args.title, meta?.title, metadata?.title].filter(Boolean) as string[]
      )
    ],
    steamAppId: meta?.steamAppId,
    startedAt: Date.now()
  })
  logInfo(
    `Collection screenshot session started for ${title} (${args.runner}:${args.appName})`,
    LogPrefix.Backend
  )
  configureScreenshotCaptureHotkey()
}

export function endScreenshotCaptureSession(args: {
  appName: string
  runner: Runner
}) {
  activeGames.delete(gameKey(args.appName, args.runner))
  logInfo(
    `Collection screenshot session ended for ${args.runner}:${args.appName}`,
    LogPrefix.Backend
  )
  configureScreenshotCaptureHotkey()
}

export function initScreenshotCaptureService() {
  if (initialized) return
  initialized = true
  const handleNativeShortcut = () => {
    if (hyprlandAccelerator && currentGame()) {
      shortcutPressed(hyprlandAccelerator, 'Hyprland')
    }
  }
  if (process.platform !== 'win32') {
    process.on('SIGUSR2', handleNativeShortcut)
  }
  if (portalDesktopName) {
    logInfo(
      `Collection screenshot portal identity: ${portalDesktopName}`,
      LogPrefix.Backend
    )
  }
  if (app.isReady()) {
    configureScreenshotCaptureHotkey()
  } else {
    void app.whenReady().then(() => configureScreenshotCaptureHotkey())
  }
  app.once('will-quit', () => {
    unregisterHyprlandHotkey()
    if (registeredAccelerator) {
      globalShortcut.unregister(registeredAccelerator)
    }
    if (process.platform !== 'win32') {
      process.off('SIGUSR2', handleNativeShortcut)
    }
  })
}

export function prepareScreenshotCaptureService() {
  if (process.platform === 'linux') {
    const override = process.env.HEROIC_DESKTOP_NAME?.trim()
    const isHeroniteInstall = process.execPath
      .split('/')
      .some((part) => part.toLowerCase() === 'heronite')
    portalDesktopName =
      override || (isHeroniteInstall ? 'com.heronite.launcher.desktop' : '')
    if (portalDesktopName) app.setDesktopName(portalDesktopName)
    app.commandLine.appendSwitch('enable-features', 'GlobalShortcutsPortal')
  }
}
