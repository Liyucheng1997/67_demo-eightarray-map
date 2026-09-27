// 无界面批量推演：node scripts/batch.mjs [种子数] [--json]
// 带 --json 时把结果写入 src/sim/results.json，供「对比」页直接显示。
import { writeFileSync } from 'node:fs';
import { runHeadless } from '../src/sim/battle.js';
import { FORMATION_ORDER, FORMATIONS } from '../src/sim/formations.js';
import { SCENARIO_ORDER, SCENARIOS } from '../src/sim/scenarios.js';

const seeds = Number(process.argv.slice(2).find((arg) => !arg.startsWith('--')) || 3);
if (!Number.isInteger(seeds) || seeds < 1) throw new Error('种子数必须为正整数');
const json = process.argv.includes('--json');
const SEEDS = Array.from({ length: seeds }, (_, k) => 11 + k * 7);
const t0 = Date.now();
const pad = (s, n) => String(s).padEnd(n);
const cells = {};
console.log(pad('', 10) + SCENARIO_ORDER.map((s) => pad(SCENARIOS[s].name, 22)).join(''));
for (const f of FORMATION_ORDER) {
  let line = pad(FORMATIONS[f].name, 8);
  cells[f] = {};
  for (const s of SCENARIO_ORDER) {
    const c = { n: 0, w: 0, l: 0, d: 0, exchange: 0, remain: 0, t: 0 };
    for (const seed of SEEDS) {
      const r = runHeadless(f, s, seed);
      c.n += 1;
      if (r.winner === 0) c.w += 1;
      else if (r.winner === 1) c.l += 1;
      else c.d += 1;
      c.exchange += r.exchange;
      c.remain += r.remain[0];
      c.t += r.t;
    }
    c.exchange /= c.n;
    c.remain /= c.n;
    c.t /= c.n;
    cells[f][s] = c;
    line += pad(`${c.w}胜${c.l}负 x${c.exchange.toFixed(2)} ${(c.remain * 100).toFixed(0)}% ${c.t.toFixed(0)}s`, 24);
  }
  console.log(line);
}
console.log('ms', Date.now() - t0);
if (json) {
  const round = (v) => Math.round(v * 1000) / 1000;
  for (const f of Object.values(cells)) for (const c of Object.values(f)) for (const k of ['exchange', 'remain', 't']) c[k] = round(c[k]);
  writeFileSync(new URL('../src/sim/results.json', import.meta.url), JSON.stringify({ seeds, cells }, null, 1));
  console.log('written src/sim/results.json');
}
