/**
 * Unified input: touch swipe gestures + keyboard.
 * Emits one of: 'left' | 'right' | 'up' | 'down'
 */

const SWIPE_MIN = 26;        // px before a drag counts as a swipe
const SWIPE_MAX_TIME = 650;  // ms - slower than this is a drag, not a swipe
const TAP_MAX = 14;          // px - below this it is a tap

export class Input {
  constructor(target = window) {
    this.target = target;
    this.handlers = new Set();
    this.enabled = true;

    this.sx = 0; this.sy = 0; this.st = 0;
    this.tracking = false;
    this.fired = false;

    this._bind();
  }

  on(fn) { this.handlers.add(fn); return () => this.handlers.delete(fn); }

  emit(action) {
    if (!this.enabled) return;
    for (const fn of this.handlers) fn(action);
  }

  _bind() {
    const el = this.target;

    // ---------- keyboard ----------
    this._onKey = (e) => {
      const map = {
        ArrowLeft: 'left', KeyA: 'left',
        ArrowRight: 'right', KeyD: 'right',
        ArrowUp: 'up', KeyW: 'up', Space: 'up',
        ArrowDown: 'down', KeyS: 'down',
      };
      const a = map[e.code];
      if (!a) return;
      e.preventDefault();
      if (e.repeat) return;
      this.emit(a);
    };
    window.addEventListener('keydown', this._onKey, { passive: false });

    // ---------- pointer / touch ----------
    const start = (x, y) => {
      this.sx = x; this.sy = y; this.st = performance.now();
      this.tracking = true; this.fired = false;
    };

    const move = (x, y) => {
      if (!this.tracking || this.fired) return;
      const dx = x - this.sx;
      const dy = y - this.sy;
      const adx = Math.abs(dx);
      const ady = Math.abs(dy);
      if (Math.max(adx, ady) < SWIPE_MIN) return;
      if (performance.now() - this.st > SWIPE_MAX_TIME) { this.tracking = false; return; }

      // fire as soon as the gesture is unambiguous - feels much more responsive
      // than waiting for the finger to lift
      this.fired = true;
      if (adx > ady) this.emit(dx > 0 ? 'right' : 'left');
      else this.emit(dy > 0 ? 'down' : 'up');
    };

    const end = (x, y) => {
      if (!this.tracking) return;
      const dx = x - this.sx;
      const dy = y - this.sy;
      if (!this.fired && Math.abs(dx) < TAP_MAX && Math.abs(dy) < TAP_MAX) {
        this.emit('up'); // tap to jump
      }
      this.tracking = false;
    };

    this._onTouchStart = (e) => {
      const t = e.changedTouches[0];
      start(t.clientX, t.clientY);
    };
    this._onTouchMove = (e) => {
      const t = e.changedTouches[0];
      move(t.clientX, t.clientY);
      if (e.cancelable) e.preventDefault();
    };
    this._onTouchEnd = (e) => {
      const t = e.changedTouches[0];
      end(t.clientX, t.clientY);
    };

    el.addEventListener('touchstart', this._onTouchStart, { passive: true });
    el.addEventListener('touchmove', this._onTouchMove, { passive: false });
    el.addEventListener('touchend', this._onTouchEnd, { passive: true });
    el.addEventListener('touchcancel', () => { this.tracking = false; }, { passive: true });

    // mouse drag (useful on desktop + for testing)
    this._onMouseDown = (e) => { if (e.button === 0) start(e.clientX, e.clientY); };
    this._onMouseMove = (e) => move(e.clientX, e.clientY);
    this._onMouseUp = (e) => end(e.clientX, e.clientY);
    el.addEventListener('mousedown', this._onMouseDown);
    el.addEventListener('mousemove', this._onMouseMove);
    el.addEventListener('mouseup', this._onMouseUp);
  }

  dispose() {
    window.removeEventListener('keydown', this._onKey);
    const el = this.target;
    el.removeEventListener('touchstart', this._onTouchStart);
    el.removeEventListener('touchmove', this._onTouchMove);
    el.removeEventListener('touchend', this._onTouchEnd);
    el.removeEventListener('mousedown', this._onMouseDown);
    el.removeEventListener('mousemove', this._onMouseMove);
    el.removeEventListener('mouseup', this._onMouseUp);
    this.handlers.clear();
  }
}
