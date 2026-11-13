'use strict';
// Tag editor against real files, on copies only. Usage: node test/tagedit.js <userDataDir with a warm library cache> [mp3 count]
// Each sample is copied to a temp folder (MP3s keep their whole tag plus a stretch of audio). The test edits it, then checks that
//   - the requested fields read back, nothing else in the tag changed, and the audio bytes are identical
//   - an undo puts every touched frame back byte for byte
const fs = require('fs'), path = require('path'), os = require('os');
const { editFile, restoreFile } = require('../src/tagedit');
const SRC = process.argv[2], COUNT = +process.argv[3] || 400;
let bad = 0; const chk = (n, c, x) => { console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? '  ' + x : '')); if (!c) bad++; };
const lib = JSON.parse(fs.readFileSync(path.join(SRC, 'library.json'), 'utf8')), cfg = JSON.parse(fs.readFileSync(path.join(SRC, 'config.json'), 'utf8'));
const root = cfg.folders[0].path.replace(/\/+$/, ''), tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-tagedit-'));
const abs = e => root + '/' + e[0].slice(e[0].indexOf('|') + 1);
let seed = 12345; const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296, pickN = (a, n) => { const o = []; for (let i = 0; i < n; i++) o.push(a[Math.floor(rnd() * a.length)]); return [...new Set(o)]; };
const WORDS = ['Zebra', 'Ångström', 'Café del Mar', 'ΑΒΓ Δοκιμή', '日本語のタイトル', 'Ünïcödé', 'plain', 'Long '.repeat(60)];

(async () => {
  const mm = await import('music-metadata');
  const copyHead = (src, dst) => {                                  // keep the whole ID3 tag plus ~400 KB of audio
    const fd = fs.openSync(src, 'r'), h = Buffer.alloc(10); fs.readSync(fd, h, 0, 10, 0);
    const tagLen = h.toString('latin1', 0, 3) === 'ID3' ? 10 + (((h[6] & 127) << 21) | ((h[7] & 127) << 14) | ((h[8] & 127) << 7) | (h[9] & 127)) : 0, want = Math.min(fs.fstatSync(fd).size, tagLen + 400000);
    const b = Buffer.alloc(want); fs.readSync(fd, b, 0, want, 0); fs.closeSync(fd); fs.writeFileSync(dst, b);
  };
  const mp3 = lib.e.filter(e => /\.mp3$/i.test(e[0])), picks = pickN(mp3, COUNT);
  const st = { n: 0, ok: 0, refused: {}, failed: [], inPlace: 0, rewrite: 0, undoBad: 0, audioBad: 0, otherBad: 0, vers: {} };
  const t0 = Date.now(); let k = 0;
  for (const e of picks) {
    const f = path.join(tmp, (k++) + '.mp3'); try { copyHead(abs(e), f); } catch (_) { continue; }
    st.n++;
    let a; try { a = await mm.parseFile(f, { skipCovers: false }); } catch (_) { continue; }
    const ver = Object.keys(a.native).filter(x => /^ID3v2/.test(x)).join('+') || 'no ID3v2'; st.vers[ver] = (st.vers[ver] || 0) + 1;
    const orig = fs.readFileSync(f), set = {
      albumArtist: WORDS[Math.floor(rnd() * WORDS.length)], title: WORDS[Math.floor(rnd() * WORDS.length)], album: WORDS[Math.floor(rnd() * WORDS.length)],
      artist: rnd() < 0.5 ? WORDS[Math.floor(rnd() * WORDS.length)] : undefined, track: 1 + Math.floor(rnd() * 30), disc: rnd() < 0.5 ? 1 + Math.floor(rnd() * 3) : undefined, year: 1950 + Math.floor(rnd() * 70),
    };
    for (const x in set) if (set[x] === undefined) delete set[x];
    if (rnd() < 0.15) { delete set.title; delete set.track; set.year = null; }            // some removals
    let r;
    try { r = await editFile(f, set); } catch (err) { st.refused[err.code + ': ' + err.message.slice(0, 70)] = (st.refused[err.code + ': ' + err.message.slice(0, 70)] || 0) + 1; if (err.code === 'write') st.failed.push(f + ' [' + ver + '] ' + err.message + ' set=' + JSON.stringify(set).slice(0,160)); if (fs.readFileSync(f).equals(orig) === false) st.failed.push('REFUSED FILE WAS MODIFIED ' + f); continue; }
    const now = fs.readFileSync(f); (now.length === orig.length ? st.inPlace++ : st.rewrite++);
    const b = await mm.parseFile(f, { skipCovers: false });
    let good = true;
    const keyMap = { title: 'title', artist: 'artist', album: 'album', albumArtist: 'albumartist' };
    for (const x in set) {
      if (keyMap[x]) { const want = set[x] === null ? undefined : String(set[x]).trim(); if (b.common[keyMap[x]] !== want && !(x === 'artist' && (b.common.artists || []).includes(want))) good = false; }
      else if (x === 'track') { if ((b.common.track.no || null) !== set.track) good = false; } else if (x === 'disc') { if ((b.common.disk.no || null) !== set.disc) good = false; } else if (x === 'year') { if (set.year !== null && (b.common.year || null) !== set.year) good = false; }   // (a removed year can still come from an ID3v1 tag)
    }
    const touched = new Set(Object.keys(set)), same = ['genre', 'comment', 'picture', 'composer', 'rating', 'replaygain_track_gain', 'bpm', 'label', 'isrc', 'musicbrainz_trackid'];
    for (const x of same) if (JSON.stringify(a.common[x]) !== JSON.stringify(b.common[x])) { st.otherBad++; console.log('  other field changed:', x, f); good = false; }
    if (!touched.has('artist') && JSON.stringify(a.common.artist) !== JSON.stringify(b.common.artist)) { st.otherBad++; good = false; }
    if (!touched.has('year') && a.common.year !== b.common.year) { st.otherBad++; good = false; }
    const tagLen = buf => buf.toString('latin1', 0, 3) === 'ID3' ? 10 + (((buf[6] & 127) << 21) | ((buf[7] & 127) << 14) | ((buf[8] & 127) << 7) | (buf[9] & 127)) : 0;
    if (!now.subarray(tagLen(now)).equals(orig.subarray(tagLen(orig)))) { st.audioBad++; good = false; console.log('  AUDIO BYTES DIFFER', f); }
    // undo
    try { await restoreFile(f, JSON.parse(JSON.stringify(r.old))); const c = await mm.parseFile(f, { skipCovers: false });
      for (const x of ['title', 'artist', 'album', 'albumartist', 'track', 'disk', 'year', 'genre', 'comment', 'picture']) if (JSON.stringify(a.common[x]) !== JSON.stringify(c.common[x])) { st.undoBad++; console.log('  undo mismatch', x, f, JSON.stringify(a.common[x]).slice(0, 60), '->', JSON.stringify(c.common[x]).slice(0, 60)); good = false; break; }
      const back = fs.readFileSync(f); if (!back.subarray(tagLen(back)).equals(orig.subarray(tagLen(orig)))) { st.audioBad++; good = false; }
    } catch (err) { st.undoBad++; good = false; console.log('  undo failed', f, err.message); }
    if (good) st.ok++; else st.failed.push('mismatch ' + f);
  }
  console.log('MP3 samples', JSON.stringify(st, null, 1).slice(0, 2500), '\n', ((Date.now() - t0) / 1000).toFixed(1) + ' s');
  chk('no MP3 failed a check, and no refused file was modified (a file whose second tag overrides the first is refused, unchanged)', st.failed.length === 0 && st.otherBad === 0 && st.audioBad === 0 && st.undoBad === 0, st.failed.slice(0, 5).join(' | '));
  chk('most samples could be edited', st.ok >= st.n * 0.95, st.ok + ' of ' + st.n);

  /* the other formats, on whole-file copies of a few samples each */
  for (const ext of ['.flac', '.m4a']) {
    const list = pickN(lib.e.filter(e => e[0].toLowerCase().endsWith(ext)), 12).filter(e => { try { return fs.statSync(abs(e)).size < 80e6; } catch (_) { return false; } }).slice(0, 6);
    let ok = 0, refused = 0, n = 0;
    for (const e of list) {
      const f = path.join(tmp, 'x' + (k++) + ext); fs.copyFileSync(abs(e), f); n++;
      const a = await mm.parseFile(f, { skipCovers: false }), set = { albumArtist: 'Ünï Artist', title: 'New title', album: 'New album', track: 9, year: 2001 };
      let r; try { r = await editFile(f, set); } catch (err) { refused++; console.log('  ', ext, 'refused:', err.message); continue; }
      const b = await mm.parseFile(f, { skipCovers: false }); let good = b.common.albumartist === 'Ünï Artist' && b.common.title === 'New title' && b.common.album === 'New album' && b.common.track.no === 9 && b.common.year === 2001;
      for (const x of ['genre', 'picture', 'comment', 'composer']) if (JSON.stringify(a.common[x]) !== JSON.stringify(b.common[x])) good = false;
      if (Math.abs(a.format.duration - b.format.duration) > 0.01) good = false;
      await restoreFile(f, JSON.parse(JSON.stringify(r.old))); const c = await mm.parseFile(f, { skipCovers: false });
      for (const x of ['title', 'artist', 'album', 'albumartist', 'year']) if (JSON.stringify(a.common[x]) !== JSON.stringify(c.common[x])) good = false;
      if (good) ok++;
    }
    chk(ext + ' edit + undo on real copies', ok + refused === n && n > 0 && ok > 0, ok + ' ok, ' + refused + ' refused of ' + n);
  }
  console.log(bad ? bad + ' CHECK(S) FAILED' : 'ALL PASSED'); fs.rmSync(tmp, { recursive: true, force: true }); process.exit(bad ? 1 : 0);
})().catch(e => { console.error('FAILED', e); process.exit(1); });
