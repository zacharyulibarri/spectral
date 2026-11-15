'use strict';
// Tag editing for the "Edit tags" dialog. Changes tags only; the audio data is never touched.
//
//   editFile(abs, set)    -> { old, changed }   set = { title, artist, album, albumArtist: string|null, track, disc, year: integer|null }; a missing key is left alone, null/'' removes the field
//   restoreFile(abs, old)                        puts back what editFile returned in `old`
//
// MP3 is edited surgically: only the frames being changed are replaced, every other frame is copied byte for byte, and the tag keeps the version it already has (ID3v2.2, 2.3 or 2.4),
// so nothing is converted or lost. FLAC and M4A go through music-metadata's tag writer. Every write is read back and checked; on a mismatch the file is put back.
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');

// Only formats checked against real files are enabled. (music-metadata can also write Ogg, Opus, AAC and WAV; add them here once they have been tried on real files.)
const SUPPORTED = new Set(['.mp3', '.flac', '.m4a']);
const FIELDS = ['title', 'artist', 'album', 'albumArtist', 'track', 'disc', 'year'];
let mmP = null; const mm = () => (mmP || (mmP = import('music-metadata')));
const fail = (code, msg) => Object.assign(new Error(msg), { code });
const isNum = k => k === 'track' || k === 'disc' || k === 'year';
const cleanStr = v => (v === null || v === undefined ? null : String(v).replace(/\u0000/g, '').trim() || null);
const cleanInt = v => { if (v === null || v === undefined || v === '') return null; const n = Math.round(+v); return Number.isFinite(n) && n > 0 && n < 100000 ? n : null; };
const clean = (k, v) => (isNum(k) ? cleanInt(v) : cleanStr(v));

/* ------------------------------------------------------------------ MP3 / ID3v2 ------------------------------------------------------------------ */
const IDS = {
  2: { title: 'TT2', artist: 'TP1', album: 'TAL', albumArtist: 'TP2', track: 'TRK', disc: 'TPA', year: 'TYE' },
  3: { title: 'TIT2', artist: 'TPE1', album: 'TALB', albumArtist: 'TPE2', track: 'TRCK', disc: 'TPOS', year: 'TYER' },
  4: { title: 'TIT2', artist: 'TPE1', album: 'TALB', albumArtist: 'TPE2', track: 'TRCK', disc: 'TPOS', year: 'TDRC' },
};
const syncsafe = b => ((b[0] & 0x7f) << 21) | ((b[1] & 0x7f) << 14) | ((b[2] & 0x7f) << 7) | (b[3] & 0x7f);
const putSyncsafe = (n, b, o) => { b[o] = (n >> 21) & 0x7f; b[o + 1] = (n >> 14) & 0x7f; b[o + 2] = (n >> 7) & 0x7f; b[o + 3] = n & 0x7f; };
const hdrLen = ver => (ver === 2 ? 6 : 10);

async function readAt(fh, pos, len) {
  const b = Buffer.alloc(len); let got = 0;
  while (got < len) { const { bytesRead } = await fh.read(b, got, len - got, pos + got); if (!bytesRead) break; got += bytesRead; }
  return got < len ? b.subarray(0, got) : b;
}

// The ID3v2 tag at the start of the file: { ver, total (header + frames + padding), frames: [{id, raw}] }; ver 0 = no tag. Anything unusual throws, so a file we do not fully understand is left alone.
async function readTag(fh, size) {
  const h = await readAt(fh, 0, 10);
  if (h.length < 10 || h.toString('latin1', 0, 3) !== 'ID3') return { ver: 0, total: 0, frames: [] };
  const ver = h[3], flags = h[5];
  if (ver < 2 || ver > 4 || h[4] === 0xff) throw fail('unsupported', 'ID3 tag version ' + ver + ' is not supported');
  if ([h[6], h[7], h[8], h[9]].some(x => x & 0x80)) throw fail('unsupported', 'damaged ID3 header');
  if (flags & 0x80) throw fail('unsupported', 'the tag uses unsynchronization');
  if (ver === 2 && (flags & 0x40)) throw fail('unsupported', 'the tag is compressed');
  if (ver >= 3 && (flags & 0x40)) throw fail('unsupported', 'the tag has an extended header');
  if (ver === 4 && (flags & 0x10)) throw fail('unsupported', 'the tag has a footer');
  const bodyLen = syncsafe(h.subarray(6, 10)), total = 10 + bodyLen;
  if (total > size) throw fail('unsupported', 'the tag is longer than the file');
  const body = await readAt(fh, 10, bodyLen), frames = [], hl = hdrLen(ver), idLen = ver === 2 ? 3 : 4;
  let o = 0;
  while (o + hl <= body.length) {
    if (body[o] === 0) break;                                                  // padding starts here
    const id = body.toString('latin1', o, o + idLen);
    if (!/^[A-Z0-9]+$/.test(id)) throw fail('unsupported', 'unusual frame header');
    const len = ver === 2 ? (body[o + 3] << 16) | (body[o + 4] << 8) | body[o + 5] : ver === 3 ? body.readUInt32BE(o + 4) : syncsafe(body.subarray(o + 4, o + 8));
    if (o + hl + len > body.length) throw fail('unsupported', 'a frame runs past the end of the tag');
    frames.push({ id, raw: Buffer.from(body.subarray(o, o + hl + len)) }); o += hl + len;
  }
  for (let i = o; i < body.length; i++) if (body[i] !== 0) throw fail('unsupported', 'unrecognized data after the frames');   // anything but zero padding means the layout was misread
  return { ver, total, frames };
}

function decodeText(data) {                                                     // text frame body (encoding byte + text) -> string
  if (!data.length) return '';
  const enc = data[0], t = data.subarray(1); let s;
  if (enc === 1 || enc === 2) {
    let b = t, le = enc === 1;
    if (enc === 1 && b.length >= 2) { if (b[0] === 0xff && b[1] === 0xfe) { b = b.subarray(2); le = true; } else if (b[0] === 0xfe && b[1] === 0xff) { b = b.subarray(2); le = false; } }
    if (!le) { b = Buffer.from(b); b.swap16(); }
    s = b.toString('utf16le');
  } else if (enc === 3) s = t.toString('utf8'); else s = t.toString('latin1');
  return s.replace(/\u0000+$/, '');
}
const frameText = (f, ver) => decodeText(f.raw.subarray(hdrLen(ver)));

function textFrame(ver, id, text) {
  let body;
  if (/^[\u0000-ÿ]*$/.test(text)) body = Buffer.concat([Buffer.from([0]), Buffer.from(text, 'latin1')]);
  else if (ver === 4) body = Buffer.concat([Buffer.from([3]), Buffer.from(text, 'utf8')]);
  else body = Buffer.concat([Buffer.from([1, 0xff, 0xfe]), Buffer.from(text, 'utf16le')]);
  const f = Buffer.alloc(hdrLen(ver) + body.length); f.write(id, 0, 'latin1');
  if (ver === 2) { f[3] = (body.length >> 16) & 255; f[4] = (body.length >> 8) & 255; f[5] = body.length & 255; }
  else if (ver === 3) f.writeUInt32BE(body.length, 4); else putSyncsafe(body.length, f, 4);
  body.copy(f, hdrLen(ver)); return f;
}

// Which frames must change: Map(frame id -> new raw frame | null to remove)
function planFrames(tag, set) {
  const ver = tag.ver || 3, ids = IDS[ver], plan = new Map(), first = id => tag.frames.find(f => f.id === id);
  for (const k of FIELDS) {
    if (!(k in set)) continue;
    const id = ids[k], v = clean(k, set[k]);
    if (v === null) { plan.set(id, null); continue; }
    if (k === 'track' || k === 'disc') {                                       // keep an existing "/total"
      const old = first(id), m = old ? /\/\s*(\d+)/.exec(frameText(old, ver)) : null;
      plan.set(id, textFrame(ver, id, String(v) + (m ? '/' + m[1] : ''))); continue;
    }
    if (k === 'year') {                                                        // ID3v2.4 keeps a full date: only the year part changes
      const old = ver === 4 && first(id) ? frameText(first(id), ver) : '';
      plan.set(id, textFrame(ver, id, /^\d{4}/.test(old) ? String(v).padStart(4, '0') + old.slice(4) : String(v))); continue;
    }
    plan.set(id, textFrame(ver, id, v));
  }
  return plan;
}

// New tag bytes for a plan, or { same: true } when nothing would change
function buildTag(tag, plan) {
  const ver = tag.ver || 3, parts = [], done = new Set(); let changed = false;
  for (const f of tag.frames) {
    if (!plan.has(f.id)) { parts.push(f.raw); continue; }
    if (done.has(f.id)) { changed = true; continue; }                          // a second frame with the same id is dropped
    done.add(f.id); const nf = plan.get(f.id);
    if (nf === null) { changed = true; continue; }
    if (!nf.equals(f.raw)) changed = true;
    parts.push(nf);
  }
  for (const [id, nf] of plan) if (!done.has(id) && nf) { parts.push(nf); changed = true; }
  if (!changed) return { same: true };
  const frames = Buffer.concat(parts); let total = tag.total;
  if (!total || 10 + frames.length > total) total = 10 + frames.length + 2048;   // not enough room: grow, with a little padding for next time
  const buf = Buffer.alloc(total); buf.write('ID3', 0, 'latin1'); buf[3] = ver; putSyncsafe(total - 10, buf, 6); frames.copy(buf, 10);
  return { buf, same: false };
}

// The file's tag must now hold exactly the planned frames, and every other frame must be what it was
async function verifyTag(file, before, plan, newTotal, expectSize) {
  const st = await fsp.stat(file); if (expectSize !== undefined && st.size !== expectSize) throw fail('verify', 'the written file has the wrong size');
  const fh = await fsp.open(file, 'r'); let after; try { after = await readTag(fh, st.size); } finally { await fh.close(); }
  if (after.ver !== (before.ver || 3) || after.total !== newTotal) throw fail('verify', 'the tag did not read back as written');
  const keep = fs_ => fs_.filter(f => !plan.has(f.id)).map(f => f.raw.toString('base64'));
  if (JSON.stringify(keep(after.frames)) !== JSON.stringify(keep(before.frames))) throw fail('verify', 'other tag data changed unexpectedly');
  for (const [id, nf] of plan) {
    const got = after.frames.filter(f => f.id === id);
    if (nf === null ? got.length !== 0 : (got.length !== 1 || !got[0].raw.equals(nf))) throw fail('verify', 'frame ' + id + ' did not read back as written');
  }
}

// Writes a new tag. If it fits in the old tag's space only that region is overwritten (and put back if the check fails); otherwise the file is copied beside itself with the new tag, checked, and swapped in.
async function commitTag(abs, st, tag, out, plan, check) {
  if (tag.total && out.buf.length === tag.total) {
    const fh = await fsp.open(abs, 'r+'); let orig;
    try { orig = await readAt(fh, 0, tag.total); await fh.write(out.buf, 0, out.buf.length, 0); await fh.sync(); } finally { await fh.close(); }
    try { await verifyTag(abs, tag, plan, out.buf.length, st.size); if (check) await check(abs); }
    catch (e) { const f2 = await fsp.open(abs, 'r+'); try { await f2.write(orig, 0, orig.length, 0); await f2.sync(); } finally { await f2.close(); } throw e; }
    return;
  }
  const tmp = abs + '.sp-tmp-' + process.pid + '-' + Date.now().toString(36);
  try {
    const src = await fsp.open(abs, 'r'), w = await fsp.open(tmp, 'w');
    try {
      await w.write(out.buf, 0, out.buf.length, 0);
      let pos = tag.total, wpos = out.buf.length; const buf = Buffer.alloc(1 << 20);
      for (;;) { const { bytesRead } = await src.read(buf, 0, buf.length, pos); if (!bytesRead) break; await w.write(buf, 0, bytesRead, wpos); pos += bytesRead; wpos += bytesRead; }
      await w.sync();
    } finally { await src.close(); await w.close(); }
    await verifyTag(tmp, tag, plan, out.buf.length, st.size - tag.total + out.buf.length);
    if (check) await check(tmp);
    await fsp.rename(tmp, abs);
  } catch (e) { try { await fsp.unlink(tmp); } catch (_) {} throw e; }
}

async function openTag(abs) {
  const st = await fsp.stat(abs), fh = await fsp.open(abs, 'r'); let tag;
  try {
    tag = await readTag(fh, st.size);
    if (!tag.ver) { const h = await readAt(fh, 0, 2); if (!(h.length === 2 && h[0] === 0xff && (h[1] & 0xe0) === 0xe0)) throw fail('unsupported', 'the file does not start like an MP3'); }
  } finally { await fh.close(); }
  return { st, tag };
}

// After writing, read the file with music-metadata as a second opinion
async function checkWithReader(abs, set) {
  const { parseFile } = await mm(); let md;
  try { md = await parseFile(abs, { skipCovers: true }); } catch (e) { throw fail('verify', 'the file could not be read back: ' + e.message); }
  const c = md.common, got = { title: c.title, artist: c.artist, album: c.album, albumArtist: c.albumartist, track: c.track && c.track.no, disc: c.disk && c.disk.no, year: c.year };
  for (const k of FIELDS) {
    if (!(k in set)) continue;
    const exp = clean(k, set[k]), g = got[k] === undefined || got[k] === '' || got[k] === 0 ? null : got[k];
    if (g === exp || exp === null) continue;                                    // (a removed field can still show up from an ID3v1 tag at the end of the file)
    if (k === 'artist' && exp !== null && (c.artists || []).includes(exp)) continue;
    throw fail('verify', 'the ' + k + ' did not read back as written');
  }
}

async function editMp3(abs, set) {
  const { st, tag } = await openTag(abs), plan = planFrames(tag, set), old = { kind: 'id3', ver: tag.ver, frames: {} };
  for (const id of plan.keys()) { const f = tag.frames.find(x => x.id === id); old.frames[id] = f ? f.raw.toString('base64') : null; }
  const out = buildTag(tag, plan); if (out.same) return { old, changed: false };
  await commitTag(abs, st, tag, out, plan, file => checkWithReader(file, set));
  return { old, changed: true };
}

async function restoreMp3(abs, old) {
  const { st, tag } = await openTag(abs);
  if (tag.ver && old.ver && tag.ver !== old.ver) throw fail('changed', 'the tag was rewritten by another program since the edit');
  const plan = new Map(); for (const id in old.frames) plan.set(id, old.frames[id] === null ? null : Buffer.from(old.frames[id], 'base64'));
  const out = buildTag({ ...tag, ver: tag.ver || old.ver || 3 }, plan); if (out.same) return;
  await commitTag(abs, st, { ...tag, ver: tag.ver || old.ver || 3 }, out, plan);
}

/* ------------------------------------------------------------------ everything else: music-metadata ------------------------------------------------------------------ */
async function readCommon(abs) {
  const { parseFile } = await mm(), c = (await parseFile(abs, { skipCovers: true })).common;
  return { title: c.title || null, artist: c.artist || null, album: c.album || null, albumArtist: c.albumartist || null, track: (c.track && c.track.no) || null, disc: (c.disk && c.disk.no) || null, year: c.year || null };
}
function toPatch(set) {
  const p = {};
  if ('title' in set) p.title = cleanStr(set.title);
  if ('artist' in set) p.artist = cleanStr(set.artist);
  if ('album' in set) p.album = cleanStr(set.album);
  if ('albumArtist' in set) p.albumartist = cleanStr(set.albumArtist);
  if ('track' in set) { const n = cleanInt(set.track); p.track = n === null ? null : { no: n }; }
  if ('disc' in set) { const n = cleanInt(set.disc); p.disk = n === null ? null : { no: n }; }
  if ('year' in set) { const n = cleanInt(set.year); p.date = n === null ? null : String(n); }
  return p;
}
async function editOther(abs, set) {
  const { updateFile } = await mm(), before = await readCommon(abs), old = { kind: 'common', values: {} };
  for (const k of FIELDS) if (k in set) old.values[k] = before[k];
  if (!Object.keys(old.values).some(k => clean(k, set[k]) !== before[k])) return { old, changed: false };
  try { await updateFile(abs, toPatch(set)); }
  catch (e) { const older = /Only ID3v2\.4/.test(e.message); throw fail(older ? 'unsupported' : 'write', older ? 'this WAV file has an older tag format' : e.message); }
  try { await checkWithReader(abs, set); }
  catch (e) { try { await updateFile(abs, toPatch(old.values)); } catch (_) {} throw e; }
  return { old, changed: true };
}
async function restoreOther(abs, old) { const { updateFile } = await mm(); await updateFile(abs, toPatch(old.values)); }

/* ------------------------------------------------------------------ public ------------------------------------------------------------------ */
async function precheck(abs) {
  const ext = path.extname(abs).toLowerCase();
  if (!SUPPORTED.has(ext)) throw fail('unsupported', ext.slice(1).toUpperCase() + ' files cannot be edited');
  let st; try { st = await fsp.stat(abs); } catch (_) { throw fail('missing', 'the file was not found (is its drive connected?)'); }
  if (!st.isFile()) throw fail('missing', 'not a file');
  try { await fsp.access(abs, fs.constants.W_OK); } catch (_) { throw fail('readonly', 'the file is read-only'); }
  return ext;
}
// A file another program (or our own audio player) has open cannot be replaced on Windows; that clears up when the player lets go, so a few quick retries are made before giving up.
const inUse = e => e && /^(EBUSY|EPERM|EACCES)$/.test(e.code);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const busyError = () => fail('inuse', 'the file is in use by another program (stop playing it, or close whatever has it open, and try again)');
async function retrying(fn) {
  for (let i = 0; ; i++) {
    try { return await fn(); }
    catch (e) { if (inUse(e) && i < 5) { await sleep(200 * (i + 1)); continue; } if (inUse(e)) throw busyError(); throw e; }
  }
}
async function editFile(abs, set) {
  const ext = await precheck(abs);
  try { return await retrying(() => (ext === '.mp3' ? editMp3(abs, set) : editOther(abs, set))); }
  catch (e) { if (e.code) throw e; throw fail('write', (e && e.message) || String(e)); }
}
async function restoreFile(abs, old) {
  if (!old) return;
  await precheck(abs);
  try { return await retrying(() => (old.kind === 'id3' ? restoreMp3(abs, old) : restoreOther(abs, old))); }
  catch (e) { if (e.code) throw e; throw fail('write', (e && e.message) || String(e)); }
}

module.exports = { SUPPORTED, editFile, restoreFile };
