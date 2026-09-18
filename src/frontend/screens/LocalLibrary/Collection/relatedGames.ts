import type { GameInfo } from 'common/types'
import type {
  CollectionGameArt,
  CollectionGameMetadata
} from 'common/types/local-library'
import { facetKey, gameFacets } from './collectionFacets'
import { collectionGameTitle } from './collectionTitle'
import { collectionCoverSrc } from './steamArt'

export type RelatedGameItem = {
  game: GameInfo
  title: string
  cover: string
}

export type RelatedGamesGroupKind = 'series' | 'developer'

export type RelatedGamesGroup = {
  kind: RelatedGamesGroupKind
  items: RelatedGameItem[]
}

const MAX_ITEMS = 16

function gameId(game: GameInfo) {
  return `${game.runner}_${game.app_name}`
}

function hasOverlap(current: string[], candidates: string[]) {
  if (!current.length || !candidates.length) return false
  const wanted = new Set(current.map(facetKey))
  return candidates.some((item) => wanted.has(facetKey(item)))
}

export function uniqueLibraryGames(
  libraries: GameInfo[],
  hiddenAppNames: Iterable<string>
) {
  const hidden = new Set(hiddenAppNames)
  const seen = new Set<string>()
  const unique: GameInfo[] = []
  for (const game of libraries) {
    if (game.install?.is_dlc) continue
    if (hidden.has(game.app_name)) continue
    const key = gameId(game)
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(game)
  }
  return unique
}

export function collectRelatedGames(args: {
  current: GameInfo
  series: string[]
  developers: string[]
  games: GameInfo[]
  metadataFor: (game: GameInfo) => CollectionGameMetadata | undefined
  artFor: (game: GameInfo) => CollectionGameArt | undefined
  steamAppIdFor: (game: GameInfo) => string | undefined
}): RelatedGamesGroup[] {
  const currentId = gameId(args.current)
  const series = args.series.map((item) => item.trim()).filter(Boolean)
  const developers = args.developers.map((item) => item.trim()).filter(Boolean)
  const seriesItems: RelatedGameItem[] = []
  const developerItems: RelatedGameItem[] = []

  for (const game of args.games) {
    if (gameId(game) === currentId) continue
    const metadata = args.metadataFor(game)
    const facets = gameFacets(game, metadata)
    const item: RelatedGameItem = {
      game,
      title: collectionGameTitle(game, metadata),
      cover: collectionCoverSrc(
        game,
        args.artFor(game),
        args.steamAppIdFor(game),
        metadata?.coverUrl
      )
    }
    if (hasOverlap(series, facets.series)) seriesItems.push(item)
    if (hasOverlap(developers, facets.developer)) developerItems.push(item)
  }

  const byTitle = (left: RelatedGameItem, right: RelatedGameItem) =>
    left.title.localeCompare(right.title, undefined, { sensitivity: 'base' })

  const groups: RelatedGamesGroup[] = []
  if (seriesItems.length) {
    groups.push({
      kind: 'series',
      items: seriesItems.sort(byTitle).slice(0, MAX_ITEMS)
    })
  }
  if (developerItems.length) {
    groups.push({
      kind: 'developer',
      items: developerItems.sort(byTitle).slice(0, MAX_ITEMS)
    })
  }
  return groups
}
