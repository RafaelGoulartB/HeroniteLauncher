import { useState } from 'react'
import type {
  EmulatorSaveStateList,
  LocalGameMeta
} from 'common/types/local-library'
import PickRomDialog from './PickRomDialog'
import LaunchStateDialog from './LaunchStateDialog'
import { emulatorNeedsRomPick, prepareEmulatorLaunch } from './emulatorLaunch'

type Args = {
  appName: string
  title: string
  meta?: LocalGameMeta
  launchGame: () => Promise<void>
}

// Collection-only pre-launch steps for emulated games: pick a disc when there
// are several, then offer the emulator's save states (when it has any).
export function useEmulatorLaunchFlow({
  appName,
  title,
  meta,
  launchGame
}: Args) {
  const [pickRomOpen, setPickRomOpen] = useState(false)
  const [states, setStates] = useState<EmulatorSaveStateList | null>(null)

  async function continueWithRom(romPath?: string) {
    await prepareEmulatorLaunch(appName, romPath)
    const list = await window.api.localLibrary
      .getEmulatorSaveStates({ appName, romPath })
      .catch(() => undefined)
    if (list?.states.length) {
      setStates(list)
      return
    }
    await window.api.localLibrary.setEmulatorLaunchState({ appName })
    await launchGame()
  }

  async function playWithState(
    list: EmulatorSaveStateList,
    statePath?: string
  ) {
    const ok = await window.api.localLibrary.setEmulatorLaunchState({
      appName,
      romPath: list.romPath,
      statePath
    })
    if (!ok) {
      // The state vanished between listing and launch; show what is left.
      await continueWithRom(list.romPath)
      return
    }
    await launchGame()
  }

  /** Returns true when the click was handled by the emulator flow. */
  function start(): boolean {
    if (meta?.launchKind !== 'emulator') return false
    if (emulatorNeedsRomPick(meta)) {
      setPickRomOpen(true)
      return true
    }
    void continueWithRom()
    return true
  }

  const dialogs = (
    <>
      {pickRomOpen && meta?.roms && (
        <PickRomDialog
          title={title}
          roms={meta.roms}
          selectedPath={meta.selectedRomPath}
          onClose={() => setPickRomOpen(false)}
          onPlay={(romPath) => {
            setPickRomOpen(false)
            void continueWithRom(romPath)
          }}
        />
      )}
      {states && (
        <LaunchStateDialog
          title={title}
          list={states}
          onClose={() => setStates(null)}
          onPlay={(statePath) => {
            const list = states
            setStates(null)
            void playWithState(list, statePath)
          }}
        />
      )}
    </>
  )

  return { start, dialogs }
}
