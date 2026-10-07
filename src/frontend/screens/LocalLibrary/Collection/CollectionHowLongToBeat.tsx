import { useTranslation } from 'react-i18next'
import type { HeroicHowLongToBeatEntry } from 'backend/wiki_game_info/howlongtobeat/utils'
import { createNewWindow } from 'frontend/helpers'

type Props = {
  info: HeroicHowLongToBeatEntry
  playedMinutes?: number
}

function formatHours(value?: number) {
  if (!value) return '—'
  const totalMinutes = Math.round(value * 60)
  const hours = Math.floor(totalMinutes / 60)
  const mins = totalMinutes % 60
  if (!hours) return `${mins}m`
  if (!mins) return `${hours}h`
  return `${hours}h ${mins}m`
}

export default function CollectionHowLongToBeat({
  info,
  playedMinutes = 0
}: Props) {
  const { t } = useTranslation('gamepage')

  if (!info.mainStory && !info.mainExtra) return null

  const maxHours = Math.max(
    info.completionist || 0,
    info.mainExtra || 0,
    info.mainStory || 0
  )
  const playedHours = playedMinutes / 60
  const markerPct =
    maxHours > 0 && playedHours > 0
      ? Math.min(100, (playedHours / maxHours) * 100)
      : null
  const webLink = info.gameWebLink
  const openPage = () => {
    if (webLink) createNewWindow(webLink)
  }

  const stats = [
    {
      key: 'main',
      label: t('how-long-to-beat.main-story', 'Main Story'),
      value: formatHours(info.mainStory)
    },
    {
      key: 'extra',
      label: t('how-long-to-beat.main-plus-extras', 'Main + Extras'),
      value: formatHours(info.mainExtra)
    },
    {
      key: 'complete',
      label: t('how-long-to-beat.completionist', 'Completionist'),
      value: formatHours(info.completionist)
    }
  ]

  const inner = (
    <>
      <div className="collectionFocus__hltbBar" aria-hidden="true">
        <span className="is-main" />
        <span className="is-extra" />
        <span className="is-complete" />
        {markerPct !== null && (
          <i
            className="collectionFocus__hltbMarker"
            style={{ left: `${markerPct}%` }}
          />
        )}
      </div>
      <div className="collectionFocus__hltbStats">
        {stats.map((stat) => (
          <div key={stat.key}>
            <span className="collectionFocus__hltbLabel">{stat.label}</span>
            <span className="collectionFocus__hltbTime">{stat.value}</span>
          </div>
        ))}
      </div>
    </>
  )

  return (
    <section className="collectionFocus__hltbCard">
      <h3>{t('howLongToBeat', 'How Long To Beat')}</h3>
      {webLink ? (
        <button
          type="button"
          className="collectionFocus__panel collectionFocus__panel--facts collectionFocus__hltbPanel"
          aria-label={t('howLongToBeat', 'How Long To Beat')}
          onClick={openPage}
        >
          {inner}
        </button>
      ) : (
        <div className="collectionFocus__panel collectionFocus__panel--facts">
          {inner}
        </div>
      )}
    </section>
  )
}
