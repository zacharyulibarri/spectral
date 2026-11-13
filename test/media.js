'use strict';
// Media keys / system media overlay setting, and the first-run welcome screen.
// Usage: node test/media.js <userDataDir with a warm library cache (library.json, config.json, specs.json)>
const { _electron: electron } = require('playwright-core');
const path = require('path'), fs = require('fs'), os = require('os');
const ROOT = path.join(__dirname, '..'), SRC = process.argv[2];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const fresh = (name, files) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-' + name + '-')); for (const f of files) if (fs.existsSync(path.join(SRC, f))) fs.copyFileSync(path.join(SRC, f), path.join(d, f)); return d; };
const launch = dir => electron.launch({ args: [ROOT, '--user-data=' + dir] });
let bad = 0;
const chk = (name, cond, extra) => { console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : '')); if (!cond) bad++; };

(async () => {
  /* 1. overlay on (default): metadata follows the song, actions work */
  let dir = fresh('on', ['library.json', 'config.json', 'specs.json']);
  let app = await launch(dir), page = await app.firstWindow();
  await page.waitForFunction(() => window.__sp && window.__sp.LIB.tracks.length > 100, null, { timeout: 60000 });
  const sw = await app.evaluate(({ app: a, globalShortcut }) => ({ sw: a.commandLine.getSwitchValue('disable-features'), reg: globalShortcut.isRegistered('MediaPlayPause') }));
  chk('overlay on: Chromium media handling left enabled', !/HardwareMediaKeyHandling/.test(sw.sw) && !sw.reg, JSON.stringify(sw));
  await page.evaluate(() => { __sp.setS('vol', 0); __sp.addToNP(__sp.LIB.tracks.filter(t => /\.mp3$/i.test(t.abs)).slice(30, 36), true); }); await sleep(1500);
  const st = () => page.evaluate(() => ({ title: __sp.P.track && __sp.P.track.title, paused: __sp.audioEl.paused, idx: __sp.P.idx, media: __sp.media }));
  let s = await st();
  chk('metadata set for the playing song', s.media && s.media.md && s.media.md.title === s.title && s.media.state === 'playing', JSON.stringify(s.media));
  await page.evaluate(() => __sp.mediaAction('next')); await sleep(800); let s2 = await st();
  chk('next key -> next track', s2.idx === s.idx + 1 && s2.media.md.title === s2.title, s.title + ' -> ' + s2.title);
  await page.evaluate(() => __sp.mediaAction('prev')); await sleep(600); let s3 = await st();
  chk('previous key (within 3 s) -> previous track', s3.idx === s.idx, s3.title);
  await page.evaluate(() => __sp.mediaAction('pause')); await sleep(300); s = await st();
  chk('pause', s.paused && s.media.state === 'paused', s.media.state);
  await page.evaluate(() => __sp.mediaAction('play')); await sleep(300); s = await st();
  chk('play', !s.paused && s.media.state === 'playing');
  await page.evaluate(() => __sp.mediaAction('playpause')); await sleep(300); s = await st(); chk('play/pause toggles', s.paused);
  await page.evaluate(() => __sp.mediaAction('playpause')); await sleep(300);
  await page.evaluate(() => __sp.setS('mediaOverlay', false)); await sleep(300); s = await st();
  chk('unticking clears the metadata and warns about a restart', s.media.md === null && /Restart Spectral/.test(await page.textContent('#msg')));
  await sleep(700); await app.close();
  const saved = JSON.parse(fs.readFileSync(path.join(dir, 'settings.json'), 'utf8')); chk('setting saved to settings.json', saved.mediaOverlay === false);

  /* 2. next start with the setting off: Chromium's registration is disabled and the keys come in through global shortcuts */
  app = await launch(dir); page = await app.firstWindow();
  await page.waitForFunction(() => window.__sp && window.__sp.LIB.tracks.length > 100, null, { timeout: 60000 });
  const off = await app.evaluate(({ app: a, globalShortcut }) => ({ sw: a.commandLine.getSwitchValue('disable-features'), pp: globalShortcut.isRegistered('MediaPlayPause'), nx: globalShortcut.isRegistered('MediaNextTrack'), pv: globalShortcut.isRegistered('MediaPreviousTrack') }));
  chk('overlay off: media handling disabled, keys registered globally', /HardwareMediaKeyHandling/.test(off.sw) && off.pp && off.nx && off.pv, JSON.stringify(off));
  chk('renderer knows the startup state', await page.evaluate(() => __sp.host.mediaOverlay === false));
  await page.evaluate(() => { __sp.setS('vol', 0); __sp.addToNP(__sp.LIB.tracks.filter(t => /\.mp3$/i.test(t.abs)).slice(30, 36), true); }); await sleep(1500);
  s = await st(); await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.send('sp:media', 'next')); await sleep(800); s2 = await st();
  chk('media key event from the main process skips ahead', s2.idx === s.idx + 1, s.title + ' -> ' + s2.title);
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.send('sp:media', 'playpause')); await sleep(300); s = await st(); chk('...and play/pause', s.paused);
  await app.close();

  /* 3. first run: nothing is scanned until the welcome screen is finished, then the chosen folder is used */
  const lib = JSON.parse(fs.readFileSync(path.join(SRC, 'library.json'), 'utf8')), cfgS = JSON.parse(fs.readFileSync(path.join(SRC, 'config.json'), 'utf8'));
  const first = cfgS.folders[0].path.replace(/\/+$/, ''), sub = lib.e.map(e => e[0].slice(e[0].indexOf('|') + 1)).find(r => r.includes('/')).split('/')[0];
  const pick = first + '/' + sub;                                  // one artist folder: small and quick to scan
  dir = fresh('first', []); app = await launch(dir); page = await app.firstWindow();
  await page.waitForFunction(() => window.__sp && window.__sp.host, null, { timeout: 30000 }); await sleep(2500);
  let w = await page.evaluate(() => ({ open: document.querySelector('#welcome').classList.contains('open'), tracks: __sp.LIB.tracks.length, firstRun: __sp.host.firstRun, folders: __sp.host.folders }));
  chk('fresh install shows the welcome screen', w.open && w.firstRun, JSON.stringify(w.folders));
  chk('and has not scanned anything yet', w.tracks === 0 && (await page.textContent('#libInfoTx')).trim().startsWith('0 songs'), await page.textContent('#libInfoTx'));
  chk('welcome has a folder row and a start button', (await page.locator('#welcome .fl').count()) === 1 && (await page.locator('#welcome button.go').count()) === 1);
  await app.evaluate(({ dialog }, p) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [p] }); }, pick.replace(/\//g, '\\'));
  await page.locator('#welcome .fl button').click(); await sleep(400);
  chk('chosen folder replaces the main folder', (await page.textContent('#welcome .fl span')).includes(sub), await page.textContent('#welcome .fl span'));
  await page.locator('#welcome button.go').click();
  await page.waitForFunction(() => window.__sp && window.__sp.LIB.tracks.length > 0, null, { timeout: 60000 });
  await sleep(1500); w = await page.evaluate(() => ({ open: document.querySelector('#welcome').classList.contains('open'), tracks: __sp.LIB.tracks.length, firstRun: __sp.host.firstRun, folders: __sp.host.folders, pl: __sp.host.playlistDir, abs: __sp.LIB.tracks[0].abs }));
  chk('after Start: library built from the chosen folder only', !w.open && !w.firstRun && w.tracks > 0 && w.tracks < 2000 && w.tracks < lib.e.length && w.abs.toLowerCase().includes(sub.toLowerCase()), w.tracks + ' songs, ' + JSON.stringify(w.folders));
  chk('playlists live in the chosen main folder', w.pl.toLowerCase().includes(sub.toLowerCase()), w.pl);
  await app.close();
  app = await launch(dir); page = await app.firstWindow(); await page.waitForFunction(() => window.__sp && window.__sp.LIB.tracks.length > 0, null, { timeout: 60000 }); await sleep(800);
  chk('second start: no welcome', !(await page.evaluate(() => document.querySelector('#welcome').classList.contains('open'))));
  await page.evaluate(() => document.querySelector('#gear').click());
  await page.locator('#panel button', { hasText: 'Quick tips' }).click(); await sleep(200);
  chk('Quick tips reopens it (tips only, Close button)', (await page.locator('#welcome.open button.go').textContent()) === 'Close' && (await page.locator('#welcome .fl').count()) === 0);
  await page.keyboard.press('Escape'); await sleep(150); chk('Escape closes it', !(await page.evaluate(() => document.querySelector('#welcome').classList.contains('open'))));
  await app.close();
  console.log(bad ? bad + ' CHECK(S) FAILED' : 'ALL PASSED'); process.exit(bad ? 1 : 0);
})().catch(e => { console.error('FAILED', e); process.exit(1); });
