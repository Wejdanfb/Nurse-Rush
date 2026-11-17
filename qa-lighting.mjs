/**
 * NURSE RUSH - verify the recoloured nurse reads consistently under every
 * lighting condition in the game by sampling the ACTUAL rendered pixels on
 * her torso and face, not just the material definitions.
 *
 * Contexts: main menu (neutral key light), intro corridor (bright clinical),
 * intro under the emergency alarm (dimmed + red strobes), and gameplay (dusk).
 */
import { chromium } from 'playwright';

const BASE = process.env.URL;
const results = [];
const samples = [];

function check(name, ok, detail = '') {
  results.push({ name, ok: !!ok, detail });
  console.log(`${ok ? '  PASS' : '✗ FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
}

const W = (p, fn, t = 300000) => p.waitForFunction(fn, { timeout: t });
const state = (p, s, t = 300000) =>
  p.waitForFunction((x) => window.NURSE_RUSH && window.NURSE_RUSH.game.state === x, s, { timeout: t });

/** Average the rendered pixels over a small patch at a joint's screen position. */
const SAMPLER = (jointName, yOffset, radius) => {
  const g = window.NURSE_RUSH.game;
  const joint = g.nurse.joints[jointName];
  if (!joint) return null;

  // reuse a Vector3 instance so we don't need the THREE namespace
  const v = g.nurse.group.position.clone();
  joint.getWorldPosition(v);
  v.y += yOffset;
  v.project(g.camera);

  const cv = g.renderer.domElement;
  const px = Math.round((v.x * 0.5 + 0.5) * cv.width);
  const py = Math.round((1 - (v.y * 0.5 + 0.5)) * cv.height);
  if (px < radius || py < radius || px > cv.width - radius || py > cv.height - radius) return null;

  // render, then read before the buffer is swapped at the end of this task
  g.renderer.render(g.scene, g.camera);
  const gl = g.renderer.getContext();
  const size = radius * 2;
  const buf = new Uint8Array(size * size * 4);
  gl.readPixels(px - radius, cv.height - (py + radius), size, size, gl.RGBA, gl.UNSIGNED_BYTE, buf);

  let r = 0, gg = 0, b = 0, n = 0;
  for (let i = 0; i < buf.length; i += 4) {
    const lum = buf[i] + buf[i + 1] + buf[i + 2];
    if (lum < 60) continue;          // skip shadowed/background pixels
    r += buf[i]; gg += buf[i + 1]; b += buf[i + 2]; n++;
  }
  if (!n) return null;
  r = Math.round(r / n); gg = Math.round(gg / n); b = Math.round(b / n);

  // hue/saturation in HSL terms
  const mx = Math.max(r, gg, b) / 255, mn = Math.min(r, gg, b) / 255;
  const l = (mx + mn) / 2;
  const d = mx - mn;
  let h = 0;
  if (d > 0.0001) {
    const rr = r / 255, gr = gg / 255, br = b / 255;
    if (mx === rr) h = ((gr - br) / d) % 6;
    else if (mx === gr) h = (br - rr) / d + 2;
    else h = (rr - gr) / d + 4;
    h *= 60; if (h < 0) h += 360;
  }
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  return { r, g: gg, b, h: Math.round(h), s: +s.toFixed(2), l: +l.toFixed(2), n };
};

async function sample(p, label, jointName, yOffset = 0, radius = 5) {
  const out = await p.evaluate(
    ([fn, j, y, rad]) => new Function('return ' + fn)()(j, y, rad),
    [SAMPLER.toString(), jointName, yOffset, radius]
  );
  if (out) samples.push({ label, part: jointName, ...out });
  return out;
}

/** mauve = purple hue band, visibly saturated, light */
const isMauve = (c) => c && c.h >= 255 && c.h <= 330 && c.s >= 0.08 && c.l >= 0.30;
/**
 * Under the emergency strobes the whole corridor is deliberately bathed in
 * red, so the scrubs are EXPECTED to warm towards magenta - that is the
 * scene working as designed. What matters is that they stay in the
 * purple/magenta family and keep their saturation, rather than washing out
 * to grey or turning blue/green like a different garment.
 */
const isMauveUnderRed = (c) => c && ((c.h >= 290 && c.h <= 360) || c.h <= 5) && c.s >= 0.15 && c.l >= 0.18;
/** warm light skin = orange/yellow hue band, light */
const isWarmSkin = (c) => c && c.h >= 15 && c.h <= 48 && c.l >= 0.45;

async function run() {
  const browser = await chromium.launch({
    executablePath: '/usr/bin/google-chrome',
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
      '--no-sandbox', '--disable-dev-shm-usage', '--mute-audio'],
  });
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 640 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });

  await p.goto(BASE, { waitUntil: 'networkidle' });
  await W(p, () => !!window.NURSE_RUSH, 90000);

  /* ---------- 1. main menu ---------- */
  await p.waitForTimeout(2500);
  const menuTorso = await sample(p, 'Main menu', 'kneeL', -0.1, 5);
  const menuTop = await sample(p, 'Main menu', 'chest', 0.05, 6);
  const menuFace = await sample(p, 'Main menu', 'head', 0.06, 4);
  await p.screenshot({ path: '/home/claude/qa/l-menu.png' });
  check('MENU: scrubs render as light mauve',
    isMauve(menuTorso), menuTorso ? `rgb(${menuTorso.r},${menuTorso.g},${menuTorso.b}) hue ${menuTorso.h}° sat ${menuTorso.s} light ${menuTorso.l}` : 'no sample');
  check('MENU: skin renders warm and light',
    isWarmSkin(menuFace), menuFace ? `rgb(${menuFace.r},${menuFace.g},${menuFace.b}) hue ${menuFace.h}° light ${menuFace.l}` : 'no sample');

  /* ---------- 2. intro corridor, before the alarm ---------- */
  await p.click('#btn-play');
  await state(p, 'intro', 90000);
  await W(p, () => window.NURSE_RUSH.game.cinematic?.phase === 'walk', 90000);
  await p.waitForTimeout(1600);
  const walkTorso = await sample(p, 'Intro corridor', 'kneeL', -0.1, 5);
  const walkTop = await sample(p, 'Intro corridor', 'chest', 0.05, 6);
  const walkFace = await sample(p, 'Intro corridor', 'head', 0.06, 4);
  await p.screenshot({ path: '/home/claude/qa/l-intro-walk.png' });
  check('INTRO (clinical lighting): scrubs still read as mauve',
    isMauve(walkTorso), walkTorso ? `rgb(${walkTorso.r},${walkTorso.g},${walkTorso.b}) hue ${walkTorso.h}° sat ${walkTorso.s} light ${walkTorso.l}` : 'no sample');
  check('INTRO (clinical lighting): skin warm and light',
    isWarmSkin(walkFace), walkFace ? `hue ${walkFace.h}° light ${walkFace.l}` : 'no sample');

  /* ---------- 3. intro under the emergency alarm ---------- */
  await W(p, () => window.NURSE_RUSH.game.cinematic?.phase === 'react', 120000);
  // sample on a frame where the red strobe is actually lit
  await p.evaluate(() => W, {}).catch(() => {});
  await W(p, () => {
    const c = window.NURSE_RUSH.game.cinematic;
    return c && c.alarm > 0.9;
  }, 90000);
  await p.waitForTimeout(400);
  const alarmTorso = await sample(p, 'Intro alarm (red strobes)', 'kneeL', -0.1, 5);
  await p.screenshot({ path: '/home/claude/qa/l-intro-alarm.png' });
  check('INTRO (emergency red lighting): scrubs stay in the mauve family, warmed by the red',
    isMauveUnderRed(alarmTorso), alarmTorso ? `rgb(${alarmTorso.r},${alarmTorso.g},${alarmTorso.b}) hue ${alarmTorso.h}° sat ${alarmTorso.s} light ${alarmTorso.l}` : 'no sample');

  /* ---------- 4. gameplay, dusk ---------- */
  await p.click('#btn-skip');
  await state(p, 'running', 300000);
  await p.waitForTimeout(2500);
  const playTorso = await sample(p, 'Gameplay (dusk)', 'kneeL', -0.1, 5);
  await p.screenshot({ path: '/home/claude/qa/l-gameplay.png' });
  check('GAMEPLAY (dusk lighting): scrubs read as mauve',
    isMauve(playTorso), playTorso ? `rgb(${playTorso.r},${playTorso.g},${playTorso.b}) hue ${playTorso.h}° sat ${playTorso.s} light ${playTorso.l}` : 'no sample');
  // top and trousers are separate materials - confirm they agree where both
  // are visible (front-facing cameras)
  check('TOP vs TROUSERS: the two scrub materials match',
    isMauve(menuTop) && isMauve(walkTop) &&
    Math.abs(menuTop.h - menuTorso.h) < 40 && Math.abs(walkTop.h - walkTorso.h) < 40,
    `menu top ${menuTop && menuTop.h}° vs trousers ${menuTorso.h}°, intro top ${walkTop && walkTop.h}° vs trousers ${walkTorso.h}°`);

  /* ---------- 5. consistency across contexts ---------- */
  // trousers are the one scrub surface visible from every camera angle,
  // so they are the apples-to-apples consistency metric
  const torsos = samples.filter((s) => s.part === 'kneeL');
  // Compare the three neutrally-lit contexts against each other. The red
  // alarm frame is excluded on purpose: every surface in that shot is red
  // by design, so it is checked by its own rule above.
  const neutral = torsos.filter((s) => !/alarm/i.test(s.label));
  const hues = neutral.map((s) => s.h);
  const spread = Math.max(...hues) - Math.min(...hues);
  check('CONSISTENCY: scrub hue holds across menu, corridor and gameplay',
    spread <= 25 && neutral.length === 3,
    neutral.map((s) => `${s.label}: ${s.h}°`).join('  |  ') + `  (spread ${spread}°)`);

  const lights = torsos.map((s) => s.l);
  check('CONSISTENCY: scrubs never go washed out or black',
    lights.every((l) => l >= 0.28 && l <= 0.90),
    `lightness ${lights.join(', ')}`);

  const faces = samples.filter((s) => s.part === 'head');
  check('CONSISTENCY: skin is light but not excessively pale',
    faces.every((f) => f.l >= 0.45 && f.l <= 0.92 && f.s >= 0.08),
    faces.map((f) => `${f.label}: light ${f.l} sat ${f.s}`).join('  |  '));

  check('No console or page errors during the sweep', errs.length === 0, errs.slice(0, 3).join(' | '));

  await ctx.close();
  await browser.close();

  console.log('\n--- raw samples ---');
  samples.forEach((s) =>
    console.log(`  ${s.label.padEnd(26)} ${s.part.padEnd(6)} rgb(${s.r},${s.g},${s.b})  hue ${String(s.h).padStart(3)}°  sat ${s.s}  light ${s.l}`));

  const fails = results.filter((r) => !r.ok);
  console.log('\n======================================================');
  console.log(`${results.length - fails.length}/${results.length} checks passed`);
  if (fails.length) {
    console.log('\nFAILURES:');
    fails.forEach((f) => console.log(`  ✗ ${f.name} — ${f.detail}`));
    process.exit(1);
  }
  console.log('\nLIGHTING CONSISTENCY VERIFIED');
}

run().catch((e) => {
  console.error('\nHARNESS ERROR:', e.message);
  samples.forEach((s) => console.log(`  ${s.label} ${s.part} rgb(${s.r},${s.g},${s.b}) hue ${s.h}`));
  const fails = results.filter((r) => !r.ok);
  fails.forEach((f) => console.log(`  ✗ ${f.name} — ${f.detail}`));
  process.exit(1);
});
