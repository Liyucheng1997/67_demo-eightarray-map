// 我军阵型。所有阵型使用完全相同的兵力：
//   64 枪盾队（八阵各八队） + 8 连弩队 + 中军帅旗 + 4 握奇预备队 + 24 队游骑
// 阵型之间只有「站位」和「号令（doctrine）」不同，兵种数值完全一致，
// 所以推演结果的差异全部来自阵法本身。
//
// 局部坐标：lx = 向右为正，lf = 向前（敌方来向）为正，rh = 相对阵首的朝向（弧度）。

const S = 9; // 队与队的间距（队宽约 6m，留 3m「队间容队」）
const P = 48; // 八阵各阵中心的间距：阵宽 24m + 阵间通道 24m（「阵间容阵」）

export const BAZHEN_GROUPS = {
  tian: { name: '天覆阵', short: '天', kind: '正', cell: [0, 1], color: '#c9a45a', place: '前正' },
  di: { name: '地载阵', short: '地', kind: '正', cell: [0, -1], color: '#8a7a4e', place: '后正' },
  feng: { name: '风扬阵', short: '风', kind: '正', cell: [-1, 0], color: '#4f9c95', place: '左正' },
  yun: { name: '云垂阵', short: '云', kind: '正', cell: [1, 0], color: '#8f84b8', place: '右正' },
  long: { name: '龙飞阵', short: '龙', kind: '奇', cell: [-1, 1], color: '#4f9a5f', place: '左前隅' },
  hu: { name: '虎翼阵', short: '虎', kind: '奇', cell: [1, 1], color: '#c8603f', place: '右前隅' },
  niao: { name: '鸟翔阵', short: '鸟', kind: '奇', cell: [1, -1], color: '#d8b44a', place: '右后隅' },
  she: { name: '蛇蟠阵', short: '蛇', kind: '奇', cell: [-1, -1], color: '#5d7fa8', place: '左后隅' },
  zhong: { name: '中军', short: '中', kind: '握奇', cell: [0, 0], color: '#e3b154', place: '中宫' },
  you: { name: '游骑', short: '骑', kind: '游军', cell: [0, -2], color: '#b58a5a', place: '中宫通道' }
};

const radial = (lx, lf) => (Math.hypot(lx, lf) < 1 ? 0 : Math.atan2(lx, lf));

function cavBlock(slots, cx, cf, cols, rows, group, rh = 0, gap = 9) {
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      slots.push({
        type: 'cav', role: 'cav', group,
        lx: cx + (c - (cols - 1) / 2) * gap,
        lf: cf - r * gap,
        rh
      });
    }
  }
}

function commandPost(slots, cx, cf, group = 'zhong') {
  slots.push({ type: 'general', role: 'general', group, lx: cx, lf: cf, rh: 0 });
  [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, df]) => {
    slots.push({ type: 'spear', role: 'reserve', group, lx: cx + dx * S, lf: cf + df * S, rh: radial(dx, df) });
  });
}

function buildBazhen() {
  const slots = [];
  for (const [gid, g] of Object.entries(BAZHEN_GROUPS)) {
    if (gid === 'zhong' || gid === 'you') continue;
    const gx = g.cell[0] * P;
    const gf = g.cell[1] * P;
    for (let i = -1; i <= 1; i += 1) {
      for (let j = -1; j <= 1; j += 1) {
        const lx = gx + i * S;
        const lf = gf + j * S;
        if (i === 0 && j === 0) {
          // 每阵正中是连弩队与阵旗：阵中有阵，恰如九宫之中宫
          slots.push({ type: 'xbow', role: 'xbow', group: gid, lx, lf, cx: gx, cf: gf, rh: radial(gx, gf), banner: true });
        } else {
          slots.push({
            type: 'spear',
            role: g.kind === '奇' ? 'qi' : 'zheng',
            group: gid,
            lx, lf, cx: gx, cf: gf,
            rh: radial(gx + i * 3, gf + j * 3)
          });
        }
      }
    }
  }
  commandPost(slots, 0, 0);
  // 二十四队游骑：屯于中宫四角的通道交汇处，可沿通道驰向任何一面
  [[-1, 1], [1, 1], [-1, -1], [1, -1]].forEach(([sx, sf]) => {
    for (let k = 0; k < 6; k += 1) {
      const c = k % 2;
      const r = Math.floor(k / 2);
      slots.push({
        type: 'cav', role: 'cav', group: 'you',
        lx: sx * (P / 2) + (c - 0.5) * 7,
        lf: sf * (P / 2) + (r - 1) * 7,
        cx: sx * (P / 2),
        cf: sf * (P / 2),
        rh: radial(sx, sf)
      });
    }
  });
  return slots;
}

function buildLine() {
  const slots = [];
  const n = 32;
  for (let rank = 0; rank < 2; rank += 1) {
    for (let i = 0; i < n; i += 1) {
      const lx = (i - (n - 1) / 2) * 8.6;
      const group = lx < -48 ? 'L' : lx > 48 ? 'R' : 'C';
      slots.push({ type: 'spear', role: 'line', group, lx, lf: -rank * 9, rh: 0 });
    }
  }
  for (let i = 0; i < 8; i += 1) {
    const lx = (i - 3.5) * 34;
    slots.push({ type: 'xbow', role: 'xbow', group: lx < -48 ? 'L' : lx > 48 ? 'R' : 'C', lx, lf: -21, rh: 0, banner: i === 1 || i === 6 });
  }
  commandPost(slots, 0, -40);
  cavBlock(slots, -160, -10, 3, 4, 'L', 0);
  cavBlock(slots, 160, -10, 3, 4, 'R', 0);
  return slots;
}

function buildSquare() {
  const slots = [];
  const N = 9;
  const g = 8.6;
  const xbowCells = new Set(['3,3', '3,5', '5,3', '5,5', '4,2', '4,6', '2,4', '6,4']);
  const emptyCells = new Set(['2,2', '2,6', '6,2', '6,6']);
  const reserveCells = new Set(['4,3', '4,5', '3,4', '5,4']);
  for (let r = 0; r < N; r += 1) {
    for (let c = 0; c < N; c += 1) {
      const key = `${c},${r}`;
      const lx = (c - 4) * g;
      const lf = (4 - r) * g;
      if (key === '4,4') {
        slots.push({ type: 'general', role: 'general', group: 'C', lx, lf, rh: 0 });
        continue;
      }
      if (emptyCells.has(key)) continue;
      if (reserveCells.has(key)) {
        slots.push({ type: 'spear', role: 'reserve', group: 'C', lx, lf, rh: radial(lx, lf) });
        continue;
      }
      if (xbowCells.has(key)) {
        slots.push({ type: 'xbow', role: 'xbow', group: 'C', lx, lf, rh: radial(lx, lf), banner: key === '4,2' });
        continue;
      }
      const edge = r === 0 || c === 0 || r === N - 1 || c === N - 1;
      // 外沿各队向外，内部各队随前沿朝向（接替用）
      let rh = 0;
      if (edge) {
        const ex = c === 0 ? -1 : c === N - 1 ? 1 : 0;
        const ef = r === 0 ? 1 : r === N - 1 ? -1 : 0;
        rh = radial(ex, ef);
      } else {
        rh = radial(lx, lf);
      }
      slots.push({ type: 'spear', role: edge ? 'edge' : 'inner', group: 'C', lx, lf, rh });
    }
  }
  cavBlock(slots, -30, -58, 6, 2, 'C', Math.PI);
  cavBlock(slots, 30, -58, 6, 2, 'C', Math.PI);
  return slots;
}

function ring(slots, n, r, type, role, group, offset = 0) {
  for (let i = 0; i < n; i += 1) {
    const a = offset + (i / n) * Math.PI * 2;
    const lx = Math.sin(a) * r;
    const lf = Math.cos(a) * r;
    slots.push({ type, role, group, lx, lf, rh: a });
  }
}

function buildCircle() {
  const slots = [];
  ring(slots, 40, 64, 'spear', 'edge', 'C');
  ring(slots, 24, 50, 'spear', 'inner', 'C', Math.PI / 24);
  ring(slots, 12, 37, 'cav', 'cav', 'C', Math.PI / 12);
  ring(slots, 8, 26, 'xbow', 'xbow', 'C');
  slots[slots.length - 8].banner = true;
  ring(slots, 12, 16, 'cav', 'cav', 'C', Math.PI / 12);
  commandPost(slots, 0, 0, 'C');
  return slots;
}

function buildCrane() {
  const slots = [];
  // 中军横列（两列）
  for (let rank = 0; rank < 2; rank += 1) {
    for (let i = 0; i < 8; i += 1) {
      slots.push({ type: 'spear', role: 'line', group: 'C', lx: (i - 3.5) * 8.6, lf: -rank * 9, rh: 0 });
    }
  }
  // 两翼斜向前伸
  const wingAng = (36 * Math.PI) / 180;
  [-1, 1].forEach((side) => {
    const group = side < 0 ? 'L' : 'R';
    for (let rank = 0; rank < 2; rank += 1) {
      for (let i = 0; i < 12; i += 1) {
        const along = i * 8.8;
        slots.push({
          type: 'spear', role: 'wing', group,
          lx: side * (40 + Math.cos(wingAng) * along + rank * 4),
          lf: Math.sin(wingAng) * along - rank * 9,
          rh: -side * 0.35
        });
      }
    }
    cavBlock(slots, side * 150, 70, 3, 4, group, -side * 0.4);
  });
  for (let i = 0; i < 8; i += 1) {
    slots.push({ type: 'xbow', role: 'xbow', group: 'C', lx: (i - 3.5) * 12, lf: -22, rh: 0, banner: i === 3 });
  }
  commandPost(slots, 0, -42, 'C');
  return slots;
}

function buildWedge() {
  const slots = [];
  // 1+3+5+…+15 = 64 队，锋尖在前
  for (let k = 0; k < 8; k += 1) {
    for (let j = 0; j <= 2 * k; j += 1) {
      const lx = (j - k) * 8.8;
      const group = k < 3 ? 'C' : lx < -20 ? 'L' : lx > 20 ? 'R' : 'C';
      slots.push({ type: 'spear', role: k === 0 ? 'tip' : 'line', group, lx, lf: 40 - k * 9.5, rh: 0 });
    }
  }
  for (let i = 0; i < 8; i += 1) {
    slots.push({ type: 'xbow', role: 'xbow', group: 'C', lx: (i - 3.5) * 10, lf: -42, rh: 0, banner: i === 3 });
  }
  commandPost(slots, 0, -58, 'C');
  cavBlock(slots, -95, -30, 3, 4, 'L', 0);
  cavBlock(slots, 95, -30, 3, 4, 'R', 0);
  return slots;
}

const GENERIC_GROUPS = {
  L: { name: '左军', short: '左', kind: '', color: '#b8563f' },
  C: { name: '中军', short: '中', kind: '', color: '#e3b154' },
  R: { name: '右军', short: '右', kind: '', color: '#b8563f' },
  zhong: { name: '中军', short: '中', kind: '握奇', color: '#e3b154' }
};

export const FORMATIONS = {
  bazhen: {
    id: 'bazhen',
    name: '八阵图',
    tag: '井田九宫 · 四正四奇 · 余奇握机',
    summary: '八阵各据一宫，中军居中握奇；阵与阵之间留出等宽通道，队与队之间也留空隙。',
    strengths: [
      '触处为首：每一阵都是独立的小方阵，敌从任何方向来，接敌之阵即为阵首，无需全军转向。',
      '阵间容阵：通道让疲惫的前队从后方撤下、生力军顶上，以前为后、以后为前，持续作战能力强。',
      '敌冲其中，两头俱救：敌入通道即被两侧之阵与阵内连弩夹击，四奇阵出兵侧击。',
      '阵间空隙切断溃散的连锁：一队溃败不会像横阵那样沿战线一路传染。'
    ],
    weaknesses: ['正面接敌宽度比横阵小，单纯对拼正面火力时并不占便宜。', '需要严格的旗鼓号令，推演中假设号令畅通。'],
    groups: BAZHEN_GROUPS,
    doctrine: { allRound: true, rotate: true, groupRotate: true, gather: true, qiSally: true, reserveLeash: 50, sallyRange: 55, sallyCap: 3 },
    build: buildBazhen
  },
  line: {
    id: 'line',
    name: '一字横阵',
    tag: '对照组 · 宽正面',
    summary: '全军排成两列横队，弩手在后，骑兵护两翼。正面最宽，后方与侧翼最薄。',
    strengths: ['正面接敌宽度最大，同时投入战斗的兵最多，弩手射界开阔。'],
    weaknesses: ['侧背一旦受击，前排队伍两面受敌。', '溃散会沿连续战线传染，一处崩溃、全线动摇。', '没有预留通道，无法轮换疲兵。'],
    groups: GENERIC_GROUPS,
    doctrine: { allRound: false },
    build: buildLine
  },
  square: {
    id: 'square',
    name: '方阵',
    tag: '对照组 · 密集厚实',
    summary: '九行九列的实心方阵，外沿四面向外，内部为预备，骑兵在阵后。',
    strengths: ['四面皆有正面，枪阵外沿能正面迎击骑兵。', '队与队紧挨，互相支援、士气稳固。'],
    weaknesses: ['只有外沿能打，内部大量兵力闲置。', '队与队紧贴，缺口一出溃散迅速蔓延，也无法从内部轮换。'],
    groups: GENERIC_GROUPS,
    doctrine: { allRound: true, advanceSpeed: 0.6 },
    build: buildSquare
  },
  circle: {
    id: 'circle',
    name: '圆阵',
    tag: '对照组 · 四面防御',
    summary: '两重环形枪阵向外，弩手与骑兵藏在环内，中军居圆心。',
    strengths: ['没有侧背，四面合围时最不吃亏。', '骑兵、弩手受外环保护。'],
    weaknesses: ['被动挨打，缺少反击手段。', '外环一旦被突破，内部空虚。'],
    groups: GENERIC_GROUPS,
    doctrine: { allRound: true, advanceSpeed: 0.6 },
    build: buildCircle
  },
  crane: {
    id: 'crane',
    name: '鹤翼阵',
    tag: '对照组 · 两翼包抄',
    summary: '中军居后，两翼斜向前张开如鹤展翅，诱敌入怀再合拢两翼。',
    strengths: ['敌军正面冲入中间时，两翼合拢形成三面夹击。'],
    weaknesses: ['敌从侧后来时，张开的两翼反而各自孤立。'],
    groups: GENERIC_GROUPS,
    doctrine: { allRound: false, wingEnvelop: true, wingRange: 85, wingCap: 14 },
    build: buildCrane
  },
  wedge: {
    id: 'wedge',
    name: '锋矢阵',
    tag: '对照组 · 集中突破',
    summary: '队列呈箭头状，锋尖在前，全军集中于一点向前突击。',
    strengths: ['主动迎击，冲击力集中在一点，适合撕开敌方横阵。'],
    weaknesses: ['两侧与后方暴露，被包抄时锋尖与阵尾难以相顾。'],
    groups: GENERIC_GROUPS,
    doctrine: { allRound: false, counterCharge: true, advanceSpeed: 1.35 },
    build: buildWedge
  }
};

export const FORMATION_ORDER = ['bazhen', 'line', 'square', 'circle', 'crane', 'wedge'];
