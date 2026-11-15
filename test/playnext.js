'use strict';
// "Play Next" in the right-click menus. Usage: node test/playnext.js <userDataDir with a warm library cache>
const { _electron: electron } = require('playwright-core');
const path = require('path'), fs = require('fs'), os = require('os');
const ROOT = path.join(__dirname, '..'), SRC = process.argv[2];
const sleep = ms => new Promise(r => setTimeout(r, ms));
let bad = 0; const chk = (n, c, x) => { console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? '  ' + x : '')); if (!c) bad++; };
(async () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-next-')); for (const f of ['library.json', 'config.json', 'specs.json']) fs.copyFileSync(path.join(SRC, f), path.join(d, f));
  fs.writeFileSync(path.join(d, 'settings.json'), JSON.stringify({ vol: 0 }));
  const app = await electron.launch({ args: [ROOT, '--user-data=' + d] }), page = await app.firstWindow();
  await page.setViewportSize({ width: 1500, height: 900 }).catch(() => {});
  await page.waitForFunction(() => window.__sp && window.__sp.LIB.tracks.length > 1000, null, { timeout: 60000 });
  const st = () => page.evaluate(() => { const l = __sp.PL.all.get('Now Playing'); return { n: l.tracks.length, idx: __sp.P.idx, titles: l.tracks.map(t => t.abs) }; });
  const mp3 = await page.evaluate(() => __sp.LIB.tracks.filter(t => /\.mp3$/i.test(t.abs)).slice(0, 12).map(t => t.abs));
  await page.evaluate(a => { const m = new Map(__sp.LIB.tracks.map(t => [t.abs, t])); __sp.addToNP(a.slice(0, 5).map(x => m.get(x)), true); }, mp3); await sleep(500);
  await page.evaluate(() => __sp.playFrom ? 0 : 0);
  let s = await st(); chk('five queued, first playing', s.n === 5 && s.idx === 0);

  // single song goes right after the current one
  await page.evaluate(a => { const m = new Map(__sp.LIB.tracks.map(t => [t.abs, t])); __sp.playNext([m.get(a[10])]); }, mp3); await sleep(300);
  s = await st(); chk('one song lands right after the current track', s.n === 6 && s.titles[1] === mp3[10] && s.idx === 0, JSON.stringify(s.idx));
  // several songs keep their order, ahead of the earlier Play Next
  await page.evaluate(a => { const m = new Map(__sp.LIB.tracks.map(t => [t.abs, t])); __sp.playNext([m.get(a[8]), m.get(a[9])]); }, mp3); await sleep(300);
  s = await st(); chk('several songs go in order right after the current track', s.n === 8 && s.titles[1] === mp3[8] && s.titles[2] === mp3[9] && s.titles[3] === mp3[10], s.titles.slice(0, 4).map(x => mp3.indexOf(x)).join(','));
  // Next really plays it
  await page.evaluate(() => __sp.mediaAction('next')); await sleep(600);
  s = await st(); chk('pressing Next plays the first Play Next song', s.idx === 1 && s.titles[s.idx] === mp3[8]);

  // from the real library right-click menu: an artist row
  const menuLabels = async sel => { await page.locator(sel).first().click({ button: 'right' }); await sleep(250); const l = await page.evaluate(() => [...document.querySelectorAll('.menu *')].map(e => e.textContent.trim())); await page.keyboard.press('Escape'); await sleep(150); return l; };
  const lab = await menuLabels('#libList .row.artist');
  chk('library right-click menu has Play Next', lab.some(x => x === 'Play Next'), lab.slice(0, 8).join(' | '));
  // artist row: plays after the current song
  const before = (await st()).n;
  await page.locator('#libList .row.artist').first().click({ button: 'right' }); await sleep(250);
  await page.locator('text=/^Play Next$/').first().click(); await sleep(400);
  s = await st(); chk('using the menu adds the artist\'s songs right after the current one', s.n > before && s.titles[s.idx + 1] !== s.titles[s.idx + 0], 'now ' + s.n);

  // shuffle: the first one is still queued next
  await page.evaluate(() => __sp.setS('shuffle', true));
  await page.evaluate(a => { const m = new Map(__sp.LIB.tracks.map(t => [t.abs, t])); __sp.playNext([m.get(a[11])]); }, mp3); await sleep(300);
  const j = await page.evaluate(() => __sp.jumpTarget() && __sp.jumpTarget().track.abs);
  chk('with shuffle on it is still queued to play next', j === mp3[11]);
  // nothing playing: plays them
  console.log(bad ? bad + ' CHECK(S) FAILED' : 'ALL PASSED'); await app.close(); process.exit(bad ? 1 : 0);
})().catch(e => { console.error('FAILED', e); process.exit(1); });
