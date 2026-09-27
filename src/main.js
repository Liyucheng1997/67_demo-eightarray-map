import './styles.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import {
  createIcons,
  Grid3x3,
  Mountain,
  ScanEye,
  Crosshair,
  Tag,
  CircleDot,
  RefreshCw,
  Swords,
  RotateCcw,
  Pause,
  Play
} from 'lucide';
import { createWorld, groundHeight } from './render/world.js';
import { ArmyRenderer } from './render/army.js';
import { animUniforms } from './render/models.js';
import { Battle } from './sim/battle.js';
import { C } from './sim/data.js';
import { FORMATIONS, FORMATION_ORDER, BAZHEN_GROUPS } from './sim/formations.js';
import { SCENARIOS, SCENARIO_ORDER } from './sim/scenarios.js';
import { GROUP_LORE, DOCTRINES } from './lore.js';
import precomputed from './sim/results.json';

const ICONS = { Grid3x3, Mountain, ScanEye, Crosshair, Tag, CircleDot, RefreshCw, Swords, RotateCcw, Pause, Play };
const $ = (s) => document.querySelector(s);

// ———————————————————— 场景 ————————————————————
const canvas = $('#scene');
const { renderer, scene, camera, sun, ground } = createWorld(canvas);
const labelRenderer = new CSS2DRenderer();
labelRenderer.setSize(window.innerWidth, window.innerHeight);
labelRenderer.domElement.className = 'label-layer';
document.body.appendChild(labelRenderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.07;
controls.minDistance = 12;
controls.maxDistance = 900;
controls.maxPolarAngle = Math.PI * 0.47;
controls.target.set(0, 0, 0);

const army = new ArmyRenderer(scene);
const gridOverlay = createGridOverlay();

const state = {
  formation: 'bazhen',
  scenario: 'frontal',
  seed: 11,
  speed: 3,
  playing: false,
  battle: null,
  acc: 0,
  labels: true,
  follow: false,
  logCursor: 0,
  selectedGroup: null,
  lastResultShown: false,
  camTween: null,
  results: precomputed
};

// ———————————————————— 战斗 ————————————————————
function newBattle() {
  clearMarkers();
  const b = new Battle({ formation: state.formation, scenario: state.scenario, seed: state.seed });
  state.battle = b;
  state.playing = false;
  state.acc = 0;
  state.logCursor = 0;
  state.lastResultShown = false;
  army.setBattle(b, FORMATIONS[state.formation].groups);
  army.update(1, 0);
  buildLabels();
  $('#log').innerHTML = '';
  $('#result').hidden = true;
  $('#tip').hidden = true;
  $('#shuForm').textContent = FORMATIONS[state.formation].name;
  $('#weiForm').textContent = SCENARIOS[state.scenario].name;
  updatePlayButton();
  updateHud(true);
}

function startOrPause() {
  const b = state.battle;
  if (b.over) {
    newBattle();
    state.playing = true;
  } else {
    state.playing = !state.playing;
  }
  if (state.playing && state.selectedGroup) selectGroup(null);
  updatePlayButton();
}

function updatePlayButton() {
  const btn = $('#playBtn');
  const b = state.battle;
  let icon = 'swords';
  let text = '开战';
  if (state.playing) {
    icon = 'pause';
    text = '暂停';
  } else if (b && b.t > 0 && !b.over) {
    icon = 'play';
    text = '继续';
  } else if (b && b.over) {
    icon = 'rotate-ccw';
    text = '再战';
  }
  btn.innerHTML = `<i data-lucide="${icon}"></i><span>${text}</span>`;
  btn.classList.toggle('is-live', state.playing);
  btn.setAttribute('aria-label', text);
  createIcons({ icons: ICONS });
}

// ———————————————————— 标注 ————————————————————
function groupCentroid(filter) {
  return () => {
    let x = 0;
    let z = 0;
    let n = 0;
    for (const u of state.battle.units) {
      if (u.dead || u.fled || u.rout || !filter(u)) continue;
      x += u.rx ?? u.x;
      z += u.rz ?? u.z;
      n += 1;
    }
    return n ? { x: x / n, z: z / n } : null;
  };
}

function buildLabels() {
  clearMarkers();
  const b = state.battle;
  const entries = [];
  if (state.labels) {
    const groups = FORMATIONS[state.formation].groups;
    const seen = new Set(b.units.filter((u) => u.side === 0).map((u) => u.group));
    for (const gid of seen) {
      const g = groups[gid];
      if (!g) continue;
      const kind = g.kind ? `<span>${g.kind}${g.place ? ' · ' + g.place : ''}</span>` : '';
      entries.push({
        html: `<b style="--c:${g.color}">${g.name}</b>${kind}`,
        kind: 'shu',
        lift: gid === 'you' ? 7 : 13,
        pos: groupCentroid((u) => u.side === 0 && u.group === gid)
      });
    }
    b.enemyGroups.forEach((g) => {
      entries.push({ html: `<b>${g.name}</b>`, kind: 'wei', lift: 11, pos: groupCentroid((u) => u.eg === g) });
    });
  }
  army.setLabels(entries);
}

// 九宫格地面标线（八阵图时显示）
function createGridOverlay() {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(9 * 8 * 3 * 2);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.LineBasicMaterial({ color: '#f1d28b', transparent: true, opacity: 0.55, depthWrite: false, fog: false });
  const lines = new THREE.LineSegments(geo, mat);
  lines.frustumCulled = false;
  lines.renderOrder = 3;
  scene.add(lines);
  return lines;
}

function updateGridOverlay() {
  const b = state.battle;
  const show = state.labels && state.formation === 'bazhen';
  gridOverlay.visible = show;
  if (!show) return;
  const pos = gridOverlay.geometry.attributes.position.array;
  let k = 0;
  const cells = [];
  for (let i = -1; i <= 1; i += 1) for (let j = -1; j <= 1; j += 1) cells.push([i, j]);
  const P = 48 * b.spread;
  const half = 16;
  const push = (x, z) => {
    pos[k] = x;
    pos[k + 1] = groundHeight(x, z) + 0.25;
    pos[k + 2] = z;
    k += 3;
  };
  for (const [ci, cj] of cells) {
    const corners = [
      [-half, -half],
      [half, -half],
      [half, half],
      [-half, half]
    ].map(([dx, df]) => b.toWorld(ci * P + dx, cj * P + df));
    // 虚线式：每条边画一段
    for (let e = 0; e < 4; e += 1) {
      const a = corners[e];
      const c = corners[(e + 1) % 4];
      push(a.x, a.z);
      push(c.x, c.z);
    }
  }
  gridOverlay.geometry.setDrawRange(0, k / 3);
  gridOverlay.geometry.attributes.position.needsUpdate = true;
}

// ———————————————————— 面板：阵法 ————————————————————
function renderLore() {
  const chips = $('#groupChips');
  const order = ['tian', 'di', 'feng', 'yun', 'long', 'hu', 'niao', 'she', 'zhong', 'you'];
  chips.innerHTML = order
    .map((id) => {
      const g = BAZHEN_GROUPS[id];
      return `<button class="chip" data-group="${id}" type="button" style="--c:${g.color}"><b>${g.short}</b>${g.name}</button>`;
    })
    .join('');
  chips.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-group]');
    if (!btn) return;
    const id = btn.dataset.group;
    selectGroup(state.selectedGroup === id ? null : id);
  });
  $('#doctrines').innerHTML = DOCTRINES.map(
    (d) => `<article class="doctrine"><h4><span>${d.quote}</span>${d.title}</h4><p>${d.body}</p><p class="in-sim"><b>推演中：</b>${d.sim}</p></article>`
  ).join('');
  renderGroupCard(null);
}

function renderGroupCard(id) {
  const card = $('#groupCard');
  if (!id) {
    card.innerHTML = `<p class="muted">点选上面任意一阵，场景中会高亮它的各队，并说明它在阵中的职责。也可以直接在三维场景里悬停查看每一队的兵力、士气与疲劳。</p>`;
    return;
  }
  const g = BAZHEN_GROUPS[id];
  const lore = GROUP_LORE[id];
  card.innerHTML = `
    <div class="card-head"><span class="seal" style="--c:${g.color}">${g.short}</span>
      <div><h3>${g.name}</h3><p class="muted">${g.kind}${g.place ? ' · ' + g.place : ''} · ${lore.force}</p></div></div>
    <p>${lore.desc}</p>
    <p class="in-sim"><b>推演中：</b>${lore.sim}</p>`;
}

function selectGroup(id) {
  state.selectedGroup = id;
  document.querySelectorAll('#groupChips .chip').forEach((c) => c.classList.toggle('is-active', c.dataset.group === id));
  renderGroupCard(id);
  army.highlightGroup = id;
  if (id) {
    if (state.formation !== 'bazhen') {
      state.formation = 'bazhen';
      syncPickers();
      newBattle();
    }
    const p = groupCentroid((u) => u.side === 0 && u.group === id)();
    if (p) flyTo(p, 95, 0.95);
  }
}

// ———————————————————— 面板：推演 ————————————————————
function renderPickers() {
  $('#formationPick').innerHTML = FORMATION_ORDER.map(
    (id) => `<button class="pick" data-formation="${id}" type="button"><b>${FORMATIONS[id].name}</b><span>${FORMATIONS[id].tag.split(' · ').slice(-1)[0]}</span></button>`
  ).join('');
  $('#scenarioPick').innerHTML = SCENARIO_ORDER.map(
    (id) => `<button class="pick" data-scenario="${id}" type="button"><b>${SCENARIOS[id].name}</b></button>`
  ).join('');
  $('#formationPick').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-formation]');
    if (!btn) return;
    state.formation = btn.dataset.formation;
    if (state.formation !== 'bazhen') selectGroup(null);
    syncPickers();
    newBattle();
  });
  $('#scenarioPick').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-scenario]');
    if (!btn) return;
    state.scenario = btn.dataset.scenario;
    syncPickers();
    newBattle();
  });
  syncPickers();
}

function syncPickers() {
  document.querySelectorAll('[data-formation]').forEach((b) => b.classList.toggle('is-active', b.dataset.formation === state.formation));
  document.querySelectorAll('[data-scenario]').forEach((b) => b.classList.toggle('is-active', b.dataset.scenario === state.scenario));
  const f = FORMATIONS[state.formation];
  $('#formationCard').innerHTML = `
    <p class="muted">${f.tag}</p>
    <p>${f.summary}</p>
    <ul class="pros">${f.strengths.map((s) => `<li>${s}</li>`).join('')}</ul>
    <ul class="cons">${f.weaknesses.map((s) => `<li>${s}</li>`).join('')}</ul>`;
  $('#scenarioBrief').textContent = SCENARIOS[state.scenario].brief;
}

const STAT_ROWS = [
  ['rotations', '队内轮换', '疲惫之队退入阵内，生力之队顶上'],
  ['groupRotations', '整阵轮换', '后阵穿过通道接替前阵'],
  ['sallies', '奇兵出击', '四奇阵出兵侧击'],
  ['traps', '通道夹击', '敌入阵间通道，两面受击'],
  ['braced', '骑撞枪林', '敌骑正面撞上枪阵'],
  ['charges', '骑兵冲击', '双方骑兵冲入敌队次数']
];

function updateHud(force = false) {
  const b = state.battle;
  const m0 = b.sideMen(0, true);
  const m1 = b.sideMen(1, true);
  const f0 = b.sideMen(0);
  const f1 = b.sideMen(1);
  $('#shuBar').style.width = `${(m0 / b.initialMen[0]) * 100}%`;
  $('#weiBar').style.width = `${(m1 / b.initialMen[1]) * 100}%`;
  $('#shuBar').style.setProperty('--formed', `${(f0 / Math.max(1, m0)) * 100}%`);
  $('#weiBar').style.setProperty('--formed', `${(f1 / Math.max(1, m1)) * 100}%`);
  $('#shuNum').textContent = `${Math.round(m0)} / ${b.initialMen[0]}`;
  $('#weiNum').textContent = `${Math.round(m1)} / ${b.initialMen[1]}`;
  const t = Math.floor(b.t);
  $('#clock').textContent = b.t === 0 ? '布阵待敌' : `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;

  if (!force && Math.floor(b.t * 2) === state.lastHudTick) return;
  state.lastHudTick = Math.floor(b.t * 2);
  const s = b.stats;
  const ex = s.dead[1] / Math.max(1, s.dead[0]);
  const rows = STAT_ROWS.filter(([k]) => state.formation === 'bazhen' || !['rotations', 'groupRotations', 'sallies', 'traps'].includes(k))
    .map(([k, name, hint]) => `<div class="stat" title="${hint}"><span>${name}</span><b>${s[k] || 0}</b></div>`)
    .join('');
  $('#liveStats').innerHTML = `
    <div class="stat-main">
      <div><span>我军阵亡</span><b class="shu">${Math.round(s.dead[0])}</b></div>
      <div><span>魏军阵亡</span><b class="wei">${Math.round(s.dead[1])}</b></div>
      <div><span>交换比</span><b>${s.dead[0] > 5 ? ex.toFixed(2) : '—'}</b></div>
      <div><span>溃散 我/敌</span><b>${s.routs[0]} / ${s.routs[1]}</b></div>
    </div>
    <div class="stat-grid">${rows}</div>`;
  drawSpark();
}

function drawSpark() {
  const cv = $('#spark');
  const ctx = cv.getContext('2d');
  const W = cv.width;
  const H = cv.height;
  ctx.clearRect(0, 0, W, H);
  const b = state.battle;
  const h = b.history;
  const span = Math.max(120, h.length ? h[h.length - 1].t : 0);
  ctx.strokeStyle = 'rgba(240,225,190,0.12)';
  ctx.lineWidth = 1;
  for (let i = 1; i < 4; i += 1) {
    ctx.beginPath();
    ctx.moveTo(0, (H * i) / 4);
    ctx.lineTo(W, (H * i) / 4);
    ctx.stroke();
  }
  [
    [0, '#e0664c'],
    [1, '#8aa3c8']
  ].forEach(([side, color]) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    h.forEach((p, i) => {
      const x = (p.t / span) * W;
      const y = H - 3 - (p.men[side] / b.initialMen[side]) * (H - 8);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  });
}

function pushLog() {
  const b = state.battle;
  const ol = $('#log');
  let latest = null;
  while (state.logCursor < b.events.length) {
    const e = b.events[state.logCursor];
    state.logCursor += 1;
    const li = document.createElement('li');
    li.className = e.tone === 0 ? 'good' : 'bad';
    const t = Math.floor(e.t);
    li.innerHTML = `<time>${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}</time><span>${e.text}</span>`;
    li.addEventListener('click', () => flyTo({ x: e.x, z: e.z }, 110, 0.9));
    ol.prepend(li);
    latest = e;
    spawnMarker(e);
  }
  while (ol.children.length > 80) ol.lastChild.remove();
  if (latest && state.follow && latest.x !== undefined) flyTo({ x: latest.x, z: latest.z }, 150, 0.85, 1.6);
}

const markers = [];
function clearMarkers() {
  for (const marker of markers) {
    clearTimeout(marker.timer);
    marker.obj.parent?.remove(marker.obj);
    const i = army.labels.indexOf(marker);
    if (i >= 0) army.labels.splice(i, 1);
  }
  markers.length = 0;
}
function spawnMarker(e) {
  if (e.x === undefined || markers.length > 5) return;
  const div = document.createElement('div');
  div.className = `event-marker ${e.tone === 0 ? 'good' : 'bad'}`;
  div.textContent = e.text.split(/[，——（]/)[0];
  const obj = new CSS2DObject(div);
  scene.add(obj);
  const entry = { obj, div, pos: () => ({ x: e.x, z: e.z }), lift: 18 };
  army.labels.push(entry);
  markers.push(entry);
  entry.timer = setTimeout(() => {
    obj.parent?.remove(obj);
    const i = army.labels.indexOf(entry);
    if (i >= 0) army.labels.splice(i, 1);
    const j = markers.indexOf(entry);
    if (j >= 0) markers.splice(j, 1);
  }, 3800);
}

function showResult() {
  const b = state.battle;
  const r = b.result;
  if (!r || state.lastResultShown) return;
  state.lastResultShown = true;
  const win = r.winner === 0;
  const draw = r.winner === null;
  const el = $('#result');
  el.hidden = false;
  el.className = `result ${win ? 'win' : draw ? 'draw' : 'lose'}`;
  const s = r.stats;
  const extra =
    state.formation === 'bazhen'
      ? `<li>队内轮换 ${s.rotations} 次，整阵轮换 ${s.groupRotations || 0} 次</li><li>四奇出击 ${s.sallies} 次，敌陷通道夹击 ${s.traps} 次</li>`
      : '';
  el.innerHTML = `
    <p class="eyebrow">${FORMATIONS[state.formation].name} · ${SCENARIOS[state.scenario].name}</p>
    <h2>${win ? '魏军溃退' : draw ? '相持不下' : '我军溃败'}</h2>
    <div class="result-nums">
      <div><span>我军阵亡</span><b>${Math.round(r.dead[0])}</b></div>
      <div><span>魏军阵亡</span><b>${Math.round(r.dead[1])}</b></div>
      <div><span>交换比</span><b>${r.exchange.toFixed(2)}</b></div>
      <div><span>用时</span><b>${Math.round(r.t)} 秒</b></div>
    </div>
    <ul>${extra}<li>骑兵冲击 ${s.charges} 次，其中撞上枪林 ${s.braced} 次</li></ul>
    <div class="result-actions">
      <button class="btn" data-act="again" type="button">再战一次</button>
      <button class="btn ghost" data-act="compare" type="button">看全部对比</button>
      <button class="btn ghost" data-act="close" type="button">关闭</button>
    </div>`;
  el.querySelector('[data-act="again"]').onclick = () => {
    state.seed += 7;
    newBattle();
    state.playing = true;
    updatePlayButton();
  };
  el.querySelector('[data-act="compare"]').onclick = () => {
    el.hidden = true;
    switchTab('compare');
  };
  el.querySelector('[data-act="close"]').onclick = () => (el.hidden = true);
}

// ———————————————————— 面板：对比 ————————————————————
function renderMatrix() {
  const res = state.results;
  const head = `<tr><th></th>${SCENARIO_ORDER.map((s) => `<th>${SCENARIOS[s].name}</th>`).join('')}<th>合计</th></tr>`;
  const best = {};
  for (const s of SCENARIO_ORDER) {
    let bv = -Infinity;
    for (const f of FORMATION_ORDER) {
      const c = res.cells[f]?.[s];
      if (!c) continue;
      const v = score(c);
      if (v > bv) {
        bv = v;
        best[s] = f;
      }
    }
  }
  const rows = FORMATION_ORDER.map((f) => {
    let wins = 0;
    const cells = SCENARIO_ORDER.map((s) => {
      const c = res.cells[f]?.[s];
      if (!c) return '<td class="pending">…</td>';
      wins += c.w;
      const v = score(c);
      const tone = v > 0.35 ? 'w' : v < -0.35 ? 'l' : 'd';
      const label = c.w > c.l ? (c.w === c.n ? '胜' : '多胜') : c.l > c.w ? (c.l === c.n ? '负' : '多负') : '和';
      return `<td class="cell ${tone} ${best[s] === f ? 'best' : ''}" role="button" tabindex="0" aria-label="观看${FORMATIONS[f].name}迎战${SCENARIOS[s].name}" data-f="${f}" data-s="${s}" style="--v:${Math.max(-1, Math.min(1, v))}">
        <b>${label}</b><span>×${c.exchange.toFixed(2)}</span><small>${Math.round(c.remain * 100)}%</small></td>`;
    }).join('');
    return `<tr class="${f === 'bazhen' ? 'hero' : ''}"><th>${FORMATIONS[f].name}</th>${cells}<td class="total">${wins}/${SCENARIO_ORDER.length * res.seeds}</td></tr>`;
  }).join('');
  $('#matrix').innerHTML = head + rows;
  $('#insights').innerHTML = SCENARIO_ORDER.map((s) => {
    const f = best[s];
    if (!f) return '';
    return `<p><b>${SCENARIOS[s].name}</b>：本轮样本中${FORMATIONS[f].name}综合得分最高。${INSIGHT[s] || ''}</p>`;
  }).join('');
}

const INSIGHT = {
  frontal: '正面对拼时各阵差距最小，横阵宽正面的优势在这里最明显。',
  cavalry: '枪阵正面能挫骑兵锋锐，四面皆有正面的阵型更不怕铁骑。',
  flank: '侧后受击是横阵、鹤翼的软肋；八阵、圆阵没有真正的侧翼。',
  rear: '「触处为首」的价值在这里——阵形无需转身，接敌之阵即为阵首。',
  encircle: '四面受敌时，能收拢成一体、互相支援的阵型才撑得住。',
  assault: '主动进攻时，圆阵、方阵行进迟缓，难以在时限内击溃敌阵。'
};

function score(c) {
  // 胜负为主，交换比为辅
  return ((c.w - c.l) / c.n) * 0.7 + Math.max(-0.3, Math.min(0.3, Math.log(c.exchange) * 0.35));
}

function bindMatrix() {
  $('#matrix').addEventListener('keydown', (e) => {
    const cell = e.target.closest('[data-f]');
    if (cell && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      cell.click();
    }
  });
  $('#matrix').addEventListener('click', (e) => {
    const td = e.target.closest('td[data-f]');
    if (!td) return;
    state.formation = td.dataset.f;
    state.scenario = td.dataset.s;
    selectGroup(null);
    syncPickers();
    newBattle();
    switchTab('sim');
    state.playing = true;
    updatePlayButton();
  });
  $('#rerunBtn').addEventListener('click', rerunAll);
}

function rerunAll() {
  const btn = $('#rerunBtn');
  btn.disabled = true;
  const seeds = [11, 18, 25];
  const jobs = [];
  for (const f of FORMATION_ORDER) for (const s of SCENARIO_ORDER) for (const seed of seeds) jobs.push({ f, s, seed });
  const cells = {};
  const previousResults = state.results;
  const workers = Math.max(1, Math.min(6, (navigator.hardwareConcurrency || 4) - 1));
  let done = 0;
  let next = 0;
  state.results = { seeds: seeds.length, cells };
  renderMatrix();
  const acc = {};
  const pool = [];
  const fail = () => {
    pool.forEach((w) => w.terminate());
    state.results = previousResults;
    renderMatrix();
    $('#rerunStatus').textContent = '推演失败，已恢复预计算结果，可重试。';
    btn.disabled = false;
  };
  const finishOne = (job, r) => {
    done += 1;
    const key = `${job.f}|${job.s}`;
    const a = (acc[key] ||= { n: 0, w: 0, l: 0, d: 0, exchange: 0, remain: 0, t: 0 });
    a.n += 1;
    if (r.winner === 0) a.w += 1;
    else if (r.winner === 1) a.l += 1;
    else a.d += 1;
    a.exchange += r.exchange;
    a.remain += r.remain[0];
    a.t += r.t;
    if (a.n === seeds.length) {
      (cells[job.f] ||= {})[job.s] = { ...a, exchange: a.exchange / a.n, remain: a.remain / a.n, t: a.t / a.n };
      renderMatrix();
    }
    $('#rerunStatus').textContent = `推演中 ${done}/${jobs.length}`;
    if (done === jobs.length) {
      $('#rerunStatus').textContent = `完成：${jobs.length} 场推演`;
      btn.disabled = false;
      pool.forEach((w) => w.terminate());
    }
  };
  for (let i = 0; i < workers; i += 1) {
    let w;
    try {
      w = new Worker(new URL('./sim/worker.js', import.meta.url), { type: 'module' });
    } catch {
      fail();
      return;
    }
    pool.push(w);
    w.onerror = fail;
    w.onmessageerror = fail;
    const feed = () => {
      if (next >= jobs.length) return;
      const job = jobs[next];
      next += 1;
      w.onmessage = (ev) => {
        finishOne(job, ev.data);
        feed();
      };
      w.postMessage(job);
    };
    feed();
  }
}

// ———————————————————— 相机 ————————————————————
function flyTo(p, dist = 120, pitch = 0.9, dur = 1.1) {
  const from = { t: controls.target.clone(), c: camera.position.clone() };
  const offset = camera.position.clone().sub(controls.target);
  const yaw = Math.atan2(offset.x, offset.z);
  const to = new THREE.Vector3(p.x, groundHeight(p.x, p.z), p.z);
  const cam = new THREE.Vector3(
    to.x + Math.sin(yaw) * Math.cos(pitch) * dist,
    to.y + Math.sin(pitch) * dist,
    to.z + Math.cos(yaw) * Math.cos(pitch) * dist
  );
  state.camTween = { from, to: { t: to, c: cam }, t0: performance.now(), dur: dur * 1000 };
}

function setView(v) {
  const b = state.battle;
  const a = b.anchor;
  if (v === 'top') {
    state.camTween = {
      from: { t: controls.target.clone(), c: camera.position.clone() },
      to: { t: new THREE.Vector3(a.x, 0, a.z), c: new THREE.Vector3(a.x + 0.1, 330, a.z + 40) },
      t0: performance.now(),
      dur: 1200
    };
  } else if (v === 'oblique') {
    state.camTween = {
      from: { t: controls.target.clone(), c: camera.position.clone() },
      to: { t: new THREE.Vector3(a.x, 0, a.z - 10), c: new THREE.Vector3(a.x + 150, 150, a.z + 230) },
      t0: performance.now(),
      dur: 1200
    };
  } else if (v === 'close') {
    const front = b.toWorld(0, 60);
    state.camTween = {
      from: { t: controls.target.clone(), c: camera.position.clone() },
      to: { t: new THREE.Vector3(front.x, 2, front.z), c: new THREE.Vector3(front.x + 26, 12, front.z + 34) },
      t0: performance.now(),
      dur: 1300
    };
  }
}

function stepCamera(now) {
  const tw = state.camTween;
  if (!tw) return;
  const k = Math.min(1, (now - tw.t0) / tw.dur);
  const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
  controls.target.lerpVectors(tw.from.t, tw.to.t, e);
  camera.position.lerpVectors(tw.from.c, tw.to.c, e);
  if (k >= 1) state.camTween = null;
}

// ———————————————————— 悬停查看 ————————————————————
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const MODE_NAME = {
  slot: '守位',
  engage: '接战',
  sally: '奇兵出击',
  withdraw: '后撤休整',
  relieve: '前出接替',
  return: '归位',
  strike: '驰击',
  rout: '溃散'
};
let hoverPending = false;
function onPointerMove(ev) {
  if (hoverPending) return;
  hoverPending = true;
  requestAnimationFrame(() => {
    hoverPending = false;
    pointer.set((ev.clientX / window.innerWidth) * 2 - 1, -(ev.clientY / window.innerHeight) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObject(ground, false)[0];
    const tip = $('#tip');
    if (!hit) {
      tip.hidden = true;
      return;
    }
    let best = null;
    let bd = Infinity;
    for (const u of state.battle.units) {
      if (u.dead || u.fled || u.rx === undefined) continue;
      const d = Math.hypot(u.rx - hit.point.x, u.rz - hit.point.z);
      if (d < u.T.radius + 1.5 && d < bd) {
        bd = d;
        best = u;
      }
    }
    if (!best) {
      tip.hidden = true;
      return;
    }
    const u = best;
    const groups = FORMATIONS[state.formation].groups;
    const gname = u.side === 0 ? groups[u.group]?.name || '' : u.eg?.name || '';
    const mode = u.rout ? '溃散' : u.contacts?.length ? '接战中' : MODE_NAME[u.mode] || '';
    tip.hidden = false;
    tip.className = `tooltip ${u.side === 0 ? 'shu' : 'wei'}`;
    tip.style.left = `${ev.clientX + 14}px`;
    tip.style.top = `${ev.clientY + 14}px`;
    tip.innerHTML = `<b>${gname} · ${u.T.label}</b>
      <div class="meter"><span>兵力</span><i style="--v:${u.men / u.maxMen}"></i><em>${Math.round(u.men)}/${u.maxMen}</em></div>
      <div class="meter"><span>士气</span><i style="--v:${Math.max(0, u.morale) / 100}"></i><em>${Math.round(Math.max(0, u.morale))}</em></div>
      <div class="meter tired"><span>疲劳</span><i style="--v:${u.fatigue / 100}"></i><em>${Math.round(u.fatigue)}</em></div>
      <p>${mode}${u.routCount ? ` · 曾溃散 ${u.routCount} 次` : ''}</p>`;
  });
}

// ———————————————————— 绑定 ————————————————————
function resizeScene() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  const panel = $('.panel').getBoundingClientRect();
  const hud = $('#hud').getBoundingClientRect();
  camera.aspect = width / height;
  // 将视点投到可见战场中心，避免控制面板遮住阵形。
  const narrow = width <= 860;
  camera.zoom = narrow ? 0.58 : 1;
  camera.setViewOffset(width, height, narrow ? 0 : (width - panel.left) / 2,
    narrow ? (height - hud.top) / 2 : 0, width, height);
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
  labelRenderer.setSize(width, height);
  army.resize();
}
function switchTab(id) {
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('is-active', t.dataset.tab === id));
  document.querySelectorAll('.tab-body').forEach((t) => t.classList.toggle('is-active', t.dataset.body === id));
}

function bindUi() {
  document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => switchTab(t.dataset.tab)));
  $('#playBtn').addEventListener('click', startOrPause);
  $('#resetBtn').addEventListener('click', () => newBattle());
  $('#speedPick').addEventListener('click', (e) => {
    const b = e.target.closest('[data-speed]');
    if (!b) return;
    state.speed = Number(b.dataset.speed);
    document.querySelectorAll('#speedPick button').forEach((x) => x.classList.toggle('is-active', x === b));
  });
  document.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));
  $('#labelBtn').addEventListener('click', (e) => {
    state.labels = !state.labels;
    e.currentTarget.classList.toggle('is-on', state.labels);
    buildLabels();
  });
  $('#ringBtn').addEventListener('click', (e) => {
    army.showRings = !army.showRings;
    e.currentTarget.classList.toggle('is-on', army.showRings);
  });
  $('#followBtn').addEventListener('click', (e) => {
    state.follow = !state.follow;
    e.currentTarget.classList.toggle('is-on', state.follow);
  });
  controls.addEventListener('start', () => (state.camTween = null));
  renderer.domElement.addEventListener('pointermove', onPointerMove);
  renderer.domElement.addEventListener('pointerleave', () => ($('#tip').hidden = true));
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && e.target === document.body) {
      e.preventDefault();
      startOrPause();
    }
  });
  window.addEventListener('resize', () => {
    resizeScene();
  });
}

// ———————————————————— 主循环 ————————————————————
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  const b = state.battle;
  if (state.playing && !b.over) {
    state.acc += dt * state.speed;
    let steps = 0;
    while (state.acc >= C.dt && steps < 60) {
      b.step(C.dt);
      state.acc -= C.dt;
      steps += 1;
    }
    if (steps === 60) state.acc = 0;
    pushLog();
    if (b.result) {
      updateHud(true);
      if (b.over) {
        state.playing = false;
        updatePlayButton();
      }
      showResult();
    }
  }
  const alpha = state.playing ? Math.min(1, state.acc / C.dt) : 1;
  animUniforms.uTime.value = now / 1000;
  army.update(alpha, b.t + (state.playing ? state.acc : 0));
  if (state.playing) updateHud();
  updateGridOverlay();

  // 阴影跟随视点
  sun.target.position.copy(controls.target);
  sun.position.copy(controls.target).add(new THREE.Vector3(-160, 220, 120));

  stepCamera(now);
  controls.update();
  renderer.render(scene, camera);
  labelRenderer.render(scene, camera);
}

createIcons({ icons: ICONS });
renderLore();
renderPickers();
bindUi();
bindMatrix();
renderMatrix();
newBattle();
resizeScene();
requestAnimationFrame(frame);
