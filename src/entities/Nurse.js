import * as THREE from 'three';
import { mergeByMaterial } from '../core/MeshUtils.js';

/**
 * NURSE RUSH - procedural nurse character.
 *
 * The character is built entirely from Three.js primitives and rigged with
 * a nested Object3D skeleton, so no external model file or licence is
 * involved. Animation is pose-based: each state writes target euler angles
 * for every joint, and the rig eases towards those targets each frame, which
 * gives free blending between states.
 *
 * States: idle, walk, run, jump, slide, lose, victory
 */

const C = {
  skin: 0xf3c69d,
  skinShade: 0xe0a97d,
  scrubTop: 0x1f9d8f,
  scrubTopDark: 0x17867a,
  scrubPant: 0x14756b,
  trim: 0xeefbf8,
  hair: 0x3a2318,
  hairHi: 0x4d3022,
  croc: 0xffc244,
  crocSole: 0xfff3d6,
  tube: 0x24323b,
  metal: 0xc9d6dd,
  eye: 0x1d2b33,
  white: 0xffffff,
  blush: 0xff9d9d,
  badge: 0xf8fbfc,
};

function mat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: opts.roughness ?? 0.62,
    metalness: opts.metalness ?? 0.04,
    ...opts,
  });
}

// deterministic pseudo random so the hair looks the same every load
let seed = 1337;
function rnd() {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
}

function j(parent, x = 0, y = 0, z = 0) {
  const o = new THREE.Object3D();
  o.position.set(x, y, z);
  parent.add(o);
  return o;
}

function addMesh(parent, geo, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = false;
  parent.add(m);
  return m;
}

const easeOut = (t) => 1 - Math.pow(1 - t, 3);

export class Nurse {
  constructor({ shadows = true } = {}) {
    this.group = new THREE.Group();
    this.shadows = shadows;

    this.state = 'idle';
    this.prevState = 'idle';
    this.stateTime = 0;
    this.cycle = 0;
    this.blend = 0;

    // hair secondary motion spring
    this.hairSpring = 0;
    this.hairVel = 0;

    this.materials = [];
    this._build();

    // live joint values are stored on the Object3D rotations directly;
    // this scratch object receives the computed target pose each frame
    this.target = {};
    for (const k of Object.keys(this.joints)) {
      this.target[k] = { x: 0, y: 0, z: 0 };
    }
    this.rootTarget = { y: 0, rx: 0, rz: 0, ry: 0 };
    this.rootCur = { y: 0, rx: 0, rz: 0, ry: 0 };
  }

  // -----------------------------------------------------------------
  // construction
  // -----------------------------------------------------------------
  _build() {
    const g = this.group;

    const mSkin = mat(C.skin, { roughness: 0.72 });
    const mSkinShade = mat(C.skinShade, { roughness: 0.75 });
    const mTop = mat(C.scrubTop, { roughness: 0.56 });
    const mTopDark = mat(C.scrubTopDark, { roughness: 0.56 });
    const mPant = mat(C.scrubPant, { roughness: 0.6 });
    const mTrim = mat(C.trim, { roughness: 0.5 });
    const mHair = mat(C.hair, { roughness: 0.45, metalness: 0.06 });
    const mHairHi = mat(C.hairHi, { roughness: 0.42, metalness: 0.06 });
    const mCroc = mat(C.croc, { roughness: 0.48 });
    const mCrocSole = mat(C.crocSole, { roughness: 0.6 });
    const mTube = mat(C.tube, { roughness: 0.4 });
    const mMetal = mat(C.metal, { roughness: 0.22, metalness: 0.75 });
    const mEye = mat(C.eye, { roughness: 0.25 });
    const mWhite = mat(C.white, { roughness: 0.4 });
    const mBlush = new THREE.MeshBasicMaterial({ color: C.blush, transparent: true, opacity: 0.4 });
    const mBadge = mat(C.badge, { roughness: 0.35 });

    this.materials.push(mSkin, mSkinShade, mTop, mTopDark, mPant, mTrim, mHair, mHairHi,
      mCroc, mCrocSole, mTube, mMetal, mEye, mWhite, mBadge);

    // ---------- rig ----------
    const root = j(g, 0, 0, 0);
    const hips = j(root, 0, 0.86, 0);
    const torso = j(hips, 0, 0, 0);
    const chest = j(torso, 0, 0.2, 0);
    const neck = j(chest, 0, 0.24, 0);
    const head = j(neck, 0, 0.1, 0);
    const hairPivot = j(head, 0, 0.04, 0);

    const shoulderL = j(chest, 0.205, 0.12, 0);
    const shoulderR = j(chest, -0.205, 0.12, 0);
    const elbowL = j(shoulderL, 0, -0.27, 0);
    const elbowR = j(shoulderR, 0, -0.27, 0);

    const hipL = j(hips, 0.105, -0.03, 0);
    const hipR = j(hips, -0.105, -0.03, 0);
    const kneeL = j(hipL, 0, -0.37, 0);
    const kneeR = j(hipR, 0, -0.37, 0);
    const ankleL = j(kneeL, 0, -0.37, 0);
    const ankleR = j(kneeR, 0, -0.37, 0);

    this.root = root;
    this.joints = {
      hips, torso, chest, neck, head, hairPivot,
      shoulderL, shoulderR, elbowL, elbowR,
      hipL, hipR, kneeL, kneeR, ankleL, ankleR,
    };

    // ---------- torso / scrub top ----------
    const torsoGeo = new THREE.CapsuleGeometry(0.175, 0.3, 4, 18);
    addMesh(torso, torsoGeo, mTop, 0, 0.2, 0).scale.set(1.08, 1, 0.82);

    // scrub top hem
    addMesh(torso, new THREE.CylinderGeometry(0.2, 0.215, 0.07, 20), mTopDark, 0, 0.03, 0)
      .scale.set(1.04, 1, 0.84);

    // V-neck trim
    const vneck = new THREE.Mesh(new THREE.TorusGeometry(0.115, 0.022, 8, 22, Math.PI * 1.35), mTrim);
    vneck.position.set(0, 0.42, 0.045);
    vneck.rotation.set(Math.PI / 2 - 0.25, 0, Math.PI * 0.82);
    vneck.scale.set(1, 1, 0.8);
    vneck.castShadow = true;
    torso.add(vneck);

    // chest pocket + ID badge
    addMesh(torso, new THREE.BoxGeometry(0.1, 0.085, 0.02), mTopDark, 0.085, 0.16, 0.145);
    const badge = addMesh(torso, new THREE.BoxGeometry(0.075, 0.1, 0.012), mBadge, -0.1, 0.21, 0.15);
    badge.rotation.z = 0.12;
    addMesh(badge, new THREE.BoxGeometry(0.05, 0.012, 0.004), mTop, 0, 0.022, 0.009);
    addMesh(badge, new THREE.BoxGeometry(0.038, 0.009, 0.004), mTube, -0.004, 0.002, 0.009);

    // ---------- stethoscope ----------
    const steth = j(chest, 0, 0.16, 0);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.019, 7, 26, Math.PI * 1.15), mTube);
    ring.rotation.set(Math.PI / 2 + 0.22, 0, Math.PI * 0.925);
    ring.scale.set(1, 1, 0.72);
    ring.castShadow = true;
    steth.add(ring);
    const sLeft = addMesh(steth, new THREE.CapsuleGeometry(0.018, 0.17, 3, 8), mTube, 0.12, -0.11, 0.1);
    sLeft.rotation.set(0.25, 0, 0.26);
    const sRight = addMesh(steth, new THREE.CapsuleGeometry(0.018, 0.14, 3, 8), mTube, -0.12, -0.13, 0.1);
    sRight.rotation.set(0.2, 0, -0.2);
    const bell = addMesh(steth, new THREE.CylinderGeometry(0.045, 0.05, 0.028, 16), mMetal, -0.15, -0.23, 0.11);
    bell.rotation.x = Math.PI / 2 - 0.3;

    // ---------- head ----------
    const headGeo = new THREE.SphereGeometry(0.235, 24, 20);
    const headMesh = addMesh(head, headGeo, mSkin, 0, 0.06, 0);
    headMesh.scale.set(1, 1.08, 0.95);
    this.headMesh = headMesh;

    // neck
    addMesh(neck, new THREE.CylinderGeometry(0.062, 0.072, 0.1, 12), mSkinShade, 0, 0.0, 0);

    // ears - kept just inside the side curls so they don't poke through
    addMesh(head, new THREE.SphereGeometry(0.038, 10, 8), mSkin, 0.198, 0.04, 0.012).scale.set(0.6, 1, 0.8);
    addMesh(head, new THREE.SphereGeometry(0.038, 10, 8), mSkin, -0.198, 0.04, 0.012).scale.set(0.6, 1, 0.8);

    // eyes
    const face = j(head, 0, 0, 0);
    this.face = face;
    for (const sx of [1, -1]) {
      const sclera = addMesh(face, new THREE.SphereGeometry(0.052, 14, 12), mWhite, sx * 0.084, 0.072, 0.2);
      sclera.scale.set(1, 1.12, 0.6);
      const pupil = addMesh(face, new THREE.SphereGeometry(0.03, 12, 10), mEye, sx * 0.09, 0.068, 0.236);
      pupil.scale.set(1, 1.08, 0.6);
      addMesh(face, new THREE.SphereGeometry(0.011, 8, 6), mWhite, sx * 0.1, 0.092, 0.252);
      // brows
      const brow = addMesh(face, new THREE.BoxGeometry(0.072, 0.016, 0.016), mHair, sx * 0.088, 0.142, 0.206);
      brow.rotation.z = sx * -0.12;
      // blush
      const b = new THREE.Mesh(new THREE.CircleGeometry(0.044, 14), mBlush);
      b.position.set(sx * 0.135, -0.012, 0.196);
      b.rotation.y = sx * 0.4;
      face.add(b);
    }

    // smile
    const smile = new THREE.Mesh(new THREE.TorusGeometry(0.058, 0.0145, 7, 18, Math.PI * 0.86), mTube);
    smile.position.set(0, -0.015, 0.212);
    smile.rotation.set(0, 0, Math.PI + Math.PI * 0.07);
    face.add(smile);
    this.smile = smile;

    // ---------- hair: long, voluminous, curly ----------
    const hair = new THREE.Group();
    hairPivot.add(hair);
    this.hair = hair;

    const curl = (x, y, z, r, m) => {
      const c = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), m);
      c.position.set(x, y, z);
      c.scale.set(1, 0.9 + rnd() * 0.3, 1);
      c.castShadow = true;
      hair.add(c);
      return c;
    };

    // Crown volume. The silhouette is deliberately kept narrower than the
    // shoulders and short enough at the back that the scrubs, badge and
    // Crocs all still read from the gameplay camera, which sits behind her.
    for (let i = 0; i < 32; i++) {
      const a = rnd() * Math.PI * 2;
      const p = 0.18 + rnd() * 0.72;              // polar bias to top/back
      const r = 0.235 + rnd() * 0.03;
      const y = 0.11 + Math.cos(p * Math.PI * 0.62) * 0.2;
      const spread = Math.sin(p * Math.PI * 0.62) * r;
      const x = Math.cos(a) * spread;
      let z = Math.sin(a) * spread;
      if (z > 0.04) z = 0.04 - (z - 0.04) * 1.5;   // keep the face clear
      curl(x, y, z - 0.015, 0.06 + rnd() * 0.042, rnd() > 0.68 ? mHairHi : mHair);
    }

    // Back mass, ending at the shoulder blades and kept narrower than the
    // shoulders so the teal scrubs frame it from the gameplay camera.
    for (let i = 0; i < 18; i++) {
      const t = i / 17;
      const a = (rnd() - 0.5) * 1.8;
      const rad = (0.125 - t * 0.058) * (0.7 + rnd() * 0.45);
      curl(
        Math.sin(a) * rad,
        -0.03 - t * 0.27 + (rnd() - 0.5) * 0.04,
        -0.155 - Math.cos(a) * rad * 0.38 + (rnd() - 0.5) * 0.035,
        0.055 + rnd() * 0.032,
        rnd() > 0.72 ? mHairHi : mHair
      );
    }

    // two side bunches framing the face, ending at the shoulders
    for (const sx of [1, -1]) {
      for (let i = 0; i < 9; i++) {
        const t = i / 8;
        curl(
          sx * (0.202 + Math.sin(t * 6 + sx) * 0.032 - t * 0.02),
          -0.02 - t * 0.33,
          0.0 + Math.sin(t * 5.2) * 0.045,
          0.058 + rnd() * 0.03,
          rnd() > 0.75 ? mHairHi : mHair
        );
      }
    }

    // The hair is ~90 small spheres. Merged by material it costs two draw
    // calls instead of ninety, and it still animates as one group.
    mergeByMaterial(hair);

    // ---------- arms ----------
    const buildArm = (shoulder, elbow, side) => {
      const upper = addMesh(shoulder, new THREE.CapsuleGeometry(0.058, 0.17, 4, 12), mTop, 0, -0.135, 0);
      // short sleeve cuff
      addMesh(shoulder, new THREE.CylinderGeometry(0.068, 0.062, 0.05, 14), mTopDark, 0, -0.175, 0);
      // shoulder cap
      addMesh(shoulder, new THREE.SphereGeometry(0.072, 14, 12), mTop, 0, 0, 0);

      const fore = addMesh(elbow, new THREE.CapsuleGeometry(0.05, 0.16, 4, 12), mSkin, 0, -0.125, 0);
      const hand = addMesh(elbow, new THREE.SphereGeometry(0.063, 12, 10), mSkin, 0, -0.245, 0);
      hand.scale.set(0.82, 1.05, 0.68);
      return { upper, fore, hand };
    };
    this.armL = buildArm(shoulderL, elbowL, 1);
    this.armR = buildArm(shoulderR, elbowR, -1);

    // ---------- legs + Crocs ----------
    const buildLeg = (hip, knee, ankle) => {
      addMesh(hip, new THREE.CapsuleGeometry(0.082, 0.24, 4, 14), mPant, 0, -0.175, 0);
      addMesh(knee, new THREE.CapsuleGeometry(0.07, 0.22, 4, 14), mPant, 0, -0.17, 0);
      // scrub trouser cuff
      addMesh(knee, new THREE.CylinderGeometry(0.082, 0.075, 0.055, 14), mPant, 0, -0.315, 0);
      // ankle / sock
      addMesh(ankle, new THREE.CylinderGeometry(0.052, 0.05, 0.06, 12), mWhite, 0, 0.0, 0);

      // ----- Croc -----
      const croc = j(ankle, 0, -0.045, 0.012);
      // chunky rounded body
      const body = addMesh(croc, new THREE.SphereGeometry(0.098, 16, 12), mCroc, 0, 0.012, 0.035);
      body.scale.set(0.82, 0.62, 1.42);
      // toe cap
      const toe = addMesh(croc, new THREE.SphereGeometry(0.082, 14, 12), mCroc, 0, 0.012, 0.115);
      toe.scale.set(0.95, 0.72, 0.95);
      // sole
      const sole = addMesh(croc, new THREE.SphereGeometry(0.1, 16, 10), mCrocSole, 0, -0.028, 0.035);
      sole.scale.set(0.84, 0.3, 1.44);
      // heel strap
      const strap = new THREE.Mesh(new THREE.TorusGeometry(0.062, 0.013, 6, 14, Math.PI), mCroc);
      strap.position.set(0, 0.035, -0.055);
      strap.rotation.set(0.5, Math.PI / 2, 0);
      strap.castShadow = true;
      croc.add(strap);
      // the signature holes
      for (let i = 0; i < 5; i++) {
        const hx = ((i % 3) - 1) * 0.034;
        const hz = 0.05 + Math.floor(i / 3) * 0.055;
        const hole = addMesh(croc, new THREE.CylinderGeometry(0.0115, 0.0115, 0.02, 8), mTube, hx, 0.048, hz);
        hole.rotation.x = 0.1;
      }
      return croc;
    };
    this.legL = buildLeg(hipL, kneeL, ankleL);
    this.legR = buildLeg(hipR, kneeR, ankleR);

    g.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = this.shadows;
        o.frustumCulled = false;
      }
    });
  }

  // -----------------------------------------------------------------
  // animation
  // -----------------------------------------------------------------
  play(state, { force = false } = {}) {
    if (this.state === state && !force) return;
    this.prevState = this.state;
    this.state = state;
    this.stateTime = 0;
  }

  /** zero the scratch pose */
  _reset() {
    for (const k in this.target) {
      const t = this.target[k];
      t.x = 0; t.y = 0; t.z = 0;
    }
    this.rootTarget.y = 0;
    this.rootTarget.rx = 0;
    this.rootTarget.rz = 0;
    this.rootTarget.ry = 0;
  }

  _poseIdle(t) {
    const T = this.target;
    const br = Math.sin(t * 2.0);
    this.rootTarget.y = br * 0.012;
    T.chest.x = br * 0.035 - 0.02;
    T.torso.z = Math.sin(t * 0.9) * 0.025;
    T.head.y = Math.sin(t * 0.7) * 0.16;
    T.head.x = Math.sin(t * 1.7) * 0.03 + 0.02;

    T.shoulderL.z = -0.17 + br * 0.03;
    T.shoulderR.z = 0.17 - br * 0.03;
    T.shoulderL.x = -0.1 + Math.sin(t * 1.9) * 0.06;
    T.shoulderR.x = -0.1 + Math.sin(t * 1.9 + 0.5) * 0.06;
    T.elbowL.x = -0.3;
    T.elbowR.x = -0.3;

    T.hipL.x = 0.04;
    T.hipR.x = -0.02;
    T.kneeL.x = 0.06;
    T.kneeR.x = 0.1;
    T.ankleL.x = -0.04;
    T.ankleR.x = -0.06;
  }

  _poseStride(p, amp, armAmp, elbowBend, lean, bob) {
    const T = this.target;
    const s = Math.sin(p);
    const c = Math.cos(p);

    this.rootTarget.y = Math.abs(Math.sin(p)) * bob - bob * 0.35;
    T.torso.x = lean;
    T.chest.y = -s * 0.1;
    T.torso.y = s * 0.09;
    T.head.x = -lean * 0.55;
    T.head.y = s * 0.05;

    // legs
    T.hipL.x = s * amp;
    T.hipR.x = -s * amp;
    T.kneeL.x = Math.max(0, -s) * amp * 1.5 + 0.1;
    T.kneeR.x = Math.max(0, s) * amp * 1.5 + 0.1;
    T.ankleL.x = -c * 0.22;
    T.ankleR.x = c * 0.22;

    // arms swing opposite
    T.shoulderL.x = -s * armAmp;
    T.shoulderR.x = s * armAmp;
    T.shoulderL.z = -0.13;
    T.shoulderR.z = 0.13;
    T.elbowL.x = -elbowBend - Math.max(0, -s) * 0.4;
    T.elbowR.x = -elbowBend - Math.max(0, s) * 0.4;
  }

  _poseWalk(t) {
    this._poseStride(t * 5.6, 0.52, 0.42, 0.35, -0.04, 0.028);
  }

  _poseRun(t, speedK = 1) {
    this._poseStride(t * (9.4 + speedK * 2.6), 0.92, 1.0, 1.25, -0.2 - speedK * 0.06, 0.055);
    const T = this.target;
    T.shoulderL.z = -0.22;
    T.shoulderR.z = 0.22;
  }

  _poseJump(t) {
    const T = this.target;
    const p = Math.min(1, t / 0.32);
    const e = easeOut(p);
    // tuck on the way up, reach down on the way out
    T.torso.x = -0.14;
    T.chest.x = -0.1;
    T.head.x = 0.1;

    T.hipL.x = -1.05 * (1 - e * 0.45);
    T.hipR.x = -0.7 * (1 - e * 0.6);
    T.kneeL.x = 1.35 * (1 - e * 0.35);
    T.kneeR.x = 0.95 * (1 - e * 0.5);
    T.ankleL.x = 0.3;
    T.ankleR.x = 0.25;

    T.shoulderL.x = -2.3 * e - 0.4;
    T.shoulderR.x = -2.1 * e - 0.4;
    T.shoulderL.z = -0.5;
    T.shoulderR.z = 0.5;
    T.elbowL.x = -0.5;
    T.elbowR.x = -0.55;
  }

  _poseSlide(t) {
    const T = this.target;
    const e = easeOut(Math.min(1, t / 0.18));
    this.rootTarget.rx = -1.05 * e;
    this.rootTarget.y = 0.46 * e;

    T.torso.x = 0.3 * e;
    T.chest.x = 0.2 * e;
    T.head.x = -0.55 * e;

    T.hipL.x = 0.62 * e;
    T.hipR.x = 1.25 * e;
    T.kneeL.x = 0.18 * e;
    T.kneeR.x = 1.5 * e;
    T.ankleL.x = -0.35 * e;
    T.ankleR.x = -0.2 * e;

    T.shoulderL.x = 1.5 * e;
    T.shoulderR.x = 1.35 * e;
    T.shoulderL.z = -0.55 * e;
    T.shoulderR.z = 0.55 * e;
    T.elbowL.x = -0.9 * e;
    T.elbowR.x = -1.0 * e;
  }

  _poseLose(t) {
    const T = this.target;
    const p = Math.min(1, t / 0.75);
    const e = easeOut(p);
    const wob = Math.sin(t * 9) * (1 - p) * 0.4;

    // trips, falls back and lands sitting
    this.rootTarget.rx = -1.18 * e;
    this.rootTarget.rz = 0.14 * e;
    this.rootTarget.y = 0.34 * e;

    T.torso.x = 0.42 * e;
    T.chest.x = 0.2 * e;
    T.head.x = -0.72 * e;
    T.head.z = 0.2 * e + wob * 0.3;

    T.hipL.x = 1.0 * e;
    T.hipR.x = 1.35 * e;
    T.kneeL.x = 1.1 * e;
    T.kneeR.x = 0.75 * e;
    T.ankleL.x = -0.2;
    T.ankleR.x = -0.2;

    T.shoulderL.x = -2.1 * e + wob;
    T.shoulderR.x = -1.95 * e - wob;
    T.shoulderL.z = -0.85 * e;
    T.shoulderR.z = 0.85 * e;
    T.elbowL.x = -0.7 * e;
    T.elbowR.x = -0.8 * e;
  }

  _poseVictory(t) {
    const T = this.target;
    const hop = Math.abs(Math.sin(t * 5.2));
    const sway = Math.sin(t * 5.2);

    this.rootTarget.y = hop * 0.17;
    this.rootTarget.ry = Math.sin(t * 1.6) * 0.18;

    T.torso.x = -0.08;
    T.chest.x = -0.1;
    T.head.x = -0.16 + hop * 0.06;
    T.head.z = sway * 0.1;

    // arms up in a V, waving
    T.shoulderL.x = -2.55 + Math.sin(t * 7) * 0.2;
    T.shoulderR.x = -2.55 + Math.sin(t * 7 + 1.1) * 0.2;
    T.shoulderL.z = -0.75;
    T.shoulderR.z = 0.75;
    T.elbowL.x = -0.3 + Math.sin(t * 7) * 0.25;
    T.elbowR.x = -0.3 + Math.sin(t * 7 + 1.1) * 0.25;

    T.hipL.x = -0.1 - hop * 0.45;
    T.hipR.x = -0.1 - hop * 0.2;
    T.kneeL.x = 0.25 + hop * 0.75;
    T.kneeR.x = 0.25 + hop * 0.35;
    T.ankleL.x = -0.2 + hop * 0.3;
    T.ankleR.x = -0.2 + hop * 0.2;
  }

  /**
   * @param {number} dt seconds
   * @param {object} info { speedK: 0..1, verticalVel: number, stumble: number }
   */
  update(dt, info = {}) {
    this.stateTime += dt;
    const t = this.stateTime;

    this._reset();

    switch (this.state) {
      case 'walk': this._poseWalk(t); break;
      case 'run': this._poseRun(t, info.speedK ?? 0); break;
      case 'jump': this._poseJump(t); break;
      case 'slide': this._poseSlide(t); break;
      case 'lose': this._poseLose(t); break;
      case 'victory': this._poseVictory(t); break;
      default: this._poseIdle(t); break;
    }

    // stumble shake after an obstacle hit
    if (info.stumble) {
      const s = info.stumble;
      this.target.torso.z += Math.sin(t * 34) * 0.18 * s;
      this.target.head.z += Math.sin(t * 29) * 0.22 * s;
      this.rootTarget.rz += Math.sin(t * 24) * 0.09 * s;
    }

    // ease every joint towards the target pose - this is what blends states
    const k = 1 - Math.exp(-15 * dt);
    for (const name in this.joints) {
      const o = this.joints[name];
      const T = this.target[name];
      o.rotation.x += (T.x - o.rotation.x) * k;
      o.rotation.y += (T.y - o.rotation.y) * k;
      o.rotation.z += (T.z - o.rotation.z) * k;
    }

    const rk = 1 - Math.exp(-13 * dt);
    this.rootCur.y += (this.rootTarget.y - this.rootCur.y) * rk;
    this.rootCur.rx += (this.rootTarget.rx - this.rootCur.rx) * rk;
    this.rootCur.rz += (this.rootTarget.rz - this.rootCur.rz) * rk;
    this.rootCur.ry += (this.rootTarget.ry - this.rootCur.ry) * rk;
    this.root.position.y = this.rootCur.y;
    this.root.rotation.set(this.rootCur.rx, this.rootCur.ry, this.rootCur.rz);

    // hair secondary motion: springy lag against vertical movement
    const drive = (info.verticalVel ?? 0) * -0.035 + (this.rootTarget.y - this.rootCur.y) * 2.0;
    this.hairVel += (drive - this.hairSpring) * 46 * dt;
    this.hairVel *= Math.exp(-7.5 * dt);
    this.hairSpring += this.hairVel * dt;
    this.hairSpring = Math.max(-0.5, Math.min(0.5, this.hairSpring));
    this.hair.rotation.x = this.hairSpring * 0.75;
    this.hair.position.z = -this.hairSpring * 0.035;
    this.hair.scale.setScalar(1 + Math.abs(this.hairSpring) * 0.07);

    // expression
    const wantSmile = this.state === 'victory' ? 1.5 : this.state === 'lose' ? -1 : 1;
    const sx = this.smile.scale.x;
    const targetY = wantSmile < 0 ? -1 : 1;
    const targetScale = this.state === 'victory' ? 1.3 : 1;
    this.smile.scale.x += (targetScale - sx) * (1 - Math.exp(-8 * dt));
    this.smile.scale.y += (targetY * targetScale - this.smile.scale.y) * (1 - Math.exp(-8 * dt));
  }

  setPosition(x, y, z) { this.group.position.set(x, y, z); }

  dispose() {
    this.group.traverse((o) => {
      if (o.isMesh) {
        o.geometry?.dispose?.();
      }
    });
    this.materials.forEach((m) => m.dispose?.());
  }
}
