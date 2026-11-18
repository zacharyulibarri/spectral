'use strict';
// Ctrl+L display modes, settings persistence across restarts, primary-folder UI.
// Usage: node test/modes.js <fresh userDataDir with a warm library cache (library.json, config.json)> <outDir>
const { _electron: electron } = require('playwright-core');
const path = require('path'), fs = require('fs');
const ROOT = path.join(__dirname, '..'), DATA = process.argv[2], OUT = process.argv[3] || require('os').tmpdir();
const sleep = ms => new Promise(r => setTimeout(r, ms));
const launch = async () => {
  const app = await electron.launch({ args: [ROOT, '--user-data=' + DATA] }), page = await app.firstWindow();
  await page.setViewportSize({ width: 1400, height: 850 }).catch(() => {});
  await page.waitForFunction(() => window.__sp && window.__sp.LIB.tracks.length > 100, null, { timeout: 60000 });
  return { app, page };
};
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  let { app, page } = await launch();
  const errs = []; page.on('pageerror', e => errs.push(String(e)));
  await page.evaluate(() => { __sp.setS('vol', 0); __sp.addToNP(__sp.LIB.tracks.filter(t => /\.mp3$/i.test(t.abs)).slice(20, 24), true); }); await sleep(2500);
  const st = () => page.evaluate(() => ({ theme: __sp.S.theme, attr: document.documentElement.getAttribute('data-theme'), stage: getComputedStyle(document.querySelector('#stage')).display, dots: __sp.stats.dotCount, frames: __sp.stats.frames, bg: getComputedStyle(document.body).backgroundColor, fg: getComputedStyle(document.body).color, playing: !__sp.audioEl.paused, t: +__sp.audioEl.currentTime.toFixed(1) }));
  console.log('start  ', JSON.stringify(await st()));
  await page.keyboard.press('Control+l'); await sleep(1200);
  const a = await st(); console.log('ctrl+L ', JSON.stringify(a));
  await page.screenshot({ path: path.join(OUT, 'light.png') });
  await sleep(1500); const a2 = await st(); console.log('  waterfall frames advanced while light:', a2.frames - a.frames, '| dot sprites', a.dots, '->', a2.dots, '| audio still playing:', a2.playing, a.t, '->', a2.t);
  await page.keyboard.press('Control+l'); await sleep(800);
  console.log('ctrl+L ', JSON.stringify(await st()));
  await page.screenshot({ path: path.join(OUT, 'dark.png') });
  // persistence: settings that are not the defaults
  await page.evaluate(() => { __sp.setS('logRange', 12); __sp.setS('ballSize', 1.2); __sp.setS('cs_winter', false); __sp.setS('logScale', false); });
  await sleep(900);
  await app.close();
  console.log('settings.json:', fs.existsSync(path.join(DATA, 'settings.json')) ? JSON.stringify(JSON.parse(fs.readFileSync(path.join(DATA, 'settings.json'), 'utf8'))).slice(0, 160) + '...' : 'MISSING');
  ({ app, page } = await launch());
  console.log('after restart', JSON.stringify(await page.evaluate(() => ({ theme: __sp.S.theme, attr: document.documentElement.getAttribute('data-theme'), logRange: __sp.S.logRange, ballSize: __sp.S.ballSize, winter: __sp.S.cs_winter, logScale: __sp.S.logScale }))));
  // the localStorage copy must not be what saves us: wipe it and restart again
  await page.evaluate(() => localStorage.clear()); await app.close();
  ({ app, page } = await launch());
  console.log('after wiping localStorage', JSON.stringify(await page.evaluate(() => ({ theme: __sp.S.theme, logRange: __sp.S.logRange, ballSize: __sp.S.ballSize }))));
  // back to the waterfall, folders UI
  await page.keyboard.press('Control+l'); await sleep(500); await page.keyboard.press('Control+l'); await sleep(800);
  console.log('cycled back', JSON.stringify(await st()));
  await page.evaluate(() => document.querySelector('#gear').click()); await sleep(300);
  console.log('folder rows:', await page.evaluate(() => [...document.querySelectorAll('#panel .fl')].map(r => r.textContent)), '| color boxes:', await page.evaluate(() => [...document.querySelectorAll('#panel label.chk')].map(l => l.textContent).filter(t => /center/.test(t))));
  console.log('page errors:', errs.length ? errs : 'none');
  await app.close(); process.exit(0);
})().catch(e => { console.error('FAILED', e); process.exit(1); });
