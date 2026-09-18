import { useContext, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader
} from 'frontend/components/UI/Dialog'
import ContextProvider from 'frontend/state/ContextProvider'
import type { PlayniteMergePreview } from 'common/types/local-library'
import './MergePlayniteDialog.css'

type Props = {
  onClose: () => void
  onMerged: () => void
}

function previewList(
  items: PlayniteMergePreview['newGames'],
  renderItem: (item: PlayniteMergePreview['newGames'][number]) => string,
  empty: string
) {
  if (!items.length)
    return <p className="MergePlayniteDialog__empty">{empty}</p>
  const visible = items.slice(0, 12)
  return (
    <>
      <ul>
        {visible.map((item) => (
          <li key={item.playniteId}>{renderItem(item)}</li>
        ))}
      </ul>
      {items.length > visible.length ? (
        <p className="MergePlayniteDialog__more">
          +{items.length - visible.length}
        </p>
      ) : null}
    </>
  )
}

export default function MergePlayniteDialog({ onClose, onMerged }: Props) {
  const { t } = useTranslation()
  const { showDialogModal, refreshLibrary } = useContext(ContextProvider)
  const [preview, setPreview] = useState<PlayniteMergePreview | null>(null)
  const [loading, setLoading] = useState(true)
  const [merging, setMerging] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    void window.api.localLibrary
      .previewMerge()
      .then((next) => {
        setPreview(next)
        if (next.errors.length) setError(next.errors.join('\n'))
      })
      .catch((err) => setError(String(err)))
      .finally(() => setLoading(false))
  }, [])

  async function handleMerge() {
    setMerging(true)
    try {
      const result = await window.api.localLibrary.mergeLibrary()
      await refreshLibrary({
        library: 'sideload',
        runInBackground: false
      })
      onMerged()
      const failed =
        result.errors.length > 0 && result.imported + result.updated === 0
      const errorText = result.errors.length
        ? `\n${result.errors.slice(0, 4).join('\n')}`
        : ''
      showDialogModal({
        showDialog: true,
        type: failed ? 'ERROR' : 'MESSAGE',
        title: t('collection.playnite.mergeTitle', 'Playnite merge'),
        message: failed
          ? result.errors.join('\n')
          : t(
              'collection.playnite.mergeDone',
              'Merged without overwriting your Heroic status. New games {{imported}}, updated {{updated}}, sessions {{sessions}}, skipped {{skipped}}.{{errors}}',
              {
                imported: result.imported,
                updated: result.updated,
                sessions: result.sessionsImported,
                skipped: result.skipped,
                errors: errorText
              }
            )
      })
      onClose()
    } catch (err) {
      setError(String(err))
    } finally {
      setMerging(false)
    }
  }

  const blocked = Boolean(error && !preview?.libraryPath)

  return (
    <Dialog onClose={onClose} showCloseButton className="MergePlayniteDialog">
      <DialogHeader>
        {t('collection.playnite.mergeTitle', 'Playnite merge')}
      </DialogHeader>
      <DialogContent className="MergePlayniteDialog__content">
        {loading ? (
          <p>
            {t('collection.playnite.previewing', 'Reading Playnite library…')}
          </p>
        ) : (
          <>
            <p>
              {t(
                'collection.playnite.mergeHelp',
                'This merges Playnite into Heroic. Status you changed here is kept. Playtime takes the higher value. New Playnite games are added.'
              )}
            </p>
            {preview && (
              <>
                <ul className="MergePlayniteDialog__counts">
                  <li>
                    {t('collection.playnite.previewNew', 'New games')}:{' '}
                    {preview.newGames.length}
                  </li>
                  <li>
                    {t(
                      'collection.playnite.previewPlaytime',
                      'Playtime increases'
                    )}
                    : {preview.playtimeUpdates.length}
                  </li>
                  <li>
                    {t(
                      'collection.playnite.previewStatus',
                      'Status from Playnite'
                    )}
                    : {preview.statusFromPlaynite.length}
                  </li>
                  <li>
                    {t(
                      'collection.playnite.previewConflicts',
                      'Status conflicts (keep Heroic)'
                    )}
                    : {preview.statusConflicts.length}
                  </li>
                  <li>
                    {t('collection.playnite.previewSessions', 'New sessions')}:{' '}
                    {preview.newSessions}
                  </li>
                  <li>
                    {t('collection.playnite.previewUnchanged', 'Unchanged')}:{' '}
                    {preview.unchanged}
                  </li>
                  <li>
                    {t('collection.playnite.previewSkipped', 'Skipped')}:{' '}
                    {preview.skipped}
                  </li>
                </ul>
                <section>
                  <h4>{t('collection.playnite.previewNew', 'New games')}</h4>
                  {previewList(
                    preview.newGames,
                    (item) => item.title,
                    t('collection.playnite.previewNone', 'None')
                  )}
                </section>
                <section>
                  <h4>
                    {t(
                      'collection.playnite.previewPlaytime',
                      'Playtime increases'
                    )}
                  </h4>
                  {previewList(
                    preview.playtimeUpdates,
                    (item) =>
                      `${item.title}: ${item.heroicMinutes ?? 0}m → ${item.playniteMinutes ?? 0}m`,
                    t('collection.playnite.previewNone', 'None')
                  )}
                </section>
                <section>
                  <h4>
                    {t(
                      'collection.playnite.previewConflicts',
                      'Status conflicts (keep Heroic)'
                    )}
                  </h4>
                  {previewList(
                    preview.statusConflicts,
                    (item) =>
                      `${item.title}: ${item.heroicStatus} / ${item.playniteStatus}`,
                    t('collection.playnite.previewNone', 'None')
                  )}
                </section>
              </>
            )}
          </>
        )}
        {error && <p className="MergePlayniteDialog__error">{error}</p>}
      </DialogContent>
      <DialogFooter>
        <button className="button outline" onClick={onClose}>
          {t('box.close', 'Close')}
        </button>
        <button
          className="button is-primary"
          disabled={loading || merging || blocked}
          onClick={() => void handleMerge()}
        >
          {merging
            ? t('collection.playnite.merging', 'Merging…')
            : t('collection.playnite.mergeConfirm', 'Merge')}
        </button>
      </DialogFooter>
    </Dialog>
  )
}
