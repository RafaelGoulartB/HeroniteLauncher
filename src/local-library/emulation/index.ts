import type {
  DetectedEmulator,
  EmulationState,
  RomScanImportArgs,
  RomScanImportResult,
  RomScanPreview,
  RomScanner,
  UpsertRomScannerArgs,
  UpsertUserEmulatorArgs,
  UserEmulator
} from 'common/types/local-library'
import { getEmulatorDefinitions } from './catalog'
import { detectEmulators } from './detect'
import { importScannedRoms, runAutoRomScanners } from './import-roms'
import { previewRomScan } from './scan'
import {
  listRomScanners,
  listUserEmulators,
  removeRomScanner,
  removeUserEmulator,
  upsertRomScanner,
  upsertUserEmulator
} from './store'
import { upsertLocalGameMeta, getLocalGameMeta } from '../stores'

export async function getEmulationState(
  refreshDetect = true
): Promise<EmulationState> {
  return {
    catalog: getEmulatorDefinitions().filter((item) => item.id !== 'custom'),
    emulators: listUserEmulators(),
    scanners: listRomScanners(),
    detected: refreshDetect ? await detectEmulators() : []
  }
}

export async function addDetectedEmulators(): Promise<UserEmulator[]> {
  const detected = await detectEmulators()
  const current = listUserEmulators()
  for (const item of detected) {
    const existing = current.find(
      (emulator) =>
        emulator.definitionId === item.definitionId &&
        emulator.executable === item.executable &&
        (emulator.flatpakId ?? '') === (item.flatpakId ?? '')
    )
    const definitionProfiles = getEmulatorDefinitions().find(
      (def) => def.id === item.definitionId
    )?.profiles
    const incoming = item.profiles.map((profile) => {
      const catalog = definitionProfiles?.find(
        (entry) => entry.id === profile.id
      )
      return {
        id: profile.id,
        definitionProfileId: profile.id,
        name: profile.name,
        platformId: catalog?.platformId,
        platformName: profile.platformName,
        arguments: catalog?.arguments ?? '{ImagePath}',
        extensions: catalog?.extensions ?? [],
        corePath: profile.corePath,
        folderIndicator: catalog?.folderIndicator,
        playlistExtensions: catalog?.playlistExtensions,
        workingDir: catalog?.workingDir
      }
    })
    const profiles = existing
      ? [
          ...existing.profiles.map((profile) => {
            const fresh = incoming.find(
              (item) => item.definitionProfileId === profile.definitionProfileId
            )
            return fresh ? { ...profile, corePath: fresh.corePath } : profile
          }),
          ...incoming.filter(
            (profile) =>
              !existing.profiles.some(
                (item) =>
                  item.definitionProfileId === profile.definitionProfileId
              )
          )
        ]
      : incoming
    upsertUserEmulator({
      id: existing?.id,
      definitionId: item.definitionId,
      name: existing?.name || item.name,
      executable: item.executable,
      launchKind: item.launchKind,
      flatpakId: item.flatpakId,
      profiles
    })
  }
  return listUserEmulators()
}

export function saveUserEmulator(args: UpsertUserEmulatorArgs): UserEmulator {
  return upsertUserEmulator(args)
}

export function deleteUserEmulator(id: string): UserEmulator[] {
  return removeUserEmulator(id)
}

export function saveRomScanner(args: UpsertRomScannerArgs): RomScanner {
  return upsertRomScanner(args)
}

export function deleteRomScanner(id: string): RomScanner[] {
  return removeRomScanner(id)
}

export function scanRomsPreview(args: {
  emulatorId: string
  profileId: string
  directory: string
  scanSubfolders?: boolean
  mergeRelatedFiles?: boolean
}): RomScanPreview {
  return previewRomScan(args)
}

export async function importRoms(
  args: RomScanImportArgs
): Promise<RomScanImportResult> {
  return importScannedRoms(args)
}

export async function autoScanRomFolders(): Promise<number> {
  return runAutoRomScanners()
}

export function setEmulatorLaunchRom(args: {
  appName: string
  romPath: string
}) {
  const meta = getLocalGameMeta(args.appName)
  if (!meta) return undefined
  const next = { ...meta, selectedRomPath: args.romPath }
  upsertLocalGameMeta(next)
  return next
}

export type { DetectedEmulator }
