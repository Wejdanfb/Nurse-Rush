/**
 * Local persistence for the best score and game settings.
 * Wrapped in try/catch: private-mode browsers and some embedded
 * webviews throw on localStorage access.
 */

const KEY = 'nurse-rush/v1';

const DEFAULTS = {
  best: 0,
  bestCoins: 0,
  rounds: 0,
  wins: 0,
  sound: true,
  quality: 'auto',
  seenHowTo: false,
};

let cache = null;

function load() {
  if (cache) return cache;
  cache = { ...DEFAULTS };
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) Object.assign(cache, JSON.parse(raw));
  } catch (e) {
    /* storage unavailable - run with defaults */
  }
  return cache;
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
  } catch (e) {
    /* ignore */
  }
}

export const Storage = {
  get(key) { return load()[key]; },
  set(key, value) { load()[key] = value; save(); },
  all() { return { ...load() }; },

  /** Returns true if this is a new personal best. */
  submitScore(score, coins, won) {
    const s = load();
    s.rounds += 1;
    if (won) s.wins += 1;
    if (coins > s.bestCoins) s.bestCoins = coins;
    const isBest = score > s.best;
    if (isBest) s.best = score;
    save();
    return isBest;
  },
};
