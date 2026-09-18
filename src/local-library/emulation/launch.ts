import { basename, dirname } from 'path'
import { existsSync } from 'graceful-fs'
import type LogWriter from 'backend/logger/log_writer'
import { logInfo, LogPrefix } from 'backend/logger'
import { GameConfig } from 'backend/game_config'
import { libraryStore as sideloadStore } from 'backend/storeManagers/sideload/electronStores'
import type { GameInfo } from 'common/types'
import type { LocalGameMeta } from 'common/types/local-library'
import { getEmulatorDefinition } from './catalog'
import {
  getUserEmulator,
  getUserProfile,
  resolveProfileTemplate
} from './store'
import { getLocalGameMeta, upsertLocalGameMeta } from '../stores'
import { pathExists } from '../playnite/path-remap'
import { expandArgv, varsForRom } from './variables'

export function emulatorExecutablePath(
  meta: LocalGameMeta
): string | undefined {
  const emulator = meta.emulatorId
    ? getUserEmulator(meta.emulatorId)
    : undefined
  if (emulator?.launchKind === 'flatpak') return 'flatpak'
  return emulator?.executable || meta.remappedExecutable
}

export function emulatorRomInstalled(meta: LocalGameMeta): boolean {
  if (!meta.roms?.length) return Boolean(pathExists(meta.remappedExecutable))
  return meta.roms.some((rom) => pathExists(rom.path))
}

function pickRomPath(
  meta: LocalGameMeta,
  extraArgs: string[]
): string | undefined {
  const requested = extraArgs[0] || meta.selectedRomPath
  if (requested && meta.roms?.some((rom) => rom.path === requested)) {
    return requested
  }
  if (requested && pathExists(requested)) return requested
  return meta.roms?.find((rom) => pathExists(rom.path))?.path
}

async function applySideloadLaunch(
  gameInfo: GameInfo,
  executable: string,
  launcherArgs: string
) {
  const games = sideloadStore.get('games', [])
  const index = games.findIndex((item) => item.app_name === gameInfo.app_name)
  if (index >= 0) {
    games[index] = {
      ...games[index],
      install: { ...games[index].install, executable },
      folder_name: dirname(executable)
    }
    sideloadStore.set('games', games)
  }
  const config = GameConfig.get(gameInfo.app_name)
  const settings = await config.getSettings()
  config.config = { ...settings, launcherArgs }
  config.flush()
}

export async function tryLaunchEmulatedGame(
  gameInfo: GameInfo,
  logWriter: LogWriter,
  extraArgs: string[] = []
): Promise<boolean | null> {
  const meta = getLocalGameMeta(gameInfo.app_name)
  if (!meta || meta.launchKind !== 'emulator') return null

  const emulator = meta.emulatorId
    ? getUserEmulator(meta.emulatorId)
    : undefined
  const profile = emulator
    ? getUserProfile(emulator, meta.emulatorProfileId ?? '')
    : undefined
  const template =
    emulator && profile ? resolveProfileTemplate(emulator, profile) : undefined

  const romPath = pickRomPath(meta, extraArgs)
  const executable = emulatorExecutablePath(meta)
  if (
    !executable ||
    (emulator?.launchKind !== 'flatpak' && !existsSync(executable))
  ) {
    await logWriter.logError('Emulator executable was not found')
    return false
  }
  if (meta.roms?.length && !romPath) {
    await logWriter.logError('ROM file was not found')
    return false
  }

  if (romPath && romPath !== meta.selectedRomPath) {
    upsertLocalGameMeta({ ...meta, selectedRomPath: romPath })
  }

  const vars = varsForRom({
    romPath: romPath ?? '',
    emulatorDir:
      emulator?.installDir || (executable ? dirname(executable) : ''),
    corePath: template?.corePath || profile?.corePath,
    name: meta.title
  })
  const argvTemplate = template?.arguments || meta.launcherArgs || '{ImagePath}'
  let argv = expandArgv(argvTemplate, vars)
  if (romPath) {
    for (const rom of meta.roms ?? []) {
      argv = argv.map((part) => (part === rom.path ? romPath : part))
    }
    if (!argv.includes(romPath) && !argvTemplate.includes('{Image')) {
      argv.push(romPath)
    }
  }

  const useWine =
    emulator?.launchKind === 'wine' || executable.toLowerCase().endsWith('.exe')
  if (useWine) {
    await applySideloadLaunch(gameInfo, executable, argv.join(' '))
    return null
  }

  const { callRunner } = await import('backend/launcher')
  const { sendGameStatusUpdate } = await import('backend/utils')

  let bin = executable
  let dir = dirname(executable)
  let commandParts = argv
  if (emulator?.launchKind === 'flatpak' && emulator.flatpakId) {
    bin = 'flatpak'
    dir = ''
    commandParts = ['run', emulator.flatpakId, ...argv]
  }

  logInfo(
    `Launching ${gameInfo.title} with ${emulator?.name ?? 'emulator'}`,
    LogPrefix.Backend
  )
  sendGameStatusUpdate({
    appName: gameInfo.app_name,
    runner: 'sideload',
    status: 'playing'
  })

  const cwd =
    template?.workingDir === 'rom' && romPath
      ? dirname(romPath)
      : emulator?.installDir || dir

  const result = await callRunner(
    commandParts,
    {
      name: 'sideload',
      logPrefix: LogPrefix.Sideload,
      bin,
      dir
    },
    {
      abortId: gameInfo.app_name,
      cwd,
      logWriters: [logWriter],
      logMessagePrefix: LogPrefix.Sideload
    }
  )

  if (result.error) return false
  return !result.abort
}

export async function tryStopEmulatedGame(appName: string): Promise<boolean> {
  const meta = getLocalGameMeta(appName)
  if (!meta || meta.launchKind !== 'emulator') return false
  const emulator = meta.emulatorId
    ? getUserEmulator(meta.emulatorId)
    : undefined
  const definition = emulator
    ? getEmulatorDefinition(emulator.definitionId)
    : undefined
  const pattern =
    definition?.stopPattern ||
    (emulator?.executable ? basename(emulator.executable) : undefined)
  if (!pattern) return false
  const { killPattern } = await import('backend/utils')
  killPattern(pattern)
  if (emulator?.launchKind === 'flatpak' && emulator.flatpakId) {
    killPattern(emulator.flatpakId.split('.').at(-1) ?? pattern)
  }
  return true
}
