import React, { type ReactElement, useState } from 'react'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import { ListItemIcon } from '@mui/material'
import { Check, ChevronRight, Flag } from '@mui/icons-material'
import { useTranslation } from 'react-i18next'
import 'frontend/screens/Library/components/ContextMenu/index.css'
import './CollectionContextMenu.css'

export interface CollectionMenuItem {
  icon: ReactElement
  label: string
  onclick: () => void
  show: boolean
}

export interface CollectionStatusOption {
  id: string
  label: string
  color: string
  selected: boolean
}

interface Props {
  children: React.ReactNode
  items: CollectionMenuItem[]
  statuses: CollectionStatusOption[]
  onStatusChange: (statusId: string) => void
}

function CollectionContextMenu({
  children,
  items,
  statuses,
  onStatusChange
}: Props) {
  const { t } = useTranslation()
  const [contextMenu, setContextMenu] = useState<{
    mouseX: number
    mouseY: number
  } | null>(null)
  const [statusOpen, setStatusOpen] = useState(false)

  const handleContextMenu = (event: React.MouseEvent) => {
    event.preventDefault()
    setStatusOpen(false)
    setContextMenu(
      contextMenu === null
        ? {
            mouseX: event.clientX,
            mouseY: event.clientY - 2
          }
        : null
    )
  }

  const handleClose = () => {
    setStatusOpen(false)
    setContextMenu(null)
  }

  const flyoutOnLeft = (contextMenu?.mouseX ?? 0) > window.innerWidth - 280

  return (
    <div
      onContextMenu={handleContextMenu}
      className="collectionContextMenu__wrap"
    >
      {children}
      <Menu
        open={contextMenu !== null}
        onClose={handleClose}
        anchorReference="anchorPosition"
        className="contextMenu collectionContextMenu"
        disableAutoFocusItem
        anchorPosition={
          contextMenu !== null
            ? { top: contextMenu.mouseY, left: contextMenu.mouseX }
            : { top: 0, left: 0 }
        }
      >
        <div className="collectionContextMenu__statusWrap">
          <MenuItem
            onClick={(event) => {
              event.stopPropagation()
              setStatusOpen((open) => !open)
            }}
          >
            <ListItemIcon>
              <Flag />
            </ListItemIcon>
            {t('collection.status.label', 'Status')}
            <ChevronRight className="collectionContextMenu__chevron" />
          </MenuItem>
          {statusOpen && (
            <div
              className={
                flyoutOnLeft
                  ? 'collectionContextMenu__flyout collectionContextMenu__flyout--left'
                  : 'collectionContextMenu__flyout'
              }
              onClick={(event) => event.stopPropagation()}
            >
              {statuses.map((status) => (
                <button
                  key={status.id}
                  type="button"
                  className={
                    status.selected
                      ? 'collectionContextMenu__flyoutItem is-selected'
                      : 'collectionContextMenu__flyoutItem'
                  }
                  onClick={() => {
                    onStatusChange(status.id)
                    handleClose()
                  }}
                >
                  {status.selected ? (
                    <Check fontSize="small" />
                  ) : (
                    <span
                      className="collectionContextMenu__dot"
                      style={{ background: status.color }}
                    />
                  )}
                  {status.label}
                </button>
              ))}
            </div>
          )}
        </div>
        {items.map(
          ({ label, onclick, show, icon }, index) =>
            show && (
              <MenuItem
                key={index}
                onClick={() => {
                  handleClose()
                  onclick()
                }}
              >
                <ListItemIcon>{icon}</ListItemIcon>
                {label}
              </MenuItem>
            )
        )}
      </Menu>
    </div>
  )
}

export default React.memo(CollectionContextMenu)
