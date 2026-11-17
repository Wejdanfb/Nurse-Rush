import * as THREE from 'three';
import { mergeByMaterial } from '../core/MeshUtils.js';

/**
 * Hospital obstacles. Geometries and materials are created once at module
 * level and shared by every instance; built groups are pooled per kind, so
 * a long round never allocates new GPU resources.
 *
 * clear:
 *   'full'  - cannot be cleared, change lane
 *   'jump'  - clears if the nurse is airborne above `top`
 *   'slide' - clears if the nurse is sliding
 */

const M = {
  white:     new THREE.MeshStandardMaterial({ color: 0xf2f7fa, roughness: 0.5 }),
  offwhite:  new THREE.MeshStandardMaterial({ color: 0xdfe8ee, roughness: 0.55 }),
  red:       new THREE.MeshStandardMaterial({ color: 0xe23b53, roughness: 0.45 }),
  redDark:   new THREE.MeshStandardMaterial({ color: 0xb62a3e, roughness: 0.5 }),
  glass:     new THREE.MeshStandardMaterial({ color: 0x9fd8e8, roughness: 0.12, metalness: 0.35, transparent: true, opacity: 0.72 }),
  tyre:      new THREE.MeshStandardMaterial({ color: 0x1b2328, roughness: 0.85 }),
  chrome:    new THREE.MeshStandardMaterial({ color: 0xcdd9e0, roughness: 0.22, metalness: 0.8 }),
  steel:     new THREE.MeshStandardMaterial({ color: 0xa9b7c0, roughness: 0.35, metalness: 0.55 }),
  teal:      new THREE.MeshStandardMaterial({ color: 0x1f9d8f, roughness: 0.5 }),
  tealDark:  new THREE.MeshStandardMaterial({ color: 0x136b61, roughness: 0.55 }),
  navy:      new THREE.MeshStandardMaterial({ color: 0x24323b, roughness: 0.6 }),
  green:     new THREE.MeshStandardMaterial({ color: 0x2bb673, roughness: 0.5 }),
  amber:     new THREE.MeshStandardMaterial({ color: 0xffc244, roughness: 0.45 }),
  blueLight: new THREE.MeshStandardMaterial({ color: 0x4ec6ff, emissive: 0x1a6fa8, emissiveIntensity: 0.6, roughness: 0.3 }),
  redLight:  new THREE.MeshStandardMaterial({ color: 0xff4d6d, emissive: 0xff1f44, emissiveIntensity: 0.9, roughness: 0.3 }),
  sheet:     new THREE.MeshStandardMaterial({ color: 0xeaf4f8, roughness: 0.75 }),
  pillow:    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 }),
  cardboard: new THREE.MeshStandardMaterial({ color: 0xc89b6a, roughness: 0.85 }),
  tape:      new THREE.MeshStandardMaterial({ color: 0xe8d4b0, roughness: 0.8 }),
};

const G = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 18),
  cylLow: new THREE.CylinderGeometry(0.5, 0.5, 1, 10),
  sph: new THREE.SphereGeometry(0.5, 14, 10),
  torus: new THREE.TorusGeometry(0.5, 0.14, 8, 18),
};

function box(parent, w, h, d, m, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(G.box, m);
  mesh.scale.set(w, h, d);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function cyl(parent, r, h, m, x = 0, y = 0, z = 0, lowPoly = false) {
  const mesh = new THREE.Mesh(lowPoly ? G.cylLow : G.cyl, m);
  mesh.scale.set(r * 2, h, r * 2);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
}

function wheel(parent, r, w, x, y, z) {
  const mesh = new THREE.Mesh(G.cylLow, M.tyre);
  mesh.scale.set(r * 2, w, r * 2);
  mesh.rotation.z = Math.PI / 2;
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
}

// -------------------------------------------------------------------
// builders
// -------------------------------------------------------------------

function buildAmbulance() {
  const g = new THREE.Group();

  // box body
  box(g, 2.0, 1.5, 3.3, M.white, 0, 1.15, -0.35);
  // red stripe + chevrons
  box(g, 2.03, 0.26, 3.33, M.red, 0, 0.78, -0.35);
  box(g, 2.04, 0.1, 1.0, M.amber, 0, 1.78, -1.9);
  // cab
  box(g, 1.86, 0.95, 1.5, M.offwhite, 0, 0.92, 1.56);
  box(g, 1.72, 0.52, 0.12, M.glass, 0, 1.28, 2.3);
  box(g, 0.12, 0.45, 1.1, M.glass, 0.9, 1.2, 1.6);
  box(g, 0.12, 0.45, 1.1, M.glass, -0.9, 1.2, 1.6);
  // rear doors
  box(g, 1.7, 1.1, 0.1, M.offwhite, 0, 1.15, -2.0);
  box(g, 0.06, 1.0, 0.08, M.chrome, 0, 1.15, -2.07);
  // red cross on the side
  box(g, 0.08, 0.62, 0.2, M.red, 1.02, 1.3, -0.4);
  box(g, 0.08, 0.2, 0.62, M.red, 1.02, 1.3, -0.4);
  box(g, 0.08, 0.62, 0.2, M.red, -1.02, 1.3, -0.4);
  box(g, 0.08, 0.2, 0.62, M.red, -1.02, 1.3, -0.4);
  // light bar
  const bar = box(g, 1.3, 0.16, 0.34, M.navy, 0, 1.98, 1.5);
  const l1 = box(g, 0.42, 0.14, 0.3, M.redLight, -0.4, 2.04, 1.5);
  const l2 = box(g, 0.42, 0.14, 0.3, M.blueLight, 0.4, 2.04, 1.5);
  // bumper + grille
  box(g, 1.9, 0.22, 0.2, M.chrome, 0, 0.5, 2.36);
  box(g, 1.5, 0.3, 0.1, M.navy, 0, 0.84, 2.36);
  // wheels
  wheel(g, 0.42, 0.26, 0.98, 0.42, 1.35);
  wheel(g, 0.42, 0.26, -0.98, 0.42, 1.35);
  wheel(g, 0.42, 0.26, 0.98, 0.42, -1.25);
  wheel(g, 0.42, 0.26, -0.98, 0.42, -1.25);

  // The light bar flashes through its shared materials (see
  // pulseEmergencyMaterials), so no per-mesh references are kept - that
  // leaves the whole vehicle safe to merge.
  void bar; void l1; void l2;

  g.userData = {
    kind: 'ambulance', clear: 'full', top: 2.1,
    hw: 1.05, hd: 2.5, label: 'Ambulance',
  };
  return g;
}

function buildBed() {
  const g = new THREE.Group();
  // frame
  box(g, 1.1, 0.08, 2.0, M.steel, 0, 0.62, 0);
  // mattress + sheet
  box(g, 1.02, 0.17, 1.9, M.sheet, 0, 0.74, 0);
  box(g, 1.04, 0.05, 0.7, M.teal, 0, 0.83, -0.5);
  // pillow
  box(g, 0.62, 0.14, 0.38, M.pillow, 0, 0.88, 0.72);
  // head + foot rails
  box(g, 1.12, 0.42, 0.07, M.chrome, 0, 0.95, 1.0);
  box(g, 1.12, 0.3, 0.07, M.chrome, 0, 0.88, -1.0);
  // side rails
  box(g, 0.06, 0.26, 1.2, M.chrome, 0.53, 0.9, 0.1);
  box(g, 0.06, 0.26, 1.2, M.chrome, -0.53, 0.9, 0.1);
  // legs + castors
  for (const sx of [0.45, -0.45]) {
    for (const sz of [0.82, -0.82]) {
      box(g, 0.08, 0.5, 0.08, M.steel, sx, 0.33, sz);
      cyl(g, 0.09, 0.08, M.tyre, sx, 0.09, sz, true);
    }
  }
  g.userData = { kind: 'bed', clear: 'jump', top: 0.95, hw: 0.58, hd: 1.05, label: 'Hospital bed' };
  return g;
}

function buildWheelchair() {
  const g = new THREE.Group();
  box(g, 0.66, 0.1, 0.62, M.navy, 0, 0.52, 0);          // seat
  box(g, 0.66, 0.6, 0.09, M.navy, 0, 0.82, -0.32);      // back
  box(g, 0.08, 0.1, 0.5, M.chrome, 0.34, 0.72, 0.04);   // arm rests
  box(g, 0.08, 0.1, 0.5, M.chrome, -0.34, 0.72, 0.04);
  box(g, 0.5, 0.06, 0.26, M.steel, 0, 0.22, 0.42);      // foot plate
  // big wheels
  for (const sx of [0.42, -0.42]) {
    const t = new THREE.Mesh(G.torus, M.tyre);
    t.scale.setScalar(0.62);
    t.position.set(sx, 0.34, -0.06);
    t.rotation.y = Math.PI / 2;
    t.castShadow = true;
    g.add(t);
    const hub = cyl(g, 0.07, 0.06, M.chrome, sx, 0.34, -0.06, true);
    hub.rotation.z = Math.PI / 2;
    for (let i = 0; i < 4; i++) {
      const sp = box(g, 0.02, 0.56, 0.02, M.chrome, sx, 0.34, -0.06);
      sp.rotation.x = (i / 4) * Math.PI;
    }
  }
  // castors
  for (const sx of [0.26, -0.26]) {
    cyl(g, 0.1, 0.06, M.tyre, sx, 0.1, 0.44, true).rotation.z = Math.PI / 2;
    box(g, 0.05, 0.2, 0.05, M.chrome, sx, 0.22, 0.44);
  }
  // push handles
  box(g, 0.06, 0.26, 0.06, M.chrome, 0.3, 1.2, -0.34);
  box(g, 0.06, 0.26, 0.06, M.chrome, -0.3, 1.2, -0.34);

  g.userData = { kind: 'wheelchair', clear: 'jump', top: 0.9, hw: 0.45, hd: 0.5, label: 'Wheelchair' };
  return g;
}

function buildCart() {
  const g = new THREE.Group();
  // body
  box(g, 0.92, 1.0, 0.72, M.offwhite, 0, 0.62, 0);
  // drawer fronts
  for (let i = 0; i < 3; i++) {
    box(g, 0.84, 0.24, 0.05, M.teal, 0, 0.3 + i * 0.3, 0.37);
    box(g, 0.3, 0.04, 0.04, M.chrome, 0, 0.3 + i * 0.3, 0.41);
  }
  // top tray + supplies
  box(g, 0.98, 0.06, 0.78, M.steel, 0, 1.15, 0);
  box(g, 0.26, 0.14, 0.2, M.white, -0.24, 1.25, 0.1);
  box(g, 0.16, 0.2, 0.16, M.green, 0.16, 1.28, -0.1);
  cyl(g, 0.06, 0.2, M.blueLight, 0.3, 1.28, 0.16, true);
  // red cross decal
  box(g, 0.05, 0.3, 0.1, M.red, 0.47, 0.75, 0);
  box(g, 0.05, 0.1, 0.3, M.red, 0.47, 0.75, 0);
  // push bar
  box(g, 0.9, 0.05, 0.05, M.chrome, 0, 1.4, -0.34);
  box(g, 0.05, 0.3, 0.05, M.chrome, 0.42, 1.27, -0.34);
  box(g, 0.05, 0.3, 0.05, M.chrome, -0.42, 1.27, -0.34);
  // castors
  for (const sx of [0.36, -0.36]) {
    for (const sz of [0.26, -0.26]) cyl(g, 0.08, 0.06, M.tyre, sx, 0.08, sz, true).rotation.z = Math.PI / 2;
  }
  // `top` is the clearance height the nurse must reach to jump it, kept a
  // little below the visual silhouette so a well-timed jump always reads as
  // a clean clear.
  g.userData = { kind: 'cart', clear: 'jump', top: 1.12, hw: 0.5, hd: 0.42, label: 'Supply cart' };
  return g;
}

function buildOxygen() {
  const g = new THREE.Group();
  // trolley base
  box(g, 0.8, 0.08, 0.5, M.steel, 0, 0.1, 0);
  for (const sx of [0.3, -0.3]) cyl(g, 0.08, 0.06, M.tyre, sx, 0.05, 0.18, true).rotation.z = Math.PI / 2;

  // two cylinders
  for (const sx of [0.2, -0.2]) {
    cyl(g, 0.17, 0.92, M.green, sx, 0.6, 0);
    cyl(g, 0.12, 0.1, M.chrome, sx, 1.1, 0, true);
    cyl(g, 0.05, 0.12, M.chrome, sx, 1.2, 0, true);
    // gauge
    const gg = cyl(g, 0.07, 0.04, M.white, sx, 1.16, 0.1, true);
    gg.rotation.x = Math.PI / 2;
    box(g, 0.34, 0.06, 0.06, M.white, sx, 0.8, 0.0);
  }
  // retaining strap
  box(g, 0.78, 0.08, 0.05, M.navy, 0, 0.72, 0.19);

  g.userData = { kind: 'oxygen', clear: 'jump', top: 1.1, hw: 0.42, hd: 0.3, label: 'Oxygen cylinders' };
  return g;
}

function buildEquipBox() {
  const g = new THREE.Group();
  const h = 0.52;
  // stack of two equipment boxes
  box(g, 0.86, h, 0.78, M.cardboard, 0, h / 2, 0);
  box(g, 0.88, 0.05, 0.1, M.tape, 0, h, 0);
  box(g, 0.1, 0.05, 0.8, M.tape, 0, h, 0);
  box(g, 0.74, h * 0.8, 0.68, M.cardboard, 0.03, h + (h * 0.8) / 2, -0.02);
  box(g, 0.76, 0.05, 0.09, M.tape, 0.03, h + h * 0.8, -0.02);
  // fragile / medical markings
  box(g, 0.2, 0.2, 0.03, M.red, 0, 0.3, 0.4);
  box(g, 0.06, 0.16, 0.04, M.white, 0, 0.3, 0.42);
  box(g, 0.16, 0.06, 0.04, M.white, 0, 0.3, 0.42);
  box(g, 0.3, 0.1, 0.03, M.teal, 0.03, h + 0.3, 0.33);

  g.userData = { kind: 'equipbox', clear: 'jump', top: 0.98, hw: 0.46, hd: 0.42, label: 'Equipment boxes' };
  return g;
}

function buildGantry() {
  // overhead mobile imaging arch - the slide-under obstacle
  const g = new THREE.Group();
  const clearH = 1.15; // nurse must slide

  for (const sx of [1, -1]) {
    box(g, 0.18, 2.1, 0.34, M.offwhite, sx * 0.92, 1.05, 0);
    box(g, 0.3, 0.1, 0.5, M.steel, sx * 0.92, 0.06, 0);
  }
  // cross head
  box(g, 2.1, 0.36, 0.5, M.offwhite, 0, 2.22, 0);
  box(g, 2.14, 0.1, 0.54, M.teal, 0, 2.02, 0);
  // hanging monitor + warning lamp
  box(g, 0.5, 0.34, 0.06, M.navy, 0.5, 1.78, 0.22);
  box(g, 0.44, 0.28, 0.02, M.blueLight, 0.5, 1.78, 0.26);
  const lamp = cyl(g, 0.11, 0.16, M.redLight, -0.5, 1.9, 0.1, true);
  // hazard chevrons on the beam
  for (let i = -2; i <= 2; i++) box(g, 0.16, 0.12, 0.52, M.amber, i * 0.36, 2.36, 0);

  void lamp;
  g.userData = {
    kind: 'gantry', clear: 'slide', top: 2.4, clearance: clearH,
    hw: 1.1, hd: 0.34, label: 'Imaging arch',
  };
  return g;
}

const BUILDERS = {
  ambulance: buildAmbulance,
  bed: buildBed,
  wheelchair: buildWheelchair,
  cart: buildCart,
  oxygen: buildOxygen,
  equipbox: buildEquipBox,
  gantry: buildGantry,
};

export const OBSTACLE_KINDS = Object.keys(BUILDERS);

const pools = {};
for (const k of OBSTACLE_KINDS) pools[k] = [];

export function acquireObstacle(kind) {
  const pool = pools[kind];
  if (pool.length) {
    const g = pool.pop();
    g.visible = true;
    return g;
  }
  // Each obstacle is 10-30 primitives. Merging by material at build time
  // turns a whole ambulance into a handful of draw calls, which is what
  // keeps the frame rate up on phones. Done once per pooled instance.
  return mergeByMaterial(BUILDERS[kind]());
}

export function releaseObstacle(g) {
  const kind = g.userData.kind;
  g.visible = false;
  if (g.parent) g.parent.remove(g);
  if (pools[kind] && pools[kind].length < 14) pools[kind].push(g);
}

export function disposeObstaclePools() {
  for (const k of OBSTACLE_KINDS) pools[k].length = 0;
  Object.values(G).forEach((g) => g.dispose());
  Object.values(M).forEach((m) => m.dispose());
}

/**
 * Pulse the shared emergency-lamp materials once per frame. Because the
 * materials are shared, every ambulance light bar in the scene flashes in
 * sync for the cost of two property writes.
 */
export function pulseEmergencyMaterials(t) {
  const on = Math.sin(t * 7.5) > 0;
  M.redLight.emissiveIntensity = on ? 1.7 : 0.1;
  M.blueLight.emissiveIntensity = on ? 0.15 : 1.5;
}
