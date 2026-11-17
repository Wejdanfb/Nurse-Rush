/**
 * NURSE RUSH - nurse recolour + oxygen speed-boost power-up.
 */
import { chromium } from 'playwright';

const BASE = process.env.URL;
const results = [];
const consoleErrors = [];

function check(name, ok, detail = '') {
  results.push({ name, ok: !!ok, detail });
  console.log(`${ok ? '  PASS' : '✗ FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
}

const W = (p, fn, t = 300000) => p.waitForFunction(fn, { timeout: t });
const state = (p, s, t = 300000) =>
  p.waitForFunction((x) => window.NURSE_RUSH && window.NURSE_RUSH.game.state === x, s, { timeout: t });

async function newPage(browser, viewport = { width: 1000, height: 640 }) {
  const ctx = await browser.newContext({ viewport });
  const p = await ctx.newPage();
  p.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  p.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));
  await p.goto(BASE, { waitUntil: 'networkidle' });
  await W(p, () => !!window.NURSE_RUSH, 90000);
  return { ctx, p };
}

async function startGameplay(p) {
  await p.click('#btn-play');
  await state(p, 'intro', 90000);
  await p.click('#btn-skip');
  await state(p, 'running');
}

const hex = (n) => '#' + n.toString(16).padStart(6, '0');

async function run() {
  const browser = await chromium.launch({
    executablePath: '/usr/bin/google-chrome',
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
      '--no-sandbox', '--disable-dev-shm-usage', '--mute-audio'],
  });

  /* ================= nurse appearance ================= */
  {
    const { ctx, p } = await newPage(browser);
    // menu scene already holds the nurse
    const look = await p.evaluate(() => {
      const g = window.NURSE_RUSH.game;
      const found = {};
      g.nurse.group.traverse((o) => {
        if (!o.isMesh || !o.material || !o.material.color) return;
        const h = o.material.color.getHex();
        found[h] = (found[h] || 0) + 1;
      });
      return {
        colours: found,
        joints: Object.keys(g.nurse.joints),
        hairChildren: g.nurse.hair.children.length,
        states: ['idle', 'walk', 'run', 'jump', 'slide', 'lose', 'victory'],
      };
    });
    const present = Object.keys(look.colours).map(Number);

    // light mauve scrubs
    const mauve = [0xc9a9d8, 0xae8cc0, 0xb897c9];
    check('NURSE: scrubs are light mauve',
      mauve.every((c) => present.includes(c)),
      mauve.map(hex).join(' '));
    check('NURSE: old teal scrub colours are gone',
      ![0x1f9d8f, 0x17867a, 0x14756b].some((c) => present.includes(c)));

    // lighter, warmer skin
    const skin = [0xfbd9b4, 0xeec196];
    check('NURSE: skin is lighter and warm',
      skin.every((c) => present.includes(c)),
      skin.map(hex).join(' '));
    check('NURSE: previous darker skin tones replaced',
      ![0xf3c69d, 0xe0a97d].some((c) => present.includes(c)));

    // identity untouched
    check('NURSE: curly hair preserved',
      [0x3a2318, 0x4d3022].every((c) => present.includes(c)) && look.hairChildren > 0,
      `hair meshes: ${look.hairChildren}, original hair colours retained`);
    check('NURSE: Crocs preserved',
      [0xffc244, 0xfff3d6].every((c) => present.includes(c)));
    check('NURSE: rig and proportions untouched',
      look.joints.length === 16, `${look.joints.length} joints`);

    // every animation still drives the rig
    const anim = await p.evaluate(async () => {
      const g = window.NURSE_RUSH.game;
      const out = {};
      for (const s of ['idle', 'walk', 'run', 'jump', 'slide', 'lose', 'victory']) {
        g.nurse.play(s, { force: true });
        const before = g.nurse.joints.hipL.rotation.x;
        for (let i = 0; i < 30; i++) g.nurse.update(1 / 60, { speedK: 0.5, verticalVel: 0 });
        out[s] = { state: g.nurse.state, moved: Math.abs(g.nurse.joints.hipL.rotation.x - before) > 1e-4 };
      }
      g.nurse.play('idle', { force: true });
      return out;
    });
    const allAnim = Object.entries(anim).every(([k, v]) => v.state === k && v.moved);
    check('NURSE: all seven animations still drive the rig',
      allAnim, Object.keys(anim).join(', '));
    await ctx.close();
  }

  /* ---- same materials in the intro (shared instance) ---- */
  {
    const { ctx, p } = await newPage(browser);
    await p.click('#btn-play');
    await state(p, 'intro', 90000);
    await p.waitForTimeout(1200);
    const introLook = await p.evaluate(() => {
      const g = window.NURSE_RUSH.game;
      const found = new Set();
      g.nurse.group.traverse((o) => {
        if (o.isMesh && o.material && o.material.color) found.add(o.material.color.getHex());
      });
      return {
        mauve: found.has(0xc9a9d8), skin: found.has(0xfbd9b4), crocs: found.has(0xffc244),
        inIntro: !!g.cinematic, anim: g.nurse.state,
      };
    });
    check('NURSE: intro uses the same recoloured character',
      introLook.mauve && introLook.skin && introLook.crocs && introLook.inIntro,
      `walking in the corridor as "${introLook.anim}"`);
    await ctx.close();
  }

  /* ================= oxygen: no longer an obstacle ================= */
  {
    const { ctx, p } = await newPage(browser);
    await startGameplay(p);
    const obs = await p.evaluate(() => {
      const g = window.NURSE_RUSH.game;
      const kinds = {};
      for (let i = 0; i < 600; i++) g.world._spawnObstacleRow(-400 - i * 3, i % 6);
      for (const o of g.world.obstacles) kinds[o.data.kind] = (kinds[o.data.kind] || 0) + 1;
      return { kinds, total: g.world.obstacles.length };
    });
    check('OXYGEN: never spawns as an obstacle',
      !('oxygen' in obs.kinds),
      `${obs.total} obstacles over 600 rows: ${Object.keys(obs.kinds).join(', ')}`);
    check('OXYGEN: the other obstacles are unchanged',
      ['ambulance', 'bed', 'wheelchair', 'cart', 'equipbox', 'gantry'].every((k) => k in obs.kinds),
      Object.entries(obs.kinds).map(([k, v]) => `${k}:${v}`).join(' '));

    // collide with one head-on: must not register a hit or end the game
    const collide = await p.evaluate(() => {
      const g = window.NURSE_RUSH.game;
      const LANE_X = [-2.3, 0, 2.3];
      for (const o of g.world.obstacles) o.obj.position.z = -900;
      for (const c of g.world.collectibles) c.obj.position.z = -900;
      g.world._spawnOxygen(0);
      const ox = g.world.collectibles.find((c) => c.data.kind === 'oxygen' && !c.taken);
      if (!ox) return { missing: true };
      g.lane = ox.lane; g.laneX = LANE_X[ox.lane]; g.playerY = 0; g.sliding = 0; g.airborne = false;
      ox.obj.position.set(LANE_X[ox.lane], 0.95, 0);
      const s0 = g.score, state0 = g.state;
      g._collisions();
      return {
        taken: ox.taken, scoreDelta: g.score - s0, stateAfter: g.state,
        stillRunning: g.state === 'running' && state0 === 'running',
        boost: g.boostRemaining, slow: g.slowUntil,
      };
    });
    check('OXYGEN: running into one collects it instead of colliding',
      !collide.missing && collide.taken && collide.scoreDelta > 0 && collide.stillRunning && collide.slow === 0,
      `collected for +${collide.scoreDelta}, no slow-down, state still ${collide.stateAfter}`);
    check('OXYGEN: collecting activates the speed boost',
      Math.abs(collide.boost - 5) < 0.01, `${collide.boost} s of boost`);
    await ctx.close();
  }

  /* ================= boost behaviour ================= */
  {
    const { ctx, p } = await newPage(browser);
    await startGameplay(p);
    await p.waitForTimeout(1500);

    const base = await p.evaluate(() => {
      const g = window.NURSE_RUSH.game;
      return { tier: g._lastTier, speed: g.speed, fov: g.camera.fov,
        cfg: { secs: window.NURSE_RUSH.ROUND.BOOST_SECONDS,
               add: window.NURSE_RUSH.ROUND.BOOST_ADD,
               cap: window.NURSE_RUSH.ROUND.BOOST_MAX_SPEED } };
    });
    check('BOOST: configured for ~5 seconds', base.cfg.secs === 5, `${base.cfg.secs} s`);

    // snapshot the round clock and question schedule, then boost
    const before = await p.evaluate(() => {
      const g = window.NURSE_RUSH.game;
      return { round: g.roundTime, next: g.nextQuestionAt, tier: g._lastTier };
    });
    await p.evaluate(() => {
      const g = window.NURSE_RUSH.game;
      const LANE_X = [-2.3, 0, 2.3];
      for (const o of g.world.obstacles) o.obj.position.z = -900;
      g.world._spawnOxygen(0);
      const ox = g.world.collectibles.find((c) => c.data.kind === 'oxygen' && !c.taken);
      g.lane = ox.lane; g.laneX = LANE_X[ox.lane]; g.playerY = 0;
      ox.obj.position.set(LANE_X[ox.lane], 0.95, 0);
      g._collisions();
    });
    // Wait for the eased speed to CONVERGE rather than sampling after a
    // fixed wall-clock delay: under the software rasteriser only a few
    // frames pass per second, so 700 ms of wall time is a fraction of a
    // second of game time and the ramp has barely started.
    await p.evaluate(() => { window.__prev = -1; });
    await W(p, () => {
      const g = window.NURSE_RUSH.game;
      for (const o of g.world.obstacles) o.obj.position.z = -900;  // no collisions while measuring
      g.slowUntil = 0;
      const d = Math.abs(g.speed - window.__prev);
      window.__prev = g.speed;
      return g.boostRemaining > 0 && d < 0.05;
    }, 180000);
    const during = await p.evaluate(() => {
      const g = window.NURSE_RUSH.game;
      return {
        boost: g.boostRemaining,
        speed: g.speed,
        tier: g._lastTier,
        fov: g.camera.fov,
        banner: document.getElementById('boost-banner').classList.contains('is-on'),
        bannerText: document.querySelector('.boost-banner__label').textContent.trim(),
        fill: document.getElementById('boost-fill').style.width,
        bodyClass: document.body.classList.contains('is-boosting'),
        next: g.nextQuestionAt,
        round: g.roundTime,
      };
    });
    check('BOOST: SPEED BOOST! indicator is shown',
      during.banner && /SPEED BOOST!/.test(during.bannerText) && during.bodyClass,
      `"${during.bannerText}", bar at ${during.fill}`);
    check('BOOST: speed rises to the tier speed plus the boost',
      Math.abs(during.speed - Math.min(13 + base.cfg.add, base.cfg.cap)) < 0.6,
      `tier 0 cruise 13.0 → boosted ${during.speed.toFixed(1)} (expected ${Math.min(13 + base.cfg.add, base.cfg.cap)})`);
    check('BOOST: visual speed effect (field of view widens)',
      during.fov > base.fov + 1, `fov ${base.fov.toFixed(1)} → ${during.fov.toFixed(1)}`);
    check('BOOST: progressive speed tier is not reset',
      during.tier === before.tier, `tier ${before.tier} → ${during.tier}`);
    check('BOOST: question schedule untouched',
      during.next === before.next,
      `nextQuestionAt ${before.next} → ${during.next}`);

    // let it run out naturally and confirm the return to normal speed
    const decay = await p.evaluate(() => new Promise((res) => {
      const g = window.NURSE_RUSH.game;
      const seen = [];
      const tick = () => {
        seen.push({ b: g.boostRemaining, s: g.speed });
        if (g.boostRemaining > 0) requestAnimationFrame(tick);
        else res(seen);
      };
      requestAnimationFrame(tick);
    }));
    await p.evaluate(() => { window.__prev = -1; });
    await W(p, () => {
      const g = window.NURSE_RUSH.game;
      for (const o of g.world.obstacles) o.obj.position.z = -900;
      g.slowUntil = 0;
      const d = Math.abs(g.speed - window.__prev);
      window.__prev = g.speed;
      return g.boostRemaining === 0 && d < 0.05;
    }, 180000);
    const after = await p.evaluate(() => {
      const g = window.NURSE_RUSH.game;
      return { boost: g.boostRemaining, speed: g.speed, tier: g._lastTier, fov: g.camera.fov,
        banner: document.getElementById('boost-banner').classList.contains('is-on'),
        bodyClass: document.body.classList.contains('is-boosting'),
        tierSpeedApprox: g.speed };
    });
    const monotonic = decay.every((s, i) => i === 0 || s.b <= decay[i - 1].b);
    check('BOOST: counts down monotonically and expires',
      monotonic && after.boost === 0, `${decay.length} frames sampled`);
    check('BOOST: indicator clears when it expires',
      !after.banner && !after.bodyClass);
    check('BOOST: speed returns to the normal progressive speed',
      Math.abs(after.speed - 13) < 0.6 && after.speed < during.speed - 3,
      `${during.speed.toFixed(1)} → ${after.speed.toFixed(1)}, back at the tier-0 cruise of 13.0`);
    check('BOOST: field of view returns to normal',
      Math.abs(after.fov - base.fov) < 1.0, `fov back to ${after.fov.toFixed(1)}`);

    // capped so it never becomes uncontrollable
    const capped = await p.evaluate(() => {
      const g = window.NURSE_RUSH.game;
      const R = window.NURSE_RUSH.ROUND;
      g.roundTime = 105;              // maximum tier
      g.boostRemaining = 5;
      const tierSpeed = 28;           // MAXIMUM tier cruising speed
      return { cap: R.BOOST_MAX_SPEED, uncapped: tierSpeed + R.BOOST_ADD };
    });
    check('BOOST: capped so the maximum tier stays controllable',
      capped.cap < capped.uncapped,
      `would be ${capped.uncapped} uncapped, capped at ${capped.cap}`);

    // refresh rather than stack
    const stack = await p.evaluate(() => {
      const g = window.NURSE_RUSH.game;
      const LANE_X = [-2.3, 0, 2.3];
      g.boostRemaining = 0;
      const collectOne = () => {
        for (const c of g.world.collectibles) c.obj.position.z = -900;
        g.world._spawnOxygen(0);
        const ox = g.world.collectibles.find((c) => c.data.kind === 'oxygen' && !c.taken);
        g.lane = ox.lane; g.laneX = LANE_X[ox.lane]; g.playerY = 0;
        ox.obj.position.set(LANE_X[ox.lane], 0.95, 0);
        g._collisions();
      };
      collectOne(); const first = g.boostRemaining;
      collectOne(); const second = g.boostRemaining;
      return { first, second };
    });
    check('BOOST: a second pickup refreshes rather than stacks',
      Math.abs(stack.second - 5) < 0.01, `${stack.first} s then ${stack.second} s`);
    await ctx.close();
  }

  /* ================= spawn rarity and fairness ================= */
  {
    const { ctx, p } = await newPage(browser);
    await startGameplay(p);
    const spawn = await p.evaluate(() => {
      const g = window.NURSE_RUSH.game;
      const w = g.world;
      // clear and simulate a long run, logging where oxygen lands
      for (const c of w.collectibles) { c.obj.position.z = -900; }
      const oxZ = [];
      const origSpawn = w._spawnOxygen.bind(w);
      w._spawnOxygen = (z) => {
        const ok = origSpawn(z);
        if (ok) oxZ.push(w.distance);
        return ok;
      };
      let coins = 0;
      const origCoin = w._spawnCoinRun.bind(w);
      w._spawnCoinRun = (z) => { coins++; return origCoin(z); };

      w.setSpeed(20);
      const DT = 1 / 60;
      for (let i = 0; i < 60 * 180; i++) w.update(DT, 3);   // ~3 minutes of running

      const gaps = oxZ.slice(1).map((v, i) => v - oxZ[i]);
      return {
        distance: w.distance, oxygen: oxZ.length, coinRuns: coins,
        minGap: gaps.length ? Math.min(...gaps) : null,
        avgGap: gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : null,
      };
    });
    const ratio = spawn.coinRuns / Math.max(1, spawn.oxygen);
    check('SPAWN: oxygen is rare compared with coins',
      spawn.oxygen > 0 && ratio > 8,
      `${spawn.distance.toFixed(0)} m simulated: ${spawn.oxygen} oxygen vs ${spawn.coinRuns} coin runs (1 per ${ratio.toFixed(0)})`);
    check('SPAWN: never placed close together',
      spawn.minGap === null || spawn.minGap >= 250,
      `closest pair ${spawn.minGap === null ? 'n/a' : spawn.minGap.toFixed(0) + ' m'}, average ${spawn.avgGap ? spawn.avgGap.toFixed(0) + ' m' : 'n/a'}`);

    // fairness: the chosen lane is clear of obstacles
    const fair = await p.evaluate(() => {
      const g = window.NURSE_RUSH.game;
      const w = g.world;
      let placements = 0, blocked = 0;
      for (let i = 0; i < 160; i++) {
        w._spawnObstacleRow(-200 - (i % 9) * 12, 3);
        const z = -200 - (i % 9) * 12 + 4;
        const before = w.collectibles.length;
        const ok = w._spawnOxygen(z);
        if (!ok) continue;
        placements++;
        const ox = w.collectibles[w.collectibles.length - 1];
        const clash = w.obstacles.some((o) =>
          (o.lane === -1 || o.lane === ox.lane) && Math.abs(o.obj.position.z - ox.obj.position.z) < 16);
        if (clash) blocked++;
      }
      return { placements, blocked };
    });
    check('SPAWN: never placed in an unavoidable position',
      fair.placements > 0 && fair.blocked === 0,
      `${fair.placements} placements checked, ${fair.blocked} with an obstacle in the same lane nearby`);

    const visual = await p.evaluate(() => {
      const g = window.NURSE_RUSH.game;
      const w = g.world;
      w._spawnOxygen(-40);
      const ox = w.collectibles.filter((c) => c.data.kind === 'oxygen').pop();
      return { y: ox.baseY, hasHalo: !!ox.halo, label: ox.data.label, boost: ox.data.boost,
        haloCount: ox.obj.children.filter((c) => c.material && c.material.blending === 2).length };
    });
    check('SPAWN: reads as a collectible (floats, glowing halo)',
      visual.y > 0.9 && visual.hasHalo && visual.boost === true && visual.haloCount === 1,
      `floats at y=${visual.y}, one glow halo, labelled "${visual.label}"`);
    await ctx.close();
  }

  /* ================= missing one costs nothing ================= */
  {
    const { ctx, p } = await newPage(browser);
    await startGameplay(p);
    const miss = await p.evaluate(() => {
      const g = window.NURSE_RUSH.game;
      const LANE_X = [-2.3, 0, 2.3];
      for (const o of g.world.obstacles) o.obj.position.z = -900;
      for (const c of g.world.collectibles) c.obj.position.z = -900;
      g.world._spawnOxygen(0);
      const ox = g.world.collectibles.find((c) => c.data.kind === 'oxygen' && !c.taken);
      // stand in a DIFFERENT lane so it goes by untouched
      const otherLane = (ox.lane + 1) % 3;
      g.lane = otherLane; g.laneX = LANE_X[otherLane]; g.playerY = 0;
      ox.obj.position.set(LANE_X[ox.lane], 0.95, 0);
      const s0 = g.score;
      g._collisions();
      return { score: g.score - s0, slow: g.slowUntil, state: g.state, boost: g.boostRemaining, taken: ox.taken };
    });
    check('MISSING one has no penalty',
      miss.score === 0 && miss.slow === 0 && miss.state === 'running' && miss.boost === 0 && !miss.taken,
      'no score change, no slow-down, round continues');
    await ctx.close();
  }

  await browser.close();

  const fails = results.filter((r) => !r.ok);
  console.log('\n======================================================');
  console.log(`${results.length - fails.length}/${results.length} checks passed`);
  console.log(consoleErrors.length
    ? `\nConsole/page errors (${consoleErrors.length}):\n  ` + [...new Set(consoleErrors)].slice(0, 8).join('\n  ')
    : 'No console or page errors.');
  if (fails.length) {
    console.log('\nFAILURES:');
    fails.forEach((f) => console.log(`  ✗ ${f.name} — ${f.detail}`));
    process.exit(1);
  }
  console.log('\nALL NURSE APPEARANCE + OXYGEN BOOST TESTS PASSED');
}

run().catch((e) => {
  console.error('\nHARNESS ERROR:', e.message);
  const fails = results.filter((r) => !r.ok);
  console.log(`${results.length - fails.length}/${results.length} completed before the error`);
  fails.forEach((f) => console.log(`  ✗ ${f.name} — ${f.detail}`));
  consoleErrors.slice(0, 8).forEach((x) => console.log('  !', x));
  process.exit(1);
});
