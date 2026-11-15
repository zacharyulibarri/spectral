'use strict';
// The random-songs button under the library search. Usage: node test/random.js <userDataDir with a warm library cache>
const { _electron: electron } = require('playwright-core');
const path = require('path'), fs = require('fs'), os = require('os');
const ROOT = path.join(__dirname, '..'), SRC = process.argv[2];
const sleep = ms => new Promise(r => setTimeout(r, ms));
let bad = 0; const chk = (n, c, x) => { console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? '  ' + x : '')); if (!c) bad++; };
(async () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-rand-')); for (const f of ['library.json', 'config.json', 'specs.json']) fs.copyFileSync(path.join(SRC, f), path.join(d, f));
  fs.writeFileSync(path.join(d, 'settings.json'), JSON.stringify({ vol: 0 }));
  let app = await electron.launch({ args: [ROOT, '--user-data=' + d] }), page = await app.firstWindow();
  await page.setViewportSize({ width: 1500, height: 900 }).catch(() => {});
  await page.waitForFunction(() => window.__sp && window.__sp.LIB.tracks.length > 1000, null, { timeout: 60000 });
  const np = () => page.evaluate(() => { const l = __sp.PL.all.get('Now Playing'); return { n: l.tracks.length, idx: __sp.P.idx, onNP: __sp.P.list === l, playing: __sp.P.track && __sp.P.track.title, paused: __sp.audioEl.paused, msg: document.querySelector('#msg').textContent, active: __sp.PL.active }; });
  const box = sel => page.locator(sel).boundingBox();

  // placement: below the search bar and the count line, above the list
  const [q, info, btn, list] = [await box('#q'), await box('#libInfo'), await box('#libRandom'), await box('#libList')];
  chk('the button sits below the search bar and the count line, above the list', btn.y > info.y + info.height - 2 && btn.y > q.y + q.height && btn.y + btn.height <= list.y + 2, [q.y, info.y, btn.y, list.y].map(Math.round).join(' < '));
  chk('it is labeled with the count', (await page.textContent('#libRandom')).trim() === '1,000 random songs', await page.textContent('#libRandom'));

  // five songs already queued; the button adds 1000 more and plays the first of them
  await page.evaluate(() => { __sp.setS('vol', 0); __sp.addToNP(__sp.LIB.tracks.filter(t => /\.mp3$/i.test(t.abs)).slice(0, 5), false); }); await sleep(300);
  const t0 = Date.now(); await page.click('#libRandom'); await page.waitForFunction(() => !__sp.audioEl.paused && __sp.P.idx === 5, null, { timeout: 15000 }); const took = Date.now() - t0; await sleep(500);
  let s = await np();
  chk('adds 1000 songs to Now Playing (keeping what was there)', s.n === 1005, 'Now Playing has ' + s.n);
  chk('and starts playing the first new one, from Now Playing', s.idx === 5 && s.onNP && !s.paused && s.active === 'Now Playing', JSON.stringify(s));
  chk('and says so', /Added 1,000 random songs/.test(s.msg), s.msg);
  console.log('  click to playing:', took, 'ms');
  const added = await page.evaluate(() => __sp.PL.all.get('Now Playing').tracks.slice(5).map(t => ({ abs: t.abs, aa: t.albumArtist || t.artist || '' })));
  chk('1000 different songs', new Set(added.map(t => t.abs)).size === 1000);
  chk('all of them playable formats (no WMA)', added.every(t => /\.(mp3|flac|m4a|aac|ogg|oga|opus|wav|webm)$/i.test(t.abs)));
  let same = 0; for (let i = 1; i < added.length; i++) if (added[i].aa && added[i].aa === added[i - 1].aa) same++;
  chk('in random order (neighbors are rarely by the same artist)', same < 60, same + ' of 999 neighbor pairs share an artist');
  const lib = await page.evaluate(() => __sp.LIB.tracks.length); const spread = new Set(added.map(t => t.aa)).size;
  chk('drawn from across the whole library', spread > 300, spread + ' different artists of ' + (await page.evaluate(() => __sp.LIB.artists.length)));

  // a second press: a different draw, added after the first
  await page.click('#libRandom'); await sleep(800); s = await np();
  const all2 = await page.evaluate(() => __sp.PL.all.get('Now Playing').tracks.slice(1005).map(t => t.abs));
  const first = new Set(added.map(t => t.abs)); const overlap = all2.filter(a => first.has(a)).length;
  chk('pressing again adds a fresh draw and plays it', s.n === 2005 && s.idx === 1005 && !s.paused, JSON.stringify({ n: s.n, idx: s.idx }));
  chk('which is a different selection', overlap < 150, overlap + ' songs in common with the first (about ' + Math.round(1000 * 1000 / lib) + ' expected by chance)');

  // the size is a typed number in Settings (no slider); the label follows it
  await page.evaluate(() => document.querySelector('#gear').click()); await sleep(250);
  const numBox = page.locator('#panel .numrow input');
  chk('Settings has a number box for it, not a slider, showing 1000', (await numBox.count()) === 1 && (await numBox.getAttribute('type')) === 'number' && (await numBox.inputValue()) === '1000' && (await page.locator('#panel .row:has(.numrow) input[type=range]').count()) === 0);
  const typeIn = async v => { await numBox.click({ clickCount: 3 }); await page.keyboard.type(v); await page.keyboard.press('Enter'); await sleep(250); };
  await typeIn('250');
  chk('typing a number and pressing Enter sets it, and the label follows', (await page.textContent('#libRandom')).trim() === '250 random songs' && await page.evaluate(() => __sp.S.randomCount === 250), await page.textContent('#libRandom'));
  chk('typing digits does not trigger shortcuts (still on the same song, volume untouched)', await page.evaluate(() => __sp.S.vol === 0));
  await typeIn('99999'); chk('too big is clamped to 10,000', (await numBox.inputValue()) === '10000' && (await page.textContent('#libRandom')).trim() === '10,000 random songs', await numBox.inputValue());
  await typeIn('0'); chk('too small is clamped to 1', (await numBox.inputValue()) === '1' && (await page.textContent('#libRandom')).trim() === '1 random songs', await numBox.inputValue());
  await numBox.click({ clickCount: 3 }); await page.keyboard.press('Backspace'); await page.keyboard.press('Enter'); await sleep(250);
  chk('blank goes back to the previous value', (await numBox.inputValue()) === '1' && await page.evaluate(() => __sp.S.randomCount === 1), await numBox.inputValue());
  await typeIn('250');
  await page.evaluate(() => document.querySelector('#gear').click()); await sleep(200);
  await page.click('#libRandom'); await sleep(600); s = await np(); chk('and the button adds that many', s.n === 2255, 'Now Playing has ' + s.n);
  // it survives a restart
  await sleep(700); await app.close();
  app = await electron.launch({ args: [ROOT, '--user-data=' + d] }); page = await app.firstWindow(); await page.setViewportSize({ width: 1500, height: 900 }).catch(() => {});
  await page.waitForFunction(() => window.__sp && window.__sp.LIB.tracks.length > 1000, null, { timeout: 60000 }); await sleep(800);
  chk('the number is remembered after a restart', (await page.textContent('#libRandom')).trim() === '250 random songs');
  await page.evaluate(() => __sp.setS('randomCount', 1000)); await sleep(200);
  chk('a fresh install defaults to 1000', await electron.launch({ args: [ROOT, '--user-data=' + fs.mkdtempSync(path.join(os.tmpdir(), 'sp-rand2-'))] }).then(async a => { const w = await a.firstWindow(); await w.waitForFunction(() => window.__sp && window.__sp.S, null, { timeout: 30000 }); const v = await w.evaluate(() => __sp.S.randomCount); await a.close(); return v === 1000; }));

  // it never clears, even with the double-click-replaces option on (the restart emptied Now Playing's extras? no: Now Playing was saved)
  const before2 = (await page.evaluate(() => __sp.PL.all.get('Now Playing').tracks.length));
  await page.evaluate(() => { __sp.setS('autoClear', true); }); await page.click('#libRandom'); await sleep(700);
  chk('it adds even when "double-click replaces Now Playing" is on', (await page.evaluate(() => __sp.PL.all.get('Now Playing').tracks.length)) === before2 + 1000, 'Now Playing had ' + before2);

  // light mode: still there, still works
  await page.keyboard.press('Control+l'); await sleep(300);
  chk('visible in light mode', await page.locator('#libRandom').isVisible());
  await page.keyboard.press('Control+l'); await page.keyboard.press('Control+l'); await sleep(300);
  console.log(bad ? bad + ' CHECK(S) FAILED' : 'ALL PASSED'); await app.close(); process.exit(bad ? 1 : 0);
})().catch(e => { console.error('FAILED', e); process.exit(1); });
