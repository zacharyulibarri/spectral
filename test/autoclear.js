'use strict';
// "Double-click replaces Now Playing" option. Usage: node test/autoclear.js <userDataDir with a warm library cache>
const { _electron: electron } = require('playwright-core');
const path = require('path');
const ROOT = path.join(__dirname, '..'), DATA = process.argv[2];
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const app = await electron.launch({ args: [ROOT, '--user-data=' + DATA] }), page = await app.firstWindow();
  await page.setViewportSize({ width: 1500, height: 900 }).catch(() => {});
  await page.waitForFunction(() => window.__sp && window.__sp.LIB.tracks.length > 100, null, { timeout: 60000 });
  const info = () => page.evaluate(() => ({ np: __sp.PL.all.get('Now Playing').tracks.length, playing: __sp.P.track && __sp.P.track.title, msg: document.querySelector('#msg').style.display !== 'none' ? document.querySelector('#msg').textContent : '' }));
  await page.evaluate(() => { __sp.setS('vol', 0); __sp.setS('autoClear', false); __sp.addToNP(__sp.LIB.tracks.filter(t => /\.mp3$/i.test(t.abs)).slice(20, 25), true); }); await sleep(1500);
  const artist = i => page.locator('#libList .row.artist >> nth=' + i);
  console.log('start                      ', JSON.stringify(await info()));
  await artist(2).dblclick(); await sleep(1200); console.log('option off, double-click   ', JSON.stringify(await info()), '(5 + artist tracks)');
  console.log('checkbox in settings       ', await page.evaluate(() => { document.querySelector('#gear').click(); const l = [...document.querySelectorAll('#panel label.chk')].find(l => /replaces Now Playing/.test(l.textContent)); const r = !!l; if (l) l.querySelector('input').click(); document.querySelector('#gear').click(); return r + ' (ticked: ' + __sp.S.autoClear + ')'; }));
  await sleep(300);
  await artist(2).dblclick(); await sleep(1200); const a = await info(); console.log('option on, double-click    ', JSON.stringify(a), '(only that artist)');
  const want = await page.evaluate(() => __sp.PL.all.get('Now Playing').tracks.length);
  await page.evaluate(() => __sp.addToNP(__sp.LIB.tracks.filter(t => /\.mp3$/i.test(t.abs)).slice(40, 43), false)); await sleep(300);
  const row = artist(4), box = await row.boundingBox(), list = await page.locator('#plList').boundingBox();
  await row.dragTo(page.locator('#plList'), { targetPosition: { x: 200, y: 60 } }); await sleep(800);
  const d = await info(); console.log('option on, drag and drop   ', JSON.stringify(d), '| grew from', want + 3, '| still playing the same song:', d.playing === a.playing);
  await app.close(); process.exit(0);
})().catch(e => { console.error('FAILED', e); process.exit(1); });
