import { cp } from 'fs/promises'
import { existsSync, mkdirSync, rmSync, statSync } from 'graceful-fs'
import { join, relative, resolve, sep } from 'path'
import { logError, logInfo, LogPrefix } from 'backend/logger'
import { appFolder } from 'backend/constants/paths'
import type {
  CollectionBackupResult,
  CollectionBackupSettings
} from 'common/types/local-library'
import { getCollectionSettings, recordCollectionBackup } from './settings'

const SKIP_NAMES = new Set([
  'Cache',
  'Code Cache',
  'GPUCache',
  'DawnWebGPUCache',
  'DawnGraphiteCache',
  'Partitions',
  'images-cache',
  'tools',
  'store_cache',
  'Session Storage',
  'Service Worker',
  'Shared Dictionary',
  'WebStorage',
  'Crashpad',
  'blob_storage',
  'Dictionaries',
  'Local Extension Settings',
  'IndexedDB',
  'Network Persistent State',
  'TransportSecurity',
  'Cookies',
  'Cookies-journal',
  'Preferences',
  'SingletonLock',
  'SingletonCookie',
  'SingletonSocket',
  'lockfile'
])

let backupRunning = false

function localDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function isBackupDue(
  backup: CollectionBackupSettings,
  now = new Date()
): boolean {
  if (!backup.folder.trim()) return false
  if (!backup.lastBackupAt) return true
  const last = new Date(backup.lastBackupAt)
  if (Number.isNaN(last.getTime())) return true

  if (backup.interval === 'daily') {
    return localDateKey(now) !== localDateKey(last)
  }
  if (backup.interval === 'weekly') {
    return now.getTime() - last.getTime() >= 7 * 24 * 60 * 60 * 1000
  }
  return (
    now.getFullYear() !== last.getFullYear() ||
    now.getMonth() !== last.getMonth()
  )
}

function shouldCopy(sourceRoot: string, src: string): boolean {
  const rel = relative(sourceRoot, src)
  if (!rel || rel === '.') return true
  return !rel.split(sep).some((part) => SKIP_NAMES.has(part))
}

function assertSafeDestination(sourceRoot: string, destination: string) {
  const source = resolve(sourceRoot)
  const dest = resolve(destination)
  if (dest === source || dest.startsWith(`${source}${sep}`)) {
    throw new Error(
      'Backup folder cannot be inside the Heroic config directory'
    )
  }
}

async function copyHeroicConfig(destination: string) {
  if (!existsSync(appFolder)) {
    throw new Error('Heroic config folder was not found')
  }
  assertSafeDestination(appFolder, destination)
  mkdirSync(destination, { recursive: true })
  await cp(appFolder, destination, {
    recursive: true,
    force: true,
    filter: (src) => shouldCopy(appFolder, src)
  })
}

export async function runCollectionBackup(
  force = false
): Promise<CollectionBackupResult> {
  const { backup } = getCollectionSettings()
  const folder = backup.folder.trim()
  if (!folder) {
    return { ran: false, skippedReason: 'disabled' }
  }
  if (!force && !isBackupDue(backup)) {
    return { ran: false, skippedReason: 'not-due' }
  }
  if (backupRunning) {
    return { ran: false, skippedReason: 'already-running' }
  }

  backupRunning = true
  const now = new Date()
  const destination = join(folder, `heroic-${localDateKey(now)}`)

  try {
    if (existsSync(destination)) {
      rmSync(destination, { recursive: true, force: true })
    }
    if (existsSync(folder) && !statSync(folder).isDirectory()) {
      throw new Error('Backup path is not a folder')
    }
    assertSafeDestination(appFolder, folder)
    mkdirSync(folder, { recursive: true })
    await copyHeroicConfig(destination)
    recordCollectionBackup({ at: now.toISOString(), path: destination })
    logInfo(`Collection backup saved to ${destination}`, LogPrefix.Backend)
    return { ran: true, path: destination }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    recordCollectionBackup({ at: now.toISOString(), error: message })
    logError(`Collection backup failed: ${message}`, LogPrefix.Backend)
    return { ran: false, error: message }
  } finally {
    backupRunning = false
  }
}

export async function maybeRunScheduledBackup() {
  const result = await runCollectionBackup(false)
  if (result.error) {
    logError(
      `Scheduled Collection backup failed: ${result.error}`,
      LogPrefix.Backend
    )
  }
}
