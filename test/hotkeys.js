'use strict';
// Ctrl+T (next color scheme) and Ctrl+B (blue / black background). Usage: node test/hotkeys.js <userDataDir with a warm library cache> [screenshot folder]
const { _electron: electron } = require('playwright-core');
const path = require('path'), fs = require('fs'), os = require('os');
const ROOT = path.join(__dirname, '..'), SRC = process.argv[2], SHOTS = process.argv[3];
const sleep = ms => new Promise(r => setTimeout(r, ms));
let bad = 0; const chk = (n, c, x) => { console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? '  ' + x : '')); if (!c) bad++; };
(async () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-keys-')); for (const f of ['library.json', 'config.json', 'specs.json']) fs.copyFileSync(path.join(SRC, f), path.join(d, f));
  fs.writeFileSync(path.join(d, 'settings.json'), JSON.stringify({ vol: 0, fpsCap: 60 }));
  let app = await electron.launch({ args: [ROOT, '--user-data=' + d] }), page = await app.firstWindow();
  await page.setViewportSize({ width: 1500, height: 900 }).catch(() => {});
  await page.waitForFunction(() => window.__sp && window.__sp.LIB.tracks.length > 100, null, { timeout: 60000 });
  await page.evaluate(() => { __sp.setS('vol', 0); __sp.addToNP(__sp.LIB.tracks.filter(t => /\.mp3$/i.test(t.abs)).slice(40, 46), true); }); await sleep(4000);
  const msg = () => page.evaluate(() => document.querySelector('#msg').textContent);
  const sch = () => page.evaluate(() => __sp.curSch);
  const skyAvg = () => page.evaluate(() => { const c = document.querySelector('#stage'), x = c.getContext('2d'), w = c.width, row = x.getImageData(0, 4, w, 6).data; let r = 0, g = 0, b = 0, n = 0; for (let i = 0; i < row.length; i += 4) { r += row[i]; g += row[i + 1]; b += row[i + 2]; n++; } return [r / n, g / n, b / n].map(v => Math.round(v * 10) / 10); });
  const shot = async name => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, name + '.png') }); } };

  // Ctrl+T cycles the ticked schemes, one step per press, wrapping around
  await page.evaluate(() => { for (const sc of __sp.SCHEMES) __sp.setS('cs_' + sc.id, ['rainbow', 'winter', 'blueOr'].includes(sc.id)); __sp.curSch = 0; });
  const seq = []; for (let i = 0; i < 4; i++) { await page.keyboard.press('Control+t'); await sleep(150); seq.push(await sch()); }
  const ids = await page.evaluate(() => __sp.SCHEMES.map(s => s.id));
  chk('Ctrl+T steps through the ticked schemes in order and wraps', JSON.stringify(seq.map(i => ids[i])) === JSON.stringify(['winter', 'blueOr', 'rainbow', 'winter']), seq.map(i => ids[i]).join(' > '));
  chk('and names the scheme', /^Colors: /.test(await msg()), await msg());
  await sleep(2500); await shot('scheme-winter');
  await page.evaluate(() => { for (const sc of __sp.SCHEMES) __sp.setS('cs_' + sc.id, sc.id === 'blue'); });
  const seq2 = []; for (let i = 0; i < 3; i++) { await page.keyboard.press('Control+t'); await sleep(120); seq2.push(ids[await sch()]); }
  chk('with fewer than two ticked it cycles through all of them', new Set(seq2).size === 3, seq2.join(' > '));

  // Ctrl+B (black is the default now, so start from blue)
  await page.evaluate(() => __sp.setS('bgBlack', false)); await sleep(900);
  const blue = await skyAvg(); await shot('bg-blue');
  await page.keyboard.press('Control+b'); await sleep(900); const black = await skyAvg(); await shot('bg-black');
  chk('Ctrl+B turns the background black', black.every(v => v < 4) && blue[2] > 12, 'blue ' + blue + ' -> black ' + black);
  chk('and says so, and the page agrees', /Black/.test(await msg()) && await page.evaluate(() => document.documentElement.classList.contains('bgblack') && __sp.S.bgBlack === true));
  await page.keyboard.press('Control+b'); await sleep(900); const back = await skyAvg();
  chk('pressing it again brings the blue back', back[2] > 12 && /Blue/.test(await msg()), JSON.stringify(back));
  await page.keyboard.press('Control+b'); await sleep(900); await page.keyboard.press('Control+b'); await sleep(900);   // end on black, then back to blue: the restart check needs a non-default value
  // the checkbox in Settings follows
  await page.evaluate(() => document.querySelector('#gear').click()); await sleep(200);
  chk('Settings has a Black background checkbox, unticked while the background is blue', await page.evaluate(() => { const l = [...document.querySelectorAll('#panel label.chk')].find(l => /Black background/.test(l.textContent)); return !!l && !l.querySelector('input').checked; }));
  await page.evaluate(() => document.querySelector('#gear').click());
  // light / dark modes: the keys do nothing visible but say why
  await page.keyboard.press('Control+l'); await sleep(300); await page.keyboard.press('Control+t'); await sleep(150);
  chk('in light mode Ctrl+T explains itself', /waterfall mode/.test(await msg()), await msg());
  await page.keyboard.press('Control+b'); await sleep(150); chk('...and so does Ctrl+B (nothing changed)', /waterfall mode/.test(await msg()) && await page.evaluate(() => __sp.S.bgBlack === false));
  await page.keyboard.press('Control+l'); await page.keyboard.press('Control+l'); await sleep(300);          // back to waterfall via dark
  // persists
  await sleep(700); await app.close();
  app = await electron.launch({ args: [ROOT, '--user-data=' + d] }); page = await app.firstWindow(); await page.setViewportSize({ width: 1500, height: 900 }).catch(() => {});
  await page.waitForFunction(() => window.__sp && window.__sp.LIB.tracks.length > 100, null, { timeout: 60000 }); await sleep(1500);
  chk('the blue background (not the default) is remembered after a restart', await page.evaluate(() => __sp.S.bgBlack === false && !document.documentElement.classList.contains('bgblack')));
  const again = await page.evaluate(() => { const c = document.querySelector('#stage'), x = c.getContext('2d'); const row = x.getImageData(0, 4, c.width, 6).data; let m = 0; for (let i = 0; i < row.length; i += 4) m = Math.max(m, row[i], row[i + 1], row[i + 2]); return m; });
  chk('and the sky is blue on the first frame', again > 12, 'max channel ' + again);
  await app.close();
  // a fresh install (no saved settings) starts black
  const d2 = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-keys2-')); for (const f of ['library.json', 'config.json', 'specs.json']) fs.copyFileSync(path.join(SRC, f), path.join(d2, f));
  app = await electron.launch({ args: [ROOT, '--user-data=' + d2] }); page = await app.firstWindow(); await page.setViewportSize({ width: 1500, height: 900 }).catch(() => {});
  await page.waitForFunction(() => window.__sp && window.__sp.LIB.tracks.length > 100, null, { timeout: 60000 }); await sleep(1500);
  const fresh = await page.evaluate(() => { const c = document.querySelector('#stage'), x = c.getContext('2d'); const row = x.getImageData(0, 4, c.width, 6).data; let m = 0; for (let i = 0; i < row.length; i += 4) m = Math.max(m, row[i], row[i + 1], row[i + 2]); return { m, bg: __sp.S.bgBlack }; });
  chk('with no saved settings the background starts black', fresh.bg === true && fresh.m < 4, JSON.stringify(fresh));
  await app.close(); console.log(bad ? bad + ' CHECK(S) FAILED' : 'ALL PASSED'); process.exit(bad ? 1 : 0);
})().catch(e => { console.error('FAILED', e); process.exit(1); });
