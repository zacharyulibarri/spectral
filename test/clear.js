'use strict';
// Now Playing "Clear" button. Usage: node test/clear.js <userDataDir with a warm library cache>
const { _electron: electron } = require('playwright-core');
const path = require('path');
const ROOT = path.join(__dirname, '..'), DATA = process.argv[2];
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const app = await electron.launch({ args: [ROOT, '--user-data=' + DATA] });
  const page = await app.firstWindow();
  await page.waitForFunction(() => window.__sp && window.__sp.LIB.tracks.length > 1000, null, { timeout: 60000 });
  const vis = () => page.evaluate(() => getComputedStyle(document.querySelector('#plClear')).display !== 'none');
  const snap = () => page.evaluate(() => ({ np: __sp.PL.all.get('Now Playing').tracks.length, playing: !!__sp.P.track, title: document.querySelector('#npTitle').textContent, srcs: __sp.AUD.map(a => !!a.getAttribute('src')), active: __sp.PL.active, msg: document.querySelector('#msg').textContent }));
  console.log('empty NP, button visible:', await vis());
  await page.evaluate(() => { __sp.setS('vol', 0); __sp.addToNP(__sp.LIB.tracks.filter(t => /\.mp3$/i.test(t.abs)).slice(0, 5), true); }); await sleep(2500);
  console.log('after adding 5 + play     ', JSON.stringify(await snap()), 'button visible:', await vis());
  await page.click('#plClear'); await sleep(600);
  console.log('after Clear (was playing)  ', JSON.stringify(await snap()), 'button visible:', await vis());
  const r = await page.evaluate(async () => { const pl = [...__sp.PL.all.values()].find(p => !p.special && p.tracks.length > 3 && !p.tracks[1].missing); __sp.addToNP(__sp.LIB.tracks.slice(100, 104), false); __sp.playFrom(pl, 1); await new Promise(r => setTimeout(r, 2000)); return pl.name; });
  console.log('playing from saved playlist "' + r + '", NP has queued tracks, button visible:', await vis());
  await page.click('#plClear'); await sleep(600);
  const s = await snap(); console.log('after Clear (playing elsewhere)', JSON.stringify(s));
  console.log('  playback continued:', s.playing && s.srcs.some(Boolean), '| NP empty:', s.np === 0);
  const t = await page.evaluate(() => { __sp.addToNP(__sp.LIB.tracks.slice(0, 2), false); return { activeIsNP: __sp.PL.active === 'Now Playing' }; });
  console.log('re-adding after clear shows button:', await vis(), JSON.stringify(t));
  await app.close(); process.exit(0);
})().catch(e => { console.error('FAILED', e); process.exit(1); });
