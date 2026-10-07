import { existsSync } from 'graceful-fs'
import { mkdir, open, readdir, readFile, writeFile } from 'fs/promises'
import { homedir, tmpdir } from 'os'
import { basename, dirname, extname, join } from 'path'
import type {
  EmulatorSaveState,
  EmulatorSaveStateKind,
  UserEmulator
} from 'common/types/local-library'
import {
  readNintendoDiscId,
  readPlayStationSerial,
  readPs3TitleId,
  readPspDiscId,
  serialFromGameListCache
} from './disc-id'
import {
  flatpakDir,
  iniValue,
  readIni,
  readZipEntry,
  resolveConfiguredDir,
  xdgConfigHome,
  xdgDataHome
} from './save-state-files'

// Per-emulator knowledge for Collection save states: where the files live,
// how a ROM maps to the file names, and the CLI that boots into one.
// Emulators without a CLI way to load a state at boot (melonDS, Azahar, Cemu,
// Ryujinx, Vita3K, shadPS4, xemu) are intentionally absent.

export type EngineContext = {
  emulator: UserEmulator
  /** Emulator binary on the host; undefined for Flatpak installs. */
  executable?: string
  flatpakId?: string
  /** RetroArch core of the game's profile. */
  corePath?: string
}

export type ParsedState = {
  key: string
  kind: EmulatorSaveStateKind
  /** Slot number as the emulator's own menu shows it. */
  slot?: number
}

export type LaunchStateArgs = {
  args: string[]
  /** The state boots the game by itself; drop the ROM path from argv. */
  replacesImage?: boolean
}

export type SaveStateEngine = {
  /** Directories that hold state files for these keys / this ROM. */
  stateDirs: (
    ctx: EngineContext,
    target: { romPath: string; keys: string[] }
  ) => Promise<string[]>
  /** Keys the emulator uses in state file names for this ROM. */
  romKeys: (ctx: EngineContext, romPath: string) => Promise<string[]>
  /** Serial-keyed engines learn the key from states written in a session. */
  learnsKeys: boolean
  parse: (fileName: string) => ParsedState | undefined
  loadArgs: (
    ctx: EngineContext,
    state: EmulatorSaveState
  ) => Promise<LaunchStateArgs>
  /** Arguments that stop the emulator from auto-loading a state. */
  freshArgs?: (ctx: EngineContext) => Promise<string[]>
  thumbnail?: (statePath: string) => Promise<Buffer | undefined>
}

export function unique(values: Array<string | undefined>): string[] {
  return [...new Set(values.filter((item): item is string => Boolean(item)))]
}

function romBaseName(romPath: string): string {
  const name = basename(romPath)
  return name.slice(0, name.length - extname(name).length)
}

function portableDir(
  ctx: EngineContext,
  markers: string[]
): string | undefined {
  if (!ctx.executable) return undefined
  const dir = dirname(ctx.executable)
  return markers.some((marker) => existsSync(join(dir, marker)))
    ? dir
    : undefined
}

function slotState(key: string, slot: number): ParsedState {
  return { key, kind: 'slot', slot }
}

const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a
])
const PNG_END = Buffer.from('IEND')

async function findEmbeddedPng(path: string): Promise<Buffer | undefined> {
  try {
    const handle = await open(path, 'r')
    try {
      const buffer = Buffer.alloc(4 * 1024 * 1024)
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0)
      const data = buffer.subarray(0, bytesRead)
      const start = data.indexOf(PNG_SIGNATURE)
      if (start < 0) return undefined
      const end = data.indexOf(PNG_END, start)
      if (end < 0) return undefined
      return Buffer.from(data.subarray(start, end + 8))
    } finally {
      await handle.close()
    }
  } catch {
    return undefined
  }
}

async function siblingImage(
  statePath: string,
  suffix: string
): Promise<Buffer | undefined> {
  return readFile(statePath + suffix).catch(() => undefined)
}

// --- PCSX2 -------------------------------------------------------------------
// `{Serial} ({CRC}).{NN}.p2s`, `{Serial} ({CRC}).resume.p2s` in
// inis/PCSX2.ini [Folders] Savestates. `-statefile <file>` boots and loads.

function pcsx2DataDirs(ctx: EngineContext): string[] {
  if (ctx.flatpakId) return [flatpakDir(ctx.flatpakId, 'config', 'PCSX2')]
  const portable = portableDir(ctx, ['portable.ini', 'portable.txt'])
  return portable ? [portable] : [join(xdgConfigHome(), 'PCSX2')]
}

const pcsx2: SaveStateEngine = {
  learnsKeys: true,
  async stateDirs(ctx) {
    const dirs: string[] = []
    for (const dataDir of pcsx2DataDirs(ctx)) {
      const ini = await readIni(join(dataDir, 'inis', 'PCSX2.ini'))
      dirs.push(
        resolveConfiguredDir(iniValue(ini, 'Folders', 'Savestates'), dataDir) ??
          join(dataDir, 'sstates')
      )
    }
    return dirs
  },
  async romKeys(ctx, romPath) {
    const keys: Array<string | undefined> = []
    for (const dataDir of pcsx2DataDirs(ctx)) {
      keys.push(
        await serialFromGameListCache(
          join(dataDir, 'cache', 'gamelist.cache'),
          romPath
        )
      )
    }
    keys.push(await readPlayStationSerial(romPath))
    return unique(keys)
  },
  parse(fileName) {
    const match = /^(.+?) \([0-9a-f]{8}\)\.(\d{2}|resume)\.p2s$/i.exec(fileName)
    if (!match) return undefined
    return match[2].toLowerCase() === 'resume'
      ? { key: match[1], kind: 'resume' }
      : slotState(match[1], Number(match[2]))
  },
  loadArgs: async (_ctx, state) => ({ args: ['-statefile', state.path] }),
  thumbnail: (statePath) => readZipEntry(statePath, 'Screenshot.png')
}

// --- DuckStation ---------------------------------------------------------------
// `{Serial}_{N}.sav`, `{Serial}_resume.sav` in settings.ini [Folders]
// SaveStates. The data root is $XDG_CONFIG_HOME/duckstation when that variable
// is set, otherwise ~/.local/share/duckstation. `-statefile <file>` loads.

function duckStationDataDirs(ctx: EngineContext): string[] {
  if (ctx.flatpakId) return [flatpakDir(ctx.flatpakId, 'data', 'duckstation')]
  const portable = portableDir(ctx, ['portable.txt'])
  if (portable) return [portable]
  return unique([
    process.env.XDG_CONFIG_HOME
      ? join(process.env.XDG_CONFIG_HOME, 'duckstation')
      : undefined,
    join(xdgDataHome(), 'duckstation'),
    join(homedir(), '.local', 'share', 'duckstation')
  ]).filter((dir) => existsSync(dir))
}

const duckStation: SaveStateEngine = {
  learnsKeys: true,
  async stateDirs(ctx) {
    const dirs: string[] = []
    for (const dataDir of duckStationDataDirs(ctx)) {
      const ini = await readIni(join(dataDir, 'settings.ini'))
      dirs.push(
        resolveConfiguredDir(iniValue(ini, 'Folders', 'SaveStates'), dataDir) ??
          join(dataDir, 'savestates')
      )
    }
    return dirs
  },
  async romKeys(ctx, romPath) {
    const keys: Array<string | undefined> = []
    for (const dataDir of duckStationDataDirs(ctx)) {
      keys.push(
        await serialFromGameListCache(
          join(dataDir, 'cache', 'gamelist.cache'),
          romPath
        )
      )
    }
    keys.push(await readPlayStationSerial(romPath))
    return unique(keys)
  },
  parse(fileName) {
    const match = /^(.+)_(\d+|resume)\.sav$/i.exec(fileName)
    if (!match || match[1] === 'savestate') return undefined
    return match[2].toLowerCase() === 'resume'
      ? { key: match[1], kind: 'resume' }
      : slotState(match[1], Number(match[2]))
  },
  loadArgs: async (_ctx, state) => ({ args: ['-statefile', state.path] }),
  thumbnail: (statePath) => findEmbeddedPng(statePath)
}

// --- PPSSPP --------------------------------------------------------------------
// `{DISC_ID}_{DISC_VERSION}_{slot}.ppst` (slot 0-based) with a `.jpg` next to
// it, in <memstick>/PSP/PPSSPP_STATE. `--state=<file>` loads after boot.

function ppssppStateDir(ctx: EngineContext): string {
  const memstick = ctx.flatpakId
    ? flatpakDir(ctx.flatpakId, 'config', 'ppsspp')
    : join(xdgConfigHome(), 'ppsspp')
  return join(memstick, 'PSP', 'PPSSPP_STATE')
}

const ppsspp: SaveStateEngine = {
  learnsKeys: true,
  stateDirs: async (ctx) => [ppssppStateDir(ctx)],
  romKeys: async (_ctx, romPath) => unique([await readPspDiscId(romPath)]),
  parse(fileName) {
    const match = /^([A-Z0-9]+)_[\d.]+_(\d+)\.ppst$/i.exec(fileName)
    return match ? slotState(match[1], Number(match[2]) + 1) : undefined
  },
  loadArgs: async (_ctx, state) => ({ args: [`--state=${state.path}`] }),
  thumbnail: (statePath) =>
    readFile(statePath.replace(/\.ppst$/i, '.jpg')).catch(() => undefined)
}

// --- Dolphin -------------------------------------------------------------------
// `{GameID}.s{NN}` in <user>/StateSaves. `--save_state <file>` loads at boot.

function dolphinUserDir(ctx: EngineContext): string {
  if (ctx.flatpakId) return flatpakDir(ctx.flatpakId, 'data', 'dolphin-emu')
  if (process.env.DOLPHIN_EMU_USERPATH) return process.env.DOLPHIN_EMU_USERPATH
  const legacy = join(homedir(), '.dolphin-emu')
  return existsSync(legacy) ? legacy : join(xdgDataHome(), 'dolphin-emu')
}

const dolphin: SaveStateEngine = {
  learnsKeys: true,
  stateDirs: async (ctx) => [join(dolphinUserDir(ctx), 'StateSaves')],
  romKeys: async (_ctx, romPath) => unique([await readNintendoDiscId(romPath)]),
  parse(fileName) {
    const match = /^([A-Z0-9]{6})\.s(\d{2})$/.exec(fileName)
    return match ? slotState(match[1], Number(match[2])) : undefined
  },
  loadArgs: async (_ctx, state) => ({ args: ['--save_state', state.path] })
}

// --- RetroArch -----------------------------------------------------------------
// `{rom}.state` (slot 0), `{rom}.state{N}`, `{rom}.state.auto` in
// savestate_directory, sorted into a folder per core by default.
// `-e N` loads slot N at boot (normal slot files need RetroArch 1.21+);
// the auto state needs `savestate_auto_load`, passed via --appendconfig.

function retroArchConfigDir(ctx: EngineContext): string {
  return ctx.flatpakId
    ? flatpakDir(ctx.flatpakId, 'config', 'retroarch')
    : join(xdgConfigHome(), 'retroarch')
}

async function retroArchCoreName(
  ctx: EngineContext
): Promise<string | undefined> {
  if (!ctx.corePath) return undefined
  const infoName = `${romBaseName(ctx.corePath)}.info`
  const configDir = retroArchConfigDir(ctx)
  const cfg = await readIni(join(configDir, 'retroarch.cfg'))
  for (const dir of unique([
    resolveConfiguredDir(iniValue(cfg, '', 'libretro_info_path'), configDir),
    join(configDir, 'cores'),
    join(configDir, 'info'),
    dirname(ctx.corePath),
    '/usr/share/libretro/info',
    '/usr/lib/libretro'
  ])) {
    const info = await readIni(join(dir, infoName))
    const name = iniValue(info, '', 'corename')
    if (name) return name
  }
  return undefined
}

// Flatpak RetroArch cannot read the host /tmp; use the app's own cache folder.
async function retroArchAppendConfig(
  ctx: EngineContext,
  autoLoad: boolean
): Promise<string> {
  const dir = ctx.flatpakId
    ? join(homedir(), '.var', 'app', ctx.flatpakId, 'cache')
    : tmpdir()
  await mkdir(dir, { recursive: true })
  const file = join(dir, `heronite-retroarch-autoload-${autoLoad}.cfg`)
  await writeFile(file, `savestate_auto_load = "${autoLoad}"\n`)
  return file
}

const retroArch: SaveStateEngine = {
  learnsKeys: false,
  async stateDirs(ctx) {
    const configDir = retroArchConfigDir(ctx)
    const cfg = await readIni(join(configDir, 'retroarch.cfg'))
    const root =
      resolveConfiguredDir(
        iniValue(cfg, '', 'savestate_directory')?.replace(/^:/, configDir),
        configDir
      ) ?? join(configDir, 'states')
    const coreName = await retroArchCoreName(ctx)
    if (coreName && existsSync(join(root, coreName))) {
      return [root, join(root, coreName)]
    }
    const children = await readdir(root, { withFileTypes: true }).catch(
      () => []
    )
    return [
      root,
      ...children
        .filter((entry) => entry.isDirectory())
        .map((entry) => join(root, entry.name))
    ]
  },
  romKeys: async (_ctx, romPath) => [romBaseName(romPath)],
  parse(fileName) {
    const match = /^(.+)\.state(\d*|\.auto)$/.exec(fileName)
    if (!match) return undefined
    if (match[2] === '.auto') return { key: match[1], kind: 'resume' }
    return slotState(match[1], match[2] ? Number(match[2]) : 0)
  },
  async loadArgs(ctx, state) {
    if (state.kind === 'resume') {
      const config = await retroArchAppendConfig(ctx, true)
      return { args: [`--appendconfig=${config}`] }
    }
    return { args: ['-e', String(state.slot ?? 0)] }
  },
  async freshArgs(ctx) {
    const cfg = await readIni(join(retroArchConfigDir(ctx), 'retroarch.cfg'))
    if (iniValue(cfg, '', 'savestate_auto_load') !== 'true') return []
    return [`--appendconfig=${await retroArchAppendConfig(ctx, false)}`]
  },
  thumbnail: (statePath) => siblingImage(statePath, '.png')
}

// --- mGBA ----------------------------------------------------------------------
// `{rom}.ss{N}` next to the ROM or in [ports.qt] savestatePath. ss0 is the
// auto slot that mGBA-Qt loads on boot by default (`autoload`). States are PNG
// files with the emulator data embedded. `-t <file>` loads at boot.

function mgbaConfigPath(ctx: EngineContext): string {
  return ctx.flatpakId
    ? flatpakDir(ctx.flatpakId, 'config', 'mgba', 'config.ini')
    : join(xdgConfigHome(), 'mgba', 'config.ini')
}

const mgba: SaveStateEngine = {
  learnsKeys: false,
  async stateDirs(ctx, { romPath }) {
    const ini = await readIni(mgbaConfigPath(ctx))
    const configured = resolveConfiguredDir(
      iniValue(ini, 'ports.qt', 'savestatePath'),
      dirname(romPath)
    )
    return unique([configured, dirname(romPath)])
  },
  romKeys: async (_ctx, romPath) => [romBaseName(romPath)],
  parse(fileName) {
    const match = /^(.+)\.ss(\d)$/.exec(fileName)
    if (!match) return undefined
    return match[2] === '0'
      ? { key: match[1], kind: 'resume' }
      : slotState(match[1], Number(match[2]))
  },
  loadArgs: async (_ctx, state) => ({ args: ['-t', state.path] }),
  freshArgs: async () => ['-C', 'autoload=0'],
  thumbnail: (statePath) => findEmbeddedPng(statePath)
}

// --- RPCS3 ---------------------------------------------------------------------
// `<config>/savestates/{TITLE_ID}/{TITLE_ID}_*.SAVESTAT[.zst|.gz]`.
// `--savestate <file>` boots the state instead of the game.

function rpcs3StatesRoot(ctx: EngineContext): string {
  return ctx.flatpakId
    ? flatpakDir(ctx.flatpakId, 'config', 'rpcs3', 'savestates')
    : join(xdgConfigHome(), 'rpcs3', 'savestates')
}

const rpcs3: SaveStateEngine = {
  learnsKeys: true,
  async stateDirs(ctx, { keys }) {
    const root = rpcs3StatesRoot(ctx)
    if (keys.length) return keys.map((key) => join(root, key))
    const children = await readdir(root, { withFileTypes: true }).catch(
      () => []
    )
    return children
      .filter((entry) => entry.isDirectory())
      .map((entry) => join(root, entry.name))
  },
  romKeys: async (_ctx, romPath) => unique([await readPs3TitleId(romPath)]),
  parse(fileName) {
    const match = /^([A-Z]{4}\d{5})_.*\.SAVESTAT(\.zst|\.gz)?$/i.exec(fileName)
    return match ? { key: match[1], kind: 'slot' } : undefined
  },
  loadArgs: async (_ctx, state) => ({
    args: ['--savestate', state.path],
    replacesImage: true
  })
}

export const SAVE_STATE_ENGINES: Record<string, SaveStateEngine> = {
  pcsx2,
  duckstation: duckStation,
  ppsspp,
  dolphin,
  retroarch: retroArch,
  mgba,
  rpcs3
}
