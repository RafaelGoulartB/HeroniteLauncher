import { readdir, stat } from 'fs/promises'
import { basename, join } from 'path'
import { logInfo, LogPrefix } from 'backend/logger'
import type {
  EmulatorSaveState,
  EmulatorSaveStateList,
  LocalGameMeta,
  UserEmulator
} from 'common/types/local-library'
import { getEmulatorDefinition, guessDefinitionId } from './catalog'
import {
  getUserEmulator,
  getUserProfile,
  resolveProfileTemplate
} from './store'
import { emulatorExecutablePath, pickRomPath } from './launch'
import { getLocalGameMeta, upsertLocalGameMeta } from '../stores'
import {
  SAVE_STATE_ENGINES,
  unique,
  type EngineContext,
  type LaunchStateArgs,
  type SaveStateEngine
} from './save-state-engines'

function engineIdFor(emulator: UserEmulator): string {
  if (emulator.definitionId !== 'custom') return emulator.definitionId
  for (const hint of [
    emulator.name,
    emulator.executable ? basename(emulator.executable) : undefined,
    emulator.flatpakId
  ]) {
    const id = guessDefinitionId(hint)
    if (id !== 'custom') return id
  }
  return 'custom'
}

type Resolved = {
  meta: LocalGameMeta
  engine: SaveStateEngine
  ctx: EngineContext
  romPath: string
  emulatorName: string
}

function resolve(appName: string, romPath?: string): Resolved | undefined {
  const meta = getLocalGameMeta(appName)
  if (!meta || meta.launchKind !== 'emulator' || !meta.emulatorId) {
    return undefined
  }
  const emulator = getUserEmulator(meta.emulatorId)
  if (!emulator || emulator.launchKind === 'wine') return undefined
  const engineId = engineIdFor(emulator)
  const engine = SAVE_STATE_ENGINES[engineId]
  if (!engine) return undefined
  const rom = pickRomPath(meta, romPath ? [romPath] : [])
  if (!rom) return undefined
  const profile = getUserProfile(emulator, meta.emulatorProfileId ?? '')
  const flatpakId =
    emulator.launchKind === 'flatpak'
      ? emulator.flatpakId || getEmulatorDefinition(engineId)?.flatpakId
      : undefined
  return {
    meta,
    engine,
    romPath: rom,
    emulatorName: emulator.name,
    ctx: {
      emulator,
      flatpakId,
      executable: flatpakId ? undefined : emulatorExecutablePath(meta),
      corePath: profile
        ? resolveProfileTemplate(emulator, profile).corePath
        : undefined
    }
  }
}

function sameKey(a: string, b: string) {
  return a.toLowerCase() === b.toLowerCase()
}

type FoundState = EmulatorSaveState & { key: string }

async function collectStates(
  resolved: Resolved,
  keys: string[],
  modifiedSince?: number
): Promise<FoundState[]> {
  const { engine, ctx, romPath } = resolved
  const states: FoundState[] = []
  const seen = new Set<string>()
  for (const dir of unique(await engine.stateDirs(ctx, { romPath, keys }))) {
    let names: string[]
    try {
      names = await readdir(dir)
    } catch {
      continue
    }
    for (const name of names) {
      const parsed = engine.parse(name)
      if (!parsed) continue
      if (keys.length && !keys.some((key) => sameKey(key, parsed.key))) {
        continue
      }
      const path = join(dir, name)
      if (seen.has(path)) continue
      try {
        const info = await stat(path)
        if (!info.isFile()) continue
        if (modifiedSince !== undefined && info.mtimeMs < modifiedSince) {
          continue
        }
        seen.add(path)
        states.push({
          path,
          key: parsed.key,
          kind: parsed.kind,
          slot: parsed.slot,
          modifiedAt: info.mtime.toISOString()
        })
      } catch {
        continue
      }
    }
  }
  return states.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt))
}

const thumbnailCache = new Map<string, string | null>()

async function thumbnailFor(
  engine: SaveStateEngine,
  state: EmulatorSaveState
): Promise<string | undefined> {
  if (!engine.thumbnail) return undefined
  const cacheKey = `${state.path}:${state.modifiedAt}`
  const cached = thumbnailCache.get(cacheKey)
  if (cached !== undefined) return cached ?? undefined
  let result: string | null = null
  try {
    const image = await engine.thumbnail(state.path)
    if (image?.length) {
      try {
        const { default: sharp } = await import('sharp')
        const jpeg = await sharp(image)
          .resize(320, 240, { fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: 70 })
          .toBuffer()
        result = `data:image/jpeg;base64,${jpeg.toString('base64')}`
      } catch {
        result = null
      }
    }
  } catch {
    result = null
  }
  thumbnailCache.set(cacheKey, result)
  return result ?? undefined
}

async function romKeysFor(resolved: Resolved): Promise<string[]> {
  const { engine, ctx, romPath, meta } = resolved
  return unique([
    ...(await engine.romKeys(ctx, romPath)),
    meta.saveStateKeys?.[romPath]
  ])
}

const MAX_STATES = 24

export async function listEmulatorSaveStates(args: {
  appName: string
  romPath?: string
}): Promise<EmulatorSaveStateList> {
  const resolved = resolve(args.appName, args.romPath)
  if (!resolved) return { supported: false, states: [] }
  const { engine, romPath, emulatorName } = resolved
  const keys = await romKeysFor(resolved)
  if (!keys.length) {
    return { supported: true, emulatorName, romPath, states: [] }
  }
  const found = (await collectStates(resolved, keys)).slice(0, MAX_STATES)
  const states = await Promise.all(
    found.map(
      async (state): Promise<EmulatorSaveState> => ({
        path: state.path,
        kind: state.kind,
        slot: state.slot,
        modifiedAt: state.modifiedAt,
        thumbnail: await thumbnailFor(engine, state)
      })
    )
  )
  return { supported: true, emulatorName, romPath, states }
}

// The choice made in the Collection launch dialog is consumed by the next
// launch of that game. It expires so an abandoned launch cannot leak into a
// later one started from elsewhere (official Library, tray, etc.).
type PendingState = LaunchStateArgs & { romPath: string; expiresAt: number }
const pending = new Map<string, PendingState>()
const PENDING_TTL_MS = 60_000

export async function setPendingLaunchState(args: {
  appName: string
  romPath?: string
  statePath?: string
}): Promise<boolean> {
  pending.delete(args.appName)
  const resolved = resolve(args.appName, args.romPath)
  if (!resolved) return !args.statePath
  let launchArgs: LaunchStateArgs
  if (args.statePath) {
    const keys = await romKeysFor(resolved)
    const states = keys.length ? await collectStates(resolved, keys) : []
    const state = states.find((item) => item.path === args.statePath)
    if (!state) return false
    launchArgs = await resolved.engine.loadArgs(resolved.ctx, state)
  } else {
    const fresh = (await resolved.engine.freshArgs?.(resolved.ctx)) ?? []
    if (!fresh.length) return true
    launchArgs = { args: fresh }
  }
  pending.set(args.appName, {
    ...launchArgs,
    romPath: resolved.romPath,
    expiresAt: Date.now() + PENDING_TTL_MS
  })
  return true
}

export function takePendingLaunchState(
  appName: string,
  romPath?: string
): LaunchStateArgs | undefined {
  const entry = pending.get(appName)
  pending.delete(appName)
  if (!entry || entry.expiresAt < Date.now()) return undefined
  if (romPath && entry.romPath !== romPath) return undefined
  return { args: entry.args, replacesImage: entry.replacesImage }
}

// After a session, states written for this game reveal the key the emulator
// uses. Storing it lets later launches list states for images whose ID we
// cannot read (CHD, CSO, GCZ…).
export async function rememberSaveStateKey(
  appName: string,
  romPath: string | undefined,
  startedAt: number
): Promise<void> {
  if (!romPath) return
  const resolved = resolve(appName, romPath)
  if (!resolved?.engine.learnsKeys) return
  // The disc or the emulator's cache is authoritative; only learn when both
  // are unreadable, so switching games inside the emulator cannot mislabel.
  const derived = await resolved.engine.romKeys(resolved.ctx, resolved.romPath)
  if (derived.length) return
  const written = await collectStates(resolved, [], startedAt - 2000)
  const keys = unique(written.map((state) => state.key))
  if (keys.length !== 1) return
  const [key] = keys
  const meta = getLocalGameMeta(appName)
  if (!meta || sameKey(meta.saveStateKeys?.[resolved.romPath] ?? '', key)) {
    return
  }
  upsertLocalGameMeta({
    ...meta,
    saveStateKeys: { ...meta.saveStateKeys, [resolved.romPath]: key }
  })
  logInfo(
    `Collection: remembered save-state key ${key} for ${meta.title}`,
    LogPrefix.Backend
  )
}
