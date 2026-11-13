'use strict';
// "Show in File Browser" in the library (album, song, artist) and playlist context menus. The OS call is stubbed. Usage: node test/reveal.js <userDataDir with a warm library cache>
const { _electron: electron } = require('playwright-core');
const path = require('path');
const ROOT = path.join(__dirname, '..'), DATA = process.argv[2];
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const app = await electron.launch({ args: [ROOT, '--user-data=' + DATA] }), page = await app.firstWindow();
  await page.setViewportSize({ width: 1400, height: 850 }).catch(() => {});
  await page.waitForFunction(() => window.__sp && window.__sp.LIB.tracks.length > 100, null, { timeout: 60000 });
  await app.evaluate(({ shell }) => { global.__rev = []; shell.showItemInFolder = p => { global.__rev.push(p); }; });
  const menu = async sel => { await page.locator(sel).click({ button: 'right' }); await sleep(250); const items = await page.locator('.menu .mi').allTextContents(); return items; };
  const click = async () => { await page.locator('.menu .mi', { hasText: 'Show in File Browser' }).click(); await sleep(300); return app.evaluate(() => global.__rev.slice(-1)[0]); };
  // artist row: no item
  console.log('artist menu      ', JSON.stringify((await menu('#libList .row.artist >> nth=3')).filter(t => /File Browser/.test(t))), '(none expected)'); await page.mouse.click(700, 8); await sleep(200);
  // open an artist, right-click an album and a song
  await page.locator('#libList .row.artist >> nth=1').locator('.chev').click(); await sleep(300);
  console.log('album menu       ', JSON.stringify((await menu('#libList .row.album >> nth=0')).filter(t => /File Browser/.test(t)))); console.log('  revealed:', await click());
  await page.locator('#libList .row.album >> nth=0').locator('.chev').click(); await sleep(300);
  console.log('song menu        ', JSON.stringify((await menu('#libList .row.track >> nth=1')).filter(t => /File Browser/.test(t)))); console.log('  revealed:', await click());
  // playlist row
  await page.evaluate(() => __sp.addToNP(__sp.LIB.tracks.filter(t => /\.mp3$/i.test(t.abs)).slice(10, 13), false)); await sleep(400);
  console.log('Now Playing menu ', JSON.stringify((await menu('#plList .row.pr:not(.missing) >> nth=0')).filter(t => /File Browser/.test(t)))); console.log('  revealed:', await click());
  await app.close(); process.exit(0);
})().catch(e => { console.error('FAILED', e); process.exit(1); });
