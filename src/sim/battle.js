// 八阵推演引擎：以「队」为单位的战术模拟。
// 每个队有兵力、士气、疲劳、朝向；接战时按正面/侧面/背面计算杀伤与士气冲击，
// 士气崩溃即溃逃并波及近邻。阵型之间只改变站位与号令，不改变兵种数值。

import { UNIT_TYPES, C, wrap, angTo } from './data.js';
import { FORMATIONS } from './formations.js';
import { SCENARIOS } from './scenarios.js';
import { mulberry32 } from './rng.js';

const DEFAULT_DOCTRINE = {
  allRound: false,
  rotate: false,
  qiSally: false,
  wingEnvelop: false,
  counterCharge: false,
  holdLeash: 7,
  reserveLeash: 26,
  sallyRange: 0,
  sallyCap: 0,
  wingRange: 0,
  wingCap: 0,
  cavRange: 170,
  advanceSpeed: 1.15
};

const ARC_NAME = ['正面', '侧翼', '背后'];
const DIR_NAME = ['北', '东北', '东', '东南', '南', '西南', '西', '西北'];

export class Battle {
  constructor({ formation = 'bazhen', scenario = 'frontal', seed = 7, log = true } = {}) {
    this.formationId = formation;
    this.scenarioId = scenario;
    this.formation = FORMATIONS[formation];
    this.scenario = SCENARIOS[scenario];
    this.doctrine = { ...DEFAULT_DOCTRINE, ...this.formation.doctrine };
    this.rng = mulberry32(seed);
    this.log = log;
    this.t = 0;
    this.units = [];
    this.events = [];
    this.fx = [];
    this.history = [];
    this.nextHistory = 0;
    this.anchor = { x: 0, z: 0, heading: Math.PI, moving: false };
    this.spread = 1;
    this.anchorHalted = false;
    this.enemyGroups = [];
    this.over = false;
    this.endAt = Infinity;
    this.result = null;
    this.broken = [false, false];
    this.general = null;
    this.generalLost = false;
    this.throttle = new Map();
    this.firstContact = false;
    this.rearAlarm = false;
    this.stats = {
      dead: [0, 0],
      rotations: 0,
      sallies: 0,
      traps: 0,
      routs: [0, 0],
      braced: 0,
      charges: 0
    };
    this.buildOurs();
    this.buildEnemy();
    this.initialMen = [this.sideMen(0, true), this.sideMen(1, true)];
    this.recordHistory();
  }

  // ———————————————————— 布阵 ————————————————————

  toWorld(lx, lf, a = this.anchor) {
    const s = Math.sin(a.heading);
    const c = Math.cos(a.heading);
    return { x: a.x - c * lx + s * lf, z: a.z + s * lx + c * lf };
  }

  addUnit(def) {
    const T = UNIT_TYPES[def.type];
    const u = {
      id: this.units.length,
      side: def.side,
      type: def.type,
      T,
      group: def.group,
      role: def.role,
      banner: !!def.banner,
      x: def.x,
      z: def.z,
      px: def.x,
      pz: def.z,
      heading: def.heading,
      face: def.heading,
      men: T.men,
      maxMen: T.men,
      morale: 100,
      fatigue: 0,
      rout: false,
      dead: false,
      fled: false,
      slot: def.slot || null,
      eg: def.eg ?? null,
      off: def.off ?? null,
      mode: 'slot',
      target: null,
      contacts: [],
      contactIds: new Set(),
      goal: null,
      wantSpeed: 0,
      speed: 0,
      reload: T.reload ? this.rng() * T.reload : 0,
      incoming: 0,
      moraleHit: 0,
      attackerGroups: null,
      attackerArcs: 0,
      crowd: [0, 0, 0],
      thinkEnemy: null,
      threatNear: false,
      withdrawUntil: 0,
      relieveId: -1,
      decideAt: this.rng(),
      kills: 0,
      seed: Math.floor(this.rng() * 1e9)
    };
    this.units.push(u);
    return u;
  }

  buildOurs() {
    const slots = this.formation.build();
    for (const s of slots) {
      const p = this.toWorld(s.lx, s.lf);
      const u = this.addUnit({
        side: 0,
        type: s.type,
        group: s.group,
        role: s.role,
        banner: s.banner,
        x: p.x,
        z: p.z,
        heading: this.anchor.heading + s.rh,
        slot: { lx: s.lx, lf: s.lf, rh: s.rh, cx: s.cx, cf: s.cf }
      });
      if (s.type === 'general') this.general = u;
    }
  }

  buildEnemy() {
    this.scenario.enemy.forEach((g, gi) => {
      const T = UNIT_TYPES[g.type];
      const group = {
        index: gi,
        name: g.name,
        type: g.type,
        x: g.x,
        z: g.z,
        heading: g.heading,
        delay: g.delay || 0,
        path: g.path.map(([x, z]) => ({ x, z })),
        pathIndex: 0,
        target: g.target || 'nearest',
        state: g.target === 'hold' ? 'hold' : 'wait',
        speed: T.walk * 1.35,
        units: []
      };
      const rows = Math.ceil(g.count / g.cols);
      for (let i = 0; i < g.count; i += 1) {
        const col = i % g.cols;
        const row = Math.floor(i / g.cols);
        const lx = (col - (g.cols - 1) / 2) * g.gap;
        const lf = -(row - (rows - 1) / 2) * (g.gap + (T.cav ? 2 : 0));
        const p = this.toWorld(lx, lf, group);
        const u = this.addUnit({
          side: 1,
          type: g.type,
          group: `e${gi}`,
          role: g.type === 'hcav' ? 'ecav' : g.type === 'bow' ? 'ebow' : 'einf',
          banner: col === Math.floor(g.cols / 2) && row === 0,
          x: p.x,
          z: p.z,
          heading: g.heading,
          eg: group,
          off: { lx, lf }
        });
        group.units.push(u);
      }
      this.enemyGroups.push(group);
    });
  }

  slotWorld(u) {
    const s = u.slot;
    if (s.cx === undefined || this.spread === 1) return this.toWorld(s.lx, s.lf);
    // 阵的中心随聚散系数收放，阵内各队相对位置不变
    return this.toWorld(s.cx * this.spread + (s.lx - s.cx), s.cf * this.spread + (s.lf - s.cf));
  }

  sideMen(side, includeRouted = false) {
    let m = 0;
    for (const u of this.units) {
      if (u.side !== side || u.dead || u.fled) continue;
      if (!includeRouted && u.rout) continue;
      m += u.men;
    }
    return m;
  }

  // ———————————————————— 空间索引 ————————————————————

  buildGrid() {
    if (!this.cells) {
      this.cells = Array.from({ length: GRID_N * GRID_N }, () => []);
      this.usedCells = [];
    }
    for (const i of this.usedCells) this.cells[i].length = 0;
    this.usedCells.length = 0;
    for (const u of this.units) {
      if (u.dead || u.fled) continue;
      const i = cellIndex(Math.floor(u.x / CELL), Math.floor(u.z / CELL));
      const cell = this.cells[i];
      if (!cell.length) this.usedCells.push(i);
      cell.push(u);
    }
  }

  forNear(x, z, r, cb) {
    const x0 = Math.floor((x - r) / CELL);
    const x1 = Math.floor((x + r) / CELL);
    const z0 = Math.floor((z - r) / CELL);
    const z1 = Math.floor((z + r) / CELL);
    for (let ix = x0; ix <= x1; ix += 1) {
      for (let iz = z0; iz <= z1; iz += 1) {
        const cell = this.cells[cellIndex(ix, iz)];
        for (let k = 0; k < cell.length; k += 1) cb(cell[k]);
      }
    }
  }

  nearestGlobal(u, side) {
    let best = null;
    let bd = Infinity;
    for (const v of this.units) {
      if (v.side !== side || v.dead || v.fled || v.rout) continue;
      const d = (v.x - u.x) ** 2 + (v.z - u.z) ** 2;
      if (d < bd) {
        bd = d;
        best = v;
      }
    }
    return best;
  }

  nearest(x, z, r, pred) {
    let best = null;
    let bd = r * r;
    this.forNear(x, z, r, (v) => {
      if (!pred(v)) return;
      const d = (v.x - x) ** 2 + (v.z - z) ** 2;
      if (d < bd) {
        bd = d;
        best = v;
      }
    });
    return best;
  }

  // ———————————————————— 主循环 ————————————————————

  start() {
    this.started = true;
  }

  step(dt = C.dt) {
    if (this.over) return;
    this.t += dt;
    this.stepIndex = (this.stepIndex || 0) + 1;
    for (const u of this.units) {
      u.px = u.x;
      u.pz = u.z;
      u.think = (u.id + this.stepIndex) % 4 === 0;
    }
    this.buildGrid();
    this.findContacts();
    this.updateAnchor(dt);
    this.updateEnemyGroups(dt);
    for (const u of this.units) {
      if (u.dead || u.fled) continue;
      if (u.rout) this.fleeAI(u);
      else if (u.side === 0) this.ourAI(u, dt);
      else this.enemyAI(u, dt);
    }
    if (this.doctrine.rotate) this.rotationAI();
    if (this.doctrine.groupRotate) this.groupRotationAI();
    if (this.doctrine.gather) this.gatherAI(dt);
    this.combat(dt);
    this.applyDamage(dt);
    this.move(dt);
    this.checkEnd();
    if (this.t >= this.nextHistory) this.recordHistory();
  }

  run(tMax = C.tMax) {
    while (!this.over && this.t < tMax) this.step();
    if (!this.over) this.finish(null, '相持不下');
    return this.result;
  }

  recordHistory() {
    this.nextHistory = this.t + 1;
    const m = [0, 0];
    const mor = [0, 0];
    const n = [0, 0];
    for (const u of this.units) {
      if (u.dead || u.fled) continue;
      m[u.side] += u.men;
      mor[u.side] += u.morale * u.men;
      n[u.side] += u.men;
    }
    this.history.push({
      t: Math.round(this.t),
      men: m,
      morale: [n[0] ? mor[0] / n[0] : 0, n[1] ? mor[1] / n[1] : 0]
    });
  }

  // ———————————————————— 接触 ————————————————————

  findContacts() {
    for (const u of this.units) {
      if (u.dead || u.fled) continue;
      const prev = u.contactIds;
      const next = new Set();
      u.contacts = [];
      u.newContacts = [];
      this.forNear(u.x, u.z, 14, (v) => {
        if (v.side === u.side || v.dead || v.fled) return;
        const d = Math.hypot(v.x - u.x, v.z - u.z);
        if (d < u.T.radius + v.T.radius + C.contactPad) {
          u.contacts.push(v);
          next.add(v.id);
          if (!prev.has(v.id)) u.newContacts.push(v);
        }
      });
      u.contactIds = next;
    }
  }

  engagedWithOthers(u) {
    return u.contacts.some((v) => !v.rout);
  }

  // ———————————————————— 我军号令 ————————————————————

  updateAnchor(dt) {
    const d = this.doctrine;
    const offense = this.scenario.offense;
    if (this.broken[0]) {
      this.anchor.moving = false;
      return;
    }
    if (!offense && !d.counterCharge) return;
    if (this.anchorHalted) {
      this.anchor.moving = false;
      if (!offense) return;
      // 进攻时，前面的敌人打垮后，稍作整顿再向残敌推进
      const busy = this.units.some((u) => u.side === 0 && !u.dead && !u.rout && u.contacts.length);
      if (busy) this.lastBusy = this.t;
      if (this.t - (this.lastBusy || 0) < 8) return;
      this.anchorHalted = false;
      this.contactAt = null;
      this.event('readvance', '当面之敌已溃，全军整队向残敌推进', this.anchor.x, this.anchor.z, 0, 20);
    }
    let fighting = 0;
    let total = 0;
    for (const u of this.units) {
      if (u.side !== 0 || u.dead || u.rout || u.type === 'cav') continue;
      total += 1;
      if (u.contacts.length) fighting += 1;
    }
    if (fighting && !this.contactAt) {
      this.contactAt = { x: this.anchor.x, z: this.anchor.z };
      this.event('halt', offense ? '前锋接敌，后队继续压上' : '锋矢迎头撞上敌阵，全军压上', this.anchor.x, this.anchor.z, 0);
    }
    // 接敌后仍缓缓压上，直到推进约 45 米或多数队伍已接战
    if (this.contactAt) {
      const pushed = Math.hypot(this.anchor.x - this.contactAt.x, this.anchor.z - this.contactAt.z);
      if (pushed > 45 || fighting > total * 0.45) {
        this.anchorHalted = true;
        this.anchor.moving = false;
        return;
      }
    }
    // 目标：最近的敌军集团重心（进攻时直接取最近的敌队）
    let best = null;
    let bd = Infinity;
    if (offense && this.stepIndex > 1) {
      const e = this.nearestGlobal(this.anchor, 1);
      if (e) {
        best = { x: e.x, z: e.z };
        bd = Math.hypot(e.x - this.anchor.x, e.z - this.anchor.z);
      }
    }
    for (const g of offense && best ? [] : this.enemyGroups) {
      const c = groupCentroid(g);
      if (!c) continue;
      const dd = Math.hypot(c.x - this.anchor.x, c.z - this.anchor.z);
      if (dd < bd) {
        bd = dd;
        best = c;
      }
    }
    if (!best) return;
    if (!offense && bd > 150) return;
    const h = angTo(this.anchor.x, this.anchor.z, best.x, best.z);
    // 锋矢只能向锋尖所指的方向突击，敌从侧后来则原地迎战
    if (!offense && Math.abs(wrap(h - this.anchor.heading)) > 1.0) return;
    const v = (offense ? d.advanceSpeed : 1.35) * (this.contactAt ? 0.4 : 1);
    this.anchor.x += Math.sin(h) * v * dt;
    this.anchor.z += Math.cos(h) * v * dt;
    this.anchor.moving = true;
  }

  ourAI(u, dt) {
    if (u.type === 'cav') return this.cavAI(u, dt);
    const d = this.doctrine;
    const slot = this.slotWorld(u);
    const slotHeading = this.anchor.heading + u.slot.rh;
    u.goal = slot;
    u.wantSpeed = u.T.walk;
    u.face = slotHeading;

    if (u.mode === 'withdraw') {
      if (this.t < u.withdrawUntil && Math.hypot(slot.x - u.x, slot.z - u.z) > 2) {
        // 有序后撤：面朝敌人边打边退，脱离接触后再快步归位
        if (u.contacts.length) {
          const t = this.pickContact(u);
          u.face = angTo(u.x, u.z, t.x, t.z);
          u.wantSpeed = u.T.walk;
        } else {
          u.wantSpeed = u.T.run;
        }
        return;
      }
      u.mode = 'slot';
    }

    const fighting = u.contacts.length > 0;
    if (fighting) {
      const t = this.pickContact(u);
      u.goal = null;
      u.face = angTo(u.x, u.z, t.x, t.z);
      if (u.mode === 'relieve') u.mode = 'slot';
      return;
    }

    if (u.type === 'xbow' || u.type === 'general') {
      const e = this.nearest(u.x, u.z, u.T.range || 40, (v) => v.side === 1 && !v.rout && !v.dead);
      if (e) u.face = angTo(u.x, u.z, e.x, e.z);
      if (u.type === 'general') {
        // 帅旗附近有敌，亲兵也会就近迎击
        const near = this.nearest(slot.x, slot.z, 14, (v) => v.side === 1 && !v.rout);
        if (near) {
          u.goal = { x: near.x, z: near.z };
          u.wantSpeed = u.T.run;
        }
      }
      return;
    }

    if (u.mode === 'relieve') {
      const tired = this.units[u.relieveId];
      if (tired && !tired.dead && !tired.rout && tired.contacts.length && tired.mode !== 'withdraw') {
        u.goal = { x: tired.x, z: tired.z };
        u.wantSpeed = u.T.run;
        u.face = angTo(u.x, u.z, tired.x, tired.z);
        if (Math.hypot(tired.x - u.x, tired.z - u.z) < u.T.radius + tired.T.radius + 2.5) this.swapSlots(u, tired);
        return;
      }
      u.mode = 'slot';
    }

    // 就近迎敌（受牵制半径约束）
    let leash = d.holdLeash;
    if (u.role === 'reserve') leash = d.reserveLeash;
    if (this.scenario.offense) leash += this.anchorHalted ? 30 : 8;
    if (u.think || u.mode === 'engage') {
      u.leashEnemy = this.nearest(slot.x, slot.z, leash + 12, (v) => v.side === 1 && !v.dead && !v.fled && !v.rout);
    }
    const enemy = u.leashEnemy;
    if (enemy && !enemy.dead && !enemy.rout && Math.hypot(enemy.x - slot.x, enemy.z - slot.z) < leash + u.T.radius + enemy.T.radius) {
      u.goal = { x: enemy.x, z: enemy.z };
      u.wantSpeed = u.T.run;
      u.mode = 'engage';
      return;
    }

    // 奇兵出击 / 两翼合围
    const canSally = (d.qiSally && u.role === 'qi') || (d.wingEnvelop && u.role === 'wing');
    if (canSally) {
      const range = u.role === 'qi' ? d.sallyRange : d.wingRange;
      const cap = u.role === 'qi' ? d.sallyCap : d.wingCap;
      if (u.mode === 'sally') {
        const t = u.target;
        const spent = u.morale < 65 || u.men < u.maxMen * 0.65;
        if (!spent && t && !t.dead && !t.rout && !t.fled && Math.hypot(t.x - slot.x, t.z - slot.z) < range + 20) {
          this.approachFlank(u, t);
          return;
        }
        u.mode = 'return';
        u.target = null;
      } else if (this.t >= u.decideAt) {
        u.decideAt = this.t + 0.8;
        const active = this.units.filter((v) => v.side === 0 && v.group === u.group && v.mode === 'sally').length;
        if (active < cap) {
          const t = this.nearest(slot.x, slot.z, range, (v) => {
            if (v.side !== 1 || v.rout || v.dead) return false;
            const archer = v.T.range && u.role === 'qi';
            if (!archer && !v.contacts.some((w) => w.side === 0 && !w.rout && w.group !== u.group)) return false;
            // 只打孤立或已被缠住之敌，不往敌军人堆里钻
            let crowd = 0;
            this.forNear(v.x, v.z, 16, (w) => {
              if (w.side === 1 && w !== v && !w.rout && !w.dead) crowd += 1;
            });
            if (crowd > 2) return false;
            if (u.role === 'wing' && !v.contacts.some((w) => w.group === 'C')) return false;
            return true;
          });
          if (t) {
            u.mode = 'sally';
            u.target = t;
            this.stats.sallies += 1;
            if (u.role === 'qi') {
              const g = this.formation.groups[u.group];
              const opp = t.contacts.find((w) => w.side === 0);
              const og = opp ? this.formation.groups[opp.group] : null;
              this.event(`sally-${u.group}`, `${g.name}奇兵出击，侧击正与${og ? og.name : '友阵'}交战之敌`, t.x, t.z, 0, 8);
            } else {
              this.event(`wing-${u.group}`, `${u.group === 'L' ? '左' : '右'}翼合拢，包抄冲入中军之敌`, t.x, t.z, 0, 10);
            }
            this.approachFlank(u, t);
            return;
          }
        }
      }
    }

    const dSlot = Math.hypot(slot.x - u.x, slot.z - u.z);
    if (dSlot > 12) u.wantSpeed = u.T.run;
    if (dSlot < 1.5 && u.mode === 'return') u.mode = 'slot';
    if (dSlot > 3) {
      u.face = angTo(u.x, u.z, slot.x, slot.z);
    } else {
      // 触处为首：全向戒备的阵型会把每一队转向最近的威胁
      if (u.think) {
        const range = d.allRound ? 70 : 22;
        u.thinkEnemy = this.nearest(u.x, u.z, range, (v) => v.side === 1 && !v.rout && !v.dead);
      }
      const e = u.thinkEnemy;
      if (e && !e.dead && !e.rout) u.face = angTo(u.x, u.z, e.x, e.z);
      else if (this.anchor.moving) u.face = this.anchor.heading;
    }
    if (this.anchor.moving) u.wantSpeed = Math.max(u.wantSpeed, 1.5);
  }

  approachFlank(u, t) {
    // 绕到目标侧后再冲入
    const fx = Math.sin(t.heading);
    const fz = Math.cos(t.heading);
    const rel = (u.x - t.x) * fx + (u.z - t.z) * fz;
    const dd = Math.hypot(t.x - u.x, t.z - u.z);
    if (rel > 0 && dd > 16) {
      const rx = -fz;
      const rz = fx;
      const side = (u.x - t.x) * rx + (u.z - t.z) * rz >= 0 ? 1 : -1;
      u.goal = { x: t.x + rx * side * 16 - fx * 6, z: t.z + rz * side * 16 - fz * 6 };
    } else {
      u.goal = { x: t.x, z: t.z };
    }
    u.wantSpeed = u.T.run;
    u.face = angTo(u.x, u.z, u.goal.x, u.goal.z);
  }

  cavAI(u) {
    const d = this.doctrine;
    const home = this.slotWorld(u);
    u.wantSpeed = u.T.walk;
    if (u.mode === 'withdraw') {
      if (this.t < u.withdrawUntil) {
        u.goal = home;
        u.wantSpeed = u.T.run * 0.8;
        u.face = angTo(u.x, u.z, home.x, home.z);
        return;
      }
      u.mode = 'return';
    }
    u.meleeTime = u.contacts.length ? (u.meleeTime || 0) + C.dt : 0;
    if (u.contacts.length && (u.meleeTime > 4 || u.morale < 65)) {
      // 一击即走：骑兵不恋战，冲杀之后撤回再寻战机
      u.mode = 'withdraw';
      u.withdrawUntil = this.t + 7;
      u.target = null;
      u.goal = home;
      u.wantSpeed = u.T.run * 0.8;
      return;
    }
    if (u.contacts.length) {
      const t = this.pickContact(u);
      u.goal = null;
      u.face = angTo(u.x, u.z, t.x, t.z);
      return;
    }
    if (u.mode === 'strike') {
      const t = u.target;
      if (t && !t.dead && !t.fled && Math.hypot(t.x - this.anchor.x, t.z - this.anchor.z) < d.cavRange + 60) {
        if (t.rout) {
          u.goal = { x: t.x, z: t.z };
          u.wantSpeed = u.T.run;
          u.face = angTo(u.x, u.z, t.x, t.z);
        } else this.approachFlank(u, t);
        return;
      }
      u.mode = 'return';
      u.target = null;
    }
    if (this.t >= u.decideAt) {
      u.decideAt = this.t + 1;
      let best = null;
      let bs = Infinity;
      this.forNear(this.anchor.x, this.anchor.z, d.cavRange, (v) => {
        if (v.side !== 1 || v.dead || v.fled) return;
        const engaged = v.contacts.some((w) => !w.rout && w.side === 0);
        const dd = Math.hypot(v.x - u.x, v.z - u.z);
        // 追击：溃逃之敌也在骑兵目标之列，但优先级低于正在接战的敌队
        if (v.rout && (dd > 70 || this.t < 20)) return;
        const archer = !!v.T.range;
        if (!v.rout && !engaged && !archer && dd > 45) return;
        const load = this.units.reduce((n, w) => n + (w.side === 0 && w.mode === 'strike' && w.target === v ? 1 : 0), 0);
        const score = dd + load * 60 + (v.T.cav ? 25 : 0) + (v.rout ? 40 : 0) - (v.T.range && !engaged ? 30 : 0);
        if (score < bs) {
          bs = score;
          best = v;
        }
      });
      if (best) {
        u.mode = 'strike';
        u.target = best;
        this.event('cav', best.rout ? '游骑追击溃敌' : `游骑出动，驰击${best.eg ? best.eg.name : '敌军'}侧后`, best.x, best.z, 0, 12);
        this.approachFlank(u, best);
        return;
      }
    }
    u.goal = home;
    const dh = Math.hypot(home.x - u.x, home.z - u.z);
    u.wantSpeed = dh > 20 ? u.T.run * 0.7 : u.T.walk;
    u.face = dh > 3 ? angTo(u.x, u.z, home.x, home.z) : this.anchor.heading + u.slot.rh;
  }

  rotationAI() {
    // 阵间容阵、以前为后：疲惫之队退入阵内，生力之队顶上
    if (Math.floor(this.t * 2) === Math.floor((this.t - C.dt) * 2)) return;
    const byGroup = new Map();
    for (const u of this.units) {
      if (u.side !== 0 || u.dead || u.rout || u.type !== 'spear') continue;
      if (!byGroup.has(u.group)) byGroup.set(u.group, []);
      byGroup.get(u.group).push(u);
    }
    for (const [gid, list] of byGroup) {
      if (gid === 'zhong') continue;
      const tired = list.filter(
        (u) => u.contacts.length && u.mode !== 'withdraw' && (u.fatigue > 60 || u.morale < 50 || u.men < u.maxMen * 0.5)
      );
      if (!tired.length) continue;
      const fresh = list.filter(
        (u) =>
          !u.contacts.length &&
          (u.mode === 'slot' || u.mode === 'return') &&
          u.fatigue < 30 &&
          u.morale > 70 &&
          u.men > u.maxMen * 0.6 &&
          !list.some((w) => w.mode === 'relieve' && w.relieveId === u.id)
      );
      const busy = new Set(list.filter((u) => u.mode === 'relieve').map((u) => u.relieveId));
      for (const t of tired) {
        if (busy.has(t.id)) continue;
        let bi = -1;
        let bd = Infinity;
        fresh.forEach((f, i) => {
          const dd = Math.hypot(f.x - t.x, f.z - t.z);
          if (dd < bd && dd < 30) {
            bd = dd;
            bi = i;
          }
        });
        if (bi < 0) continue;
        const f = fresh.splice(bi, 1)[0];
        f.mode = 'relieve';
        f.relieveId = t.id;
        busy.add(t.id);
      }
    }
  }

  // 阵间容阵：整阵轮换。后方完好的一阵穿过通道前出，接替已经打疲的一阵
  groupRotationAI() {
    if (this.stepIndex % 10 !== 0) return;
    if (this.gathered) return;
    if (!this.cellOf) {
      this.cellOf = {};
      this.swaps = [];
      this.rotCooldown = {};
      for (const [gid, g] of Object.entries(this.formation.groups)) {
        if (g.kind === '正' || g.kind === '奇') this.cellOf[gid] = [...g.cell];
      }
    }
    const info = {};
    for (const gid of Object.keys(this.cellOf)) info[gid] = { units: [], men: 0, max: 0, mor: 0, fat: 0, eng: 0 };
    for (const u of this.units) {
      if (u.side !== 0 || !info[u.group]) continue;
      const g = info[u.group];
      g.max += u.maxMen;
      if (u.dead || u.fled) continue;
      g.units.push(u);
      if (u.rout) continue;
      g.men += u.men;
      g.mor += u.morale * u.men;
      g.fat += u.fatigue * u.men;
      if (u.contacts.length) g.eng += 1;
    }
    for (const g of Object.values(info)) {
      g.mor = g.men ? g.mor / g.men : 0;
      g.fat = g.men ? g.fat / g.men : 0;
      g.str = g.max ? g.men / g.max : 0;
    }
    const busy = new Set();
    // 进行中的轮换：新阵到位后，旧阵才撤出
    this.swaps = this.swaps.filter((sw) => {
      busy.add(sw.worn);
      busy.add(sw.fresh);
      const f = info[sw.fresh];
      const c = this.cellCenter(sw.target);
      let x = 0;
      let z = 0;
      let n = 0;
      for (const u of f.units) {
        if (u.rout) continue;
        x += u.x;
        z += u.z;
        n += 1;
      }
      const arrived = n && Math.hypot(x / n - c.x, z / n - c.z) < 16;
      if (arrived || this.t - sw.t0 > 45) {
        const back = this.cellOf[sw.fresh];
        this.shiftGroup(sw.worn, back, 'withdraw');
        for (const u of f.units) u.passing = false;
        this.cellOf[sw.worn] = back;
        this.cellOf[sw.fresh] = sw.target;
        this.rotCooldown[sw.worn] = this.t + 30;
        this.rotCooldown[sw.fresh] = this.t + 30;
        return false;
      }
      return true;
    });
    for (const [gid, g] of Object.entries(info)) {
      if (busy.has(gid) || (this.rotCooldown[gid] || 0) > this.t) continue;
      const worn = g.eng >= 2 && (g.str < 0.62 || g.mor < 58 || g.fat > 45);
      if (!worn) continue;
      let best = null;
      let bd = Infinity;
      for (const [fid, f] of Object.entries(info)) {
        if (fid === gid || busy.has(fid) || (this.rotCooldown[fid] || 0) > this.t) continue;
        if (f.eng > 0 || f.str < 0.8 || f.mor < 75 || f.fat > 25) continue;
        const fc = this.cellCenter(this.cellOf[fid]);
        const threat = this.nearest(fc.x, fc.z, 45, (v) => v.side === 1 && !v.rout && !v.dead);
        if (threat) continue;
        const a = this.cellOf[gid];
        const b = this.cellOf[fid];
        const dd = Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1])) + 0.1 * (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]));
        if (dd < bd) {
          bd = dd;
          best = fid;
        }
      }
      if (!best) continue;
      const target = this.cellOf[gid];
      this.shiftGroup(best, target, 'return');
      for (const u of info[best].units) u.passing = true;
      this.swaps.push({ worn: gid, fresh: best, target, t0: this.t });
      busy.add(gid);
      busy.add(best);
      this.stats.groupRotations = (this.stats.groupRotations || 0) + 1;
      const c = this.cellCenter(target);
      const G = this.formation.groups;
      this.event(`grot-${gid}`, `阵间容阵：${G[best].name}穿过通道前出，接替久战的${G[gid].name}`, c.x, c.z, 0, 20);
    }
  }

  cellCenter(cell) {
    return this.toWorld(cell[0] * 48 * this.spread, cell[1] * 48 * this.spread);
  }

  // 散而成八，复而为一：敌从三面以上同时接战时，八阵收拢通道合为一个大方阵
  gatherAI(dt) {
    if (this.stepIndex % 5 === 0) {
      // 斥候所见：140 米内出现敌军的方向数；已接战的敌队数
      let q = 0;
      let engaged = 0;
      for (const u of this.units) {
        if (u.side !== 1 || u.dead || u.rout) continue;
        if (u.contacts.length) engaged += 1;
        if (Math.hypot(u.x - this.anchor.x, u.z - this.anchor.z) > 140) continue;
        const a = Math.atan2(u.x - this.anchor.x, u.z - this.anchor.z);
        q |= 1 << ((Math.floor((a + Math.PI * 1.25) / (Math.PI / 2)) + 4) % 4);
      }
      const n = (q & 1) + ((q >> 1) & 1) + ((q >> 2) & 1) + ((q >> 3) & 1);
      if (n >= 3) this.lastSurround = this.t;
      if (!this.gathered && n === 4 && engaged < 4) {
        this.gathered = true;
        this.event('gather', '斥候报敌从四面合围——散而成八，复而为一：八阵收拢通道，合为一阵', this.anchor.x, this.anchor.z, 0, 99);
      } else if (this.gathered && this.t - (this.lastSurround || 0) > 25 && engaged === 0) {
        this.gathered = false;
        this.event('scatter', '合围已解，八阵重新散开', this.anchor.x, this.anchor.z, 0, 30);
      }
    }
    const target = this.gathered ? C.gatherSpread : 1;
    const step = 0.014 * dt;
    this.spread += Math.max(-step, Math.min(step, target - this.spread));
  }

  shiftGroup(gid, cell, mode) {
    const from = this.cellOf[gid];
    const dx = (cell[0] - from[0]) * 48;
    const df = (cell[1] - from[1]) * 48;
    for (const u of this.units) {
      if (u.side !== 0 || u.group !== gid || u.dead) continue;
      u.slot = {
        lx: u.slot.lx + dx,
        lf: u.slot.lf + df,
        cx: u.slot.cx + dx,
        cf: u.slot.cf + df,
        rh: Math.atan2(cell[0] * 48 + (u.slot.lx - from[0] * 48), cell[1] * 48 + (u.slot.lf - from[1] * 48))
      };
      if (u.rout) continue;
      if (mode === 'withdraw') {
        u.mode = 'withdraw';
        u.withdrawUntil = this.t + 14;
      } else {
        u.mode = 'return';
        u.target = null;
      }
    }
  }

  swapSlots(fresh, tired) {
    const s = fresh.slot;
    fresh.slot = tired.slot;
    tired.slot = s;
    fresh.mode = 'engage';
    fresh.relieveId = -1;
    tired.mode = 'withdraw';
    tired.withdrawUntil = this.t + 8;
    this.stats.rotations += 1;
    const g = this.formation.groups[tired.group];
    this.event(`rot-${tired.group}`, `${g.name}轮换：疲兵退入阵内，生力军接替（以前为后）`, tired.x, tired.z, 0, 10);
  }

  // ———————————————————— 魏军 ————————————————————

  updateEnemyGroups(dt) {
    for (const g of this.enemyGroups) {
      const alive = g.units.filter((u) => !u.dead && !u.fled && !u.rout);
      if (!alive.length) continue;
      if (g.state === 'wait') {
        if (this.t >= g.delay) {
          g.state = 'march';
          if (g.delay > 0) this.event(`eg-${g.index}`, `${g.name}开始进击`, g.x, g.z, 1, 99);
        }
        continue;
      }
      if (g.state !== 'march') continue;
      const detect = g.type === 'hcav' ? C.detectCav : C.detectInf;
      const spotted = this.stepIndex % 3 === 0 && alive.some((u) =>
        this.nearest(u.x, u.z, detect, (v) => v.side === 0 && !v.dead && !v.rout && v.type !== 'cav')
      );
      const wp = g.path[g.pathIndex];
      if (spotted || !wp) {
        g.state = 'attack';
        this.onEnemyEngage(g);
        continue;
      }
      const h = angTo(g.x, g.z, wp.x, wp.z);
      const dd = Math.hypot(wp.x - g.x, wp.z - g.z);
      const step = Math.min(dd, g.speed * dt);
      g.x += Math.sin(h) * step;
      g.z += Math.cos(h) * step;
      g.heading += wrap(h - g.heading) * Math.min(1, dt * 0.8);
      if (dd < 4) g.pathIndex += 1;
    }
  }

  onEnemyEngage(g) {
    const c = groupCentroid(g);
    if (!c) return;
    const a = angTo(this.anchor.x, this.anchor.z, c.x, c.z);
    const rel = wrap(a - this.anchor.heading);
    const dir = DIR_NAME[((Math.round(-a / (Math.PI / 4) + 4) % 8) + 8) % 8];
    if (Math.abs(rel) > Math.PI * 0.6 && !this.rearAlarm) {
      this.rearAlarm = true;
      if (this.formationId === 'bazhen') {
        this.event('rear', `敌自${dir}面阵后杀来——触处为首，后阵各队就地转为阵首`, c.x, c.z, 0, 99);
      } else {
        this.event('rear', `敌自${dir}面阵后杀来，${this.formation.name}后方空虚`, c.x, c.z, 1, 99);
      }
    } else {
      this.event(`eg-${g.index}`, `${g.name}自${dir}面接敌`, c.x, c.z, 1, 99);
    }
  }

  enemyAI(u) {
    const g = u.eg;
    u.wantSpeed = u.T.walk;
    if (g.state === 'wait') {
      u.goal = null;
      return;
    }
    if (u.contacts.length) {
      const t = this.pickContact(u);
      u.goal = null;
      u.face = angTo(u.x, u.z, t.x, t.z);
      return;
    }
    if (u.T.range && g.state !== 'march') {
      // 弓弩手：保持在射程边缘放箭，被逼近就后撤
      if (u.think || !u.thinkEnemy || u.thinkEnemy.dead || u.thinkEnemy.rout) {
        u.thinkEnemy = this.nearest(u.x, u.z, 120, (v) => v.side === 0 && !v.dead && !v.rout) || this.nearestGlobal(u, 0);
      }
      const e = u.thinkEnemy;
      const home = g.state === 'hold' ? this.toWorld(u.off.lx, u.off.lf, g) : null;
      if (!e) {
        u.goal = home;
        return;
      }
      const dd = Math.hypot(e.x - u.x, e.z - u.z);
      u.face = angTo(u.x, u.z, e.x, e.z);
      if (dd < 34) {
        u.goal = { x: u.x - (e.x - u.x) / dd * 20, z: u.z - (e.z - u.z) / dd * 20 };
        u.wantSpeed = u.T.run;
      } else if (dd > u.T.range - 8 && g.state !== 'hold') {
        u.goal = { x: e.x, z: e.z };
        u.wantSpeed = u.T.walk;
      } else {
        u.goal = home && Math.hypot(home.x - u.x, home.z - u.z) > 3 && dd > 45 ? home : null;
      }
      return;
    }
    if (g.state === 'march' || g.state === 'hold') {
      const p = this.toWorld(u.off.lx, u.off.lf, g);
      if (g.state === 'hold') {
        const e = this.nearest(p.x, p.z, 26, (v) => v.side === 0 && !v.rout && !v.dead);
        if (e && Math.hypot(e.x - p.x, e.z - p.z) < 14 + u.T.radius + e.T.radius) {
          u.goal = { x: e.x, z: e.z };
          u.wantSpeed = u.T.run;
          u.face = angTo(u.x, u.z, e.x, e.z);
          return;
        }
        u.goal = p;
        const dd = Math.hypot(p.x - u.x, p.z - u.z);
        u.face = dd > 3 ? angTo(u.x, u.z, p.x, p.z) : g.heading;
        if (e) u.face = angTo(u.x, u.z, e.x, e.z);
        return;
      }
      u.goal = p;
      const dd = Math.hypot(p.x - u.x, p.z - u.z);
      u.wantSpeed = dd > 6 ? u.T.run * 0.8 : g.speed;
      u.face = g.heading;
      return;
    }
    // attack：各自寻敌
    if (g.target === 'general' && u.T.cav && this.general && !this.general.dead) {
      const gp = this.general;
      const dir = this.steerAround(u, gp.x, gp.z);
      u.goal = { x: u.x + dir.x * 20, z: u.z + dir.z * 20 };
      u.wantSpeed = u.T.run;
      u.face = Math.atan2(dir.x, dir.z);
      return;
    }
    let e = u.thinkEnemy;
    if (u.think || !e || e.dead || e.fled || e.rout) {
      e = this.nearest(u.x, u.z, 90, (v) => v.side === 0 && !v.dead && !v.fled && !v.rout);
      if (!e) e = this.nearestGlobal(u, 0);
      u.thinkEnemy = e;
    }
    if (e) {
      u.goal = { x: e.x, z: e.z };
      const dd = Math.hypot(e.x - u.x, e.z - u.z);
      u.wantSpeed = dd < 45 ? u.T.run : u.T.cav ? u.T.run * 0.7 : u.T.walk * 1.2;
      u.face = angTo(u.x, u.z, e.x, e.z);
    } else {
      u.goal = { x: this.anchor.x, z: this.anchor.z };
    }
  }

  steerAround(u, tx, tz) {
    // 骑兵冲锋避开正面枪林，顺着空隙钻：沿路线前方的我军队伍产生横向推力
    let dx = tx - u.x;
    let dz = tz - u.z;
    const L = Math.hypot(dx, dz) || 1;
    dx /= L;
    dz /= L;
    let sx = 0;
    let sz = 0;
    this.forNear(u.x + dx * 12, u.z + dz * 12, 22, (v) => {
      if (v.side !== 0 || v.dead || v.rout || v.type === 'cav') return;
      const rx = v.x - u.x;
      const rz = v.z - u.z;
      const ahead = rx * dx + rz * dz;
      if (ahead < 0 || ahead > 30) return;
      const lat = rx * -dz + rz * dx;
      const need = u.T.radius + v.T.radius + 3;
      if (Math.abs(lat) > need) return;
      const push = (need - Math.abs(lat)) / need;
      const s = lat >= 0 ? -1 : 1;
      sx += -dz * s * push * 1.6;
      sz += dx * s * push * 1.6;
    });
    const ox = dx + sx;
    const oz = dz + sz;
    const M = Math.hypot(ox, oz) || 1;
    return { x: ox / M, z: oz / M };
  }

  fleeAI(u) {
    // 溃兵背离最近的敌人，向本方后方逃散
    if (u.think || !u.fleeFrom) u.fleeFrom = this.nearest(u.x, u.z, 60, (v) => v.side !== u.side && !v.rout && !v.dead) || 0;
    const e = u.fleeFrom;
    let hx;
    let hz;
    if (e) {
      hx = u.x - e.x;
      hz = u.z - e.z;
    } else if (u.side === 0) {
      hx = u.x - this.anchor.x;
      hz = u.z - this.anchor.z + 30;
    } else {
      hx = u.x - this.anchor.x;
      hz = u.z - this.anchor.z;
    }
    const L = Math.hypot(hx, hz) || 1;
    u.goal = { x: u.x + (hx / L) * 30, z: u.z + (hz / L) * 30 };
    u.wantSpeed = u.T.cav ? u.T.run * 0.85 : u.T.run * 1.05;
    u.face = Math.atan2(hx, hz);
  }

  pickContact(u) {
    if (u.target && u.contacts.includes(u.target) && !u.target.rout) return u.target;
    let best = null;
    let bs = Infinity;
    for (const v of u.contacts) {
      const a = Math.abs(wrap(angTo(u.x, u.z, v.x, v.z) - u.heading));
      const s = a + (v.rout ? 3 : 0);
      if (s < bs) {
        bs = s;
        best = v;
      }
    }
    u.target = best;
    return best;
  }

  // ———————————————————— 战斗 ————————————————————

  arcOf(d, ax, az) {
    const a = Math.abs(wrap(angTo(d.x, d.z, ax, az) - d.heading));
    return a < 1.05 ? 0 : a < 2.15 ? 1 : 2;
  }

  combat(dt) {
    for (const u of this.units) {
      u.fighting = false;
      u.attackerGroups = null;
      u.attackerArcs = 0;
      u.crowd[0] = 0;
      u.crowd[1] = 0;
      u.crowd[2] = 0;
    }
    for (const u of this.units) {
      if (u.dead || u.fled) continue;
      // 冲击：骑兵高速撞入，步兵奔跑接敌
      if (!u.rout && u.newContacts && u.newContacts.length && (u.selfSpeed || 0) > (u.T.cav ? 4.2 : 2.0)) {
        for (const v of u.newContacts) {
          // 同一对手 10 秒内只算一次冲击（避免贴身推挤造成的反复「接触」）
          if (!u.shockAt) u.shockAt = new Map();
          const last = u.shockAt.get(v.id);
          if (last !== undefined && this.t - last < 10) continue;
          u.shockAt.set(v.id, this.t);
          this.shock(u, v);
        }
      }
      if (u.rout || !u.contacts.length) continue;
      if (u.mode === 'withdraw' && u.T.cav) continue;
      const t = this.pickContact(u);
      if (!t) continue;
      u.fighting = true;
      this.melee(u, t, dt);
    }
    // 弩
    for (const u of this.units) {
      if (u.dead || u.fled || u.rout || !u.T.range) continue;
      u.reload -= dt;
      if (u.reload > 0 || u.contacts.length) continue;
      const t = this.nearest(u.x, u.z, u.T.range, (v) => v.side !== u.side && !v.dead && !v.fled && !v.rout);
      if (!t) continue;
      const off = Math.abs(wrap(angTo(u.x, u.z, t.x, t.z) - u.heading));
      if (off > 0.7) continue;
      u.reload = u.T.reload * (0.9 + this.rng() * 0.2);
      let k = u.T.volley * u.men * (1 - 0.3 * (u.fatigue / 100));
      if (t.T.cav) k *= 1.3;
      if (t.T.shield && this.arcOf(t, u.x, u.z) === 0) k *= 0.7; // 盾牌
      if (t.contacts.length) k *= 0.7;
      t.incoming += k;
      t.moraleHit += 2.2;
      u.kills += k;
      this.fx.push({ kind: 'volley', from: u.id, to: t.id, t: this.t });
    }
  }

  shock(u, v) {
    const arc = this.arcOf(v, u.x, u.z);
    if (u.T.cav) {
      this.stats.charges += 1;
      if (v.T.antiCav && arc === 0 && !v.rout) {
        // 枪阵正面：骑兵撞上枪林
        u.incoming += u.men * 0.14;
        u.moraleHit += 12;
        v.moraleHit += 3;
        if (u.side === 1) {
          this.stats.braced += 1;
          this.event(`braced-${v.group}`, `敌骑撞上${this.groupName(v)}枪林，锋锐顿挫`, v.x, v.z, 0, 12);
        }
      } else {
        const m = [1, 1.5, 2.1][arc];
        v.incoming += u.men * u.T.charge * m * (v.T.cav ? 0.6 : 1);
        v.moraleHit += [9, 15, 24][arc] * Math.min(1, u.men / 50);
        this.fx.push({ kind: 'charge', from: u.id, to: v.id, t: this.t });
        if (u.side === 1 && arc > 0) this.event(`charged-${v.group}`, `敌骑自${ARC_NAME[arc]}冲入${this.groupName(v)}`, v.x, v.z, 1, 10);
      }
    } else {
      const m = [1, 1.5, 2][arc];
      v.incoming += u.men * 0.03 * m;
      v.moraleHit += 4 * m;
    }
  }

  melee(a, d, dt) {
    const arc = this.arcOf(d, a.x, a.z);
    let k = C.melee * Math.min(a.men, C.frontage) * a.T.atk;
    k *= 1 - 0.55 * (a.fatigue / 100);
    k *= 0.55 + 0.45 * (a.morale / 100);
    if (d.T.cav && a.T.antiCav) k *= a.T.antiCav;
    if (a.T.cav && d.T.antiCav && arc === 0 && !d.rout) k *= 0.6;
    // 方队：全向戒备的阵型里，驻止的队外圈各排可就地转身应敌，侧背受击惩罚较轻
    const square = d.side === 0 && this.doctrine.allRound && (d.selfSpeed || 0) < 0.6 && !d.T.cav && !d.rout;
    k *= (square ? C.arcMultSquare : C.arcMult)[arc];
    // 同一方向挤不下太多队：第二、三个从同一面攻来的队效率递减
    k *= C.crowd[Math.min(d.crowd[arc]++, C.crowd.length - 1)];
    k /= d.T.def * (1 - 0.35 * (d.fatigue / 100));
    if (d.rout) k *= 2.2;
    d.incoming += k * dt;
    a.kills += k * dt;
    if (!d.rout) d.moraleHit += C.arcMorale[arc] * (square ? 0.5 : 1) * dt;
    if (!d.attackerGroups) d.attackerGroups = new Set();
    d.attackerGroups.add(a.group);
    d.attackerArcs |= 1 << arc;
  }

  groupWaver() {
    // 本部过半溃散或伤亡，余众动摇
    if (this.stepIndex % 10 !== 0) return;
    const g = new Map();
    for (const u of this.units) {
      let e = g.get(u.group);
      if (!e) g.set(u.group, (e = { max: 0, ok: 0, units: [] }));
      e.max += u.maxMen;
      if (!u.dead && !u.fled && !u.rout) {
        e.ok += u.men;
        e.units.push(u);
      }
    }
    for (const e of g.values()) {
      if (e.units.length < 3 || e.ok > e.max * 0.5) continue;
      const drain = e.ok < e.max * 0.3 ? 8 : 4;
      for (const u of e.units) u.moraleHit += drain;
    }
  }

  applyDamage(dt) {
    this.groupWaver();
    const genAlive = this.general && !this.general.dead && !this.general.rout;
    for (const u of this.units) {
      if (u.dead || u.fled) continue;
      // 两面夹击的记录（八阵的阵间通道）
      if (u.side === 1 && u.attackerGroups && u.attackerGroups.size >= 2 && this.formationId === 'bazhen') {
        const names = [...u.attackerGroups]
          .map((g) => this.formation.groups[g])
          .filter((g) => g && g.kind !== '游军')
          .map((g) => g.name);
        if (names.length >= 2) {
          if (this.event('trap', `${u.eg.name}陷入${names[0]}与${names[1]}之间，两面受击（敌冲其中，两头俱救）`, u.x, u.z, 0, 9)) {
            this.stats.traps += 1;
          }
        }
      }
      // 四面受敌：敌军出现在三个以上方向（或前后/左右对夹）时，士气急剧流失
      if (u.think && !u.rout) {
        // 某个方向上敌人比友军更近，才算这个方向「受敌」
        const eD = QBUF_E.fill(99);
        const fD = QBUF_F.fill(99);
        this.forNear(u.x, u.z, 22, (v) => {
          if (v === u || v.rout || v.dead) return;
          const dd = Math.hypot(v.x - u.x, v.z - u.z);
          if (dd > 22) return;
          const qi = (Math.floor((Math.atan2(v.x - u.x, v.z - u.z) + Math.PI * 1.25) / (Math.PI / 2)) + 4) % 4;
          if (v.side === u.side) fD[qi] = Math.min(fD[qi], dd);
          else eD[qi] = Math.min(eD[qi], dd);
        });
        let q = 0;
        for (let i = 0; i < 4; i += 1) if (eD[i] < fD[i]) q |= 1 << i;
        const n = (q & 1) + ((q >> 1) & 1) + ((q >> 2) & 1) + ((q >> 3) & 1);
        u.surrounded = n >= 3 ? 2 : q === 5 || q === 10 ? 1 : 0;
      }
      if (u.surrounded && !u.rout) u.moraleHit += (u.surrounded === 2 ? C.surround : C.surround * 0.5) * dt;
      if (u.incoming > 0 || u.moraleHit > 0) {
        const cas = Math.min(u.men, u.incoming);
        u.men -= cas;
        this.stats.dead[u.side] += cas;
        if (u.think || u.support === undefined) {
          let n = 0;
          this.forNear(u.x, u.z, C.supportR, (v) => {
            if (v !== u && v.side === u.side && !v.rout && !v.dead && Math.hypot(v.x - u.x, v.z - u.z) < C.supportR) n += 1;
          });
          u.support = n;
        }
        const n = u.support;
        let mult = 1 / (1 + 0.18 * Math.min(n, 4));
        if (u.side === 0 && genAlive && Math.hypot(this.general.x - u.x, this.general.z - u.z) < C.genAura) mult *= 0.8;
        mult *= 1 + 0.3 * (u.fatigue / 100);
        u.morale -= ((cas / u.maxMen) * 100 * C.moraleCas + u.moraleHit) * mult;
        u.incoming = 0;
        u.moraleHit = 0;
      }
      // 疲劳
      if (u.contacts.length && !u.rout) u.fatigue = Math.min(100, u.fatigue + C.fatigueMelee * dt);
      else if (u.speed > u.T.walk * 1.6) u.fatigue = Math.min(100, u.fatigue + 0.45 * dt);
      else if (u.speed > 0.3) u.fatigue = Math.max(0, u.fatigue - 0.5 * dt);
      else u.fatigue = Math.max(0, u.fatigue - C.fatigueRest * dt);
      // 士气恢复
      if (!u.contacts.length) {
        if (u.think) u.threatNear = !!this.nearest(u.x, u.z, 30, (v) => v.side !== u.side && !v.rout && !v.dead);
        if (!u.threatNear) {
          let r = u.rout ? 2.2 : 0.8;
          if (u.side === 0 && genAlive && Math.hypot(this.general.x - u.x, this.general.z - u.z) < C.genAura) r += 0.8;
          // 溃过一次的队再集结，士气上限降低
          if (!this.broken[u.side]) u.morale = Math.min(100 - 18 * (u.routCount || 0), u.morale + r * dt);
        }
      }
      if (this.broken[u.side]) u.morale = Math.min(u.morale, 10);

      if (u.men < u.maxMen * 0.1) {
        u.dead = true;
        u.men = Math.max(0, u.men);
        this.contagion(u, 1.2);
        if (u === this.general) this.onGeneralLost();
        continue;
      }
      if (!u.rout && u.morale < C.routAt) this.setRout(u);
      else if (u.rout && u.morale > C.rallyAt && !this.broken[u.side]) {
        u.rout = false;
        u.mode = 'return';
        if (u.side === 0) this.event(`rally-${u.group}`, `${this.groupName(u)}溃兵重新集结`, u.x, u.z, 0, 15);
      }
      if (Math.hypot(u.x - this.anchor.x, u.z - this.anchor.z) > C.mapLimit) u.fled = true;
    }
  }

  setRout(u) {
    u.rout = true;
    u.routCount = (u.routCount || 0) + 1;
    u.mode = 'rout';
    u.target = null;
    this.stats.routs[u.side] += 1;
    if (u === this.general) this.onGeneralLost();
    this.contagion(u, 1);
    if (u.side === 0) this.event(`rout-${u.group}`, `${this.groupName(u)}一队士气崩溃，溃散`, u.x, u.z, 1, 6);
    else this.event(`erout-${u.group}`, `${u.eg.name}一队溃逃`, u.x, u.z, 0, 8);
  }

  contagion(u, f) {
    // 溃散波及近邻，小股溃散的影响按人数折算
    f *= Math.min(1, u.maxMen / 100);
    this.forNear(u.x, u.z, C.contagionR, (v) => {
      if (v === u || v.side !== u.side || v.rout || v.dead) return;
      if (Math.hypot(v.x - u.x, v.z - u.z) < C.contagionR) v.moraleHit += C.contagion * f;
    });
  }

  onGeneralLost() {
    if (this.generalLost) return;
    this.generalLost = true;
    for (const v of this.units) if (v.side === 0 && !v.dead) v.moraleHit += 25;
    this.event('general', '中军帅旗倒下！全军震动', this.general.x, this.general.z, 1, 99);
  }

  // ———————————————————— 移动 ————————————————————

  move(dt) {
    for (const u of this.units) {
      if (u.dead || u.fled) continue;
      const turn = u.T.turn * (u.fighting ? 0.35 : 1) * dt;
      const dh = wrap(u.face - u.heading);
      u.heading = wrap(u.heading + Math.max(-turn, Math.min(turn, dh)));
      let vx = 0;
      let vz = 0;
      const pinned = u.contacts.length && !u.rout && u.mode !== 'withdraw';
      if (u.goal && !pinned) {
        const dx = u.goal.x - u.x;
        const dz = u.goal.z - u.z;
        const L = Math.hypot(dx, dz);
        if (L > 0.05) {
          let sp = Math.min(u.wantSpeed, L / dt);
          // 背身或横移时步兵走不快
          const off = Math.abs(wrap(Math.atan2(dx, dz) - u.heading));
          if (!u.rout && !u.T.cav && off > 1.2) sp *= 0.55;
          if (u.T.cav && off > 0.9) sp *= 0.5;
          vx = (dx / L) * sp;
          vz = (dz / L) * sp;
        }
      }
      u.x += vx * dt;
      u.z += vz * dt;
      u.selfSpeed = Math.hypot(vx, vz);
    }
    // 分离：敌我不可重叠，友军可略微穿插（队间容队）
    for (const u of this.units) {
      if (u.dead || u.fled) continue;
      this.forNear(u.x, u.z, 12, (v) => {
        if (v.id <= u.id || v.dead || v.fled) return;
        const dx = v.x - u.x;
        const dz = v.z - u.z;
        const d = Math.hypot(dx, dz) || 0.01;
        const same = v.side === u.side;
        const passing =
          same &&
          (u.passing || v.passing || u.mode === 'relieve' || v.mode === 'relieve' || u.mode === 'withdraw' || v.mode === 'withdraw' || u.T.cav !== v.T.cav);
        const min = (u.T.radius + v.T.radius) * (same ? (passing ? 0.35 : 0.8) : 0.95);
        if (d >= min) return;
        const push = (min - d) * (same ? 0.25 : 0.5);
        const wu = weight(u);
        const wv = weight(v);
        const su = wv / (wu + wv);
        const sv = wu / (wu + wv);
        u.x -= (dx / d) * push * su;
        u.z -= (dz / d) * push * su;
        v.x += (dx / d) * push * sv;
        v.z += (dz / d) * push * sv;
      });
    }
    for (const u of this.units) {
      if (u.dead || u.fled) continue;
      u.speed = Math.hypot(u.x - u.px, u.z - u.pz) / dt;
    }
  }

  // ———————————————————— 胜负 ————————————————————

  checkEnd() {
    if (this.t > this.endAt) {
      this.over = true;
      return;
    }
    if (this.result) return;
    for (const side of [0, 1]) {
      if (this.broken[side]) continue;
      const m = this.sideMen(side);
      const alive = this.sideMen(side, true);
      // 全军崩溃：成建制的兵力过少，且已有相当伤亡（避免一时的慌乱被当成全军覆没）
      if (m < this.initialMen[side] * C.breakFrac && alive < this.initialMen[side] * 0.6) {
        this.broken[side] = true;
        for (const u of this.units) if (u.side === side && !u.dead && !u.rout) this.setRout(u);
        const winner = 1 - side;
        this.event('end', side === 0 ? `${this.formation.name}全线崩溃` : '魏军全线崩溃，弃甲而走', 0, 0, winner === 0 ? 0 : 1, 99);
        this.finish(winner, side === 0 ? '我军溃败' : '魏军溃败');
        return;
      }
    }
    if (!this.result && this.t >= C.tMax) this.finish(null, '相持不下');
  }

  finish(winner, reason) {
    const lost0 = this.initialMen[0] - this.sideMen(0);
    const lost1 = this.initialMen[1] - this.sideMen(1);
    this.result = {
      winner,
      reason,
      t: this.t,
      dead: [...this.stats.dead],
      lost: [lost0, lost1],
      remain: [this.sideMen(0) / this.initialMen[0], this.sideMen(1) / this.initialMen[1]],
      exchange: this.stats.dead[1] / Math.max(1, this.stats.dead[0]),
      stats: { ...this.stats, dead: [...this.stats.dead], routs: [...this.stats.routs] }
    };
    this.endAt = this.t + 6;
    if (!this.log) this.over = true;
  }

  // ———————————————————— 事件 ————————————————————

  groupName(u) {
    if (u.side === 1) return u.eg ? u.eg.name : '魏军';
    const g = this.formation.groups[u.group];
    return g ? g.name : '我军';
  }

  event(k, text, x, z, tone, gap = 5) {
    const last = this.throttle.get(k);
    if (last !== undefined && this.t - last < gap) return false;
    this.throttle.set(k, this.t);
    if (this.log) this.events.push({ t: this.t, text, x, z, tone });
    return true;
  }
}

const CELL = 16;
const QBUF_E = [99, 99, 99, 99];
const QBUF_F = [99, 99, 99, 99];
const GRID_N = 80; // 覆盖 ±640m；更远的单位折叠到边缘格
function cellIndex(ix, iz) {
  const a = Math.max(0, Math.min(GRID_N - 1, ix + GRID_N / 2));
  const b = Math.max(0, Math.min(GRID_N - 1, iz + GRID_N / 2));
  return a * GRID_N + b;
}

function weight(u) {
  let w = u.T.cav ? 1.4 : 1;
  if (u.contacts.length) w *= 2.5;
  if (u.rout) w *= 0.4;
  return w * (0.4 + (0.6 * u.men) / u.maxMen);
}

function groupCentroid(g) {
  let x = 0;
  let z = 0;
  let n = 0;
  for (const u of g.units) {
    if (u.dead || u.fled || u.rout) continue;
    x += u.x;
    z += u.z;
    n += 1;
  }
  return n ? { x: x / n, z: z / n } : null;
}

export function runHeadless(formation, scenario, seed = 7) {
  const b = new Battle({ formation, scenario, seed, log: false });
  return b.run();
}
