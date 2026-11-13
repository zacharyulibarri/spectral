'use strict';
// Tests the PACKAGED app (dist/win-unpacked/Spectral.exe): scan + tags through the worker, live audio, and Explorer-style
// multi-select Open With: three processes started ~80 ms apart, deliberately out of order. Usage: node test/packaged.js [exePath]
const { chromium } = require('playwright-core');
const { spawn } = require('child_process');
const path = require('path'), fs = require('fs'), os = require('os');
const EXE = process.argv[2] || path.join(__dirname, '..', 'dist', 'win-unpacked', 'Spectral.exe');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-pkg-')), UD = path.join(tmp, 'ud');
const ROOT = process.env.SP_TEST_LIB, PORT = 9333;
if (!ROOT) { console.error('Set SP_TEST_LIB to a folder with a few audio files (an album folder works).'); process.exit(2); }
const env = { ...process.env, SP_MUSIC_ROOT: ROOT, SP_PLAYLIST_DIR: tmp.replace(/\\/g, '/') };
(async () => {
  if (!fs.existsSync(EXE)) throw new Error('missing ' + EXE);
  const files = []; (function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (/\.mp3$/i.test(e.name) && files.length < 3) files.push(p); } })(ROOT);
  const sorted = [...files].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const order = [files[2], files[0], files[1]];                       // arrival order, not alphabetical
  const procs = order.map((f, i) => new Promise(r => setTimeout(() => {
    const c = spawn(EXE, ['--user-data=' + UD, ...(i === 0 ? ['--remote-debugging-port=' + PORT] : []), f], { env, stdio: 'ignore' }); c.on('exit', code => r(code));
  }, 80 * i)));
  let browser; for (let i = 0; i < 60 && !browser; i++) { try { browser = await chromium.connectOverCDP('http://127.0.0.1:' + PORT); } catch (_) { await sleep(500); } }
  const page = browser.contexts()[0].pages()[0];
  await page.waitForFunction(() => window.__sp && window.__sp.LIB.scanMs !== undefined, null, { timeout: 120000 });
  const lib = await page.evaluate(() => ({ n: __sp.LIB.tracks.length, sample: (({ artist, album, title, no, dur }) => ({ artist, album, title, no, dur }))(__sp.LIB.tracks[0]), scanMs: __sp.LIB.scanMs, errs: __sp.LIB.scanErrors }));
  console.log('PACKAGED LIBRARY', JSON.stringify(lib));
  await sleep(1500);
  const r = await page.evaluate(async () => {
    __sp.setS('vol', 0); await new Promise(r => setTimeout(r, 1500));
    const a = new Uint8Array(__sp.analyser.frequencyBinCount); __sp.analyser.getByteFrequencyData(a);
    return { np: __sp.PL.all.get('Now Playing').tracks.map(t => t.abs), idx: __sp.P.idx, analyserMax: Math.max(...a), cur: document.querySelector('#tcur').textContent };
  });
  console.log('NOW PLAYING', JSON.stringify(r.np.map(p => p.split('/').pop())));
  console.log('  expected order', JSON.stringify(sorted.map(p => path.basename(p))));
  const same = JSON.stringify(r.np.map(p => p.toLowerCase())) === JSON.stringify(sorted.map(p => p.replace(/\\/g, '/').toLowerCase()));
  console.log('  one batch, in order:', same, '| playing the first:', r.idx === 0, '| audio reaches analyser:', r.analyserMax > 0, '| position', r.cur);
  console.log('  extra processes exited with', JSON.stringify(await Promise.race([Promise.all(procs.slice(1)), sleep(3000).then(() => 'still running')])));
  await page.evaluate(() => window.close()).catch(() => {}); await sleep(1500);
  try { await browser.close(); } catch (_) {}
  fs.rmSync(tmp, { recursive: true, force: true }); process.exit(0);
})().catch(e => { console.error('FAILED', e); process.exit(1); });
