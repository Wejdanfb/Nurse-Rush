import * as THREE from 'three';
import {
  hospitalFloorTexture, hospitalWallTexture, ceilingTexture,
  asphaltTexture, hazardTexture, facadeTexture, signTexture,
  crossTexture, glowTexture,
} from './Textures.js';
import { acquireObstacle, releaseObstacle } from '../entities/Obstacles.js';

/**
 * The hospital corridor used by the cinematic intro, plus the ambulance bay
 * revealed when the exit doors open.
 *
 * Geometry runs from z = +8 (behind the nurse) to z = DOOR_Z (the exit),
 * and the exterior continues past it. The nurse travels towards -Z.
 */

export const DOOR_Z = -62;
const START_Z = 8;
const LEN = START_Z - DOOR_Z;       // corridor length
const HALF_W = 3.4;
const CEIL_H = 3.3;

export class Corridor {
  constructor(scene, { quality = 'high' } = {}) {
    this.scene = scene;
    this.quality = quality;
    this.group = new THREE.Group();
    this.scene.add(this.group);

    this.alarm = 0;        // 0..1 alarm intensity
    this.doorOpen = 0;     // 0..1
    this.time = 0;

    this.strobeMat = new THREE.MeshStandardMaterial({
      color: 0xff4d6d, emissive: 0xff1026, emissiveIntensity: 0.2, roughness: 0.3,
    });
    this.panelMat = new THREE.MeshStandardMaterial({
      color: 0xffffff, emissive: 0xfff6e2, emissiveIntensity: 0.85, roughness: 0.6,
    });

    this._build();
  }

  _build() {
    const g = this.group;

    const floorMat = new THREE.MeshStandardMaterial({
      map: hospitalFloorTexture(), roughness: 0.3, metalness: 0.06, color: 0xffffff,
    });
    const wallMat = new THREE.MeshStandardMaterial({ map: hospitalWallTexture(), roughness: 0.75 });
    const ceilMat = new THREE.MeshStandardMaterial({ map: ceilingTexture(), roughness: 0.9 });
    const trimMat = new THREE.MeshStandardMaterial({ color: 0x17867a, roughness: 0.5 });
    const chromeMat = new THREE.MeshStandardMaterial({ color: 0xcdd9e0, roughness: 0.25, metalness: 0.7 });
    const doorMat = new THREE.MeshStandardMaterial({ color: 0xeaf3f6, roughness: 0.4 });
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0xa9dbe8, roughness: 0.1, metalness: 0.3, transparent: true, opacity: 0.6,
    });
    this.mats = [floorMat, wallMat, ceilMat, trimMat, chromeMat, doorMat, glassMat, this.strobeMat, this.panelMat];

    // ---------- floor ----------
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(HALF_W * 2, LEN), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0, START_Z - LEN / 2);
    floor.receiveShadow = true;
    g.add(floor);

    // teal guide line down the middle of the corridor
    const guide = new THREE.Mesh(
      new THREE.PlaneGeometry(0.34, LEN),
      new THREE.MeshStandardMaterial({ color: 0x19b8a6, roughness: 0.4 })
    );
    guide.rotation.x = -Math.PI / 2;
    guide.position.set(0, 0.012, START_Z - LEN / 2);
    g.add(guide);

    // ---------- walls ----------
    for (const sx of [1, -1]) {
      const wall = new THREE.Mesh(new THREE.PlaneGeometry(LEN, CEIL_H), wallMat);
      wall.rotation.y = sx > 0 ? -Math.PI / 2 : Math.PI / 2;
      wall.position.set(sx * HALF_W, CEIL_H / 2, START_Z - LEN / 2);
      wall.receiveShadow = true;
      g.add(wall);

      // handrail
      const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, LEN, 8), chromeMat);
      rail.rotation.x = Math.PI / 2;
      rail.position.set(sx * (HALF_W - 0.1), 0.92, START_Z - LEN / 2);
      g.add(rail);

      // skirting
      const skirt = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, LEN), trimMat);
      skirt.position.set(sx * (HALF_W - 0.04), 0.06, START_Z - LEN / 2);
      g.add(skirt);
    }

    // ---------- ceiling + light panels ----------
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(HALF_W * 2, LEN), ceilMat);
    ceil.rotation.x = Math.PI / 2;
    ceil.position.set(0, CEIL_H, START_Z - LEN / 2);
    g.add(ceil);

    this.panels = [];
    const panelGeo = new THREE.BoxGeometry(1.5, 0.07, 0.75);
    for (let z = START_Z - 3; z > DOOR_Z + 1; z -= 6) {
      const p = new THREE.Mesh(panelGeo, this.panelMat);
      p.position.set(0, CEIL_H - 0.05, z);
      g.add(p);
      this.panels.push(p);

      // soft glow decal on the floor beneath each panel
      const glow = new THREE.Mesh(
        new THREE.PlaneGeometry(3.2, 3.2),
        new THREE.MeshBasicMaterial({
          map: glowTexture('255,245,214'), transparent: true,
          opacity: 0.18, depthWrite: false, blending: THREE.AdditiveBlending,
        })
      );
      glow.rotation.x = -Math.PI / 2;
      glow.position.set(0, 0.02, z);
      g.add(glow);
    }

    // ---------- emergency strobes ----------
    this.strobes = [];
    const domeGeo = new THREE.SphereGeometry(0.15, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    for (let z = START_Z - 6; z > DOOR_Z + 2; z -= 10) {
      for (const sx of [1, -1]) {
        const dome = new THREE.Mesh(domeGeo, this.strobeMat);
        dome.position.set(sx * (HALF_W - 0.08), CEIL_H - 0.45, z);
        dome.rotation.z = sx > 0 ? Math.PI / 2 : -Math.PI / 2;
        g.add(dome);
        this.strobes.push(dome);
      }
    }

    // two travelling red lights give the flashing its punch without
    // paying for a light per strobe
    this.redA = new THREE.PointLight(0xff2a46, 0, 16, 2);
    this.redB = new THREE.PointLight(0xff2a46, 0, 16, 2);
    g.add(this.redA, this.redB);

    // ---------- ward doors along the walls ----------
    const dw = 1.15;
    for (let z = START_Z - 8; z > DOOR_Z + 6; z -= 7.5) {
      for (const sx of [1, -1]) {
        const frame = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.25, dw + 0.16), trimMat);
        frame.position.set(sx * (HALF_W - 0.03), 1.12, z);
        g.add(frame);
        const leaf = new THREE.Mesh(new THREE.BoxGeometry(0.07, 2.1, dw), doorMat);
        leaf.position.set(sx * (HALF_W - 0.08), 1.05, z);
        g.add(leaf);
        const win = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.5, 0.42), glassMat);
        win.position.set(sx * (HALF_W - 0.13), 1.55, z);
        g.add(win);
        // room number plate
        const plate = new THREE.Mesh(
          new THREE.PlaneGeometry(0.3, 0.16),
          new THREE.MeshBasicMaterial({ map: signTexture(`${Math.floor(200 + Math.random() * 99)}`) })
        );
        plate.position.set(sx * (HALF_W - 0.14), 1.95, z + dw * 0.75);
        plate.rotation.y = sx > 0 ? -Math.PI / 2 : Math.PI / 2;
        g.add(plate);
      }
    }

    // ---------- red cross plates ----------
    for (let z = START_Z - 12; z > DOOR_Z + 8; z -= 22) {
      for (const sx of [1, -1]) {
        const cross = new THREE.Mesh(
          new THREE.PlaneGeometry(0.55, 0.55),
          new THREE.MeshBasicMaterial({ map: crossTexture() })
        );
        cross.position.set(sx * (HALF_W - 0.06), 1.85, z);
        cross.rotation.y = sx > 0 ? -Math.PI / 2 : Math.PI / 2;
        g.add(cross);
      }
    }

    // ---------- hanging signage ----------
    for (const z of [START_Z - 14, START_Z - 38]) {
      const sign = new THREE.Mesh(
        new THREE.BoxGeometry(2.4, 0.6, 0.06),
        new THREE.MeshBasicMaterial({ map: signTexture('EMERGENCY') })
      );
      sign.position.set(0, CEIL_H - 0.62, z);
      g.add(sign);
      for (const sx of [0.9, -0.9]) {
        const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.34, 6), chromeMat);
        rod.position.set(sx, CEIL_H - 0.2, z);
        g.add(rod);
      }
    }

    // ---------- nurse station ----------
    const station = new THREE.Group();
    station.position.set(HALF_W - 1.0, 0, START_Z - 20);
    const counterMat = new THREE.MeshStandardMaterial({ color: 0xe6eef2, roughness: 0.45 });
    const topMat = new THREE.MeshStandardMaterial({ color: 0x17867a, roughness: 0.35 });
    const c1 = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.1, 4.0), counterMat);
    c1.position.set(0, 0.55, 0);
    c1.castShadow = true; c1.receiveShadow = true;
    station.add(c1);
    const c2 = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.1, 4.15), topMat);
    c2.position.set(0, 1.13, 0);
    station.add(c2);
    // monitors
    for (const z of [-1.1, 0.5]) {
      const mon = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.4, 0.62), new THREE.MeshStandardMaterial({ color: 0x24323b }));
      mon.position.set(-0.3, 1.38, z);
      station.add(mon);
      const scr = new THREE.Mesh(
        new THREE.PlaneGeometry(0.56, 0.34),
        new THREE.MeshBasicMaterial({ color: 0x4ec6ff })
      );
      scr.position.set(-0.34, 1.38, z);
      scr.rotation.y = -Math.PI / 2;
      station.add(scr);
    }
    g.add(station);

    // ---------- parked set dressing ----------
    const parked = [
      ['wheelchair', -HALF_W + 0.75, START_Z - 11, 0.6],
      ['bed', HALF_W - 0.9, START_Z - 31, Math.PI / 2],
      ['cart', -HALF_W + 0.7, START_Z - 26, -0.4],
      ['oxygen', -HALF_W + 0.65, START_Z - 45, 0.2],
      ['cart', HALF_W - 0.8, START_Z - 50, 2.7],
      ['wheelchair', HALF_W - 0.85, START_Z - 40, -0.9],
    ];
    this.dressing = [];
    for (const [kind, x, z, ry] of parked) {
      const o = acquireObstacle(kind);
      o.position.set(x, 0, z);
      o.rotation.y = ry;
      g.add(o);
      this.dressing.push(o);
    }

    // ---------- exit doors ----------
    this.doorL = new THREE.Group();
    this.doorR = new THREE.Group();
    const buildLeaf = (parent) => {
      const leaf = new THREE.Mesh(new THREE.BoxGeometry(1.7, 2.6, 0.1), doorMat);
      leaf.position.y = 1.3;
      leaf.castShadow = true;
      parent.add(leaf);
      const win = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.5, 0.04), glassMat);
      win.position.set(0, 1.65, 0.06);
      parent.add(win);
      const bar = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.09, 0.09), chromeMat);
      bar.position.set(0, 1.0, 0.1);
      parent.add(bar);
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.72, 0.14, 0.11), trimMat);
      stripe.position.set(0, 0.42, 0);
      parent.add(stripe);
    };
    buildLeaf(this.doorL);
    buildLeaf(this.doorR);
    this.doorL.position.set(-0.85, 0, DOOR_Z);
    this.doorR.position.set(0.85, 0, DOOR_Z);
    g.add(this.doorL, this.doorR);

    // door surround (wall with the opening)
    const headerMat = new THREE.MeshStandardMaterial({ map: hospitalWallTexture(), roughness: 0.75 });
    const header = new THREE.Mesh(new THREE.BoxGeometry(HALF_W * 2, 0.75, 0.3), headerMat);
    header.position.set(0, CEIL_H - 0.37, DOOR_Z);
    g.add(header);
    for (const sx of [1, -1]) {
      const jamb = new THREE.Mesh(new THREE.BoxGeometry(HALF_W - 1.7, 2.6, 0.3), headerMat);
      jamb.position.set(sx * (1.7 + (HALF_W - 1.7) / 2), 1.3, DOOR_Z);
      g.add(jamb);
    }
    // EXIT sign above the doors
    const exitSign = new THREE.Mesh(
      new THREE.PlaneGeometry(1.5, 0.38),
      new THREE.MeshBasicMaterial({ map: signTexture('EXIT'), transparent: false })
    );
    exitSign.position.set(0, CEIL_H - 0.37, DOOR_Z + 0.17);
    g.add(exitSign);

    // ---------- exterior: ambulance bay ----------
    this.exterior = new THREE.Group();
    this.exterior.position.set(0, 0, 0);
    g.add(this.exterior);

    const apronMat = new THREE.MeshStandardMaterial({ map: asphaltTexture(), roughness: 0.9 });
    const apron = new THREE.Mesh(new THREE.PlaneGeometry(46, 70), apronMat);
    apron.rotation.x = -Math.PI / 2;
    apron.position.set(0, 0.001, DOOR_Z - 34);
    apron.receiveShadow = true;
    this.exterior.add(apron);

    // hazard-striped bay markings
    const hz = new THREE.MeshStandardMaterial({ map: hazardTexture(), roughness: 0.8 });
    for (const x of [-6.5, 6.5]) {
      const strip = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 26), hz);
      strip.rotation.x = -Math.PI / 2;
      strip.position.set(x, 0.015, DOOR_Z - 18);
      this.exterior.add(strip);
    }

    // hospital facade either side of the doors
    const fac = new THREE.MeshStandardMaterial({ map: facadeTexture(), roughness: 0.6 });
    for (const sx of [1, -1]) {
      const wing = new THREE.Mesh(new THREE.BoxGeometry(14, 11, 10), fac);
      wing.position.set(sx * 11, 5.5, DOOR_Z - 3);
      wing.castShadow = true;
      this.exterior.add(wing);
    }
    // canopy over the entrance
    const canopyMat = new THREE.MeshStandardMaterial({ color: 0x1f9d8f, roughness: 0.45 });
    const canopy = new THREE.Mesh(new THREE.BoxGeometry(12, 0.4, 8), canopyMat);
    canopy.position.set(0, 4.2, DOOR_Z - 4);
    canopy.castShadow = true;
    this.exterior.add(canopy);
    for (const sx of [-5, 5]) {
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 4.2, 10), chromeMat);
      col.position.set(sx, 2.1, DOOR_Z - 7.6);
      this.exterior.add(col);
    }
    // big EMERGENCY sign on the canopy
    const bigSign = new THREE.Mesh(
      new THREE.PlaneGeometry(9, 1.5),
      new THREE.MeshBasicMaterial({ map: signTexture('EMERGENCY') })
    );
    bigSign.position.set(0, 5.2, DOOR_Z - 0.2);
    this.exterior.add(bigSign);

    // parked ambulances in the bay
    this.bayAmbulances = [];
    const bay = [
      [-5.2, DOOR_Z - 14, 0.18],
      [5.0, DOOR_Z - 17, -0.12],
      [-5.6, DOOR_Z - 26, 0.05],
    ];
    for (const [x, z, ry] of bay) {
      const a = acquireObstacle('ambulance');
      a.position.set(x, 0, z);
      a.rotation.y = Math.PI + ry;
      this.exterior.add(a);
      this.bayAmbulances.push(a);
    }

    // night sky dome tint + distant city blocks
    const blockMat = new THREE.MeshStandardMaterial({ color: 0x12313f, roughness: 0.9 });
    for (let i = 0; i < 12; i++) {
      const h = 5 + Math.random() * 14;
      const b = new THREE.Mesh(new THREE.BoxGeometry(5 + Math.random() * 6, h, 6), blockMat);
      b.position.set((Math.random() - 0.5) * 70, h / 2, DOOR_Z - 44 - Math.random() * 22);
      this.exterior.add(b);
    }
  }

  /** @param {number} v 0..1 */
  setAlarm(v) { this.alarm = v; }

  /** @param {number} v 0..1 */
  setDoors(v) {
    this.doorOpen = Math.max(0, Math.min(1, v));
    const slide = this.doorOpen * 1.72;
    this.doorL.position.x = -0.85 - slide;
    this.doorR.position.x = 0.85 + slide;
  }

  update(dt, nurseZ = 0) {
    this.time += dt;
    const t = this.time;
    const a = this.alarm;

    // strobe pulse
    const pulse = a * (Math.sin(t * 8.5) > 0 ? 1 : 0.06);
    this.strobeMat.emissiveIntensity = 0.15 + pulse * 2.4;
    this.panelMat.emissiveIntensity = 0.85 - a * 0.42 + Math.sin(t * 17) * a * 0.1;

    // travelling red lights keep up with the nurse
    const flick = Math.sin(t * 8.5) > 0 ? 1 : 0.12;
    this.redA.intensity = a * 11 * flick;
    this.redB.intensity = a * 9 * (1 - flick * 0.85);
    this.redA.position.set(1.9, CEIL_H - 0.6, nurseZ - 3);
    this.redB.position.set(-1.9, CEIL_H - 0.6, nurseZ - 9);
  }

  dispose() {
    // Pooled obstacles share geometry and materials with gameplay, so they
    // must go back to their pools BEFORE anything here is disposed.
    for (const o of this.dressing) releaseObstacle(o);
    for (const o of this.bayAmbulances) releaseObstacle(o);
    this.dressing.length = 0;
    this.bayAmbulances.length = 0;

    this.scene.remove(this.group);
    // Everything left in the group was created here. material.dispose() does
    // not touch the shared canvas textures, which the runner world reuses.
    this.group.traverse((o) => {
      if (!o.isMesh) return;
      o.geometry?.dispose?.();
      const m = o.material;
      if (Array.isArray(m)) m.forEach((x) => x.dispose?.());
      else m?.dispose?.();
    });
    this.mats.forEach((m) => m.dispose?.());
  }
}
