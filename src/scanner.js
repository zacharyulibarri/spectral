'use strict';
// Library scanner. Runs in a worker thread so the UI never waits on disk.
// In : { roots:[{id,path}], known:{ "<rootId>|<relPath>": [size, mtimeMs] } }
// Out: {type:'batch', items:[entry]} | {type:'progress', seen, parsed} | {type:'done', removed:[key], seen, parsed, errors}
// entry = [key, size, mtimeMs, artist, albumArtist, album, title, no, disc, year, dur]
const { parentPort, workerData } = require('worker_threads');
const fs = require('fs');
const path = require('path');

const AUDIO = new Set(['.mp3', '.flac', '.m4a', '.aac', '.ogg', '.oga', '.opus', '.wav', '.webm', '.wma', '.ape', '.wv']);
const CONC = 6;

let mm = null;
async function loadMM() { if (!mm) mm = await import('music-metadata'); return mm; }

// Fallback when tags are missing: Artist/Album/NN Title.ext, or "Artist - Album - NN Title.ext"
function fromPath(rel) {
  const parts = rel.split('/'), file = parts[parts.length - 1].replace(/\.[^.]+$/, '');
  let title = file, no = 0;
  const m = /^(\d{1,3})\s*[-._)]?\s+(.+)$/.exec(file) || /^(\d{1,3})\s*-\s*(.+)$/.exec(file);
  if (m) { no = +m[1]; title = m[2]; }
  const artist = parts.length >= 3 ? parts[parts.length - 3] : (parts.length === 2 ? parts[0] : '');
  const album = parts.length >= 2 ? parts[parts.length - 2] : '';
  return { artist, album, title, no };
}

async function readEntry(key, abs, rel, st) {
  const fb = fromPath(rel);
  let c = null;
  try {
    const { parseFile } = await loadMM();
    const md = await parseFile(abs, { skipCovers: true, skipPostHeaders: true });
    c = md.common; c.__dur = md.format && md.format.duration;
  } catch (e) { /* unreadable tags: use folder names */ }
  const artist = (c && (c.artist || (c.artists && c.artists[0]))) || fb.artist;
  const albumArtist = (c && c.albumartist) || '';
  return [key, st.size, Math.round(st.mtimeMs),
    artist || '', albumArtist, (c && c.album) || fb.album, (c && c.title) || fb.title,
    (c && c.track && c.track.no) || fb.no || 0, (c && c.disk && c.disk.no) || 1, (c && c.year) || 0,
    Math.round(((c && c.__dur) || 0) * 10) / 10];
}

async function run() {
  const { roots, known } = workerData;
  const seenKeys = new Set(); let seen = 0, parsed = 0, errors = 0, batch = [], lastPost = Date.now();
  const flush = (force) => {
    if (batch.length && (force || batch.length >= 300 || Date.now() - lastPost > 700)) { parentPort.postMessage({ type: 'batch', items: batch }); batch = []; }
    if (Date.now() - lastPost > 700) { parentPort.postMessage({ type: 'progress', seen, parsed }); lastPost = Date.now(); }
  };
  const queue = []; let active = 0, walkDone = false, finish;
  const donePromise = new Promise(r => { finish = r; });
  const pump = () => {
    while (active < CONC && queue.length) {
      const job = queue.shift(); active++;
      readEntry(job.key, job.abs, job.rel, job.st).then(e => { parsed++; batch.push(e); }, () => { errors++; })
        .finally(() => { active--; flush(false); pump(); });
    }
    if (walkDone && !queue.length && !active) finish();
  };

  async function walk(root, dir, relDir) {
    let ents; try { ents = await fs.promises.readdir(dir, { withFileTypes: true }); } catch (e) { errors++; return; }
    for (const ent of ents) {
      const rel = relDir ? relDir + '/' + ent.name : ent.name;
      if (ent.isDirectory()) { if (!ent.name.startsWith('.')) await walk(root, path.join(dir, ent.name), rel); continue; }
      if (!ent.isFile() || !AUDIO.has(path.extname(ent.name).toLowerCase())) continue;
      const abs = path.join(dir, ent.name); let st; try { st = await fs.promises.stat(abs); } catch (e) { errors++; continue; }
      const key = root.id + '|' + rel; seenKeys.add(key); seen++;
      const k = known[key];
      if (!(k && k[0] === st.size && k[1] === Math.round(st.mtimeMs))) {
        queue.push({ key, abs, rel, st }); pump();
        while (queue.length > 400) await new Promise(r => setTimeout(r, 5));   // back-pressure
      } else flush(false);
    }
  }
  const offline = new Set();   // a root we can't read (unplugged drive) must not wipe its cached tracks
  for (const r of roots) { try { await fs.promises.access(r.path); await walk(r, r.path, ''); } catch (e) { offline.add(r.id); } }
  walkDone = true; pump(); await donePromise; flush(true);
  const removed = []; for (const k in known) if (!seenKeys.has(k) && !offline.has(k.slice(0, k.indexOf('|')))) removed.push(k);
  parentPort.postMessage({ type: 'done', removed, seen, parsed, errors });
}
run().catch(e => parentPort.postMessage({ type: 'error', message: String(e && e.stack || e) }));
