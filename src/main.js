import './style.css';
import { Game } from './core/Game.js';
import { UI } from './ui/UI.js';
import { AudioEngine } from './core/Audio.js';
import { Input } from './core/Input.js';
import { Storage } from './core/Storage.js';
import { validateBank, QUESTIONS, pickRoundQuestions, prepare } from './data/questions.js';
import { ROUND } from './core/Game.js';

/* ------------------------------------------------------------------ */
/* boot                                                               */
/* ------------------------------------------------------------------ */

const canvas = document.getElementById('game-canvas');
const ui = new UI();

// fail loudly if the question bank was edited into an invalid state
const bankIssues = validateBank();
if (bankIssues.length) {
  console.error('[NURSE RUSH] question bank problems:', bankIssues);
} else {
  console.info(`[NURSE RUSH] question bank OK - ${QUESTIONS.length} SBAR questions imported.`);
}

const audio = new AudioEngine(Storage.get('sound'));
// Gestures go to the canvas, not window, so the menus and the question card
// keep normal touch behaviour (including scrolling a long question).
const input = new Input(canvas);

let game = null;

function boot() {
  let p = 0;
  const step = () => {
    p += 0.11 + Math.random() * 0.14;
    ui.setLoaderProgress(Math.min(1, p));
    if (p < 1) {
      requestAnimationFrame(step);
    } else {
      game = new Game({ canvas, ui, audio, input });
      game.buildMenu();
      game.start();

      // Handle for QA: lets the flow be driven from the console or an
      // automated test (e.g. NURSE_RUSH.game.roundTime = 34), and lets the
      // question bank be audited against the source document at runtime.
      window.NURSE_RUSH = {
        game, ui, audio, input, Storage, ROUND,
        questionApi: { QUESTIONS, validateBank, pickRoundQuestions, prepare },
      };

      const s = Storage.all();
      ui.setMenuBest(s.best, s.wins, s.rounds);
      ui.setSoundLabel(s.sound);

      // portrait phones get a one-time nudge towards landscape
      const narrow = window.innerHeight > window.innerWidth && window.innerWidth < 500;
      if (narrow && !Storage.get('seenRotate')) {
        ui.show('rotate');
      } else {
        ui.show('menu');
      }
    }
  };
  requestAnimationFrame(step);
}

/* ------------------------------------------------------------------ */
/* buttons                                                            */
/* ------------------------------------------------------------------ */

function click(id, fn) {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    audio.resume();
    if (Storage.get('sound')) audio.click();
    fn();
  });
}

click('btn-play', () => {
  audio.resume();
  game.startRound();
});

click('btn-howto', () => ui.show('howto'));
click('btn-howto-back', () => ui.show('menu'));

click('btn-sound', () => {
  const on = !Storage.get('sound');
  Storage.set('sound', on);
  audio.setEnabled(on);
  ui.setSoundLabel(on);
});

click('btn-skip', () => game.skipIntro());

click('btn-win-again', () => game.startRound({ skipIntro: true }));
click('btn-lose-again', () => game.startRound({ skipIntro: true }));
click('btn-win-menu', () => game.returnToMenu());
click('btn-lose-menu', () => game.returnToMenu());

click('btn-rotate-ok', () => {
  Storage.set('seenRotate', true);
  ui.show('menu');
});

/* ------------------------------------------------------------------ */
/* misc hardening                                                     */
/* ------------------------------------------------------------------ */

// iOS: stop double-tap zoom and rubber-banding over the canvas
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('dblclick', (e) => e.preventDefault());
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

// the developer credit is part of the product - put it in the console too
console.info('%cNURSE RUSH', 'font-weight:bold;font-size:16px;color:#19b8a6',
  '\nDeveloped by Wejdan Boharam');

boot();
