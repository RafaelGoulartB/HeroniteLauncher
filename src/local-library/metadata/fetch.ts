import { logInfo, logWarning, LogPrefix } from 'backend/logger'
import { sendFrontendMessage } from 'backend/ipc'
import type {
  CollectionGameMetadata,
  CollectionMetadataApplyArgs,
  CollectionMetadataBulkArgs,
  CollectionMetadataBulkProgress,
  CollectionMetadataCandidate,
  CollectionMetadataPreview,
  CollectionMetadataSearchHit,
  MetadataSourceId
} from 'common/types/local-library'
import { DEFAULT_FIELD_PRIORITY } from 'common/types/local-library'
import { getCollectionSettings } from '../settings'
import { getLocalGameMeta, getAllLocalGameMeta } from '../stores'
import { fetchIgdbMetadata, igdbConfigured, searchIgdbGames } from './igdb'
import { materializeMetadataImage } from './images'
import { mergeMetadata, withPreferredSource } from './merge'
import {
  fetchLutrisMetadata,
  fetchPlayniteMetadata,
  fetchSteamMetadata,
  fetchStoreMetadata,
  metadataFromPlayniteGame
} from './sources'
import {
  currentOrBlank,
  getAllGameMetadata,
  getGameMetadata,
  upsertGameMetadata
} from './store'
import { PlayniteGame } from '../playnite/reader'

const PROVIDER_ORDER: MetadataSourceId[] = [
  'igdb',
  'steam',
  'store',
  'lutris',
  'playnite'
]

type GameRef = {
  appName: string
  runner: string
  title: string
  steamAppId?: string
  igdbId?: number
  lutrisSlug?: string
  language?: string
}

function asRunner(runner: string) {
  return runner === 'zoom' ? 'sideload' : runner
}

function settingsPriority() {
  return (
    getCollectionSettings().metadata.fieldPriority ?? DEFAULT_FIELD_PRIORITY
  )
}

function steamIdFor(game: GameRef) {
  return game.steamAppId || getLocalGameMeta(game.appName)?.steamAppId
}

async function candidateFor(
  source: MetadataSourceId,
  game: GameRef
): Promise<CollectionMetadataCandidate | null> {
  let metadata: CollectionGameMetadata | null = null
  if (source === 'igdb') {
    metadata = await fetchIgdbMetadata({
      appName: game.appName,
      runner: game.runner,
      title: game.title,
      steamAppId: steamIdFor(game),
      igdbId: game.igdbId
    })
  } else if (source === 'steam') {
    metadata = await fetchSteamMetadata({
      appName: game.appName,
      runner: game.runner,
      steamAppId: steamIdFor(game),
      language: game.language
    })
  } else if (source === 'store') {
    metadata = fetchStoreMetadata(game)
  } else if (source === 'lutris') {
    metadata = await fetchLutrisMetadata({
      appName: game.appName,
      runner: game.runner,
      title: game.title,
      lutrisSlug: game.lutrisSlug
    })
  } else if (source === 'playnite') {
    metadata = fetchPlayniteMetadata(game)
  }
  if (!metadata) return null
  return {
    source,
    matchName: metadata.title,
    matchYear: metadata.releaseDate
      ? Number(metadata.releaseDate.slice(0, 4)) || undefined
      : undefined,
    metadata
  }
}

async function gatherCandidates(
  game: GameRef
): Promise<CollectionMetadataCandidate[]> {
  const current = getGameMetadata(game.runner, game.appName)
  const withIds: GameRef = {
    ...game,
    igdbId: game.igdbId ?? current?.igdbId,
    lutrisSlug: game.lutrisSlug ?? current?.lutrisSlug
  }
  const settled = await Promise.allSettled(
    PROVIDER_ORDER.map((source) => candidateFor(source, withIds))
  )
  const candidates: CollectionMetadataCandidate[] = []
  for (const result of settled) {
    if (result.status === 'fulfilled' && result.value) {
      candidates.push(result.value)
    } else if (result.status === 'rejected') {
      logWarning(
        `Metadata source failed for ${game.title}: ${String(result.reason)}`,
        LogPrefix.Backend
      )
    }
  }
  return candidates
}

async function persistImages(
  metadata: CollectionGameMetadata,
  download: boolean
) {
  metadata.coverUrl = await materializeMetadataImage({
    runner: metadata.runner,
    appName: metadata.appName,
    kind: 'cover',
    source: metadata.coverUrl,
    download
  })
  metadata.heroUrl = await materializeMetadataImage({
    runner: metadata.runner,
    appName: metadata.appName,
    kind: 'hero',
    source: metadata.heroUrl,
    download
  })
  return metadata
}

export function getCollectionGameMetadata(
  runner: string,
  appName: string
): CollectionGameMetadata | undefined {
  return getGameMetadata(asRunner(runner), appName)
}

export function getAllCollectionMetadata() {
  return getAllGameMetadata()
}

export async function previewGameMetadata(
  args: CollectionMetadataApplyArgs
): Promise<CollectionMetadataPreview> {
  const runner = asRunner(args.runner)
  const current = getGameMetadata(runner, args.appName)
  const candidates = await gatherCandidates({ ...args, runner })
  const hasFieldPicks = Boolean(
    args.fieldPicks && Object.keys(args.fieldPicks).length
  )
  const proposed = mergeMetadata({
    appName: args.appName,
    runner,
    current,
    candidates,
    priority: withPreferredSource(settingsPriority(), args.source),
    overwriteExisting: args.overwriteExisting !== false,
    preserveManual: hasFieldPicks
      ? false
      : (args.preserveManual ?? args.overwriteExisting === false),
    fieldPicks: args.fieldPicks
  })
  return {
    appName: args.appName,
    current,
    proposed,
    candidates,
    igdbConfigured: igdbConfigured()
  }
}

export async function applyGameMetadata(
  args: CollectionMetadataApplyArgs
): Promise<CollectionGameMetadata> {
  const preview = await previewGameMetadata(args)
  if (!preview.candidates.length) {
    const failed = {
      ...currentOrBlank(args.runner, args.appName),
      fetchError: 'No metadata sources returned data',
      fetchedAt: new Date().toISOString()
    }
    return upsertGameMetadata(failed)
  }
  const download =
    args.downloadImages ?? getCollectionSettings().metadata.downloadImages
  const saved = await persistImages(preview.proposed, download)
  return upsertGameMetadata(saved)
}

export async function searchGameMetadata(args: {
  title: string
}): Promise<CollectionMetadataSearchHit[]> {
  return searchIgdbGames(args.title)
}

function idleBulkProgress(): CollectionMetadataBulkProgress {
  return {
    state: 'idle',
    total: 0,
    processed: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
    percent: 0,
    errors: []
  }
}

let bulkProgress = idleBulkProgress()
let bulkCancel = false
let bulkRunning = false

function publishBulkProgress(next: CollectionMetadataBulkProgress) {
  bulkProgress = next
  sendFrontendMessage('collectionMetadataBulkProgress', next)
}

export function getBulkMetadataProgress() {
  return bulkProgress
}

export function cancelBulkMetadata() {
  if (bulkRunning) {
    bulkCancel = true
    publishBulkProgress({ ...bulkProgress, state: 'cancelling' })
  }
  return bulkProgress
}

export function startBulkMetadata(
  args: CollectionMetadataBulkArgs
): CollectionMetadataBulkProgress {
  if (bulkRunning) return bulkProgress
  bulkCancel = false
  bulkRunning = true
  publishBulkProgress({
    state: 'running',
    total: args.games.length,
    processed: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
    percent: args.games.length ? 0 : 100,
    errors: []
  })
  void runBulkMetadata(args)
  return bulkProgress
}

async function runBulkMetadata(args: CollectionMetadataBulkArgs) {
  const overwrite = Boolean(args.overwriteExisting)
  const download =
    args.downloadImages ?? getCollectionSettings().metadata.downloadImages
  const errors: string[] = []
  let updated = 0
  let skipped = 0
  let failed = 0

  try {
    if (!args.games.length) {
      publishBulkProgress({
        state: 'done',
        total: 0,
        processed: 0,
        updated: 0,
        skipped: 0,
        failed: 0,
        percent: 100,
        errors: []
      })
      return
    }

    for (const [index, game] of args.games.entries()) {
      if (bulkCancel) break
      publishBulkProgress({
        state: 'running',
        total: args.games.length,
        processed: index,
        updated,
        skipped,
        failed,
        percent: Math.round((index / args.games.length) * 100),
        currentTitle: game.title,
        errors: errors.slice(0, 8)
      })
      try {
        const current = getGameMetadata(game.runner, game.appName)
        if (!overwrite && current?.fetchedAt && !current.fetchError) {
          skipped += 1
        } else {
          const saved = await applyGameMetadata({
            ...game,
            source: 'auto',
            overwriteExisting: overwrite,
            preserveManual: args.preserveManual !== false,
            downloadImages: download
          })
          if (saved.fetchError) {
            failed += 1
            errors.push(`${game.title}: ${saved.fetchError}`)
          } else {
            updated += 1
          }
        }
      } catch (error) {
        failed += 1
        errors.push(`${game.title}: ${String(error)}`)
      }
    }

    const processed = updated + skipped + failed
    publishBulkProgress({
      state: 'done',
      total: args.games.length,
      processed,
      updated,
      skipped,
      failed,
      percent: args.games.length
        ? Math.round((processed / args.games.length) * 100)
        : 100,
      errors: errors.slice(0, 8)
    })
  } finally {
    bulkRunning = false
    bulkCancel = false
  }
}

let filling = false

export async function refreshMissingCollectionMetadata(): Promise<number> {
  if (filling) return 0
  if (!getCollectionSettings().metadata.autoFillMissing) return 0
  filling = true
  try {
    const games = Object.values(getAllLocalGameMeta())
    const missing = games.filter((meta) => {
      const current = getGameMetadata(meta.runner, meta.appName)
      if (!current) return true
      if (current.fetchError) {
        const fetched = current.fetchedAt ? Date.parse(current.fetchedAt) : 0
        return Date.now() - fetched > 7 * 24 * 60 * 60 * 1000
      }
      return false
    })
    if (!missing.length) return 0
    logInfo(
      `Filling Collection metadata for ${missing.length} game(s)`,
      LogPrefix.Backend
    )
    let filled = 0
    for (const meta of missing.slice(0, 40)) {
      const saved = await applyGameMetadata({
        appName: meta.appName,
        runner: meta.runner,
        title: meta.title,
        steamAppId: meta.steamAppId,
        source: 'auto',
        overwriteExisting: false,
        preserveManual: true,
        downloadImages: getCollectionSettings().metadata.downloadImages
      })
      if (!saved.fetchError) filled += 1
    }
    return filled
  } finally {
    filling = false
  }
}

export async function seedPlayniteMetadata(args: {
  appName: string
  runner: string
  game: PlayniteGame
  libraryPath: string
}) {
  const runner = asRunner(args.runner)
  const existing = getGameMetadata(runner, args.appName)
  if (existing?.fieldSources && Object.keys(existing.fieldSources).length) {
    return existing
  }
  const fromPlaynite = metadataFromPlayniteGame(
    args.appName,
    runner,
    args.game,
    args.libraryPath
  )
  const merged = mergeMetadata({
    appName: args.appName,
    runner,
    current: existing,
    candidates: [{ source: 'playnite', metadata: fromPlaynite }],
    priority: settingsPriority(),
    overwriteExisting: false,
    preserveManual: true
  })
  return upsertGameMetadata(await persistImages(merged, false))
}
