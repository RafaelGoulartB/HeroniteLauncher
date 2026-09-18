import type { GameInfo } from 'common/types'
import type { CollectionGameMetadata } from 'common/types/local-library'

export function collectionGameTitle(
  game: GameInfo,
  metadata?: CollectionGameMetadata
) {
  return metadata?.title?.trim() || game.overrides?.title || game.title
}
