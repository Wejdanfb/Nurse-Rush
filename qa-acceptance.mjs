/**
 * NURSE RUSH - final acceptance test.
 * Walks the client's QA checklist item by item and reports PASS/FAIL per line.
 */
import { chromium } from 'playwright';

const URL = process.env.URL || 'http://127.0.0.1:4200/';
const results = [];
const consoleErrors = [];

function check(section, name, ok, detail = '') {
  results.push({ section, name, ok: !!ok, detail });
  const tag = ok ? '  PASS' : '✗ FAIL';
  console.log(`${tag}  [${section}] ${name}${detail ? '  — ' + detail : ''}`);
}

function attach(page, label) {
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(`${label}: ${m.text()}`);
  });
  page.on('pageerror', (e) => consoleErrors.push(`${label}: pageerror ${e.message}`));
}

const W = (p, fn, t = 420000) => p.waitForFunction(fn, { timeout: t });
const state = (p, s, t = 420000) =>
  p.waitForFunction((x) => window.NURSE_RUSH && window.NURSE_RUSH.game.state === x, s, { timeout: t });

async function run() {
  const browser = await chromium.launch({
    executablePath: '/usr/bin/google-chrome',
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
      '--no-sandbox', '--disable-dev-shm-usage', '--mute-audio'],
  });

  /* ================= 1. INTRO ================= */
  const ctx = await browser.newContext({ viewport: { width: 900, height: 560 } });
  const page = await ctx.newPage();
  attach(page, 'desktop');
  await page.goto(URL, { waitUntil: 'networkidle' });
  await W(page, () => !!window.NURSE_RUSH, 60000);

  await page.click('#btn-play');
  await state(page, 'intro', 60000);

  // walk phase
  const walk = await page.evaluate(() => {
    const c = window.NURSE_RUSH.game.cinematic;
    return { phase: c.phase, nurseState: window.NURSE_RUSH.game.nurse.state, z: c.z };
  });
  await page.waitForTimeout(1500);
  const walked = await page.evaluate(() => {
    const c = window.NURSE_RUSH.game.cinematic;
    return { z: c.z, nurseState: window.NURSE_RUSH.game.nurse.state, speed: c.speed };
  });
  check('1 INTRO', 'nurse walks inside the hospital',
    walk.phase === 'walk' && walked.nurseState === 'walk' && walked.z < walk.z,
    `z ${walk.z.toFixed(1)} → ${walked.z.toFixed(1)}, anim=${walked.nurseState}`);

  // alarm
  await W(page, () => window.NURSE_RUSH.game.cinematic?.phase === 'react', 90000);
  await page.waitForTimeout(900);
  const alarm = await page.evaluate(() => {
    const g = window.NURSE_RUSH.game, c = g.cinematic;
    return {
      siren: !!g.audio.sirenNodes,
      audioEnabled: g.audio.enabled,
      alarm: c.alarm,
      strobe: c.corridor.strobeMat.emissiveIntensity,
      redA: c.corridor.redA.intensity,
      redB: c.corridor.redB.intensity,
      banner: document.getElementById('alert-banner').classList.contains('is-on'),
      bannerText: document.querySelector('.alert-banner__main').textContent.trim(),
    };
  });
  check('1 INTRO', 'emergency alarm plays',
    alarm.siren && alarm.audioEnabled, `siren node active=${alarm.siren}`);
  check('1 INTRO', 'red emergency lights activate',
    alarm.alarm > 0.5 && (alarm.strobe > 0.5 || alarm.redA > 0.5 || alarm.redB > 0.5),
    `alarm=${alarm.alarm.toFixed(2)} strobe=${alarm.strobe.toFixed(2)} lights=${alarm.redA.toFixed(1)}/${alarm.redB.toFixed(1)}`);
  check('1 INTRO', 'EMERGENCY ALERT message shown',
    alarm.banner && /EMERGENCY ALERT/.test(alarm.bannerText), alarm.bannerText);

  // run + doors + exit
  await W(page, () => window.NURSE_RUSH.game.cinematic?.phase === 'run', 90000);
  const ranState = await page.evaluate(() => window.NURSE_RUSH.game.nurse.state);
  check('1 INTRO', 'nurse runs through the hospital', ranState === 'run', `anim=${ranState}`);

  const doors = await W(page, () => window.NURSE_RUSH.game.cinematic?.doorT >= 1, 300000)
    .then(() => true).catch(() => false);
  check('1 INTRO', 'exit doors open', doors);

  const outside = await W(page,
    () => !window.NURSE_RUSH.game.cinematic || window.NURSE_RUSH.game.cinematic.outsideT > 0.5, 300000)
    .then(() => true).catch(() => false);
  check('1 INTRO', 'nurse exits the hospital to the ambulance bay', outside);

  // camera transition
  const camBefore = await page.evaluate(() => {
    const c = window.NURSE_RUSH.game.camera.position;
    return [c.x, c.y, c.z];
  });
  await state(page, 'running');
  const handoff = await page.evaluate(() => {
    const g = window.NURSE_RUSH.game;
    return { fade: g._fadeIn, roundTime: g.roundTime, cinematic: !!g.cinematic, hud: document.getElementById('hud').classList.contains('is-active') };
  });
  check('1 INTRO', 'camera transitions smoothly into gameplay',
    handoff.cinematic === false && handoff.fade > 0 && handoff.hud,
    `cross-fade active (fade=${handoff.fade.toFixed(2)}), cinematic torn down, HUD up`);
  check('1 INTRO', 'intro is excluded from the 120 s timer',
    handoff.roundTime < 1.0, `roundTime at gameplay start = ${handoff.roundTime.toFixed(2)} s`);

  /* ================= 2. GAMEPLAY ================= */
  await page.waitForTimeout(1200);

  // --- three lanes via keyboard ---
  const laneSeq = [];
  for (const [key, label] of [['ArrowLeft', 'L'], ['ArrowLeft', 'L'], ['ArrowRight', 'R'], ['ArrowRight', 'R'], ['ArrowRight', 'R']]) {
    await page.keyboard.press(key);
    await page.waitForTimeout(420);
    laneSeq.push(await page.evaluate(() => window.NURSE_RUSH.game.lane));
  }
  const lanesVisited = [...new Set(laneSeq)].sort();
  check('2 GAMEPLAY', 'all three lanes reachable',
    lanesVisited.length === 3 && lanesVisited[0] === 0 && lanesVisited[2] === 2,
    `lane sequence ${laneSeq.join('→')}`);

  const laneX = await page.evaluate(() => {
    const g = window.NURSE_RUSH.game;
    return { clamped: [g.lane], x: g.laneX };
  });
  // clamping at the edges
  await page.evaluate(() => { window.NURSE_RUSH.game.lane = 2; });
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(300);
  const clampHigh = await page.evaluate(() => window.NURSE_RUSH.game.lane);
  await page.evaluate(() => { window.NURSE_RUSH.game.lane = 0; });
  await page.keyboard.press('ArrowLeft');
  await page.waitForTimeout(300);
  const clampLow = await page.evaluate(() => window.NURSE_RUSH.game.lane);
  check('2 GAMEPLAY', 'lane movement clamps at the edges (no sliding off the road)',
    clampHigh === 2 && clampLow === 0, `right-at-2 → ${clampHigh}, left-at-0 → ${clampLow}`);

  // --- jump ---
  await page.evaluate(() => { const g = window.NURSE_RUSH.game; g.lane = 1; g.playerY = 0; g.airborne = false; g.sliding = 0; });
  await page.keyboard.press('ArrowUp');
  await page.waitForTimeout(260);
  const jumped = await page.evaluate(() => {
    const g = window.NURSE_RUSH.game;
    return { y: g.playerY, airborne: g.airborne, anim: g.nurse.state, vy: g.vy };
  });
  check('2 GAMEPLAY', 'jumping works (keyboard ↑)',
    jumped.airborne && jumped.y > 0.3 && jumped.anim === 'jump',
    `y=${jumped.y.toFixed(2)} anim=${jumped.anim}`);

  // spacebar jump
  await W(page, () => !window.NURSE_RUSH.game.airborne, 60000);
  await page.keyboard.press('Space');
  await page.waitForTimeout(220);
  const spaceJump = await page.evaluate(() => window.NURSE_RUSH.game.airborne);
  check('2 GAMEPLAY', 'spacebar jumps', spaceJump);

  // --- slide ---
  await W(page, () => !window.NURSE_RUSH.game.airborne, 60000);
  await page.waitForTimeout(200);
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(200);
  const slid = await page.evaluate(() => {
    const g = window.NURSE_RUSH.game;
    return { sliding: g.sliding, anim: g.nurse.state };
  });
  check('2 GAMEPLAY', 'sliding works (keyboard ↓)',
    slid.sliding > 0 && slid.anim === 'slide', `slide timer=${slid.sliding.toFixed(2)} anim=${slid.anim}`);

  // --- obstacles present and varied ---
  const obstacleInfo = await page.evaluate(() => {
    const g = window.NURSE_RUSH.game;
    const kinds = {};
    for (let i = 0; i < 400; i++) g.world._spawnObstacleRow(-300 - i * 3, Math.floor(i / 70));
    for (const o of g.world.obstacles) kinds[o.data.kind] = (kinds[o.data.kind] || 0) + 1;
    return { kinds, total: g.world.obstacles.length };
  });
  const kindList = Object.keys(obstacleInfo.kinds);
  check('2 GAMEPLAY', 'ambulance and medical obstacles all spawn',
    ['ambulance', 'bed', 'wheelchair', 'cart', 'oxygen', 'equipbox', 'gantry'].every((k) => kindList.includes(k)),
    kindList.join(', '));

  // --- fairness: never all three lanes blocked by non-clearable obstacles ---
  const fairness = await page.evaluate(() => {
    const g = window.NURSE_RUSH.game;
    // group obstacles by z bucket and look for a bucket where all 3 lanes are 'full'
    const rows = new Map();
    for (const o of g.world.obstacles) {
      const key = Math.round(o.obj.position.z / 3);
      if (!rows.has(key)) rows.set(key, []);
      rows.get(key).push(o);
    }
    let blocked = 0;
    for (const [, list] of rows) {
      const fullLanes = new Set(list.filter((o) => o.data.clear === 'full').map((o) => o.lane));
      if (fullLanes.size >= 3) blocked++;
    }
    return { rows: rows.size, blocked };
  });
  check('2 GAMEPLAY', 'obstacle rows always leave a passable lane',
    fairness.blocked === 0, `${fairness.rows} rows sampled, ${fairness.blocked} fully blocked`);

  // --- collision detection (deterministic, exercises the shipped code) ---
  const collision = await page.evaluate(() => {
    const g = window.NURSE_RUSH.game;
    const LANE_X = [-2.3, 0, 2.3];
    const out = {};

    const place = (pred) => {
      const o = g.world.obstacles.find((x) => pred(x));
      if (!o) return null;
      o.obj.position.set(LANE_X[1], 0, 0);
      o.lane = 1;
      o.hit = false;
      return o;
    };
    const reset = () => { g.lane = 1; g.laneX = LANE_X[1]; g.playerY = 0; g.sliding = 0; g.airborne = false; };

    // a) running into a jumpable obstacle on the ground -> hit
    let o = place((x) => x.data.clear === 'jump');
    reset();
    const scoreBefore = g.score;
    g._collisions();
    out.groundHit = o.hit;
    out.penaltyApplied = g.score < scoreBefore || scoreBefore === 0;
    out.slowApplied = g.slowUntil > 0;

    // b) jumping over it -> no hit
    o = place((x) => x.data.clear === 'jump');
    reset();
    g.playerY = o.data.top + 0.1;
    g.airborne = true;
    g._collisions();
    out.jumpClears = !o.hit;
    out.jumpTop = o.data.top;

    // c) jumping too low -> hit
    o = place((x) => x.data.clear === 'jump');
    reset();
    g.playerY = Math.max(0, o.data.top - 0.6);
    g.airborne = true;
    g._collisions();
    out.lowJumpHits = o.hit;

    // d) the full-width arch while running -> hit
    o = place((x) => x.data.clear === 'slide');
    if (o) {
      reset();
      g._collisions();
      out.archRunHit = o.hit;
      // e) sliding under it -> no hit
      o = place((x) => x.data.clear === 'slide');
      reset();
      g.sliding = 0.5;
      g._collisions();
      out.slideClears = !o.hit;
    }

    // f) ambulance cannot be jumped
    o = place((x) => x.data.clear === 'full');
    reset();
    g.playerY = 2.0;
    g.airborne = true;
    g._collisions();
    out.ambulanceNotJumpable = o.hit;

    // g) a different lane is safe
    o = place((x) => x.data.clear === 'full');
    reset();
    g.lane = 0; g.laneX = LANE_X[0];
    g._collisions();
    out.otherLaneSafe = !o.hit;

    return out;
  });
  check('2 GAMEPLAY', 'collision: running into an obstacle registers a hit', collision.groundHit);
  check('2 GAMEPLAY', 'collision: jumping clears a jumpable obstacle',
    collision.jumpClears, `clearance height ${collision.jumpTop}`);
  check('2 GAMEPLAY', 'collision: a too-low jump still hits', collision.lowJumpHits);
  check('2 GAMEPLAY', 'collision: the imaging arch hits a running player', collision.archRunHit);
  check('2 GAMEPLAY', 'collision: sliding clears the imaging arch', collision.slideClears);
  check('2 GAMEPLAY', 'collision: an ambulance cannot be jumped over', collision.ambulanceNotJumpable);
  check('2 GAMEPLAY', 'collision: a clear lane is safe', collision.otherLaneSafe);
  check('2 GAMEPLAY', 'obstacle hit applies a slow-down, not a game over', collision.slowApplied);

  // --- collectibles ---
  const collect = await page.evaluate(() => {
    const g = window.NURSE_RUSH.game;
    const LANE_X = [-2.3, 0, 2.3];
    const out = { kinds: {} };
    // park every obstacle out of reach so only the collectible under test
    // can register
    for (const o of g.world.obstacles) o.obj.position.z = -900;

    for (const kind of ['coin', 'cash', 'stethoscope', 'firstaid', 'supplies']) {
      let c = g.world.collectibles.find((x) => x.data.kind === kind && !x.taken);
      for (let i = 0; i < 400 && !c; i++) {
        g.world._spawnCoinRun(-400 - i * 2);
        c = g.world.collectibles.find((x) => x.data.kind === kind && !x.taken);
      }
      if (!c) { out.kinds[kind] = 'not spawned'; continue; }

      // isolate: push every OTHER collectible far away so a coin line
      // can't collect several at once and skew the per-item reading
      for (const other of g.world.collectibles) {
        if (other !== c) other.obj.position.z = -900;
      }

      g.lane = c.lane; g.laneX = LANE_X[c.lane]; g.playerY = 0; g.sliding = 0; g.airborne = false;
      c.obj.position.set(LANE_X[c.lane], 0.95, 0);
      const s0 = g.score, co0 = g.coins;
      g._collisions();
      out.kinds[kind] = {
        taken: c.taken,
        scoreDelta: g.score - s0,
        coinDelta: g.coins - co0,
        expectedScore: c.data.score,
        expectedCoins: c.data.coins,
      };
    }
    return out;
  });
  const collectOk = Object.entries(collect.kinds).every(([, v]) =>
    v !== 'not spawned' && v.taken && v.scoreDelta === v.expectedScore && v.coinDelta === v.expectedCoins);
  check('2 GAMEPLAY', 'collectibles: all five types collect and score correctly',
    collectOk, Object.entries(collect.kinds).map(([k, v]) =>
      v === 'not spawned' ? `${k}:MISSING` : `${k} +${v.scoreDelta}/${v.coinDelta}c`).join('  '));

  /* ================= 3. QUESTION SYSTEM ================= */
  await ctx.close();

  /* ---- the rest of section 3 needs the module, so load it from source ---- */
  const modCtx = await browser.newContext({ viewport: { width: 900, height: 560 } });
  const modPage = await modCtx.newPage();
  attach(modPage, 'module');
  await modPage.goto(URL, { waitUntil: 'networkidle' });
  await W(modPage, () => !!window.NURSE_RUSH, 60000);

  const audit = await modPage.evaluate(() => {
    const api = window.NURSE_RUSH.questionApi;
    if (!api) return { missing: true };
    const { QUESTIONS, validateBank, pickRoundQuestions, prepare } = api;

    const issues = validateBank();
    const tf = QUESTIONS.filter((q) => q.type === 'tf').map((q) => q.id);
    const mcq = QUESTIONS.filter((q) => q.type === 'mcq').map((q) => q.id);

    // two different questions per round, randomised across rounds
    const pairs = [];
    for (let i = 0; i < 500; i++) pairs.push(pickRoundQuestions());
    const sameInRound = pairs.filter(([a, b]) => a.id === b.id).length;
    const distinctPairs = new Set(pairs.map(([a, b]) => [a.id, b.id].sort().join('+'))).size;
    const consecutiveIdentical = pairs.slice(1).filter((p, i) => {
      const prev = pairs[i];
      return [p[0].id, p[1].id].sort().join() === [prev[0].id, prev[1].id].sort().join();
    }).length;
    const idsSeen = new Set(pairs.flat().map((q) => q.id)).size;

    // shuffling: options reorder but exactly one stays correct and maps to the key
    let shuffleBroken = 0, correctCountWrong = 0, textMismatch = 0, positions = {};
    for (const q of QUESTIONS) {
      for (let i = 0; i < 200; i++) {
        const p = prepare(q);
        const nCorrect = p.options.filter((o) => o.isCorrect).length;
        if (nCorrect !== 1) correctCountWrong++;
        const idx = p.options.findIndex((o) => o.isCorrect);
        if (p.options[idx].text !== q.options[q.correct]) textMismatch++;
        if (p.options[idx].text !== p.correctText) textMismatch++;
        if (p.options.length !== q.options.length) shuffleBroken++;
        positions[q.id] = positions[q.id] || new Set();
        positions[q.id].add(idx);
      }
    }
    const everShuffled = Object.values(positions).every((s) => s.size > 1);

    return {
      issues, total: QUESTIONS.length, tf, mcq,
      sameInRound, distinctPairs, consecutiveIdentical, idsSeen,
      correctCountWrong, textMismatch, shuffleBroken, everShuffled,
    };
  });

  if (audit.missing) {
    check('3 QUESTIONS', 'question module exposed for audit', false, 'window.NURSE_RUSH.questionApi missing');
  } else {
    check('3 QUESTIONS', 'all 20 questions imported and valid',
      audit.total === 20 && audit.issues.length === 0,
      `${audit.total} questions, validateBank issues: ${audit.issues.length ? audit.issues.join('; ') : 'none'}`);
    check('3 QUESTIONS', 'True/False questions present and typed',
      audit.tf.length === 5, `TF: ${audit.tf.join(',')} | MCQ: ${audit.mcq.length}`);
    check('3 QUESTIONS', 'exactly two DIFFERENT questions per round',
      audit.sameInRound === 0, `${audit.sameInRound} duplicate-in-round over 500 rounds`);
    check('3 QUESTIONS', 'selection randomised between rounds',
      audit.distinctPairs > 100 && audit.consecutiveIdentical === 0 && audit.idsSeen === 20,
      `${audit.distinctPairs} distinct pairs over 500 rounds, all ${audit.idsSeen} ids used, 0 back-to-back repeats`);
    check('3 QUESTIONS', 'options shuffle without breaking the correct answer',
      audit.correctCountWrong === 0 && audit.textMismatch === 0 && audit.shuffleBroken === 0 && audit.everShuffled,
      `4000 shuffles: exactly one correct option every time, text always matches the answer key`);
  }

  /* ---- live question behaviour ---- */
  await modPage.click('#btn-play');
  await state(modPage, 'intro', 60000);
  const skipVisible = await modPage.evaluate(() => {
    const b = document.getElementById('btn-skip');
    const r = b.getBoundingClientRect();
    return { visible: r.height > 0 && getComputedStyle(b).display !== 'none', h: Math.round(r.height) };
  });
  const tSkip = Date.now();
  await modPage.click('#btn-skip');
  const skipped = await state(modPage, 'running', 90000).then(() => true).catch(() => false);
  const afterSkip = await modPage.evaluate(() => {
    const g = window.NURSE_RUSH.game;
    return { cinematic: !!g.cinematic, roundTime: g.roundTime, hud: document.getElementById('hud').classList.contains('is-active') };
  });
  check('1 INTRO', 'Skip Intro works',
    skipVisible.visible && skipped && !afterSkip.cinematic && afterSkip.hud && afterSkip.roundTime < 3,
    `button ${skipVisible.h}px, reached gameplay in ${((Date.now() - tSkip) / 1000).toFixed(1)} s wall, corridor torn down, round timer at ${afterSkip.roundTime.toFixed(2)} s`);

  await modPage.evaluate(() => { window.NURSE_RUSH.game.roundTime = 24.9; });
  await state(modPage, 'question', 90000);
  await modPage.waitForTimeout(700);

  const qLive = await modPage.evaluate(() => {
    const g = window.NURSE_RUSH.game;
    const opts = [...document.querySelectorAll('.opt')];
    return {
      inputs: document.querySelectorAll('#question input, #question textarea, #question [contenteditable]').length,
      buttons: opts.length,
      allButtons: opts.every((b) => b.tagName === 'BUTTON'),
      clickable: opts.every((b) => !b.disabled),
      type: g.activeQuestion.type,
      overlayCoversAll: (() => {
        const c = document.querySelector('.qcard').getBoundingClientRect();
        return c.top <= 2; // true would mean the card covers the whole screen
      })(),
      timerRunning: g.roundTime > 34.5,
      movementStopped: g.speed < 14,
      answerLimit: g.questionClock,
    };
  });
  check('3 QUESTIONS', 'answers are selectable buttons only — no typing',
    qLive.inputs === 0 && qLive.allButtons && qLive.buttons >= 2,
    `${qLive.buttons} buttons, ${qLive.inputs} text inputs`);
  check('3 QUESTIONS', 'question overlay does not hide the whole environment',
    !qLive.overlayCoversAll);
  check('3 QUESTIONS', 'character stops while a question is shown', qLive.movementStopped);
  check('3 QUESTIONS', '30-second answer limit', Math.abs(qLive.answerLimit - 30) < 1.5,
    `clock started at ${qLive.answerLimit.toFixed(1)} s`);

  // correct answer continues
  const beforeCorrect = await modPage.evaluate(() => window.NURSE_RUSH.game.score);
  await modPage.evaluate(() => {
    const g = window.NURSE_RUSH.game;
    document.querySelectorAll('.opt')[g.correctIndex].click();
  });
  await modPage.waitForTimeout(700);
  const feedbackShown = await modPage.evaluate(() =>
    document.getElementById('q-feedback').classList.contains('is-on'));
  await state(modPage, 'running', 90000);
  const afterCorrect = await modPage.evaluate(() => {
    const g = window.NURSE_RUSH.game;
    return { score: g.score, correct: g.correctAnswers, hud: document.getElementById('hud-questions').textContent };
  });
  check('3 QUESTIONS', 'immediate feedback shown after selecting', feedbackShown);
  check('3 QUESTIONS', 'correct answer = +100 and gameplay continues',
    afterCorrect.score - beforeCorrect === 100 && afterCorrect.correct === 1,
    `+${afterCorrect.score - beforeCorrect}, HUD ${afterCorrect.hud}, state resumed to running`);

  // wrong answer -> immediate game over
  await modPage.evaluate(() => { window.NURSE_RUSH.game.roundTime = window.NURSE_RUSH.game.nextQuestionAt + 0.05; });
  await state(modPage, 'question', 90000);
  await modPage.evaluate(() => {
    const g = window.NURSE_RUSH.game;
    document.querySelectorAll('.opt')[g.correctIndex === 0 ? 1 : 0].click();
  });
  const gotGameOver = await modPage.waitForSelector('#gameover.is-active', { timeout: 90000 })
    .then(() => true).catch(() => false);
  const loseInfo = await modPage.evaluate(() => ({
    reviewShown: document.getElementById('lose-review').classList.contains('is-on'),
    correctShown: document.getElementById('review-correct').innerText,
    title: document.querySelector('.result-title--lose').textContent.trim(),
  }));
  check('3 QUESTIONS', 'wrong answer triggers immediate GAME OVER', gotGameOver, loseInfo.title);
  check('5 END SCREENS', 'game over reveals the question and the correct answer',
    loseInfo.reviewShown && /correct answer/i.test(loseInfo.correctShown));

  // no answer within the 10-second limit -> game over
  await modPage.click('#btn-lose-again');
  await state(modPage, 'running', 300000);
  await modPage.evaluate(() => { window.NURSE_RUSH.game.roundTime = 24.9; });
  await state(modPage, 'question', 90000);
  await modPage.evaluate(() => {
    const g = window.NURSE_RUSH.game;
    // countdown is derived from the round clock, so advance that
    g.roundTime = g.questionOpenedAt + window.NURSE_RUSH.ROUND.ANSWER_LIMIT + 0.05;
  });
  const timedOut = await modPage.waitForSelector('#gameover.is-active', { timeout: 90000 })
    .then(() => true).catch(() => false);
  const toInfo = await modPage.evaluate(() => ({
    reason: document.getElementById('lose-reason').textContent,
    noAnswer: document.getElementById('review-chosen').innerText,
    kicker: document.querySelector('#gameover .result-kicker').textContent.trim(),
  }));
  check('3 QUESTIONS', 'running out of the 30-second limit ends the shift',
    timedOut && /30-second limit/i.test(toInfo.reason) && /TIME'S UP/i.test(toInfo.kicker),
    `${toInfo.kicker} — ${toInfo.reason}`);
  check('5 END SCREENS', 'timeout game over states that no answer was given',
    /no answer/i.test(toInfo.noAnswer), toInfo.noAnswer.replace(/\n/g, ' '));

  /* ================= 4. TIMER AND SPEED ================= */
  await modPage.click('#btn-lose-again');
  await state(modPage, 'running', 300000);

  const timerCfg = await modPage.evaluate(() => {
    const g = window.NURSE_RUSH.game;
    return {
      duration: window.NURSE_RUSH.ROUND ? window.NURSE_RUSH.ROUND.DURATION : null,
      firstAt: window.NURSE_RUSH.ROUND ? window.NURSE_RUSH.ROUND.FIRST_QUESTION_AT : null,
      secondAfter: window.NURSE_RUSH.ROUND ? window.NURSE_RUSH.ROUND.SECOND_QUESTION_AFTER_RESUME : null,
      limit: window.NURSE_RUSH.ROUND ? window.NURSE_RUSH.ROUND.ANSWER_LIMIT : null,
      startLabel: document.getElementById('timer-value').textContent,
      roundTime: g.roundTime,
    };
  });
  check('4 TIMER', 'round is exactly 120 seconds',
    timerCfg.duration === 120, `ROUND.DURATION=${timerCfg.duration}, HUD starts at ${timerCfg.startLabel}`);
  check('4 TIMER', 'Q1 at 25 s, Q2 20 s after resuming from Q1',
    timerCfg.firstAt === 25 && timerCfg.secondAfter === 20,
    `FIRST_QUESTION_AT=${timerCfg.firstAt}, SECOND_QUESTION_AFTER_RESUME=${timerCfg.secondAfter}`);

  // Speed tiers. Any question that opens is answered immediately so the
  // sample is never taken while the nurse is stopped at a question.
  await modPage.evaluate(() => {
    const g = window.NURSE_RUSH.game;
    window.__autoAnswer = setInterval(() => {
      if (g.state === 'question' && !g.answerLocked) {
        document.querySelectorAll('.opt')[g.correctIndex].click();
      }
    }, 120);
  });

  const tiers = [];
  for (const t of [1, 21, 41, 61, 81, 101]) {
    await modPage.evaluate((tt) => {
      const g = window.NURSE_RUSH.game;
      g.roundTime = tt;
      g.slowUntil = 0;
    }, t);
    // Let any question resolve, then clear the road and the slow-down timer
    // so the sample measures the tier's cruising speed rather than a
    // legitimate post-collision dip.
    await state(modPage, 'running', 90000);
    await modPage.evaluate(() => { window.__prevSpeed = -1; });
    // Poll until the eased speed has actually converged. A fixed wall-clock
    // wait is useless here: under the software rasteriser only a handful of
    // frames pass per second, so game time barely advances.
    await W(modPage, () => {
      const g = window.NURSE_RUSH.game;
      for (const o of g.world.obstacles) o.obj.position.z = -900;
      g.slowUntil = 0;
      const d = Math.abs(g.speed - window.__prevSpeed);
      window.__prevSpeed = g.speed;
      return g.speed > 1 && d < 0.06;
    }, 180000);
    const s = await modPage.evaluate(() => {
      const g = window.NURSE_RUSH.game;
      return {
        tier: g._lastTier, speed: +g.speed.toFixed(1),
        label: document.getElementById('speed-label').textContent,
        bar: document.getElementById('speed-fill').style.width,
        state: g.state, slowed: g.slowUntil > 0,
      };
    });
    tiers.push(s);
  }
  await modPage.evaluate(() => clearInterval(window.__autoAnswer));

  const tierNums = tiers.map((s) => s.tier);
  const speeds = tiers.map((s) => s.speed);
  const tiersAscend = tierNums.every((v, i) => i === 0 || v > tierNums[i - 1]);
  const speedsAscend = speeds.every((v, i) => i === 0 || v > speeds[i - 1]);
  const sixTiers = new Set(tierNums).size === 6;
  const noneSlowed = tiers.every((s) => !s.slowed);
  check('4 TIMER', 'speed increases progressively across all six tiers',
    tiersAscend && speedsAscend && sixTiers && noneSlowed,
    tiers.map((s) => `${s.label}=${s.speed}`).join('  '));
  check('4 TIMER', 'HUD speed indicator tracks the tier',
    tiers.every((s, i) => parseFloat(s.bar) > (i === 0 ? 0 : parseFloat(tiers[i - 1].bar))),
    tiers.map((s) => s.bar).join(' → '));

  await modCtx.close();

  /* ================= 5. END SCREENS (victory path) ================= */
  const vCtx = await browser.newContext({ viewport: { width: 900, height: 560 } });
  const vPage = await vCtx.newPage();
  attach(vPage, 'victory');
  await vPage.goto(URL, { waitUntil: 'networkidle' });
  await W(vPage, () => !!window.NURSE_RUSH, 60000);
  await vPage.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
  await vPage.reload({ waitUntil: 'networkidle' });
  await W(vPage, () => !!window.NURSE_RUSH, 60000);

  await vPage.click('#btn-play');
  await state(vPage, 'intro', 60000);
  await vPage.click('#btn-skip');
  await state(vPage, 'running');

  // answer both correctly, track the score ledger
  await vPage.evaluate(() => {
    const g = window.NURSE_RUSH.game;
    window.__ledger = { correct: 0, hits: 0, picks: 0 };
    const origHit = g._hitObstacle.bind(g);
    g._hitObstacle = (o) => { window.__ledger.hits++; return origHit(o); };
    const origCollect = g._collect.bind(g);
    g._collect = (c) => { window.__ledger.picks += c.data.score; return origCollect(c); };
    setInterval(() => {
      if (g.state === 'question' && !g.answerLocked) {
        window.__ledger.correct++;
        document.querySelectorAll('.opt')[g.correctIndex].click();
      }
    }, 150);
  });

  await vPage.evaluate(() => { window.NURSE_RUSH.game.roundTime = 24.9; });
  await W(vPage, () => window.NURSE_RUSH.game.correctAnswers === 1, 90000);
  await state(vPage, 'running', 90000);
  await vPage.evaluate(() => { window.NURSE_RUSH.game.roundTime = window.NURSE_RUSH.game.nextQuestionAt + 0.05; });
  await W(vPage, () => window.NURSE_RUSH.game.correctAnswers === 2, 90000);
  await state(vPage, 'running', 90000);

  // finish line
  await vPage.evaluate(() => { window.NURSE_RUSH.game.roundTime = 111.4; });
  await W(vPage, () => window.NURSE_RUSH.game.world.finishSpawned, 90000);
  const gateStart = await vPage.evaluate(() => window.NURSE_RUSH.game.world.finishGate.position.z);
  // deliberately slow the player down after the gate spawns - this is the
  // case that used to leave the finish line unreachable
  await vPage.evaluate(() => { window.NURSE_RUSH.game.slowUntil = 2.5; });
  const gateCrossed = await W(vPage,
    () => window.NURSE_RUSH.game.world.finishCrossed, 300000)
    .then(() => true).catch(() => false);
  const atCross = await vPage.evaluate(() => ({
    t: window.NURSE_RUSH.game.roundTime,
    z: window.NURSE_RUSH.game.world.finishGate?.position.z,
  }));
  check('4 TIMER', 'player reaches and crosses the finish line (even after being slowed)',
    gateCrossed && atCross.t < 120,
    `gate spawned ${Math.abs(gateStart).toFixed(0)} m ahead, crossed at t=${atCross.t?.toFixed(1)} s`);

  await vPage.waitForSelector('#victory.is-active', { timeout: 300000 });
  const win = await vPage.evaluate(() => {
    const g = window.NURSE_RUSH.game;
    return {
      title: document.querySelector('.result-title--win').textContent.trim(),
      score: +document.getElementById('win-score').textContent,
      coins: +document.getElementById('win-coins').textContent,
      correct: document.getElementById('win-correct').textContent,
      best: +document.getElementById('win-best').textContent,
      ledger: window.__ledger,
      gScore: g.score,
      roundTime: g.roundTime,
      correctAnswers: g.correctAnswers,
    };
  });
  check('5 END SCREENS', 'victory requires 2/2 correct AND the clock reaching zero',
    /YOU SURVIVED THE SHIFT/.test(win.title) && win.correct === '2/2' && win.roundTime >= 120,
    `${win.title} at t=${win.roundTime.toFixed(1)} s with ${win.correctAnswers}/2`);
  const expectedScore = win.ledger.picks + win.correctAnswers * 100 - win.ledger.hits * 50;
  check('5 END SCREENS', 'final score arithmetic is correct',
    win.score === win.gScore && win.score === Math.max(0, expectedScore),
    `shown ${win.score} = pickups ${win.ledger.picks} + answers ${win.correctAnswers * 100} − hits ${win.ledger.hits * 50}`);
  check('5 END SCREENS', 'best score persisted', win.best === win.score, `best=${win.best}`);

  // Play Again -> fresh round, new questions
  const prevIds = await vPage.evaluate(() => window.NURSE_RUSH.game.questions.map((q) => q.id));
  await vPage.click('#btn-win-again');
  await state(vPage, 'running', 300000);
  const fresh = await vPage.evaluate(() => {
    const g = window.NURSE_RUSH.game;
    return {
      ids: g.questions.map((q) => q.id),
      score: g.score, coins: g.coins, correct: g.correctAnswers,
      roundTime: g.roundTime, lane: g.lane, qIndex: g.questionIndex,
      finishSpawned: g.world.finishSpawned,
      timer: document.getElementById('timer-value').textContent,
      hudScore: document.getElementById('hud-score').textContent,
      hudQ: document.getElementById('hud-questions').textContent,
    };
  });
  check('5 END SCREENS', 'Play Again starts a genuinely fresh round',
    fresh.score === 0 && fresh.coins === 0 && fresh.correct === 0 && fresh.roundTime < 3 &&
    fresh.qIndex === 0 && !fresh.finishSpawned && fresh.hudScore === '0' && fresh.hudQ === '0/2',
    `score ${fresh.hudScore}, questions ${fresh.hudQ}, timer ${fresh.timer}`);
  check('5 END SCREENS', 'Play Again draws new random questions',
    fresh.ids.join() !== prevIds.join(), `${prevIds.join('+')} → ${fresh.ids.join('+')}`);

  // losing on time with only 1 correct
  await vPage.evaluate(() => {
    const g = window.NURSE_RUSH.game;
    g.correctAnswers = 1;
    g.questionIndex = 2;        // no more questions due
    g.nextQuestionAt = null;
    g.roundTime = 119.5;
  });
  const loseOnTime = await vPage.waitForSelector('#gameover.is-active', { timeout: 120000 })
    .then(() => true).catch(() => false);
  const loseReason = await vPage.evaluate(() => document.getElementById('lose-reason').textContent);
  check('5 END SCREENS', 'ending the round with fewer than 2/2 is a loss, not a win',
    loseOnTime, loseReason);

  await vCtx.close();

  /* ================= 6. RESPONSIVENESS + 2. TOUCH ================= */
  const devices = [
    ['iPhone 14 portrait', { width: 390, height: 844 }, 3],
    ['iPhone 14 landscape', { width: 844, height: 390 }, 3],
    ['iPad portrait', { width: 820, height: 1180 }, 2],
    ['iPad landscape', { width: 1180, height: 820 }, 2],
    ['Desktop 1440', { width: 1440, height: 900 }, 1],
  ];
  const iosUA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
  const ipadUA = 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

  for (const [name, vp, dpr] of devices) {
    const touch = !name.startsWith('Desktop');
    const dCtx = await browser.newContext({
      viewport: vp, deviceScaleFactor: dpr, hasTouch: touch, isMobile: touch,
      userAgent: name.includes('iPad') ? ipadUA : name.includes('iPhone') ? iosUA : undefined,
    });
    const d = await dCtx.newPage();
    attach(d, name);
    await d.goto(URL, { waitUntil: 'networkidle' });
    await W(d, () => !!window.NURSE_RUSH, 60000);
    if (await d.locator('#rotate.is-active').count()) await d.click('#btn-rotate-ok');
    await d.waitForTimeout(600);

    // menu layout: nothing overlapping, nothing off-screen
    const menuLayout = await d.evaluate(() => {
      const rects = {};
      for (const sel of ['.logo', '.menu-buttons', '#btn-play', '#btn-howto', '#btn-sound', '#dev-footer']) {
        const e = document.querySelector(sel);
        const r = e.getBoundingClientRect();
        rects[sel] = { t: Math.round(r.top), b: Math.round(r.bottom), l: Math.round(r.left), r: Math.round(r.right), h: Math.round(r.height) };
      }
      const vw = window.innerWidth, vh = window.innerHeight;
      const buttons = rects['.menu-buttons'];
      const footer = rects['#dev-footer'];
      return {
        vw, vh, rects,
        offscreen: Object.entries(rects).filter(([, r]) => r.t < -1 || r.b > vh + 1 || r.l < -1 || r.r > vw + 1).map(([k]) => k),
        buttonsOverFooter: buttons.b > footer.t + 1,
        logoOverButtons: rects['.logo'].b > buttons.t + 1,
      };
    });
    check('6 RESPONSIVE', `${name}: menu fits with no overlap`,
      menuLayout.offscreen.length === 0 && !menuLayout.buttonsOverFooter && !menuLayout.logoOverButtons,
      menuLayout.offscreen.length ? `off-screen: ${menuLayout.offscreen.join(', ')}`
        : menuLayout.buttonsOverFooter ? 'buttons overlap the footer'
        : menuLayout.logoOverButtons ? 'logo overlaps the buttons'
        : `${menuLayout.vw}×${menuLayout.vh}`);

    // footer exact text
    const footer = await d.evaluate(() => {
      const f = document.getElementById('dev-footer');
      const cs = getComputedStyle(f.querySelector('.dev-footer__text'));
      const r = f.getBoundingClientRect();
      return {
        dom: f.innerText.replace(/\s+/g, ' ').trim(),
        transform: cs.textTransform,
        visible: cs.display !== 'none' && cs.visibility !== 'hidden' && r.height > 0 && +cs.opacity > 0,
        fontSize: cs.fontSize,
      };
    });
    const renderedExact = footer.transform === 'none'
      ? footer.dom === 'Developed by Wejdan Boharam'
      : false;
    check('7 FOOTER', `${name}: renders exactly "Developed by Wejdan Boharam"`,
      renderedExact && footer.visible,
      `rendered as "${footer.transform === 'uppercase' ? footer.dom.toUpperCase() : footer.dom}" (text-transform: ${footer.transform})`);

    // tap targets on menu
    const taps = await d.evaluate(() => {
      const out = [];
      for (const b of document.querySelectorAll('#menu .btn')) {
        const r = b.getBoundingClientRect();
        out.push({ id: b.id, w: Math.round(r.width), h: Math.round(r.height) });
      }
      return out;
    });
    check('6 RESPONSIVE', `${name}: menu buttons meet the 44px tap target`,
      taps.every((t) => t.h >= 44), taps.map((t) => `${t.id}:${t.h}px`).join(' '));

    // --- gameplay + touch ---
    await d.click('#btn-play');
    await state(d, 'intro', 60000);
    await d.click('#btn-skip');
    await state(d, 'running');
    await d.waitForTimeout(900);

    if (touch) {
      const swipe = async (dx, dy) => {
        await d.evaluate(([x, y]) => {
          const c = document.getElementById('game-canvas');
          const mk = (cx, cy) => new Touch({ identifier: 1, target: c, clientX: cx, clientY: cy });
          const sx = window.innerWidth / 2, sy = window.innerHeight / 2;
          const fire = (type, t) => c.dispatchEvent(new TouchEvent(type, {
            touches: type === 'touchend' ? [] : [t], changedTouches: [t], bubbles: true, cancelable: true,
          }));
          fire('touchstart', mk(sx, sy));
          fire('touchmove', mk(sx + x * 0.5, sy + y * 0.5));
          fire('touchmove', mk(sx + x, sy + y));
          fire('touchend', mk(sx + x, sy + y));
        }, [dx, dy]);
        await d.waitForTimeout(350);
      };

      await d.evaluate(() => { const g = window.NURSE_RUSH.game; g.lane = 1; g.playerY = 0; g.airborne = false; g.sliding = 0; });
      await swipe(-90, 0);
      const left = await d.evaluate(() => window.NURSE_RUSH.game.lane);
      await swipe(90, 0);
      const back = await d.evaluate(() => window.NURSE_RUSH.game.lane);
      await swipe(90, 0);
      const right = await d.evaluate(() => window.NURSE_RUSH.game.lane);
      check('2 GAMEPLAY', `${name}: swipe left / right changes lane`,
        left === 0 && back === 1 && right === 2, `1 →${left} →${back} →${right}`);

      await d.evaluate(() => { const g = window.NURSE_RUSH.game; g.playerY = 0; g.airborne = false; g.sliding = 0; });
      await swipe(0, -90);
      const up = await d.evaluate(() => ({ air: window.NURSE_RUSH.game.airborne, y: window.NURSE_RUSH.game.playerY }));
      check('2 GAMEPLAY', `${name}: swipe up jumps`, up.air && up.y > 0.1, `y=${up.y.toFixed(2)}`);

      await W(d, () => !window.NURSE_RUSH.game.airborne, 60000);
      await d.evaluate(() => { const g = window.NURSE_RUSH.game; g.sliding = 0; });
      await swipe(0, 90);
      const down = await d.evaluate(() => window.NURSE_RUSH.game.sliding);
      check('2 GAMEPLAY', `${name}: swipe down slides`, down > 0, `slide timer=${down.toFixed(2)}`);
    }

    // HUD layout during gameplay
    const hud = await d.evaluate(() => {
      const r = (s) => { const e = document.querySelector(s); const b = e.getBoundingClientRect();
        return { t: Math.round(b.top), b: Math.round(b.bottom), l: Math.round(b.left), r: Math.round(b.right) }; };
      const vw = window.innerWidth, vh = window.innerHeight;
      const timer = r('.hud-timer'), stats = r('.hud-stats'), speed = r('.hud-speed'), footer = r('#dev-footer');
      return {
        vw, vh, timer, stats, speed, footer,
        timerOverStats: timer.r > stats.l,
        speedOverFooter: speed.b > footer.t + 1,
        offscreen: [['timer', timer], ['stats', stats], ['speed', speed]]
          .filter(([, x]) => x.t < -1 || x.b > vh + 1 || x.l < -1 || x.r > vw + 1).map(([k]) => k),
      };
    });
    check('6 RESPONSIVE', `${name}: HUD does not overlap or clip`,
      !hud.timerOverStats && !hud.speedOverFooter && hud.offscreen.length === 0,
      hud.timerOverStats ? 'timer overlaps the stat chips'
        : hud.speedOverFooter ? 'speed bar overlaps the footer'
        : hud.offscreen.length ? `clipped: ${hud.offscreen.join(',')}` : 'clear');

    // question card layout + tap targets
    await d.evaluate(() => { window.NURSE_RUSH.game.roundTime = 24.9; });
    await state(d, 'question', 90000);
    await d.waitForTimeout(700);
    const card = await d.evaluate(() => {
      const c = document.querySelector('.qcard').getBoundingClientRect();
      const f = document.getElementById('dev-footer').getBoundingClientRect();
      const opts = [...document.querySelectorAll('.opt')].map((b) => {
        const r = b.getBoundingClientRect();
        return { w: Math.round(r.width), h: Math.round(r.height), t: Math.round(r.top), b: Math.round(r.bottom) };
      });
      return {
        vh: window.innerHeight, vw: window.innerWidth,
        top: Math.round(c.top), bottom: Math.round(c.bottom), h: Math.round(c.height),
        footerTop: Math.round(f.top),
        opts,
        overlapsFooter: c.bottom > f.top + 1,
        anyClipped: opts.some((o) => o.t < 0 || o.b > window.innerHeight),
        envVisible: c.top > 40,
      };
    });
    check('6 RESPONSIVE', `${name}: question card fits and keeps the game visible`,
      !card.anyClipped && card.envVisible && card.bottom <= card.vh + 1,
      `card ${card.top}→${card.bottom} of ${card.vh}px`);
    check('6 RESPONSIVE', `${name}: answer buttons meet the 44px tap target`,
      card.opts.every((o) => o.h >= 44), card.opts.map((o) => `${o.h}px`).join(' '));
    check('6 RESPONSIVE', `${name}: question card clears the footer`, !card.overlapsFooter,
      `card bottom ${card.bottom}, footer top ${card.footerTop}`);

    // renderer sanity
    const q = await d.evaluate(() => {
      const g = window.NURSE_RUSH.game, i = g.renderer.info;
      return { shadows: g.quality.shadows, fov: g.camera.fov, calls: i.render.calls,
        tris: i.render.triangles, dpr: g.renderer.getPixelRatio().toFixed(2) };
    });
    check('6 RESPONSIVE', `${name}: renderer budget sane`,
      q.calls < 700 && q.tris < 120000,
      `${q.calls} draw calls, ${Math.round(q.tris / 1000)}k tris, dpr ${q.dpr}, shadows ${q.shadows}, fov ${q.fov}`);

    await dCtx.close();
  }

  await browser.close();

  /* ================= summary ================= */
  const fails = results.filter((r) => !r.ok);
  console.log('\n======================================================');
  console.log(`${results.length - fails.length}/${results.length} checks passed`);
  if (consoleErrors.length) {
    console.log(`\nConsole/page errors (${consoleErrors.length}):`);
    [...new Set(consoleErrors)].slice(0, 15).forEach((e) => console.log('  !', e));
  } else {
    console.log('No console or page errors in any context.');
  }
  if (fails.length) {
    console.log(`\nFAILURES (${fails.length}):`);
    fails.forEach((f) => console.log(`  ✗ [${f.section}] ${f.name}  — ${f.detail}`));
    process.exit(1);
  }
  console.log('\nALL ACCEPTANCE CHECKS PASSED');
}

run().catch((e) => {
  console.error('\nHARNESS ERROR:', e.message);
  const fails = results.filter((r) => !r.ok);
  console.log(`\n${results.length - fails.length}/${results.length} checks completed before the error`);
  fails.forEach((f) => console.log(`  ✗ [${f.section}] ${f.name} — ${f.detail}`));
  if (consoleErrors.length) [...new Set(consoleErrors)].slice(0, 10).forEach((x) => console.log('  !', x));
  process.exit(1);
});
