import { useTranslation } from 'react-i18next'
import {
  faBorderAll,
  faHardDrive as hardDriveSolid
} from '@fortawesome/free-solid-svg-icons'
import { faHardDrive as hardDriveLight } from '@fortawesome/free-regular-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core'
import CollectionDropdown from './CollectionDropdown'
import './InstallFilterMenu.css'

export type InstallFilter = 'all' | 'installed' | 'uninstalled'

type Props = {
  value: InstallFilter
  onChange: (value: InstallFilter) => void
}

const ICONS: Record<InstallFilter, IconDefinition> = {
  all: faBorderAll,
  installed: hardDriveSolid,
  uninstalled: hardDriveLight
}

export default function InstallFilterMenu({ value, onChange }: Props) {
  const { t } = useTranslation()

  const labels: Record<InstallFilter, string> = {
    all: t('collection.filter.all', 'All games'),
    installed: t('collection.filter.installed', 'Installed'),
    uninstalled: t(
      'collection.filter.uninstalled',
      'Not installed / Uninstalled'
    )
  }

  return (
    <CollectionDropdown
      title={
        <span
          className="collection__toolLabel"
          title={`${t('collection.filter.menu', 'Install filter')}: ${labels[value]}`}
        >
          <FontAwesomeIcon icon={ICONS[value]} />
        </span>
      }
      className="collectionInstallFilterMenu"
      buttonClass="collection__toolBtn"
      popUpOnHover
    >
      {(Object.keys(labels) as InstallFilter[]).map((key) => (
        <button
          key={key}
          type="button"
          className={`collectionInstallFilterMenu__item${value === key ? ' is-active' : ''}`}
          onClick={() => onChange(key)}
        >
          <FontAwesomeIcon icon={ICONS[key]} />
          {labels[key]}
        </button>
      ))}
    </CollectionDropdown>
  )
}
