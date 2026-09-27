import { Battle } from '../src/sim/battle.js';
import { FORMATIONS } from '../src/sim/formations.js';
const f = process.argv[2] || 'bazhen';
const scen = (process.argv[3] || 'frontal,encircle,rear,flank,cavalry').split(',');
const patches = JSON.parse(process.argv[4] || '[{}]');
const base = { ...FORMATIONS[f].doctrine };
for (const patch of patches) {
  FORMATIONS[f].doctrine = { ...base, ...patch };
  let line = JSON.stringify(patch).padEnd(28);
  for (const s of scen) {
    let ex = 0, rem = 0, w = 0;
    for (let k = 0; k < 3; k++) {
      const r = new Battle({ formation: f, scenario: s, seed: 11 + k * 7, log: false }).run();
      ex += r.exchange; rem += r.remain[0]; w += r.winner === 0 ? 1 : r.winner === 1 ? -1 : 0;
    }
    line += `${s.slice(0, 5)} ${w} x${(ex / 3).toFixed(2)} ${(rem / 3 * 100).toFixed(0)}% | `;
  }
  console.log(line);
}
