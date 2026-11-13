'use strict';
const { app, BrowserWindow, Menu, protocol, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const { Readable } = require('stream');
const { Worker } = require('worker_threads');

const argvFlag = n => process.argv.some(a => a === n);
const argvVal = n => { const a = process.argv.find(x => x.startsWith(n + '=')); return a ? a.slice(n.length + 1) : ''; };
app.setName('Spectral');
if (process.platform === 'win32') app.setAppUserModelId('app.spectral.player');     // same id as the installer's shortcuts: the running window groups with (and a taskbar pin survives for) the installed app
if (argvVal('--user-data')) app.setPath('userData', path.resolve(argvVal('--user-data')));
else app.setPath('userData', path.join(app.getPath('appData'), 'Spectral'));
const DEV = argvFlag('--dev') || process.env.SP_DEV === '1';

/* ---------- small helpers ---------- */
const fwd = p => String(p).replace(/\\/g, '/');
const AUDIO_EXT = new Set(['.mp3', '.flac', '.m4a', '.aac', '.ogg', '.oga', '.opus', '.wav', '.webm', '.wma', '.ape', '.wv']);
const LIST_EXT = new Set(['.m3u', '.m3u8', '.pls']);
const MIME = { '.mp3': 'audio/mpeg', '.flac': 'audio/flac', '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.ogg': 'audio/ogg', '.oga': 'audio/ogg', '.opus': 'audio/ogg',
  '.wav': 'audio/wav', '.webm': 'audio/webm', '.wma': 'audio/x-ms-wma', '.ape': 'audio/x-ape', '.wv': 'audio/x-wavpack',
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.woff2': 'font/woff2', '.png': 'image/png', '.svg': 'image/svg+xml' };
const ud = (...p) => path.join(app.getPath('userData'), ...p);
function readJSON(file, dflt) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) { return dflt; } }
function writeAtomicSync(file, text) { fs.mkdirSync(path.dirname(file), { recursive: true }); const tmp = file + '.tmp'; fs.writeFileSync(tmp, text); fs.renameSync(tmp, file); }
async function writeAtomic(file, text) { await fsp.mkdir(path.dirname(file), { recursive: true }); const tmp = file + '.tmp'; await fsp.writeFile(tmp, text); await fsp.rename(tmp, file); }
function decodeText(buf) {            // UTF-8 (BOM ok); old playlists in a legacy code page fall back to windows-1252
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buf).replace(/^﻿/, ''); } catch (_) { return new TextDecoder('windows-1252').decode(buf); }
}

/* ---------- config ---------- */
const CFG_FILE = ud('config.json');
let cfg = readJSON(CFG_FILE, {});
// The primary folder (folders[0]) always exists: on a first run it is the user's OS Music folder (or $SP_MUSIC_ROOT); it can be changed in Settings but not removed.
function defaultRoot() { return fwd(process.env.SP_MUSIC_ROOT || app.getPath('music')); }
if (!Array.isArray(cfg.folders) || !cfg.folders.length) cfg.folders = [{ id: 'r1', path: defaultRoot() }];
if (!cfg.playlistDir) cfg.playlistDir = cfg.folders[0].path;
if (process.env.SP_PLAYLIST_DIR) cfg.playlistDir = fwd(process.env.SP_PLAYLIST_DIR);
const saveConfig = () => { try { writeAtomicSync(CFG_FILE, JSON.stringify(cfg, null, 1)); } catch (_) {} };
if (argvFlag('--no-gpu') || cfg.disableGpu) app.disableHardwareAcceleration();

protocol.registerSchemesAsPrivileged([{ scheme: 'sp', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true, bypassCSP: true } }]);

/* ---------- library index (persisted) ---------- */
// entry = [key, size, mtimeMs, artist, albumArtist, album, title, no, disc, year, dur]; key = "<rootId>|<relative path>"
const CACHE_FILE = ud('library.json'), SPEC_FILE = ud('specs.json');
const entries = new Map(), byAbs = new Map();       // key -> entry ; abs.lower -> key
let specs = readJSON(SPEC_FILE, {});                // key|"abs:<lower>" -> base64 (96 bytes)
let specsDirty = false, specT = 0;
const rootById = id => cfg.folders.find(f => f.id === id);
const absOf = key => { const i = key.indexOf('|'), r = rootById(key.slice(0, i)); return r ? r.path.replace(/\/+$/, '') + '/' + key.slice(i + 1) : null; };
function trackOf(e) {
  const abs = absOf(e[0]); if (!abs) return null;
  return { abs, artist: e[3], albumArtist: e[4], album: e[5], title: e[6], no: e[7], disc: e[8], year: e[9], dur: e[10] };
}
function loadCache() {
  const c = readJSON(CACHE_FILE, null); if (!c || c.v !== 1) return;
  for (const e of c.e) { const key = e[0]; if (!absOf(key)) continue; entries.set(key, e); byAbs.set(absOf(key).toLowerCase(), key); }
}
let cacheT = 0;
function saveCacheSoon() { clearTimeout(cacheT); cacheT = setTimeout(saveCacheNow, 1500); }
function saveCacheNow() { clearTimeout(cacheT); try { writeAtomicSync(CACHE_FILE, JSON.stringify({ v: 1, e: [...entries.values()] })); } catch (_) {} }
function saveSpecsSoon() { specsDirty = true; clearTimeout(specT); specT = setTimeout(saveSpecsNow, 4000); }
function saveSpecsNow() { clearTimeout(specT); if (!specsDirty) return; specsDirty = false; try { writeAtomicSync(SPEC_FILE, JSON.stringify(specs)); } catch (_) {} }
const specKey = abs => byAbs.get(abs.toLowerCase()) || 'abs:' + abs.toLowerCase();

/* ---------- scanning (worker thread) ---------- */
let scanning = null, win = null;
const send = (ch, payload) => { if (win && !win.isDestroyed()) win.webContents.send(ch, payload); };
function startScan() {
  if (scanning) return;
  const known = {}; for (const [k, e] of entries) known[k] = [e[1], e[2]];
  const w = new Worker(path.join(__dirname, 'scanner.js'), { workerData: { roots: cfg.folders, known } });
  scanning = w; const t0 = Date.now();
  w.on('message', m => {
    if (m.type === 'batch') {
      const add = [];
      for (const it of m.items) {
        const old = entries.get(it[0]); if (old && specs[it[0]] && (old[1] !== it[1] || old[2] !== it[2])) { delete specs[it[0]]; saveSpecsSoon(); }
        entries.set(it[0], it); const t = trackOf(it); if (t) { byAbs.set(t.abs.toLowerCase(), it[0]); add.push(t); }
      }
      send('sp:lib', { add });
    } else if (m.type === 'progress') send('sp:lib', { progress: { seen: m.seen, parsed: m.parsed } });
    else if (m.type === 'done') {
      const removed = [];
      for (const k of m.removed) { const abs = absOf(k); entries.delete(k); if (abs) { byAbs.delete(abs.toLowerCase()); removed.push(abs); } delete specs[k]; }
      if (m.removed.length) saveSpecsSoon();
      scanning = null; saveCacheNow();
      send('sp:lib', { removed, done: true, progress: { seen: m.seen, parsed: m.parsed }, total: entries.size, ms: Date.now() - t0, errors: m.errors });
    } else if (m.type === 'error') { scanning = null; send('sp:lib', { done: true, error: m.message }); }
  });
  w.on('error', e => { scanning = null; send('sp:lib', { done: true, error: String(e) }); });
}

/* ---------- reading tags on demand (Open With, files outside the library) ---------- */
let mmP = null; const mm = () => (mmP || (mmP = import('music-metadata')));
async function readTrack(abs) {
  const base = path.basename(abs).replace(/\.[^.]+$/, ''), m = /^(\d{1,3})\s*[-._)]?\s+(.+)$/.exec(base);
  const t = { abs: fwd(abs), artist: '', albumArtist: '', album: path.basename(path.dirname(abs)), title: m ? m[2] : base, no: m ? +m[1] : 0, disc: 1, year: 0, dur: 0 };
  try {
    const { parseFile } = await mm(); const md = await parseFile(abs, { skipCovers: true }), c = md.common;
    t.artist = c.artist || ''; t.albumArtist = c.albumartist || ''; t.album = c.album || t.album; t.title = c.title || t.title;
    t.no = (c.track && c.track.no) || t.no; t.disc = (c.disk && c.disk.no) || 1; t.year = c.year || 0; t.dur = Math.round((md.format.duration || 0) * 10) / 10;
  } catch (_) {}
  return t;
}
async function expandPaths(paths) {
  const files = [], lists = [];
  async function visit(p, depth) {
    let st; try { st = await fsp.stat(p); } catch (_) { return; }
    if (st.isDirectory()) { if (depth > 8) return; const names = (await fsp.readdir(p)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })); for (const n of names) await visit(path.join(p, n), depth + 1); return; }
    const ext = path.extname(p).toLowerCase();
    if (AUDIO_EXT.has(ext)) files.push(p); else if (LIST_EXT.has(ext)) lists.push(p);
  }
  for (const p of paths) await visit(p, 0);
  return { files, lists };
}
async function resolvePaths(paths) {
  const { files, lists } = await expandPaths(paths), tracks = [], playlists = [];
  for (const f of files.slice(0, 5000)) { const k = byAbs.get(fwd(f).toLowerCase()); const e = k && entries.get(k); tracks.push(e ? trackOf(e) : await readTrack(f)); }
  for (const l of lists) { try { playlists.push({ name: path.basename(l), path: fwd(l), text: decodeText(await fsp.readFile(l)) }); } catch (_) {} }
  return { tracks, playlists };
}

/* ---------- playlists on disk ---------- */
const safeName = n => String(n).replace(/[\\/:*?"<>|]/g, '_').trim();
const plFile = name => path.join(cfg.playlistDir, safeName(name) + '.m3u');
async function backupOnce(name) {          // first time the app touches a pre-existing playlist, keep the original
  const src = plFile(name), dst = ud('playlist-backups', safeName(name) + '.m3u');
  try { await fsp.access(src); } catch (_) { return; }
  try { await fsp.access(dst); } catch (_) { await fsp.mkdir(path.dirname(dst), { recursive: true }); await fsp.copyFile(src, dst); }
}

/* ---------- IPC ---------- */
const STATE_FILE = ud('state.json');
let pendingOpen = [], rendererReady = false, openBuf = [], openT = 0;
// Explorer starts one process per selected file ("Open with" on a multi-selection), so paths arrive one by one a few ms apart.
// Collect them for a moment and hand them over as a single batch (sorted: arrival order across processes is not reliable).
function deliverOpen(paths) {
  if (!paths.length) return;
  openBuf.push(...paths); clearTimeout(openT);
  openT = setTimeout(() => {
    const batch = [...new Set(openBuf)].sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })); openBuf = [];
    if (rendererReady) send('sp:open', batch); else pendingOpen.push(...batch);
  }, 600);
}

/* user settings (display, colour, motion, volume...): settings.json, written atomically shortly after every change and again on quit */
const SETTINGS_FILE = ud('settings.json');
let settings = readJSON(SETTINGS_FILE, null), settingsT = 0, settingsDirty = false;
function saveSettingsNow() { clearTimeout(settingsT); if (!settingsDirty) return; settingsDirty = false; try { writeAtomicSync(SETTINGS_FILE, JSON.stringify(settings, null, 1)); } catch (_) {} }
ipcMain.on('sp:settingsGet', e => { e.returnValue = settings; });
ipcMain.on('sp:settingsSet', (e, s) => {
  if (!s || typeof s !== 'object') return;
  settings = { ...s }; delete settings.folders;        // folders belong to config.json
  settingsDirty = true; clearTimeout(settingsT); settingsT = setTimeout(saveSettingsNow, 400);
});
app.on('before-quit', saveSettingsNow);
ipcMain.on('sp:config', e => { e.returnValue = { playlistDir: cfg.playlistDir, folders: cfg.folders.map(f => f.path), platform: process.platform, dev: DEV }; });
ipcMain.handle('sp:loadLibrary', () => {
  const tracks = []; for (const e of entries.values()) { const t = trackOf(e); if (t) tracks.push(t); }
  const sp = {}; for (const [abs, k] of byAbs) if (specs[k]) sp[abs] = specs[k];
  for (const k in specs) if (k.startsWith('abs:')) sp[k.slice(4)] = specs[k];
  startScan(); return { tracks, specs: sp };
});
ipcMain.handle('sp:rescan', () => { startScan(); });
ipcMain.handle('sp:listPlaylists', async () => {
  let names = []; try { names = (await fsp.readdir(cfg.playlistDir)).filter(n => /\.m3u$/i.test(n)); } catch (_) {}
  const out = []; for (const n of names.sort((a, b) => a.localeCompare(b))) { try { out.push({ name: n.replace(/\.m3u$/i, ''), text: decodeText(await fsp.readFile(path.join(cfg.playlistDir, n))) }); } catch (_) {} }
  return out;
});
const plQueue = new Map();                 // serialise writes per playlist
function plSerial(name, fn) { const prev = plQueue.get(name) || Promise.resolve(), next = prev.then(fn, fn); plQueue.set(name, next.catch(() => {})); return next; }
ipcMain.handle('sp:savePlaylist', (e, name, text) => plSerial(name, async () => { await backupOnce(name); await writeAtomic(plFile(name), text); }));
ipcMain.handle('sp:renamePlaylist', (e, a, b) => plSerial(a, async () => { try { await fsp.rename(plFile(a), plFile(b)); } catch (_) {} }));
ipcMain.handle('sp:deletePlaylist', async (e, name) => { try { await fsp.unlink(plFile(name)); } catch (_) {} });
ipcMain.handle('sp:loadState', () => readJSON(STATE_FILE, null));
ipcMain.handle('sp:saveState', (e, o) => writeAtomic(STATE_FILE, JSON.stringify(o)));
ipcMain.handle('sp:saveAsPick', async (e, name) => {
  const r = await dialog.showSaveDialog(win, { defaultPath: path.join(cfg.playlistDir, safeName(name) + '.m3u'), filters: [{ name: 'Playlist', extensions: ['m3u', 'm3u8'] }] });
  return r.canceled ? null : fwd(r.filePath);
});
ipcMain.handle('sp:writeFile', (e, file, text) => writeAtomic(file, text));
ipcMain.handle('sp:pickFolder', async () => {
  const r = await dialog.showOpenDialog(win, { properties: ['openDirectory'], title: 'Add a music folder' });
  return r.canceled || !r.filePaths[0] ? null : fwd(r.filePaths[0]);
});
ipcMain.handle('sp:setFolders', (e, list) => {
  list = (Array.isArray(list) ? list : []).filter(p => typeof p === 'string' && p).map(fwd);
  list = list.filter((p, i) => list.findIndex(q => q.toLowerCase() === p.toLowerCase()) === i);       // no duplicates
  if (!list.length) list = [cfg.folders[0] ? cfg.folders[0].path : defaultRoot()];                    // there is always a primary folder
  const old = cfg.folders; let n = old.reduce((m, f) => Math.max(m, +f.id.slice(1) || 0), 0);
  cfg.folders = list.map(p => { const f = old.find(o => o.path.toLowerCase() === fwd(p).toLowerCase()); return f || { id: 'r' + (++n), path: fwd(p) }; });
  for (const [k] of entries) if (!rootById(k.slice(0, k.indexOf('|')))) { entries.delete(k); delete specs[k]; }
  byAbs.clear(); for (const k of entries.keys()) byAbs.set(absOf(k).toLowerCase(), k);
  saveConfig(); saveCacheSoon(); startScan(); return true;
});
ipcMain.on('sp:putSpec', (e, abs, b64) => { specs[specKey(abs)] = b64; saveSpecsSoon(); });
ipcMain.handle('sp:resolve', (e, paths) => resolvePaths(paths));
ipcMain.on('sp:ready', () => { rendererReady = true; if (pendingOpen.length) { send('sp:open', pendingOpen); pendingOpen = []; } });
ipcMain.handle('sp:reveal', (e, p) => { if (typeof p === 'string' && fs.existsSync(p)) shell.showItemInFolder(path.normalize(p)); });   // native separators: Explorer ignores forward-slash paths
ipcMain.handle('sp:metrics', () => app.getAppMetrics().map(m => ({ type: m.type, cpu: m.cpu.percentCPUUsage, mem: m.memory.workingSetSize })));

/* ---------- file serving: sp://app/... (renderer) and sp://t/f?p=<abs path> (audio) ---------- */
const RENDERER = path.join(__dirname, '..', 'renderer');
async function serveFile(req, file, cache) {
  let st; try { st = await fsp.stat(file); if (!st.isFile()) throw 0; } catch (_) { return new Response('not found', { status: 404 }); }
  const size = st.size, type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
  const h = { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Cache-Control': cache ? 'max-age=3600' : 'no-store' };
  let start = 0, end = size - 1, status = 200; const range = req.headers.get('range');
  if (range && size) {
    const m = /bytes=(\d*)-(\d*)/.exec(range);
    if (m && (m[1] || m[2])) {
      if (m[1] === '') start = Math.max(0, size - +m[2]); else { start = +m[1]; if (m[2] !== '') end = Math.min(+m[2], size - 1); }
      if (start > end || start >= size) return new Response(null, { status: 416, headers: { 'Content-Range': 'bytes */' + size } });
      status = 206; h['Content-Range'] = `bytes ${start}-${end}/${size}`;
    }
  }
  if (!size) return new Response(null, { status: 200, headers: { ...h, 'Content-Length': '0' } });
  h['Content-Length'] = String(end - start + 1);
  return new Response(Readable.toWeb(fs.createReadStream(file, { start, end })), { status, headers: h });
}
function registerProtocol() {
  protocol.handle('sp', req => {
    const u = new URL(req.url);
    if (u.hostname === 'app' && u.pathname === '/_t') {        // audio is served from the page's own origin: cross-origin media would be silenced by Web Audio
      const p = u.searchParams.get('p') || '', ext = path.extname(p).toLowerCase();
      if (!AUDIO_EXT.has(ext)) return new Response('forbidden', { status: 403 });
      return serveFile(req, p, false);
    }
    if (u.hostname === 'app') {
      const rel = decodeURIComponent(u.pathname).replace(/^\/+/, '') || 'index.html', full = path.normalize(path.join(RENDERER, rel));
      if (!full.startsWith(RENDERER + path.sep)) return new Response('forbidden', { status: 403 });
      return serveFile(req, full, false);
    }
    if (u.hostname === 't') {
      const p = u.searchParams.get('p') || '', ext = path.extname(p).toLowerCase();
      if (!AUDIO_EXT.has(ext)) return new Response('forbidden', { status: 403 });
      return serveFile(req, p, false);
    }
    return new Response('not found', { status: 404 });
  });
}

/* ---------- window ---------- */
let closing = false, flushed = false;
function createWindow() {
  const b = cfg.bounds || {};
  win = new BrowserWindow({
    width: b.width || 1360, height: b.height || 820, x: b.x, y: b.y, minWidth: 720, minHeight: 440, show: false, backgroundColor: '#04060d',
    title: 'Spectral', autoHideMenuBar: true, icon: path.join(__dirname, '..', 'build', 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: false, backgroundThrottling: false },
  });
  if (cfg.maximized) win.maximize();
  win.once('ready-to-show', () => win.show());
  win.webContents.on('before-input-event', (e, i) => {
    if (i.type !== 'keyDown') return;
    if (i.key === 'F11') { win.setFullScreen(!win.isFullScreen()); e.preventDefault(); }
    else if (DEV && i.key === 'F12') win.webContents.toggleDevTools();
    else if (DEV && i.key === 'F5') win.webContents.reload();
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', e => e.preventDefault());
  win.on('close', e => {                       // let the renderer finish its pending saves first
    if (!flushed) {
      e.preventDefault(); if (closing) return; closing = true;
      const done = () => { if (flushed) return; flushed = true; try { if (!win.isDestroyed()) win.close(); } catch (_) {} };
      ipcMain.once('sp:flushed', done); setTimeout(done, 2500); send('sp:flush');
      return;
    }
    if (!win.isMaximized() && !win.isMinimized() && !win.isFullScreen()) cfg.bounds = win.getBounds();
    cfg.maximized = win.isMaximized(); saveConfig(); saveSpecsNow(); saveCacheNow();
  });
  win.on('closed', () => { win = null; });
  win.loadURL('sp://app/index.html');
}

/* ---------- single instance + "Open With" ---------- */
const argPaths = argv => argv.slice(app.isPackaged ? 1 : 2).filter(a => a && !a.startsWith('--') && fs.existsSync(a)).map(a => path.resolve(a));
if (!app.requestSingleInstanceLock()) { app.quit(); }
else {
  app.on('second-instance', (e, argv) => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } deliverOpen(argPaths(argv)); });
  app.whenReady().then(() => {
    if (!DEV) Menu.setApplicationMenu(null);
    registerProtocol(); loadCache(); deliverOpen(argPaths(process.argv)); createWindow();
    app.on('activate', () => { if (!win) createWindow(); });
  });
  app.on('window-all-closed', () => app.quit());
}
