// 程序化建模：士兵、骑兵、四轮车、旗帜。
// 每个模型由若干基本体合并为一个 BufferGeometry，顶点色区分部件，
// aPart 标记可动部件（腿、兵器、马腿），由顶点着色器驱动动画。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export const PART = { STATIC: 0, LEG_L: 1, LEG_R: 2, WEAPON: 3, HORSE_A: 4, HORSE_B: 5, CLOTH: 6 };

const tmpColor = new THREE.Color();

function piece(geo, color, part = PART.STATIC, tf = {}) {
  let g = geo.index ? geo.toNonIndexed() : geo.clone();
  g.deleteAttribute('uv');
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(tf.rx || 0, tf.ry || 0, tf.rz || 0));
  m.compose(
    new THREE.Vector3(tf.x || 0, tf.y || 0, tf.z || 0),
    q,
    new THREE.Vector3(tf.sx || 1, tf.sy || 1, tf.sz || 1)
  );
  g.applyMatrix4(m);
  const n = g.attributes.position.count;
  const colors = new Float32Array(n * 3);
  tmpColor.set(color);
  for (let i = 0; i < n; i += 1) {
    colors[i * 3] = tmpColor.r;
    colors[i * 3 + 1] = tmpColor.g;
    colors[i * 3 + 2] = tmpColor.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  g.setAttribute('aPart', new THREE.BufferAttribute(new Float32Array(n).fill(part), 1));
  return g;
}

const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cyl = (rt, rb, h, s = 7) => new THREE.CylinderGeometry(rt, rb, h, s);
const sph = (r, w = 8, h = 6) => new THREE.SphereGeometry(r, w, h);
const cone = (r, h, s = 7) => new THREE.ConeGeometry(r, h, s);

export const PALETTE = {
  shu: {
    tunic: '#8c2b20',
    tunicDark: '#5e1c16',
    armor: '#3a2a1f',
    trim: '#b0813f',
    helmet: '#4a4036',
    plume: '#c8352a',
    shield: '#7a2419',
    shieldBoss: '#c9a257',
    cape: '#9e2a1e'
  },
  wei: {
    tunic: '#2c3444',
    tunicDark: '#1b2029',
    armor: '#1b1c20',
    trim: '#6f7580',
    helmet: '#2a2c31',
    plume: '#11151b',
    shield: '#262c38',
    shieldBoss: '#8a8f99',
    cape: '#1d2533'
  }
};

const SKIN = '#b98a62';
const WOOD = '#6b4a2b';
const IRON = '#9aa1a8';
const LEATHER = '#4b3522';

function humanBase(p, { shield = false, cape = false } = {}) {
  const parts = [];
  // 腿（可摆动）
  [-1, 1].forEach((s) => {
    const part = s < 0 ? PART.LEG_L : PART.LEG_R;
    parts.push(piece(box(0.15, 0.62, 0.17), p.tunicDark, part, { x: s * 0.1, y: 0.58 }));
    parts.push(piece(box(0.16, 0.28, 0.2), LEATHER, part, { x: s * 0.1, y: 0.14, z: 0.02 })); // 靴
  });
  // 下摆
  parts.push(piece(cyl(0.2, 0.3, 0.42, 8), p.tunic, 0, { y: 0.98 }));
  // 躯干与甲片
  parts.push(piece(cyl(0.23, 0.2, 0.56, 8), p.tunic, 0, { y: 1.42 }));
  parts.push(piece(cyl(0.245, 0.215, 0.36, 8), p.armor, 0, { y: 1.44 }));
  parts.push(piece(box(0.56, 0.12, 0.26), p.armor, 0, { y: 1.64 })); // 披膊
  parts.push(piece(box(0.5, 0.06, 0.28), p.trim, 0, { y: 1.25 })); // 腰带
  // 头与盔
  parts.push(piece(cyl(0.07, 0.08, 0.1), SKIN, 0, { y: 1.74 }));
  parts.push(piece(sph(0.115), SKIN, 0, { y: 1.86 }));
  parts.push(piece(sph(0.135, 8, 5), p.helmet, 0, { y: 1.9, sy: 0.85 }));
  parts.push(piece(cyl(0.16, 0.16, 0.05, 8), p.helmet, 0, { y: 1.86 })); // 盔沿
  parts.push(piece(cone(0.04, 0.22, 5), p.plume, 0, { y: 2.1 }));
  // 左臂
  parts.push(piece(box(0.12, 0.5, 0.13), p.tunic, 0, { x: 0.3, y: 1.36, z: 0.06, rx: -0.4 }));
  if (shield) {
    parts.push(piece(box(0.5, 0.78, 0.05), p.shield, 0, { x: 0.3, y: 1.22, z: 0.3 }));
    parts.push(piece(box(0.54, 0.05, 0.06), p.trim, 0, { x: 0.3, y: 1.6, z: 0.3 }));
    parts.push(piece(box(0.54, 0.05, 0.06), p.trim, 0, { x: 0.3, y: 0.84, z: 0.3 }));
    parts.push(piece(sph(0.07, 6, 4), p.shieldBoss, 0, { x: 0.3, y: 1.24, z: 0.34, sz: 0.5 }));
  }
  if (cape) parts.push(piece(box(0.46, 0.9, 0.04), p.cape, 0, { y: 1.2, z: -0.24, rx: 0.12 }));
  return parts;
}

export function buildSpearman(p) {
  const parts = humanBase(p, { shield: true });
  // 右臂与长枪（兵器，可刺出）
  parts.push(piece(box(0.12, 0.46, 0.13), p.tunic, PART.WEAPON, { x: -0.3, y: 1.4, z: 0.12, rx: -1.0 }));
  parts.push(piece(cyl(0.022, 0.022, 3.6, 5), WOOD, PART.WEAPON, { x: -0.3, y: 1.62, z: 0.5, rx: 1.05 }));
  parts.push(piece(cone(0.045, 0.3, 5), IRON, PART.WEAPON, { x: -0.3, y: 2.5, z: 2.08, rx: 1.05 }));
  parts.push(piece(cone(0.06, 0.12, 5), p.plume, PART.WEAPON, { x: -0.3, y: 2.36, z: 1.82, rx: 1.05 + Math.PI }));
  return finish(parts);
}

export function buildCrossbowman(p) {
  const parts = humanBase(p);
  parts.push(piece(box(0.12, 0.46, 0.13), p.tunic, PART.WEAPON, { x: -0.22, y: 1.44, z: 0.2, rx: -1.3 }));
  // 弩：弩臂、弩弓、箭匣（诸葛连弩）
  parts.push(piece(box(0.08, 0.08, 0.72), WOOD, PART.WEAPON, { x: -0.05, y: 1.5, z: 0.45 }));
  parts.push(piece(box(0.74, 0.04, 0.05), WOOD, PART.WEAPON, { x: -0.05, y: 1.53, z: 0.78 }));
  parts.push(piece(box(0.1, 0.16, 0.26), LEATHER, PART.WEAPON, { x: -0.05, y: 1.62, z: 0.46 }));
  // 箭囊
  parts.push(piece(cyl(0.07, 0.07, 0.5, 6), LEATHER, 0, { x: -0.2, y: 1.2, z: -0.22, rz: 0.2 }));
  return finish(parts);
}

export function buildOfficer(p) {
  const parts = humanBase(p, { cape: true });
  parts.push(piece(box(0.12, 0.46, 0.13), p.tunic, PART.WEAPON, { x: -0.3, y: 1.4, z: 0.1, rx: -0.6 }));
  parts.push(piece(box(0.05, 0.9, 0.03), IRON, PART.WEAPON, { x: -0.3, y: 1.55, z: 0.55, rx: 0.9 })); // 环首刀
  return finish(parts);
}

export function buildCavalry(p, heavy = false) {
  const parts = [];
  const coat = heavy ? '#3a3531' : '#6d4a2e';
  const mane = '#241a12';
  // 马身
  parts.push(piece(new THREE.CapsuleGeometry(0.36, 1.05, 3, 8), coat, 0, { y: 1.3, rx: Math.PI / 2 }));
  if (heavy) {
    // 马铠（具装）
    parts.push(piece(box(0.82, 0.5, 1.5), p.armor, 0, { y: 1.28 }));
  }
  parts.push(piece(box(0.28, 0.7, 0.34), coat, 0, { y: 1.72, z: 0.78, rx: -0.55 })); // 颈
  parts.push(piece(box(0.07, 0.6, 0.3), mane, 0, { y: 1.8, z: 0.68, rx: -0.55 }));
  parts.push(piece(box(0.22, 0.24, 0.52), coat, 0, { y: 2.02, z: 1.08, rx: 0.35 })); // 头
  parts.push(piece(cone(0.08, 0.6, 5), mane, 0, { y: 1.2, z: -0.95, rx: -2.5 })); // 尾
  // 四腿：对角成对摆动
  const legs = [
    [-0.2, 0.55, PART.HORSE_A],
    [0.2, 0.55, PART.HORSE_B],
    [-0.2, -0.55, PART.HORSE_B],
    [0.2, -0.55, PART.HORSE_A]
  ];
  legs.forEach(([x, z, part]) => {
    parts.push(piece(cyl(0.075, 0.06, 1.1, 5), coat, part, { x, y: 0.58, z }));
    parts.push(piece(cyl(0.08, 0.09, 0.12, 5), '#1a1410', part, { x, y: 0.05, z }));
  });
  // 鞍
  parts.push(piece(box(0.58, 0.14, 0.6), p.tunicDark, 0, { y: 1.68, z: -0.05 }));
  // 骑手
  const ry = 1.62;
  [-1, 1].forEach((s) => parts.push(piece(box(0.14, 0.55, 0.16), p.tunicDark, 0, { x: s * 0.3, y: ry - 0.05, z: 0.1, rx: -0.3 })));
  parts.push(piece(cyl(0.22, 0.2, 0.55, 8), p.tunic, 0, { y: ry + 0.4 }));
  parts.push(piece(cyl(0.235, 0.215, 0.34, 8), p.armor, 0, { y: ry + 0.44 }));
  parts.push(piece(box(0.52, 0.11, 0.24), p.armor, 0, { y: ry + 0.63 }));
  parts.push(piece(sph(0.11), SKIN, 0, { y: ry + 0.84 }));
  parts.push(piece(sph(0.13, 8, 5), p.helmet, 0, { y: ry + 0.88, sy: 0.85 }));
  parts.push(piece(cone(0.04, 0.22, 5), p.plume, 0, { y: ry + 1.08 }));
  parts.push(piece(box(0.44, 0.7, 0.04), p.cape, 0, { y: ry + 0.3, z: -0.24, rx: 0.3 }));
  // 马槊
  parts.push(piece(box(0.11, 0.42, 0.12), p.tunic, PART.WEAPON, { x: -0.28, y: ry + 0.42, z: 0.12, rx: -1.1 }));
  parts.push(piece(cyl(0.025, 0.025, 3.8, 5), WOOD, PART.WEAPON, { x: -0.3, y: ry + 0.52, z: 0.7, rx: 1.3 }));
  parts.push(piece(cone(0.05, 0.36, 5), IRON, PART.WEAPON, { x: -0.3, y: ry + 0.99, z: 2.6, rx: 1.3 }));
  return finish(parts);
}

// 诸葛亮乘坐的四轮车，羽扇纶巾
export function buildWagon() {
  const parts = [];
  parts.push(piece(box(1.5, 0.12, 2.0), WOOD, 0, { y: 0.72 }));
  parts.push(piece(box(1.5, 0.4, 0.08), '#5a3a22', 0, { y: 0.98, z: 0.96 }));
  parts.push(piece(box(0.08, 0.4, 2.0), '#5a3a22', 0, { x: -0.72, y: 0.98 }));
  parts.push(piece(box(0.08, 0.4, 2.0), '#5a3a22', 0, { x: 0.72, y: 0.98 }));
  [[-0.82, 0.62], [0.82, 0.62], [-0.82, -0.62], [0.82, -0.62]].forEach(([x, z]) => {
    parts.push(piece(new THREE.TorusGeometry(0.38, 0.05, 5, 14), '#3d2a18', 0, { x, y: 0.4, z, ry: Math.PI / 2 }));
    parts.push(piece(cyl(0.05, 0.05, 0.1, 6), '#3d2a18', 0, { x, y: 0.4, z, rz: Math.PI / 2 }));
  });
  // 坐像：白衣纶巾
  parts.push(piece(cyl(0.26, 0.4, 0.7, 8), '#ece6d6', 0, { y: 1.15, z: -0.2 }));
  parts.push(piece(sph(0.12), SKIN, 0, { y: 1.64, z: -0.2 }));
  parts.push(piece(box(0.26, 0.14, 0.22), '#2b2e33', 0, { y: 1.77, z: -0.22 })); // 纶巾
  parts.push(piece(cyl(0.015, 0.015, 0.34, 4), '#d8cfbd', 0, { x: 0.25, y: 1.4, z: 0.05, rz: -0.4 }));
  parts.push(piece(sph(0.16, 8, 4), '#f4f1ea', 0, { x: 0.34, y: 1.6, z: 0.07, sz: 0.25 })); // 羽扇
  // 华盖
  parts.push(piece(cyl(0.03, 0.03, 2.2, 5), '#8a6a3a', 0, { y: 1.9, z: -0.6 }));
  parts.push(piece(cone(1.1, 0.4, 12), '#9c2a1c', 0, { y: 3.05, z: -0.6 }));
  parts.push(piece(cyl(1.1, 1.1, 0.25, 12, 1), '#c9a257', 0, { y: 2.78, z: -0.6 }));
  return finish(parts);
}

export function buildDrum() {
  const parts = [];
  parts.push(piece(cyl(0.55, 0.55, 0.7, 12), '#8c2b20', 0, { y: 1.35, rx: Math.PI / 2 }));
  parts.push(piece(cyl(0.56, 0.56, 0.05, 12), '#d8c6a0', 0, { y: 1.35, z: 0.36, rx: Math.PI / 2 }));
  parts.push(piece(cyl(0.56, 0.56, 0.05, 12), '#d8c6a0', 0, { y: 1.35, z: -0.36, rx: Math.PI / 2 }));
  [[-0.4, 0.3], [0.4, 0.3], [-0.4, -0.3], [0.4, -0.3]].forEach(([x, z]) => parts.push(piece(cyl(0.04, 0.05, 1.1, 5), WOOD, 0, { x, y: 0.55, z })));
  return finish(parts);
}

function finish(parts) {
  const g = mergeGeometries(parts, false);
  g.computeBoundingSphere();
  return g;
}

// —— 动画材质 ——
export const animUniforms = { uTime: { value: 0 } };

export function makeAnimatedMaterial(opts = {}) {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0.06, ...opts });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = animUniforms.uTime;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute float aPart;
        attribute vec3 aAnim;
        uniform float uTime;
        vec2 rot2(vec2 p, float a) { float c = cos(a), s = sin(a); return vec2(p.x * c - p.y * s, p.x * s + p.y * c); }`
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        float st = aAnim.x;
        float ph = aAnim.y;
        float walk = step(0.5, st) * (1.0 - step(1.5, st));
        float fight = step(1.5, st) * (1.0 - step(2.5, st));
        float run = step(2.5, st) * (1.0 - step(3.5, st));
        float gait = uTime * (6.5 + run * 4.0 + aAnim.z * 3.0) + ph;
        float amp = walk * 0.42 + run * 0.7;
        if (aPart > 0.5 && aPart < 2.5) {
          float a = sin(gait + (aPart > 1.5 ? 3.14159 : 0.0)) * amp;
          transformed.yz = rot2(transformed.yz - vec2(0.9, 0.0), a) + vec2(0.9, 0.0);
        }
        if (aPart > 3.5 && aPart < 5.5) {
          float a = sin(gait * 1.15 + (aPart > 4.5 ? 3.14159 : 0.0)) * (amp * 1.1 + fight * 0.15);
          transformed.yz = rot2(transformed.yz - vec2(1.12, 0.0), a) + vec2(1.12, 0.0);
        }
        if (aPart > 2.5 && aPart < 3.5) {
          float th = max(0.0, sin(uTime * 5.5 + ph * 1.7));
          th = th * th;
          transformed.z += fight * th * 0.6;
          transformed.y -= fight * th * 0.12;
        }
        transformed.y += (walk * 0.035 + run * 0.07) * abs(sin(gait));
        transformed.y -= fight * 0.04 * (1.0 + sin(uTime * 3.0 + ph));`
      );
  };
  return mat;
}

// —— 旗帜 ——
const bannerCache = new Map();

export function bannerTexture(text, bg, fg = '#f3e6c4', { tall = true, border = '#e2c27a' } = {}) {
  const key = `${text}|${bg}|${fg}|${tall}`;
  if (bannerCache.has(key)) return bannerCache.get(key);
  const c = document.createElement('canvas');
  c.width = tall ? 128 : 192;
  c.height = tall ? 224 : 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, c.width, c.height);
  // 布纹
  for (let i = 0; i < 900; i += 1) {
    ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.07})`;
    ctx.fillRect(Math.random() * c.width, Math.random() * c.height, 2, 1);
  }
  ctx.strokeStyle = border;
  ctx.lineWidth = 7;
  ctx.strokeRect(9, 9, c.width - 18, c.height - 18);
  // 火焰边（齿边）
  ctx.fillStyle = border;
  const teeth = tall ? 7 : 5;
  for (let i = 0; i < teeth; i += 1) {
    const y = 14 + (i * (c.height - 28)) / (teeth - 1);
    ctx.beginPath();
    ctx.moveTo(c.width - 2, y - 7);
    ctx.lineTo(c.width - 2, y + 7);
    ctx.lineTo(c.width - 14, y);
    ctx.fill();
  }
  ctx.fillStyle = fg;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const size = text.length > 1 ? (tall ? 58 : 60) : tall ? 92 : 86;
  ctx.font = `900 ${size}px "STKaiti","KaiTi","Kaiti SC","楷体","Noto Serif SC","SimSun",serif`;
  if (tall && text.length > 1) {
    [...text].forEach((ch, i) => ctx.fillText(ch, c.width / 2, c.height / 2 + (i - (text.length - 1) / 2) * 64));
  } else {
    ctx.fillText(text, c.width / 2, c.height / 2 + 4);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  bannerCache.set(key, tex);
  return tex;
}

export function makeBanner({ text, bg, fg, height = 7, width = 1.3, clothH = 2.2, poleColor = '#5b4127' }) {
  const group = new THREE.Group();
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.05, 0.06, height, 6),
    new THREE.MeshStandardMaterial({ color: poleColor, roughness: 0.8 })
  );
  pole.position.y = height / 2;
  pole.castShadow = true;
  group.add(pole);
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.45, 6), new THREE.MeshStandardMaterial({ color: '#c9a257', metalness: 0.6, roughness: 0.35 }));
  tip.position.y = height + 0.2;
  group.add(tip);
  const tassel = new THREE.Mesh(new THREE.SphereGeometry(0.14, 6, 5), new THREE.MeshStandardMaterial({ color: '#b3261e', roughness: 0.9 }));
  tassel.position.y = height - 0.05;
  tassel.scale.y = 1.6;
  group.add(tassel);

  const geo = new THREE.PlaneGeometry(width, clothH, 12, 6);
  geo.translate(width / 2, 0, 0);
  const mat = new THREE.MeshStandardMaterial({
    map: bannerTexture(text, bg, fg),
    side: THREE.DoubleSide,
    roughness: 0.95
  });
  const seed = Math.random() * 10;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = animUniforms.uTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        float k = position.x / ${width.toFixed(2)};
        transformed.z += sin(position.x * 3.2 - uTime * 4.2 + ${seed.toFixed(2)}) * 0.2 * k + sin(position.y * 2.0 + uTime * 2.3) * 0.05 * k;
        transformed.y -= k * k * 0.12;`
      );
  };
  const cloth = new THREE.Mesh(geo, mat);
  cloth.position.set(0.05, height - clothH / 2 - 0.25, 0);
  cloth.castShadow = true;
  group.add(cloth);
  group.userData.cloth = cloth;
  return group;
}
