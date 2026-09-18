# Fork overlay — Playnite local library

This fork keeps Playnite import, Collection statuses, local-session history,
Playnite merge/export, and Steam URI launch out of Heroic's store architecture.
The Local "store" is the existing `sideload` runner (UI label: Local).

## New files (no upstream equivalent)

- `src/common/types/local-library.ts`
- `src/local-library/**`
- `src/preload/api/localLibrary.ts`
- `src/frontend/screens/LocalLibrary/**`
- `scripts/install-heroic.sh`

## Upstream hooks (keep these diffs small when merging)

| File                                                              | Change                                                                                                                                                                                                                                              |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/common/types/ipc.ts`                                         | IPC methods for Playnite, Steam URI, Collection backup, Steam details, Collection art / web image search, Collection metadata bulk progress, force-clear playing, remove from Collection, Collection game details edit, emulator detect/scan/import |
| `src/backend/storeManagers/sideload/library.ts`                   | `init()` / `refresh()` → local install state; `addNewApp` syncs the chosen executable into overlay meta                                                                                                                                             |
| `src/backend/storeManagers/sideload/games.ts`                     | Steam URI / emulator launch, wait for game, stop PID                                                                                                                                                                                                |
| `src/backend/launcher.ts`                                         | `recordLocalSession()` / Ludusavi backup after play                                                                                                                                                                                                 |
| `src/preload/api/index.ts`                                        | export `localLibrary`                                                                                                                                                                                                                               |
| `src/frontend/screens/Game/GamePage/index.tsx`                    | session history next to TimeContainer                                                                                                                                                                                                               |
| `src/frontend/screens/Library/components/LibraryHeader/index.css` | spacing for the Collection/Library split                                                                                                                                                                                                            |
| `src/frontend/components/UI/LibraryFilters/index.tsx`             | "Other" → "Local"                                                                                                                                                                                                                                   |
| `electron.vite.config.ts`                                         | alias `local-library`                                                                                                                                                                                                                               |
| `src/backend/main.ts`                                             | `registerLocalArtScheme()` / `initLocalArtProtocol()` next to image cache                                                                                                                                                                           |
| `src/frontend/App.tsx`                                            | Collection is index `/`; Library at `/library`                                                                                                                                                                                                      |
| `src/frontend/components/UI/Sidebar/components/SidebarLinks/`     | Collection is home; Library at `/library`                                                                                                                                                                                                           |
| `src/frontend/components/UI/Sidebar/components/SidebarItem/`      | `end` so `/` does not stay active everywhere                                                                                                                                                                                                        |
| `public/locales/en/gamepage.json`                                 | Collection, session, Steam, and Ludusavi translations                                                                                                                                                                                               |
| `public/locales/en/translation.json`                              | Collection, Playnite, Local import, backup, art, and status translations                                                                                                                                                                            |

Sidecar data lives in Electron stores `local_library/library` and
`local_library/sessions`, not in `GameInfo`. Steam Collection heroes are
copied to `local_library/heroes/{steamAppId}.jpg` and served to the UI via
`localart://` (HTTP origins cannot load `file://`). Steam store descriptions
are cached in `local_library/steam-details`. Custom Collection art
overrides live in `local_library/art` and `local_library/art.json`. The
Collection image dialog can search the web (DuckDuckGo, same query Playnite
uses: `"Title" cover` / `"Title" wallpaper`), download the chosen file, and
store it like a local upload.

Collection Install/Uninstall for Steam titles (`launchKind: steam-uri`)
opens the Steam client (`steam://install/<id>` / `steam://uninstall/<id>`)
from overlay code. Official Library, UninstallModal, and sideload uninstall
are unchanged.

Clicking play again on a Collection game that still shows as playing asks
for confirmation, then force-clears the playing status even if the process
is still detected. The game itself is not killed.

Right-click → Remove from Collection deletes a Local (sideload) game from
the overlay list. Steam/Epic installs are not uninstalled.

Collection settings (gear on the Collection header) store appearance (grey
uninstalled covers, cover aspect), backup folder, schedule, Ludusavi options,
and metadata source priority / IGDB credentials in
`local_library/settings.json`. On boot, a
filtered copy of `~/.config/heroic` is written to `heroic-YYYY-MM-DD` when due.
If Ludusavi auto-backup is on, saves are backed up after a game closes.

Collection metadata (IGDB, Steam, store, Lutris, Playnite files) is stored in
`local_library/metadata.json`. Provider images stay as CDN URLs unless the user
enables local copies; Playnite `library/files` covers are copied into
`local_library/metadata-art/` and served as `localart://`.

The Collection game settings dialog (gear on a focused game) edits Collection
sidecar data only: custom art, plus name, notes, description, and the other
fields stored in `local_library/metadata.json`. Tag fields (series, developers,
publishers, genres, themes, game modes, platforms, features) pick from values
already in Collection, or accept a typed name. Edits are marked `manual`. Bulk
metadata download can skip games that already have data, and separately keep
hand-edited fields while still filling the rest from IGDB.
Official GameInfo / store library entries are not rewritten.

Emulators live in overlay stores `local_library/emulators.json` and
`local_library/rom-scanners.json`. Collection games keep `launchKind: emulator`
plus `emulatorId` / ROM paths in `local_library/library`. Launch expands
`{ImagePath}` at play time. ROM folders can be scanned into Collection without
changing the official Library screens.
