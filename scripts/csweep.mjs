import { Battle } from '../src/sim/battle.js';
import { C } from '../src/sim/data.js';
const [f, scen, key, vals] = process.argv.slice(2);
for (const v of vals.split(',').map(Number)) {
  C[key] = v;
  let line = `${key}=${v}`.padEnd(20);
  for (const s of scen.split(',')) {
    let ex = 0, rem = 0, w = 0;
    for (let k = 0; k < 3; k++) {
      const r = new Battle({ formation: f, scenario: s, seed: 11 + k * 7, log: false }).run();
      ex += r.exchange; rem += r.remain[0]; w += r.winner === 0 ? 1 : r.winner === 1 ? -1 : 0;
    }
    line += `${s.slice(0, 5)} ${w} x${(ex / 3).toFixed(2)} ${(rem / 3 * 100).toFixed(0)}% | `;
  }
  console.log(line);
}
