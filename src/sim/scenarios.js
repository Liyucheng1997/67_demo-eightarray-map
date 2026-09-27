// 魏军想定。我军中军在原点，阵首朝北（-Z）。世界坐标：x 向东，z 向南。
// 每个敌军集团：兵种、队数、列数、队距、出发点、朝向、延迟、行军路线、目标模式。
//   target: 'nearest' 接敌即战；'general' 骑兵直取中军帅旗；'hold' 据守不动。

const N = 0; // 朝南（+Z）前进 = heading 0
const S = Math.PI;
const E = -Math.PI / 2; // 朝西前进
const W = Math.PI / 2; // 朝东前进

export const SCENARIOS = {
  frontal: {
    id: 'frontal',
    name: '正面强攻',
    brief: '魏军步卒两波自北正面压上，铁骑护两翼。考验正面承受力与持久力。',
    enemy: [
      { name: '魏军前锋', type: 'inf', count: 48, cols: 16, gap: 10, x: 0, z: -175, heading: N, delay: 0, path: [[0, -30]] },
      { name: '魏军弓弩', type: 'bow', count: 12, cols: 12, gap: 11, x: 0, z: -195, heading: N, delay: 0, path: [[0, -60]] },
      { name: '魏军后队', type: 'inf', count: 48, cols: 16, gap: 10, x: 0, z: -215, heading: N, delay: 14, path: [[0, -30]] },
      { name: '左翼铁骑', type: 'hcav', count: 12, cols: 4, gap: 12, x: -150, z: -175, heading: N, delay: 6, path: [[-110, -60]] },
      { name: '右翼铁骑', type: 'hcav', count: 12, cols: 4, gap: 12, x: 150, z: -175, heading: N, delay: 6, path: [[110, -60]] }
    ]
  },
  cavalry: {
    id: 'cavalry',
    name: '铁骑冲阵',
    brief: '魏铁骑结成纵队直冲中军帅旗，步卒随后跟进。考验阵形能否化解骑兵的冲击。',
    enemy: [
      { name: '铁骑冲锋队', type: 'hcav', count: 40, cols: 4, gap: 11, x: 0, z: -200, heading: N, delay: 0, path: [[0, 0]], target: 'general' },
      { name: '魏军弓弩', type: 'bow', count: 8, cols: 8, gap: 11, x: 0, z: -215, heading: N, delay: 4, path: [[0, -60]] },
      { name: '魏军步卒', type: 'inf', count: 64, cols: 16, gap: 10, x: 0, z: -235, heading: N, delay: 8, path: [[0, -30]] }
    ]
  },
  flank: {
    id: 'flank',
    name: '侧翼迂回',
    brief: '魏军以步卒正面牵制，铁骑与一支步卒分从左右迂回，猛击侧后。',
    enemy: [
      { name: '正面牵制', type: 'inf', count: 48, cols: 16, gap: 10, x: 0, z: -170, heading: N, delay: 0, path: [[0, -30]] },
      { name: '迂回铁骑', type: 'hcav', count: 32, cols: 6, gap: 11, x: -240, z: -140, heading: N, delay: 0, path: [[-230, 30], [-120, 70], [0, 40]] },
      { name: '迂回步卒', type: 'inf', count: 36, cols: 9, gap: 10, x: 200, z: -150, heading: N, delay: 0, path: [[190, -10], [60, 10]] }
    ]
  },
  rear: {
    id: 'rear',
    name: '背后奇袭',
    brief: '一支魏军在北面佯攻，主力却绕到阵后突然杀出。考验阵形能否「触处为首」。',
    enemy: [
      { name: '北面佯攻', type: 'inf', count: 28, cols: 14, gap: 10, x: 0, z: -165, heading: N, delay: 0, path: [[0, -30]] },
      { name: '奇袭主力', type: 'inf', count: 60, cols: 15, gap: 10, x: 0, z: 165, heading: S, delay: 10, path: [[0, 20]] },
      { name: '奇袭铁骑', type: 'hcav', count: 20, cols: 10, gap: 12, x: 0, z: 200, heading: S, delay: 10, path: [[0, 20]] }
    ]
  },
  encircle: {
    id: 'encircle',
    name: '四面合围',
    brief: '魏军兵分四路，从东南西北同时合围。考验全向防御与内线机动。',
    enemy: [
      { name: '北路', type: 'inf', count: 19, cols: 10, gap: 10, x: 0, z: -170, heading: N, delay: 0, path: [[0, 0]] },
      { name: '南路', type: 'inf', count: 19, cols: 10, gap: 10, x: 0, z: 170, heading: S, delay: 0, path: [[0, 0]] },
      { name: '东路', type: 'inf', count: 19, cols: 10, gap: 10, x: 170, z: 0, heading: E, delay: 0, path: [[0, 0]] },
      { name: '西路', type: 'inf', count: 19, cols: 10, gap: 10, x: -170, z: 0, heading: W, delay: 0, path: [[0, 0]] },
      { name: '北路弓弩', type: 'bow', count: 3, cols: 3, gap: 11, x: 0, z: -190, heading: N, delay: 0, path: [[0, 0]] },
      { name: '南路弓弩', type: 'bow', count: 3, cols: 3, gap: 11, x: 0, z: 190, heading: S, delay: 0, path: [[0, 0]] },
      { name: '东北铁骑', type: 'hcav', count: 9, cols: 3, gap: 12, x: 150, z: -150, heading: N - Math.PI / 4, delay: 12, path: [[0, 0]] },
      { name: '西南铁骑', type: 'hcav', count: 9, cols: 3, gap: 12, x: -150, z: 150, heading: S - Math.PI / 4, delay: 12, path: [[0, 0]] }
    ]
  },
  assault: {
    id: 'assault',
    name: '攻坚敌阵',
    brief: '魏军列横阵据守，我军主动推进求战。考验阵形的进攻与突破能力。',
    offense: true,
    enemy: [
      { name: '魏军横阵', type: 'inf', count: 72, cols: 36, gap: 8.6, x: 0, z: -125, heading: N, delay: 0, path: [], target: 'hold' },
      { name: '魏军弓弩', type: 'bow', count: 12, cols: 12, gap: 14, x: 0, z: -140, heading: N, delay: 0, path: [], target: 'hold' },
      { name: '魏军左骑', type: 'hcav', count: 8, cols: 4, gap: 12, x: -190, z: -125, heading: N, delay: 0, path: [], target: 'hold' },
      { name: '魏军右骑', type: 'hcav', count: 8, cols: 4, gap: 12, x: 190, z: -125, heading: N, delay: 0, path: [], target: 'hold' }
    ]
  }
};

export const SCENARIO_ORDER = ['frontal', 'cavalry', 'flank', 'rear', 'encircle', 'assault'];
