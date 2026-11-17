import * as THREE from 'three';
import { Corridor, DOOR_Z } from '../world/Corridor.js';

/**
 * The cinematic hospital intro.
 *
 * A short scripted sequence: the nurse walks a corridor, an emergency alarm
 * fires, red lights flash, she reacts and runs, the exit doors open and the
 * ambulance bay outside is revealed. It then hands control to gameplay.
 *
 * The intro runs on its own clock and never touches the 120-second round
 * timer. It can be skipped at any point.
 */

const START_Z = 4;

// phase boundaries in seconds
const T_WALK_END = 3.3;
const T_ALARM = 3.3;
const T_REACT_END = 5.4;
const T_RUN = 5.4;
const T_OUTSIDE_HOLD = 2.0;   // seconds spent outside before the handoff
const T_FADE = 0.75;

export class Cinematic {
  constructor({ scene, camera, nurse, audio, ui, quality }) {
    this.scene = scene;
    this.camera = camera;
    this.nurse = nurse;
    this.audio = audio;
    this.ui = ui;

    this.corridor = new Corridor(scene, { quality });

    this.t = 0;
    this.z = START_Z;
    this.speed = 0;
    this.alarm = 0;
    this.doorT = 0;
    this.outsideT = 0;
    this.phase = 'walk';
    this.done = false;
    this.fading = false;
    this.fadeT = 0;
    this.captionIndex = -1;

    // lighting for the interior
    // near-neutral sky/ground so the corridor does not tint the character
    this.hemi = new THREE.HemisphereLight(0xfffaf4, 0x3f4347, 1.75);
    this.dir = new THREE.DirectionalLight(0xffffff, 1.05);
    this.dir.position.set(3, 7, 4);
    scene.add(this.hemi, this.dir);

    this.nurse.group.position.set(0, 0, this.z);
    this.nurse.group.rotation.y = Math.PI;   // facing -Z
    this.nurse.play('walk');

    this.camPos = new THREE.Vector3(2.6, 1.6, this.z + 4.2);
    this.camTarget = new THREE.Vector3(0, 1.2, this.z);
    this.camera.position.copy(this.camPos);

    this.ui.setCineBars(true);
    this.captions = [
      [0.4, 'King Salman Medical City — night shift'],
      [1.9, 'Another quiet round on the ward…'],
      [T_ALARM + 0.1, ''],
      [T_RUN + 0.3, 'Every second counts'],
      [T_RUN + 3.6, 'Emergency department — this way'],
    ];
  }

  skip() {
    if (this.done) return;
    this.fading = true;
    this.fadeT = T_FADE; // jump straight to the handoff
    this.ui.showAlert(false);
    this.ui.setIntroCaption('');
    this.audio.stopSiren(0.2);
  }

  _captions() {
    for (let i = this.captions.length - 1; i >= 0; i--) {
      if (this.t >= this.captions[i][0]) {
        if (this.captionIndex !== i) {
          this.captionIndex = i;
          this.ui.setIntroCaption(this.captions[i][1]);
        }
        return;
      }
    }
  }

  update(dt) {
    if (this.done) return true;
    this.t += dt;
    this._captions();

    // ---------------- phases ----------------
    if (this.t < T_WALK_END) {
      this.phase = 'walk';
      this.speed += (1.75 - this.speed) * (1 - Math.exp(-3 * dt));
      this.nurse.play('walk');
    } else if (this.t < T_REACT_END) {
      if (this.phase !== 'react') {
        this.phase = 'react';
        this.audio.startSiren();
        this.ui.showAlert(true);
        this.nurse.play('idle');
      }
      // she stops, looks up at the alarm
      this.speed += (0.12 - this.speed) * (1 - Math.exp(-6 * dt));
      this.alarm += (1 - this.alarm) * (1 - Math.exp(-6 * dt));
    } else {
      if (this.phase !== 'run') {
        this.phase = 'run';
        this.ui.showAlert(false);
        this.nurse.play('run');
      }
      this.speed += (12.5 - this.speed) * (1 - Math.exp(-1.7 * dt));
      this.alarm = 1;
    }

    // ---------------- movement ----------------
    this.z -= this.speed * dt;
    this.nurse.group.position.z = this.z;
    this.nurse.update(dt, {
      speedK: Math.min(1, this.speed / 13),
      verticalVel: 0,
    });

    // slight weave so the run does not look rail-locked
    if (this.phase === 'run') {
      this.nurse.group.position.x = Math.sin(this.t * 1.6) * 0.42;
      this.nurse.group.rotation.y = Math.PI + Math.cos(this.t * 1.6) * 0.1;
    }

    // ---------------- doors ----------------
    if (this.z < DOOR_Z + 20 && this.doorT === 0) {
      this.doorT = 0.0001;
      this.audio.doors();
    }
    if (this.doorT > 0) {
      this.doorT = Math.min(1, this.doorT + dt / 1.15);
      this.corridor.setDoors(this.doorT);
    }

    this.corridor.setAlarm(this.alarm);
    this.corridor.update(dt, this.z);

    // Interior lighting dims and reddens as the alarm takes hold.
    // The base tint is near-neutral on purpose: a cool clinical white here
    // shifted the mauve scrubs towards blue-violet and left the skin
    // looking sallow, so the character read differently in the corridor
    // than on the menu and the road.
    this.hemi.intensity = 1.75 - this.alarm * 0.8;
    this.hemi.color.setRGB(
      1.0,
      0.97 - this.alarm * 0.42,
      0.94 - this.alarm * 0.50
    );
    this.dir.intensity = 1.05 - this.alarm * 0.4;

    // ---------------- camera ----------------
    this._camera(dt);

    // ---------------- outside + handoff ----------------
    if (this.z < DOOR_Z - 6) {
      this.outsideT += dt;
      // brighten up outside
      this.hemi.intensity += (1.9 - this.hemi.intensity) * (1 - Math.exp(-1.6 * dt));
      this.dir.intensity += (1.4 - this.dir.intensity) * (1 - Math.exp(-1.6 * dt));
      if (this.outsideT > T_OUTSIDE_HOLD && !this.fading) {
        this.fading = true;
        this.ui.setIntroCaption('');
        this.audio.stopSiren(0.6);
      }
    }

    if (this.fading) {
      this.fadeT += dt;
      this.ui.setCineBars(false);
      const k = Math.min(1, this.fadeT / T_FADE);
      this.ui.setFade(k);
      if (k >= 1) {
        this.done = true;
        return true;
      }
    }

    return false;
  }

  _camera(dt) {
    const z = this.z;
    const t = this.t;

    // The camera orbits the nurse: theta = 0 is directly behind her,
    // theta = PI is face-on. The intro opens face-on so the character is
    // introduced properly, then sweeps round behind her as she takes off.
    const orbit = (theta, radius, height, lookY) => {
      this.camPos.set(
        Math.sin(theta) * radius,
        height,
        z + Math.cos(theta) * radius
      );
      this.camTarget.set(this.nurse.group.position.x * 0.5, lookY, z - 0.3);
    };

    if (this.phase === 'walk') {
      // three-quarter front tracking shot
      orbit(2.42 + Math.sin(t * 0.45) * 0.12, 4.1, 1.62, 1.2);
    } else if (this.phase === 'react') {
      // push in on her face as the alarm hits
      const k = Math.min(1, (t - T_ALARM) / 1.5);
      orbit(2.42 + k * 0.4, 4.1 - k * 1.5, 1.62 - k * 0.1, 1.2 + k * 0.28);
    } else {
      const since = t - T_RUN;
      if (z > DOOR_Z - 4) {
        // sweep from in front of her round to behind as she sprints off
        const k = Math.min(1, since / 1.35);
        const e = 1 - Math.pow(1 - k, 3);
        orbit(
          THREE.MathUtils.lerp(2.82, 0, e) + Math.sin(t * 1.5) * 0.08 * e,
          THREE.MathUtils.lerp(2.6, 5.6, e),
          THREE.MathUtils.lerp(1.52, 2.15, e),
          THREE.MathUtils.lerp(1.48, 1.3, e)
        );
        if (e > 0.96) this.camTarget.set(this.nurse.group.position.x * 0.6, 1.3, z - 6);
      } else {
        // outside: arc round to reveal the ambulance bay
        const k = Math.min(1, this.outsideT / T_OUTSIDE_HOLD);
        const ang = k * 1.0;
        this.camPos.set(
          Math.sin(ang) * 7.5,
          2.2 + k * 1.9,
          z + Math.cos(ang) * 7.0
        );
        this.camTarget.set(0, 1.5 + k * 0.4, z - 5 + k * 3);
      }
    }

    // ease towards the scripted framing so every cut is a move, not a jump
    const k = 1 - Math.exp(-7 * dt);
    this.camera.position.lerp(this.camPos, k);
    this._lookTarget = this._lookTarget || this.camTarget.clone();
    this._lookTarget.lerp(this.camTarget, k);
    this.camera.lookAt(this._lookTarget);

    // camera shake while the alarm is going
    if (this.alarm > 0.05) {
      const s = this.alarm * (this.phase === 'run' ? 0.03 : 0.012);
      this.camera.position.x += (Math.random() - 0.5) * s;
      this.camera.position.y += (Math.random() - 0.5) * s;
    }
  }

  dispose() {
    this.corridor.dispose();
    this.scene.remove(this.hemi, this.dir);
    this.hemi.dispose?.();
    this.dir.dispose?.();
    this.ui.setCineBars(false);
    this.ui.showAlert(false);
    this.ui.setIntroCaption('');
  }
}
