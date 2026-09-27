import test from 'node:test';
import assert from 'node:assert/strict';
import { Battle } from '../src/sim/battle.js';
import { FORMATION_ORDER } from '../src/sim/formations.js';
import { SCENARIO_ORDER } from '../src/sim/scenarios.js';
import { readFileSync } from 'node:fs';

test('内置对比数据包含完整的 36 格、108 场结果', () => {
  const results = JSON.parse(readFileSync(new URL('../src/sim/results.json', import.meta.url), 'utf8'));
  assert.equal(results.seeds, 3);
  let total = 0;
  for (const f of FORMATION_ORDER) for (const s of SCENARIO_ORDER) {
    const c = results.cells[f]?.[s];
    assert.ok(c, `${f}/${s} 缺少结果`);
    assert.equal(c.n, results.seeds);
    assert.equal(c.w + c.l + c.d, c.n);
    for (const key of ['exchange', 'remain', 't']) assert.ok(Number.isFinite(c[key]));
    total += c.n;
  }
  assert.equal(total, 108);
});

test('六种阵型使用相同的兵力与兵种', () => {
  let expected;
  for (const formation of FORMATION_ORDER) {
    const b = new Battle({ formation });
    const counts = {};
    for (const u of b.units.filter((u) => u.side === 0)) counts[u.type] = (counts[u.type] || 0) + 1;
    expected ||= counts;
    assert.deepEqual(counts, expected, formation);
    assert.equal(b.initialMen[0], 8420);
  }
});

test('36 种组合推进后兵力守恒，位置、士气与疲劳数值有效', () => {
  for (const formation of FORMATION_ORDER) for (const scenario of SCENARIO_ORDER) {
    const b = new Battle({ formation, scenario, seed: 11, log: false });
    for (let i = 0; i < 600 && !b.over; i++) b.step();
    for (const u of b.units) {
      for (const key of ['x', 'z', 'men', 'morale', 'fatigue']) assert.ok(Number.isFinite(u[key]), `${formation}/${scenario}/${key}`);
      assert.ok(u.men >= 0 && u.men <= u.maxMen);
    }
    for (const side of [0, 1]) {
      // 逃出战场的兵仍属于幸存者。
      const survivors = b.units.filter((u) => u.side === side).reduce((n, u) => n + u.men, 0);
      assert.ok(Math.abs(survivors + b.stats.dead[side] - b.initialMen[side]) < 0.001);
    }
  }
});

test('同一种子产生可复现的完整战果', () => {
  const options = { formation: 'bazhen', scenario: 'cavalry', seed: 11, log: false };
  const first = new Battle(options).run();
  const second = new Battle(options).run();
  assert.deepEqual(first, second);
  assert.ok([0, 1, null].includes(first.winner));
  assert.ok(Number.isFinite(first.exchange));
});

test('战果统计是独立快照，战后撤退不改写战果', () => {
  const b = new Battle();
  b.finish(0, '测试');
  const saved = structuredClone(b.result);
  b.stats.dead[0] += 1;
  b.stats.routs[1] += 1;
  assert.deepEqual(b.result, saved);
});
