'use strict';
// Measures the silence (or overlap) at track seams. Usage: node test/gapless.js <userDataDir> [--lead=0.035]
// Builds three WAV files that are one continuous sine wave cut in pieces, plays them back to back, taps the
// audio graph and reports the longest run of exact silence inside the stream. Real gaps and overlaps show up directly.
const { _electron: electron } = require('playwright-core');
const path = require('path'), fs = require('fs'), os = require('os');
const ROOT = path.join(__dirname, '..');
const DATA = process.argv[2]; const leadArg = process.argv.find(a => a.startsWith('--lead='));
let leadArg0 = -1;                                       // -1 = use the app's default lead
const sleep = ms => new Promise(r => setTimeout(r, ms));
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-gapless-'));

function wav(file, startSample, n, sr = 44100) {
  const b = Buffer.alloc(44 + n * 2); b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(Math.sin(2 * Math.PI * 440 * (startSample + i) / sr) * 0.5 * 32767), 44 + i * 2);
  fs.writeFileSync(file, b);
}
const N = 44100 * 4;                                    // 4 s each
const files = [0, 1, 2].map(i => { const f = path.join(dir, 'tone' + i + '.wav'); wav(f, i * N, N); return f; });

async function run(gapless) {
  const app = await electron.launch({ args: [ROOT, '--user-data=' + path.join(dir, 'ud' + gapless + Math.random().toString(36).slice(2, 6))], env: { ...process.env, SP_MUSIC_ROOT: dir.replace(/\\/g, '/'), SP_PLAYLIST_DIR: dir.replace(/\\/g, '/') } });
  const page = await app.firstWindow();
  await page.waitForFunction(() => window.__sp && window.__sp.P, null, { timeout: 30000 });
  const res = await page.evaluate(async ({ files, gapless, lead }) => {
    const sp = __sp; sp.setS('vol', 0); sp.setS('gapless', gapless); if (lead >= 0) sp.G.lead = lead;
    const r = await sp.host.resolve(files); sp.addToNP(r.tracks, true);
    await new Promise(r => setTimeout(r, 500));
    const ac = sp.actx, tap = ac.createScriptProcessor(4096, 1, 1), z = ac.createGain(); z.gain.value = 0;
    const chunks = []; tap.onaudioprocess = e => chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
    sp.analyser.connect(tap); tap.connect(z); z.connect(ac.destination);
    await new Promise(r => setTimeout(r, 12800));                       // 3 tracks of 4 s
    sp.analyser.disconnect(tap);
    const total = chunks.reduce((a, c) => a + c.length, 0), x = new Float32Array(total); let o = 0; for (const c of chunks) { x.set(c, o); o += c.length; }
    let first = x.findIndex(v => Math.abs(v) > 0.01), last = x.length - 1; while (last > 0 && Math.abs(x[last]) < 0.01) last--;
    const runs = []; let s = -1, peak = 0;
    for (let i = first; i <= last; i++) { if (Math.abs(x[i]) < 0.0015) { if (s < 0) s = i; } else { if (s >= 0 && i - s >= 12) runs.push([s, i - s]); s = -1; } if (Math.abs(x[i]) > peak) peak = Math.abs(x[i]); }
    return { sr: ac.sampleRate, dur: (last - first) / ac.sampleRate, gapsMs: runs.map(([at, n]) => ({ atS: +((at - first) / ac.sampleRate).toFixed(3), ms: +(n / ac.sampleRate * 1000).toFixed(2) })), peak: +peak.toFixed(3),
      switched: sp.PL.all.get('Now Playing').tracks.length, now: sp.P.idx, lastSwitch: sp.G.last };
  }, { files: files.map(f => f.replace(/\\/g, '/')), gapless, lead: leadArg0 >= 0 ? leadArg0 : -1 });
  await app.close(); return res;
}
(async () => {
  const leads = (process.argv.find(a => a.startsWith('--leads=')) || '').slice(8).split(',').filter(Boolean);   // e.g. --leads=0.02,0.01,0
  if (leads.length) {
    for (const l of leads) for (let k = 0; k < 2; k++) { leadArg0 = +l; const r = await run(true); console.log('lead=' + l, JSON.stringify({ gapsMs: r.gapsMs, peak: r.peak, remPlanned: r.lastSwitch && +r.lastSwitch.remPlanned.toFixed(3) })); }
  } else for (const g of [false, true, true, true]) console.log('gapless=' + g, JSON.stringify(await run(g)));
  fs.rmSync(dir, { recursive: true, force: true }); process.exit(0);
})().catch(e => { console.error('FAILED', e); process.exit(1); });
