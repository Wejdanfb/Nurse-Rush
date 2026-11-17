/**
 * NURSE RUSH - 30-second question timer acceptance tests.
 * Covers the named scenarios TEST A .. TEST G.
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

/**
 * Drive the question clock without relying on wall time: the countdown is
 * derived from roundTime, so moving the anchor back by N seconds is exactly
 * equivalent to the player having spent N seconds thinking.
 */
async function spendSecondsOnQuestion(p, seconds) {
  await p.evaluate((s) => {
    // Advance ONLY the round clock. questionOpenedAt is a fixed anchor, so
    // this is exactly what happens in real time: elapsed = roundTime -
    // questionOpenedAt. (Moving the anchor as well would double-count.)
    window.NURSE_RUSH.game.roundTime += s;
  }, seconds);
}

async function openRound(p, { skipIntro = true } = {}) {
  await p.click('#btn-play');
  await state(p, 'intro', 90000);
  if (skipIntro) await p.click('#btn-skip');
  await state(p, 'running');
}

async function newPage(browser, viewport = { width: 1000, height: 640 }) {
  const ctx = await browser.newContext({ viewport });
  const p = await ctx.newPage();
  p.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  p.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));
  await p.goto(BASE, { waitUntil: 'networkidle' });
  await W(p, () => !!window.NURSE_RUSH, 90000);
  return { ctx, p };
}

async function run() {
  const browser = await chromium.launch({
    executablePath: '/usr/bin/google-chrome',
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
      '--no-sandbox', '--disable-dev-shm-usage', '--mute-audio'],
  });

  /* ---------- configuration ---------- */
  {
    const { ctx, p } = await newPage(browser);
    const cfg = await p.evaluate(() => ({
      limit: window.NURSE_RUSH.ROUND.ANSWER_LIMIT,
      duration: window.NURSE_RUSH.ROUND.DURATION,
      times: window.NURSE_RUSH.ROUND.QUESTION_TIMES,
      howTo: document.querySelector('.howto-card--warn p').textContent,
    }));
    check('CONFIG: answer limit is 30 seconds', cfg.limit === 30, `ANSWER_LIMIT=${cfg.limit}`);
    check('CONFIG: round still exactly 120 seconds', cfg.duration === 120, `DURATION=${cfg.duration}`);
    check('CONFIG: question times unchanged', JSON.stringify(cfg.times) === '[35,80]', JSON.stringify(cfg.times));
    check('CONFIG: How to Play text updated', /30 seconds/.test(cfg.howTo));
    await ctx.close();
  }

  /* ---------- TEST A: correct after 5 s ---------- */
  {
    const { ctx, p } = await newPage(browser);
    await openRound(p);
    await p.evaluate(() => { window.NURSE_RUSH.game.roundTime = 35.0; });
    await state(p, 'question', 90000);
    const t0 = await p.evaluate(() => ({
      round: window.NURSE_RUSH.game.roundTime,
      clock: window.NURSE_RUSH.game.questionClock,
      shown: document.getElementById('q-clock').textContent,
    }));
    await spendSecondsOnQuestion(p, 5);
    await p.waitForTimeout(400);
    const t1 = await p.evaluate(() => ({
      round: window.NURSE_RUSH.game.roundTime,
      clock: window.NURSE_RUSH.game.questionClock,
      shown: document.getElementById('q-clock').textContent,
      hud: document.getElementById('timer-value').textContent,
    }));
    await p.evaluate(() => {
      const g = window.NURSE_RUSH.game;
      document.querySelectorAll('.opt')[g.correctIndex].click();
    });
    await state(p, 'running', 90000);
    const t2 = await p.evaluate(() => ({
      round: window.NURSE_RUSH.game.roundTime,
      correct: window.NURSE_RUSH.game.correctAnswers,
      score: window.NURSE_RUSH.game.score,
    }));
    const roundAdvanced = t2.round - t0.round;
    check('TEST A: answered correctly after 5 s — gameplay resumes immediately',
      t2.correct === 1 && t2.score >= 100,
      `${t2.correct}/2 correct, score ${t2.score}, resumed without waiting out the remaining 25 s`);
    check('TEST A: main timer decreased by ~5 s, not 30',
      roundAdvanced > 4.5 && roundAdvanced < 9,
      `round clock advanced ${roundAdvanced.toFixed(2)} s (HUD showed ${t1.hud})`);
    check('TEST A: countdown showed 25 after 5 s spent',
      Math.abs(t1.clock - 25) < 1.2, `displayed "${t1.shown}", internal ${t1.clock.toFixed(2)}`);
    await ctx.close();
  }

  /* ---------- TEST B: correct after 29 s ---------- */
  {
    const { ctx, p } = await newPage(browser);
    await openRound(p);
    await p.evaluate(() => { window.NURSE_RUSH.game.roundTime = 35.0; });
    await state(p, 'question', 90000);
    const t0 = await p.evaluate(() => window.NURSE_RUSH.game.roundTime);
    await spendSecondsOnQuestion(p, 29);
    await p.waitForTimeout(400);
    const mid = await p.evaluate(() => ({
      clock: window.NURSE_RUSH.game.questionClock,
      shown: document.getElementById('q-clock').textContent,
      low: document.getElementById('q-clockwrap').classList.contains('is-low'),
      stillOpen: window.NURSE_RUSH.game.state === 'question',
      locked: window.NURSE_RUSH.game.answerLocked,
    }));
    let resumed = false;
    if (!mid.locked) {
      await p.evaluate(() => {
        const g = window.NURSE_RUSH.game;
        document.querySelectorAll('.opt')[g.correctIndex].click();
      });
      resumed = await state(p, 'running', 90000).then(() => true).catch(() => false);
    }
    const t2 = await p.evaluate(() => ({
      round: window.NURSE_RUSH.game.roundTime,
      correct: window.NURSE_RUSH.game.correctAnswers,
    }));
    check('TEST B: still answerable at 29 s — question had not timed out',
      mid.stillOpen && !mid.locked, `clock showed "${mid.shown}", critical styling: ${mid.low}`);
    check('TEST B: answered correctly at 29 s — gameplay resumes',
      resumed && t2.correct === 1, `${t2.correct}/2 correct`);
    check('TEST B: main timer decreased by ~29 s',
      t2.round - t0 > 28.5 && t2.round - t0 < 33,
      `round clock advanced ${(t2.round - t0).toFixed(2)} s`);
    await ctx.close();
  }

  /* ---------- TEST C: no answer within 30 s ---------- */
  {
    const { ctx, p } = await newPage(browser);
    await openRound(p);
    await p.evaluate(() => { window.NURSE_RUSH.game.roundTime = 35.0; });
    await state(p, 'question', 90000);
    const t0 = await p.evaluate(() => window.NURSE_RUSH.game.roundTime);
    // let it run all the way out
    await spendSecondsOnQuestion(p, 30.1);
    const over = await p.waitForSelector('#gameover.is-active', { timeout: 90000 })
      .then(() => true).catch(() => false);
    const info = await p.evaluate(() => ({
      kicker: document.querySelector('#gameover .result-kicker').textContent.trim(),
      kickerStyled: document.querySelector('#gameover .result-kicker').classList.contains('result-kicker--timeup'),
      title: document.querySelector('.result-title--lose').textContent.trim(),
      reason: document.getElementById('lose-reason').textContent,
      reviewOn: document.getElementById('lose-review').classList.contains('is-on'),
      chosen: document.getElementById('review-chosen').innerText.replace(/\n/g, ' '),
      correctAnswer: document.getElementById('review-correct').innerText.replace(/\n/g, ' '),
      score: document.getElementById('lose-score').textContent,
      tryAgain: !!document.getElementById('btn-lose-again'),
      round: window.NURSE_RUSH.game.roundTime,
    }));
    check('TEST C: no answer within 30 s triggers GAME OVER', over, info.title);
    check("TEST C: shows a clear TIME'S UP message",
      /TIME'S UP!/.test(info.kicker) && info.kickerStyled, `headline: "${info.kicker}"`);
    check('TEST C: shows the correct answer', info.reviewOn && /correct answer/i.test(info.correctAnswer),
      info.correctAnswer.slice(0, 70));
    check('TEST C: shows the final score and a Try Again button',
      info.score !== '' && info.tryAgain, `score ${info.score}`);
    check('TEST C: the 30 s came out of the round clock',
      info.round - t0 >= 29.5, `round clock advanced ${(info.round - t0).toFixed(1)} s`);
    await ctx.close();
  }

  /* ---------- TEST D: wrong answer after 3 s ---------- */
  {
    const { ctx, p } = await newPage(browser);
    await openRound(p);
    await p.evaluate(() => { window.NURSE_RUSH.game.roundTime = 35.0; });
    await state(p, 'question', 90000);
    await spendSecondsOnQuestion(p, 3);
    await p.waitForTimeout(300);
    await p.evaluate(() => {
      const g = window.NURSE_RUSH.game;
      document.querySelectorAll('.opt')[g.correctIndex === 0 ? 1 : 0].click();
    });
    const over = await p.waitForSelector('#gameover.is-active', { timeout: 90000 })
      .then(() => true).catch(() => false);
    const info = await p.evaluate(() => ({
      kicker: document.querySelector('#gameover .result-kicker').textContent.trim(),
      title: document.querySelector('.result-title--lose').textContent.trim(),
      reason: document.getElementById('lose-reason').textContent,
      chosen: document.getElementById('review-chosen').innerText.replace(/\n/g, ' '),
    }));
    check('TEST D: wrong answer after 3 s triggers immediate GAME OVER', over, info.title);
    check('TEST D: not labelled as a timeout', info.kicker === 'ROUND ENDED' && /incorrect/i.test(info.reason),
      `headline "${info.kicker}", reason "${info.reason}"`);
    await ctx.close();
  }

  /* ---------- TEST E: both correct + full 120 s = victory ---------- */
  {
    const { ctx, p } = await newPage(browser);
    await p.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
    await openRound(p);
    await p.evaluate(() => {
      const g = window.NURSE_RUSH.game;
      window.__auto = setInterval(() => {
        if (g.state === 'question' && !g.answerLocked) {
          document.querySelectorAll('.opt')[g.correctIndex].click();
        }
      }, 120);
    });
    await p.evaluate(() => { window.NURSE_RUSH.game.roundTime = 35.0; });
    await W(p, () => window.NURSE_RUSH.game.correctAnswers === 1, 90000);
    await state(p, 'running', 90000);
    const q1Ids = await p.evaluate(() => window.NURSE_RUSH.game.questions.map((q) => q.id));
    await p.evaluate(() => { window.NURSE_RUSH.game.roundTime = 80.0; });
    await W(p, () => window.NURSE_RUSH.game.correctAnswers === 2, 90000);
    await state(p, 'running', 90000);
    await p.evaluate(() => { window.NURSE_RUSH.game.roundTime = 112.0; });
    await W(p, () => window.NURSE_RUSH.game.world.finishCrossed, 300000);
    await p.evaluate(() => { window.NURSE_RUSH.game.roundTime = 119.7; });
    const won = await p.waitForSelector('#victory.is-active', { timeout: 120000 })
      .then(() => true).catch(() => false);
    const win = await p.evaluate(() => ({
      title: document.querySelector('.result-title--win').textContent.trim(),
      correct: document.getElementById('win-correct').textContent,
      score: document.getElementById('win-score').textContent,
      round: window.NURSE_RUSH.game.roundTime,
    }));
    await p.evaluate(() => clearInterval(window.__auto));
    check('TEST E: both answers correct + full 120 s = VICTORY',
      won && win.correct === '2/2' && win.round >= 120,
      `${win.title} at t=${win.round.toFixed(1)} s, score ${win.score}, questions ${q1Ids.join('+')}`);
    await ctx.close();
  }

  /* ---------- TEST F: main timer never pauses during a question ---------- */
  {
    const { ctx, p } = await newPage(browser);
    await openRound(p);
    await p.evaluate(() => { window.NURSE_RUSH.game.roundTime = 35.0; });
    await state(p, 'question', 90000);
    // sample the round clock repeatedly across real frames while the
    // question sits open and untouched
    const samples = await p.evaluate(() => new Promise((res) => {
      const g = window.NURSE_RUSH.game;
      const out = [];
      let n = 0;
      const tick = () => {
        out.push({ t: g.roundTime, hud: document.getElementById('timer-value').textContent,
                   q: g.questionClock, state: g.state });
        if (++n < 40 && g.state === 'question') requestAnimationFrame(tick);
        else res(out);
      };
      requestAnimationFrame(tick);
    }));
    const first = samples[0], last = samples[samples.length - 1];
    const monotonic = samples.every((s, i) => i === 0 || s.t >= samples[i - 1].t);
    const advanced = last.t - first.t;
    // the question countdown must have fallen by the same amount
    const qFell = first.q - last.q;
    check('TEST F: main timer keeps running while a question is open',
      monotonic && advanced > 0,
      `${samples.length} frames sampled, round clock advanced ${advanced.toFixed(3)} s (HUD ${first.hud} → ${last.hud})`);
    check('TEST G: question countdown stays in lockstep with the main timer',
      Math.abs(qFell - advanced) < 0.02,
      `round +${advanced.toFixed(3)} s vs question −${qFell.toFixed(3)} s, drift ${Math.abs(qFell - advanced).toFixed(4)} s`);
    await ctx.close();
  }

  /* ---------- TEST G: no overlap / duplicate overlay ---------- */
  {
    const { ctx, p } = await newPage(browser);
    await openRound(p);

    // only ever one question card in the DOM, and the overlay is not active
    // outside a question
    const beforeQ = await p.evaluate(() => ({
      cards: document.querySelectorAll('.qcard').length,
      overlayActive: document.getElementById('question').classList.contains('is-active'),
    }));
    await p.evaluate(() => { window.NURSE_RUSH.game.roundTime = 35.0; });
    await state(p, 'question', 90000);
    const duringQ = await p.evaluate(() => ({
      cards: document.querySelectorAll('.qcard').length,
      options: document.querySelectorAll('.opt').length,
      overlayActive: document.getElementById('question').classList.contains('is-active'),
      hudVisible: document.getElementById('hud').classList.contains('is-active'),
      hudTimerVisible: document.querySelector('.hud-timer').getBoundingClientRect().height > 0,
      speed: window.NURSE_RUSH.game.speed,
      frozen: window.NURSE_RUSH.game.world.frozen,
      obstacles: window.NURSE_RUSH.game.world.obstacles.length,
    }));

    // repeated open attempts must not stack a second overlay
    await p.evaluate(() => {
      const g = window.NURSE_RUSH.game;
      g._openQuestion(); g._openQuestion();
    });
    await p.waitForTimeout(300);
    const afterDoubleOpen = await p.evaluate(() => ({
      cards: document.querySelectorAll('.qcard').length,
      options: document.querySelectorAll('.opt').length,
    }));

    // obstacle generation is frozen: count must not grow while stopped
    const obsBefore = await p.evaluate(() => window.NURSE_RUSH.game.world.obstacles.length);
    await p.waitForTimeout(2500);
    const obsAfter = await p.evaluate(() => window.NURSE_RUSH.game.world.obstacles.length);

    check('TEST G: exactly one question overlay, never duplicated',
      beforeQ.cards === 1 && duringQ.cards === 1 && afterDoubleOpen.cards === 1 &&
      afterDoubleOpen.options === duringQ.options && !beforeQ.overlayActive && duringQ.overlayActive,
      `cards before/during/after-double-open: ${beforeQ.cards}/${duringQ.cards}/${afterDoubleOpen.cards}, ${duringQ.options} answer buttons`);
    check('TEST G: obstacle spawning is paused during a question',
      duringQ.frozen && obsAfter <= obsBefore,
      `world.frozen=${duringQ.frozen}, obstacle count ${obsBefore} → ${obsAfter}`);
    check('TEST G: main round timer stays visible alongside the question',
      duringQ.hudVisible && duringQ.hudTimerVisible);

    // answer, then confirm a second question can still open cleanly later
    await p.evaluate(() => {
      const g = window.NURSE_RUSH.game;
      document.querySelectorAll('.opt')[g.correctIndex].click();
    });
    await state(p, 'running', 90000);
    const resumed = await p.evaluate(() => ({
      frozen: window.NURSE_RUSH.game.world.frozen,
      overlayActive: document.getElementById('question').classList.contains('is-active'),
    }));
    await p.evaluate(() => { window.NURSE_RUSH.game.roundTime = 80.0; });
    await state(p, 'question', 90000);
    const q2 = await p.evaluate(() => ({
      cards: document.querySelectorAll('.qcard').length,
      index: window.NURSE_RUSH.game.questionIndex,
      badge: document.getElementById('q-badge').textContent,
      clock: window.NURSE_RUSH.game.questionClock,
      ids: window.NURSE_RUSH.game.questions.map((q) => q.id),
      activeId: window.NURSE_RUSH.game.activeQuestion.id,
    }));
    check('TEST G: spawning resumes and overlay clears after answering',
      !resumed.frozen && !resumed.overlayActive);
    check('TEST G: second question opens cleanly with its own fresh 30 s',
      q2.cards === 1 && q2.index === 1 && /2 OF 2/.test(q2.badge) && Math.abs(q2.clock - 30) < 1.5 &&
      q2.activeId === q2.ids[1] && q2.ids[0] !== q2.ids[1],
      `${q2.badge}, clock ${q2.clock.toFixed(1)} s, questions ${q2.ids.join(' + ')}`);
    await ctx.close();
  }

  /* ---------- readability across devices ---------- */
  for (const [name, vp, touch] of [
    ['iPhone portrait', { width: 390, height: 844 }, true],
    ['iPhone landscape', { width: 844, height: 390 }, true],
    ['iPad landscape', { width: 1180, height: 820 }, true],
    ['Desktop', { width: 1440, height: 900 }, false],
  ]) {
    const ctx = await browser.newContext({
      viewport: vp, hasTouch: touch, isMobile: touch, deviceScaleFactor: touch ? 2 : 1,
    });
    const p = await ctx.newPage();
    p.on('pageerror', (e) => consoleErrors.push(`${name}: ${e.message}`));
    await p.goto(BASE, { waitUntil: 'networkidle' });
    await W(p, () => !!window.NURSE_RUSH, 90000);
    if (await p.locator('#rotate.is-active').count()) await p.click('#btn-rotate-ok');
    await openRound(p);
    await p.evaluate(() => { window.NURSE_RUSH.game.roundTime = 35.0; });
    await state(p, 'question', 90000);
    await p.waitForTimeout(600);
    const m = await p.evaluate(() => {
      const num = document.getElementById('q-clock');
      const r = num.getBoundingClientRect();
      const bar = document.getElementById('q-clockfill').getBoundingClientRect();
      const card = document.querySelector('.qcard').getBoundingClientRect();
      const hud = document.querySelector('.hud-timer').getBoundingClientRect();
      return {
        text: num.textContent,
        fontSize: parseFloat(getComputedStyle(num).fontSize),
        onScreen: r.top >= 0 && r.bottom <= window.innerHeight && r.left >= 0 && r.right <= window.innerWidth,
        barWidth: Math.round(bar.width),
        cardTop: Math.round(card.top),
        hudVisible: hud.height > 0 && hud.bottom <= window.innerHeight,
        hudClearOfCard: hud.bottom < card.top,
        opts: [...document.querySelectorAll('.opt')].map((b) => Math.round(b.getBoundingClientRect().height)),
      };
    });
    check(`READABILITY ${name}: 30 s countdown prominent and on screen`,
      m.text === '30' && m.fontSize >= 24 && m.onScreen && m.barWidth > 40,
      `"${m.text}" at ${m.fontSize}px, bar ${m.barWidth}px wide`);
    check(`READABILITY ${name}: round timer visible and clear of the card`,
      m.hudVisible && m.hudClearOfCard);
    check(`READABILITY ${name}: answer buttons remain 44px+`,
      m.opts.every((h) => h >= 44), m.opts.join(' / '));
    await p.screenshot({ path: `/home/claude/qa/t30-${name.replace(/\s+/g, '-').toLowerCase()}.png` });
    await ctx.close();
  }

  await browser.close();

  const fails = results.filter((r) => !r.ok);
  console.log('\n======================================================');
  console.log(`${results.length - fails.length}/${results.length} checks passed`);
  if (consoleErrors.length) {
    console.log(`\nConsole/page errors (${consoleErrors.length}):`);
    [...new Set(consoleErrors)].slice(0, 10).forEach((e) => console.log('  !', e));
  } else {
    console.log('No console or page errors.');
  }
  if (fails.length) {
    console.log('\nFAILURES:');
    fails.forEach((f) => console.log(`  ✗ ${f.name} — ${f.detail}`));
    process.exit(1);
  }
  console.log('\nALL 30-SECOND TIMER TESTS PASSED');
}

run().catch((e) => {
  console.error('\nHARNESS ERROR:', e.message);
  const fails = results.filter((r) => !r.ok);
  console.log(`${results.length - fails.length}/${results.length} completed before the error`);
  fails.forEach((f) => console.log(`  ✗ ${f.name} — ${f.detail}`));
  consoleErrors.slice(0, 8).forEach((x) => console.log('  !', x));
  process.exit(1);
});
