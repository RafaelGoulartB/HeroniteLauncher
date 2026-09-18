import Store from 'electron-store'
import type {
  CompletionStatus,
  CompletionStatusSlug,
  DriveRemap
} from 'common/types/local-library'
import { getAllLocalGameMeta, upsertLocalGameMeta } from './stores'
import { tsStore } from 'backend/constants/key_value_stores'

type StatusFile = {
  statuses: CompletionStatus[]
  lastPlayniteLibraryPath?: string
  lastPlayniteDriveMap?: DriveRemap[]
}

const statusFile = new Store<StatusFile>({
  cwd: 'local_library',
  name: 'statuses',
  defaults: { statuses: [] }
})

const SLUG_ALIASES: Record<string, CompletionStatusSlug> = {
  playing: 'playing',
  jogando: 'playing',
  'plan to play': 'plan-to-play',
  'planejo jogar': 'plan-to-play',
  'on hold': 'on-hold',
  'em espera': 'on-hold',
  'em pausa': 'on-hold',
  played: 'played',
  jogado: 'played',
  endless: 'endless',
  continuous: 'endless',
  'on going': 'endless',
  ongoing: 'endless',
  aendless: 'endless',
  'uso continuo': 'endless',
  'uso contínuo': 'endless',
  beaten: 'beaten',
  zerei: 'beaten',
  zerado: 'beaten',
  completed: 'completed',
  completado: 'completed',
  abandoned: 'abandoned',
  abandonado: 'abandoned',
  'not played': 'not-played',
  'nao jogado': 'not-played',
  'não jogado': 'not-played'
}

const DEFAULT_STATUSES: CompletionStatus[] = [
  { id: 'playing', name: 'Playing', slug: 'playing', sortOrder: 10 },
  {
    id: 'plan-to-play',
    name: 'Plan to Play',
    slug: 'plan-to-play',
    sortOrder: 20
  },
  { id: 'on-hold', name: 'On Hold', slug: 'on-hold', sortOrder: 30 },
  { id: 'played', name: 'Played', slug: 'played', sortOrder: 40 },
  { id: 'endless', name: 'On Going', slug: 'endless', sortOrder: 30 },
  { id: 'beaten', name: 'Beaten', slug: 'beaten', sortOrder: 60 },
  { id: 'completed', name: 'Completed', slug: 'completed', sortOrder: 70 },
  { id: 'abandoned', name: 'Abandoned', slug: 'abandoned', sortOrder: 80 },
  { id: 'not-played', name: 'Not Played', slug: 'not-played', sortOrder: 90 }
]

function normalizeStatusName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/^\d+\s*[.)-]?\s*/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export function slugFromStatusName(name: string): CompletionStatusSlug {
  return SLUG_ALIASES[normalizeStatusName(name)] ?? 'custom'
}

export function getCompletionStatuses(): CompletionStatus[] {
  ensureDefaultStatuses()
  return [...statusFile.get('statuses')].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)
  )
}

export function setLastPlayniteLibraryPath(libraryPath: string) {
  statusFile.set('lastPlayniteLibraryPath', libraryPath)
}

export function getLastPlayniteLibraryPath(): string | undefined {
  return statusFile.get('lastPlayniteLibraryPath')
}

export function setLastPlayniteDriveMap(driveMap: DriveRemap[]) {
  statusFile.set('lastPlayniteDriveMap', driveMap)
}

export function getLastPlayniteDriveMap(): DriveRemap[] {
  return statusFile.get('lastPlayniteDriveMap') ?? []
}

export function ensureDefaultStatuses(): CompletionStatus[] {
  const current = statusFile.get('statuses')
  if (!current.length) {
    statusFile.set('statuses', DEFAULT_STATUSES)
    return DEFAULT_STATUSES
  }
  return current
}

export function upsertCompletionStatus(
  status: CompletionStatus
): CompletionStatus[] {
  const statuses = getCompletionStatuses()
  const index = statuses.findIndex((item) => item.id === status.id)
  if (index >= 0) {
    statuses[index] = status
  } else {
    statuses.push(status)
  }
  statusFile.set('statuses', statuses)
  return getCompletionStatuses()
}

export function deleteCompletionStatus(id: string): CompletionStatus[] {
  const statuses = getCompletionStatuses()
  if (statuses.length <= 1) return statuses

  const fallback =
    statuses.find((item) => item.id !== id && item.slug === 'not-played')?.id ??
    statuses.find((item) => item.id !== id)?.id
  if (!fallback) return statuses

  statusFile.set(
    'statuses',
    statuses.filter((item) => item.id !== id)
  )

  for (const meta of Object.values(getAllLocalGameMeta())) {
    if (meta.completionStatusId === id) {
      upsertLocalGameMeta({ ...meta, completionStatusId: fallback })
    }
  }

  return getCompletionStatuses()
}

export function reorderCompletionStatuses(ids: string[]): CompletionStatus[] {
  const statuses = getCompletionStatuses()
  const byId = new Map(statuses.map((item) => [item.id, item]))
  const next: CompletionStatus[] = []
  const seen = new Set<string>()

  for (const id of ids) {
    const item = byId.get(id)
    if (!item || seen.has(id)) continue
    seen.add(id)
    next.push({ ...item, sortOrder: (next.length + 1) * 10 })
  }

  for (const item of statuses) {
    if (seen.has(item.id)) continue
    next.push({ ...item, sortOrder: (next.length + 1) * 10 })
  }

  statusFile.set('statuses', next)
  return getCompletionStatuses()
}

function preferStatusName(current: string, incoming: string): string {
  const incomingRanked = /^\d+\s*[.)]/.test(incoming)
  const currentRanked = /^\d+\s*[.)]/.test(current)
  if (incomingRanked || !currentRanked) return incoming
  return current
}

export function mergePlayniteStatuses(
  incoming: Array<{ id: string; name: string }>
): CompletionStatus[] {
  const statuses = [...ensureDefaultStatuses()]

  for (const item of incoming) {
    const slug = slugFromStatusName(item.name)
    if (slug === 'custom') {
      const existingCustom = statuses.find(
        (status) => status.playniteId === item.id
      )
      if (existingCustom) {
        existingCustom.name = item.name
        existingCustom.playniteId = item.id
        continue
      }
      statuses.push({
        id: `playnite_${item.id}`,
        name: item.name,
        slug: 'custom',
        sortOrder: 100 + statuses.length,
        playniteId: item.id
      })
      continue
    }

    const match = statuses.find((status) => status.slug === slug)
    if (match) {
      match.playniteId = match.playniteId ?? item.id
      match.playniteIds = [...new Set([...(match.playniteIds ?? []), item.id])]
      match.name = preferStatusName(match.name, item.name)
      const order = item.name.match(/^(\d+)\s*[.)]/)
      if (order) {
        match.sortOrder = Number(order[1]) * 10
      }
    }
  }

  statusFile.set('statuses', statuses)
  return getCompletionStatuses()
}

export function statusIdForPlaynite(
  playniteStatusId: string | undefined
): string {
  const statuses = getCompletionStatuses()
  if (playniteStatusId) {
    const match = statuses.find(
      (status) =>
        status.playniteId === playniteStatusId ||
        status.playniteIds?.includes(playniteStatusId)
    )
    if (match) return match.id
  }
  return fallbackStatusId('not-played')
}

function fallbackStatusId(preferredSlug: CompletionStatusSlug): string {
  const statuses = getCompletionStatuses()
  return (
    statuses.find((item) => item.slug === preferredSlug)?.id ??
    statuses.find((item) => item.id === preferredSlug)?.id ??
    statuses[0]?.id ??
    preferredSlug
  )
}

export function inferredStatusId(playtimeMinutes: number): string {
  return fallbackStatusId(playtimeMinutes > 0 ? 'played' : 'not-played')
}

export function resolvePlayniteStatusId(
  playniteStatusId: string | undefined,
  incoming?: Array<{ id: string; name: string }>
): string {
  if (!playniteStatusId) return fallbackStatusId('not-played')
  const statuses = getCompletionStatuses()
  const mapped = statuses.find(
    (status) =>
      status.playniteId === playniteStatusId ||
      status.playniteIds?.includes(playniteStatusId)
  )
  if (mapped) return mapped.id

  const incomingStatus = incoming?.find((item) => item.id === playniteStatusId)
  if (incomingStatus) {
    const slug = slugFromStatusName(incomingStatus.name)
    if (slug !== 'custom') {
      const bySlug = statuses.find((status) => status.slug === slug)
      if (bySlug) return bySlug.id
    }
  }

  return fallbackStatusId('not-played')
}

export type StatusMergeDecision = 'unchanged' | 'take-playnite' | 'conflict'

export function decideStatusMerge(
  meta: { completionStatusId?: string; playniteCompletionStatusId?: string },
  playniteStatusId: string | undefined,
  fromPlaynite: string
): { statusId: string; decision: StatusMergeDecision } {
  const heroic = meta.completionStatusId
  if (!heroic) {
    return { statusId: fromPlaynite, decision: 'take-playnite' }
  }

  if (playniteStatusId === meta.playniteCompletionStatusId) {
    return { statusId: heroic, decision: 'unchanged' }
  }

  const lastImported = meta.playniteCompletionStatusId
    ? statusIdForPlaynite(meta.playniteCompletionStatusId)
    : undefined
  if (heroic === lastImported) {
    return {
      statusId: fromPlaynite,
      decision: fromPlaynite === heroic ? 'unchanged' : 'take-playnite'
    }
  }

  return {
    statusId: heroic,
    decision: fromPlaynite === heroic ? 'unchanged' : 'conflict'
  }
}

export function mergeGameCompletionStatus(
  meta: { completionStatusId?: string; playniteCompletionStatusId?: string },
  playniteStatusId: string | undefined,
  playtimeMinutes: number
): string {
  const fromPlaynite = playniteStatusId
    ? statusIdForPlaynite(playniteStatusId)
    : inferredStatusId(playtimeMinutes)
  return decideStatusMerge(meta, playniteStatusId, fromPlaynite).statusId
}

export function setGameCompletionStatus(
  appName: string,
  statusId: string,
  extras?: {
    runner?: LocalGameMetaRunner
    title?: string
    playniteId?: string
  }
) {
  const existing = getAllLocalGameMeta()[appName]
  if (existing) {
    upsertLocalGameMeta({ ...existing, completionStatusId: statusId })
    return
  }

  upsertLocalGameMeta({
    appName,
    runner: extras?.runner ?? 'sideload',
    playniteId: extras?.playniteId ?? `heroic_${appName}`,
    source: 'other',
    launchKind: 'unavailable',
    title: extras?.title ?? appName,
    completionStatusId: statusId
  })
}

type LocalGameMetaRunner = 'sideload' | 'legendary' | 'gog' | 'nile'

export function backfillMissingGameStatuses() {
  const games = getAllLocalGameMeta()
  for (const meta of Object.values(games)) {
    if (meta.completionStatusId) continue
    const playtime = tsStore.get_nodefault(meta.appName)?.totalPlayed ?? 0
    upsertLocalGameMeta({
      ...meta,
      completionStatusId: inferredStatusId(playtime)
    })
  }
}
