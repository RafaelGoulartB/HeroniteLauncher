import type { LocalGameMeta } from 'common/types/local-library'

export function emulatorNeedsRomPick(meta?: LocalGameMeta) {
  return meta?.launchKind === 'emulator' && (meta.roms?.length ?? 0) > 1
}

export async function prepareEmulatorLaunch(appName: string, romPath?: string) {
  if (!romPath) return
  await window.api.localLibrary.setEmulatorLaunchRom({ appName, romPath })
}
