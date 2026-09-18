import { execFile } from 'child_process'
import { existsSync, readdirSync } from 'graceful-fs'
import { homedir } from 'os'
import { dirname, join } from 'path'
import { promisify } from 'util'
import { searchForExecutableOnPath } from 'backend/utils/os/path'
import type {
  DetectedEmulator,
  DetectedEmulatorProfile,
  EmulatorLaunchKind
} from 'common/types/local-library'
import { EMULATOR_DEFINITIONS, getEmulatorDefinition } from './catalog'
import { listUserEmulators } from './store'

const execFileAsync = promisify(execFile)

function unique(values: Array<string | undefined>) {
  return [...new Set(values.filter((item): item is string => Boolean(item)))]
}

async function isFlatpakInstalled(id: string): Promise<boolean> {
  try {
    await execFileAsync('flatpak', ['info', id], { timeout: 8000 })
    return true
  } catch {
    return false
  }
}

function coreFileName(core: string) {
  return core.endsWith('.so') ? core : `${core}.so`
}

function retroArchCoreDirs(installDir?: string): string[] {
  const home = homedir()
  return unique([
    installDir ? join(installDir, 'cores') : undefined,
    join(home, '.config', 'retroarch', 'cores'),
    join(
      home,
      '.local',
      'share',
      'flatpak',
      'exports',
      'share',
      'libretro',
      'cores'
    ),
    '/usr/lib/libretro',
    '/usr/lib64/libretro',
    '/usr/lib/x86_64-linux-gnu/libretro',
    '/usr/share/libretro/cores',
    '/var/lib/flatpak/app/org.libretro.RetroArch/current/active/files/lib/libretro'
  ])
}

function findCorePath(core: string, installDir?: string): string | undefined {
  const fileName = coreFileName(core)
  for (const dir of retroArchCoreDirs(installDir)) {
    const full = join(dir, fileName)
    if (existsSync(full)) return full
  }
  return undefined
}

function existingProfiles(
  definitionId: string,
  executable: string,
  launchKind: EmulatorLaunchKind
): DetectedEmulatorProfile[] {
  const definition = getEmulatorDefinition(definitionId)
  if (!definition) return []
  const installDir = launchKind === 'flatpak' ? undefined : dirname(executable)
  const results: DetectedEmulatorProfile[] = []
  for (const profile of definition.profiles) {
    const corePath = profile.core
      ? findCorePath(profile.core, installDir)
      : undefined
    if (profile.core && !corePath) continue
    results.push({
      id: profile.id,
      name: profile.name,
      platformName: profile.platformName,
      corePath
    })
  }
  return results
}

export async function detectEmulators(): Promise<DetectedEmulator[]> {
  const existing = listUserEmulators()
  const found: DetectedEmulator[] = []

  for (const definition of EMULATOR_DEFINITIONS) {
    if (definition.id === 'custom') continue

    let executable: string | undefined
    let launchKind: EmulatorLaunchKind = 'native'
    let flatpakId: string | undefined

    for (const binary of definition.binaries) {
      const path = await searchForExecutableOnPath(binary)
      if (path) {
        executable = path
        break
      }
    }

    if (!executable && definition.flatpakId) {
      if (await isFlatpakInstalled(definition.flatpakId)) {
        executable = 'flatpak'
        launchKind = 'flatpak'
        flatpakId = definition.flatpakId
      }
    }

    if (!executable) continue

    const profiles = existingProfiles(definition.id, executable, launchKind)
    if (!profiles.length) continue

    found.push({
      definitionId: definition.id,
      name: definition.name,
      executable,
      launchKind,
      flatpakId,
      profiles,
      alreadyAdded: existing.some(
        (item) =>
          item.definitionId === definition.id &&
          item.executable === executable &&
          (item.flatpakId ?? '') === (flatpakId ?? '')
      )
    })
  }

  return found
}

export function attachDetectedCores(
  definitionId: string,
  executable: string,
  launchKind: EmulatorLaunchKind
): DetectedEmulatorProfile[] {
  return existingProfiles(definitionId, executable, launchKind)
}

export function listCorePaths(installDir?: string): string[] {
  const files: string[] = []
  for (const dir of retroArchCoreDirs(installDir)) {
    if (!existsSync(dir)) continue
    try {
      for (const name of readdirSync(dir)) {
        if (name.endsWith('_libretro.so')) files.push(join(dir, name))
      }
    } catch {
      // ignore unreadable core dirs
    }
  }
  return files
}
