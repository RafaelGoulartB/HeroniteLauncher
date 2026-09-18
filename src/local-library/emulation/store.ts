import { randomUUID } from 'crypto'
import Store from 'electron-store'
import type {
  RomScanner,
  UserEmulator,
  UserEmulatorProfile
} from 'common/types/local-library'
import { getDefinitionProfile, getEmulatorDefinition } from './catalog'

type EmulatorFile = {
  emulators: UserEmulator[]
}

type ScannerFile = {
  scanners: RomScanner[]
}

const emulatorFile = new Store<EmulatorFile>({
  cwd: 'local_library',
  name: 'emulators',
  defaults: { emulators: [] }
})

const scannerFile = new Store<ScannerFile>({
  cwd: 'local_library',
  name: 'rom-scanners',
  defaults: { scanners: [] }
})

export function listUserEmulators(): UserEmulator[] {
  return emulatorFile.get('emulators') ?? []
}

export function getUserEmulator(id: string): UserEmulator | undefined {
  return listUserEmulators().find((item) => item.id === id)
}

export function findUserEmulatorByPlayniteId(
  playniteId: string
): UserEmulator | undefined {
  return listUserEmulators().find((item) => item.playniteId === playniteId)
}

export function findUserEmulatorByDefinition(
  definitionId: string
): UserEmulator | undefined {
  return listUserEmulators().find((item) => item.definitionId === definitionId)
}

function writeEmulators(emulators: UserEmulator[]) {
  emulatorFile.set('emulators', emulators)
}

function defaultProfiles(
  definitionId: string,
  incoming?: UserEmulatorProfile[]
): UserEmulatorProfile[] {
  if (incoming?.length) return incoming
  const definition = getEmulatorDefinition(definitionId)
  if (!definition) {
    return [
      {
        id: randomUUID(),
        definitionProfileId: 'custom',
        name: 'Custom',
        platformId: 'other',
        platformName: 'Other',
        arguments: '{ImagePath}',
        extensions: []
      }
    ]
  }
  return definition.profiles.map((profile) => ({
    id: randomUUID(),
    definitionProfileId: profile.id,
    name: profile.name,
    platformId: profile.platformId,
    platformName: profile.platformName,
    arguments: profile.arguments,
    extensions: [...profile.extensions],
    folderIndicator: profile.folderIndicator,
    playlistExtensions: profile.playlistExtensions,
    workingDir: profile.workingDir
  }))
}

export function upsertUserEmulator(args: {
  id?: string
  definitionId: string
  name: string
  executable: string
  installDir?: string
  launchKind: UserEmulator['launchKind']
  flatpakId?: string
  playniteId?: string
  profiles?: UserEmulatorProfile[]
}): UserEmulator {
  const emulators = listUserEmulators()
  const existing = args.id
    ? emulators.find((item) => item.id === args.id)
    : args.playniteId
      ? emulators.find((item) => item.playniteId === args.playniteId)
      : args.definitionId !== 'custom'
        ? emulators.find(
            (item) =>
              item.definitionId === args.definitionId &&
              item.executable === args.executable
          )
        : undefined

  const next: UserEmulator = {
    id: existing?.id ?? args.id ?? randomUUID(),
    definitionId: args.definitionId,
    name: args.name.trim() || existing?.name || args.definitionId,
    executable: args.executable.trim(),
    installDir: args.installDir?.trim() || existing?.installDir,
    launchKind: args.launchKind,
    flatpakId: args.flatpakId || existing?.flatpakId,
    playniteId: args.playniteId || existing?.playniteId,
    profiles: defaultProfiles(
      args.definitionId,
      args.profiles ?? existing?.profiles
    )
  }

  const index = emulators.findIndex((item) => item.id === next.id)
  if (index >= 0) emulators[index] = next
  else emulators.push(next)
  writeEmulators(emulators)
  return next
}

export function removeUserEmulator(id: string): UserEmulator[] {
  const remaining = listUserEmulators().filter((item) => item.id !== id)
  writeEmulators(remaining)
  const scanners = listRomScanners().filter((item) => item.emulatorId !== id)
  scannerFile.set('scanners', scanners)
  return remaining
}

export function getUserProfile(
  emulator: UserEmulator,
  profileId: string
): UserEmulatorProfile | undefined {
  return (
    emulator.profiles.find((item) => item.id === profileId) ??
    emulator.profiles.find((item) => item.definitionProfileId === profileId) ??
    emulator.profiles[0]
  )
}

export function resolveProfileTemplate(
  emulator: UserEmulator,
  profile: UserEmulatorProfile
) {
  const catalog = getDefinitionProfile(
    emulator.definitionId,
    profile.definitionProfileId ?? ''
  )
  return {
    arguments: profile.arguments || catalog?.arguments || '{ImagePath}',
    extensions: profile.extensions.length
      ? profile.extensions
      : (catalog?.extensions ?? []),
    folderIndicator: profile.folderIndicator ?? catalog?.folderIndicator,
    playlistExtensions:
      profile.playlistExtensions ?? catalog?.playlistExtensions,
    workingDir: profile.workingDir ?? catalog?.workingDir,
    platformId: profile.platformId ?? catalog?.platformId,
    platformName: profile.platformName ?? catalog?.platformName,
    corePath: profile.corePath
  }
}

export function listRomScanners(): RomScanner[] {
  return scannerFile.get('scanners') ?? []
}

export function getRomScanner(id: string): RomScanner | undefined {
  return listRomScanners().find((item) => item.id === id)
}

export function upsertRomScanner(args: {
  id?: string
  name?: string
  emulatorId: string
  profileId: string
  directory: string
  scanSubfolders?: boolean
  mergeRelatedFiles?: boolean
  autoScanOnRefresh?: boolean
}): RomScanner {
  const scanners = listRomScanners()
  const existing =
    (args.id ? scanners.find((item) => item.id === args.id) : undefined) ??
    scanners.find(
      (item) =>
        item.emulatorId === args.emulatorId &&
        item.profileId === args.profileId &&
        item.directory === args.directory
    )
  const emulator = getUserEmulator(args.emulatorId)
  const profile = emulator
    ? getUserProfile(emulator, args.profileId)
    : undefined
  const next: RomScanner = {
    id: existing?.id ?? args.id ?? randomUUID(),
    name:
      args.name?.trim() ||
      existing?.name ||
      [emulator?.name, profile?.name].filter(Boolean).join(' · ') ||
      'ROM folder',
    emulatorId: args.emulatorId,
    profileId: args.profileId,
    directory: args.directory.trim(),
    scanSubfolders: args.scanSubfolders ?? existing?.scanSubfolders ?? true,
    mergeRelatedFiles:
      args.mergeRelatedFiles ?? existing?.mergeRelatedFiles ?? true,
    autoScanOnRefresh:
      args.autoScanOnRefresh ?? existing?.autoScanOnRefresh ?? true
  }
  const index = scanners.findIndex((item) => item.id === next.id)
  if (index >= 0) scanners[index] = next
  else scanners.push(next)
  scannerFile.set('scanners', scanners)
  return next
}

export function removeRomScanner(id: string): RomScanner[] {
  const remaining = listRomScanners().filter((item) => item.id !== id)
  scannerFile.set('scanners', remaining)
  return remaining
}
