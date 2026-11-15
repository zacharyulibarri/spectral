'use strict';
// Per-song color schemes + new defaults. Usage: node test/colors.js <userDataDir with a warm library cache> <outDir>
const { _electron: electron } = require('playwright-core');
const path = require('path'), fs = require('fs');
const ROOT = path.join(__dirname, '..'), DATA = process.argv[2], OUT = process.argv[3] || '.';
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const app = await electron.launch({ args: [ROOT, '--user-data=' + DATA] });
  const page = await app.firstWindow();
  const errs = []; page.on('pageerror', e => errs.push(String(e)));
  await page.setViewportSize({ width: 1600, height: 900 }).catch(() => {});
  await page.waitForFunction(() => window.__sp && window.__sp.LIB.tracks.length > 1000, null, { timeout: 60000 });
  console.log('defaults', JSON.stringify(await page.evaluate(() => { const s = __sp.S; return { ballSize: s.ballSize, logScale: s.logScale, logRange: s.logRange, hGain: s.hGain, cs: Object.keys(s).filter(k => k.startsWith('cs_') && s[k]).length }; })));
  console.log('settings panel color checkboxes:', await page.evaluate(() => { document.querySelector('#gear').click(); return [...document.querySelectorAll('#panel label.chk')].map(l => l.textContent).filter(t => /rainbow|winter|barbie|blue|orange/i.test(t)); }));
  console.log('log range slider min:', await page.evaluate(() => [...document.querySelectorAll('#panel .row')].find(r => /Log range/.test(r.textContent)).querySelector('input').min));
  await page.evaluate(() => { document.querySelector('#gear').click(); __sp.setS('vol', 0); });

  // each new song picks a scheme at random from the ticked ones
  const tracks = await page.evaluate(() => __sp.LIB.tracks.filter(t => /\.mp3$/i.test(t.abs)).slice(40, 52).map(t => t.abs));
  const seen = [];
  for (let i = 0; i < 12; i++) { await page.evaluate(p => { const t = __sp.LIB.tracks.find(t => t.abs === p); __sp.addToNP([t], true); }, tracks[i]); await sleep(250); seen.push(await page.evaluate(() => __sp.SCHEMES[__sp.curSch].id)); }
  console.log('schemes over 12 songs:', seen.join(' '), '| distinct', new Set(seen).size, '| repeats back-to-back:', seen.filter((s, i) => i && s === seen[i - 1]).length);
  // untick everything but two: only those two may appear
  await page.evaluate(() => { for (const sc of __sp.SCHEMES) __sp.setS('cs_' + sc.id, sc.id === 'winter' || sc.id === 'orBlue'); });
  const only = []; for (let i = 0; i < 8; i++) { await page.evaluate(p => { __sp.addToNP([__sp.LIB.tracks.find(t => t.abs === p)], true); }, tracks[i]); await sleep(200); only.push(await page.evaluate(() => __sp.SCHEMES[__sp.curSch].id)); }
  console.log('only winter+orBlue ticked:', only.join(' '));
  await page.evaluate(() => { for (const sc of __sp.SCHEMES) __sp.setS('cs_' + sc.id, true); });

  // screenshot every scheme on the same music
  await page.evaluate(p => { __sp.addToNP([__sp.LIB.tracks.filter(t => /\.mp3$/i.test(t.abs))[50]], true); __sp.audioEl.currentTime = 60; }, 0); await sleep(2500);
  for (let i = 0; i < 7; i++) {
    await page.evaluate(i => { for (const sc of __sp.SCHEMES) __sp.S['cs_' + sc.id] = false; __sp.setS('cs_' + __sp.SCHEMES[i].id, true); __sp.curSch = i; }, i);
    await page.evaluate(() => __sp.setS('collapsed', true)); await sleep(3500);                        // let the new color flow in
    await page.screenshot({ path: path.join(OUT, 'scheme_' + i + '.png') }); await page.evaluate(() => __sp.setS('collapsed', false));
  }
  console.log('page errors:', errs.length ? errs : 'none');
  await app.close(); process.exit(0);
})().catch(e => { console.error('FAILED', e); process.exit(1); });
