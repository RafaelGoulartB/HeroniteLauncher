import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  faChevronDown,
  faChevronUp,
  faTrash
} from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import type {
  CompletionStatus,
  CompletionStatusSlug
} from 'common/types/local-library'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader
} from 'frontend/components/UI/Dialog'
import { STATUS_COLORS } from './statusColors'
import './ManageStatusesDialog.css'

type Props = {
  onClose: () => void
}

export default function ManageStatusesDialog({ onClose }: Props) {
  const { t } = useTranslation()
  const [statuses, setStatuses] = useState<CompletionStatus[]>([])
  const [newName, setNewName] = useState('')
  const [saving, setSaving] = useState(false)

  async function reload() {
    setStatuses(await window.api.localLibrary.getStatuses())
  }

  useEffect(() => {
    void reload()
  }, [])

  async function persist(next: Promise<CompletionStatus[]>) {
    setSaving(true)
    try {
      setStatuses(await next)
    } finally {
      setSaving(false)
    }
  }

  async function handleRename(status: CompletionStatus, name: string) {
    const trimmed = name.trim()
    if (!trimmed) {
      await reload()
      return
    }
    await persist(
      window.api.localLibrary.upsertStatus({ ...status, name: trimmed })
    )
  }

  async function handleMove(index: number, delta: number) {
    const other = index + delta
    if (other < 0 || other >= statuses.length) return
    const ids = statuses.map((item) => item.id)
    const [moved] = ids.splice(index, 1)
    ids.splice(other, 0, moved)
    await persist(window.api.localLibrary.reorderStatuses(ids))
  }

  async function handleDelete(id: string) {
    if (statuses.length <= 1) return
    await persist(window.api.localLibrary.deleteStatus(id))
  }

  async function handleAdd() {
    const name = newName.trim()
    if (!name) return
    await persist(
      window.api.localLibrary.upsertStatus({
        id: `custom_${Date.now()}`,
        name,
        slug: 'custom' as CompletionStatusSlug,
        sortOrder: 10 * (statuses.length + 1)
      })
    )
    setNewName('')
  }

  return (
    <Dialog onClose={onClose} showCloseButton className="ManageStatusesDialog">
      <DialogHeader>
        {t('collection.status.manageTitle', 'Manage statuses')}
      </DialogHeader>
      <DialogContent className="ManageStatusesDialog__content">
        <p>
          {t(
            'collection.status.manageHelp',
            'Rename, reorder, or remove statuses. Games on a removed status move to another one.'
          )}
        </p>
        <ul className="ManageStatusesDialog__list">
          {statuses.map((status, index) => (
            <li key={status.id} className="ManageStatusesDialog__row">
              <span
                className="collection__dot"
                style={{ background: STATUS_COLORS[status.slug] }}
              />
              <input
                aria-label={status.name}
                value={status.name}
                disabled={saving}
                onChange={(event) => {
                  const name = event.target.value
                  setStatuses((current) =>
                    current.map((item) =>
                      item.id === status.id ? { ...item, name } : item
                    )
                  )
                }}
                onBlur={(event) =>
                  void handleRename(status, event.target.value)
                }
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.currentTarget.blur()
                  }
                }}
              />
              <button
                type="button"
                className="ManageStatusesDialog__icon"
                disabled={saving || index === 0}
                title={t('collection.status.moveUp', 'Move up')}
                onClick={() => void handleMove(index, -1)}
              >
                <FontAwesomeIcon icon={faChevronUp} />
              </button>
              <button
                type="button"
                className="ManageStatusesDialog__icon"
                disabled={saving || index === statuses.length - 1}
                title={t('collection.status.moveDown', 'Move down')}
                onClick={() => void handleMove(index, 1)}
              >
                <FontAwesomeIcon icon={faChevronDown} />
              </button>
              <button
                type="button"
                className="ManageStatusesDialog__icon"
                disabled={saving || statuses.length <= 1}
                title={t('collection.status.remove', 'Remove')}
                onClick={() => void handleDelete(status.id)}
              >
                <FontAwesomeIcon icon={faTrash} />
              </button>
            </li>
          ))}
        </ul>
        <form
          className="ManageStatusesDialog__add"
          onSubmit={(event) => {
            event.preventDefault()
            void handleAdd()
          }}
        >
          <input
            value={newName}
            disabled={saving}
            onChange={(event) => setNewName(event.target.value)}
            placeholder={t('collection.newStatus', 'New status')}
          />
          <button
            type="submit"
            className="button is-primary"
            disabled={saving || !newName.trim()}
          >
            {t('collection.addStatus', 'Add')}
          </button>
        </form>
      </DialogContent>
      <DialogFooter>
        <button className="button outline" onClick={onClose}>
          {t('box.close', 'Close')}
        </button>
      </DialogFooter>
    </Dialog>
  )
}
