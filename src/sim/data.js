// 兵种与战斗常数。纯数据，无 DOM / three 依赖，可在 Node 中直接运行推演。
// 单位制：距离 = 米，时间 = 秒，兵力 = 人。

export const UNIT_TYPES = {
  // —— 蜀军 ——
  spear: {
    label: '枪盾队', shield: true, men: 100, cols: 5, rows: 5, gap: 1.5, depthGap: 1.5, radius: 4.0,
    walk: 1.5, run: 2.7, turn: 1.5, atk: 1.0, def: 1.25, antiCav: 1.6
  },
  xbow: {
    label: '连弩队', men: 100, cols: 5, rows: 5, gap: 1.55, depthGap: 1.55, radius: 4.1,
    walk: 1.5, run: 2.5, turn: 1.8, atk: 0.45, def: 0.7, range: 85, reload: 2.0, volley: 0.03
  },
  general: {
    label: '中军帅旗', shield: true, men: 100, cols: 4, rows: 4, gap: 1.8, depthGap: 1.8, radius: 4.0,
    walk: 1.4, run: 2.4, turn: 1.2, atk: 0.9, def: 1.35, antiCav: 1.3, isGeneral: true
  },
  cav: {
    label: '游骑', men: 30, cols: 3, rows: 2, gap: 2.4, depthGap: 3.6, radius: 3.8,
    walk: 4.2, run: 7.5, turn: 2.4, atk: 1.15, def: 0.95, cav: true, charge: 0.14
  },
  // —— 魏军 ——
  inf: {
    label: '魏步卒', shield: true, men: 100, cols: 5, rows: 5, gap: 1.5, depthGap: 1.5, radius: 4.0,
    walk: 1.45, run: 2.6, turn: 1.3, atk: 1.0, def: 1.15, antiCav: 1.25
  },
  bow: {
    label: '魏弓弩手', men: 100, cols: 5, rows: 5, gap: 1.6, depthGap: 1.6, radius: 4.1,
    walk: 1.5, run: 2.6, turn: 1.8, atk: 0.4, def: 0.7, range: 72, reload: 2.6, volley: 0.012
  },
  hcav: {
    label: '魏铁骑', men: 50, cols: 5, rows: 2, gap: 2.2, depthGap: 3.6, radius: 5.2,
    walk: 4.0, run: 8.0, turn: 2.0, atk: 1.25, def: 1.0, cav: true, charge: 0.16
  }
};

for (const T of Object.values(UNIT_TYPES)) {
  T.figs = T.cols * T.rows;
  T.menPerFig = T.men / T.figs;
}

export const C = {
  dt: 0.1,
  tMax: 360,
  contactPad: 1.4,
  melee: 0.015, // 每名有效接战者每秒杀伤
  frontage: 45, // 一个队同一时刻能投入接战的最多人数
  arcMult: [1, 1.7, 2.4], // 正面 / 侧面 / 背面 受击倍率
  arcMultSquare: [1, 1.2, 1.5], // 驻止方队的侧背受击倍率
  arcMorale: [0, 1.8, 4.0], // 侧背受击每秒额外士气损失
  crowd: [1, 0.5, 0.25],
  fatigueMelee: 2.0, // 接战每秒疲劳
  fatigueRest: 2.4,
  gatherSpread: 0.58,
  surround: 3.5, // 三面以上受敌时每秒士气损失 // 同一方向第 1/2/3 个攻击者的效率
  moraleCas: 1.15, // 每损失 1% 兵力掉多少士气
  routAt: 22,
  rallyAt: 55,
  supportR: 20,
  contagionR: 22,
  contagion: 9,
  genAura: 90,
  breakFrac: 0.3, // 一方未溃兵力低于初始该比例即全军崩溃
  detectInf: 32,
  detectCav: 55,
  mapLimit: 420
};

export const TAU = Math.PI * 2;
export const wrap = (a) => {
  a = (a + Math.PI) % TAU;
  if (a < 0) a += TAU;
  return a - Math.PI;
};
export const angTo = (ax, az, bx, bz) => Math.atan2(bx - ax, bz - az);
export const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
