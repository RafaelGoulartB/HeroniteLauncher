import { useTranslation } from 'react-i18next'
import { SortByAlpha } from '@mui/icons-material'
import CollectionDropdown from './CollectionDropdown'
import './SortMenu.css'

export type CollectionSort = 'title' | 'lastPlayed' | 'playtime'

type Props = {
  value: CollectionSort
  onChange: (value: CollectionSort) => void
}

export default function SortMenu({ value, onChange }: Props) {
  const { t } = useTranslation()

  const labels: Record<CollectionSort, string> = {
    title: t('collection.sort.title', 'Title'),
    lastPlayed: t('collection.sort.lastPlayed', 'Last played'),
    playtime: t('collection.sort.playtime', 'Playtime')
  }

  return (
    <CollectionDropdown
      title={
        <span
          className="collection__toolLabel"
          title={`${t('collection.sort.menu', 'Sort')}: ${labels[value]}`}
        >
          <SortByAlpha />
        </span>
      }
      className="collectionSortMenu"
      buttonClass="collection__toolBtn"
      popUpOnHover
    >
      {(Object.keys(labels) as CollectionSort[]).map((key) => (
        <button
          key={key}
          type="button"
          className={`collectionSortMenu__item${value === key ? ' is-active' : ''}`}
          onClick={() => onChange(key)}
        >
          {labels[key]}
        </button>
      ))}
    </CollectionDropdown>
  )
}
