'use strict';
// "Jump Here Next" (right-click a track in Now Playing or a playlist). Usage: node test/jump.js <userDataDir with a warm library cache> <outDir>
const { _electron: electron } = require('playwright-core');
const path = require('path'), fs = require('fs');
const ROOT = path.join(__dirname, '..'), DATA = process.argv[2], OUT = process.argv[3] || '.';
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const app = await electron.launch({ args: [ROOT, '--user-data=' + DATA] }), page = await app.firstWindow();
  const errs = []; page.on('pageerror', e => errs.push(String(e)));
  await page.setViewportSize({ width: 1400, height: 850 }).catch(() => {});
  await page.waitForFunction(() => window.__sp && window.__sp.LIB.tracks.length > 100, null, { timeout: 60000 });
  await page.evaluate(() => { __sp.setS('vol', 0); __sp.setS('theme', 'waterfall'); __sp.addToNP(__sp.LIB.tracks.filter(t => /\.mp3$/i.test(t.abs) && t.dur > 90).slice(30, 38), true); }); await sleep(2500);
  const st = () => page.evaluate(() => ({ idx: __sp.P.idx, list: __sp.P.list && __sp.P.list.name, title: __sp.P.track && __sp.P.track.title, jump: __sp.P.jump ? __sp.P.jump.idx : null, marked: [...document.querySelectorAll('#plList .row.qnext')].map(r => +r.dataset.i) }));
  const nearEnd = async () => { await page.evaluate(() => { const a = __sp.audioEl; a.currentTime = Math.max(0, a.duration - 3); }); };
  const menuClick = async (i, label) => { await page.locator('#plList .row[data-i="' + i + '"]').click({ button: 'right' }); await sleep(250); const items = await page.locator('.menu .mi').allTextContents(); await page.locator('.menu .mi', { hasText: label }).first().click(); await sleep(300); return items; };
  console.log('start                 ', JSON.stringify(await st()));
  const items = await menuClick(4, 'Jump Here Next'); console.log('menu items            ', JSON.stringify(items.slice(0, 3)));
  console.log('after Jump Here Next  ', JSON.stringify(await st()));
  await page.screenshot({ path: path.join(OUT, 'jump_marked.png') });
  const again = await page.evaluate(async () => { document.querySelector('#plList .row[data-i="4"]').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 600, clientY: 400 })); await new Promise(r => setTimeout(r, 200)); const t = [...document.querySelectorAll('.menu .mi')].map(x => x.textContent); document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); return t.slice(0, 3); });
  console.log('menu on the marked row', JSON.stringify(again));
  await nearEnd(); await sleep(5000); console.log('song ended (gapless)  ', JSON.stringify(await st()), '<- expect idx 4, no mark');
  await nearEnd(); await sleep(5000); console.log('next one continues    ', JSON.stringify(await st()), '<- expect idx 5');
  // cancel
  await menuClick(7, 'Jump Here Next'); console.log('marked 7              ', JSON.stringify(await st()));
  await menuClick(7, 'Cancel Jump Here Next'); console.log('canceled             ', JSON.stringify(await st()));
  // manual Next button honours it, and replacing a mark works
  await menuClick(7, 'Jump Here Next'); await menuClick(1, 'Jump Here Next'); console.log('replaced 7 by 1       ', JSON.stringify(await st()));
  await page.click('#bNext'); await sleep(1500); console.log('Next button           ', JSON.stringify(await st()), '<- expect idx 1');
  // a different list: mark a track in a saved playlist while Now Playing plays
  const q = await page.evaluate(() => [...__sp.PL.all.values()].find(p => !p.special && p.tracks.length > 3 && !p.tracks[2].missing && !p.tracks[3].missing).name);
  await page.click('#plSel'); await sleep(300); await page.locator('.menu .mi', { hasText: q }).first().click(); await sleep(600);
  console.log('viewing playlist      ', q, '| active:', await page.evaluate(() => __sp.PL.active));
  await menuClick(2, 'Jump Here Next'); console.log('marked in playlist    ', JSON.stringify(await st()));
  await nearEnd(); await sleep(5000); console.log('crossed lists         ', JSON.stringify(await st()), '<- expect list', JSON.stringify(q), 'idx 2');
  await nearEnd(); await sleep(5000); console.log('then continues there  ', JSON.stringify(await st()), '<- expect idx 3');
  console.log('page errors:', errs.length ? errs : 'none');
  await app.close(); process.exit(0);
})().catch(e => { console.error('FAILED', e); process.exit(1); });
