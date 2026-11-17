/**
 * Headless QA run for NURSE RUSH.
 * Walks the full flow: menu -> intro -> gameplay -> question 1 -> question 2
 * -> finish -> victory, and a separate run that answers wrongly to check the
 * game-over path. Fails the process on any console error or page error.
 */
import { chromium } from 'playwright';

const URL = process.env.URL || 'http://localhost:4173/';
const errors = [];
const logs = [];

const shot = (page, name) => page.screenshot({ path: `/home/claude/qa/${name}.png` });

function attach(page) {
  page.on('console', (m) => {
    const t = m.text();
    logs.push(`${m.type()}: ${t}`);
    if (m.type() === 'error') errors.push(t);
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}\n${e.stack || ''}`));
}

async function waitState(page, state, timeout = 420000) {
  await page.waitForFunction(
    (s) => window.NURSE_RUSH && window.NURSE_RUSH.game.state === s,
    state,
    { timeout }
  );
}

async function run() {
  const browser = await chromium.launch({
    executablePath: '/usr/bin/google-chrome',
    args: [
      '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
      '--no-sandbox', '--disable-dev-shm-usage', '--mute-audio',
    ],
  });

  // ---------- desktop: full victory path ----------
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 640 } });
  const page = await ctx.newPage();
  attach(page);
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!window.NURSE_RUSH, { timeout: 20000 });
  console.log('✓ booted, menu rendered');
  await shot(page, '01-menu');

  // check the footer credit is present and visible
  const footer = await page.evaluate(() => {
    const f = document.getElementById('dev-footer');
    const txt = f ? f.innerText.trim() : null;
    const vis = f ? getComputedStyle(f).display !== 'none' && f.getBoundingClientRect().height > 0 : false;
    return { txt, vis };
  });
  console.log('  footer:', JSON.stringify(footer));
  if (!footer.vis || !/wejdan boharam/i.test(footer.txt)) errors.push('footer credit missing on menu');

  // ---- how to play ----
  await page.click('#btn-howto');
  await page.waitForTimeout(400);
  await shot(page, '02-howto');
  await page.click('#btn-howto-back');

  // ---- play: cinematic intro ----
  await page.click('#btn-play');
  await waitState(page, 'intro');
  console.log('✓ intro started');
  await page.waitForTimeout(1200);
  await shot(page, '03-intro-walk');
  // alarm phase
  await page.waitForFunction(() => {
    const c = window.NURSE_RUSH.game.cinematic;
    return c && c.phase === 'react';
  }, { timeout: 15000 });
  await page.waitForTimeout(600);
  await shot(page, '04-intro-alert');
  const alertOn = await page.evaluate(() =>
    document.getElementById('alert-banner').classList.contains('is-on'));
  if (!alertOn) errors.push('EMERGENCY ALERT banner never shown');
  console.log('✓ emergency alert shown');

  // run phase + doors
  await page.waitForFunction(() => {
    const c = window.NURSE_RUSH.game.cinematic;
    return c && c.phase === 'run';
  }, { timeout: 15000 });
  await page.waitForTimeout(2500);
  await shot(page, '05-intro-run');
  const doorsOpened = await page.waitForFunction(() => {
    const c = window.NURSE_RUSH.game.cinematic;
    return !c || c.doorT > 0.5;
  }, { timeout: 20000 }).then(() => true).catch(() => false);
  console.log(doorsOpened ? '✓ exit doors opened' : '✗ doors never opened');
  if (!doorsOpened) errors.push('exit doors never opened');

  // ---- gameplay ----
  await waitState(page, 'running', 420000);
  console.log('✓ gameplay started (intro handed off)');
  await page.waitForTimeout(1500);
  await shot(page, '06-gameplay');

  const g0 = await page.evaluate(() => {
    const g = window.NURSE_RUSH.game;
    return {
      hudVisible: document.getElementById('hud').classList.contains('is-active'),
      questions: g.questions.map((q) => q.id),
      obstacles: g.world.obstacles.length,
      collectibles: g.world.collectibles.length,
      timer: document.getElementById('timer-value').textContent,
    };
  });
  console.log('  state:', JSON.stringify(g0));
  if (g0.questions[0] === g0.questions[1]) errors.push('the two round questions are identical');
  if (!g0.obstacles) errors.push('no obstacles spawned');
  if (!g0.collectibles) errors.push('no collectibles spawned');

  // controls
  for (const key of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space']) {
    await page.keyboard.press(key);
    await page.waitForTimeout(320);
  }
  const afterKeys = await page.evaluate(() => {
    const g = window.NURSE_RUSH.game;
    return { lane: g.lane, nurseState: g.nurse.state, score: g.score };
  });
  console.log('  after controls:', JSON.stringify(afterKeys));

  // simulate touch swipes on the canvas
  await page.evaluate(() => {
    const c = document.getElementById('game-canvas');
    const t = (type, x, y) => {
      const touch = new Touch({ identifier: 1, target: c, clientX: x, clientY: y });
      c.dispatchEvent(new TouchEvent(type, {
        touches: type === 'touchend' ? [] : [touch],
        changedTouches: [touch], bubbles: true, cancelable: true,
      }));
    };
    t('touchstart', 600, 400); t('touchmove', 700, 400); t('touchend', 700, 400);
  });
  await page.waitForTimeout(300);
  const afterSwipe = await page.evaluate(() => window.NURSE_RUSH.game.lane);
  console.log('  lane after right swipe:', afterSwipe);

  // ---- question 1: answer correctly ----
  await page.evaluate(() => { window.NURSE_RUSH.game.roundTime = 34.6; });
  await waitState(page, 'question', 15000);
  await page.waitForTimeout(700);
  await shot(page, '07-question-1');

  const q1 = await page.evaluate(() => {
    const g = window.NURSE_RUSH.game;
    return {
      id: g.activeQuestion.id,
      type: g.activeQuestion.type,
      text: document.getElementById('q-text').textContent,
      badge: document.getElementById('q-badge').textContent,
      options: [...document.querySelectorAll('.opt')].map((b) => b.textContent),
      correctIndex: g.correctIndex,
      clock: document.getElementById('q-clock').textContent,
      movementStopped: Math.abs(g.speed) < 14,
      timerStillRunning: g.roundTime > 34.6,
    };
  });
  console.log('  Q1:', JSON.stringify(q1, null, 1));
  if (q1.correctIndex < 0) errors.push('Q1 has no correct option after shuffling');
  if (!q1.timerStillRunning) errors.push('round timer stopped during the question');

  await page.evaluate(() => {
    const g = window.NURSE_RUSH.game;
    document.querySelectorAll('.opt')[g.correctIndex].click();
  });
  await page.waitForTimeout(600);
  await shot(page, '08-question-1-correct');
  await waitState(page, 'running', 60000);
  const afterQ1 = await page.evaluate(() => {
    const g = window.NURSE_RUSH.game;
    return { score: g.score, correct: g.correctAnswers, hud: document.getElementById('hud-questions').textContent };
  });
  console.log('✓ Q1 correct ->', JSON.stringify(afterQ1));
  if (afterQ1.correct !== 1) errors.push('correct answer did not increment the counter');

  // ---- question 2: answer correctly ----
  await page.evaluate(() => { window.NURSE_RUSH.game.roundTime = 79.5; });
  await waitState(page, 'question', 15000);
  await page.waitForTimeout(500);
  const q2id = await page.evaluate(() => window.NURSE_RUSH.game.activeQuestion.id);
  console.log('  Q2 id:', q2id, '(Q1 was', q1.id + ')');
  if (q2id === q1.id) errors.push('the same question appeared twice in one round');
  await shot(page, '09-question-2');
  await page.evaluate(() => {
    const g = window.NURSE_RUSH.game;
    document.querySelectorAll('.opt')[g.correctIndex].click();
  });
  await waitState(page, 'running', 60000);
  console.log('✓ Q2 correct');

  // ---- jump to the finish ----
  await page.evaluate(() => { window.NURSE_RUSH.game.roundTime = 111.5; });
  await page.waitForFunction(() => {
    const w = window.NURSE_RUSH.game.world;
    return w && w.finishSpawned;
  }, { timeout: 15000 });
  console.log('✓ finish gate spawned');
  await page.waitForTimeout(1200);
  await shot(page, '10-finish');

  await page.evaluate(() => { window.NURSE_RUSH.game.roundTime = 119.6; });
  await page.waitForSelector('#victory.is-active', { timeout: 15000 });
  await page.waitForTimeout(500);
  await shot(page, '11-victory');
  const win = await page.evaluate(() => ({
    title: document.querySelector('.result-title--win').textContent.trim(),
    score: document.getElementById('win-score').textContent,
    coins: document.getElementById('win-coins').textContent,
    correct: document.getElementById('win-correct').textContent,
    best: document.getElementById('win-best').textContent,
    footer: getComputedStyle(document.getElementById('dev-footer')).display !== 'none',
    footerText: document.getElementById('dev-footer').innerText.trim(),
  }));
  console.log('✓ VICTORY:', JSON.stringify(win));
  if (!/YOU SURVIVED THE SHIFT/.test(win.title)) errors.push('victory title wrong');
  if (win.correct !== '2/2') errors.push('victory correct count wrong');
  if (!win.footer || !/wejdan boharam/i.test(win.footerText)) errors.push('footer missing on victory screen');

  // ---------- second run: wrong answer -> game over ----------
  await page.click('#btn-win-again');
  await waitState(page, 'running', 420000);
  console.log('✓ Play Again restarted the round (intro skipped)');
  await page.evaluate(() => { window.NURSE_RUSH.game.roundTime = 34.6; });
  await waitState(page, 'question', 15000);
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    const g = window.NURSE_RUSH.game;
    const wrong = g.correctIndex === 0 ? 1 : 0;
    document.querySelectorAll('.opt')[wrong].click();
  });
  await page.waitForTimeout(900);
  await shot(page, '12-question-wrong');
  await page.waitForSelector('#gameover.is-active', { timeout: 15000 });
  await page.waitForTimeout(400);
  await shot(page, '13-gameover');
  const lose = await page.evaluate(() => ({
    title: document.querySelector('.result-title--lose').textContent.trim(),
    reason: document.getElementById('lose-reason').textContent,
    reviewOn: document.getElementById('lose-review').classList.contains('is-on'),
    reviewQ: document.getElementById('review-question').textContent,
    reviewCorrect: document.getElementById('review-correct').innerText,
    correct: document.getElementById('lose-correct').textContent,
    footerText: document.getElementById('dev-footer').innerText.trim(),
  }));
  console.log('✓ GAME OVER:', JSON.stringify(lose, null, 1));
  if (!/SHIFT FAILED/.test(lose.title)) errors.push('game over title wrong');
  if (!lose.reviewOn) errors.push('game over did not show the question review');
  if (!/Correct answer/i.test(lose.reviewCorrect)) errors.push('game over did not show the correct answer');
  if (!/wejdan boharam/i.test(lose.footerText)) errors.push('footer missing on game over screen');

  // ---- timeout path ----
  await page.click('#btn-lose-again');
  await waitState(page, 'running', 420000);
  await page.evaluate(() => { window.NURSE_RUSH.game.roundTime = 34.6; });
  await waitState(page, 'question', 15000);
  await page.evaluate(() => { window.NURSE_RUSH.game.questionClock = 0.05; });
  await page.waitForSelector('#gameover.is-active', { timeout: 15000 });
  const to = await page.evaluate(() => document.getElementById('lose-reason').textContent);
  console.log('✓ timeout path:', to);
  if (!/time/i.test(to)) errors.push('timeout did not produce the time-up reason');

  // ---- back to menu ----
  await page.click('#btn-lose-menu');
  await waitState(page, 'menu', 15000);
  console.log('✓ returned to main menu');
  await shot(page, '14-menu-after');

  // ---- fps sample on desktop ----
  await page.click('#btn-play');
  await waitState(page, 'intro');
  await page.click('#btn-skip');
  await waitState(page, 'running', 420000);
  const fps = await page.evaluate(() => new Promise((res) => {
    let n = 0; const t0 = performance.now();
    const f = () => { n++; if (performance.now() - t0 < 3000) requestAnimationFrame(f); else res(n / ((performance.now() - t0) / 1000)); };
    requestAnimationFrame(f);
  }));
  console.log(`  desktop fps (software rasteriser): ${fps.toFixed(1)}`);
  await ctx.close();

  // ---------- mobile viewports ----------
  for (const [name, vp, ua] of [
    ['iphone', { width: 390, height: 844 }, 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'],
    ['iphone-landscape', { width: 844, height: 390 }, 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'],
    ['ipad', { width: 1024, height: 768 }, 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'],
  ]) {
    const c = await browser.newContext({
      viewport: vp, userAgent: ua, hasTouch: true, isMobile: true, deviceScaleFactor: 2,
    });
    const p = await c.newPage();
    attach(p);
    await p.goto(URL, { waitUntil: 'networkidle' });
    await p.waitForFunction(() => !!window.NURSE_RUSH, { timeout: 20000 });
    // dismiss the rotate hint if it appeared
    if (await p.locator('#rotate.is-active').count()) await p.click('#btn-rotate-ok');
    await p.waitForTimeout(500);
    await shot(p, `20-${name}-menu`);
    await p.click('#btn-play');
    await waitState(p, 'intro');
    await p.waitForTimeout(900);
    await shot(p, `21-${name}-intro`);
    await p.click('#btn-skip');
    await waitState(p, 'running', 420000);
    await p.waitForTimeout(1500);
    await shot(p, `22-${name}-game`);
    const q = await p.evaluate(() => {
      const g = window.NURSE_RUSH.game;
      const f = document.getElementById('dev-footer').getBoundingClientRect();
      return {
        quality: g.quality,
        dpr: window.devicePixelRatio,
        canvas: [g.renderer.domElement.width, g.renderer.domElement.height],
        fov: g.camera.fov,
        footerBottom: Math.round(window.innerHeight - f.bottom),
        footerText: document.getElementById('dev-footer').innerText.trim(),
      };
    });
    console.log(`  ${name}:`, JSON.stringify(q));
    if (!/wejdan boharam/i.test(q.footerText)) errors.push(`footer missing on ${name}`);
    // open a question on mobile to check the card fits
    await p.evaluate(() => { window.NURSE_RUSH.game.roundTime = 34.6; });
    await waitState(p, 'question', 15000);
    await p.waitForTimeout(600);
    await shot(p, `23-${name}-question`);
    const fits = await p.evaluate(() => {
      const card = document.querySelector('.qcard').getBoundingClientRect();
      return { top: Math.round(card.top), bottom: Math.round(window.innerHeight - card.bottom), h: Math.round(card.height) };
    });
    console.log(`  ${name} question card:`, JSON.stringify(fits));
    if (fits.top < 0) errors.push(`${name}: question card overflows the top of the screen`);
    await c.close();
  }

  await browser.close();

  console.log('\n---------------------------------------');
  if (errors.length) {
    console.log(`FAILED with ${errors.length} problem(s):`);
    errors.forEach((e) => console.log(' •', e));
    process.exit(1);
  }
  console.log('ALL CHECKS PASSED');
}

run().catch((e) => {
  console.error('harness error:', e);
  console.log('--- recent console ---');
  logs.slice(-40).forEach((l) => console.log(l));
  errors.slice(-10).forEach((l) => console.log('ERR', l));
  process.exit(1);
});
