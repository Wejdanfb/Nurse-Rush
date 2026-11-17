import * as THREE from 'three';
import { Nurse } from '../entities/Nurse.js';
import { Particles } from '../entities/Particles.js';
import { RunnerWorld, LANE_X } from '../world/RunnerWorld.js';
import { Cinematic } from '../intro/Cinematic.js';
import { skyTexture, asphaltTexture, glowTexture } from '../world/Textures.js';
import { acquireObstacle, releaseObstacle, pulseEmergencyMaterials } from '../entities/Obstacles.js';
import { pickRoundQuestions } from '../data/questions.js';
import { Storage } from './Storage.js';

/* ------------------------------------------------------------------ */
/* round configuration - every number the brief specifies lives here  */
/* ------------------------------------------------------------------ */
export const ROUND = {
  DURATION: 120,            // seconds, questions included; intro excluded
  QUESTION_TIMES: [35, 80], // seconds into the round
  ANSWER_LIMIT: 10,         // seconds per question
  CORRECT_POINTS: 100,
  HIT_PENALTY: 50,
  FINISH_GATE_AT: 112,      // gate appears in the last stretch
};

// 0-20 / 20-40 / 40-60 / 60-80 / 80-100 / 100-120
const TIERS = [
  { speed: 13.0, label: 'NORMAL' },
  { speed: 15.5, label: 'PICKING UP' },
  { speed: 18.0, label: 'MEDIUM' },
  { speed: 21.0, label: 'FAST' },
  { speed: 24.5, label: 'VERY FAST' },
  { speed: 28.0, label: 'MAXIMUM' },
];

const GRAVITY = -26;
const JUMP_V = 9.4;
const SLIDE_TIME = 0.72;
const LANE_LERP = 13;

export class Game {
  constructor({ canvas, ui, audio, input }) {
    this.canvas = canvas;
    this.ui = ui;
    this.audio = audio;
    this.input = input;

    this.quality = this._detectQuality();
    this._initRenderer();

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, 1, 0.1, 320);

    this.nurse = new Nurse({ shadows: this.quality.shadows });
    this.particles = new Particles(this.scene, { count: this.quality.particles });

    this.state = 'boot';     // boot | menu | intro | running | question | over
    this.clock = new THREE.Clock();
    this.accum = 0;

    this._setupLights();
    this._setupSky();

    this.world = null;
    this.cinematic = null;
    this.menuRig = null;

    this.input.on((a) => this._onAction(a));
    window.addEventListener('resize', () => this._resize());
    window.addEventListener('orientationchange', () => setTimeout(() => this._resize(), 250));
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state === 'running') this._pausedByBlur = true;
    });

    this._resize();
    this._resetRoundState();
  }

  /* ---------------------------------------------------------------- */
  /* setup                                                            */
  /* ---------------------------------------------------------------- */
  _detectQuality() {
    const ua = navigator.userAgent || '';
    const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua) ||
      (navigator.maxTouchPoints > 1 && /Mac/.test(ua));  // iPad on iOS 13+
    const cores = navigator.hardwareConcurrency || 4;
    const small = Math.min(window.innerWidth, window.innerHeight) < 500;
    const low = isMobile && (cores <= 4 || small);

    return {
      isMobile,
      shadows: !isMobile && cores > 4,
      pixelRatio: isMobile ? Math.min(window.devicePixelRatio || 1, 2) : Math.min(window.devicePixelRatio || 1, 2),
      maxPixels: low ? 1.25e6 : isMobile ? 2.1e6 : 4.2e6,
      particles: low ? 90 : isMobile ? 130 : 190,
      fogNear: isMobile ? 48 : 60,
      fogFar: isMobile ? 118 : 150,
    };
  }

  _initRenderer() {
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: !this.quality.isMobile,
      powerPreference: 'high-performance',
      alpha: false,
      stencil: false,
    });
    this.renderer.setPixelRatio(this.quality.pixelRatio);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    if (this.quality.shadows) {
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    }
  }

  _setupLights() {
    this.hemi = new THREE.HemisphereLight(0xd8f0f8, 0x27414b, 0.9);
    this.scene.add(this.hemi);

    this.sun = new THREE.DirectionalLight(0xfff0d8, 1.0);
    this.sun.position.set(-7, 12, 6);
    if (this.quality.shadows) {
      this.sun.castShadow = true;
      this.sun.shadow.mapSize.set(1024, 1024);
      const d = 14;
      Object.assign(this.sun.shadow.camera, { left: -d, right: d, top: d, bottom: -d, near: 1, far: 48 });
      this.sun.shadow.bias = -0.0012;
    }
    this.scene.add(this.sun);
    this.sunTarget = new THREE.Object3D();
    this.scene.add(this.sunTarget);
    this.sun.target = this.sunTarget;

    // rim light so the character separates from the background
    this.rim = new THREE.DirectionalLight(0x6fe4d2, 0.5);
    this.rim.position.set(4, 4, -8);
    this.scene.add(this.rim);
  }

  _setupSky() {
    const geo = new THREE.SphereGeometry(200, 20, 14);
    const mat = new THREE.MeshBasicMaterial({
      map: skyTexture('dusk'), side: THREE.BackSide, depthWrite: false, fog: false,
    });
    this.sky = new THREE.Mesh(geo, mat);
    this.scene.add(this.sky);
    this.scene.fog = new THREE.Fog(0x14525f, this.quality.fogNear, this.quality.fogFar);
  }

  _resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    // cap the pixel budget so large retina screens stay smooth
    const want = w * h * this.quality.pixelRatio * this.quality.pixelRatio;
    const scale = want > this.quality.maxPixels ? Math.sqrt(this.quality.maxPixels / want) : 1;
    this.renderer.setPixelRatio(this.quality.pixelRatio * scale);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // widen the field of view on tall/narrow screens so the lanes still fit
    this.camera.fov = h > w ? 74 : 62;
    this.camera.updateProjectionMatrix();
  }

  /* ---------------------------------------------------------------- */
  /* menu background scene                                            */
  /* ---------------------------------------------------------------- */
  buildMenu() {
    if (this.menuRig) return;
    const rig = new THREE.Group();
    this.scene.add(rig);

    const apron = new THREE.Mesh(
      new THREE.PlaneGeometry(90, 90),
      new THREE.MeshStandardMaterial({ map: asphaltTexture(), roughness: 0.9 })
    );
    apron.rotation.x = -Math.PI / 2;
    apron.receiveShadow = true;
    rig.add(apron);

    // spotlight pool under the nurse
    const pool = new THREE.Mesh(
      new THREE.PlaneGeometry(9, 9),
      new THREE.MeshBasicMaterial({
        map: glowTexture('120,255,230'), transparent: true, opacity: 0.3,
        depthWrite: false, blending: THREE.AdditiveBlending,
      })
    );
    pool.rotation.x = -Math.PI / 2;
    pool.position.y = 0.02;
    rig.add(pool);

    const ambulances = [];
    const layout = [[-4.6, -5.0, 0.55], [4.4, -6.2, -0.5], [-0.4, -13.5, 0.1]];
    for (const [x, z, ry] of layout) {
      const a = acquireObstacle('ambulance');
      a.position.set(x, 0, z);
      a.rotation.y = Math.PI + ry;
      rig.add(a);
      ambulances.push(a);
    }

    this.nurse.group.position.set(0, 0, 0);
    this.nurse.group.rotation.y = 0.35;
    this.nurse.play('idle', { force: true });
    rig.add(this.nurse.group);

    // a dedicated key light so the character is the brightest thing on the
    // menu rather than a silhouette against the ambulances
    this.menuKey = new THREE.PointLight(0xbdf6ec, 22, 14, 2);
    this.menuKey.position.set(1.6, 3.0, 2.6);
    rig.add(this.menuKey);

    this.menuRig = { rig, ambulances, t: 0 };
    this.hemi.intensity = 1.15;
    this.sun.intensity = 1.3;
    this.scene.fog.near = 24;
    this.scene.fog.far = 78;
    this.state = 'menu';
  }

  destroyMenu() {
    if (!this.menuRig) return;
    const { rig, ambulances } = this.menuRig;
    for (const a of ambulances) releaseObstacle(a);
    rig.remove(this.nurse.group);
    this.scene.remove(rig);
    rig.traverse((o) => {
      if (!o.isMesh) return;
      o.geometry?.dispose?.();
      o.material?.dispose?.();
    });
    this.menuRig = null;
  }

  _updateMenu(dt) {
    const m = this.menuRig;
    m.t += dt;
    const t = m.t;
    pulseEmergencyMaterials(t);

    // slow orbit around the nurse, framed for the gap between the logo and
    // the buttons
    const a = 0.45 + Math.sin(t * 0.12) * 0.55;
    const r = 4.2;
    this.camera.position.set(Math.sin(a) * r, 1.78 + Math.sin(t * 0.3) * 0.16, Math.cos(a) * r + 0.4);
    this.camera.lookAt(0, 0.92, -0.3);
    // keep the key light in front of her as the camera swings
    this.menuKey.position.set(Math.sin(a + 0.5) * 3.2, 2.9, Math.cos(a + 0.5) * 3.2);

    this.nurse.group.rotation.y = 0.35 + Math.sin(t * 0.25) * 0.25;
    this.nurse.update(dt, {});
    this.particles.update(dt, 0);
  }

  /* ---------------------------------------------------------------- */
  /* round lifecycle                                                  */
  /* ---------------------------------------------------------------- */
  _resetRoundState() {
    this.score = 0;
    this.coins = 0;
    this.correctAnswers = 0;
    this.roundTime = 0;
    this.speed = 0;
    this._lastTier = -1;
    this._overT = 0;
    this.lane = 1;
    this.laneX = LANE_X[1];
    this.playerY = 0;
    this.vy = 0;
    this.airborne = false;
    this.sliding = 0;
    // must be cleared, or a down-swipe made while airborne in one round
    // leaks into the next and causes an unasked-for slide on landing
    this.pendingSlide = false;
    this.stumble = 0;
    this.slowUntil = 0;
    this.shake = 0;
    this.questions = [];
    this.questionIndex = 0;
    this.activeQuestion = null;
    this.questionClock = 0;
    this.answerLocked = false;
    this.finishing = false;
    this.lastTickSecond = -1;
    this._pausedByBlur = false;
    this.camLook = new THREE.Vector3(0, 1.3, -8);
  }

  /** Called by Play - runs the cinematic, then gameplay. */
  startRound({ skipIntro = false } = {}) {
    this.destroyMenu();
    this._resetRoundState();
    this.questions = pickRoundQuestions();

    this.ui.hideAllScreens();
    this.ui.setHud(false);
    this.ui.setFade(0);
    this.scene.add(this.nurse.group);

    // Play Again skips the cinematic, so don't build the corridor at all -
    // constructing the whole hospital only to tear it down a moment later
    // is a visible hitch on a phone between back-to-back rounds.
    if (skipIntro) {
      this.ui.setIntroUI(false);
      this.state = 'intro';
      this.cinematic = null;
      this._beginGameplay();
      return;
    }

    this.ui.setIntroUI(true);
    this.cinematic = new Cinematic({
      scene: this.scene,
      camera: this.camera,
      nurse: this.nurse,
      audio: this.audio,
      ui: this.ui,
      quality: this.quality,
    });
    this.scene.fog.near = 14;
    this.scene.fog.far = 90;
    this.state = 'intro';
  }

  skipIntro() {
    if (this.state === 'intro' && this.cinematic) this.cinematic.skip();
  }

  _beginGameplay() {
    // null when the intro was skipped outright and never built
    if (this.cinematic) {
      this.cinematic.dispose();
      this.cinematic = null;
    }
    this.ui.setIntroUI(false);

    this.world = new RunnerWorld(this.scene, { quality: this.quality });

    this.nurse.group.position.set(LANE_X[1], 0, 0);
    this.nurse.group.rotation.set(0, Math.PI, 0);
    this.nurse.play('run', { force: true });

    this.hemi.intensity = 1.1;
    this.sun.intensity = 1.2;
    this.scene.fog.near = this.quality.fogNear;
    this.scene.fog.far = this.quality.fogFar;

    this.camera.position.set(0, 3.2, 7.0);
    this.camLook.set(0, 1.3, -8);

    this.audio.setIntensity(0);
    this.audio.startMusic(0);

    this.state = 'running';
    this.ui.setHud(true);
    this.ui.setScore(0);
    this.ui.setCoins(0);
    this.ui.setQuestionsDone(0);
    this.ui.setTimer(ROUND.DURATION, ROUND.DURATION);
    this.ui.setSpeed(0, TIERS[0].label);

    // fade back in from the cinematic
    this._fadeIn = 1;
  }

  /* ---------------------------------------------------------------- */
  /* input                                                            */
  /* ---------------------------------------------------------------- */
  _onAction(a) {
    if (this.state === 'intro') {
      return; // the intro has its own Skip button
    }
    if (this.state !== 'running') return;

    if (a === 'left' && this.lane > 0) {
      this.lane -= 1;
      this.audio.lane();
    } else if (a === 'right' && this.lane < 2) {
      this.lane += 1;
      this.audio.lane();
    } else if (a === 'up') {
      if (!this.airborne && this.sliding <= 0) {
        this.vy = JUMP_V;
        this.airborne = true;
        this.nurse.play('jump', { force: true });
        this.audio.jump();
      }
    } else if (a === 'down') {
      if (this.airborne) {
        // fast-fall into a slide
        this.vy = Math.min(this.vy, -11);
        this.pendingSlide = true;
      } else if (this.sliding <= 0) {
        this.sliding = SLIDE_TIME;
        this.nurse.play('slide', { force: true });
        this.audio.slide();
      }
    }
  }

  /* ---------------------------------------------------------------- */
  /* gameplay update                                                  */
  /* ---------------------------------------------------------------- */
  _tierFor(t) {
    return Math.min(TIERS.length - 1, Math.floor(t / 20));
  }

  _updateRunning(dt) {
    // ---- round timer (keeps running during questions) ----
    this.roundTime += dt;
    const remaining = Math.max(0, ROUND.DURATION - this.roundTime);
    this.ui.setTimer(remaining, ROUND.DURATION);

    const tier = this._tierFor(this.roundTime);
    if (tier !== this._lastTier) {
      this._lastTier = tier;
      this.ui.setSpeed(tier, TIERS[tier].label);
      this.audio.setIntensity(tier / (TIERS.length - 1));
      if (tier > 0) this.ui.toast(`SPEED UP — ${TIERS[tier].label}`, 'gold');
    }

    // ---- countdown ticks in the last five seconds ----
    const sec = Math.ceil(remaining);
    if (sec <= 5 && sec !== this.lastTickSecond && sec > 0) {
      this.lastTickSecond = sec;
      this.audio.tick(true);
    }

    // ---- target speed ----
    let target = TIERS[tier].speed;
    if (this.slowUntil > 0) {
      this.slowUntil -= dt;
      target *= 0.55;
    }
    this.speed += (target - this.speed) * (1 - Math.exp(-2.6 * dt));
    this.world.setSpeed(this.speed);

    // ---- lane + vertical movement ----
    const wantX = LANE_X[this.lane];
    this.laneX += (wantX - this.laneX) * (1 - Math.exp(-LANE_LERP * dt));

    if (this.airborne) {
      this.vy += GRAVITY * dt;
      this.playerY += this.vy * dt;
      if (this.playerY <= 0) {
        this.playerY = 0;
        this.vy = 0;
        this.airborne = false;
        this.audio.land();
        if (this.pendingSlide) {
          this.pendingSlide = false;
          this.sliding = SLIDE_TIME;
          this.nurse.play('slide', { force: true });
          this.audio.slide();
        } else {
          this.nurse.play('run', { force: true });
        }
      }
    }

    if (this.sliding > 0) {
      this.sliding -= dt;
      if (this.sliding <= 0 && !this.airborne) this.nurse.play('run', { force: true });
    }

    if (this.stumble > 0) this.stumble = Math.max(0, this.stumble - dt * 1.6);

    // ---- place the nurse ----
    const g = this.nurse.group;
    g.position.set(this.laneX, this.playerY, 0);
    const drift = (wantX - this.laneX);
    g.rotation.y = Math.PI - drift * 0.22;
    g.rotation.z = drift * 0.1;

    this.nurse.update(dt, {
      speedK: (this.speed - TIERS[0].speed) / (TIERS[5].speed - TIERS[0].speed),
      verticalVel: this.vy,
      stumble: this.stumble,
    });

    // ---- world ----
    this.world.update(dt, tier);
    this.particles.update(dt, this.speed * dt);

    this._collisions();
    this._camera(dt);

    // ---- questions ----
    const nextAt = ROUND.QUESTION_TIMES[this.questionIndex];
    if (nextAt !== undefined && this.roundTime >= nextAt) this._openQuestion();

    // ---- finish gate ----
    // New obstacle rows stop spawning once the gate exists, so it is always
    // the last thing on the road. Its position is then held at a fixed time
    // from the nurse (see RunnerWorld.updateFinishGate), which guarantees
    // she crosses the line even if an obstacle slowed her down on the way.
    if (!this.world.finishSpawned && this.roundTime >= ROUND.FINISH_GATE_AT) {
      const nominal = TIERS[tier].speed;
      this.world.spawnFinishGate(Math.max(40, nominal * (ROUND.DURATION - this.roundTime)));
      this.finishing = true;
      this.ui.toast('FINISH LINE AHEAD', 'good');
      this.audio.finish();
    }
    if (this.world.finishSpawned) {
      const wasCrossed = this.world.finishCrossed;
      this.world.updateFinishGate(remaining, TIERS[tier].speed, dt);
      if (this.world.finishCrossed && !wasCrossed) {
        this.audio.finish();
        this.particles.ring(new THREE.Vector3(this.laneX, 1.0, 0),
          { count: 22, color: 'teal', radius: 2.2, life: 0.8 });
      }
    }

    // ---- end of round ----
    if (remaining <= 0) this._endRound();
  }

  _collisions() {
    const px = this.laneX;
    const py = this.playerY;

    // obstacles
    for (const o of this.world.obstacles) {
      if (o.hit) continue;
      const z = o.obj.position.z;
      const depth = (o.data.hd || 0.5) + 0.5;
      if (z < -depth || z > depth) continue;

      const laneMatch = o.lane === -1 || Math.abs(px - LANE_X[o.lane]) < (o.data.hw || 0.5) + 0.35;
      if (!laneMatch) continue;

      const clear = o.data.clear;
      if (clear === 'jump' && py >= o.data.top - 0.22) continue;
      if (clear === 'slide' && this.sliding > 0) continue;

      o.hit = true;
      this._hitObstacle(o);
    }

    // collectibles
    for (const c of this.world.collectibles) {
      if (c.taken) continue;
      const z = c.obj.position.z;
      if (z < -1.15 || z > 1.15) continue;
      if (Math.abs(px - LANE_X[c.lane]) > 1.0) continue;
      const dy = Math.abs((py + 0.95) - c.obj.position.y);
      if (dy > 1.15) continue;

      c.taken = true;
      this._collect(c);
    }
  }

  _hitObstacle(o) {
    this.score = Math.max(0, this.score - ROUND.HIT_PENALTY);
    this.ui.setScore(this.score);
    this.ui.toast(`-${ROUND.HIT_PENALTY}  ${o.data.label}`, 'bad');
    this.slowUntil = 1.15;
    this.stumble = 1;
    this.shake = 0.55;
    this.audio.hit();

    const p = o.obj.position.clone();
    p.y = Math.min(1.3, (o.data.top || 1) * 0.6);
    this.particles.burst(p, { count: 14, color: 'rose', speed: 3.4, life: 0.5, size: 0.9 });
  }

  _collect(c) {
    const d = c.data;
    this.score += d.score;
    this.coins += d.coins;
    this.ui.setScore(this.score);
    if (d.coins) this.ui.setCoins(this.coins);

    if (d.kind === 'coin') this.audio.coin();
    else if (d.kind === 'cash') this.audio.cash();
    else this.audio.pickup();

    if (d.kind !== 'coin') this.ui.toast(`+${d.score}  ${d.label}`, 'gold');

    this.particles.ring(c.obj.position, {
      count: d.kind === 'coin' ? 7 : 14,
      color: d.fx, radius: d.radius, life: 0.42,
      size: d.kind === 'coin' ? 0.55 : 0.8,
    });
  }

  _camera(dt) {
    const speedK = Math.min(1, Math.max(0, (this.speed - 13) / 15));
    // close enough that the scrubs, badge and Crocs read clearly, far
    // enough to see all three lanes and react to what is coming
    const back = 5.3 + speedK * 1.4;
    const high = 2.55 + speedK * 0.4;

    const want = new THREE.Vector3(this.laneX * 0.42, high + this.playerY * 0.28, back);
    const k = 1 - Math.exp(-6.5 * dt);
    this.camera.position.lerp(want, k);

    const look = new THREE.Vector3(this.laneX * 0.55, 1.3 + this.playerY * 0.45, -8 - speedK * 3);
    this.camLook.lerp(look, k);
    this.camera.lookAt(this.camLook);

    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 2.2);
      const s = this.shake * 0.22;
      this.camera.position.x += (Math.random() - 0.5) * s;
      this.camera.position.y += (Math.random() - 0.5) * s;
    }

    // keep the shadow frustum on the nurse
    this.sunTarget.position.set(this.laneX, 1, -4);
    this.sun.position.set(this.laneX - 7, 12, 6);
    this.sky.position.set(0, 0, 0);
  }

  /* ---------------------------------------------------------------- */
  /* questions                                                        */
  /* ---------------------------------------------------------------- */
  _openQuestion() {
    const q = this.questions[this.questionIndex];
    if (!q) return;

    this.activeQuestion = q;
    this.questionClock = ROUND.ANSWER_LIMIT;
    this.answerLocked = false;
    this.pendingSlide = false;
    this.state = 'question';

    this.nurse.play('idle');
    this.audio.duck(true);
    this.audio.questionIn();

    this.correctIndex = q.options.findIndex((o) => o.isCorrect);
    this.ui.showQuestion(q, this.questionIndex, (i) => this._answer(i));
    this.ui.setQuestionClock(this.questionClock, ROUND.ANSWER_LIMIT);
  }

  _updateQuestion(dt) {
    // the 120-second round timer keeps running while a question is open
    this.roundTime += dt;
    const remaining = Math.max(0, ROUND.DURATION - this.roundTime);
    this.ui.setTimer(remaining, ROUND.DURATION);

    // the nurse comes to a stop, the world stops with her
    this.speed += (0 - this.speed) * (1 - Math.exp(-5.5 * dt));
    this.world.setSpeed(this.speed);
    this.world.update(dt, this._lastTier || 0);
    this.particles.update(dt, this.speed * dt);
    this.nurse.update(dt, { verticalVel: 0 });

    // settle the nurse onto the ground and face the camera a little
    this.playerY += (0 - this.playerY) * (1 - Math.exp(-7 * dt));
    this.sliding = 0;
    this.airborne = false;
    this.nurse.group.position.set(this.laneX, this.playerY, 0);
    this.nurse.group.rotation.y += (Math.PI * 0.82 - this.nurse.group.rotation.y) * (1 - Math.exp(-3 * dt));

    // Camera eases round to a three-quarter view of the nurse, framed in
    // the upper part of the screen so the question card below never covers
    // her and the environment stays visible.
    // The look target sits well below her, which pushes the nurse into the
    // upper third of the frame - clear of the question card at the bottom.
    const want = new THREE.Vector3(this.laneX * 0.3 + 2.3, 1.9, 3.3);
    this.camera.position.lerp(want, 1 - Math.exp(-3.4 * dt));
    this.camLook.lerp(new THREE.Vector3(this.laneX * 0.4 - 0.2, 0.45, -0.3), 1 - Math.exp(-3.4 * dt));
    this.camera.lookAt(this.camLook);

    if (!this.answerLocked) {
      const before = Math.ceil(this.questionClock);
      this.questionClock -= dt;
      const after = Math.ceil(this.questionClock);
      if (after !== before && after >= 0) this.audio.tick(after <= 3);
      this.ui.setQuestionClock(this.questionClock, ROUND.ANSWER_LIMIT);

      if (this.questionClock <= 0) {
        this.answerLocked = true;
        this._answer(-1); // ran out of time
      }
    }
    // The round is never ended from here: the answer is always allowed to
    // resolve first, and _answer / _resumeFromQuestion decide the outcome.
  }

  _answer(index) {
    if (this.answerLocked && index >= 0) return;
    this.answerLocked = true;

    const q = this.activeQuestion;
    const right = index === this.correctIndex;

    this.ui.revealAnswer(q, index, this.correctIndex);

    if (right) {
      this.correctAnswers += 1;
      this.score += ROUND.CORRECT_POINTS;
      this.ui.setScore(this.score);
      this.ui.setQuestionsDone(this.correctAnswers);
      this.audio.correct();
      this.particles.burst(
        new THREE.Vector3(this.laneX, 1.6, 0),
        { count: 22, color: 'green', speed: 4.2, life: 0.8, size: 1 }
      );

      setTimeout(() => this._resumeFromQuestion(), 1500);
    } else {
      this.audio.wrong();
      this.nurse.play('lose', { force: true });
      setTimeout(() => {
        this.ui.hideQuestion();
        this._gameOver({
          reason: index < 0
            ? 'You ran out of time on the question.'
            : 'An incorrect answer ends the shift.',
          review: {
            id: q.id,
            type: q.type,
            text: q.text,
            chosen: index >= 0 ? q.options[index].text : null,
            correct: q.correctText,
            explanation: q.explanation,
          },
        });
      }, 2100);
    }
  }

  _resumeFromQuestion() {
    if (this.state !== 'question') return;
    this.ui.hideQuestion();
    this.audio.duck(false);
    this.activeQuestion = null;
    this.questionIndex += 1;
    this.nurse.play('run', { force: true });
    this.state = 'running';

    if (ROUND.DURATION - this.roundTime <= 0) this._endRound();
  }

  /* ---------------------------------------------------------------- */
  /* end states                                                       */
  /* ---------------------------------------------------------------- */
  _endRound() {
    if (this.state === 'over') return;

    // Win condition: both questions answered correctly AND the clock reached
    // zero (the finish line is crossed as the timer expires).
    if (this.correctAnswers >= 2) this._victory();
    else {
      this._gameOver({
        reason: `The shift ended with ${this.correctAnswers}/2 questions answered correctly.`,
        review: null,
      });
    }
  }

  _victory() {
    this.state = 'over';
    this.ui.hideQuestion();
    this.ui.flash();
    this.audio.stopMusic();
    this.audio.victory();
    this.nurse.play('victory', { force: true });

    if (this.world) this.world.clearNear(7);

    const isBest = Storage.submitScore(this.score, this.coins, true);
    const s = Storage.all();

    this.particles.burst(new THREE.Vector3(this.laneX, 1.4, 0), {
      count: 40, color: 'gold', speed: 6, life: 1.4, size: 1.2, gravity: -5,
    });
    this.particles.ring(new THREE.Vector3(this.laneX, 0.6, 0), { count: 24, color: 'teal', radius: 2, life: 1.2 });

    if (isBest) this.ui.toast('NEW BEST SCORE!', 'gold');

    setTimeout(() => {
      this.ui.setHud(false);
      this.ui.showVictory({ score: this.score, coins: this.coins, best: s.best });
    }, 1700);
  }

  _gameOver({ reason, review }) {
    if (this.state === 'over') return;
    this.state = 'over';
    this.audio.stopMusic();
    this.audio.gameOver();
    this.nurse.play('lose', { force: true });

    Storage.submitScore(this.score, this.coins, false);
    const s = Storage.all();

    setTimeout(() => {
      this.ui.setHud(false);
      this.ui.showGameOver({
        score: this.score,
        coins: this.coins,
        best: s.best,
        correct: this.correctAnswers,
        reason,
        review,
      });
    }, 900);
  }

  /** Tear down the round and return to the menu. */
  returnToMenu() {
    if (this.world) { this.world.dispose(); this.world = null; }
    if (this.cinematic) { this.cinematic.dispose(); this.cinematic = null; }
    this.particles.clear();
    this.audio.stopMusic();
    this.audio.stopSiren(0.2);
    this.ui.hideQuestion();
    this.ui.setHud(false);
    this.ui.setIntroUI(false);
    this.ui.setFade(0);
    this.scene.remove(this.nurse.group);
    this._resetRoundState();
    this.buildMenu();
    const s = Storage.all();
    this.ui.setMenuBest(s.best, s.wins, s.rounds);
    this.ui.show('menu');
  }

  /* ---------------------------------------------------------------- */
  /* main loop                                                        */
  /* ---------------------------------------------------------------- */
  start() {
    const loop = () => {
      this._frame = requestAnimationFrame(loop);
      let dt = this.clock.getDelta();

      // a tab switch or a slow frame must never teleport the player
      if (this._pausedByBlur) { this._pausedByBlur = false; dt = 0; }
      dt = Math.min(dt, 1 / 24);

      this.tick(dt);
      this.renderer.render(this.scene, this.camera);
    };
    loop();
  }

  tick(dt) {
    if (dt <= 0) return;

    switch (this.state) {
      case 'menu':
        if (this.menuRig) this._updateMenu(dt);
        break;

      case 'intro': {
        if (!this.cinematic) break;   // skipped outright; gameplay already starting
        const done = this.cinematic.update(dt);
        this.particles.update(dt, 0);
        if (done) this._beginGameplay();
        break;
      }

      case 'running':
        this._updateRunning(dt);
        break;

      case 'question':
        this._updateQuestion(dt);
        break;

      case 'over': {
        if (this.world) {
          this.speed += (0 - this.speed) * (1 - Math.exp(-3 * dt));
          this.world.setSpeed(this.speed);
          this.world.update(dt, 0);
        }
        this.nurse.update(dt, {});
        this.particles.update(dt, (this.speed || 0) * dt);
        // slow orbit around the result
        this._overT += dt;
        const a = this._overT * 0.22;
        this.camera.position.lerp(
          new THREE.Vector3(this.laneX + Math.sin(a) * 5.2, 2.6, Math.cos(a) * 5.2 + 1.2),
          1 - Math.exp(-2.2 * dt)
        );
        this.camera.lookAt(this.laneX, 1.1, 0);
        break;
      }

      default:
        break;
    }

    // fade back in after the cinematic hand-off
    if (this._fadeIn > 0) {
      this._fadeIn = Math.max(0, this._fadeIn - dt * 1.9);
      this.ui.setFade(this._fadeIn);
    }
  }
}
