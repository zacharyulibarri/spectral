# Spectral quick start

Spectral plays the music already on your computer. Behind the library and playlists, a 3D spectrum waterfall moves with whatever is playing.

## 1. First launch

A welcome screen asks where your music lives.

- **Choose…** sets your *main folder*. Spectral scans it, including every sub-folder, and builds your library. Your playlists (`.m3u` files) are also kept in this folder.
- **Add another folder…** adds more places, for example a second drive. Folders can be added or removed at any time in **Settings → Library**.
- **Start listening** begins the scan. The first scan of a large collection takes a while; you can already browse and play while it runs, and later launches show the saved library instantly and only look at what changed.

Reopen the key tips any time from **Settings → Library → Quick tips**.

Spectral reads each file's tags (artist, album artist, album, title, track number), so it does not matter how your folders are organised. Files without tags fall back to `Artist/Album/01 Title.ext` folder names.

## 2. The window

| Area | What it does |
|---|---|
| **Library** (left) | Every artist, album and song, A to Z. Click an artist or album to open it. |
| **Now Playing** (right, top) | The current song, a small live spectrum, a progress bar (click to seek, or press and drag: the bar and time follow your pointer and the song jumps when you let go; Esc cancels), and the transport buttons: previous, play/pause, next, repeat (off, all, this track), random, mute and volume. |
| **Playlist tabs** (right, bottom) | **Now Playing** is the queue; its **Clear** button removes everything except the song that is playing. Each playlist you open gets its own tab. The **Playlists ▾** button lists them all. |
| **Waterfall** (behind everything) | The spectrum of the song, drawn in 3D. |

The line under the library search shows your song and artist counts. The circular arrow next to it rescans your folders for new, changed and removed files.

## 3. Playing music

- **Double-click** an artist, album or song in the library to add it to Now Playing and play it. Double-click a row in Now Playing or a playlist to play from there.
- **Drag** artists, albums or songs onto the Now Playing list, a playlist tab or a playlist, to add them without interrupting what is playing. Drag inside a list to reorder; hold **Shift** while dropping onto a tab to *move* instead of copy.
- **Right-click** for the full set of actions (see below).
- Open files from Explorer, or drop them on the window, and Spectral plays them. If you install with the Windows installer, Spectral appears under **Open with** for audio files and playlists.

Click a row to select it. **Ctrl+click** and **Shift+click** select several; **Ctrl+A** selects everything in the playlist you last clicked; **Delete** removes the selected songs from that playlist (your files are never deleted).

## 4. Search and navigation

- **Ctrl+F** or **/** jumps to the search box. Type any words from the artist, album or song title; every word must match. Matches open automatically.
- Press a **letter or number** with nothing focused to jump to the first artist starting with it. "The Beatles" sorts under B (change this in Settings).

## 5. Playlists

- **Playlists ▾ → New playlist** creates one. Double-click its title (or use **Rename…** in the tab's right-click menu) to name it.
- Playlists are ordinary `.m3u` files with relative paths, stored in your main folder, so they work in other players too. The first time Spectral changes a playlist that already existed, it keeps a backup copy of the original in its data folder (`playlist-backups`).
- **Import playlist file…** (in the Playlists ▾ menu) opens an `.m3u`, `.m3u8` or `.pls` from anywhere. **Save a copy as .m3u…** (tab right-click menu) writes one wherever you like.
- **Close tab** hides the tab; it does not delete the file.

## 6. Right-click menus

**On library items (artist, album, song):**
- **Add to Now Playing and play**
- **Queue at end of Now Playing**
- **Add to playlist** (an existing one, or a new one)
- **Show in File Browser**

**Edit tags… (on artists, albums and songs, in the library and in playlists)** opens a form with Save and Cancel. See section 7.

**On songs in Now Playing or a playlist:**
- **Play**
- **Jump Here Next**: marks that song to play the moment the current one ends (or when you press Next), even if it is in a different list. It is highlighted with a **NEXT** badge, and you can cancel it from the same menu.
- **Copy to playlist** / **Move to playlist**
- **Remove from this playlist** (never deletes the file)
- **Show in File Browser**
- **Select all**

## 7. Editing tags

Right-click an artist, an album or one or more songs and choose **Edit tags…**. The form depends on what you clicked:

| You right-click | You can change |
|---|---|
| An **artist** | The artist name: the *Album artist* tag on every song listed under it. A checkbox also changes the *track artist* on songs where it matches the old name (it starts ticked when those songs have no album-artist tag). |
| An **album** | Album name, album artist and year, on every song in the album. |
| **Songs** (one, or several selected in a playlist) | Title, artist, album, album artist, track number, disc number and year. With several songs selected, a field that differs between them shows *(multiple values)*; leave it empty to keep each song's own value. |

Edited fields are highlighted, and the form says how many files will change. **Save** writes the new tags into the files; **Cancel** changes nothing.

- Only the **tags** are written: the audio itself is never touched, and every other tag in the file (genre, cover art, comments, ratings and so on) is left exactly as it was. MP3 tags keep the version they already have (ID3v2.2, 2.3 or 2.4).
- Supported formats: **MP3, FLAC and M4A**. Other formats (such as WMA or WAV) are skipped and the form says so.
- Each file is written, read back and checked, and put back if the check fails. If some files cannot be written (read-only, on a disconnected drive, an unusual tag layout), the others are still saved and the form lists what failed and why.
- The song that is playing can be edited too: it carries on from where it was.
- After saving, an **Undo** button appears for a few seconds. You can also use **Settings → Library → Undo tag edit** later: it puts back the tags of the last edit (Spectral remembers the last 25).
- Playlists store file paths, so they are not affected by tag changes.

## 8. Keyboard shortcuts

| Key | Action |
|---|---|
| **Space** | Play / pause |
| **←** / **→** | Previous / next track |
| **Ctrl+←** / **Ctrl+→** | Back / forward 15 seconds |
| **↑** / **↓** | Volume |
| **Ctrl+F**, **/** | Search the library |
| **A–Z, 0–9** | Jump to an artist |
| **Ctrl+H** | Hide / show the lists, to see the waterfall |
| **Ctrl+L** | Cycle waterfall → light → dark mode |
| **Ctrl+,** | Settings |
| **Ctrl+O** | Open audio files |
| **Ctrl+D** | Performance stats |
| **F11** | Full screen |
| **Esc** | Close menus and panels |

The media keys on your keyboard or headset (play/pause, next, previous, stop) work too, even when Spectral is in the background.

## 9. Settings (gear icon, or Ctrl+,)

Changes apply immediately and are remembered.

**Interface**
- List backdrop opacity, text size, and whether "The Beatles" sorts under B.

**Playback**
- **Double-click replaces Now Playing**: when ticked, double-clicking in the library clears Now Playing first. Dragging and the right-click menu never clear it.
- **Gapless transitions**: the next song starts without a gap.
- **Show song in the system media overlay**: the Windows flyout that appears when you press volume or media keys, also used by Bluetooth headsets. Untick it to hide the flyout; the media keys still work. Takes effect after restarting Spectral.

**Library**
- Your main folder and any extra folders, **Rescan now**, **Quick tips**, and **Undo tag edit**.

**Motion, Colour schemes, Look**
- How fast the waterfall flows, camera motion and shot length, ball size, spectrum height and log scaling, reflections, grid and text.
- **Colour schemes**: every new song picks one of the ticked schemes at random. Untick the ones you do not like.

**Performance**
- **Frame-rate cap** and **Adaptive resolution**. A lower cap uses less CPU. For the lowest power use, press **Ctrl+L** to switch to light or dark mode, which stops drawing the waterfall entirely.

**Reset to defaults** restores every setting except your folders.

## 10. Where Spectral keeps things

- Your playlists: your main music folder (`*.m3u`).
- Everything else (library index, saved spectra, Now Playing, settings, the tag-edit undo log): `%APPDATA%\Spectral\`. Delete that folder to start completely fresh; your music and playlists are not in it.

## 11. Good to know

- Spectral never moves or deletes your music files. The only time it changes one is when you press Save in **Edit tags**, and then only its tags (section 7).
- WMA files cannot be played (the underlying browser engine cannot decode them). Convert them to MP3 or FLAC.
