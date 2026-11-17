import * as THREE from 'three';
import { mergeByMaterial } from '../core/MeshUtils.js';

/**
 * Collectibles: coins, cash, stethoscopes, first aid kits and medical
 * supplies. Shared geometry/materials + per-kind pooling, same as obstacles.
 */

const M = {
  gold:     new THREE.MeshStandardMaterial({ color: 0xffc244, roughness: 0.25, metalness: 0.65, emissive: 0x6b4a00, emissiveIntensity: 0.3 }),
  goldDark: new THREE.MeshStandardMaterial({ color: 0xd99a1c, roughness: 0.3, metalness: 0.6 }),
  cashGreen:new THREE.MeshStandardMaterial({ color: 0x4fbf7f, roughness: 0.65 }),
  cashDark: new THREE.MeshStandardMaterial({ color: 0x2f8f5c, roughness: 0.7 }),
  paper:    new THREE.MeshStandardMaterial({ color: 0xf3faf6, roughness: 0.8 }),
  tube:     new THREE.MeshStandardMaterial({ color: 0x24323b, roughness: 0.4 }),
  chrome:   new THREE.MeshStandardMaterial({ color: 0xd4e1e8, roughness: 0.18, metalness: 0.85 }),
  kitRed:   new THREE.MeshStandardMaterial({ color: 0xe8384f, roughness: 0.45 }),
  kitDark:  new THREE.MeshStandardMaterial({ color: 0xb3263a, roughness: 0.5 }),
  white:    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 }),
  teal:     new THREE.MeshStandardMaterial({ color: 0x1f9d8f, roughness: 0.5 }),
  glass:    new THREE.MeshStandardMaterial({ color: 0xbfeaf5, roughness: 0.1, metalness: 0.2, transparent: true, opacity: 0.8 }),
  blue:     new THREE.MeshStandardMaterial({ color: 0x4ec6ff, roughness: 0.4 }),
};

const G = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 20),
  cylLow: new THREE.CylinderGeometry(0.5, 0.5, 1, 10),
  torus: new THREE.TorusGeometry(0.5, 0.12, 8, 20),
  sph: new THREE.SphereGeometry(0.5, 14, 10),
};

function box(p, w, h, d, m, x = 0, y = 0, z = 0) {
  const me = new THREE.Mesh(G.box, m);
  me.scale.set(w, h, d); me.position.set(x, y, z); me.castShadow = true;
  p.add(me); return me;
}
function cyl(p, r, h, m, x = 0, y = 0, z = 0, low = false) {
  const me = new THREE.Mesh(low ? G.cylLow : G.cyl, m);
  me.scale.set(r * 2, h, r * 2); me.position.set(x, y, z); me.castShadow = true;
  p.add(me); return me;
}

// -------------------------------------------------------------------

function buildCoin() {
  const g = new THREE.Group();
  const c = cyl(g, 0.21, 0.055, M.gold, 0, 0, 0);
  c.rotation.x = Math.PI / 2;
  const rim = new THREE.Mesh(G.torus, M.goldDark);
  rim.scale.set(0.42, 0.42, 0.42);
  rim.castShadow = true;
  g.add(rim);
  // red cross face
  box(g, 0.055, 0.17, 0.02, M.kitRed, 0, 0, 0.032);
  box(g, 0.17, 0.055, 0.02, M.kitRed, 0, 0, 0.032);
  box(g, 0.055, 0.17, 0.02, M.kitRed, 0, 0, -0.032);
  box(g, 0.17, 0.055, 0.02, M.kitRed, 0, 0, -0.032);
  g.userData = { kind: 'coin', score: 10, coins: 1, spin: 2.6, label: 'Coin', fx: 'gold', radius: 0.42 };
  return g;
}

function buildCash() {
  const g = new THREE.Group();
  // small fanned bundle of notes
  for (let i = 0; i < 3; i++) {
    const n = box(g, 0.44, 0.015, 0.22, i === 1 ? M.cashGreen : M.cashDark, 0, i * 0.035 - 0.035, 0);
    n.rotation.y = (i - 1) * 0.16;
  }
  box(g, 0.14, 0.012, 0.12, M.paper, 0, 0.02, 0);
  box(g, 0.46, 0.016, 0.06, M.paper, 0, 0.055, 0);
  g.userData = { kind: 'cash', score: 50, coins: 5, spin: 1.7, label: 'Cash', fx: 'green', radius: 0.45 };
  return g;
}

function buildStethoscope() {
  const g = new THREE.Group();
  // tubing arc
  const arc = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.035, 8, 22, Math.PI * 1.25), M.tube);
  arc.rotation.set(0, 0, Math.PI * 0.88);
  arc.castShadow = true;
  g.add(arc);
  // ear tips
  for (const sx of [1, -1]) {
    const t = cyl(g, 0.028, 0.14, M.chrome, sx * 0.17, 0.17, 0, true);
    t.rotation.z = sx * 0.4;
  }
  // chest piece
  const bell = cyl(g, 0.11, 0.05, M.chrome, 0, -0.22, 0, true);
  bell.rotation.x = Math.PI / 2;
  cyl(g, 0.075, 0.06, M.white, 0, -0.22, 0.03, true).rotation.x = Math.PI / 2;
  // down-tube
  const dt = cyl(g, 0.03, 0.2, M.tube, 0, -0.08, 0, true);
  dt.rotation.z = 0.1;
  g.userData = { kind: 'stethoscope', score: 75, coins: 0, spin: 2.0, label: 'Stethoscope', fx: 'teal', radius: 0.45 };
  return g;
}

function buildFirstAid() {
  const g = new THREE.Group();
  box(g, 0.44, 0.34, 0.3, M.kitRed, 0, 0, 0);
  box(g, 0.45, 0.07, 0.31, M.kitDark, 0, 0.14, 0);
  // white cross
  box(g, 0.08, 0.2, 0.02, M.white, 0, -0.02, 0.157);
  box(g, 0.2, 0.08, 0.02, M.white, 0, -0.02, 0.157);
  box(g, 0.08, 0.2, 0.02, M.white, 0, -0.02, -0.157);
  box(g, 0.2, 0.08, 0.02, M.white, 0, -0.02, -0.157);
  // handle + clasp
  const h = new THREE.Mesh(G.torus, M.kitDark);
  h.scale.set(0.2, 0.2, 0.2);
  h.position.set(0, 0.2, 0);
  h.rotation.x = Math.PI / 2;
  h.castShadow = true;
  g.add(h);
  box(g, 0.08, 0.06, 0.02, M.chrome, 0, 0.1, 0.156);
  g.userData = { kind: 'firstaid', score: 100, coins: 0, spin: 1.5, label: 'First aid kit', fx: 'rose', radius: 0.48 };
  return g;
}

function buildSupplies() {
  const g = new THREE.Group();
  // gauze roll
  const roll = cyl(g, 0.11, 0.2, M.white, -0.13, -0.02, 0);
  roll.rotation.z = Math.PI / 2;
  // vial
  cyl(g, 0.055, 0.21, M.glass, 0.1, 0.0, 0.05);
  cyl(g, 0.058, 0.04, M.blue, 0.1, 0.11, 0.05, true);
  // syringe
  const body = cyl(g, 0.035, 0.26, M.glass, 0.12, 0.02, -0.11, true);
  body.rotation.z = -0.3;
  const needle = cyl(g, 0.009, 0.12, M.chrome, 0.16, 0.19, -0.11, true);
  needle.rotation.z = -0.3;
  box(g, 0.08, 0.02, 0.02, M.teal, 0.08, -0.12, -0.11);
  // small tape pack
  box(g, 0.14, 0.09, 0.14, M.teal, -0.06, 0.14, -0.04);
  g.userData = { kind: 'supplies', score: 30, coins: 0, spin: 2.2, label: 'Medical supplies', fx: 'teal', radius: 0.44 };
  return g;
}

const BUILDERS = {
  coin: buildCoin,
  cash: buildCash,
  stethoscope: buildStethoscope,
  firstaid: buildFirstAid,
  supplies: buildSupplies,
};

export const COLLECTIBLE_KINDS = Object.keys(BUILDERS);

/** Weighted spawn table - coins are common, kits are rare. */
export const COLLECTIBLE_WEIGHTS = [
  ['coin', 62],
  ['supplies', 14],
  ['cash', 11],
  ['stethoscope', 8],
  ['firstaid', 5],
];

export function randomCollectibleKind() {
  const total = COLLECTIBLE_WEIGHTS.reduce((s, [, w]) => s + w, 0);
  let r = Math.random() * total;
  for (const [k, w] of COLLECTIBLE_WEIGHTS) {
    r -= w;
    if (r <= 0) return k;
  }
  return 'coin';
}

const pools = {};
for (const k of COLLECTIBLE_KINDS) pools[k] = [];

export function acquireCollectible(kind) {
  const pool = pools[kind];
  if (pool.length) {
    const g = pool.pop();
    g.visible = true;
    g.scale.setScalar(1);
    return g;
  }
  // Collectibles spawn in long runs, so merging each one by material keeps
  // a 30-coin stretch cheap to draw.
  return mergeByMaterial(BUILDERS[kind]());
}

export function releaseCollectible(g) {
  const kind = g.userData.kind;
  g.visible = false;
  if (g.parent) g.parent.remove(g);
  if (pools[kind] && pools[kind].length < 40) pools[kind].push(g);
}

export function disposeCollectiblePools() {
  for (const k of COLLECTIBLE_KINDS) pools[k].length = 0;
  Object.values(G).forEach((g) => g.dispose());
  Object.values(M).forEach((m) => m.dispose());
}
