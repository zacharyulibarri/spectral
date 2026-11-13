'use strict';
// Real-library check: (1) the visualizer really receives audio, (2) seams between consecutive mp3 tracks of real albums.
// Usage: node test/realseam.js <userDataDir with a warm library cache> [albums=4]
const { _electron: electron } = require('playwright-core');
const path = require('path');
const ROOT = path.join(__dirname, '..'), DATA = process.argv[2], ALBUMS = +process.argv[3] || 4;
(async () => {
  const app = await electron.launch({ args: [ROOT, '--user-data=' + DATA] });
  const page = await app.firstWindow();
  await page.waitForFunction(() => window.__sp && window.__sp.LIB.tracks.length > 1000, null, { timeout: 60000 });
  await page.evaluate(() => __sp.setS('vol', 0));
  // (1) live analyser must see signal from a real mp3
  const live = await page.evaluate(async () => {
    const sp = __sp, t = sp.LIB.tracks.find(t => /\.mp3$/i.test(t.abs) && t.dur > 120); sp.addToNP([t], true);
    await new Promise(r => setTimeout(r, 3000)); const a = new Uint8Array(sp.analyser.frequencyBinCount); sp.analyser.getByteFrequencyData(a);
    return { track: t.abs, maxBin: Math.max(...a), nonZero: a.filter(v => v > 0).length, state: sp.actx.state };
  });
  console.log('LIVE ANALYSER', JSON.stringify(live));
  // (2) seams
  const albums = await page.evaluate(n => {
    const by = new Map(); for (const t of __sp.LIB.tracks) { if (!/\.mp3$/i.test(t.abs) || !t.no || t.dur < 40) continue; const k = t.abs.slice(0, t.abs.lastIndexOf('/')); (by.get(k) || by.set(k, []).get(k)).push(t); }
    const out = []; const keys = [...by.keys()].sort(() => Math.random() - 0.5);
    for (const k of keys) { const l = by.get(k).sort((a, b) => a.no - b.no); for (let i = 0; i + 2 < l.length; i++) if (l[i + 1].no === l[i].no + 1 && l[i + 2].no === l[i].no + 2) { out.push(l.slice(i, i + 3).map(t => t.abs)); break; } if (out.length >= n) break; }
    return out;
  }, ALBUMS);
  for (const gapless of [false, true]) for (const trio of albums) {
    const r = await page.evaluate(async ({ trio, gapless }) => {
      const sp = __sp; sp.setS('gapless', gapless);
      const res = await sp.host.resolve(trio), ts = res.tracks.map(t => sp.LIB.byAbs.get(t.abs.toLowerCase()) || t);
      const np = sp.PL.all.get('Now Playing'); np.tracks = []; sp.addToNP(ts, true);
      const w = ms => new Promise(r => setTimeout(r, ms));
      await w(1200); const ac = sp.actx, tap = ac.createScriptProcessor(1024, 1, 1), z = ac.createGain(); z.gain.value = 0;
      const chunks = [], marks = []; let lastIdx = sp.P.idx;
      tap.onaudioprocess = e => { if (sp.P.idx !== lastIdx) { lastIdx = sp.P.idx; marks.push(chunks.length); } chunks.push(new Float32Array(e.inputBuffer.getChannelData(0))); };
      sp.analyser.connect(tap); tap.connect(z); z.connect(ac.destination);
      const seekEnd = async () => { for (let i = 0; i < 50 && !(isFinite(sp.audioEl.duration) && sp.audioEl.duration > 10); i++) await w(100); sp.audioEl.currentTime = sp.audioEl.duration - 3; };
      await seekEnd(); await w(5200); const idx1 = sp.P.idx; await seekEnd(); await w(5200); const idx2 = sp.P.idx;
      sp.analyser.disconnect(tap);
      // look only at +-0.5 s around each real track change: the longest stretch of (near-)digital silence there is the audible gap
      const seams = marks.map(m => {
        const a = Math.max(0, m - 24), b = Math.min(chunks.length, m + 24); let best = 0, run = 0;
        for (let c = a; c < b; c++) { const d = chunks[c]; for (let i = 0; i < d.length; i++) { if (Math.abs(d[i]) < 0.0004) run++; else { if (run > best) best = run; run = 0; } } }
        if (run > best) best = run; return +(best / ac.sampleRate * 1000).toFixed(1);
      });
      return { idxs: [idx1, idx2], seamSilenceMs: seams };
    }, { trio, gapless });
    console.log('gapless=' + gapless, trio[0].split('/').slice(-3, -1).join('/'), JSON.stringify(r));
  }
  await app.close(); process.exit(0);
})().catch(e => { console.error('FAILED', e); process.exit(1); });
