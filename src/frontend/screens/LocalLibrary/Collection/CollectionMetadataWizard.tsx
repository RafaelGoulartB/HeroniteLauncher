import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type {
  CollectionMetadataBulkItem,
  CollectionMetadataBulkProgress
} from 'common/types/local-library'
import { ToggleSwitch } from 'frontend/components/UI'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader
} from 'frontend/components/UI/Dialog'
import './CollectionMetadataWizard.css'

type Props = {
  games: CollectionMetadataBulkItem[]
  progress: CollectionMetadataBulkProgress
  onHide: () => void
  onProgress: (progress: CollectionMetadataBulkProgress) => void
}

export default function CollectionMetadataWizard({
  games,
  progress,
  onHide,
  onProgress
}: Props) {
  const { t } = useTranslation()
  const [skipExisting, setSkipExisting] = useState(true)
  const [keepManual, setKeepManual] = useState(true)
  const [downloadImages, setDownloadImages] = useState(false)
  const running =
    progress.state === 'running' || progress.state === 'cancelling'
  const done = progress.state === 'done'

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.stopImmediatePropagation()
      onHide()
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [onHide])

  async function start() {
    const next = await window.api.localLibrary.startMetadataBulk({
      games,
      overwriteExisting: !skipExisting,
      preserveManual: keepManual,
      downloadImages
    })
    onProgress(next)
  }

  async function cancel() {
    const next = await window.api.localLibrary.cancelMetadataBulk()
    onProgress(next)
  }

  const statusLabel = running
    ? t(
        'collection.metadata.wizard.progress',
        '{{percent}}% — {{processed}} of {{total}}',
        {
          percent: progress.percent,
          processed: progress.processed,
          total: progress.total
        }
      )
    : done
      ? t(
          'collection.metadata.wizard.done',
          'Updated {{updated}}, skipped {{skipped}}, failed {{failed}}.',
          {
            updated: progress.updated,
            skipped: progress.skipped,
            failed: progress.failed
          }
        )
      : t(
          'collection.metadata.wizard.ready',
          '{{count}} games in Collection will be checked.',
          { count: games.length }
        )

  return (
    <Dialog
      onClose={onHide}
      showCloseButton
      className="CollectionMetadataWizard"
    >
      <DialogHeader>
        {t('collection.metadata.wizard.title', 'Download metadata')}
      </DialogHeader>
      <DialogContent className="CollectionMetadataWizard__content">
        <p>
          {t(
            'collection.metadata.wizard.help',
            'Fetches IGDB first, then Steam, store, Lutris, and Playnite data. You can hide this window; the download keeps going. Open it again from the icon in the Collection header.'
          )}
        </p>
        {!running && !done && (
          <>
            <ToggleSwitch
              htmlId="metadata-skip-existing"
              value={skipExisting}
              handleChange={() => setSkipExisting((value) => !value)}
              title={t(
                'collection.metadata.wizard.skip',
                'Skip games that already have metadata'
              )}
            />
            <ToggleSwitch
              htmlId="metadata-keep-manual"
              value={keepManual}
              handleChange={() => setKeepManual((value) => !value)}
              title={t(
                'collection.metadata.wizard.keepManual',
                'Keep fields edited by hand'
              )}
            />
            <p className="CollectionMetadataWizard__hint">
              {t(
                'collection.metadata.wizard.keepManualHelp',
                'Name, notes, and any field you changed in Game settings stay as they are. Other empty or downloaded fields can still update from IGDB.'
              )}
            </p>
            <ToggleSwitch
              htmlId="metadata-download-images"
              value={downloadImages}
              handleChange={() => setDownloadImages((value) => !value)}
              title={t(
                'collection.metadata.wizard.images',
                'Copy covers locally (uses more disk)'
              )}
            />
          </>
        )}
        <div
          className="CollectionMetadataWizard__meter"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress.percent}
        >
          <div
            className="CollectionMetadataWizard__fill"
            style={{ width: `${progress.percent}%` }}
          />
        </div>
        <p className="CollectionMetadataWizard__status">{statusLabel}</p>
        {progress.currentTitle && running && (
          <p className="CollectionMetadataWizard__current">
            {progress.state === 'cancelling'
              ? t(
                  'collection.metadata.wizard.cancelling',
                  'Stopping after this game…'
                )
              : progress.currentTitle}
          </p>
        )}
        {progress.errors.length > 0 && (
          <pre className="CollectionMetadataWizard__error">
            {progress.errors.join('\n')}
          </pre>
        )}
      </DialogContent>
      <DialogFooter>
        {!running && (
          <button
            className="button is-primary"
            disabled={!games.length}
            onClick={() => void start()}
          >
            {done
              ? t('collection.metadata.wizard.again', 'Run again')
              : t('collection.metadata.wizard.start', 'Start')}
          </button>
        )}
        {running && (
          <button className="button outline" onClick={() => void cancel()}>
            {progress.state === 'cancelling'
              ? t(
                  'collection.metadata.wizard.cancelling',
                  'Stopping after this game…'
                )
              : t('collection.metadata.wizard.cancel', 'Stop')}
          </button>
        )}
        <button
          className={running ? 'button is-primary' : 'button outline'}
          onClick={onHide}
        >
          {running
            ? t('collection.metadata.wizard.hide', 'Hide')
            : t('box.close', 'Close')}
        </button>
      </DialogFooter>
    </Dialog>
  )
}
