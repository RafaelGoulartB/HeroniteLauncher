import type { GameInfo } from 'common/types'
import type { CollectionGameMetadata } from 'common/types/local-library'

export type CollectionFacetKind =
  | 'series'
  | 'developer'
  | 'publisher'
  | 'genre'
  | 'platform'

export type CollectionFacetFilters = Record<CollectionFacetKind, string | null>

export type CollectionFacetOption = {
  value: string
  count: number
}

export const EMPTY_FACET_FILTERS: CollectionFacetFilters = {
  series: null,
  developer: null,
  publisher: null,
  genre: null,
  platform: null
}

export const FACET_KINDS: CollectionFacetKind[] = [
  'series',
  'developer',
  'publisher',
  'genre',
  'platform'
]

export function facetKey(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

export function hasFacetFilters(filters: CollectionFacetFilters): boolean {
  return FACET_KINDS.some((kind) => Boolean(filters[kind]))
}

function splitNames(value?: string) {
  if (!value) return []
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function uniqueNames(items: Array<string | undefined>) {
  const seen = new Set<string>()
  const values: string[] = []
  for (const raw of items) {
    const value = raw?.trim()
    if (!value) continue
    const key = facetKey(value)
    if (seen.has(key)) continue
    seen.add(key)
    values.push(value)
  }
  return values
}

export function gameFacets(
  game: GameInfo,
  metadata?: CollectionGameMetadata
): Record<CollectionFacetKind, string[]> {
  const series = metadata?.series?.trim() ? [metadata.series.trim()] : []
  const developers = uniqueNames(
    metadata?.developers?.length
      ? metadata.developers
      : splitNames(game.developer)
  )
  const publishers = uniqueNames(metadata?.publishers ?? [])
  const genres = uniqueNames(
    metadata?.genres?.length ? metadata.genres : (game.extra?.genres ?? [])
  )
  const platforms = uniqueNames(metadata?.platforms ?? [])
  return {
    series,
    developer: developers,
    publisher: publishers,
    genre: genres,
    platform: platforms
  }
}

export function matchesFacets(
  game: GameInfo,
  metadata: CollectionGameMetadata | undefined,
  filters: CollectionFacetFilters
): boolean {
  if (!hasFacetFilters(filters)) return true
  const facets = gameFacets(game, metadata)
  for (const kind of FACET_KINDS) {
    const selected = filters[kind]
    if (!selected) continue
    const wanted = facetKey(selected)
    if (!facets[kind].some((item) => facetKey(item) === wanted)) return false
  }
  return true
}

export function collectFacetOptions(
  games: GameInfo[],
  metadataFor: (game: GameInfo) => CollectionGameMetadata | undefined
): Record<CollectionFacetKind, CollectionFacetOption[]> {
  const buckets: Record<
    CollectionFacetKind,
    Map<string, CollectionFacetOption>
  > = {
    series: new Map(),
    developer: new Map(),
    publisher: new Map(),
    genre: new Map(),
    platform: new Map()
  }

  for (const game of games) {
    const facets = gameFacets(game, metadataFor(game))
    for (const kind of FACET_KINDS) {
      const seen = new Set<string>()
      for (const value of facets[kind]) {
        const key = facetKey(value)
        if (seen.has(key)) continue
        seen.add(key)
        const current = buckets[kind].get(key)
        if (current) current.count += 1
        else buckets[kind].set(key, { value, count: 1 })
      }
    }
  }

  const sortOptions = (items: CollectionFacetOption[]) =>
    items.sort((a, b) => a.value.localeCompare(b.value))

  return {
    series: sortOptions([...buckets.series.values()]),
    developer: sortOptions([...buckets.developer.values()]),
    publisher: sortOptions([...buckets.publisher.values()]),
    genre: sortOptions([...buckets.genre.values()]),
    platform: sortOptions([...buckets.platform.values()])
  }
}

export function toggleFacetFilter(
  current: CollectionFacetFilters,
  kind: CollectionFacetKind,
  value: string
): CollectionFacetFilters {
  const selected = current[kind]
  const next = selected && facetKey(selected) === facetKey(value) ? null : value
  return { ...current, [kind]: next }
}
