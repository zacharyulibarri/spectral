'use strict';
// Dragging the progress bar: bar and counter follow the pointer, playback does not move until release, Esc cancels.
// Usage: node test/scrub.js <userDataDir with a warm library cache>
const { _electron: electron } = require('playwright-core');
const path = require('path'), fs = require('fs'), os = require('os');
const ROOT = path.join(__dirname, '..'), SRC = process.argv[2];
const sleep = ms => new Promise(r => setTimeout(r, ms));
let bad = 0; const chk = (n, c, x) => { console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? '  ' + x : '')); if (!c) bad++; };
(async () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-scrub-')); for (const f of ['library.json', 'config.json', 'specs.json']) fs.copyFileSync(path.join(SRC, f), path.join(d, f));
  const app = await electron.launch({ args: [ROOT, '--user-data=' + d] }), page = await app.firstWindow();
  await page.setViewportSize({ width: 1500, height: 900 }).catch(() => {});
  await page.waitForFunction(() => window.__sp && window.__sp.LIB.tracks.length > 100, null, { timeout: 60000 });
  await page.evaluate(() => { __sp.setS('vol', 0); __sp.addToNP(__sp.LIB.tracks.filter(t => /\.mp3$/i.test(t.abs) && t.dur > 150).slice(5, 9), true); }); await sleep(2500);
  const st = () => page.evaluate(() => ({ t: __sp.audioEl.currentTime, dur: __sp.audioEl.duration, cur: document.querySelector('#tcur').textContent, w: document.querySelector('#prog i').style.width, scrub: document.querySelector('#prog').classList.contains('scrub'), title: __sp.P.track.title, paused: __sp.audioEl.paused }));
  const box = await page.locator('#prog').boundingBox(), y = box.y + box.height / 2, at = f => box.x + box.width * f;
  const s0 = await st(); console.log('start', JSON.stringify(s0));
  await page.mouse.move(at(0.2), y); await page.mouse.down(); await sleep(200);
  let s = await st(); chk('press shows the scrub state and moves the bar to the pointer', s.scrub && Math.abs(parseFloat(s.w) - 20) < 1.5, s.w + ' ' + s.cur);
  await page.mouse.move(at(0.5), y, { steps: 6 }); await sleep(1300); s = await st();
  const fmt = x => String(Math.floor(x / 60)).padStart(2, '0') + ':' + String(Math.floor(x % 60)).padStart(2, '0');
  chk('dragging: bar at 50%', Math.abs(parseFloat(s.w) - 50) < 1.5, s.w);
  chk('dragging: counter shows the pointer position', s.cur === fmt(s.dur * 0.5) || Math.abs(+s.cur.slice(0, 2) * 60 + +s.cur.slice(3) - s.dur * 0.5) <= 1.5, s.cur + ' (50% of ' + Math.round(s.dur) + ' s)');
  chk('dragging: the music itself has not jumped', s.t < s0.t + 6 && s.title === s0.title && !s.paused, 'audio at ' + s.t.toFixed(1) + ' s');
  await page.mouse.move(at(0.8), y, { steps: 6 }); await sleep(200); s = await st(); chk('dragging further follows the pointer', Math.abs(parseFloat(s.w) - 80) < 1.5, s.w + ' ' + s.cur);
  await page.mouse.move(at(0.65), y, { steps: 4 }); await page.mouse.up(); await sleep(700); s = await st();
  chk('release seeks to the pointer position', Math.abs(s.t - s.dur * 0.65) < 2.5 && !s.scrub && !s.paused, 'audio at ' + s.t.toFixed(1) + ' of ' + s.dur.toFixed(1) + ' (want ' + (s.dur * 0.65).toFixed(1) + ')');
  // release outside the bar still counts, clamped
  await page.mouse.move(at(0.3), y); await page.mouse.down(); await page.mouse.move(at(0.3), y - 200, { steps: 4 }); await page.mouse.move(at(0.4), y - 220, { steps: 4 }); await page.mouse.up(); await sleep(600); s = await st();
  chk('dragging away vertically keeps scrubbing; release seeks', Math.abs(s.t - s.dur * 0.4) < 2.5, s.t.toFixed(1));
  // Esc cancels
  const before = await st(); await page.mouse.move(at(0.9), y); await page.mouse.down(); await page.mouse.move(at(0.1), y, { steps: 4 }); await page.keyboard.press('Escape'); await page.mouse.up(); await sleep(700); s = await st();
  chk('Esc cancels without seeking', !s.scrub && Math.abs(s.t - (before.t + 0.7)) < 2.5 && s.title === before.title, 'audio ' + before.t.toFixed(1) + ' -> ' + s.t.toFixed(1));
  // plain click still seeks
  await page.mouse.click(at(0.25), y); await sleep(600); s = await st(); chk('a plain click still seeks', Math.abs(s.t - s.dur * 0.25) < 2.5, s.t.toFixed(1));
  // counter goes back to following the song after release
  const a = await st(); await sleep(2200); const b = await st(); chk('counter resumes following playback', a.cur !== b.cur, a.cur + ' -> ' + b.cur);
  await app.close(); console.log(bad ? bad + ' CHECK(S) FAILED' : 'ALL PASSED'); process.exit(bad ? 1 : 0);
})().catch(e => { console.error('FAILED', e); process.exit(1); });
