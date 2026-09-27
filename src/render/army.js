// 把推演中的「队」渲染为成千上万的士兵：阵列、行进、搏杀、溃散、阵亡。
import * as THREE from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import {
  PALETTE,
  buildSpearman,
  buildCrossbowman,
  buildOfficer,
  buildCavalry,
  buildWagon,
  buildDrum,
  makeAnimatedMaterial,
  makeBanner
} from './models.js';
import { groundHeight, mulberry } from './world.js';

const MAX = { shuSpear: 1900, shuXbow: 220, shuOfficer: 40, shuCav: 160, weiInf: 3200, weiBow: 320, weiCav: 460 };
const CORPSE_MAX = 5000;

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3(1, 1, 1);
const _c = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);

function makePool(scene, geo, max, castShadow = true) {
  const g = geo.clone();
  const anim = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
  anim.setUsage(THREE.DynamicDrawUsage);
  g.setAttribute('aAnim', anim);
  const mesh = new THREE.InstancedMesh(g, makeAnimatedMaterial(), max);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.castShadow = castShadow;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  mesh.count = 0;
  // 每个士兵略有深浅差异
  const rand = mulberry(max);
  for (let i = 0; i < max; i += 1) {
    const v = 0.82 + rand() * 0.3;
    mesh.setColorAt(i, _c.setRGB(v, v * (0.97 + rand() * 0.06), v * (0.95 + rand() * 0.08)));
  }
  scene.add(mesh);
  return { mesh, anim, n: 0, max };
}

function makeCorpsePool(scene, geo) {
  const pool = makePool(scene, geo, CORPSE_MAX, false);
  pool.cursor = 0;
  for (let i = 0; i < CORPSE_MAX; i += 1) pool.mesh.setColorAt(i, _c.setRGB(0.55, 0.5, 0.47));
  return pool;
}

export class ArmyRenderer {
  constructor(scene) {
    this.scene = scene;
    const shu = PALETTE.shu;
    const wei = PALETTE.wei;
    this.geos = {
      shuSpear: buildSpearman(shu),
      shuXbow: buildCrossbowman(shu),
      shuOfficer: buildOfficer(shu),
      shuCav: buildCavalry(shu, false),
      weiInf: buildSpearman(wei),
      weiBow: buildCrossbowman(wei),
      weiCav: buildCavalry(wei, true)
    };
    this.pools = {};
    for (const [k, g] of Object.entries(this.geos)) this.pools[k] = makePool(scene, g, MAX[k]);
    this.corpses = {
      shu: makeCorpsePool(scene, this.geos.shuSpear),
      shuHorse: makeCorpsePool(scene, this.geos.shuCav),
      wei: makeCorpsePool(scene, this.geos.weiInf),
      weiHorse: makeCorpsePool(scene, this.geos.weiCav)
    };

    // 士气环 / 选中环
    const ringGeo = new THREE.RingGeometry(0.86, 1, 28);
    ringGeo.rotateX(-Math.PI / 2);
    this.rings = new THREE.InstancedMesh(
      ringGeo,
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.8, depthWrite: false, fog: false }),
      400
    );
    this.rings.frustumCulled = false;
    this.rings.count = 0;
    this.rings.renderOrder = 2;
    scene.add(this.rings);
    this.showRings = false;
    this.highlightGroup = null;

    this.initArrows();
    this.initDust();

    this.banners = [];
    this.labels = [];
    this.props = new THREE.Group();
    scene.add(this.props);
    this.gridLines = null;
  }

  // —— 换一场战斗 ——
  setBattle(battle, formationGroups) {
    this.battle = battle;
    this.fxCursor = 0;
    for (const c of Object.values(this.corpses)) {
      c.n = 0;
      c.cursor = 0;
      c.mesh.count = 0;
    }
    this.arrows.forEach((a) => (a.life = 0));
    this.dust.forEach((d) => (d.life = 0));
    for (const b of this.banners) this.props.remove(b.obj);
    for (const l of this.labels) l.obj.parent?.remove(l.obj);
    this.banners = [];
    this.labels = [];
    this.props.clear();
    this.figState = new Map();

    for (const u of battle.units) {
      this.figState.set(u.id, { shown: Math.ceil(u.men / u.T.menPerFig - 1e-6), scatter: 0, rand: mulberry(u.seed) });
      if (!u.banner) continue;
      let text;
      let bg;
      let fg = '#f3e6c4';
      if (u.side === 1) {
        text = '魏';
        bg = '#1d2230';
        fg = '#e8e2d2';
      } else {
        const g = formationGroups[u.group];
        text = battle.formationId === 'bazhen' ? g.short : '汉';
        bg = battle.formationId === 'bazhen' ? g.color : '#8c2b20';
      }
      const obj = makeBanner({ text, bg, fg, height: u.side === 0 ? 7.5 : 6.5 });
      this.props.add(obj);
      this.banners.push({ unit: u, obj, kind: 'unit' });
    }
    // 中军：四轮车、帅旗、战鼓
    const gen = battle.general;
    if (gen) {
      const wagon = new THREE.Mesh(this.geos.wagon || (this.geos.wagon = buildWagon()), makeAnimatedMaterial());
      wagon.geometry.setAttribute('aAnim', new THREE.InstancedBufferAttribute(new Float32Array(3), 3));
      wagon.castShadow = true;
      this.props.add(wagon);
      this.banners.push({ unit: gen, obj: wagon, kind: 'wagon' });
      const flag = makeBanner({ text: '漢', bg: '#9c2418', fg: '#f6e7bf', height: 11, width: 2.2, clothH: 3.4 });
      this.props.add(flag);
      this.banners.push({ unit: gen, obj: flag, kind: 'flag', ox: -3.2, oz: -3.5 });
      const flag2 = makeBanner({ text: '諸葛', bg: '#e9dfc5', fg: '#3a2418', height: 9, width: 1.5, clothH: 2.8 });
      this.props.add(flag2);
      this.banners.push({ unit: gen, obj: flag2, kind: 'flag', ox: 3.2, oz: -3.5 });
      [-1, 1].forEach((s) => {
        const drum = new THREE.Mesh(this.geos.drum || (this.geos.drum = buildDrum()), makeAnimatedMaterial());
        drum.geometry.setAttribute('aAnim', new THREE.InstancedBufferAttribute(new Float32Array(3), 3));
        drum.castShadow = true;
        this.props.add(drum);
        this.banners.push({ unit: gen, obj: drum, kind: 'drum', ox: s * 5, oz: 3.5 });
      });
    }
  }

  setLabels(entries) {
    for (const l of this.labels) l.obj.parent?.remove(l.obj);
    this.labels = entries.map((e) => {
      const div = document.createElement('div');
      div.className = `scene-label ${e.kind || ''}`;
      div.innerHTML = e.html;
      const obj = new CSS2DObject(div);
      this.scene.add(obj);
      return { ...e, obj, div };
    });
  }

  // —— 每帧 ——
  update(alpha, simT) {
    const b = this.battle;
    if (!b) return;
    for (const p of Object.values(this.pools)) p.n = 0;
    let ringN = 0;
    const ringMat = this.rings;

    for (const u of b.units) {
      const fs = this.figState.get(u.id);
      if (u.fled) continue;
      const x = u.px + (u.x - u.px) * alpha;
      const z = u.pz + (u.z - u.pz) * alpha;
      u.rx = x;
      u.rz = z;
      const target = u.dead ? 0 : Math.ceil(u.men / u.T.menPerFig - 0.35);
      const show = Math.max(0, Math.min(u.T.figs, target));
      const gy = groundHeight(x, z);
      u.ry = gy;
      if (show < fs.shown) this.spawnCorpses(u, fs.shown - show, x, z, gy);
      fs.shown = show;
      if (u.dead || show === 0) continue;

      fs.scatter += ((u.rout ? 1 : 0) - fs.scatter) * 0.02;
      const pool = this.poolFor(u);
      const T = u.T;
      const sh = Math.sin(u.heading);
      const ch = Math.cos(u.heading);
      const moving = u.speed > 0.35;
      const fast = u.speed > T.walk * 1.35;
      const fighting = u.fighting || (u.contacts && u.contacts.length > 0);
      const isGen = T.isGeneral;
      let placed = 0;
      for (let i = 0; i < T.figs && placed < show; i += 1) {
        if (isGen && (i === 5 || i === 6 || i === 9 || i === 10)) continue;
        const col = i % T.cols;
        const row = Math.floor(i / T.cols);
        const k = u.seed + i * 7919;
        const jx = (fract(k * 0.61803) - 0.5) * 0.4;
        const jz = (fract(k * 0.41421) - 0.5) * 0.4;
        let lx = (col - (T.cols - 1) / 2) * T.gap + jx;
        let lz = ((T.rows - 1) / 2 - row) * T.depthGap + jz;
        let hd = u.heading + (fract(k * 0.7071) - 0.5) * 0.14;
        if (fs.scatter > 0.01) {
          const a = fract(k * 0.3183) * Math.PI * 2;
          const r = (2 + fract(k * 0.577) * 6) * fs.scatter;
          lx += Math.cos(a) * r;
          lz += Math.sin(a) * r;
          hd += (fract(k * 0.2718) - 0.5) * 1.6 * fs.scatter;
        }
        const wx = x + ch * lx + sh * lz;
        const wz = z - sh * lx + ch * lz;
        _q.setFromAxisAngle(UP, hd);
        _p.set(wx, gy, wz);
        _m.compose(_p, _q, _s);
        const idx = pool.n;
        if (idx >= pool.max) break;
        pool.mesh.setMatrixAt(idx, _m);
        let st = 0;
        if (u.rout || fast) st = 3;
        else if (fighting && row < 2) st = 2;
        else if (moving) st = 1;
        pool.anim.array[idx * 3] = st;
        pool.anim.array[idx * 3 + 1] = fract(k * 0.123) * 6.28;
        pool.anim.array[idx * 3 + 2] = fract(k * 0.321) * 0.4;
        pool.n += 1;
        placed += 1;
      }

      // 士气环
      const hl = this.highlightGroup && u.side === 0 && u.group === this.highlightGroup;
      if ((this.showRings || hl) && ringN < 400) {
        const r = T.radius + 1.2;
        _m.compose(_p.set(x, gy + 0.15, z), _q.identity(), _s.set(r, 1, r));
        ringMat.setMatrixAt(ringN, _m);
        _s.set(1, 1, 1);
        if (hl) _c.set('#ffd36a');
        else if (u.rout) _c.set(Math.floor(simT * 4) % 2 ? '#ff3b2f' : '#6a1a14');
        else {
          const m = Math.max(0, Math.min(1, u.morale / 100));
          if (u.side === 0) _c.setRGB(1 - m * 0.55, 0.3 + m * 0.55, 0.2);
          else _c.setRGB(0.35 + (1 - m) * 0.6, 0.45 * m + 0.1, 0.4 + m * 0.5);
        }
        ringMat.setColorAt(ringN, _c);
        ringN += 1;
      }

      // 骑兵扬尘
      if (T.cav && u.speed > 3 && Math.random() < 0.35) this.puff(x - sh * 3, gy + 0.6, z - ch * 3, 1.5, u.side === 1 ? 0.55 : 0.45);
      if (fighting && Math.random() < 0.06) this.puff(x + sh * 3, gy + 0.5, z + ch * 3, 1, 0.3);
    }

    for (const p of Object.values(this.pools)) {
      p.mesh.count = p.n;
      p.mesh.instanceMatrix.needsUpdate = true;
      p.anim.needsUpdate = true;
    }
    ringMat.count = ringN;
    ringMat.instanceMatrix.needsUpdate = true;
    if (ringMat.instanceColor) ringMat.instanceColor.needsUpdate = true;

    this.updateBanners(simT);
    this.consumeFx();
    this.updateArrows(simT);
    this.updateDust();
    this.updateLabels();
  }

  poolFor(u) {
    if (u.side === 0) {
      if (u.type === 'xbow') return this.pools.shuXbow;
      if (u.type === 'cav') return this.pools.shuCav;
      if (u.type === 'general') return this.pools.shuOfficer;
      return this.pools.shuSpear;
    }
    if (u.type === 'bow') return this.pools.weiBow;
    return u.type === 'hcav' ? this.pools.weiCav : this.pools.weiInf;
  }

  spawnCorpses(u, count, x, z, gy) {
    const pool = u.T.cav ? (u.side === 0 ? this.corpses.shuHorse : this.corpses.weiHorse) : u.side === 0 ? this.corpses.shu : this.corpses.wei;
    const sh = Math.sin(u.heading);
    const ch = Math.cos(u.heading);
    const T = u.T;
    for (let k = 0; k < count; k += 1) {
      // 阵亡多发生在接敌的前排
      const lx = (Math.random() - 0.5) * T.cols * T.gap;
      const lz = ((T.rows - 1) / 2) * T.depthGap * (u.rout ? Math.random() * 2 - 1 : 0.6 + Math.random() * 0.8);
      const wx = x + ch * lx + sh * lz;
      const wz = z - sh * lx + ch * lz;
      if (T.cav) _e.set(0, Math.random() * 6.28, Math.PI / 2, 'YXZ');
      else _e.set(Math.PI / 2 * (Math.random() < 0.5 ? 1 : -1), Math.random() * 6.28, 0, 'YXZ');
      _q.setFromEuler(_e);
      _p.set(wx, gy + (T.cav ? 0.35 : 0.2), wz);
      _m.compose(_p, _q, _s.set(1, 1, 1));
      const i = pool.cursor % CORPSE_MAX;
      pool.mesh.setMatrixAt(i, _m);
      pool.cursor += 1;
      pool.n = Math.min(CORPSE_MAX, pool.n + 1);
      pool.mesh.count = pool.n;
      pool.mesh.instanceMatrix.needsUpdate = true;
    }
  }

  updateBanners() {
    for (const bn of this.banners) {
      const u = bn.unit;
      const vis = !u.dead && !u.fled && u.rx !== undefined;
      bn.obj.visible = vis;
      if (!vis) continue;
      const sh = Math.sin(u.heading);
      const ch = Math.cos(u.heading);
      let ox = 0;
      let oz = -1.2;
      if (bn.kind === 'flag' || bn.kind === 'drum') {
        ox = bn.ox;
        oz = bn.oz;
      } else if (bn.kind === 'wagon') {
        oz = 0;
      }
      const wx = u.rx + ch * ox + sh * oz;
      const wz = u.rz - sh * ox + ch * oz;
      bn.obj.position.set(wx, groundHeight(wx, wz), wz);
      bn.obj.rotation.y = u.heading + (bn.kind === 'unit' || bn.kind === 'flag' ? Math.PI / 2 + 0.6 : 0);
      // 溃散时旗帜倾倒
      const tilt = u.rout ? 0.9 : 0;
      bn.obj.rotation.z += (tilt - bn.obj.rotation.z) * 0.05;
    }
  }

  updateLabels() {
    for (const l of this.labels) {
      const p = l.pos();
      if (!p) {
        l.obj.visible = false;
        continue;
      }
      l.obj.visible = true;
      l.obj.position.set(p.x, groundHeight(p.x, p.z) + (l.lift || 12), p.z);
      if (l.update) l.update(l.div);
    }
  }

  // —— 箭矢 ——
  initArrows() {
    const geo = new THREE.BoxGeometry(0.035, 0.035, 0.9);
    const mat = new THREE.MeshBasicMaterial({ color: '#2a2016' });
    this.arrowMesh = new THREE.InstancedMesh(geo, mat, 1600);
    this.arrowMesh.frustumCulled = false;
    this.arrowMesh.count = 0;
    this.scene.add(this.arrowMesh);
    this.arrows = Array.from({ length: 1600 }, () => ({ life: 0 }));
    this.arrowCursor = 0;
    this.fxCursor = 0;
  }

  consumeFx() {
    const fx = this.battle.fx;
    // 只处理最近的，避免高倍速时一次涌入太多
    if (fx.length - this.fxCursor > 60) this.fxCursor = fx.length - 60;
    for (; this.fxCursor < fx.length; this.fxCursor += 1) {
      const f = fx[this.fxCursor];
      const a = this.battle.units[f.from];
      const b = this.battle.units[f.to];
      if (!a || !b) continue;
      if (f.kind === 'volley') {
        for (let k = 0; k < 14; k += 1) {
          const ar = this.arrows[this.arrowCursor % this.arrows.length];
          this.arrowCursor += 1;
          ar.x0 = a.x + (Math.random() - 0.5) * 7;
          ar.z0 = a.z + (Math.random() - 0.5) * 7;
          ar.y0 = groundHeight(ar.x0, ar.z0) + 1.6;
          ar.x1 = b.x + (Math.random() - 0.5) * 9;
          ar.z1 = b.z + (Math.random() - 0.5) * 9;
          ar.y1 = groundHeight(ar.x1, ar.z1) + 0.3;
          const d = Math.hypot(ar.x1 - ar.x0, ar.z1 - ar.z0);
          ar.t0 = f.t + Math.random() * 0.25;
          ar.dur = 0.5 + d / 70;
          ar.h = d * 0.22;
          ar.life = 1;
        }
      } else if (f.kind === 'charge') {
        for (let k = 0; k < 6; k += 1) this.puff(b.x + (Math.random() - 0.5) * 6, 0.8, b.z + (Math.random() - 0.5) * 6, 2.2, 0.6);
      }
    }
  }

  updateArrows(simT) {
    let n = 0;
    for (const ar of this.arrows) {
      if (!ar.life) continue;
      const t = (simT - ar.t0) / ar.dur;
      if (t > 1.15 || t < -0.5) {
        if (t > 1.15) ar.life = 0;
        continue;
      }
      if (t < 0) continue;
      const tt = Math.min(t, 1);
      const x = ar.x0 + (ar.x1 - ar.x0) * tt;
      const z = ar.z0 + (ar.z1 - ar.z0) * tt;
      const y = ar.y0 + (ar.y1 - ar.y0) * tt + Math.sin(tt * Math.PI) * ar.h;
      const vy = (ar.y1 - ar.y0) + Math.cos(tt * Math.PI) * Math.PI * ar.h;
      const vh = Math.hypot(ar.x1 - ar.x0, ar.z1 - ar.z0);
      _e.set(-Math.atan2(vy, vh), Math.atan2(ar.x1 - ar.x0, ar.z1 - ar.z0), 0, 'YXZ');
      _q.setFromEuler(_e);
      _m.compose(_p.set(x, y, z), _q, _s.set(1, 1, 1));
      this.arrowMesh.setMatrixAt(n, _m);
      n += 1;
    }
    this.arrowMesh.count = n;
    this.arrowMesh.instanceMatrix.needsUpdate = true;
  }

  // —— 尘土 ——
  initDust() {
    const N = 900;
    this.dustN = N;
    this.dust = Array.from({ length: N }, () => ({ life: 0 }));
    this.dustCursor = 0;
    const geo = new THREE.BufferGeometry();
    this.dustPos = new Float32Array(N * 3);
    this.dustAlpha = new Float32Array(N);
    this.dustSize = new Float32Array(N);
    geo.setAttribute('position', new THREE.BufferAttribute(this.dustPos, 3));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.dustAlpha, 1));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.dustSize, 1));
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { uColor: { value: new THREE.Color('#b7a585') }, uScale: { value: window.innerHeight / 2 } },
      vertexShader: `attribute float aAlpha; attribute float aSize; varying float vA; uniform float uScale;
        void main(){ vA = aAlpha; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = aSize * uScale / -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform vec3 uColor; varying float vA;
        void main(){ vec2 d = gl_PointCoord - 0.5; float r = length(d); if (r > 0.5) discard; float a = smoothstep(0.5, 0.0, r) * vA; gl_FragColor = vec4(uColor, a); }`
    });
    this.dustPoints = new THREE.Points(geo, mat);
    this.dustPoints.frustumCulled = false;
    this.scene.add(this.dustPoints);
  }

  puff(x, y, z, size, alpha) {
    const d = this.dust[this.dustCursor % this.dustN];
    this.dustCursor += 1;
    d.x = x + (Math.random() - 0.5) * 3;
    d.y = groundHeight(x, z) + y;
    d.z = z + (Math.random() - 0.5) * 3;
    d.vx = (Math.random() - 0.5) * 0.05;
    d.vz = (Math.random() - 0.5) * 0.05;
    d.size = size * (3 + Math.random() * 3);
    d.a = alpha;
    d.life = 1;
  }

  updateDust() {
    for (let i = 0; i < this.dustN; i += 1) {
      const d = this.dust[i];
      if (d.life > 0) {
        d.life -= 0.008;
        d.x += d.vx;
        d.z += d.vz;
        d.y += 0.012;
        d.size *= 1.006;
      }
      this.dustPos[i * 3] = d.x || 0;
      this.dustPos[i * 3 + 1] = d.life > 0 ? d.y : -999;
      this.dustPos[i * 3 + 2] = d.z || 0;
      this.dustAlpha[i] = Math.max(0, d.life) * (d.a || 0);
      this.dustSize[i] = d.size || 0;
    }
    const g = this.dustPoints.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.aAlpha.needsUpdate = true;
    g.attributes.aSize.needsUpdate = true;
  }

  resize() {
    this.dustPoints.material.uniforms.uScale.value = window.innerHeight / 2;
  }
}

function fract(x) {
  return x - Math.floor(x);
}
