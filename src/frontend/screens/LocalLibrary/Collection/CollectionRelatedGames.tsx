import { useState } from 'react'
import classNames from 'classnames'
import { useTranslation } from 'react-i18next'
import { ExpandMore } from '@mui/icons-material'
import type { GameInfo } from 'common/types'
import { CachedImage } from 'frontend/components/UI'
import fallBackImage from 'frontend/assets/heroic_card.jpg'
import type { RelatedGamesGroup } from './relatedGames'
import './CollectionRelatedGames.css'

type Props = {
  groups: RelatedGamesGroup[]
  onSelect: (game: GameInfo) => void
  variant?: 'focus' | 'page'
}

const LABELS: Record<RelatedGamesGroup['kind'], [string, string]> = {
  series: ['collection.focus.sameSeries', 'Same series'],
  developer: ['collection.focus.sameDeveloper', 'Same developer']
}

export default function CollectionRelatedGames({
  groups,
  onSelect,
  variant = 'focus'
}: Props) {
  const { t } = useTranslation()
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  if (!groups.length) return null

  return (
    <section
      className={classNames('collectionRelated', {
        collectionFocus__panel: variant === 'focus',
        'collectionRelated--page': variant === 'page'
      })}
    >
      <h3>{t('collection.focus.related', 'Related games')}</h3>
      <div className="collectionRelated__groups">
        {groups.map((group) => {
          const expanded = !collapsed[group.kind]
          const [key, fallback] = LABELS[group.kind]
          return (
            <div key={group.kind} className="collectionRelated__group">
              <button
                type="button"
                className="collectionRelated__toggle"
                aria-expanded={expanded}
                onClick={() =>
                  setCollapsed((current) => ({
                    ...current,
                    [group.kind]: !current[group.kind]
                  }))
                }
              >
                <ExpandMore className="collectionRelated__chevron" />
                {t(key, fallback)}
              </button>
              {expanded && (
                <div className="collectionRelated__row">
                  {group.items.map((item) => (
                    <button
                      key={`${item.game.runner}_${item.game.app_name}`}
                      type="button"
                      className="collectionRelated__game"
                      title={item.title}
                      onClick={() => onSelect(item.game)}
                    >
                      <CachedImage
                        src={item.cover}
                        fallback={fallBackImage}
                        className="collectionRelated__cover"
                        alt=""
                      />
                      <span className="collectionRelated__title">
                        {item.title}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}
