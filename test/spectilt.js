'use strict';
// The "flatten the whole-song spectrum" setting. Usage: node test/spectilt.js <userDataDir with a warm library cache>
const { _electron: electron } = require('playwright-core');
const path = require('path'), fs = require('fs'), os = require('os');
const ROOT = path.join(__dirname, '..'), SRC = process.argv[2];
const sleep = ms => new Promise(r => setTimeout(r, ms));
let bad = 0; const chk = (n, c, x) => { console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? '  ' + x : '')); if (!c) bad++; };
(async () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-tilt-')); for (const f of ['library.json', 'config.json', 'specs.json']) fs.copyFileSync(path.join(SRC, f), path.join(d, f));
  fs.writeFileSync(path.join(d, 'settings.json'), JSON.stringify({ vol: 0 }));
  const app = await electron.launch({ args: [ROOT, '--user-data=' + d] }), page = await app.firstWindow();
  await page.setViewportSize({ width: 1500, height: 900 }).catch(() => {});
  await page.waitForFunction(() => window.__sp && window.__sp.LIB.tracks.length > 1000, null, { timeout: 60000 });
  chk('off by default', await page.evaluate(() => __sp.S.specTilt === false));
  await page.evaluate(() => { __sp.setS('vol', 0); __sp.addToNP(__sp.LIB.tracks.filter(t => /\.mp3$/i.test(t.abs)).slice(0, 3), true); });
  await page.waitForFunction(() => __sp.P.track && __sp.P.track.spec, null, { timeout: 60000 }); await sleep(600);
  // bar heights as drawn: the topmost lit pixel of each of the 96 columns
  const bars = () => page.evaluate(() => { const c = document.querySelector('#mini'), x = c.getContext('2d'), w = c.width, h = c.height, n = 96, bw = w / n, d = x.getImageData(0, 0, w, h).data, out = [];
    for (let i = 0; i < n; i++) { const cx = Math.floor(i * bw + bw * 0.4); let top = h; for (let y = 0; y < h; y++) if (d[(y * w + cx) * 4 + 3] > 60) { top = y; break; } out.push((h - top) / h); } return out; });
  const avg = (a, lo, hi) => a.slice(lo, hi).reduce((s, v) => s + v, 0) / (hi - lo);
  const off = await bars(); await page.evaluate(() => __sp.setS('specTilt', true)); await sleep(400); const on = await bars();
  console.log('  left/right averages off:', avg(off, 0, 32).toFixed(2), avg(off, 64, 96).toFixed(2), ' on:', avg(on, 0, 32).toFixed(2), avg(on, 64, 96).toFixed(2));
  chk('without it the right side is lower than the left', avg(off, 64, 96) < avg(off, 0, 32) - 0.05);
  chk('with it the right side is closer to the left', (avg(on, 0, 32) - avg(on, 64, 96)) < (avg(off, 0, 32) - avg(off, 64, 96)) - 0.05);
  chk('it is in Settings as a toggle', await page.evaluate(() => { document.querySelector('#gear').click(); return [...document.querySelectorAll('#panel .chk')].some(e => /Flatten the whole-song spectrum/.test(e.textContent)); }));
  await page.evaluate(() => __sp.setS('specTilt', false)); await sleep(400); const back = await bars();
  chk('turning it off restores the original', JSON.stringify(back) === JSON.stringify(off));
  console.log(bad ? bad + ' CHECK(S) FAILED' : 'ALL PASSED'); await app.close(); process.exit(bad ? 1 : 0);
})().catch(e => { console.error('FAILED', e); process.exit(1); });
