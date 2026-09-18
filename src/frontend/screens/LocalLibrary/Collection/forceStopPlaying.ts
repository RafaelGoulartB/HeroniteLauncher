import type { Runner } from 'common/types'
import type { TFunction } from 'i18next'
import type { DialogModalOptions } from 'frontend/types'

export function confirmForceStopPlaying({
  appName,
  runner,
  title,
  t,
  showDialogModal
}: {
  appName: string
  runner: Runner
  title: string
  t: TFunction<'gamepage'>
  showDialogModal: (options: DialogModalOptions) => void
}) {
  const forceClear = window.api.localLibrary.forceClearPlaying
  if (typeof forceClear !== 'function') {
    void window.api.kill(appName, runner)
    return
  }

  showDialogModal({
    showDialog: true,
    type: 'MESSAGE',
    title: t('collection.playing.forceStopTitle', 'Mark as not playing?'),
    message: t(
      'collection.playing.forceStop',
      '{{title}} still looks like it is running. Mark it as not playing anyway? Playtime tracking will stop even if the game stays open.',
      { title }
    ),
    buttons: [
      {
        text: t('box.yes'),
        onClick: () => {
          void forceClear({ appName, runner })
        }
      },
      { text: t('box.no') }
    ]
  })
}
