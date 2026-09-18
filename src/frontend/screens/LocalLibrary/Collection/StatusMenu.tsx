import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Flag } from '@mui/icons-material'
import CollectionDropdown from './CollectionDropdown'
import { ToggleSwitch } from 'frontend/components/UI'
import ManageStatusesDialog from './ManageStatusesDialog'
import './StatusMenu.css'

type Props = {
  groupByStatus: boolean
  onGroupByStatusChange: (value: boolean) => void
  onStatusesChanged: () => void
}

export default function StatusMenu({
  groupByStatus,
  onGroupByStatusChange,
  onStatusesChanged
}: Props) {
  const { t } = useTranslation()
  const [manageOpen, setManageOpen] = useState(false)

  return (
    <>
      <CollectionDropdown
        title={
          <span
            className="collection__toolLabel"
            title={t('collection.status.menu', 'Status')}
          >
            <Flag />
          </span>
        }
        className="collectionStatusMenu"
        buttonClass="collection__toolBtn"
        popUpOnHover
      >
        <ToggleSwitch
          htmlId="collection-group-status"
          value={groupByStatus}
          handleChange={() => onGroupByStatusChange(!groupByStatus)}
          title={t('collection.group', 'Group by status')}
        />
        <hr />
        <button
          type="button"
          className="collectionStatusMenu__item"
          onClick={() => setManageOpen(true)}
        >
          {t('collection.status.manage', 'Manage statuses…')}
        </button>
      </CollectionDropdown>
      {manageOpen && (
        <ManageStatusesDialog
          onClose={() => {
            setManageOpen(false)
            onStatusesChanged()
          }}
        />
      )}
    </>
  )
}
