'use strict';
// Exposes window.spHost to the renderer: the whole bridge between the UI and the desktop shell (library, playlists, state, settings, files).
const { contextBridge, ipcRenderer, webUtils } = require('electron');

const cfg = ipcRenderer.sendSync('sp:config');
const pending = new Set();
const inv = (ch, ...a) => { const p = ipcRenderer.invoke(ch, ...a); pending.add(p); const done = () => pending.delete(p); p.then(done, done); return p; };

/* whole-song spectra: 96 bytes per track, cached in memory so getSpec() can stay synchronous */
const specs = new Map();          // abs.lower -> base64 string | Float32Array
const specFor = abs => {
  const k = abs.toLowerCase(), v = specs.get(k); if (!v) return null;
  if (typeof v === 'string') { const b = Buffer.from(v, 'base64'), o = new Float32Array(b.length); for (let i = 0; i < b.length; i++) o[i] = b[i] / 255; specs.set(k, o); return o; }
  return v;
};

let openCb = null;
ipcRenderer.on('sp:open', (_, paths) => { if (openCb) openCb(paths); });
// files dragged in from Explorer: the renderer can't see real paths any more, so resolve them here
window.addEventListener('drop', e => {
  const files = e.dataTransfer && e.dataTransfer.files; if (!files || !files.length || !openCb) return;
  const paths = [...files].map(f => { try { return webUtils.getPathForFile(f); } catch (_) { return ''; } }).filter(Boolean);
  if (!paths.length) return;
  e.preventDefault(); e.stopImmediatePropagation(); openCb(paths);
}, true);

contextBridge.exposeInMainWorld('spHost', {
  desktop: true, platform: cfg.platform, dev: cfg.dev,
  playlistDir: cfg.playlistDir, folders: cfg.folders, firstRun: !!cfg.firstRun, mediaOverlay: cfg.mediaOverlay,
  finishWelcome: list => inv('sp:finishWelcome', list),
  onMedia(cb) { ipcRenderer.on('sp:media', (_, k) => cb(k)); },      // media keys, when the system media overlay is off

  loadSettings: () => ipcRenderer.sendSync('sp:settingsGet'),       // synchronous: the renderer needs them before its first frame
  saveSettings: s => ipcRenderer.send('sp:settingsSet', s),

  async loadLibrary() {
    const r = await inv('sp:loadLibrary');
    for (const k in r.specs) specs.set(k.toLowerCase(), r.specs[k]);
    return { tracks: r.tracks };
  },
  onLibrary(cb) { ipcRenderer.on('sp:lib', (_, p) => cb(p)); },
  listPlaylists: () => inv('sp:listPlaylists'),
  savePlaylist: (name, text) => inv('sp:savePlaylist', name, text),
  renamePlaylist: (a, b) => inv('sp:renamePlaylist', a, b),
  deletePlaylist: name => inv('sp:deletePlaylist', name),
  loadState: () => inv('sp:loadState'),
  saveState: o => inv('sp:saveState', o),
  async saveAs(name, makeText) {
    const file = await inv('sp:saveAsPick', name); if (!file) return;
    const dir = file.slice(0, file.lastIndexOf('/')); await inv('sp:writeFile', file, makeText(dir));
  },
  trackUrl: t => t.url || ('sp://app/_t?p=' + encodeURIComponent(t.abs)),
  pickFolder: () => inv('sp:pickFolder'),
  setFolders: list => inv('sp:setFolders', list),
  rescan: () => inv('sp:rescan'),
  getSpec: t => (t.abs ? specFor(t.abs) : null),
  putSpec(t, spec) {
    if (!t.abs || !spec) return;
    const b = Buffer.alloc(spec.length); for (let i = 0; i < spec.length; i++) b[i] = Math.max(0, Math.min(255, Math.round(spec[i] * 255)));
    const s = b.toString('base64'); specs.set(t.abs.toLowerCase(), s); ipcRenderer.send('sp:putSpec', t.abs, s);
  },
  resolve: paths => inv('sp:resolve', paths),
  onOpen(cb) { openCb = cb; ipcRenderer.send('sp:ready'); },
  onFlush(cb) { ipcRenderer.on('sp:flush', () => cb()); },
  idle: () => Promise.allSettled([...pending]).then(() => undefined),
  flushed: () => ipcRenderer.send('sp:flushed'),
  reveal: p => inv('sp:reveal', p),
  editTags: (items, opts) => inv('sp:editTags', items, opts),
  undoTags: () => inv('sp:undoTags'),
  undoInfo: () => inv('sp:undoInfo'),
  onTagProgress(cb) { ipcRenderer.on('sp:tagProgress', (_, p) => cb(p)); },
  metrics: () => inv('sp:metrics'),
});
