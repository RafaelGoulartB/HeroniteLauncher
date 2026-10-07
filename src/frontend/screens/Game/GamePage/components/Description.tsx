import { useContext, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type {
  CollectionGameArt,
  CollectionGameMetadata,
  LocalGameMeta
} from 'common/types/local-library'
import GameContext from '../../GameContext'
import ContextProvider from 'frontend/state/ContextProvider'
import CollectionRelatedGames from 'frontend/screens/LocalLibrary/Collection/CollectionRelatedGames'
import {
  collectRelatedGames,
  uniqueLibraryGames
} from 'frontend/screens/LocalLibrary/Collection/relatedGames'
import {
  collectionArtKey,
  collectionMetadataKey
} from 'frontend/screens/LocalLibrary/Collection/steamArt'

const Description = () => {
  const { t } = useTranslation('gamepage')
  const navigate = useNavigate()
  const { gameExtraInfo, runner, gameInfo, appName } = useContext(GameContext)
  const { epic, gog, amazon, zoom, sideloadedLibrary, hiddenGames } =
    useContext(ContextProvider)
  const [collectionMetadata, setCollectionMetadata] = useState<
    Record<string, CollectionGameMetadata>
  >({})
  const [collectionArt, setCollectionArt] = useState<
    Record<string, CollectionGameArt>
  >({})
  const [metas, setMetas] = useState<Record<string, LocalGameMeta>>({})

  useEffect(() => {
    const localLibrary = window.api.localLibrary
    if (
      typeof localLibrary?.getAllMetadata !== 'function' ||
      typeof localLibrary.getAllCollectionArt !== 'function' ||
      typeof localLibrary.getAllMeta !== 'function'
    ) {
      return
    }
    let cancelled = false
    void Promise.all([
      localLibrary.getAllMetadata(),
      localLibrary.getAllCollectionArt(),
      localLibrary.getAllMeta()
    ]).then(([metadata, art, nextMetas]) => {
      if (cancelled) return
      setCollectionMetadata(metadata)
      setCollectionArt(art)
      setMetas(nextMetas)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const games = useMemo(
    () =>
      uniqueLibraryGames(
        [
          ...sideloadedLibrary,
          ...epic.library,
          ...gog.library,
          ...amazon.library,
          ...zoom.library
        ],
        hiddenGames.list.map((game) => game.appName)
      ),
    [
      sideloadedLibrary,
      epic.library,
      gog.library,
      amazon.library,
      zoom.library,
      hiddenGames.list
    ]
  )

  const relatedGroups = useMemo(() => {
    if (!gameInfo) return []
    const metadata = collectionMetadata[collectionMetadataKey(runner, appName)]
    const developers = metadata?.developers?.length
      ? metadata.developers
      : gameInfo.developer
        ? gameInfo.developer
            .split(',')
            .map((item) => item.trim())
            .filter(Boolean)
        : []
    return collectRelatedGames({
      current: gameInfo,
      series: metadata?.series ? [metadata.series] : [],
      developers,
      games,
      metadataFor: (item) =>
        collectionMetadata[collectionMetadataKey(item.runner, item.app_name)],
      artFor: (item) =>
        collectionArt[collectionArtKey(item.runner, item.app_name)],
      steamAppIdFor: (item) => metas[item.app_name]?.steamAppId
    })
  }, [
    gameInfo,
    runner,
    appName,
    games,
    collectionMetadata,
    collectionArt,
    metas
  ])

  let description = ''

  if (runner !== 'sideload') {
    description =
      gameExtraInfo?.about?.shortDescription ||
      gameExtraInfo?.about?.description ||
      t('generic.noDescription', 'No description available')
  }

  return (
    <div className="summary">
      {description}
      <CollectionRelatedGames
        groups={relatedGroups}
        variant="page"
        onSelect={(game) =>
          navigate(`/gamepage/${game.runner}/${game.app_name}`, {
            state: { gameInfo: game }
          })
        }
      />
    </div>
  )
}

export default Description
