import { existsSync, readdirSync, readFileSync, statSync } from 'graceful-fs'
import { basename, dirname, extname, join, resolve } from 'path'
import type {
  LocalGameRom,
  RomScanItem,
  RomScanPreview,
  UserEmulator,
  UserEmulatorProfile
} from 'common/types/local-library'
import { getAllLocalGameMeta } from '../stores'
import { romDiscLabel, titleFromRomPath } from './names'
import {
  getUserEmulator,
  getUserProfile,
  resolveProfileTemplate
} from './store'

const SKIP_DIRS = new Set([
  'bios',
  'firmware',
  'saves',
  'save',
  'savestates',
  'states',
  'cheats',
  'sysdata',
  'sys',
  'system',
  '.git',
  'media',
  'manuals'
])

function normalizePath(value: string) {
  return resolve(value).replaceAll('\\', '/').replace(/\/+$/, '').toLowerCase()
}

function extensionOf(filePath: string) {
  return extname(filePath).replace(/^\./, '').toLowerCase()
}

function importedRomPaths(emulatorId: string, profileId: string) {
  const paths = new Set<string>()
  for (const meta of Object.values(getAllLocalGameMeta())) {
    if (meta.emulatorId !== emulatorId) continue
    if (meta.emulatorProfileId && meta.emulatorProfileId !== profileId) continue
    for (const rom of meta.roms ?? []) {
      paths.add(normalizePath(rom.path))
    }
  }
  return paths
}

function readPlaylistFiles(filePath: string): string[] {
  const ext = extensionOf(filePath)
  const dir = dirname(filePath)
  const text = readFileSync(filePath, 'utf8')
  if (ext === 'cue') {
    return [...text.matchAll(/FILE\s+"([^"]+)"/gi)].map((match) =>
      join(dir, match[1])
    )
  }
  if (ext === 'gdi') {
    return [...text.matchAll(/"([^"]+)"/g)].map((match) => join(dir, match[1]))
  }
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => (line.startsWith('/') ? line : join(dir, line)))
}

function walkFiles(
  directory: string,
  scanSubfolders: boolean,
  acc: string[] = [],
  depth = 0
): string[] {
  let entries: string[]
  try {
    entries = readdirSync(directory)
  } catch {
    return acc
  }
  for (const name of entries) {
    if (name.startsWith('.')) continue
    const full = join(directory, name)
    let stat
    try {
      stat = statSync(full)
    } catch {
      continue
    }
    if (stat.isDirectory()) {
      if (!scanSubfolders && depth > 0) continue
      if (SKIP_DIRS.has(name.toLowerCase())) continue
      walkFiles(full, scanSubfolders, acc, depth + 1)
      continue
    }
    if (stat.isFile()) acc.push(full)
  }
  return acc
}

function walkFoldersWithIndicator(
  directory: string,
  indicator: string,
  scanSubfolders: boolean,
  acc: string[] = [],
  depth = 0
): string[] {
  let entries: string[]
  try {
    entries = readdirSync(directory)
  } catch {
    return acc
  }
  const wanted = indicator.toLowerCase()
  const hasIndicator = entries.some((name) => name.toLowerCase() === wanted)
  if (hasIndicator) {
    const file = entries.find((name) => name.toLowerCase() === wanted)
    if (file) acc.push(join(directory, file))
    return acc
  }
  if (!scanSubfolders && depth > 0) return acc
  for (const name of entries) {
    if (name.startsWith('.') || SKIP_DIRS.has(name.toLowerCase())) continue
    const full = join(directory, name)
    try {
      if (statSync(full).isDirectory()) {
        walkFoldersWithIndicator(
          full,
          indicator,
          scanSubfolders,
          acc,
          depth + 1
        )
      }
    } catch {
      continue
    }
  }
  return acc
}

function toScanItem(
  title: string,
  roms: LocalGameRom[],
  imported: Set<string>
): RomScanItem {
  const alreadyImported = roms.every((rom) =>
    imported.has(normalizePath(rom.path))
  )
  return {
    title,
    roms,
    alreadyImported,
    import: !alreadyImported
  }
}

export function scanRomDirectory(args: {
  emulator: UserEmulator
  profile: UserEmulatorProfile
  directory: string
  scanSubfolders?: boolean
  mergeRelatedFiles?: boolean
}): RomScanPreview {
  const directory = resolve(args.directory)
  const template = resolveProfileTemplate(args.emulator, args.profile)
  const errors: string[] = []
  if (!existsSync(directory)) {
    return {
      emulatorId: args.emulator.id,
      emulatorName: args.emulator.name,
      profileId: args.profile.id,
      profileName: args.profile.name,
      platformName: template.platformName,
      directory,
      games: [],
      errors: [`Folder does not exist: ${directory}`]
    }
  }

  const extensions = new Set(
    template.extensions.map((item) => item.replace(/^\./, '').toLowerCase())
  )
  const playlists = new Set(
    (template.playlistExtensions ?? ['cue', 'm3u', 'gdi']).map((item) =>
      item.toLowerCase()
    )
  )
  const imported = importedRomPaths(args.emulator.id, args.profile.id)
  const skipChildren = new Set<string>()
  const files = template.folderIndicator
    ? walkFoldersWithIndicator(
        directory,
        template.folderIndicator,
        args.scanSubfolders !== false
      )
    : walkFiles(directory, args.scanSubfolders !== false)

  const candidates: Array<{ path: string; title: string }> = []
  for (const filePath of files) {
    const ext = extensionOf(filePath)
    if (playlists.has(ext) && extensions.has(ext)) {
      try {
        for (const child of readPlaylistFiles(filePath)) {
          skipChildren.add(normalizePath(child))
        }
      } catch {
        errors.push(`Could not read playlist ${filePath}`)
      }
    }
    if (!extensions.has(ext) && !template.folderIndicator) continue
    candidates.push({
      path: filePath,
      title: titleFromRomPath(basename(filePath))
    })
  }

  const filtered = candidates.filter(
    (item) => !skipChildren.has(normalizePath(item.path))
  )

  const groups = new Map<string, LocalGameRom[]>()
  for (const item of filtered) {
    const disc = romDiscLabel(basename(item.path).replace(/\.[^.]+$/, ''))
    const rom: LocalGameRom = {
      name: disc || item.title,
      path: item.path
    }
    const key =
      args.mergeRelatedFiles !== false ? item.title.toLowerCase() : item.path
    const list = groups.get(key) ?? []
    list.push(rom)
    groups.set(key, list)
  }

  const games = [...groups.entries()]
    .map(([, roms]) =>
      toScanItem(titleFromRomPath(basename(roms[0].path)), roms, imported)
    )
    .sort((a, b) => a.title.localeCompare(b.title))

  return {
    emulatorId: args.emulator.id,
    emulatorName: args.emulator.name,
    profileId: args.profile.id,
    profileName: args.profile.name,
    platformName: template.platformName,
    directory,
    games,
    errors
  }
}

export function previewRomScan(args: {
  emulatorId: string
  profileId: string
  directory: string
  scanSubfolders?: boolean
  mergeRelatedFiles?: boolean
}): RomScanPreview {
  const emulator = getUserEmulator(args.emulatorId)
  if (!emulator) {
    return {
      emulatorId: args.emulatorId,
      emulatorName: '',
      profileId: args.profileId,
      profileName: '',
      directory: args.directory,
      games: [],
      errors: ['Emulator not found. Add it in Collection settings first.']
    }
  }
  const profile = getUserProfile(emulator, args.profileId)
  if (!profile) {
    return {
      emulatorId: emulator.id,
      emulatorName: emulator.name,
      profileId: args.profileId,
      profileName: '',
      directory: args.directory,
      games: [],
      errors: ['Emulator profile not found.']
    }
  }
  return scanRomDirectory({
    emulator,
    profile,
    directory: args.directory,
    scanSubfolders: args.scanSubfolders,
    mergeRelatedFiles: args.mergeRelatedFiles
  })
}
