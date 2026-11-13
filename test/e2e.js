'use strict';
// End-to-end smoke test against a real library. Usage: node test/e2e.js [--nogpu] [--keep-data]
// Uses an isolated user-data dir (so your real app state is untouched). Never modifies existing playlists.
const { _electron: electron } = require('playwright-core');
const path = require('path'), fs = require('fs'), os = require('os');

const ROOT = path.join(__dirname, '..');
const OUT = process.env.SP_TEST_OUT || fs.mkdtempSync(path.join(os.tmpdir(), 'sp-test-'));
const DATA = process.env.SP_TEST_DATA || path.join(OUT, 'userdata');
const nogpu = process.argv.includes('--nogpu');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = (...a) => console.log(...a);

(async () => {
  const args = [ROOT, '--user-data=' + DATA]; if (nogpu) args.push('--no-gpu');
  const t0 = Date.now();
  const app = await electron.launch({ args, env: { ...process.env, ELECTRON_ENABLE_LOGGING: '0' } });
  const page = await app.firstWindow();
  const errs = []; page.on('pageerror', e => errs.push('pageerror: ' + e.message)); page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await page.setViewportSize({ width: 1600, height: 900 }).catch(() => {});
  log('window up after', Date.now() - t0, 'ms; gpu:', nogpu ? 'disabled' : 'default');

  // wait for the scan to finish (progress shown in the library info line)
  let info = '', last = '';
  for (let i = 0; i < 1800; i++) {
    info = await page.evaluate(() => document.querySelector('#libInfo').textContent);
    const done = await page.evaluate(() => window.__sp && window.__sp.LIB.scanMs !== undefined);
    if (info !== last && i % 5 === 0) { log('  [' + Math.round((Date.now() - t0) / 1000) + 's]', info); last = info; }
    if (done) break; await sleep(1000);
  }
  const lib = await page.evaluate(() => ({ n: __sp.LIB.tracks.length, artists: __sp.LIB.artists.length, scanMs: __sp.LIB.scanMs, errs: __sp.LIB.scanErrors, info: document.querySelector('#libInfo').textContent,
    wma: __sp.LIB.tracks.filter(t => /\.wma$/i.test(t.abs)).length, noArtist: __sp.LIB.tracks.filter(t => !t.artist).length, noDur: __sp.LIB.tracks.filter(t => !t.dur).length,
    various: (__sp.LIB.artists.find(a => a.name === 'Various Artists') || {}).n || 0 }));
  log('LIBRARY', JSON.stringify(lib));

  const pls = await page.evaluate(() => [...__sp.PL.all.values()].filter(p => !p.special).map(p => [p.name, p.tracks.length, p.tracks.filter(t => t.missing).length]));
  const tot = pls.reduce((a, p) => a + p[1], 0), miss = pls.reduce((a, p) => a + p[2], 0);
  log('PLAYLISTS', pls.length, 'lists,', tot, 'entries,', miss, 'unresolved');
  log('  worst:', JSON.stringify(pls.filter(p => p[2]).sort((a, b) => b[2] - a[2]).slice(0, 6)));

  // playback
  const pick = await page.evaluate(() => { const t = __sp.LIB.tracks.find(t => /\.mp3$/i.test(t.abs) && t.dur > 120); __sp.setS('vol', 0.0); __sp.addToNP([t], true); return t.abs; });
  await sleep(4000);
  const p1 = await page.evaluate(() => ({ title: document.querySelector('#npTitle').textContent, cur: document.querySelector('#tcur').textContent, dur: document.querySelector('#tdur').textContent, hasSpec: !!(__sp.P.track && __sp.P.track.spec) }));
  log('PLAY', pick, JSON.stringify(p1));
  await page.keyboard.press('Control+ArrowRight'); await sleep(600);
  const p2 = await page.evaluate(() => document.querySelector('#tcur').textContent); log('SEEK +15s ->', p2);
  await page.keyboard.press('Space'); await sleep(400); const paused = await page.evaluate(() => document.querySelector('#bPlay').innerHTML.includes('M8 5v14')); await page.keyboard.press('Space');
  log('PAUSE toggled (play icon shown while paused):', paused);

  // flac / wma / m4a behaviour
  for (const ext of ['flac', 'm4a', 'wma']) {
    const r = await page.evaluate(async ext => {
      const t = __sp.LIB.tracks.find(t => t.abs.toLowerCase().endsWith('.' + ext)); if (!t) return null;
      __sp.addToNP([t], true); await new Promise(r => setTimeout(r, 3500));
      return { t: t.abs, cur: document.querySelector('#tcur').textContent, msg: document.querySelector('#msg').style.display === 'block' ? document.querySelector('#msg').textContent : '' };
    }, ext); log('FORMAT', ext, JSON.stringify(r));
  }
  await page.evaluate(() => { const t = __sp.LIB.tracks.find(t => /\.mp3$/i.test(t.abs) && t.dur > 120); __sp.addToNP([t], true); });
  await sleep(1500);

  // visual performance while playing
  await page.keyboard.press('Control+d');
  const s0 = await page.evaluate(() => __sp.stats); const m0 = await app.evaluate(({ app }) => app.getAppMetrics().map(m => ({ t: m.type, cpu: m.cpu.percentCPUUsage, mb: Math.round(m.memory.workingSetSize / 1024) })));
  await sleep(10000);
  const s1 = await page.evaluate(() => __sp.stats), m1 = await app.evaluate(({ app }) => app.getAppMetrics().map(m => ({ t: m.type, cpu: Math.round(m.cpu.percentCPUUsage * 10) / 10, mb: Math.round(m.memory.workingSetSize / 1024) })));
  log('RENDER', JSON.stringify({ fps: Math.round((s1.frames - s0.frames) / 10 * 10) / 10, W: s1.W, H: s1.H, qual: s1.qual, msAvg: s1.msAvg, balls: s1.dotCount }));
  log('PROCS(cpu%/MB)', JSON.stringify(m1));
  await page.screenshot({ path: path.join(OUT, 'main' + (nogpu ? '-nogpu' : '') + '.png') });

  // playlist write/rename/delete round trip with a throwaway playlist
  const rt = await page.evaluate(async () => {
    const h = __sp.host, tr = __sp.LIB.tracks.slice(0, 3), txt = __sp.toM3U(tr, h.playlistDir);
    await h.savePlaylist('zz-sp-roundtrip', txt); let l = (await h.listPlaylists()).find(p => p.name === 'zz-sp-roundtrip');
    const back = __sp.parsePlaylistText(l.text, h.playlistDir, 'x.m3u').map(e => e.abs.toLowerCase());
    const ok = JSON.stringify(back) === JSON.stringify(tr.map(t => t.abs.toLowerCase()));
    await h.renamePlaylist('zz-sp-roundtrip', 'zz-sp-roundtrip2'); const ren = !!(await h.listPlaylists()).find(p => p.name === 'zz-sp-roundtrip2');
    await h.deletePlaylist('zz-sp-roundtrip2'); const gone = !(await h.listPlaylists()).find(p => /zz-sp-/.test(p.name));
    return { ok, ren, gone, text: txt.split('\n').slice(0, 3).join(' | ') };
  });
  log('PLAYLIST IO', JSON.stringify(rt));

  log('PAGE ERRORS', errs.length ? JSON.stringify(errs.slice(0, 8)) : 'none');
  await app.close();
  const files = fs.readdirSync(DATA).map(f => f + ':' + fs.statSync(path.join(DATA, f)).size);
  log('USERDATA after quit', files.join(', '));
  log('OUT', OUT);
  process.exit(0);
})().catch(e => { console.error('TEST FAILED', e); process.exit(1); });
