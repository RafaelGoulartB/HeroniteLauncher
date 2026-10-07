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

Collection screenshots live in overlay code (`src/local-library/screenshots/**`,
`CollectionScreenshots`). The configured captures folder is read from
`local_library/settings.json` (`screenshots.folder`). Images are served with
`localart://screenshots/…` from that folder (still not `file://`). Game folders
are matched by normalized title: punctuation (`:` vs `-`), editions
(Director's Cut, GOTY), leading articles, compact names, token overlap, and
Steam app IDs. Sequels with different numbers are kept apart.
Grid previews are generated as quality-60 JPEGs at 320×180, cached under
`local_library/screenshot-thumbnails`, limited to two concurrent jobs, and
requested only when they approach the visible area. The full-resolution file
is loaded only after opening a screenshot. The fullscreen viewer can move an
original to the system trash after confirmation. The cache defaults to 500 MB,
evicts least-recently-used previews, removes entries whose originals no longer
exist, and can be resized or cleared from Collection settings. The gallery
renders 50 screenshots initially and adds subsequent batches on request.
An optional global shortcut captures the display under the pointer only while
a launched game is active. The Electron main process writes the PNG directly
to the matched game folder and notifies the open Collection gallery. This is an
external desktop capture: it does not inject into the game process, Wine, or
Proton. The shortcut is disabled by default, is registered only for the
duration of a game session, and its registration status is shown in Collection
settings. On Wayland, the Heronite installer uses the reverse-DNS desktop ID
`com.heronite.launcher`, which is also set in Electron before `ready` so the
GlobalShortcuts portal can resolve the application. A desktop notification
confirms each saved capture and reports capture or shortcut-registration
failures. On Hyprland, where the portal can report a shortcut as registered
without delivering its activation, the service installs an in-memory,
non-consuming compositor binding only for the active game session. It signals
the Electron main process and uses `grim` for the actual display capture; no
Hyprland configuration file is changed.

## Upstream hooks (keep these diffs small when merging)

| File                                                                                            | Change                                                                                                                                                                                                                                                                                                                             |
| ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/common/types/ipc.ts`                                                                       | IPC methods for Playnite, Steam URI, Collection backup, Steam details, Collection art / web image search, Collection metadata bulk progress, force-clear playing, remove from Collection, Collection game details edit, emulator detect/scan/import, emulator save states, Collection screenshots, Local executable launch options |
| `src/backend/storeManagers/sideload/library.ts`                                                 | `init()` / `refresh()` → local install state; `addNewApp` syncs the chosen executable into overlay meta                                                                                                                                                                                                                            |
| `src/backend/storeManagers/sideload/games.ts`                                                   | Steam URI / emulator launch, wait for game, stop PID                                                                                                                                                                                                                                                                               |
| `src/backend/wiki_game_info/` (`howlongtobeat/utils.ts`, `wiki_game_info.ts`, `ipc_handler.ts`) | HowLongToBeat title search (current site token protocol, honeypot fields optional), preferred Collection title, retry cached misses once per session                                                                                                                                                                               |
| `src/backend/launcher.ts`                                                                       | Collection screenshot session lifetime, `recordLocalSession()` / Ludusavi backup after play                                                                                                                                                                                                                                        |
| `src/backend/main.ts`                                                                           | Enable Electron's global-shortcut portal before ready on Linux; `registerLocalArtScheme()` / `initLocalArtProtocol()` next to image cache                                                                                                                                                                                          |
| `src/preload/api/index.ts`                                                                      | export `localLibrary`                                                                                                                                                                                                                                                                                                              |
| `src/frontend/screens/Game/GamePage/index.tsx`                                                  | session history next to TimeContainer                                                                                                                                                                                                                                                                                              |
| `src/frontend/screens/Library/components/LibraryHeader/index.css`                               | spacing for the Collection/Library split                                                                                                                                                                                                                                                                                           |
| `src/frontend/components/UI/LibraryFilters/index.tsx`                                           | "Other" → "Local"                                                                                                                                                                                                                                                                                                                  |
| `electron.vite.config.ts`                                                                       | alias `local-library`; keep `ws` / optional native addons external so Vite does not throw on missing `bufferutil`; suppress the overlay's intentional dynamic/static import chunk warnings                                                                                                                                         |
| `src/frontend/App.tsx`                                                                          | Collection is index `/`; Library at `/library`                                                                                                                                                                                                                                                                                     |
| `src/frontend/components/UI/Sidebar/components/SidebarLinks/`                                   | Collection is home; Library at `/library`                                                                                                                                                                                                                                                                                          |
| `src/frontend/components/UI/Sidebar/components/SidebarItem/`                                    | `end` so `/` does not stay active everywhere                                                                                                                                                                                                                                                                                       |
| `public/locales/en/gamepage.json`                                                               | Collection, session, Steam, and Ludusavi translations                                                                                                                                                                                                                                                                              |
| `public/locales/en/translation.json`                                                            | Collection, Playnite, Local import, backup, art, status, and screenshot translations                                                                                                                                                                                                                                               |
| `package.json` / `pnpm-lock.yaml` / `electron-builder.yml`                                      | `sharp` for cached Collection previews; unpack its native `@img` runtime so packaged builds load libvips; keep externalized `ws` as a production dependency                                                                                                                                                                        |

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
uninstalled covers, cover aspect), screenshots folder, backup folder, schedule,
Ludusavi options, and metadata source priority / IGDB credentials in
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

Collection Play on an emulated game offers the emulator's save states before
launching (overlay only: `src/local-library/emulation/save-states.ts`,
`save-state-engines.ts`, `LaunchStateDialog`, `useEmulatorLaunchFlow`).
Supported: PCSX2, DuckStation, PPSSPP, Dolphin, RetroArch (1.21+ for `-e`),
mGBA and RPCS3 (native, AppImage, Flatpak; not Wine). States are found in each
emulator's own folder (its config file is read for custom folders) and matched
to the ROM by serial / game ID read from the disc image or the emulator's game
list cache, or by ROM file name. For compressed images whose ID cannot be read,
the key is learned from states written during a Collection session and kept in
`saveStateKeys` on the overlay meta. The choice is passed as one-shot launch
arguments (for example `-statefile` on PCSX2/DuckStation) that expire after a
minute; "Start from the beginning" also turns off mGBA / RetroArch state
auto-load for that launch. Launches from the official Library are unchanged.

The Collection header Refresh button runs the saved ROM folders (new games
from each emulator's folder), then Heroic's normal refresh of every store
library plus the Local install state. Each emulator profile keeps one fixed ROM
folder: the scan dialog loads the saved folder and options for the selected
emulator/profile, and saving with another folder updates that scanner instead
of adding a second one.

Local executable games run as Linux or Windows programs from overlay code
(`src/local-library/native-launch.ts`, `CollectionLaunchTab`). The file is
detected (ELF, `#!` script or AppImage → Linux; MZ / `.exe` → Windows), and
Collection game settings → Launch can force "Linux native" or "Windows
(Wine/Proton)" (`runAs` on the overlay meta). Heroic's add/edit dialog starts
at Windows on Linux, so after it saves, `applySideloadAppToLocalMeta` puts the
sideload entry's `install.platform` / `is_linux_native` back to what the file
needs. Linux executables launch through `tryLaunchLocalGame` with Heroic's
own wrappers and environment (MangoHud, GameMode, Gamescope, user wrappers),
but without the umu wrapper that Heroic's native path adds whenever the
game's Wine version is Proton (it started Linux programs through Proton in
the Steam Runtime); umu is kept only when the game enables the Steam Runtime.
