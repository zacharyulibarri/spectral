'use strict';
// Open With / single-instance test. Usage: node test/openwith.js <userDataDir> <audioFile1> <audioFile2> [playlist.m3u]
const { _electron: electron } = require('playwright-core');
const { spawn } = require('child_process');
const path = require('path');
const ROOT = path.join(__dirname, '..'), electronExe = require(path.join(ROOT, 'node_modules', 'electron'));
const [DATA, f1, f2, pl] = process.argv.slice(2);
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  // 1) cold start with a file argument (what Explorer's "Open with" does)
  const app = await electron.launch({ args: [ROOT, '--user-data=' + DATA, f1] });
  const page = await app.firstWindow();
  await page.waitForFunction(() => window.__sp && window.__sp.LIB.tracks.length > 0, null, { timeout: 60000 });
  await page.evaluate(() => __sp.setS('vol', 0)); await sleep(2500);
  const a = await page.evaluate(() => ({ np: __sp.PL.all.get('Now Playing').tracks.map(t => t.abs), title: document.querySelector('#npTitle').textContent, inLib: !!__sp.LIB.byAbs.get(__sp.PL.all.get('Now Playing').tracks.slice(-1)[0].abs.toLowerCase()) }));
  console.log('COLD OPEN', JSON.stringify(a));
  // 2) a second launch must hand its file to the running instance and exit
  const t0 = Date.now();
  const child = spawn(electronExe, [ROOT, '--user-data=' + DATA, f2, ...(pl ? [pl] : [])], { stdio: 'ignore' });
  const code = await new Promise(r => child.on('exit', r));
  console.log('SECOND INSTANCE exited with', code, 'after', Date.now() - t0, 'ms');
  await sleep(2500);
  const b = await page.evaluate(() => ({ np: __sp.PL.all.get('Now Playing').tracks.map(t => t.abs), cur: document.querySelector('#npTitle').textContent, lists: [...__sp.PL.all.keys()].length }));
  console.log('AFTER FORWARD', JSON.stringify(b));
  await app.close(); console.log('DONE'); process.exit(0);
})().catch(e => { console.error('FAILED', e); process.exit(1); });
