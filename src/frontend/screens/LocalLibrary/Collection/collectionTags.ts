import type { GameInfo } from 'common/types'
import type { CollectionGameMetadata } from 'common/types/local-library'
import { facetKey, gameFacets } from './collectionFacets'

export const TAG_KINDS = [
  'series',
  'developers',
  'publishers',
  'genres',
  'themes',
  'gameModes',
  'platforms',
  'features'
] as const

export type CollectionTagKind = (typeof TAG_KINDS)[number]

export const EMPTY_TAG_OPTIONS: Record<CollectionTagKind, string[]> = {
  series: [],
  developers: [],
  publishers: [],
  genres: [],
  themes: [],
  gameModes: [],
  platforms: [],
  features: []
}

function uniqueTags(values: Array<string | undefined>) {
  const seen = new Set<string>()
  const next: string[] = []
  for (const raw of values) {
    const value = raw?.trim()
    if (!value) continue
    const key = facetKey(value)
    if (seen.has(key)) continue
    seen.add(key)
    next.push(value)
  }
  return next
}

function tagsForGame(
  game: GameInfo,
  metadata?: CollectionGameMetadata
): Record<CollectionTagKind, string[]> {
  const facets = gameFacets(game, metadata)
  return {
    series: facets.series,
    developers: facets.developer,
    publishers: facets.publisher,
    genres: facets.genre,
    themes: uniqueTags(metadata?.themes ?? []),
    gameModes: uniqueTags(metadata?.gameModes ?? []),
    platforms: uniqueTags(metadata?.platforms ?? []),
    features: uniqueTags(metadata?.features ?? [])
  }
}

export function collectTagOptions(
  games: GameInfo[],
  metadataFor: (game: GameInfo) => CollectionGameMetadata | undefined
): Record<CollectionTagKind, string[]> {
  const buckets: Record<CollectionTagKind, Map<string, string>> = {
    series: new Map(),
    developers: new Map(),
    publishers: new Map(),
    genres: new Map(),
    themes: new Map(),
    gameModes: new Map(),
    platforms: new Map(),
    features: new Map()
  }

  for (const game of games) {
    const tags = tagsForGame(game, metadataFor(game))
    for (const kind of TAG_KINDS) {
      for (const value of tags[kind]) {
        const key = facetKey(value)
        if (!buckets[kind].has(key)) buckets[kind].set(key, value)
      }
    }
  }

  const sortValues = (items: string[]) =>
    items.sort((a, b) => a.localeCompare(b))

  return {
    series: sortValues([...buckets.series.values()]),
    developers: sortValues([...buckets.developers.values()]),
    publishers: sortValues([...buckets.publishers.values()]),
    genres: sortValues([...buckets.genres.values()]),
    themes: sortValues([...buckets.themes.values()]),
    gameModes: sortValues([...buckets.gameModes.values()]),
    platforms: sortValues([...buckets.platforms.values()]),
    features: sortValues([...buckets.features.values()])
  }
}
