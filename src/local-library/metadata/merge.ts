import type {
  CollectionGameMetadata,
  MetadataField,
  MetadataSourceId
} from 'common/types/local-library'
import { METADATA_FIELDS } from 'common/types/local-library'
import { blankMetadata } from './blank'

const ARRAY_FIELDS = [
  'developers',
  'publishers',
  'genres',
  'themes',
  'gameModes',
  'platforms',
  'features'
] as const

type ArrayField = (typeof ARRAY_FIELDS)[number]

export function hasFieldValue(
  metadata: CollectionGameMetadata | undefined,
  field: MetadataField
): boolean {
  if (!metadata) return false
  if (field === 'description') return Boolean(metadata.description)
  if (field === 'releaseDate') return Boolean(metadata.releaseDate)
  if (field === 'series') return Boolean(metadata.series)
  if (field === 'criticScore') return typeof metadata.criticScore === 'number'
  if (field === 'cover') return Boolean(metadata.coverUrl)
  if (field === 'hero') return Boolean(metadata.heroUrl)
  const values = metadata[field]
  return Array.isArray(values) && values.length > 0
}

export function readField(
  metadata: CollectionGameMetadata | undefined,
  field: MetadataField
) {
  if (!metadata) return undefined
  if (field === 'description') return metadata.description
  if (field === 'releaseDate') return metadata.releaseDate
  if (field === 'series') return metadata.series
  if (field === 'criticScore') return metadata.criticScore
  if (field === 'cover') return metadata.coverUrl
  if (field === 'hero') return metadata.heroUrl
  return metadata[field]
}

function writeField(
  target: CollectionGameMetadata,
  field: MetadataField,
  value: unknown,
  source: MetadataSourceId
) {
  if (field === 'description' && typeof value === 'string') {
    target.description = value
  } else if (field === 'releaseDate' && typeof value === 'string') {
    target.releaseDate = value
  } else if (field === 'series' && typeof value === 'string') {
    target.series = value
  } else if (field === 'criticScore' && typeof value === 'number') {
    target.criticScore = value
  } else if (field === 'cover' && typeof value === 'string') {
    target.coverUrl = value
  } else if (field === 'hero' && typeof value === 'string') {
    target.heroUrl = value
  } else if (
    ARRAY_FIELDS.includes(field as ArrayField) &&
    Array.isArray(value)
  ) {
    target[field as ArrayField] = value as string[]
  } else {
    return
  }
  target.fieldSources[field] = source
}

export function mergeMetadata(args: {
  appName: string
  runner: string
  current?: CollectionGameMetadata
  candidates: Array<{
    source: MetadataSourceId
    metadata: CollectionGameMetadata
  }>
  priority: Record<MetadataField, MetadataSourceId[]>
  overwriteExisting?: boolean
  preserveManual?: boolean
  fieldPicks?: Partial<Record<MetadataField, MetadataSourceId | 'keep'>>
}): CollectionGameMetadata {
  const next: CollectionGameMetadata = {
    ...blankMetadata(args.appName, args.runner),
    ...(args.current ?? {}),
    developers: [...(args.current?.developers ?? [])],
    publishers: [...(args.current?.publishers ?? [])],
    genres: [...(args.current?.genres ?? [])],
    themes: [...(args.current?.themes ?? [])],
    gameModes: [...(args.current?.gameModes ?? [])],
    platforms: [...(args.current?.platforms ?? [])],
    features: [...(args.current?.features ?? [])],
    websites: [...(args.current?.websites ?? [])],
    fieldSources: { ...(args.current?.fieldSources ?? {}) }
  }

  const bySource = new Map(
    args.candidates.map((item) => [item.source, item.metadata])
  )

  for (const field of METADATA_FIELDS) {
    const pick = args.fieldPicks?.[field]
    if (pick === 'keep' || pick === 'manual') {
      next.fieldSources[field] = args.current?.fieldSources?.[field] ?? 'manual'
      continue
    }
    const lockedManual =
      !pick &&
      Boolean(args.preserveManual) &&
      args.current?.fieldSources?.[field] === 'manual'
    if (lockedManual) continue
    if (
      !args.overwriteExisting &&
      hasFieldValue(args.current, field) &&
      !pick
    ) {
      continue
    }

    const order = pick
      ? [pick, ...(args.priority[field] ?? []).filter((item) => item !== pick)]
      : (args.priority[field] ?? [])

    for (const source of order) {
      if (source === 'manual') continue
      const candidate = bySource.get(source)
      if (!hasFieldValue(candidate, field)) continue
      writeField(next, field, readField(candidate, field), source)
      break
    }
  }

  for (const candidate of args.candidates) {
    if (candidate.metadata.igdbId && !next.igdbId) {
      next.igdbId = candidate.metadata.igdbId
      next.igdbSlug = candidate.metadata.igdbSlug
    }
    if (candidate.metadata.lutrisSlug && !next.lutrisSlug) {
      next.lutrisSlug = candidate.metadata.lutrisSlug
    }
    if (candidate.metadata.steamAppId && !next.steamAppId) {
      next.steamAppId = candidate.metadata.steamAppId
    }
    if (candidate.metadata.title && !next.title) {
      next.title = candidate.metadata.title
    }
    if (candidate.metadata.websites.length && !next.websites.length) {
      next.websites = candidate.metadata.websites
    }
  }

  next.appName = args.appName
  next.runner = args.runner
  next.fetchedAt = new Date().toISOString()
  delete next.fetchError
  return next
}

export function withPreferredSource(
  priority: Record<MetadataField, MetadataSourceId[]>,
  source?: MetadataSourceId | 'auto'
): Record<MetadataField, MetadataSourceId[]> {
  if (!source || source === 'auto') return priority
  const next = { ...priority }
  for (const field of METADATA_FIELDS) {
    next[field] = [source, ...priority[field].filter((item) => item !== source)]
  }
  return next
}
