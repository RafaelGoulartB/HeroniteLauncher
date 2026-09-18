import type {
  CollectionGameDetailsPatch,
  CollectionGameDetailsResult,
  CollectionGameMetadata,
  LocalGameMeta,
  MetadataField
} from 'common/types/local-library'
import { getLocalGameMeta, upsertLocalGameMeta } from '../stores'
import { uniqueNames } from './blank'
import { currentOrBlank, upsertGameMetadata } from './store'

type ArrayField =
  | 'developers'
  | 'publishers'
  | 'genres'
  | 'themes'
  | 'gameModes'
  | 'platforms'
  | 'features'

function asRunner(runner: string) {
  return runner === 'zoom' ? 'sideload' : runner
}

function cloneMetadata(
  current: CollectionGameMetadata
): CollectionGameMetadata {
  return {
    ...current,
    developers: [...current.developers],
    publishers: [...current.publishers],
    genres: [...current.genres],
    themes: [...current.themes],
    gameModes: [...current.gameModes],
    platforms: [...current.platforms],
    features: [...current.features],
    websites: [...current.websites],
    fieldSources: { ...current.fieldSources }
  }
}

function setOptionalString(
  target: CollectionGameMetadata,
  field: 'description' | 'releaseDate' | 'series' | 'notes' | 'title',
  value: string | undefined
) {
  if (value === undefined) return
  const next = value.trim()
  if (next) target[field] = next
  else delete target[field]
}

function setManualString(
  target: CollectionGameMetadata,
  field: 'description' | 'releaseDate' | 'series',
  value: string | undefined
) {
  if (value === undefined) return
  setOptionalString(target, field, value)
  target.fieldSources[field] = 'manual'
}

function setManualArray(
  target: CollectionGameMetadata,
  field: ArrayField,
  value: string[] | undefined
) {
  if (value === undefined) return
  target[field] = uniqueNames(value, 40)
  target.fieldSources[field as MetadataField] = 'manual'
}

function syncLocalGameMeta(
  args: CollectionGameDetailsPatch
): LocalGameMeta | undefined {
  const existing = getLocalGameMeta(args.appName)
  if (!existing) return undefined
  if (args.title === undefined && args.notes === undefined) return existing

  const next: LocalGameMeta = { ...existing }
  if (args.title !== undefined) {
    const title = args.title.trim()
    if (title) next.title = title
  }
  if (args.notes !== undefined) {
    const notes = args.notes.trim()
    next.notes = notes || undefined
  }
  upsertLocalGameMeta(next)
  return next
}

export function updateCollectionGameDetails(
  args: CollectionGameDetailsPatch
): CollectionGameDetailsResult {
  const runner = asRunner(args.runner)
  const next = cloneMetadata(currentOrBlank(runner, args.appName))
  next.appName = args.appName
  next.runner = runner

  setOptionalString(next, 'title', args.title)
  setOptionalString(next, 'notes', args.notes)
  setManualString(next, 'description', args.description)
  setManualString(next, 'releaseDate', args.releaseDate)
  setManualString(next, 'series', args.series)
  setManualArray(next, 'developers', args.developers)
  setManualArray(next, 'publishers', args.publishers)
  setManualArray(next, 'genres', args.genres)
  setManualArray(next, 'themes', args.themes)
  setManualArray(next, 'gameModes', args.gameModes)
  setManualArray(next, 'platforms', args.platforms)
  setManualArray(next, 'features', args.features)

  if (args.websites !== undefined) {
    next.websites = uniqueNames(args.websites, 20)
  }

  if (args.criticScore === null) {
    delete next.criticScore
    next.fieldSources.criticScore = 'manual'
  } else if (
    typeof args.criticScore === 'number' &&
    Number.isFinite(args.criticScore)
  ) {
    next.criticScore = args.criticScore
    next.fieldSources.criticScore = 'manual'
  }

  const metadata = upsertGameMetadata(next)
  const meta = syncLocalGameMeta(args)
  return { metadata, meta }
}
