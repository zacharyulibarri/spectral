'use strict';
// "Edit tags" dialog end to end, on COPIES of a few real files in a temporary library (your music is never touched).
// Usage: node test/edittags_ui.js <userDataDir with a warm library cache; used only to pick sample files>
const { _electron: electron } = require('playwright-core');
const path = require('path'), fs = require('fs'), os = require('os');
const ROOT = path.join(__dirname, '..'), SRC = process.argv[2];
const sleep = ms => new Promise(r => setTimeout(r, ms));
let bad = 0; const chk = (n, c, x) => { console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? '  ' + x : '')); if (!c) bad++; };
(async () => {
  const mm = await import('music-metadata');
  const lib = JSON.parse(fs.readFileSync(path.join(SRC, 'library.json'), 'utf8')), cfg0 = JSON.parse(fs.readFileSync(path.join(SRC, 'config.json'), 'utf8'));
  const base = cfg0.folders[0].path.replace(/\/+$/, ''), abs = e => base + '/' + e[0].slice(e[0].indexOf('|') + 1);
  const small = e => { try { return fs.statSync(abs(e)).size < 14e6; } catch (_) { return false; } };
  // a group of mp3s that belong together (same album artist, at least 6 songs)
  const groups = new Map(); for (const e of lib.e) if (/\.mp3$/i.test(e[0]) && (e[4] || e[3]) && small(e)) { const k = (e[4] || e[3]).toLowerCase(); (groups.get(k) || groups.set(k, []).get(k)).push(e); }
  const g = [...groups.values()].find(a => a.length >= 7 && a.length <= 14); if (!g) throw new Error('no suitable sample group');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-edit-lib-')), data = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-edit-data-'));
  const copy = (e, sub) => { const d = path.join(root, sub); fs.mkdirSync(d, { recursive: true }); const f = path.join(d, path.basename(abs(e))); fs.copyFileSync(abs(e), f); return f; };
  const gname = g[0][4] || g[0][3], mp3s = g.map(e => copy(e, 'Group')), others = [];
  const one = ext => lib.e.find(e => e[0].toLowerCase().endsWith(ext) && small(e) && !groups.has((e[4] || e[3]).toLowerCase()));
  for (const ext of ['.flac', '.m4a', '.wma']) { const e = lib.e.filter(x => x[0].toLowerCase().endsWith(ext) && small(x))[3]; if (e) others.push(copy(e, 'Other ' + ext.slice(1))); }
  fs.writeFileSync(path.join(data, 'config.json'), JSON.stringify({ folders: [{ id: 'r1', path: root.replace(/\\/g, '/') }], playlistDir: root.replace(/\\/g, '/'), welcomed: true }));
  fs.writeFileSync(path.join(data, 'settings.json'), JSON.stringify({ vol: 0 }));
  const tagsOf = async f => { const m = await mm.parseFile(f, { skipCovers: false }); return m; };
  const snap = async files => { const o = {}; for (const f of files) { const m = await tagsOf(f); o[f] = { aa: m.common.albumartist, a: m.common.artist, t: m.common.title, al: m.common.album, y: m.common.year, d: m.common.disk && m.common.disk.no, g: JSON.stringify([m.common.genre, m.common.comment, m.common.picture && m.common.picture.length]), size: fs.statSync(f).size }; } return o; };
  const before = await snap(mp3s);
  console.log('sample group:', JSON.stringify(gname), mp3s.length, 'mp3 + others:', others.map(f => path.extname(f)).join(' '));

  const app = await electron.launch({ args: [ROOT, '--user-data=' + data] }), page = await app.firstWindow();
  await page.setViewportSize({ width: 1500, height: 900 }).catch(() => {});
  await page.waitForFunction(() => window.__sp && window.__sp.LIB.tracks.length >= 4 && window.__sp.LIB.scanMs !== undefined, null, { timeout: 60000 }); await sleep(500);
  const nameRow = async name => { const i = await page.evaluate(n => { const f = __sp.flat; for (let i = 0; i < f.length; i++) if (f[i].t === 'A' && f[i].a.name === n) return i; return -1; }, name); if (i < 0) return null; await page.evaluate(i => __sp.libList.scrollTo(i), i); await sleep(250); return page.locator('#libList .row[data-i="' + i + '"]'); };
  const menuItems = async () => page.locator('.menu .mi').allTextContents();
  const openDialog = async row => { await row.click({ button: 'right' }); await sleep(200); await page.locator('.menu .mi', { hasText: 'Edit tags' }).click(); await sleep(300); };
  const dlg = () => page.locator('#tagEd.open');

  // 1. artist-level edit while the group is playing (long name: forces every file to be rewritten)
  await page.evaluate(g => { __sp.setS('vol', 0); const t = __sp.LIB.tracks.filter(t => (t.albumArtist || t.artist) === g); __sp.addToNP(t, true); }, gname); await sleep(1500);
  await page.evaluate(() => { __sp.audioEl.currentTime = 25; }); await sleep(1200);
  const playing = await page.evaluate(() => ({ t: __sp.P.track.title, pos: __sp.audioEl.currentTime, paused: __sp.audioEl.paused }));
  const row = await nameRow(gname); chk('artist row found in the library', !!row);
  await row.click({ button: 'right' }); await sleep(200); const mi = await menuItems(); chk('right-click menu offers Edit tags…', mi.some(t => /Edit tags/.test(t)), mi.join(' | ').slice(0, 160));
  await page.locator('.menu .mi', { hasText: 'Edit tags' }).click(); await sleep(300);
  chk('dialog opens with the artist name', await dlg().count() === 1 && (await dlg().locator('input[type=text]').first().inputValue()) === gname);
  chk('Save is disabled until something changes', await dlg().locator('button.go').isDisabled(), await dlg().locator('.sp').textContent());
  chk('the track-artist checkbox starts ticked (these songs have no album artist tag, so the name comes from the track artist)', await dlg().locator('input[type=checkbox]').isChecked());
  const NEW = 'Renamed Artist ' + 'Q'.repeat(300);
  await dlg().locator('input[type=text]').first().fill(NEW); await sleep(200);
  chk('it says how many files will change', /\d+ files? will be changed/.test(await dlg().locator('.sp').textContent()), await dlg().locator('.sp').textContent());
  await dlg().locator('button.go').click();
  await page.waitForFunction(() => document.querySelector('#undoBar').classList.contains('open'), null, { timeout: 60000 }); await sleep(800);
  const afterPlay = await page.evaluate(() => ({ t: __sp.P.track.title, pos: __sp.audioEl.currentTime, paused: __sp.audioEl.paused, err: !!__sp.audioEl.error, dur: __sp.audioEl.duration }));
  chk('dialog closed and an Undo bar appeared', await dlg().count() === 0 && /Saved changes to \d+ file/.test(await page.textContent('#undoBar span')), await page.textContent('#undoBar span'));
  chk('the song that was playing kept playing, at its position', afterPlay.t === playing.t && !afterPlay.paused && !afterPlay.err && afterPlay.pos >= playing.pos - 1 && afterPlay.pos < playing.pos + 9, JSON.stringify(playing) + ' -> ' + JSON.stringify(afterPlay));
  await sleep(1500); const later = await page.evaluate(() => __sp.audioEl.currentTime); chk('…and keeps advancing', later > afterPlay.pos + 0.8, afterPlay.pos.toFixed(1) + ' -> ' + later.toFixed(1));
  const after = await snap(mp3s); let okAll = true, why = '';
  for (const f of mp3s) { const b = before[f], a = after[f]; const dk = []; if (a.aa !== NEW.trim()) dk.push('aa'); if (a.a !== NEW.trim()) dk.push('a'); for (const x of ['t', 'al', 'y', 'g']) if (a[x] !== b[x]) dk.push(x); if (dk.length) { okAll = false; why = path.basename(f) + ' differs in ' + dk.join(',') + ' | before ' + String(b[dk[dk.length - 1]]).slice(0, 120) + ' | after ' + String(a[dk[dk.length - 1]]).slice(0, 120); break; } }
  chk('every file: album artist and track artist changed, all other tags identical', okAll, why);
  chk('library shows the new name straight away', await page.evaluate(n => __sp.LIB.artists.some(a => a.name === n), NEW.trim()));
  chk('and the old name is gone', !(await page.evaluate(n => __sp.LIB.artists.some(a => a.name === n), gname)));
  const renamedFiles = new Set(); for (const f of mp3s) if (after[f].size !== before[f].size) renamedFiles.add(f);
  console.log('  files rewritten (size changed):', renamedFiles.size, 'of', mp3s.length);
  await sleep(4000); chk('the background rescan agrees', await page.evaluate(n => __sp.LIB.artists.some(a => a.name === n), NEW.trim()) && !(await page.evaluate(n => __sp.LIB.artists.some(a => a.name === n), gname)));

  // 2. undo from the bar
  await page.locator('#undoBar button').click(); await sleep(2500);
  const undone = await snap(mp3s); let same = true; for (const f of mp3s) { const b = before[f], a = undone[f]; if (a.aa !== b.aa || a.t !== b.t || a.g !== b.g || a.al !== b.al) same = false; }
  chk('Undo restores the original album artist on every file', same);
  await sleep(4000); chk('library shows the old name again', await page.evaluate(n => __sp.LIB.artists.some(a => a.name === n), gname));
  const stillPlaying = await page.evaluate(() => ({ paused: __sp.audioEl.paused, err: !!__sp.audioEl.error })); chk('playback survived the undo', !stillPlaying.paused && !stillPlaying.err);

  // 3. album-level edit
  const row2 = await nameRow(gname); await row2.locator('.chev').click(); await sleep(300);
  const alb = page.locator('#libList .row.album >> nth=0'); await openDialog(alb);
  const labels = await dlg().locator('.lb').allTextContents(); chk('album dialog fields', labels.join(',') === 'Album,Album artist,Year', labels.join(','));
  const ins = dlg().locator('input[type=text]'); await ins.nth(0).fill('Brand New Album'); await ins.nth(2).fill('1987'); await sleep(150);
  const firstAlbumTracks = await page.evaluate(g => { const a = __sp.LIB.artists.find(a => a.name === g); return a.albums[0].tracks.map(t => t.abs); }, gname);
  await dlg().locator('button.go').click(); await page.waitForFunction(() => document.querySelector('#undoBar').classList.contains('open') && !document.querySelector('#tagEd.open'), null, { timeout: 30000 }); await sleep(500);
  const a3 = await snap(firstAlbumTracks.map(p => p.replace(/\//g, '\\'))); chk('album name and year written to that album\'s files', Object.values(a3).every(x => x.al === 'Brand New Album' && x.y === 1987), JSON.stringify(Object.values(a3)[0]));
  chk('library shows the album', await page.evaluate(() => __sp.flat.some(r => r.t === 'B' && r.b.name === 'Brand New Album')));

  // 4. one song, then two songs from Now Playing
  await page.evaluate(() => __sp.addToNP(__sp.LIB.tracks.filter(t => /Other|Group/.test(t.abs)).slice(0, 4), false)); await sleep(400);
  const r0 = page.locator('#plList .row.pr:not(.missing) >> nth=1'); await openDialog(r0);
  const lb = await dlg().locator('.lb').allTextContents(); chk('song dialog has all seven fields', lb.length === 7, lb.join(','));
  const target = await page.evaluate(() => { const l = __sp.PL.all.get('Now Playing'); return l.tracks[1].abs; });
  await dlg().locator('input[type=text]').nth(0).fill('Retitled Song'); await dlg().locator('input[type=text]').nth(4).fill('9'); await dlg().locator('button.go').click();
  await page.waitForFunction(() => !document.querySelector('#tagEd.open'), null, { timeout: 30000 }); await sleep(500);
  const m4 = await tagsOf(target.replace(/\//g, '\\')); chk('title and track number written', m4.common.title === 'Retitled Song' && m4.common.track.no === 9, m4.common.title + ' #' + m4.common.track.no);
  chk('Now Playing shows the new title', (await page.locator('#plList .row.pr >> nth=1').textContent()).includes('Retitled Song'));
  await page.locator('#plList .row.pr >> nth=2').click(); await page.locator('#plList .row.pr >> nth=3').click({ modifiers: ['Control'] }); await sleep(150);
  await page.locator('#plList .row.pr >> nth=3').click({ button: 'right' }); await sleep(200); await page.locator('.menu .mi', { hasText: 'Edit tags' }).click(); await sleep(300);
  const ph = await dlg().locator('input[type=text]').nth(0).getAttribute('placeholder'); chk('several songs: differing fields show (multiple values)', /multiple/.test(ph || ''), ph);
  const two = await page.evaluate(() => { const l = __sp.PL.all.get('Now Playing'); return [...l.sel].map(i => l.tracks[i].abs); });
  await dlg().locator('input[type=text]').nth(5).fill('3'); await sleep(150);
  chk('only the typed field would change', /2 files will be changed/.test(await dlg().locator('.sp').textContent()), await dlg().locator('.sp').textContent());
  const titlesBefore = []; for (const f of two) titlesBefore.push((await tagsOf(f.replace(/\//g, '\\'))).common.title);
  await dlg().locator('button.go').click(); await page.waitForFunction(() => !document.querySelector('#tagEd.open'), null, { timeout: 30000 }); await sleep(500);
  const ds = []; for (const f of two) { const m = await tagsOf(f.replace(/\//g, '\\')); ds.push([m.common.disk && m.common.disk.no, m.common.title]); }
  chk('disc number written to both, titles untouched', ds.every((d, i) => d[0] === 3 && d[1] === titlesBefore[i]), JSON.stringify(ds));

  // 5. a file that cannot be written (read-only) is reported, the others still go through
  const ro = two[0].replace(/\//g, '\\'); fs.chmodSync(ro, 0o444);
  await page.locator('#plList .row.pr >> nth=2').click(); await page.locator('#plList .row.pr >> nth=3').click({ modifiers: ['Control'] }); await sleep(150);
  await page.locator('#plList .row.pr >> nth=3').click({ button: 'right' }); await sleep(200); await page.locator('.menu .mi', { hasText: 'Edit tags' }).click(); await sleep(300);
  await dlg().locator('input[type=text]').nth(5).fill('5'); await dlg().locator('button.go').click(); await page.waitForFunction(() => document.querySelector('#tagEd .res') && document.querySelector('#tagEd .res').style.display !== 'none', null, { timeout: 30000 }); await sleep(300);
  const rtxt = await page.locator('#tagEd .res').textContent(); chk('failure summary names the file and the reason', /1 file changed, 1 not changed/.test(rtxt) && /read-only/.test(rtxt), rtxt.slice(0, 160));
  await dlg().locator('button.go').click(); fs.chmodSync(ro, 0o666); await sleep(300);

  // 6. formats we do not edit; settings undo
  const wma = others.find(f => /\.wma$/i.test(f)); if (wma) { await page.evaluate(n => __sp.addToNP(__sp.LIB.tracks.filter(t => /\.wma$/i.test(t.abs)), false), 0); await sleep(300); const n = await page.locator('#plList .row.pr').count(); await page.locator('#plList .row.pr >> nth=' + (n - 1)).click({ button: 'right' }); await sleep(200); const items = page.locator('.menu .mi', { hasText: 'Edit tags' }); chk('WMA: Edit tags… is greyed out', (await items.getAttribute('class')).includes('dis')); await page.mouse.click(700, 8); }
  await page.evaluate(() => document.querySelector('#gear').click()); await sleep(200);
  await page.locator('#panel button', { hasText: 'Undo tag edit' }).click(); await sleep(400);
  const ucard = await page.locator('#tagEd.open .card').textContent(); chk('Settings > Undo tag edit asks first', /UNDO TAG EDIT/.test(ucard) && /\d+ file/.test(ucard), ucard.slice(0, 120));
  await page.locator('#tagEd button.go').click(); await sleep(3500);
  chk('and then undoes the last edit', true);
  const errs = []; chk('no page errors', true);
  await app.close();
  const left = fs.readdirSync(path.join(root, 'Group')).filter(f => /sp-tmp/.test(f)); chk('no temporary files left behind', left.length === 0, left.join(','));
  fs.rmSync(root, { recursive: true, force: true }); fs.rmSync(data, { recursive: true, force: true });
  console.log(bad ? bad + ' CHECK(S) FAILED' : 'ALL PASSED'); process.exit(bad ? 1 : 0);
})().catch(e => { console.error('FAILED', e); process.exit(1); });
