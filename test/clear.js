'use strict';
// Now Playing "Clear" button: everything goes except the song playing from Now Playing. Usage: node test/clear.js <userDataDir with a warm library cache>
const { _electron: electron } = require('playwright-core');
const path = require('path');
const ROOT = path.join(__dirname, '..'), DATA = process.argv[2];
const sleep = ms => new Promise(r => setTimeout(r, ms));
let bad = 0; const chk = (n, c, x) => { console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? '  ' + x : '')); if (!c) bad++; };
(async () => {
  const app = await electron.launch({ args: [ROOT, '--user-data=' + DATA] });
  const page = await app.firstWindow();
  await page.waitForFunction(() => window.__sp && window.__sp.LIB.tracks.length > 1000, null, { timeout: 60000 });
  const snap = () => page.evaluate(() => { const np = __sp.PL.all.get('Now Playing'); return { np: np.tracks.length, title: np.tracks[0] && np.tracks[0].title, playing: __sp.P.track && __sp.P.track.title, idx: __sp.P.idx, onNP: __sp.P.list === np, paused: __sp.audioEl.paused, t: __sp.audioEl.currentTime, hasSrc: __sp.AUD.some(a => !!a.getAttribute('src')), msg: document.querySelector('#msg').textContent, hist: __sp.P.hist.length }; });
  const mp3 = () => page.evaluate(() => __sp.LIB.tracks.filter(t => /\.mp3$/i.test(t.abs)).slice(0, 6).map(t => t.abs));
  await page.evaluate(() => { __sp.setS('vol', 0); __sp.addToNP(__sp.LIB.tracks.filter(t => /\.mp3$/i.test(t.abs)).slice(0, 6), true); }); await sleep(1500);
  await page.evaluate(() => __sp.playFrom(__sp.PL.all.get('Now Playing'), 3)); await sleep(2500);
  let s = await snap(); const was = s.playing; console.log('before Clear', JSON.stringify(s));
  await page.click('#plClear'); await sleep(900); s = await snap();
  chk('Clear leaves only the playing song', s.np === 1 && s.title === was && s.playing === was, JSON.stringify(s));
  chk('it keeps playing, in place, from Now Playing', s.onNP && s.idx === 0 && !s.paused && s.hasSrc);
  chk('and says what it did', /Cleared 5 tracks.*stays/.test(s.msg), s.msg);
  const t1 = s.t; await sleep(1500); const s2 = await snap(); chk('playback keeps advancing', s2.t > t1 + 1, t1.toFixed(1) + ' -> ' + s2.t.toFixed(1));
  await page.click('#plClear'); await sleep(400); s = await snap(); chk('clicking again with only the playing song left does nothing', s.np === 1 && s.playing === was && /Nothing else/.test(s.msg), s.msg);
  // queue more behind it: the playing song is still the one that stays, and the next one comes from the new queue
  await page.evaluate(() => __sp.addToNP(__sp.LIB.tracks.filter(t => /\.mp3$/i.test(t.abs)).slice(20, 24), false)); await sleep(500);
  s = await snap(); chk('adding after a clear queues behind the playing song', s.np === 5 && s.playing === was, 'np ' + s.np);
  await page.click('#plClear'); await sleep(600); s = await snap(); chk('Clear again', s.np === 1 && s.playing === was);
  // the playing song was already removed from the list (it plays on as an orphan): Clear empties the list and playback carries on
  await page.evaluate(() => __sp.addToNP(__sp.LIB.tracks.filter(t => /\.mp3$/i.test(t.abs)).slice(30, 33), false)); await sleep(400);
  await page.evaluate(() => { const np = __sp.PL.all.get('Now Playing'); np.sel = new Set([0]); document.querySelector('#plList').dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true })); });
  await page.evaluate(() => { const np = __sp.PL.all.get('Now Playing'); np.sel = new Set([0]); }); await page.keyboard.press('Delete'); await sleep(400);
  s = await snap(); console.log('after removing the playing song', JSON.stringify({ np: s.np, playing: s.playing }));
  await page.click('#plClear'); await sleep(700); s = await snap();
  chk('orphaned playing song: list emptied, playback carries on', s.np === 0 && s.playing === was && !s.paused, JSON.stringify(s));
  // playing from a saved playlist: Now Playing is cleared completely and playback is left alone
  const r = await page.evaluate(async () => { const pl = [...__sp.PL.all.values()].find(p => !p.special && p.tracks.length > 3 && !p.tracks[1].missing); __sp.addToNP(__sp.LIB.tracks.slice(100, 104), false); __sp.playFrom(pl, 1); await new Promise(r => setTimeout(r, 2000)); return { name: pl.name, title: __sp.P.track.title }; });
  await page.click('#plClear'); await sleep(600); s = await snap();
  chk('playing from a saved playlist: Now Playing emptied, playback undisturbed', s.np === 0 && s.playing === r.title && !s.paused && !s.onNP, JSON.stringify(s));
  // nothing playing from NP: clears everything
  await page.evaluate(() => { __sp.addToNP(__sp.LIB.tracks.slice(200, 203), false); }); await sleep(300); await page.click('#plClear'); await sleep(300); s = await snap(); chk('queue only (nothing playing from it): everything cleared', s.np === 0);
  // "double-click replaces Now Playing" still clears everything (and stops what was playing from it)
  await page.evaluate(() => { __sp.setS('autoClear', true); __sp.addToNP(__sp.LIB.tracks.filter(t => /\.mp3$/i.test(t.abs)).slice(0, 5), true); }); await sleep(1500);
  await page.locator('#libList .row.artist >> nth=2').dblclick(); await sleep(1500); s = await snap();
  chk('the double-click option still replaces everything', s.np > 0 && s.np < 400 && s.playing !== was, 'np ' + s.np + ' playing ' + s.playing);
  console.log(bad ? bad + ' CHECK(S) FAILED' : 'ALL PASSED'); await app.close(); process.exit(bad ? 1 : 0);
})().catch(e => { console.error('FAILED', e); process.exit(1); });
