import type { DriveRemap, UserEmulator } from 'common/types/local-library'
import type { PlayniteEmulator } from '../playnite/reader'
import { remapWindowsPath } from '../playnite/path-remap'
import { guessDefinitionId } from './catalog'
import { findUserEmulatorByPlayniteId, upsertUserEmulator } from './store'

export function ensurePlayniteEmulator(
  playnite: PlayniteEmulator,
  driveMap: DriveRemap[]
): UserEmulator | undefined {
  const existing = findUserEmulatorByPlayniteId(playnite.id)
  const installDir = remapWindowsPath(playnite.installDir, driveMap)
  const profile = playnite.profiles[0]
  const rawExe =
    profile?.executable ?? profile?.startupExecutable ?? playnite.installDir
  const executable =
    remapWindowsPath(rawExe, driveMap) ??
    (rawExe?.startsWith('/') ? rawExe : installDir)
  if (!executable && !existing) return existing

  const definitionId = guessDefinitionId(playnite.name)
  const wine = Boolean(executable?.toLowerCase().endsWith('.exe'))
  return upsertUserEmulator({
    id: existing?.id,
    definitionId,
    name: playnite.name || definitionId,
    executable: executable || existing?.executable || '',
    installDir: installDir || existing?.installDir,
    launchKind: wine ? 'wine' : 'native',
    playniteId: playnite.id,
    profiles:
      playnite.profiles.length > 0
        ? playnite.profiles.map((item) => ({
            id: item.id || item.name || 'default',
            definitionProfileId: item.id,
            name: item.name || 'Default',
            arguments: item.arguments || item.customArguments || '{ImagePath}',
            extensions: existing?.profiles[0]?.extensions ?? []
          }))
        : existing?.profiles
  })
}
