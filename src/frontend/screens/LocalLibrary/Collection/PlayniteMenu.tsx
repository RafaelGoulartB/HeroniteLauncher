import { useContext, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { SyncAlt } from '@mui/icons-material'
import CollectionDropdown from './CollectionDropdown'
import ContextProvider from 'frontend/state/ContextProvider'
import ImportPlayniteDialog from 'frontend/screens/LocalLibrary/ImportPlayniteDialog'
import MergePlayniteDialog from './MergePlayniteDialog'
import './PlayniteMenu.css'

type Props = {
  onLibraryChanged: () => void
}

export default function PlayniteMenu({ onLibraryChanged }: Props) {
  const { t } = useTranslation()
  const { showDialogModal } = useContext(ContextProvider)
  const [importOpen, setImportOpen] = useState(false)
  const [mergeOpen, setMergeOpen] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [lastPath, setLastPath] = useState<string | undefined>()

  useEffect(() => {
    void window.api.localLibrary.getLastLibraryPath().then(setLastPath)
  }, [importOpen])

  async function handleExport() {
    const folder = await window.api.openDialog({
      title: t(
        'collection.playnite.exportFolder',
        'Choose a folder for the Playnite export'
      ),
      properties: ['openDirectory', 'createDirectory']
    })
    if (!folder) return
    setExporting(true)
    try {
      const result = await window.api.localLibrary.exportLibrary(folder)
      showDialogModal({
        showDialog: true,
        type: 'MESSAGE',
        title: t('collection.playnite.exportTitle', 'Export for Playnite'),
        message: t(
          'collection.playnite.exportDone',
          'Exported {{count}} games to {{path}}. Copy this file to Windows when you want Playnite to pick up Heroic playtime and status.',
          { count: result.gameCount, path: result.path }
        ),
        buttons: [
          {
            text: t('box.show-in-folder', 'Show in folder'),
            onClick: () => window.api.showItemInFolder(result.path)
          },
          { text: t('box.close', 'Close') }
        ]
      })
    } catch (error) {
      showDialogModal({
        showDialog: true,
        type: 'ERROR',
        title: t('collection.playnite.exportTitle', 'Export for Playnite'),
        message: String(error)
      })
    } finally {
      setExporting(false)
    }
  }

  return (
    <>
      <CollectionDropdown
        title={
          <span
            className="collection__toolLabel"
            title={t('collection.playnite.menu', 'Playnite')}
          >
            <SyncAlt />
          </span>
        }
        className="collectionPlayniteMenu"
        buttonClass="collection__toolBtn"
        popUpOnHover
      >
        <button
          type="button"
          className="collectionPlayniteMenu__item"
          onClick={() => setImportOpen(true)}
        >
          {t('collection.playnite.import', 'Import library…')}
        </button>
        <button
          type="button"
          className="collectionPlayniteMenu__item"
          disabled={!lastPath}
          title={
            lastPath ||
            t(
              'collection.playnite.needImport',
              'Import a library first to enable merge'
            )
          }
          onClick={() => setMergeOpen(true)}
        >
          {t('collection.playnite.merge', 'Merge from Playnite')}
        </button>
        <button
          type="button"
          className="collectionPlayniteMenu__item"
          disabled={exporting}
          onClick={() => void handleExport()}
        >
          {exporting
            ? t('collection.playnite.exporting', 'Exporting…')
            : t('collection.playnite.export', 'Export for Playnite…')}
        </button>
      </CollectionDropdown>
      {importOpen && (
        <ImportPlayniteDialog
          onClose={() => {
            setImportOpen(false)
            onLibraryChanged()
          }}
        />
      )}
      {mergeOpen && (
        <MergePlayniteDialog
          onClose={() => setMergeOpen(false)}
          onMerged={onLibraryChanged}
        />
      )}
    </>
  )
}
