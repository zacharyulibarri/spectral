# Spectral

A lightweight desktop music player: a software-rendered 3D spectrum waterfall behind a clean library/playlist UI. Built with Electron: the interface lives in `renderer/index.html` and talks to the desktop shell through `window.spHost`.

New here? Read the **[quick start guide](docs/QUICKSTART.md)**.



https://github.com/user-attachments/assets/5367a29b-1e75-43e9-896d-3809cebb0f4a



## Run
- Double-click `Spectral.bat` (or `npm start`). `Spectral (no GPU).bat` = Chromium hardware acceleration off. `Spectral (dev).bat` = DevTools on F12.
- First launch shows a welcome screen where you choose the music folder(s); change them later in Settings > Library. Later launches show the cached index instantly and rescan changed files in the background.
- Media keys and Bluetooth headset buttons (play/pause, next, previous) work through the system media controls; Settings > Playback can hide the Windows media overlay.
- Keys: `Space` play/pause, `Left`/`Right` previous/next track, `Ctrl+Left`/`Ctrl+Right` seek 15 s, `Up`/`Down` volume, `A`-`Z` jump to artist, `Ctrl+F` or `/` search, `Ctrl+H` hide lists, `Ctrl+L` waterfall / light / dark, `Ctrl+T` next color scheme, `Ctrl+B` blue / black background, `Ctrl+,` settings, `Ctrl+D` stats, `F11` full screen.
- Right-click a song in Now Playing or a playlist: **Jump Here Next** marks it to play as soon as the current song ends (or when you press Next); it can be in any list. Right-click a song or album in the library or a playlist: **Show in File Browser**. Right-click an artist, album or song: **Edit tags…** (writes tags into MP3, FLAC and M4A files, with undo).

## Install on Windows ("Open With")
```
npm run dist        # builds dist/Spectral-Setup-<version>.exe (NSIS installer; it asks whether to install for everyone, which needs administrator approval, or just for you)
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
| Library index, spectra, Now Playing state, settings, config | `%APPDATA%/Spectral/` (`library.json`, `specs.json`, `state.json`, `settings.json`, `config.json`, `tag-undo.json`) |

## License
MIT. Copyright (c) 2026 Zach Ulibarri: use it, change it, ship it, as long as the copyright notice in [LICENSE](LICENSE) stays with it. The bundled Rajdhani font is under the SIL Open Font License (`renderer/fonts/LICENSE-Rajdhani.txt`).

## Later / flagged
- WMA files show an error when played (Chromium can't decode them); convert them to MP3/FLAC. No codec workarounds planned.
- Preserving unknown m3u lines on re-save is not done.

## Layout
- `src/main.js` window, single instance / Open With, IPC, `sp://` protocol (serves the UI and streams audio with Range support), caches, playlist files.
- `src/tagedit.js` writes tags for the Edit tags dialog: a surgical ID3v2 editor for MP3 (only the changed frames are replaced, everything else is copied byte for byte), music-metadata's writer for FLAC and M4A; every write is verified and reversible.
- `src/scanner.js` worker thread: walks folders, reads tags (`music-metadata`), incremental by path+size+mtime.
- `src/preload.js` exposes `window.spHost`, the bridge between the UI and the shell.
- `renderer/index.html` the whole UI and the software-rendered waterfall (library and playlist panes, gapless playback, settings, color schemes, light/dark modes). With no `window.spHost` it runs against a built-in demo library in any browser.
- `test/` Playwright-driven checks (they need a library; pass a warmed `--user-data` folder as the first argument, `SP_TEST_LIB` for `packaged.js`): `e2e.js` (smoke), `gapless.js` / `realseam.js` (seam measurement), `openwith.js` (argv + single instance), `media.js` (media keys, the overlay setting, the first-run welcome screen), `scrub.js` (dragging the progress bar), `random.js` (the random songs button), `playnext.js` (Play Next), `spectilt.js` (the flatten-spectrum setting), `hotkeys.js` (Ctrl+T / Ctrl+B), `tagedit.js` (tag writer against copies of real files) and `edittags_ui.js` (the Edit tags dialog end to end, on a temporary copy of a few files).
