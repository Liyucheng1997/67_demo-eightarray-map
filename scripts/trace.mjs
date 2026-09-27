import { Battle } from '../src/sim/battle.js';
const [f = 'bazhen', s = 'frontal', seed = 11] = process.argv.slice(2);
const b = new Battle({ formation: f, scenario: s, seed: Number(seed) });
let lastEv = 0;
const t0 = Date.now();
while (!b.over && b.t < 300) {
  b.step();
  if (Math.abs(b.t % 10) < 0.05 || Math.abs(b.t % 10 - 10) < 0.05) {
    const ours = b.units.filter((u) => u.side === 0 && !u.dead && !u.fled);
    const en = b.units.filter((u) => u.side === 1 && !u.dead && !u.fled);
    const eng = (arr) => arr.filter((u) => u.contacts.length).length;
    const avg = (arr, k) => (arr.reduce((a, u) => a + u[k], 0) / Math.max(1, arr.length)).toFixed(0);
    console.log(`t=${b.t.toFixed(0)} ours ${b.sideMen(0)|0} eng ${eng(ours)} rout ${ours.filter(u=>u.rout).length} mor ${avg(ours,'morale')} fat ${avg(ours,'fatigue')} | en ${b.sideMen(1)|0} eng ${eng(en)} rout ${en.filter(u=>u.rout).length} mor ${avg(en,'morale')} fat ${avg(en,'fatigue')}  anchor ${b.anchor.x.toFixed(0)},${b.anchor.z.toFixed(0)}`);
  }
  while (lastEv < b.events.length) { const e = b.events[lastEv++]; console.log(`   [${e.t.toFixed(1)}] ${e.text}`); }
}
console.log(b.result, 'ms', Date.now() - t0);
const by = {};
for (const u of b.units) {
  const k = u.side + ':' + u.group;
  by[k] ??= { n: 0, men: 0, max: 0, rout: 0, kills: 0 };
  by[k].n++; by[k].men += u.dead ? 0 : u.men; by[k].max += u.maxMen; by[k].rout += u.rout ? 1 : 0; by[k].kills += u.kills;
}
for (const [k, v] of Object.entries(by)) console.log(k.padEnd(8), `${(v.men|0)}/${v.max}`, 'rout', v.rout, 'kills', v.kills | 0);
