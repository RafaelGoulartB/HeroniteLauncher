import { existsSync } from 'graceful-fs'
import type { DriveRemap } from 'common/types/local-library'

const DRIVE_RE = /^([A-Za-z]:)(.*)$/

export function extractWindowsDrive(path?: string): string | undefined {
  if (!path) return undefined
  const match = path.trim().match(DRIVE_RE)
  return match ? match[1].toUpperCase() : undefined
}

export function collectWindowsDrives(
  paths: Array<string | undefined>
): string[] {
  const drives = new Set<string>()
  for (const path of paths) {
    const drive = extractWindowsDrive(path)
    if (drive) drives.add(drive)
  }
  return [...drives].sort()
}

export function remapWindowsPath(
  path: string | undefined,
  driveMap: DriveRemap[]
): string | undefined {
  if (!path) return undefined

  const trimmed = path.trim()
  if (!trimmed) return undefined
  if (trimmed.startsWith('/') || trimmed.startsWith('~')) return trimmed

  const match = trimmed.match(DRIVE_RE)
  if (!match) return trimmed.replaceAll('\\', '/')

  const drive = match[1].toUpperCase()
  const rest = match[2].replaceAll('\\', '/')
  const mapping = driveMap.find(
    (item) => item.windowsRoot.replace(/\\+$/, '').toUpperCase() === drive
  )

  if (!mapping?.linuxPath) return undefined
  const base = mapping.linuxPath.replace(/\/+$/, '')
  return `${base}${rest}`
}

export function expandPlayniteVariables(
  value: string | undefined,
  vars: Record<string, string | undefined>
): string | undefined {
  if (!value) return undefined
  let result = value
  for (const [key, replacement] of Object.entries(vars)) {
    if (!replacement) continue
    result = result.replaceAll(`{${key}}`, replacement)
  }
  return result
}

export function pathExists(path?: string): boolean {
  return Boolean(path && existsSync(path))
}
