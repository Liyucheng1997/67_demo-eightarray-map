import './styles.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CSS2DObject, CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { createIcons, Play, Pause, RotateCcw, Shield, Route, Eye, RefreshCw, Compass, ChevronsUp } from 'lucide';

const formations = [
  {
    id: 'sky',
    name: '天覆阵',
    short: '天覆',
    angle: 90,
    color: 0xdca24c,
    description: '位于北上方，阵列外宽内收，像天幕覆盖正面，用来压迫敌军视野并遮蔽中军调度。',
    structure: '三层弧形队列形成覆盖面，前列牵制，后列保留机动空隙。',
    power: '通过宽正面与高位观察制造压力，让敌人难以判断主攻方向。'
  },
  {
    id: 'earth',
    name: '地载阵',
    short: '地载',
    angle: 270,
    color: 0x87956b,
    description: '位于南下方，方整厚重，承担承托与稳固防线的任务，是阵图的地基。',
    structure: '密集方阵与低矮屏障交错，便于吸收冲击并保护后续通道。',
    power: '把敌军突击消耗在厚阵上，为侧翼和预备队争取反击时间。'
  },
  {
    id: 'wind',
    name: '风扬阵',
    short: '风扬',
    angle: 45,
    color: 0x4ca09b,
    description: '位于东北，队列疏密变化明显，表现快速扰动和诱导敌军转向。',
    structure: '轻兵小队沿斜向布置，留出多条穿插线和撤退线。',
    power: '以速度、扰袭和假动作牵动敌阵，使敌人阵脚松动。'
  },
  {
    id: 'cloud',
    name: '云垂阵',
    short: '云垂',
    angle: 135,
    color: 0xa678b4,
    description: '位于西北，层层下垂，像云气遮挡山谷，擅长隐蔽兵力和延缓追击。',
    structure: '外层松散、内层紧密，形成虚实不定的缓冲区。',
    power: '用遮蔽与纵深让敌人看不清兵力厚薄，从而降低其判断质量。'
  },
  {
    id: 'dragon',
    name: '龙飞阵',
    short: '龙飞',
    angle: 0,
    color: 0x5fa66c,
    description: '位于东方，阵列前后起伏，象征长龙抬首，是主动突击和穿插方向。',
    structure: '楔形前锋连接蛇形纵队，便于突破后继续扩大缺口。',
    power: '把力量集中到一点打穿，再让后队沿通道跟进。'
  },
  {
    id: 'tiger',
    name: '虎翼阵',
    short: '虎翼',
    angle: 180,
    color: 0xc95f47,
    description: '位于西方，两翼张开，重点表现夹击、包抄和侧向威慑。',
    structure: '左右翼呈钳形张开，中心留空诱敌深入。',
    power: '诱使敌军进入翼侧火力区，再用两翼同时压缩其退路。'
  },
  {
    id: 'bird',
    name: '鸟翔阵',
    short: '鸟翔',
    angle: 315,
    color: 0xe0c85f,
    description: '位于东南，形态轻灵，适合侦察、传令、迂回和追击。',
    structure: '小队呈羽翼状展开，间距更大，速度优先于厚度。',
    power: '扩大感知半径，确保主阵能提前发现敌军变化并快速调整。'
  },
  {
    id: 'snake',
    name: '蛇蟠阵',
    short: '蛇蟠',
    angle: 225,
    color: 0x6f8fb5,
    description: '位于西南，曲折盘绕，强调转折、牵制和局部伏击。',
    structure: '连续折线队列连接多个小节点，前后能互相补位。',
    power: '让敌军推进路线变长、变窄、变乱，并暴露侧面。'
  }
];

const centerFormation = {
  id: 'center',
  name: '中军枢纽',
  short: '中军',
  description: '中军位于八阵图核心，负责号令、观察与预备队调度。外层八阵像齿轮一样围绕它展开。',
  structure: '中心台、旗鼓、预备队和四向通道共同构成指挥枢纽。',
  power: '真正的威力来自统一指挥：外阵变化很多，但节奏由中心控制。'
};

const appState = {
  selected: 'center',
  mode: 'layout',
  running: true,
  time: 0
};

const canvas = document.querySelector('#formation-canvas');
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x171612, 0.012);

const camera = new THREE.PerspectiveCamera(48, window.innerWidth / window.innerHeight, 0.1, 600);
camera.position.set(34, 34, 44);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const labelRenderer = new CSS2DRenderer();
labelRenderer.setSize(window.innerWidth, window.innerHeight);
labelRenderer.domElement.style.position = 'fixed';
labelRenderer.domElement.style.inset = '0';
labelRenderer.domElement.style.pointerEvents = 'none';
document.body.appendChild(labelRenderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 22;
controls.maxDistance = 92;
controls.maxPolarAngle = Math.PI * 0.48;
controls.target.set(0, 0, 0);

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const selectable = [];
const formationGroups = new Map();
const pulseLines = [];

const materials = {
  terrain: new THREE.MeshStandardMaterial({ color: 0x242015, roughness: 0.92, metalness: 0.02 }),
  route: new THREE.MeshStandardMaterial({ color: 0x2e7873, emissive: 0x123a38, roughness: 0.55 }),
  command: new THREE.MeshStandardMaterial({ color: 0xe3b154, emissive: 0x533511, roughness: 0.48 }),
  inactive: new THREE.MeshStandardMaterial({ color: 0x6f735f, roughness: 0.8 }),
  barrier: new THREE.MeshStandardMaterial({ color: 0x4c4432, roughness: 0.9 }),
  support: new THREE.LineBasicMaterial({ color: 0xc95f47, transparent: true, opacity: 0.56 })
};

initScene();
bindUi();
selectFormation('center');
animate();

function initScene() {
  scene.add(new THREE.AmbientLight(0xf0dec0, 1.45));

  const sun = new THREE.DirectionalLight(0xffd98d, 2.2);
  sun.position.set(28, 42, 20);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -55;
  sun.shadow.camera.right = 55;
  sun.shadow.camera.top = 55;
  sun.shadow.camera.bottom = -55;
  scene.add(sun);

  const rim = new THREE.DirectionalLight(0x76b8aa, 0.95);
  rim.position.set(-34, 18, -28);
  scene.add(rim);

  createTerrain();
  createCenter();
  createRoutes();
  createFormations();
  createSupportLines();
}

function createTerrain() {
  const geometry = new THREE.CircleGeometry(58, 128);
  const terrain = new THREE.Mesh(geometry, materials.terrain);
  terrain.rotation.x = -Math.PI / 2;
  terrain.receiveShadow = true;
  scene.add(terrain);

  const ringMaterial = new THREE.LineBasicMaterial({ color: 0x7f6d45, transparent: true, opacity: 0.42 });
  [13, 24, 35, 48].forEach((radius) => {
    const ring = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(makeCirclePoints(radius, 160)),
      ringMaterial
    );
    ring.position.y = 0.035;
    scene.add(ring);
  });

  const gridMaterial = new THREE.LineBasicMaterial({ color: 0x514934, transparent: true, opacity: 0.28 });
  for (let i = 0; i < 8; i += 1) {
    const angle = (i * Math.PI) / 4;
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(Math.cos(angle) * 8, 0.05, Math.sin(angle) * 8),
        new THREE.Vector3(Math.cos(angle) * 55, 0.05, Math.sin(angle) * 55)
      ]),
      gridMaterial
    );
    scene.add(line);
  }
}

function createCenter() {
  const group = new THREE.Group();
  group.userData.id = 'center';

  const platform = new THREE.Mesh(new THREE.CylinderGeometry(6.8, 7.6, 1.2, 8), materials.command);
  platform.position.y = 0.6;
  platform.castShadow = true;
  platform.receiveShadow = true;
  group.add(platform);

  const tower = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.45, 5.8, 8), materials.command);
  tower.position.y = 3.8;
  tower.castShadow = true;
  group.add(tower);

  const flagPole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 8, 8), materials.barrier);
  flagPole.position.set(0, 7.3, 0);
  group.add(flagPole);

  const flag = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 1.8), new THREE.MeshStandardMaterial({
    color: 0xc95f47,
    side: THREE.DoubleSide,
    roughness: 0.6,
    emissive: 0x3a120c
  }));
  flag.position.set(1.85, 8.3, 0);
  flag.rotation.y = -Math.PI / 2;
  group.add(flag);

  const label = createLabel('中军');
  label.position.set(0, 9.4, 0);
  group.add(label);

  group.traverse((child) => {
    child.userData.id = 'center';
    if (child.isMesh) selectable.push(child);
  });
  formationGroups.set('center', group);
  scene.add(group);
}

function createRoutes() {
  formations.forEach((formation) => {
    const angle = degreesToRadians(formation.angle);
    const route = new THREE.Mesh(
      new THREE.BoxGeometry(2.15, 0.12, 34),
      materials.route
    );
    route.position.set(Math.cos(angle) * 21, 0.09, Math.sin(angle) * 21);
    route.rotation.y = -angle;
    route.userData.id = formation.id;
    route.receiveShadow = true;
    selectable.push(route);
    scene.add(route);
  });
}

function createFormations() {
  formations.forEach((formation) => {
    const group = new THREE.Group();
    group.userData.id = formation.id;

    const angle = degreesToRadians(formation.angle);
    const position = new THREE.Vector3(Math.cos(angle) * 34, 0, Math.sin(angle) * 34);
    group.position.copy(position);
    group.rotation.y = -angle + Math.PI / 2;

    const mat = new THREE.MeshStandardMaterial({
      color: formation.color,
      roughness: 0.62,
      metalness: 0.03,
      emissive: formation.color,
      emissiveIntensity: 0.08
    });

    addFormationBlocks(group, formation, mat);
    addFormationLabel(group, formation.short);

    group.traverse((child) => {
      child.userData.id = formation.id;
      if (child.isMesh) selectable.push(child);
    });
    formationGroups.set(formation.id, group);
    scene.add(group);
  });
}

function addFormationBlocks(group, formation, material) {
  const block = new THREE.BoxGeometry(1.55, 1.2, 1.55);
  const spear = new THREE.ConeGeometry(0.45, 1.55, 4);
  const positions = buildPattern(formation.id);

  positions.forEach((pos, index) => {
    const height = 0.76 + (index % 3) * 0.18;
    const soldier = new THREE.Mesh(block, material);
    soldier.scale.y = height;
    soldier.position.set(pos.x, 0.62 * height, pos.z);
    soldier.castShadow = true;
    soldier.receiveShadow = true;
    group.add(soldier);

    if (index % 3 === 0) {
      const head = new THREE.Mesh(spear, material);
      head.position.set(pos.x, 1.76 * height, pos.z);
      head.rotation.y = Math.PI / 4;
      head.castShadow = true;
      group.add(head);
    }
  });

  const wallGeometry = new THREE.BoxGeometry(13.8, 0.7, 0.6);
  [-5.6, 5.6].forEach((z) => {
    const wall = new THREE.Mesh(wallGeometry, materials.barrier);
    wall.position.set(0, 0.35, z);
    wall.castShadow = true;
    wall.receiveShadow = true;
    group.add(wall);
  });
}

function buildPattern(id) {
  if (id === 'dragon') return makeWedgePattern(6, 3.2);
  if (id === 'tiger') return makeWingsPattern();
  if (id === 'snake') return makeSnakePattern();
  if (id === 'bird') return makeBirdPattern();
  if (id === 'wind') return makeDiagonalPattern(1);
  if (id === 'cloud') return makeCloudPattern();
  if (id === 'earth') return makeDensePattern();
  return makeArcPattern();
}

function makeDensePattern() {
  const result = [];
  for (let x = -4; x <= 4; x += 2) {
    for (let z = -4; z <= 4; z += 2) result.push({ x, z });
  }
  return result;
}

function makeArcPattern() {
  const result = [];
  [-5, -2.5, 0, 2.5, 5].forEach((x) => {
    [-3.5, 0, 3.5].forEach((z) => result.push({ x, z: z + Math.abs(x) * 0.16 }));
  });
  return result;
}

function makeDiagonalPattern(direction) {
  const result = [];
  for (let i = -4; i <= 4; i += 2) {
    result.push({ x: i, z: i * 0.7 * direction });
    result.push({ x: i + 0.7, z: i * 0.7 * direction + 2.2 });
  }
  return result;
}

function makeCloudPattern() {
  const result = [];
  const rows = [
    [-4, -2, 0, 2, 4],
    [-3, -1, 1, 3],
    [-5, -2.5, 0, 2.5, 5]
  ];
  rows.forEach((row, zi) => row.forEach((x) => result.push({ x, z: zi * 2.6 - 3 })));
  return result;
}

function makeWedgePattern(rows, spacing) {
  const result = [];
  for (let row = 0; row < rows; row += 1) {
    const count = row + 1;
    for (let i = 0; i < count; i += 1) {
      result.push({ x: (i - (count - 1) / 2) * spacing, z: row * 1.85 - 4.2 });
    }
  }
  return result;
}

function makeWingsPattern() {
  const result = [];
  for (let i = 0; i < 6; i += 1) {
    result.push({ x: -i * 1.35, z: -4 + i * 1.2 });
    result.push({ x: i * 1.35, z: -4 + i * 1.2 });
    if (i < 3) result.push({ x: (i - 1) * 1.8, z: 1.8 });
  }
  return result;
}

function makeBirdPattern() {
  const result = [];
  for (let i = -5; i <= 5; i += 2) {
    result.push({ x: i, z: Math.abs(i) * 0.75 - 4.2 });
    result.push({ x: i * 0.72, z: Math.abs(i) * 0.35 - 0.6 });
  }
  return result;
}

function makeSnakePattern() {
  return [
    { x: -5, z: -4 }, { x: -3, z: -2.2 }, { x: -1, z: -3.4 }, { x: 1, z: -1.4 },
    { x: 3, z: -2.2 }, { x: 5, z: 0 }, { x: 3, z: 2.2 }, { x: 1, z: 1 },
    { x: -1, z: 3.2 }, { x: -3, z: 2.2 }, { x: -5, z: 4 }
  ];
}

function addFormationLabel(group, text) {
  const label = createLabel(text);
  label.position.set(0, 4.2, 0);
  group.add(label);
}

function createSupportLines() {
  const ids = formations.map((formation) => formation.id);
  ids.forEach((id, index) => {
    const current = formationGroups.get(id).position;
    const next = formationGroups.get(ids[(index + 1) % ids.length]).position;
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(current.x * 0.92, 0.18, current.z * 0.92),
        new THREE.Vector3(next.x * 0.92, 0.18, next.z * 0.92)
      ]),
      materials.support.clone()
    );
    line.userData.ids = [id, ids[(index + 1) % ids.length]];
    pulseLines.push(line);
    scene.add(line);
  });
}

function createLabel(text) {
  const div = document.createElement('div');
  div.className = 'scene-label';
  div.textContent = text;
  return new CSS2DObject(div);
}

function makeCirclePoints(radius, count) {
  const points = [];
  for (let i = 0; i < count; i += 1) {
    const angle = (i / count) * Math.PI * 2;
    points.push(new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius));
  }
  return points;
}

function bindUi() {
  createIcons({ icons: { Play, Pause, RotateCcw, Shield, Route, Eye, RefreshCw, Compass, ChevronsUp } });

  document.querySelectorAll('.formation-chip').forEach((button) => {
    button.addEventListener('click', () => selectFormation(button.dataset.formation));
  });

  document.querySelectorAll('.mode-tab').forEach((button) => {
    button.addEventListener('click', () => {
      appState.mode = button.dataset.mode;
      document.querySelectorAll('.mode-tab').forEach((tab) => tab.classList.toggle('is-active', tab === button));
      updateDetails();
    });
  });

  document.querySelector('#resetView').addEventListener('click', () => {
    camera.position.set(34, 34, 44);
    controls.target.set(0, 0, 0);
    controls.update();
  });

  document.querySelector('#toggleMotion').addEventListener('click', (event) => {
    appState.running = !appState.running;
    event.currentTarget.classList.toggle('is-active', appState.running);
    event.currentTarget.innerHTML = appState.running ? '<i data-lucide="play"></i>' : '<i data-lucide="pause"></i>';
    createIcons({ icons: { Play, Pause } });
  });

  renderer.domElement.addEventListener('pointerdown', handlePointer);
  window.addEventListener('resize', handleResize);
}

function handlePointer(event) {
  pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
  pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(selectable, false);
  if (hits[0]?.object?.userData?.id) {
    selectFormation(hits[0].object.userData.id);
  }
}

function selectFormation(id) {
  appState.selected = id;
  const formation = getFormation(id);

  document.querySelector('#formationName').textContent = formation.name;
  document.querySelector('#formationDescription').textContent = formation.description;
  document.querySelector('#formationKicker').textContent = id === 'center' ? '核心指挥' : '当前阵位';

  document.querySelectorAll('.formation-chip').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.formation === id);
  });

  formationGroups.forEach((group, groupId) => {
    const active = groupId === id || id === 'center';
    group.traverse((child) => {
      if (child.isMesh && child.material?.emissive) {
        child.material.emissiveIntensity = active ? 0.22 : 0.035;
      }
      if (child.isCSS2DObject) child.element.style.opacity = active ? '1' : '0.45';
    });
  });

  pulseLines.forEach((line) => {
    const linked = line.userData.ids.includes(id) || id === 'center';
    line.material.opacity = linked ? 0.82 : 0.18;
  });

  const target = id === 'center' ? new THREE.Vector3(0, 0, 0) : formationGroups.get(id).position;
  controls.target.lerp(target, 0.65);
  updateDetails();
}

function updateDetails() {
  const panel = document.querySelector('#detailsPanel');
  const formation = getFormation(appState.selected);
  const content = {
    layout: [
      ['Compass', '分布逻辑', appState.selected === 'center'
        ? '中军居中，八阵按方位环绕，形成能进能退的闭环。'
        : `${formation.short}位于八方之一，与相邻阵位通过外圈互援线连接。`],
      ['Route', '通道设计', '放射通道把中军命令、预备兵力和撤退路线连接到每个阵位。']
    ],
    structure: [
      ['Shield', '阵列结构', formation.structure],
      ['RefreshCw', '层级轮换', '前列接敌，后列补位，中心预备队随战况填补薄弱处。']
    ],
    power: [
      ['ChevronsUp', '威力来源', formation.power],
      ['Eye', '核心判断', '八阵图并不是神秘图案本身取胜，而是把地形、视野、机动、互援和指挥节奏组织成一个系统。']
    ]
  }[appState.mode];

  panel.innerHTML = content.map(([icon, title, body]) => `
    <article class="detail-row">
      <i data-lucide="${icon}"></i>
      <div>
        <h3>${title}</h3>
        <p>${body}</p>
      </div>
    </article>
  `).join('');
  createIcons({ icons: { Shield, Route, Eye, RefreshCw, Compass, ChevronsUp } });
}

function getFormation(id) {
  if (id === 'center') return centerFormation;
  return formations.find((formation) => formation.id === id) ?? centerFormation;
}

function handleResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  labelRenderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
  requestAnimationFrame(animate);
  const delta = appState.running ? 0.016 : 0;
  appState.time += delta;

  formationGroups.forEach((group, id) => {
    if (id === 'center') {
      group.rotation.y += delta * 0.12;
      return;
    }
    const selected = appState.selected === id || appState.selected === 'center';
    group.position.y = selected ? Math.sin(appState.time * 2.3 + group.position.x) * 0.08 : 0;
  });

  pulseLines.forEach((line, index) => {
    const wave = (Math.sin(appState.time * 3 + index * 0.7) + 1) / 2;
    const selected = line.userData.ids.includes(appState.selected) || appState.selected === 'center';
    line.material.opacity = selected ? 0.48 + wave * 0.38 : 0.14;
  });

  controls.update();
  renderer.render(scene, camera);
  labelRenderer.render(scene, camera);
}

function degreesToRadians(degrees) {
  return (degrees / 180) * Math.PI;
}
