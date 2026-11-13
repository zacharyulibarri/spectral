'use strict';
// 1) dragging into Now Playing only adds (never interrupts), double-click still plays;  2) log vs linear spectrum height.
// Usage: node test/dnd_log.js <userDataDir with a warm library cache> <outDir>
const { _electron: electron } = require('playwright-core');
const path = require('path'), fs = require('fs');
const ROOT = path.join(__dirname, '..'), DATA = process.argv[2], OUT = process.argv[3] || '.';
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const app = await electron.launch({ args: [ROOT, '--user-data=' + DATA] });
  const page = await app.firstWindow();
  await page.setViewportSize({ width: 1600, height: 900 }).catch(() => {});
  await page.waitForFunction(() => window.__sp && window.__sp.LIB.tracks.length > 1000, null, { timeout: 60000 });
  await page.evaluate(() => __sp.setS('vol', 0));
  const state = () => page.evaluate(() => ({ np: __sp.PL.all.get('Now Playing').tracks.length, playing: __sp.P.track && __sp.P.track.abs.split('/').pop(), cur: +__sp.audioEl.currentTime.toFixed(1), paused: __sp.audioEl.paused }));

  // ---- 1) drag and drop ----
  await page.evaluate(() => __sp.addToNP(__sp.LIB.tracks.filter(t => /\.mp3$/i.test(t.abs)).slice(0, 2), true)); await sleep(2500);
  const before = await state(); console.log('playing          ', JSON.stringify(before));
  // drag a library artist row onto the Now Playing list
  const row = page.locator('#libList .row.artist').nth(3), target = page.locator('#plList');
  await row.dragTo(target, { targetPosition: { x: 200, y: 60 } }); await sleep(800);
  const afterList = await state(); console.log('after drop on list', JSON.stringify(afterList), '| added', afterList.np - before.np, '| same track still playing:', afterList.playing === before.playing && afterList.cur >= before.cur);
  // drag onto the "Now Playing" chip of the popup strip
  const row2 = page.locator('#libList .row.artist').nth(5);
  const box = await row2.boundingBox(); await page.mouse.move(box.x + 60, box.y + box.height / 2); await page.mouse.down(); await page.mouse.move(box.x + 70, box.y + 40, { steps: 4 });
  await page.waitForSelector('#dropPanel.on .chip', { timeout: 3000 }); const chip = await page.locator('#dropPanel .chip').first().boundingBox();
  await page.mouse.move(chip.x + 20, chip.y + chip.height / 2, { steps: 6 }); await page.mouse.up(); await sleep(800);
  const afterChip = await state(); console.log('after drop on chip', JSON.stringify(afterChip), '| added', afterChip.np - afterList.np, '| same track still playing:', afterChip.playing === before.playing);
  // double-click still plays what was double-clicked
  await page.locator('#libList .row.artist').nth(7).dblclick(); await sleep(2500);
  const afterDbl = await state(); console.log('after double-click', JSON.stringify(afterDbl), '| started a new track:', afterDbl.playing !== before.playing);

  // ---- 2) log vs linear ----
  await page.evaluate(() => { const t = __sp.LIB.tracks.filter(t => /\.mp3$/i.test(t.abs))[50]; __sp.addToNP([t], true); }); await sleep(2000);
  const measure = async (label, set) => {
    await page.evaluate(set); await page.evaluate(() => { __sp.audioEl.currentTime = 60; }); await sleep(2500);
    const m = await page.evaluate(async () => {
      const samples = []; for (let i = 0; i < 60; i++) { samples.push(Float32Array.from(__sp.amps)); await new Promise(r => setTimeout(r, 100)); }
      const nb = samples[0].length; let acrossSum = 0, timeSum = 0, mean = 0, hi = 0, lo = 0, n = 0;
      for (const s of samples) { let m = 0; for (const v of s) m += v; m /= nb; mean += m; let v2 = 0; for (const v of s) v2 += (v - m) ** 2; acrossSum += Math.sqrt(v2 / nb); for (const v of s) { if (v > 0.7) hi++; if (v < 0.3) lo++; n++; } }
      for (let b = 0; b < nb; b++) { let m = 0; for (const s of samples) m += s[b]; m /= samples.length; let v2 = 0; for (const s of samples) v2 += (s[b] - m) ** 2; timeSum += Math.sqrt(v2 / samples.length); }
      return { meanHeight: +(mean / samples.length).toFixed(3), spreadAcrossBands: +(acrossSum / samples.length).toFixed(3), changeOverTime: +(timeSum / nb).toFixed(3), fracHigh: +(hi / n).toFixed(3), fracLow: +(lo / n).toFixed(3) };
    });
    console.log(label.padEnd(24), JSON.stringify(m));
    await page.evaluate(() => __sp.setS('collapsed', true)); await sleep(700);          // hide the panels so the waterfall is unobstructed
    await page.screenshot({ path: path.join(OUT, label.replace(/\W+/g, '_') + '.png') }); await page.evaluate(() => __sp.setS('collapsed', false));
  };
  await measure('linear (current)', () => { __sp.setS('logScale', false); __sp.setS('hGain', 1); });
  await measure('log 45 dB', () => { __sp.setS('logScale', true); __sp.setS('logRange', 45); });
  await measure('log 30 dB', () => { __sp.setS('logRange', 30); });
  await measure('log 45 dB, range 1.8x', () => { __sp.setS('logRange', 45); __sp.setS('hGain', 1.8); });
  await app.close(); process.exit(0);
})().catch(e => { console.error('FAILED', e); process.exit(1); });
