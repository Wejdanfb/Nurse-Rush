/**
 * NURSE RUSH - question appearance timing.
 * Q1 exactly 25 s after gameplay starts; Q2 exactly 20 s after play resumes
 * from a correct answer to Q1.
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

async function newPage(browser, viewport = { width: 900, height: 560 }) {
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

/**
 * Let the round clock reach `target` without jumping straight to it, so the
 * scheduler is exercised frame by frame the way it runs for a player. The
 * clock is nudged forward in small steps; the last stretch runs for real.
 */
async function advanceTo(p, target, stopBefore = 1.5) {
  await p.evaluate(([t, gap]) => new Promise((res) => {
    const g = window.NURSE_RUSH.game;
    const step = () => {
      if (g.state !== 'running') return res('left running');
      const remaining = t - g.roundTime;
      if (remaining <= gap) return res('ok');
      // advance in chunks, never past the stop line
      g.roundTime += Math.min(remaining - gap, 0.9);
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }), [target, stopBefore]);
}

async function run() {
  const browser = await chromium.launch({
    executablePath: '/usr/bin/google-chrome',
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
      '--no-sandbox', '--disable-dev-shm-usage', '--mute-audio'],
  });

  /* ---------- config ---------- */
  {
    const { ctx, p } = await newPage(browser);
    const cfg = await p.evaluate(() => ({
      first: window.NURSE_RUSH.ROUND.FIRST_QUESTION_AT,
      second: window.NURSE_RUSH.ROUND.SECOND_QUESTION_AFTER_RESUME,
      limit: window.NURSE_RUSH.ROUND.ANSWER_LIMIT,
      duration: window.NURSE_RUSH.ROUND.DURATION,
    }));
    check('CONFIG: Q1 scheduled at 25 s', cfg.first === 25, `FIRST_QUESTION_AT=${cfg.first}`);
    check('CONFIG: Q2 scheduled 20 s after resume', cfg.second === 20, `SECOND_QUESTION_AFTER_RESUME=${cfg.second}`);
    check('CONFIG: 30 s answer limit preserved', cfg.limit === 30, `ANSWER_LIMIT=${cfg.limit}`);
    check('CONFIG: 120 s round preserved', cfg.duration === 120, `DURATION=${cfg.duration}`);
    await ctx.close();
  }

  /* ---------- Q1 fires at 25 s; Q2 armed only after resume ---------- */
  {
    const { ctx, p } = await newPage(browser);
    await startGameplay(p);

    const atStart = await p.evaluate(() => ({
      round: window.NURSE_RUSH.game.roundTime,
      next: window.NURSE_RUSH.game.nextQuestionAt,
      idx: window.NURSE_RUSH.game.questionIndex,
    }));
    check('Q1: armed for 25 s from the moment gameplay starts',
      Math.abs(atStart.next - 25) < 0.01 && atStart.round < 2,
      `nextQuestionAt=${atStart.next} with round clock at ${atStart.round.toFixed(2)} s`);

    // run up to just before 25 s and confirm it has NOT fired early
    await advanceTo(p, 25, 1.2);
    const justBefore = await p.evaluate(() => ({
      round: window.NURSE_RUSH.game.roundTime,
      state: window.NURSE_RUSH.game.state,
      overlay: document.getElementById('question').classList.contains('is-active'),
    }));
    check('Q1: has not appeared before 25 s',
      justBefore.state === 'running' && !justBefore.overlay,
      `still running at t=${justBefore.round.toFixed(2)} s`);

    // let it fire naturally
    await state(p, 'question', 120000);
    const fired = await p.evaluate(() => ({
      round: window.NURSE_RUSH.game.roundTime,
      opened: window.NURSE_RUSH.game.questionOpenedAt,
      badge: document.getElementById('q-badge').textContent,
      clock: window.NURSE_RUSH.game.questionClock,
      next: window.NURSE_RUSH.game.nextQuestionAt,
      hud: document.getElementById('timer-value').textContent,
    }));
    check('Q1: appears at 25 s',
      Math.abs(fired.opened - 25) < 0.25,
      `opened at t=${fired.opened.toFixed(3)} s (HUD showed ${fired.hud}), ${fired.badge}`);
    check('Q1: opens with a full 30 s answer limit',
      Math.abs(fired.clock - 30) < 1.0, `${fired.clock.toFixed(1)} s`);
    check('Q1: Q2 is NOT armed while Q1 is open',
      fired.next === null, `nextQuestionAt=${fired.next}`);

    // answer correctly after a deliberate 7 s, then measure the gap to Q2
    await p.evaluate(() => { window.NURSE_RUSH.game.roundTime += 7; });
    await p.waitForTimeout(250);
    await p.evaluate(() => {
      const g = window.NURSE_RUSH.game;
      document.querySelectorAll('.opt')[g.correctIndex].click();
    });
    await state(p, 'running', 120000);

    const onResume = await p.evaluate(() => ({
      resumedAt: window.NURSE_RUSH.game.resumedFromQuestionAt,
      round: window.NURSE_RUSH.game.roundTime,
      next: window.NURSE_RUSH.game.nextQuestionAt,
      correct: window.NURSE_RUSH.game.correctAnswers,
      idx: window.NURSE_RUSH.game.questionIndex,
    }));
    check('Q2: armed for exactly 20 s after play resumes',
      Math.abs((onResume.next - onResume.resumedAt) - 20) < 0.01 && onResume.idx === 1,
      `resumed at t=${onResume.resumedAt.toFixed(2)} s, Q2 due at t=${onResume.next.toFixed(2)} s (gap ${(onResume.next - onResume.resumedAt).toFixed(3)} s)`);
    check('Q2: not scheduled from the start of the round',
      onResume.next > 40,
      `due at t=${onResume.next.toFixed(1)} s — would have been 80 s under the old fixed schedule`);
    check('Q2: does not appear immediately after Q1',
      onResume.next - onResume.round > 18,
      `${(onResume.next - onResume.round).toFixed(1)} s of running before it is due`);

    // run the 20 s out and confirm Q2 fires there
    await advanceTo(p, onResume.next, 1.2);
    const beforeQ2 = await p.evaluate(() => ({
      state: window.NURSE_RUSH.game.state,
      round: window.NURSE_RUSH.game.roundTime,
    }));
    check('Q2: has not appeared before its due time',
      beforeQ2.state === 'running', `still running at t=${beforeQ2.round.toFixed(2)} s`);

    await state(p, 'question', 120000);
    const q2 = await p.evaluate(() => ({
      opened: window.NURSE_RUSH.game.questionOpenedAt,
      resumedAt: window.NURSE_RUSH.game.resumedFromQuestionAt,
      badge: document.getElementById('q-badge').textContent,
      clock: window.NURSE_RUSH.game.questionClock,
      cards: document.querySelectorAll('.qcard').length,
      ids: window.NURSE_RUSH.game.questions.map((x) => x.id),
      activeId: window.NURSE_RUSH.game.activeQuestion.id,
      next: window.NURSE_RUSH.game.nextQuestionAt,
    }));
    const measuredGap = q2.opened - q2.resumedAt;
    check('Q2: appears 20 s after gameplay resumed',
      Math.abs(measuredGap - 20) < 0.25,
      `measured gap ${measuredGap.toFixed(3)} s (resumed ${q2.resumedAt.toFixed(2)} s → opened ${q2.opened.toFixed(2)} s)`);
    check('Q2: is the second, different question with its own 30 s',
      /2 OF 2/.test(q2.badge) && Math.abs(q2.clock - 30) < 1.0 &&
      q2.activeId === q2.ids[1] && q2.ids[0] !== q2.ids[1],
      `${q2.badge}, ${q2.clock.toFixed(1)} s, ${q2.ids.join(' + ')}`);
    check('Q2: only one overlay on screen, nothing further armed',
      q2.cards === 1 && q2.next === null);

    await ctx.close();
  }

  /* ---------- gap is independent of how long Q1 took ---------- */
  for (const spend of [2, 28]) {
    const { ctx, p } = await newPage(browser);
    await startGameplay(p);
    await advanceTo(p, 25, 0.3);
    await state(p, 'question', 150000);
    const q1Opened = await p.evaluate(() => window.NURSE_RUSH.game.questionOpenedAt);
    await p.evaluate((s) => { window.NURSE_RUSH.game.roundTime += s; }, spend);
    await p.waitForTimeout(250);
    await p.evaluate(() => {
      const g = window.NURSE_RUSH.game;
      document.querySelectorAll('.opt')[g.correctIndex].click();
    });
    await state(p, 'running', 120000);
    const r = await p.evaluate(() => ({
      resumedAt: window.NURSE_RUSH.game.resumedFromQuestionAt,
      next: window.NURSE_RUSH.game.nextQuestionAt,
    }));
    check(`GAP: ${spend} s spent on Q1 → Q2 still 20 s after resume`,
      Math.abs((r.next - r.resumedAt) - 20) < 0.01,
      `Q1 opened ${q1Opened.toFixed(1)} s, resumed ${r.resumedAt.toFixed(1)} s, Q2 due ${r.next.toFixed(1)} s`);
    await ctx.close();
  }

  /* ---------- no overlap, and both fit inside 120 s ---------- */
  {
    const { ctx, p } = await newPage(browser);
    await startGameplay(p);
    // worst case: use almost the whole 30 s on Q1
    await advanceTo(p, 25, 0.3);
    await state(p, 'question', 150000);
    await p.evaluate(() => { window.NURSE_RUSH.game.roundTime += 29.5; });
    await p.waitForTimeout(250);
    await p.evaluate(() => {
      const g = window.NURSE_RUSH.game;
      document.querySelectorAll('.opt')[g.correctIndex].click();
    });
    await state(p, 'running', 120000);
    const worst = await p.evaluate(() => ({
      next: window.NURSE_RUSH.game.nextQuestionAt,
      limit: window.NURSE_RUSH.ROUND.ANSWER_LIMIT,
      duration: window.NURSE_RUSH.ROUND.DURATION,
    }));
    const latestResolve = worst.next + worst.limit;
    check('WORST CASE: even using all 30 s on Q1, Q2 still resolves inside the round',
      latestResolve < worst.duration,
      `Q2 due at ${worst.next.toFixed(1)} s, latest resolution ${latestResolve.toFixed(1)} s of 120 s`);

    // sample many frames around the Q2 trigger to prove no double-open
    await advanceTo(p, worst.next, 0.6);
    const overlapProbe = await p.evaluate(() => new Promise((res) => {
      const seen = [];
      let n = 0;
      const tick = () => {
        seen.push({
          cards: document.querySelectorAll('.qcard').length,
          active: document.getElementById('question').classList.contains('is-active'),
          state: window.NURSE_RUSH.game.state,
          idx: window.NURSE_RUSH.game.questionIndex,
        });
        if (++n < 90) requestAnimationFrame(tick); else res(seen);
      };
      requestAnimationFrame(tick);
    }));
    const maxCards = Math.max(...overlapProbe.map((s) => s.cards));
    const sawQuestion = overlapProbe.some((s) => s.state === 'question');
    check('NO OVERLAP: never more than one question card across the transition',
      maxCards === 1 && sawQuestion,
      `${overlapProbe.length} frames sampled around the Q2 trigger, max cards = ${maxCards}`);
    await ctx.close();
  }

  /* ---------- victory and game over unchanged ---------- */
  {
    const { ctx, p } = await newPage(browser);
    await p.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
    await startGameplay(p);
    await p.evaluate(() => {
      const g = window.NURSE_RUSH.game;
      window.__auto = setInterval(() => {
        if (g.state === 'question' && !g.answerLocked) {
          document.querySelectorAll('.opt')[g.correctIndex].click();
        }
      }, 120);
    });
    await advanceTo(p, 25, 0.3);
    await W(p, () => window.NURSE_RUSH.game.correctAnswers === 1, 150000);
    await state(p, 'running', 120000);
    await p.evaluate(() => {
      const g = window.NURSE_RUSH.game;
      g.roundTime = g.nextQuestionAt + 0.05;
    });
    await W(p, () => window.NURSE_RUSH.game.correctAnswers === 2, 150000);
    await state(p, 'running', 120000);
    await p.evaluate(() => { window.NURSE_RUSH.game.roundTime = 112.0; });
    await W(p, () => window.NURSE_RUSH.game.world.finishCrossed, 300000);
    await p.evaluate(() => { window.NURSE_RUSH.game.roundTime = 119.7; });
    const won = await p.waitForSelector('#victory.is-active', { timeout: 150000 })
      .then(() => true).catch(() => false);
    const win = await p.evaluate(() => ({
      correct: document.getElementById('win-correct').textContent,
      round: window.NURSE_RUSH.game.roundTime,
      score: document.getElementById('win-score').textContent,
    }));
    await p.evaluate(() => clearInterval(window.__auto));
    check('VICTORY: both correct + full 120 s still wins',
      won && win.correct === '2/2' && win.round >= 120,
      `2/2 at t=${win.round.toFixed(1)} s, score ${win.score}`);
    await ctx.close();
  }
  {
    const { ctx, p } = await newPage(browser);
    await startGameplay(p);
    await advanceTo(p, 25, 0.3);
    await state(p, 'question', 150000);
    await p.evaluate(() => {
      const g = window.NURSE_RUSH.game;
      document.querySelectorAll('.opt')[g.correctIndex === 0 ? 1 : 0].click();
    });
    const over = await p.waitForSelector('#gameover.is-active', { timeout: 120000 })
      .then(() => true).catch(() => false);
    check('GAME OVER: wrong answer still ends the shift immediately', over);
    await ctx.close();
  }
  {
    const { ctx, p } = await newPage(browser);
    await startGameplay(p);
    await advanceTo(p, 25, 0.3);
    await state(p, 'question', 150000);
    await p.evaluate(() => {
      const g = window.NURSE_RUSH.game;
      g.roundTime = g.questionOpenedAt + window.NURSE_RUSH.ROUND.ANSWER_LIMIT + 0.05;
    });
    const over = await p.waitForSelector('#gameover.is-active', { timeout: 120000 })
      .then(() => true).catch(() => false);
    const kicker = await p.evaluate(() =>
      document.querySelector('#gameover .result-kicker').textContent.trim());
    check('GAME OVER: 30 s timeout still ends the shift with TIME\'S UP',
      over && /TIME'S UP/.test(kicker), kicker);
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
  console.log('\nALL QUESTION TIMING TESTS PASSED');
}

run().catch((e) => {
  console.error('\nHARNESS ERROR:', e.message);
  const fails = results.filter((r) => !r.ok);
  console.log(`${results.length - fails.length}/${results.length} completed before the error`);
  fails.forEach((f) => console.log(`  ✗ ${f.name} — ${f.detail}`));
  consoleErrors.slice(0, 8).forEach((x) => console.log('  !', x));
  process.exit(1);
});
