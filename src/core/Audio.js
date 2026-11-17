/**
 * NURSE RUSH - audio.
 *
 * Everything is synthesised with the Web Audio API at runtime: there are no
 * audio files, so nothing needs licensing and nothing needs downloading.
 * The music is a short looping sequence whose tempo and layering follow the
 * round's speed tier, so it gets more energetic as the shift gets harder.
 */

const NOTE = (semi) => 440 * Math.pow(2, (semi - 9) / 12);

// A minor pentatonic-ish bed - reads as urgent but not unpleasant
const BASS = [-24, -24, -17, -24, -22, -22, -15, -22];
const LEAD = [0, 3, 7, 10, 12, 10, 7, 3, 0, 7, 3, 10, 12, 15, 12, 7];

export class AudioEngine {
  constructor(enabled = true) {
    this.enabled = enabled;
    this.ctx = null;
    this.master = null;
    this.musicGain = null;
    this.sfxGain = null;

    this.musicOn = false;
    this.step = 0;
    this.nextTime = 0;
    this.bpm = 112;
    this.intensity = 0;
    this.timer = null;
    this.sirenNodes = null;
  }

  // ---------------------------------------------------------------
  init() {
    if (this.ctx) return this.ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { this.enabled = false; return null; }
    this.ctx = new AC();

    this.master = this.ctx.createGain();
    this.master.gain.value = this.enabled ? 0.9 : 0;
    this.master.connect(this.ctx.destination);

    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.0;
    this.musicGain.connect(this.master);

    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = 0.85;
    this.sfxGain.connect(this.master);

    // soft limiter so stacked pickups never clip
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -12;
    comp.ratio.value = 6;
    this.sfxGain.disconnect();
    this.sfxGain.connect(comp);
    comp.connect(this.master);

    return this.ctx;
  }

  /** Must be called from a user gesture on iOS/Safari. */
  resume() {
    this.init();
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  setEnabled(on) {
    this.enabled = on;
    if (this.master) {
      const now = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setTargetAtTime(on ? 0.9 : 0, now, 0.05);
    }
  }

  // ---------------------------------------------------------------
  // low-level voices
  // ---------------------------------------------------------------
  _tone({ freq = 440, type = 'sine', dur = 0.2, gain = 0.2, at = 0, attack = 0.005,
          decay = null, detune = 0, slideTo = null, dest = null }) {
    if (!this.ctx || !this.enabled) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime + at;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    if (detune) osc.detune.value = detune;

    const d = decay ?? dur;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + d);

    osc.connect(g);
    g.connect(dest || this.sfxGain);
    osc.start(t0);
    osc.stop(t0 + d + 0.05);
  }

  _noise({ dur = 0.2, gain = 0.2, at = 0, type = 'highpass', freq = 900, q = 1, dest = null }) {
    if (!this.ctx || !this.enabled) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime + at;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

    src.connect(f); f.connect(g); g.connect(dest || this.sfxGain);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  // ---------------------------------------------------------------
  // sound effects
  // ---------------------------------------------------------------
  coin() {
    this._tone({ freq: NOTE(16), type: 'triangle', dur: 0.08, gain: 0.22 });
    this._tone({ freq: NOTE(23), type: 'triangle', dur: 0.14, gain: 0.18, at: 0.055 });
  }
  cash() {
    this._tone({ freq: NOTE(12), type: 'square', dur: 0.07, gain: 0.12 });
    this._tone({ freq: NOTE(19), type: 'square', dur: 0.07, gain: 0.12, at: 0.05 });
    this._tone({ freq: NOTE(24), type: 'triangle', dur: 0.18, gain: 0.16, at: 0.1 });
  }
  pickup() {
    this._tone({ freq: NOTE(11), type: 'sine', dur: 0.1, gain: 0.2, slideTo: NOTE(23) });
    this._noise({ dur: 0.08, gain: 0.07, freq: 2600 });
  }
  jump() {
    this._tone({ freq: 240, type: 'sine', dur: 0.2, gain: 0.2, slideTo: 620 });
    this._noise({ dur: 0.07, gain: 0.05, freq: 1400 });
  }
  land() {
    this._tone({ freq: 160, type: 'sine', dur: 0.12, gain: 0.16, slideTo: 70 });
    this._noise({ dur: 0.1, gain: 0.08, type: 'lowpass', freq: 500 });
  }
  slide() {
    this._noise({ dur: 0.5, gain: 0.16, type: 'bandpass', freq: 1100, q: 0.8 });
  }
  hit() {
    this._tone({ freq: 180, type: 'sawtooth', dur: 0.26, gain: 0.26, slideTo: 58 });
    this._noise({ dur: 0.22, gain: 0.2, type: 'lowpass', freq: 800 });
  }
  lane() {
    this._noise({ dur: 0.07, gain: 0.05, type: 'bandpass', freq: 2000 });
  }
  click() {
    this._tone({ freq: NOTE(14), type: 'triangle', dur: 0.07, gain: 0.16 });
  }
  questionIn() {
    this._tone({ freq: NOTE(7), type: 'sine', dur: 0.3, gain: 0.16 });
    this._tone({ freq: NOTE(14), type: 'sine', dur: 0.4, gain: 0.14, at: 0.1 });
    this._tone({ freq: NOTE(19), type: 'sine', dur: 0.5, gain: 0.12, at: 0.2 });
  }
  tick(urgent = false) {
    this._tone({ freq: urgent ? 1400 : 1000, type: 'square', dur: 0.045, gain: urgent ? 0.14 : 0.07 });
  }
  correct() {
    [0, 4, 7, 12].forEach((s, i) =>
      this._tone({ freq: NOTE(12 + s), type: 'triangle', dur: 0.4, gain: 0.18, at: i * 0.08 })
    );
  }
  wrong() {
    this._tone({ freq: NOTE(6), type: 'sawtooth', dur: 0.45, gain: 0.2, slideTo: NOTE(-8) });
    this._tone({ freq: NOTE(5), type: 'square', dur: 0.5, gain: 0.12, at: 0.08, slideTo: NOTE(-10) });
  }
  victory() {
    const seq = [0, 4, 7, 12, 16, 19, 24];
    seq.forEach((s, i) =>
      this._tone({ freq: NOTE(12 + s), type: 'triangle', dur: 0.5, gain: 0.2, at: i * 0.11 })
    );
    this._noise({ dur: 0.6, gain: 0.06, freq: 4000, at: 0.1 });
  }
  gameOver() {
    [0, -3, -7, -12].forEach((s, i) =>
      this._tone({ freq: NOTE(9 + s), type: 'sawtooth', dur: 0.7, gain: 0.16, at: i * 0.16 })
    );
  }
  doors() {
    this._noise({ dur: 0.85, gain: 0.14, type: 'lowpass', freq: 700, q: 0.7 });
    this._tone({ freq: 90, type: 'sine', dur: 0.8, gain: 0.1, slideTo: 150 });
  }
  /** Oxygen power-up: a bright rising sweep with a hiss of released gas. */
  boost() {
    this._tone({ freq: NOTE(0), type: 'triangle', dur: 0.45, gain: 0.22, slideTo: NOTE(24) });
    this._tone({ freq: NOTE(7), type: 'square', dur: 0.4, gain: 0.1, at: 0.05, slideTo: NOTE(28) });
    [12, 16, 19, 24].forEach((s, i) =>
      this._tone({ freq: NOTE(s), type: 'triangle', dur: 0.3, gain: 0.14, at: 0.12 + i * 0.06 })
    );
    // escaping gas
    this._noise({ dur: 0.45, gain: 0.12, type: 'highpass', freq: 3200 });
  }

  finish() {
    this._tone({ freq: NOTE(12), type: 'square', dur: 0.1, gain: 0.16 });
    this._tone({ freq: NOTE(24), type: 'square', dur: 0.3, gain: 0.18, at: 0.1 });
  }

  // ---------------------------------------------------------------
  // emergency siren (intro)
  // ---------------------------------------------------------------
  startSiren() {
    if (!this.ctx || !this.enabled || this.sirenNodes) return;
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    const g = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.value = 660;
    lfo.type = 'sine';
    lfo.frequency.value = 0.75;
    lfoGain.gain.value = 220;

    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 1800;

    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.linearRampToValueAtTime(0.14, ctx.currentTime + 0.25);

    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);
    osc.connect(f); f.connect(g); g.connect(this.sfxGain);
    osc.start(); lfo.start();

    this.sirenNodes = { osc, lfo, g };
  }

  stopSiren(fade = 0.5) {
    if (!this.sirenNodes) return;
    const { osc, lfo, g } = this.sirenNodes;
    const now = this.ctx.currentTime;
    g.gain.cancelScheduledValues(now);
    g.gain.setTargetAtTime(0.0001, now, fade / 3);
    setTimeout(() => {
      try { osc.stop(); lfo.stop(); } catch (e) { /* already stopped */ }
    }, fade * 1000 + 120);
    this.sirenNodes = null;
  }

  // ---------------------------------------------------------------
  // music sequencer
  // ---------------------------------------------------------------
  startMusic(intensity = 0) {
    this.init();
    if (!this.ctx) return;
    this.intensity = intensity;
    if (this.musicOn) return;
    this.musicOn = true;
    this.step = 0;
    this.nextTime = this.ctx.currentTime + 0.1;
    this.musicGain.gain.setTargetAtTime(0.34, this.ctx.currentTime, 0.4);
    this.timer = setInterval(() => this._schedule(), 60);
  }

  stopMusic() {
    if (!this.musicOn) return;
    this.musicOn = false;
    clearInterval(this.timer);
    this.timer = null;
    if (this.musicGain) {
      this.musicGain.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.25);
    }
  }

  /** 0..1 - drives tempo and how many layers play. */
  setIntensity(v) {
    this.intensity = Math.max(0, Math.min(1, v));
    this.bpm = 112 + this.intensity * 56;
  }

  /** Duck the music while a question is on screen. */
  duck(on) {
    if (!this.musicGain || !this.ctx) return;
    this.musicGain.gain.setTargetAtTime(on ? 0.12 : 0.34, this.ctx.currentTime, 0.25);
  }

  _schedule() {
    if (!this.musicOn || !this.ctx || !this.enabled) return;
    const spb = 60 / this.bpm / 4; // sixteenth notes
    const horizon = this.ctx.currentTime + 0.25;

    while (this.nextTime < horizon) {
      const s = this.step;
      const at = this.nextTime - this.ctx.currentTime;
      const I = this.intensity;

      // kick
      if (s % 4 === 0) {
        this._tone({ freq: 120, type: 'sine', dur: 0.14, gain: 0.26, slideTo: 48, at, dest: this.musicGain });
      }
      // hats pick up with intensity
      if (s % 2 === 1 && I > 0.18) {
        this._noise({ dur: 0.04, gain: 0.05 + I * 0.05, freq: 7000, at, dest: this.musicGain });
      }
      if (s % 4 === 2 && I > 0.55) {
        this._noise({ dur: 0.09, gain: 0.08, type: 'bandpass', freq: 2200, at, dest: this.musicGain });
      }
      // bass
      if (s % 2 === 0) {
        const n = BASS[(s / 2) % BASS.length];
        this._tone({
          freq: NOTE(n), type: 'square', dur: spb * 1.7, gain: 0.1,
          at, dest: this.musicGain, decay: spb * 1.9,
        });
      }
      // lead arpeggio from tier 2 on
      if (I > 0.3) {
        const n = LEAD[s % LEAD.length];
        this._tone({
          freq: NOTE(n + 12), type: 'triangle', dur: spb * 1.2,
          gain: 0.05 + I * 0.055, at, dest: this.musicGain,
        });
      }
      // pulse pad at high intensity
      if (I > 0.72 && s % 8 === 0) {
        this._tone({ freq: NOTE(-5), type: 'sawtooth', dur: spb * 7, gain: 0.04, at, dest: this.musicGain });
      }

      this.nextTime += spb;
      this.step = (this.step + 1) % 64;
    }
  }
}
