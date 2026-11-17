import * as THREE from 'three';

/**
 * Procedural canvas textures. Everything is drawn at runtime with Canvas2D,
 * so the build ships no image files and there is nothing to license.
 */

const cache = new Map();

function makeCanvas(size = 256) {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  return c;
}

function finish(canvas, { repeat = [1, 1], aniso = 4 } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = aniso;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function noise(ctx, size, amount, alpha) {
  for (let i = 0; i < amount; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = Math.random() * 2 + 0.4;
    ctx.fillStyle = `rgba(0,0,0,${Math.random() * alpha})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Polished hospital floor: large pale tiles with grout lines and a sheen. */
export function hospitalFloorTexture() {
  if (cache.has('floor')) return cache.get('floor');
  const S = 256;
  const c = makeCanvas(S);
  const ctx = c.getContext('2d');

  ctx.fillStyle = '#e7eef2';
  ctx.fillRect(0, 0, S, S);

  // subtle marbling
  for (let i = 0; i < 26; i++) {
    const g = ctx.createLinearGradient(0, Math.random() * S, S, Math.random() * S);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.5, `rgba(203,219,227,${0.1 + Math.random() * 0.14})`);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S);
  }

  // 2x2 tiles with grout
  ctx.strokeStyle = '#c6d4db';
  ctx.lineWidth = 4;
  for (let i = 0; i <= 2; i++) {
    const p = (i * S) / 2;
    ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, S); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(S, p); ctx.stroke();
  }
  // highlight along the top-left of each tile
  ctx.strokeStyle = 'rgba(255,255,255,.75)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 2; i++) {
    for (let k = 0; k < 2; k++) {
      ctx.strokeRect(i * 128 + 4, k * 128 + 4, 120, 120);
    }
  }
  noise(ctx, S, 450, 0.035);

  const t = finish(c, { repeat: [3, 24] });
  cache.set('floor', t);
  return t;
}

/** Wall panel: pale upper wall, teal wainscot band, panel seams. */
export function hospitalWallTexture() {
  if (cache.has('wall')) return cache.get('wall');
  const S = 256;
  const c = makeCanvas(S);
  const ctx = c.getContext('2d');

  const g = ctx.createLinearGradient(0, 0, 0, S);
  g.addColorStop(0, '#f4f9fb');
  g.addColorStop(0.58, '#e8f1f4');
  g.addColorStop(0.62, '#cfe3e4');
  g.addColorStop(0.66, '#1f9d8f');
  g.addColorStop(0.72, '#17867a');
  g.addColorStop(0.74, '#d9e6ea');
  g.addColorStop(1, '#c9d9de');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);

  // vertical panel seams
  ctx.strokeStyle = 'rgba(160,185,196,.55)';
  ctx.lineWidth = 2;
  for (let i = 0; i <= 4; i++) {
    const x = (i * S) / 4;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, S); ctx.stroke();
  }
  // handrail shadow
  ctx.fillStyle = 'rgba(0,0,0,.08)';
  ctx.fillRect(0, S * 0.75, S, 6);
  noise(ctx, S, 260, 0.03);

  const t = finish(c, { repeat: [10, 1] });
  cache.set('wall', t);
  return t;
}

/** Ceiling: acoustic tile grid. */
export function ceilingTexture() {
  if (cache.has('ceil')) return cache.get('ceil');
  const S = 128;
  const c = makeCanvas(S);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#dde7ec';
  ctx.fillRect(0, 0, S, S);
  ctx.strokeStyle = '#b9c9d1';
  ctx.lineWidth = 5;
  ctx.strokeRect(0, 0, S, S);
  ctx.beginPath(); ctx.moveTo(S / 2, 0); ctx.lineTo(S / 2, S); ctx.stroke();
  noise(ctx, S, 500, 0.05);
  const t = finish(c, { repeat: [3, 18] });
  cache.set('ceil', t);
  return t;
}

/** Asphalt with a dashed centre line used for the runner lanes. */
export function asphaltTexture() {
  if (cache.has('asphalt')) return cache.get('asphalt');
  const S = 256;
  const c = makeCanvas(S);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#39454d';
  ctx.fillRect(0, 0, S, S);
  for (let i = 0; i < 700; i++) {
    const v = Math.random();
    ctx.fillStyle = v > 0.5 ? `rgba(255,255,255,${Math.random() * 0.07})` : `rgba(0,0,0,${Math.random() * 0.22})`;
    ctx.beginPath();
    ctx.arc(Math.random() * S, Math.random() * S, Math.random() * 2.6 + 0.4, 0, Math.PI * 2);
    ctx.fill();
  }
  const t = finish(c, { repeat: [2, 10] });
  cache.set('asphalt', t);
  return t;
}

/** Hazard chevron strip (ambulance bay markings). */
export function hazardTexture() {
  if (cache.has('hazard')) return cache.get('hazard');
  const S = 128;
  const c = makeCanvas(S);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#f2c33c';
  ctx.fillRect(0, 0, S, S);
  ctx.strokeStyle = '#2a333a';
  ctx.lineWidth = 22;
  for (let i = -2; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo(i * 44, S);
    ctx.lineTo(i * 44 + 56, 0);
    ctx.stroke();
  }
  const t = finish(c, { repeat: [1, 1] });
  cache.set('hazard', t);
  return t;
}

/** Glazed hospital facade: window grid with lit rooms. */
export function facadeTexture() {
  if (cache.has('facade')) return cache.get('facade');
  const S = 256;
  const c = makeCanvas(S);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#dfe9ee';
  ctx.fillRect(0, 0, S, S);
  const cols = 6, rows = 7;
  const pad = 5;
  const w = S / cols, h = S / rows;
  for (let i = 0; i < cols; i++) {
    for (let k = 0; k < rows; k++) {
      const lit = Math.random();
      ctx.fillStyle = lit > 0.62 ? '#fff0c4' : lit > 0.3 ? '#8fb9c9' : '#6c97a9';
      ctx.fillRect(i * w + pad, k * h + pad, w - pad * 2, h - pad * 2);
      ctx.fillStyle = 'rgba(255,255,255,.25)';
      ctx.fillRect(i * w + pad, k * h + pad, w - pad * 2, 3);
    }
  }
  ctx.strokeStyle = '#c3d2d9';
  ctx.lineWidth = 3;
  for (let i = 0; i <= cols; i++) { ctx.beginPath(); ctx.moveTo(i * w, 0); ctx.lineTo(i * w, S); ctx.stroke(); }
  for (let k = 0; k <= rows; k++) { ctx.beginPath(); ctx.moveTo(0, k * h); ctx.lineTo(S, k * h); ctx.stroke(); }
  const t = finish(c, { repeat: [2, 1] });
  cache.set('facade', t);
  return t;
}

/** A soft radial gradient used as a fake contact shadow / glow decal. */
export function glowTexture(color = '255,255,255') {
  const key = `glow${color}`;
  if (cache.has(key)) return cache.get(key);
  const S = 128;
  const c = makeCanvas(S);
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, `rgba(${color},1)`);
  g.addColorStop(0.45, `rgba(${color},.42)`);
  g.addColorStop(1, `rgba(${color},0)`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  cache.set(key, t);
  return t;
}

/** Hospital sign board with arrows (Emergency / ER). */
export function signTexture(label = 'EMERGENCY') {
  const key = `sign${label}`;
  if (cache.has(key)) return cache.get(key);
  const W = 512, H = 128;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#0f3f58';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#19b8a6';
  ctx.fillRect(0, H - 12, W, 12);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 62px Trebuchet MS, Arial, sans-serif';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.fillText(label, W / 2, H / 2 - 4);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  cache.set(key, t);
  return t;
}

/** Red cross plate for the hospital wall. */
export function crossTexture() {
  if (cache.has('cross')) return cache.get('cross');
  const S = 128;
  const c = makeCanvas(S);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, S, S);
  ctx.fillStyle = '#e23b53';
  ctx.fillRect(S * 0.38, S * 0.14, S * 0.24, S * 0.72);
  ctx.fillRect(S * 0.14, S * 0.38, S * 0.72, S * 0.24);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  cache.set('cross', t);
  return t;
}

/** Vertical gradient sky, used on a back-side dome. */
export function skyTexture(preset = 'dusk') {
  const key = `sky${preset}`;
  if (cache.has(key)) return cache.get(key);
  const c = document.createElement('canvas');
  c.width = 16; c.height = 256;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  if (preset === 'dusk') {
    g.addColorStop(0, '#071c2a');
    g.addColorStop(0.42, '#0e3a4e');
    g.addColorStop(0.68, '#1d6e7a');
    g.addColorStop(0.86, '#4aa295');
    g.addColorStop(1, '#8fd0c2');
  } else {
    g.addColorStop(0, '#04131d');
    g.addColorStop(0.55, '#082634');
    g.addColorStop(1, '#14525f');
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 16, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.ClampToEdgeWrapping;
  t.wrapT = THREE.ClampToEdgeWrapping;
  cache.set(key, t);
  return t;
}

/** Checkered finish-line banner. */
export function finishTexture() {
  if (cache.has('finish')) return cache.get('finish');
  const S = 128;
  const c = makeCanvas(S);
  const ctx = c.getContext('2d');
  const n = 8, s = S / n;
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < n; k++) {
      ctx.fillStyle = (i + k) % 2 ? '#ffffff' : '#16222a';
      ctx.fillRect(i * s, k * s, s, s);
    }
  }
  const t = finish(c, { repeat: [6, 1] });
  cache.set('finish', t);
  return t;
}

export function disposeTextures() {
  cache.forEach((t) => t.dispose());
  cache.clear();
}
