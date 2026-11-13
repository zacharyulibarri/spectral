# Spectral

A lightweight desktop music player: a software-rendered 3D spectrum waterfall behind a clean library/playlist UI. Built with Electron: the interface lives in `renderer/index.html` and talks to the desktop shell through `window.spHost`.

## Run
- Double-click `Spectral.bat` (or `npm start`). `Spectral (no GPU).bat` = Chromium hardware acceleration off. `Spectral (dev).bat` = DevTools on F12.
- First launch scans the library folder(s) (by default your system Music folder; change it, and add more, in Settings > Library); later launches show the cached index instantly and rescan changed files in the background.
- Keys: `Space` play/pause, `Left`/`Right` previous/next track, `Ctrl+Left`/`Ctrl+Right` seek 15 s, `Up`/`Down` volume, `A`-`Z` jump to artist, `Ctrl+F` or `/` search, `Ctrl+H` hide lists, `Ctrl+L` waterfall / light / dark, `Ctrl+,` settings, `Ctrl+D` stats, `F11` full screen.
- Right-click a song in Now Playing or a playlist: **Jump Here Next** marks it to play as soon as the current song ends (or when you press Next); it can be in any list. Right-click a song or album in the library or a playlist: **Show in File Browser**.

## Install on Windows ("Open With")
```
npm run dist        # builds dist/Spectral-Setup-<version>.exe (per-user NSIS installer, no admin needed)
npm run dist:dir    # just dist/win-unpacked/Spectral.exe, for quick checks
npm run icon        # regenerates build/icon.png (tools/make-icon.js)
```
The installer (`build/installer.nsh`) lists Spectral under **Open with** and in **Settings > Apps > Default apps** for mp3, flac, m4a, aac, ogg, oga, opus, wav, webm and for m3u / m3u8 / pls playlists. It does *not* make itself the default: you choose that in Windows. Opening files while Spectral runs sends them to the running window (one instance); selecting several files and choosing Open with is collected into one batch that plays from the first. The installer is unsigned, so Windows SmartScreen will warn ("More info" -> "Run anyway"). Uninstalling removes the registry entries.

Test the packaged app without installing: `node test/packaged.js` (uses `dist/win-unpacked`).

## Where things live
| What | Where |
|---|---|
| Playlists (`*.m3u`, relative paths) | the first library folder chosen on first run (config `playlistDir`) |
| Originals backed up before first change | `%APPDATA%/Spectral/playlist-backups/` |
| Library index, spectra, Now Playing state, settings, config | `%APPDATA%/Spectral/` (`library.json`, `specs.json`, `state.json`, `settings.json`, `config.json`) |

## Later / flagged
- WMA files show an error when played (Chromium can't decode them); convert them to MP3/FLAC. No codec workarounds planned.
- Preserving unknown m3u lines on re-save is not done.

## Layout
- `src/main.js` window, single instance / Open With, IPC, `sp://` protocol (serves the UI and streams audio with Range support), caches, playlist files.
- `src/scanner.js` worker thread: walks folders, reads tags (`music-metadata`), incremental by path+size+mtime.
- `src/preload.js` exposes `window.spHost`, the bridge between the UI and the shell.
- `renderer/index.html` the whole UI and the software-rendered waterfall (library and playlist panes, gapless playback, settings, colour schemes, light/dark modes). With no `window.spHost` it runs against a built-in demo library in any browser.
- `test/` Playwright-driven checks (they need a library; pass a warmed `--user-data` folder as the first argument, `SP_TEST_LIB` for `packaged.js`): `e2e.js` (smoke), `gapless.js` / `realseam.js` (seam measurement), `openwith.js` (argv + single instance).
