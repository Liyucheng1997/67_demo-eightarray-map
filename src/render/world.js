// 场景环境：鱼腹浦江畔的平野、三峡群山、长江、天空与光照。
import * as THREE from 'three';
import { animUniforms } from './models.js';

// —— 噪声 ——
function hash(x, y) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
function vnoise(x, y) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi);
  const b = hash(xi + 1, yi);
  const c = hash(xi, yi + 1);
  const d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm(x, y, oct = 5) {
  let f = 0;
  let amp = 0.5;
  let fr = 1;
  for (let i = 0; i < oct; i += 1) {
    f += vnoise(x * fr, y * fr) * amp;
    fr *= 2.03;
    amp *= 0.5;
  }
  return f;
}
const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export const RIVER_X = (z) => 560 + Math.sin(z / 260) * 70 + Math.sin(z / 97) * 14;

export function groundHeight(x, z) {
  const r = Math.hypot(x, z);
  const flat = smooth(330, 820, r);
  let h = (fbm(x * 0.004, z * 0.004, 4) - 0.5) * 2.2; // 战场上轻微起伏
  h += flat * (fbm(x * 0.0022 + 7, z * 0.0022 + 3, 5) * 120 - 30);
  // 江岸
  const dr = x - RIVER_X(z);
  const bank = smooth(150, 30, Math.abs(dr));
  h = h * (1 - bank) + bank * -6;
  if (dr > 0) h = Math.min(h, h * 0.3 + smooth(90, 420, dr) * 180 * fbm(z * 0.004, x * 0.004));
  return h;
}

export function createWorld(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const haze = new THREE.Color('#c9c3ae');
  scene.fog = new THREE.Fog(haze, 380, 2600);
  scene.background = haze;

  const camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.5, 6000);
  camera.position.set(150, 150, 230);

  // —— 光照 ——
  const hemi = new THREE.HemisphereLight('#dfe6ea', '#5d5237', 1.1);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight('#ffe0ad', 2.6);
  sun.position.set(-160, 220, 120);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  const sc = sun.shadow.camera;
  sc.left = -190;
  sc.right = 190;
  sc.top = 190;
  sc.bottom = -190;
  sc.near = 10;
  sc.far = 700;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.6;
  scene.add(sun);
  scene.add(sun.target);

  createSky(scene);
  const ground = createGround(scene);
  createMountains(scene);
  createRiver(scene);
  createScatter(scene);

  return { renderer, scene, camera, sun, ground };
}

function createSky(scene) {
  const geo = new THREE.SphereGeometry(5000, 32, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      top: { value: new THREE.Color('#6f93b4') },
      mid: { value: new THREE.Color('#bfc7c2') },
      bottom: { value: new THREE.Color('#d8ceb2') },
      sunDir: { value: new THREE.Vector3(-160, 220, 120).normalize() }
    },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform vec3 top; uniform vec3 mid; uniform vec3 bottom; uniform vec3 sunDir; varying vec3 vDir;
      void main(){
        float h = vDir.y;
        vec3 c = mix(mid, top, smoothstep(0.02, 0.55, h));
        c = mix(bottom, c, smoothstep(-0.05, 0.06, h));
        float s = max(dot(normalize(vDir), sunDir), 0.0);
        c += vec3(1.0, 0.82, 0.55) * (pow(s, 40.0) * 0.6 + pow(s, 6.0) * 0.12);
        gl_FragColor = vec4(c, 1.0);
      }`
  });
  const sky = new THREE.Mesh(geo, mat);
  sky.renderOrder = -1;
  scene.add(sky);
}

function groundDetailTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(512, 512);
  for (let y = 0; y < 512; y += 1) {
    for (let x = 0; x < 512; x += 1) {
      const n = fbm(x / 22, y / 22, 4) * 0.6 + hash(x, y) * 0.4;
      const v = 180 + n * 75;
      const i = (y * 512 + x) * 4;
      img.data[i] = v;
      img.data[i + 1] = v;
      img.data[i + 2] = v * 0.96;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(220, 220);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function createGround(scene) {
  const size = 3600;
  const seg = 360;
  const geo = new THREE.PlaneGeometry(size, size, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const grass = new THREE.Color('#6d7440');
  const dry = new THREE.Color('#9a8c58');
  const dirt = new THREE.Color('#7b6546');
  const rock = new THREE.Color('#77776c');
  const sand = new THREE.Color('#b5a57c');
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const h = groundHeight(x, z);
    pos.setY(i, h);
    const n = fbm(x * 0.012, z * 0.012, 4);
    const n2 = fbm(x * 0.05 + 11, z * 0.05 - 4, 3);
    c.copy(grass).lerp(dry, smooth(0.42, 0.62, n));
    c.lerp(dirt, smooth(0.62, 0.78, n2) * 0.55);
    // 阵地中央被踩踏过的土地
    const r = Math.hypot(x, z);
    c.lerp(dirt, smooth(240, 60, r) * 0.25 * (0.6 + n2 * 0.6));
    c.lerp(rock, smooth(25, 70, h) * 0.8);
    const dr = Math.abs(x - RIVER_X(z));
    c.lerp(sand, smooth(120, 55, dr));
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, map: groundDetailTexture(), roughness: 0.97, metalness: 0 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}

function createMountains(scene) {
  // 三重山脊，由近到远逐层变淡，营造三峡的层峦
  const layers = [
    { r: 1250, h: 260, color: '#58624a', seed: 1 },
    { r: 1650, h: 420, color: '#6d7a78', seed: 5 },
    { r: 2150, h: 620, color: '#8e9ca3', seed: 9 }
  ];
  layers.forEach((L) => {
    const segA = 220;
    const segH = 6;
    const pos = [];
    const idx = [];
    for (let i = 0; i <= segA; i += 1) {
      const a = (i / segA) * Math.PI * 2;
      const n = fbm(Math.cos(a) * 3 + L.seed, Math.sin(a) * 3 + L.seed, 5);
      const peak = L.h * (0.35 + Math.pow(n, 1.6) * 1.35);
      for (let j = 0; j <= segH; j += 1) {
        const t = j / segH;
        const rr = L.r + (1 - t) * 260 + (fbm(a * 5, t * 3 + L.seed, 3) - 0.5) * 120;
        const y = -40 + peak * Math.pow(t, 0.9) * (0.9 + 0.2 * fbm(a * 12, t * 4, 2));
        pos.push(Math.cos(a) * rr, y, Math.sin(a) * rr);
      }
    }
    for (let i = 0; i < segA; i += 1) {
      for (let j = 0; j < segH; j += 1) {
        const a = i * (segH + 1) + j;
        const b = (i + 1) * (segH + 1) + j;
        idx.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: L.color, roughness: 1, flatShading: true, side: THREE.DoubleSide }));
    scene.add(mesh);
  });
}

function createRiver(scene) {
  const len = 3600;
  const seg = 180;
  const pos = [];
  const idx = [];
  for (let i = 0; i <= seg; i += 1) {
    const z = -len / 2 + (i / seg) * len;
    const cx = RIVER_X(z);
    const w = 95 + Math.sin(z / 180) * 20;
    pos.push(cx - w, -2.4, z, cx + w, -2.4, z);
  }
  for (let i = 0; i < seg; i += 1) {
    const a = i * 2;
    idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ color: '#4d6a66', roughness: 0.25, metalness: 0.2, transparent: true, opacity: 0.92 });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = animUniforms.uTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWorldP;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWorldP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nvarying vec3 vWorldP;')
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        float w1 = sin(vWorldP.z * 0.08 + uTime * 1.6 + sin(vWorldP.x * 0.05) * 2.0);
        float w2 = sin(vWorldP.z * 0.21 - vWorldP.x * 0.13 + uTime * 2.3);
        normal = normalize(normal + vec3(w2 * 0.06, 0.0, w1 * 0.08));`
      );
  };
  const water = new THREE.Mesh(geo, mat);
  water.receiveShadow = true;
  scene.add(water);
}

function createScatter(scene) {
  // 树与石：避开战场中央
  const rand = mulberry(42);
  const trunkGeo = new THREE.CylinderGeometry(0.25, 0.4, 3, 5);
  trunkGeo.translate(0, 1.5, 0);
  const crownGeo = new THREE.IcosahedronGeometry(2.6, 0);
  crownGeo.translate(0, 4.8, 0);
  const pineGeo = new THREE.ConeGeometry(2.2, 7, 6);
  pineGeo.translate(0, 5.5, 0);
  const rockGeo = new THREE.DodecahedronGeometry(1.4, 0);
  const n = 900;
  const trunk = new THREE.InstancedMesh(trunkGeo, new THREE.MeshStandardMaterial({ color: '#4a3726', roughness: 1 }), n);
  const crown = new THREE.InstancedMesh(crownGeo, new THREE.MeshStandardMaterial({ color: '#4c5c30', roughness: 1, flatShading: true }), n);
  const pine = new THREE.InstancedMesh(pineGeo, new THREE.MeshStandardMaterial({ color: '#3a4a2e', roughness: 1, flatShading: true }), n);
  const rocks = new THREE.InstancedMesh(rockGeo, new THREE.MeshStandardMaterial({ color: '#7c7a6e', roughness: 1, flatShading: true }), 500);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const col = new THREE.Color();
  let ti = 0;
  let ci = 0;
  let pi = 0;
  for (let k = 0; k < n; k += 1) {
    // 成簇分布
    const a = rand() * Math.PI * 2;
    const r = 340 + Math.pow(rand(), 0.7) * 820;
    const x = Math.cos(a) * r + (rand() - 0.5) * 60;
    const z = Math.sin(a) * r + (rand() - 0.5) * 60;
    if (fbm(x * 0.006, z * 0.006, 3) < 0.45) continue;
    if (Math.abs(x - RIVER_X(z)) < 110) continue;
    const y = groundHeight(x, z);
    const s = 0.7 + rand() * 0.9;
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand() * 6.28);
    m.compose(new THREE.Vector3(x, y - 0.2, z), q, new THREE.Vector3(s, s * (0.8 + rand() * 0.5), s));
    trunk.setMatrixAt(ti, m);
    ti += 1;
    if (rand() < 0.45 || y > 30) {
      pine.setMatrixAt(pi, m);
      col.setHSL(0.24 + rand() * 0.05, 0.25, 0.22 + rand() * 0.06);
      pine.setColorAt(pi, col);
      pi += 1;
    } else {
      crown.setMatrixAt(ci, m);
      col.setHSL(0.18 + rand() * 0.08, 0.3, 0.26 + rand() * 0.08);
      crown.setColorAt(ci, col);
      ci += 1;
    }
  }
  trunk.count = ti;
  crown.count = ci;
  pine.count = pi;
  let ri = 0;
  for (let k = 0; k < 1500 && ri < 500; k += 1) {
    const x = (rand() - 0.5) * 1600;
    const z = (rand() - 0.5) * 1600;
    const rr = Math.hypot(x, z);
    if (rr < 260) continue;
    const y = groundHeight(x, z);
    const s = 0.5 + rand() * rand() * 3;
    q.setFromEuler(new THREE.Euler(rand() * 3, rand() * 3, rand() * 3));
    m.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(s, s * 0.7, s));
    rocks.setMatrixAt(ri, m);
    ri += 1;
  }
  rocks.count = ri;
  [trunk, crown, pine, rocks].forEach((mesh) => {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
  });

  // 近处草丛
  const blade = new THREE.ConeGeometry(0.12, 0.7, 3);
  blade.translate(0, 0.35, 0);
  const grassN = 9000;
  const grass = new THREE.InstancedMesh(blade, new THREE.MeshStandardMaterial({ color: '#7d8448', roughness: 1 }), grassN);
  let gi = 0;
  for (let k = 0; k < grassN; k += 1) {
    const a = rand() * Math.PI * 2;
    const r = 60 + Math.sqrt(rand()) * 380;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (fbm(x * 0.03, z * 0.03, 2) < 0.48) continue;
    const s = 0.6 + rand() * 1.2;
    q.setFromEuler(new THREE.Euler((rand() - 0.5) * 0.5, rand() * 6, (rand() - 0.5) * 0.5));
    m.compose(new THREE.Vector3(x, groundHeight(x, z), z), q, new THREE.Vector3(s, s, s));
    grass.setMatrixAt(gi, m);
    col.setHSL(0.15 + rand() * 0.07, 0.35, 0.3 + rand() * 0.15);
    grass.setColorAt(gi, col);
    gi += 1;
  }
  grass.count = gi;
  grass.receiveShadow = true;
  scene.add(grass);
}

export function mulberry(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
