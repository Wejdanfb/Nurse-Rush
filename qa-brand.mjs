/**
 * NURSE RUSH - WB brand logo integration.
 * Confirms the official artwork appears on every requested screen, is never
 * distorted, recoloured or filtered, loads once, and obstructs nothing.
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

/** Measure every visible logo: natural vs rendered box, fit, filters. */
const MEASURE = () => {
  const out = [];
  for (const img of document.querySelectorAll('.wb-logo')) {
    const r = img.getBoundingClientRect();
    const cs = getComputedStyle(img);
    const visible = r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none';
    out.push({
      cls: img.className,
      src: img.getAttribute('src'),
      complete: img.complete,
      naturalW: img.naturalWidth,
      naturalH: img.naturalHeight,
      w: +r.width.toFixed(1), h: +r.height.toFixed(1),
      top: Math.round(r.top), bottom: Math.round(r.bottom),
      left: Math.round(r.left), right: Math.round(r.right),
      objectFit: cs.objectFit,
      filter: cs.filter,
      visible,
    });
  }
  return out;
};

const measure = (p) => p.evaluate(`(${MEASURE.toString()})()`);
const shown = (list, mod) => list.filter((l) => l.cls.includes(mod) && l.visible);

async function newPage(browser, viewport = { width: 1100, height: 700 }, opts = {}) {
  const ctx = await browser.newContext({ viewport, ...opts });
  const p = await ctx.newPage();
  // software rendering runs at a few fps, so the stock 30 s defaults are
  // far too tight for anything that waits on game time
  p.setDefaultTimeout(300000);
  p.setDefaultNavigationTimeout(300000);
  p.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  p.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));
  return { ctx, p };
}

async function run() {
  const browser = await chromium.launch({
    executablePath: '/usr/bin/google-chrome',
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
      '--no-sandbox', '--disable-dev-shm-usage', '--mute-audio'],
  });

  /* ================= asset delivery ================= */
  {
    const { ctx, p } = await newPage(browser);
    const requests = [];
    p.on('response', (r) => {
      const u = new URL(r.url()).pathname;
      if (/\.(png|jpe?g|webp|svg|gif)$/i.test(u)) {
        requests.push({ path: u, status: r.status(), type: r.headers()['content-type'], cc: r.headers()['cache-control'] || '' });
      }
    });
    await p.goto(BASE, { waitUntil: 'networkidle' });
    await W(p, () => !!window.NURSE_RUSH, 90000);
    await p.waitForTimeout(1200);

    const logoReqs = requests.filter((r) => /wb-brand-logo/.test(r.path));
    check('ASSET: the brand logo is fetched from the project as a real file',
      logoReqs.length >= 1 && logoReqs[0].status === 200 && /image\/png/.test(logoReqs[0].type),
      logoReqs[0] ? `${logoReqs[0].status} ${logoReqs[0].type} ${logoReqs[0].path}` : 'not requested');
    check('ASSET: descriptive filename kept (wb-brand-logo)',
      logoReqs.length > 0 && /wb-brand-logo/.test(logoReqs[0].path), logoReqs[0]?.path);
    check('ASSET: fetched exactly once for all placements',
      logoReqs.length === 1, `${logoReqs.length} network request(s)`);
    check('ASSET: served immutably cached',
      /immutable/.test(logoReqs[0]?.cc || ''), logoReqs[0]?.cc);

    const nat = await p.evaluate(() => {
      const i = document.querySelector('.wb-logo');
      return { w: i.naturalWidth, h: i.naturalHeight };
    });
    check('ASSET: square aspect ratio preserved (no crop, no stretch)',
      nat.w === nat.h && nat.w === 512, `${nat.w}x${nat.h}`);

    // pixel-level colour fidelity straight from the served file
    const colours = await p.evaluate(async (url) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
      const c = document.createElement('canvas');
      c.width = img.naturalWidth; c.height = img.naturalHeight;
      const g = c.getContext('2d');
      g.drawImage(img, 0, 0);
      const at = (x, y) => Array.from(g.getImageData(x, y, 1, 1).data);
      return { cyan: at(256, 256), corner: at(2, 2), size: [c.width, c.height] };
    }, await p.evaluate(() => window.NURSE_RUSH.brandLogoUrl));
    check('ASSET: original cyan lettering preserved exactly',
      colours.cyan[0] === 0 && colours.cyan[1] === 209 && colours.cyan[2] === 231,
      `rgb(${colours.cyan.slice(0, 3).join(',')}) — matches the supplied artwork`);
    check('ASSET: transparent margin preserved (nothing cropped)',
      colours.corner[3] === 0, `corner alpha ${colours.corner[3]}`);
    await ctx.close();
  }

  /* ================= main menu ================= */
  {
    const { ctx, p } = await newPage(browser);
    await p.goto(BASE, { waitUntil: 'networkidle' });
    await W(p, () => !!window.NURSE_RUSH, 90000);
    await p.waitForTimeout(1500);

    // the records strip only exists once there is a record to show, so seed one
    await p.evaluate(() => {
      const S = window.NURSE_RUSH.Storage;
      S.set('best', 1240); S.set('wins', 3); S.set('rounds', 7);
      const a = S.all();
      window.NURSE_RUSH.ui.setMenuBest(a.best, a.wins, a.rounds);
    });
    await p.waitForTimeout(400);

    const all = await measure(p);
    const menu = shown(all, 'wb-logo--menu')[0];
    const strip = shown(all, 'wb-logo--strip')[0];

    check('MENU: WB logo is displayed', !!menu && menu.complete,
      menu ? `${menu.w}x${menu.h}px` : 'not visible');
    check('MENU: logo rendered undistorted (object-fit: contain, square box)',
      menu && menu.objectFit === 'contain' && Math.abs(menu.w - menu.h) < 1.5,
      menu ? `object-fit: ${menu.objectFit}, box ${menu.w}x${menu.h}` : '');
    check('MENU: no CSS filter altering the artwork',
      menu && (menu.filter === 'none' || menu.filter === ''), `filter: ${menu?.filter}`);

    const title = await p.evaluate(() => {
      // scope to the menu: the hidden loading screen also has a .logo
      const t = document.querySelector('#menu .logo');
      const r = t.getBoundingClientRect();
      return { top: Math.round(r.top), h: Math.round(r.height), w: Math.round(r.width) };
    });
    // The supplied artwork carries ~21% transparent margin inside its own
    // canvas, so compare the VISIBLE tile, not the element box.
    const INSET = 0.21;
    const visibleBottom = menu ? menu.bottom - menu.h * INSET : 0;
    check('MENU: positioned above the NURSE RUSH title',
      menu && visibleBottom <= title.top + 2,
      `visible artwork ends at ${Math.round(visibleBottom)}px, title starts at ${title.top}px`);
    check('MENU: visible but does not dominate the game title',
      menu && menu.h < title.h, `logo ${menu?.h}px tall vs title block ${title.h}px`);

    check('RECORDS STRIP: smaller WB logo in the best-score header',
      !!strip && strip.h < menu.h, strip ? `${strip.w}x${strip.h}px` : 'not visible');

    await p.screenshot({ path: '/home/claude/qa/b-menu.png' });
    await ctx.close();
  }

  /* ================= gameplay ================= */
  {
    const { ctx, p } = await newPage(browser);
    await p.goto(BASE, { waitUntil: 'networkidle' });
    await W(p, () => !!window.NURSE_RUSH, 90000);
    await p.click('#btn-play');
    await state(p, 'intro', 90000);
    await p.click('#btn-skip');
    await state(p, 'running');
    await p.waitForTimeout(2000);

    const all = await measure(p);
    const visible = all.filter((l) => l.visible);
    const big = visible.filter((l) => l.h > 40);
    const footerLogo = shown(all, 'wb-logo--footer')[0];

    const hud = await p.evaluate(() => {
      const r = (s) => { const e = document.querySelector(s); if (!e) return null;
        const b = e.getBoundingClientRect(); return { t: b.top, b: b.bottom, l: b.left, r: b.right }; };
      return { vw: innerWidth, vh: innerHeight, timer: r('.hud-timer'), stats: r('.hud-stats'),
        speed: r('.hud-speed'), footer: r('#dev-footer') };
    });

    check('GAMEPLAY: no large logo over the play area',
      big.length === 0, `${visible.length} logo(s) on screen, largest ${Math.max(...visible.map((l) => l.h))}px`);
    check('GAMEPLAY: only the discreet footer watermark is shown',
      visible.length === 1 && visible[0].cls.includes('footer'),
      footerLogo ? `${footerLogo.w}x${footerLogo.h}px in the footer bar` : 'none');

    const overlapsHud = footerLogo && [hud.timer, hud.stats, hud.speed].some((x) =>
      x && !(footerLogo.right < x.l || footerLogo.left > x.r || footerLogo.bottom < x.t || footerLogo.top > x.b));
    check('GAMEPLAY: watermark obstructs no HUD element',
      !overlapsHud && footerLogo && footerLogo.top >= hud.footer.t - 1,
      'sits inside the footer bar, clear of timer, score, questions counter and speed gauge');

    await p.screenshot({ path: '/home/claude/qa/b-gameplay.png' });

    // during a question
    await p.evaluate(() => { window.NURSE_RUSH.game.roundTime = 24.9; });
    await state(p, 'question', 150000);
    await p.waitForTimeout(800);
    const qAll = await measure(p);
    const qVisible = qAll.filter((l) => l.visible);
    const card = await p.evaluate(() => {
      const c = document.querySelector('.qcard').getBoundingClientRect();
      return { t: c.top, b: c.bottom, l: c.left, r: c.right };
    });
    const overCard = qVisible.some((l) =>
      !(l.right < card.l || l.left > card.r || l.bottom < card.t || l.top > card.b));
    check('QUESTION: no logo overlaps the question card',
      !overCard && qVisible.length === 1,
      `${qVisible.length} logo on screen (footer watermark), card clear`);
    await p.screenshot({ path: '/home/claude/qa/b-question.png' });
    await ctx.close();
  }

  /* ================= victory / game over ================= */
  for (const scenario of ['victory', 'gameover']) {
    const { ctx, p } = await newPage(browser);
    await p.goto(BASE, { waitUntil: 'networkidle' });
    await W(p, () => !!window.NURSE_RUSH, 90000);
    await p.click('#btn-play');
    await state(p, 'intro', 90000);
    await p.click('#btn-skip');
    await state(p, 'running');

    if (scenario === 'victory') {
      await p.evaluate(() => {
        const g = window.NURSE_RUSH.game;
        window.__a = setInterval(() => {
          if (g.state === 'question' && !g.answerLocked) {
            document.querySelectorAll('.opt')[g.correctIndex].click();
          }
        }, 120);
        g.roundTime = 24.9;
      });
      await W(p, () => window.NURSE_RUSH.game.correctAnswers === 1, 150000);
      await state(p, 'running', 120000);
      await p.evaluate(() => { const g = window.NURSE_RUSH.game; g.roundTime = g.nextQuestionAt + 0.05; });
      await W(p, () => window.NURSE_RUSH.game.correctAnswers === 2, 150000);
      await state(p, 'running', 120000);
      await p.evaluate(() => { window.NURSE_RUSH.game.roundTime = 112; });
      await W(p, () => window.NURSE_RUSH.game.world.finishCrossed, 300000);
      await p.evaluate(() => { window.NURSE_RUSH.game.roundTime = 119.7; });
      await p.waitForSelector('#victory.is-active', { timeout: 150000 });
      await p.evaluate(() => clearInterval(window.__a));
    } else {
      await p.evaluate(() => { window.NURSE_RUSH.game.roundTime = 24.9; });
      await state(p, 'question', 150000);
      await p.evaluate(() => {
        const g = window.NURSE_RUSH.game;
        document.querySelectorAll('.opt')[g.correctIndex === 0 ? 1 : 0].click();
      });
      await p.waitForSelector('#gameover.is-active', { timeout: 150000 });
    }
    await p.waitForTimeout(900);

    const all = await measure(p);
    const panel = shown(all, 'wb-logo--panel')[0];
    const label = scenario === 'victory' ? 'VICTORY' : 'GAME OVER';

    const parts = await p.evaluate((s) => {
      const root = document.getElementById(s === 'victory' ? 'victory' : 'gameover');
      const g = (sel) => { const e = root.querySelector(sel); if (!e) return null;
        const r = e.getBoundingClientRect(); return { t: r.top, b: r.bottom, l: r.left, r: r.right }; };
      return { title: g('.result-title'), grid: g('.result-grid'), actions: g('.result-actions'),
        panelBox: g(':scope > *') && root.querySelector('.panel').getBoundingClientRect().toJSON() };
    }, scenario);

    const hits = (a, b) => a && b && !(a.right < b.l || a.left > b.r || a.bottom < b.t || a.top > b.b);
    check(`${label}: WB logo displayed`, !!panel && panel.complete,
      panel ? `${panel.w}x${panel.h}px` : 'not visible');
    check(`${label}: subtle — smaller than the result heading`,
      panel && parts.title && panel.h < (parts.title.b - parts.title.t) + 6,
      panel ? `logo ${panel.h}px vs heading ${Math.round(parts.title.b - parts.title.t)}px` : '');
    check(`${label}: does not interfere with the score or the buttons`,
      panel && !hits(panel, parts.grid) && !hits(panel, parts.actions),
      'clear of the score grid and the action buttons');
    check(`${label}: undistorted and unfiltered`,
      panel && panel.objectFit === 'contain' && Math.abs(panel.w - panel.h) < 1.5 &&
      (panel.filter === 'none' || panel.filter === ''),
      panel ? `${panel.w}x${panel.h}, filter ${panel.filter}` : '');

    await p.screenshot({ path: `/home/claude/qa/b-${scenario}.png` });
    await ctx.close();
  }

  /* ================= footer text ================= */
  {
    const { ctx, p } = await newPage(browser);
    await p.goto(BASE, { waitUntil: 'networkidle' });
    await W(p, () => !!window.NURSE_RUSH, 90000);
    const f = await p.evaluate(() => {
      const el = document.getElementById('dev-footer');
      const credit = document.querySelector('.dev-footer__text');
      const copy = document.querySelector('.dev-footer__copy');
      const pick = (e) => {
        const c = getComputedStyle(e);
        const r = e.getBoundingClientRect();
        return {
          family: c.fontFamily, size: c.fontSize, weight: c.fontWeight,
          spacing: c.letterSpacing, colour: c.color, transform: c.textTransform,
          opacity: c.opacity, left: r.left, right: r.right,
        };
      };
      const lines = [...document.querySelectorAll('.dev-footer__line')].map((l) => {
        const r = l.getBoundingClientRect();
        return { top: Math.round(r.top), bottom: Math.round(r.bottom),
                 centre: Math.round((r.left + r.right) / 2),
                 logos: l.querySelectorAll('.wb-logo').length };
      });
      return {
        text: el.innerText.replace(/\s+/g, ' ').trim(),
        copyText: copy.textContent.trim(),
        creditText: credit.innerText.trim(),
        credit: pick(credit), copy: pick(copy), lines,
        footerLogos: el.querySelectorAll('.wb-logo').length,
        bolds: el.querySelectorAll('b, strong').length,
        viewportCentre: window.innerWidth / 2,
      };
    });

    check('FOOTER: exact copyright line present',
      f.copyText === '© Wejdan Boharam. All Rights Reserved.' && f.copy.transform === 'none',
      `"${f.copyText}"`);
    check('FOOTER: exact developer credit present',
      f.creditText === 'Developed by Wejdan Boharam' && f.credit.transform === 'none',
      `"${f.creditText}"`);
    check('FOOTER: exactly two lines', f.lines.length === 2, `${f.lines.length} line(s)`);

    const sameType = f.credit.family === f.copy.family && f.credit.size === f.copy.size &&
      f.credit.weight === f.copy.weight && f.credit.spacing === f.copy.spacing;
    check('FOOTER: both lines share the same family, size, weight and letter spacing',
      sameType,
      `credit ${f.credit.size}/${f.credit.weight}/${f.credit.spacing} vs copyright ${f.copy.size}/${f.copy.weight}/${f.copy.spacing}`);
    check('FOOTER: both lines have identical visual prominence',
      f.credit.colour === f.copy.colour && f.credit.opacity === f.copy.opacity,
      `${f.credit.colour} vs ${f.copy.colour}`);
    check('FOOTER: the copyright line is not smaller or lighter than the credit',
      parseFloat(f.copy.size) >= parseFloat(f.credit.size) &&
      parseInt(f.copy.weight, 10) >= parseInt(f.credit.weight, 10));
    check('FOOTER: no bold emphasis making part of a line heavier',
      f.bolds === 0, `${f.bolds} bold element(s)`);
    check('FOOTER: both lines centred horizontally',
      Math.abs(f.lines[0].centre - f.viewportCentre) <= 2 &&
      Math.abs(f.lines[1].centre - f.viewportCentre) <= 2,
      `centres ${f.lines[0].centre} / ${f.lines[1].centre} vs viewport ${f.viewportCentre}`);
    check('FOOTER: lines stacked with consistent spacing, no overlap',
      f.lines[0].bottom <= f.lines[1].top + 1 && (f.lines[1].top - f.lines[0].bottom) <= 8,
      `gap ${f.lines[1].top - f.lines[0].bottom}px`);
    check('FOOTER: the WB mark sits on line 1 only',
      f.lines[0].logos === 1 && f.lines[1].logos === 0 && f.footerLogos === 1,
      `line 1: ${f.lines[0].logos}, line 2: ${f.lines[1].logos}`);
    check('FOOTER: the logo has not replaced the copyright text',
      /Wejdan Boharam\. All Rights Reserved\./.test(f.text));
    await ctx.close();
  }

  /* ================= responsive ================= */
  const iosUA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
  const ipadUA = 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
  for (const [name, vp, touch, ua] of [
    ['iPhone portrait', { width: 390, height: 844 }, true, iosUA],
    ['iPhone landscape', { width: 844, height: 390 }, true, iosUA],
    ['iPad', { width: 820, height: 1180 }, true, ipadUA],
    ['Desktop', { width: 1440, height: 900 }, false, undefined],
  ]) {
    const { ctx, p } = await newPage(browser, vp,
      { hasTouch: touch, isMobile: touch, deviceScaleFactor: touch ? 2 : 1, userAgent: ua });
    await p.goto(BASE, { waitUntil: 'networkidle' });
    await W(p, () => !!window.NURSE_RUSH, 90000);
    if (await p.locator('#rotate.is-active').count()) await p.click('#btn-rotate-ok');
    await p.waitForTimeout(900);

    const all = await measure(p);
    const menu = shown(all, 'wb-logo--menu')[0];
    const foot = shown(all, 'wb-logo--footer')[0];
    const layout = await p.evaluate(() => {
      const r = (s) => { const e = document.querySelector(s); if (!e) return null;
        const b = e.getBoundingClientRect(); return { t: b.top, b: b.bottom, l: b.left, r: b.right, h: b.height }; };
      return { vw: innerWidth, vh: innerHeight, buttons: r('.menu-buttons'),
        footer: r('#dev-footer'), copy: r('.dev-footer__copy'), logoTop: r('.logo') };
    });

    const onScreen = menu && menu.left >= -1 && menu.right <= layout.vw + 1 && menu.top >= -1;
    check(`${name}: menu logo loads, fits and keeps its shape`,
      menu && menu.complete && onScreen && Math.abs(menu.w - menu.h) < 1.5,
      menu ? `${menu.w}x${menu.h}px on a ${layout.vw}x${layout.vh} viewport` : 'not visible');
    check(`${name}: menu still fits — nothing overlaps the footer`,
      layout.buttons.b <= layout.footer.t + 1,
      `buttons end ${Math.round(layout.buttons.b)}px, footer starts ${Math.round(layout.footer.t)}px`);
    const fit = await p.evaluate(() => {
      const el = document.getElementById('dev-footer');
      const ls = [...el.querySelectorAll('.dev-footer__line')].map((l) => {
        const r = l.getBoundingClientRect();
        return { l: Math.round(r.left), r: Math.round(r.right), t: Math.round(r.top), b: Math.round(r.bottom) };
      });
      const fr = el.getBoundingClientRect();
      const c = getComputedStyle(document.querySelector('.dev-footer__copy'));
      return { ls, footTop: Math.round(fr.top), size: c.fontSize, vw: innerWidth, vh: innerHeight,
               clipped: [...el.querySelectorAll('.dev-footer__text, .dev-footer__copy')]
                 .some((e) => e.scrollWidth > e.clientWidth + 1) };
    });
    const inside = fit.ls.every((r) => r.l >= -1 && r.r <= fit.vw + 1 &&
      r.t >= fit.footTop - 1 && r.b <= fit.vh + 1);
    check(`${name}: both footer lines fit without clipping or overlap`,
      foot && fit.ls.length === 2 && inside && !fit.clipped,
      `line widths ${fit.ls.map((r) => r.r - r.l).join(' / ')}px in ${fit.vw}px at ${fit.size}`);

    await p.screenshot({ path: `/home/claude/qa/b-${name.replace(/\s+/g, '-').toLowerCase()}.png` });
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
  console.log('\nALL BRAND LOGO CHECKS PASSED');
}

run().catch((e) => {
  console.error('\nHARNESS ERROR:', e.message);
  const fails = results.filter((r) => !r.ok);
  console.log(`${results.length - fails.length}/${results.length} completed before the error`);
  fails.forEach((f) => console.log(`  ✗ ${f.name} — ${f.detail}`));
  consoleErrors.slice(0, 8).forEach((x) => console.log('  !', x));
  process.exit(1);
});
