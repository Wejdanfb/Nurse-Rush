import * as THREE from 'three';
import {
  asphaltTexture, hazardTexture, facadeTexture, signTexture,
  glowTexture, finishTexture, crossTexture,
} from './Textures.js';
import {
  acquireObstacle, releaseObstacle, pulseEmergencyMaterials,
} from '../entities/Obstacles.js';
import {
  acquireCollectible, releaseCollectible, randomCollectibleKind,
} from '../entities/Collectibles.js';
import { mergeByMaterial } from '../core/MeshUtils.js';

export const LANE_X = [-2.3, 0, 2.3];
export const ROAD_W = 7.8;

const SEG_LEN = 24;
const SEG_COUNT = 9;              // enough to cover the draw distance
const RECYCLE_Z = 34;             // behind the camera
const SPAWN_Z = -150;             // where new rows appear

/**
 * The endless runner environment: emergency-department approach road with
 * three lanes, scenery, obstacles, collectibles and the finish gate.
 *
 * The nurse stays at z = 0 and the world scrolls towards +Z, which keeps
 * floating-point precision stable over a long round and makes the camera
 * trivial.
 */
export class RunnerWorld {
  constructor(scene, { quality = 'high' } = {}) {
    this.scene = scene;
    this.quality = quality;
    this.group = new THREE.Group();
    scene.add(this.group);

    this.speed = 0;
    this.distance = 0;
    this.time = 0;

    this.obstacles = [];
    this.collectibles = [];
    this.props = [];
    this.segments = [];

    this.nextObstacleAt = 26;     // metres of travel
    this.nextCoinAt = 14;
    this.nextPropAt = 0;
    this.lastPatternLanes = [];

    this.finishGate = null;
    this.finishSpawned = false;
    this.finishCrossed = false;

    // while a question is on screen nothing new is generated
    this.frozen = false;

    this.mats = {};
    this.geos = {};
    this._buildStatic();
    this._buildRoad();

    // Prime the first stretch so the opening seconds are not empty. The
    // first row sits 45 m out, which is over three seconds of reaction time
    // at the opening speed.
    for (let i = 0; i < 6; i++) this._spawnObstacleRow(-45 - i * 22, 0);
    for (let i = 0; i < 9; i++) this._spawnCoinRun(-20 - i * 15);
    for (let z = -14; z > SPAWN_Z; z -= 15) this._spawnSideProps(z);
  }

  // -----------------------------------------------------------------
  _buildStatic() {
    const M = this.mats;
    M.asphalt = new THREE.MeshStandardMaterial({ map: asphaltTexture(), roughness: 0.92 });
    M.line = new THREE.MeshStandardMaterial({ color: 0xf4f7f8, roughness: 0.5 });
    M.lineTeal = new THREE.MeshStandardMaterial({ color: 0x19b8a6, roughness: 0.45 });
    M.kerb = new THREE.MeshStandardMaterial({ color: 0xc9d4d9, roughness: 0.8 });
    M.verge = new THREE.MeshStandardMaterial({ color: 0x164238, roughness: 0.98 });
    M.hazard = new THREE.MeshStandardMaterial({ map: hazardTexture(), roughness: 0.85 });
    M.facade = new THREE.MeshStandardMaterial({ map: facadeTexture(), roughness: 0.65 });
    M.block = new THREE.MeshStandardMaterial({ color: 0x14384a, roughness: 0.9 });
    M.metal = new THREE.MeshStandardMaterial({ color: 0xaebcc4, roughness: 0.35, metalness: 0.6 });
    M.lamp = new THREE.MeshStandardMaterial({ color: 0xfff3cf, emissive: 0xffe9a8, emissiveIntensity: 1.1, roughness: 0.4 });
    M.hedge = new THREE.MeshStandardMaterial({ color: 0x2f7d4a, roughness: 0.95 });
    M.planter = new THREE.MeshStandardMaterial({ color: 0xd9e2e6, roughness: 0.8 });
    M.teal = new THREE.MeshStandardMaterial({ color: 0x1f9d8f, roughness: 0.5 });
    M.white = new THREE.MeshStandardMaterial({ color: 0xf2f7fa, roughness: 0.6 });

    const G = this.geos;
    G.box = new THREE.BoxGeometry(1, 1, 1);
    G.cyl = new THREE.CylinderGeometry(0.5, 0.5, 1, 10);
    G.sph = new THREE.SphereGeometry(0.5, 12, 8);
    G.plane = new THREE.PlaneGeometry(1, 1);

    // Recycling scenery must not dispose anything shared, so keep sets of
    // what belongs to the world itself.
    this.sharedMats = new Set(Object.values(M));
    this.sharedGeos = new Set(Object.values(G));
  }

  _box(parent, w, h, d, m, x, y, z) {
    const me = new THREE.Mesh(this.geos.box, m);
    me.scale.set(w, h, d);
    me.position.set(x, y, z);
    me.castShadow = true;
    parent.add(me);
    return me;
  }

  // -----------------------------------------------------------------
  _buildRoad() {
    for (let i = 0; i < SEG_COUNT; i++) {
      const seg = new THREE.Group();
      seg.position.z = RECYCLE_Z - (i + 1) * SEG_LEN;

      // road surface
      const road = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_W, SEG_LEN), this.mats.asphalt);
      road.rotation.x = -Math.PI / 2;
      road.receiveShadow = true;
      seg.add(road);

      // lane dividers (dashed)
      for (const x of [-1.15, 1.15]) {
        for (let k = 0; k < 6; k++) {
          const dash = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 2.1), this.mats.line);
          dash.rotation.x = -Math.PI / 2;
          dash.position.set(x, 0.012, -SEG_LEN / 2 + 2 + k * 4);
          seg.add(dash);
        }
      }
      // edge lines
      for (const x of [-ROAD_W / 2 + 0.25, ROAD_W / 2 - 0.25]) {
        const edge = new THREE.Mesh(new THREE.PlaneGeometry(0.16, SEG_LEN), this.mats.lineTeal);
        edge.rotation.x = -Math.PI / 2;
        edge.position.set(x, 0.012, 0);
        seg.add(edge);
      }
      // kerbs + verge
      for (const sx of [1, -1]) {
        this._box(seg, 0.4, 0.22, SEG_LEN, this.mats.kerb, sx * (ROAD_W / 2 + 0.2), 0.11, 0);
        // wide enough that the ground reaches the fog instead of ending in
        // a visible edge against the sky
        const verge = new THREE.Mesh(new THREE.PlaneGeometry(38, SEG_LEN), this.mats.verge);
        verge.rotation.x = -Math.PI / 2;
        verge.position.set(sx * (ROAD_W / 2 + 19.4), 0.005, 0);
        verge.receiveShadow = true;
        seg.add(verge);
      }

      // A segment is ~19 primitives (road, dashes, edge lines, kerbs,
      // verges) and nine of them are alive at once. Merged by material each
      // one costs five draw calls instead of nineteen.
      mergeByMaterial(seg, { castShadow: false, receiveShadow: true });

      this.group.add(seg);
      this.segments.push(seg);
    }
  }

  // -----------------------------------------------------------------
  // side scenery
  // -----------------------------------------------------------------
  _spawnSideProps(z) {
    const pick = Math.random();
    const side = Math.random() > 0.5 ? 1 : -1;

    if (pick < 0.3) {
      // street lamp
      const g = new THREE.Group();
      this._box(g, 0.16, 4.4, 0.16, this.mats.metal, 0, 2.2, 0);
      const arm = this._box(g, 1.3, 0.12, 0.12, this.mats.metal, -side * 0.6, 4.3, 0);
      const head = this._box(g, 0.8, 0.14, 0.4, this.mats.lamp, -side * 1.15, 4.2, 0);
      const glow = new THREE.Mesh(
        this.geos.plane,
        new THREE.MeshBasicMaterial({
          map: glowTexture('255,235,180'), transparent: true, opacity: 0.3,
          depthWrite: false, blending: THREE.AdditiveBlending,
        })
      );
      glow.scale.set(7, 7, 1);
      glow.rotation.x = -Math.PI / 2;
      glow.position.set(-side * 1.15, 0.03, 0);
      g.add(glow);
      g.position.set(side * (ROAD_W / 2 + 1.1), 0, z);
      this._addProp(g, z);
    } else if (pick < 0.5) {
      // hedge planter
      const g = new THREE.Group();
      this._box(g, 1.5, 0.5, 2.6, this.mats.planter, 0, 0.25, 0);
      for (let i = 0; i < 4; i++) {
        const b = new THREE.Mesh(this.geos.sph, this.mats.hedge);
        b.scale.set(1.2, 0.9, 1.2);
        b.position.set((Math.random() - 0.5) * 0.5, 0.7, -0.95 + i * 0.63);
        b.castShadow = true;
        g.add(b);
      }
      g.position.set(side * (ROAD_W / 2 + 1.7), 0, z);
      this._addProp(g, z);
    } else if (pick < 0.66) {
      // hospital wing
      const g = new THREE.Group();
      const h = 7 + Math.random() * 6;
      const w = 9 + Math.random() * 7;
      this._box(g, w, h, 11, this.mats.facade, 0, h / 2, 0);
      this._box(g, w + 0.6, 0.5, 11.4, this.mats.teal, 0, h + 0.2, 0);
      if (Math.random() > 0.5) {
        const cross = new THREE.Mesh(
          this.geos.plane,
          new THREE.MeshBasicMaterial({ map: crossTexture() })
        );
        cross.scale.set(2.4, 2.4, 1);
        cross.position.set(-side * (w / 2 + 0.06), h * 0.62, 0);
        cross.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
        g.add(cross);
      }
      g.position.set(side * (ROAD_W / 2 + 10 + Math.random() * 4), 0, z);
      this._addProp(g, z);
    } else if (pick < 0.78) {
      // parked ambulance, well clear of the kerb so it never reads as an
      // obstacle in a lane
      const a = acquireObstacle('ambulance');
      a.position.set(side * (ROAD_W / 2 + 5.2), 0, z);
      a.rotation.y = Math.PI / 2 * side + (Math.random() - 0.5) * 0.2;
      this._addProp(a, z, true);
    } else if (pick < 0.9) {
      // ED signage at the roadside, angled towards the player
      const g = new THREE.Group();
      this._box(g, 0.18, 3.4, 0.18, this.mats.metal, 0, 1.7, 0);
      const board = new THREE.Mesh(
        this.geos.plane,
        new THREE.MeshBasicMaterial({ map: signTexture('EMERGENCY'), side: THREE.DoubleSide })
      );
      board.scale.set(3.2, 0.85, 1);
      board.position.set(-side * 0.2, 3.0, 0);
      board.rotation.y = side > 0 ? -0.62 : 0.62;
      g.add(board);
      this._box(g, 2.0, 0.09, 0.09, this.mats.metal, -side * 0.2, 2.55, 0);
      g.position.set(side * (ROAD_W / 2 + 2.1), 0, z);
      this._addProp(g, z);
    } else {
      // works barrier line
      const g = new THREE.Group();
      for (let i = 0; i < 3; i++) {
        const b = new THREE.Mesh(this.geos.box, this.mats.hazard);
        b.scale.set(0.3, 0.9, 1.9);
        b.position.set(0, 0.45, i * 2.1);
        b.castShadow = true;
        g.add(b);
      }
      g.position.set(side * (ROAD_W / 2 + 0.9), 0, z);
      this._addProp(g, z);
    }
  }

  _addProp(obj, z, pooled = false) {
    obj.position.z = z;
    this.group.add(obj);
    this.props.push({ obj, pooled });
  }

  // -----------------------------------------------------------------
  // obstacles
  // -----------------------------------------------------------------
  /**
   * Rows are built so at least one lane is always passable:
   *  - at most two lanes are ever blocked by non-clearable obstacles
   *  - a full-width arch is always clearable by sliding
   */
  _spawnObstacleRow(z, tier = 0) {
    const r = Math.random();
    const hardness = Math.min(1, tier / 5);

    // full-width imaging arch - slide under it
    if (r < 0.14 + hardness * 0.06) {
      const arch = acquireObstacle('gantry');
      arch.position.set(0, 0, z);
      arch.rotation.y = 0;
      this.group.add(arch);
      this.obstacles.push({ obj: arch, lane: -1, full: true, data: arch.userData });
      return;
    }

    const jumpables = ['bed', 'wheelchair', 'cart', 'oxygen', 'equipbox'];
    const lanes = [0, 1, 2];
    // shuffle
    for (let i = 2; i > 0; i--) {
      const k = Math.floor(Math.random() * (i + 1));
      [lanes[i], lanes[k]] = [lanes[k], lanes[i]];
    }

    // how many lanes to occupy: never all three
    let n = 1;
    if (r < 0.52 + hardness * 0.2) n = 2;
    if (Math.random() < 0.08 + hardness * 0.12) n = 2;

    const useAmbulance = Math.random() < 0.3 + hardness * 0.18;

    for (let i = 0; i < n; i++) {
      const lane = lanes[i];
      let kind;
      if (i === 0 && useAmbulance) kind = 'ambulance';
      else kind = jumpables[Math.floor(Math.random() * jumpables.length)];

      const o = acquireObstacle(kind);
      o.position.set(LANE_X[lane], 0, z + (i === 0 ? 0 : (Math.random() - 0.5) * 2.4));
      o.rotation.y = kind === 'ambulance' ? Math.PI : (Math.random() - 0.5) * 0.3;
      this.group.add(o);
      this.obstacles.push({ obj: o, lane, full: o.userData.clear === 'full', data: o.userData });
    }
  }

  _spawnCoinRun(z) {
    const lane = Math.floor(Math.random() * 3);
    const kind = randomCollectibleKind();
    const arc = Math.random() < 0.26;   // arcing line to reward a jump
    const n = kind === 'coin' ? 4 + Math.floor(Math.random() * 4) : 1;

    for (let i = 0; i < n; i++) {
      const c = acquireCollectible(n > 1 ? 'coin' : kind);
      const zz = z - i * 1.5;
      const y = arc
        ? 0.75 + Math.sin((i / Math.max(1, n - 1)) * Math.PI) * 1.5
        : 0.85;
      c.position.set(LANE_X[lane], y, zz);
      this.group.add(c);
      this.collectibles.push({
        obj: c, lane, baseY: y, data: c.userData, taken: false,
        phase: Math.random() * 6.28,
      });
    }
  }

  // -----------------------------------------------------------------
  spawnFinishGate(distanceAhead = 90) {
    if (this.finishSpawned) return;
    this.finishSpawned = true;

    const g = new THREE.Group();
    // banner
    const banner = new THREE.Mesh(
      new THREE.PlaneGeometry(ROAD_W + 1.4, 1.2),
      new THREE.MeshBasicMaterial({ map: finishTexture(), side: THREE.DoubleSide })
    );
    banner.position.set(0, 4.1, 0);
    g.add(banner);
    // posts
    for (const sx of [1, -1]) {
      this._box(g, 0.34, 4.6, 0.34, this.mats.teal, sx * (ROAD_W / 2 + 0.5), 2.3, 0);
    }
    // cross beam
    this._box(g, ROAD_W + 1.6, 0.3, 0.4, this.mats.teal, 0, 4.85, 0);
    // "FINISH" board
    const board = new THREE.Mesh(
      new THREE.PlaneGeometry(5.4, 1.1),
      new THREE.MeshBasicMaterial({ map: signTexture('FINISH'), side: THREE.DoubleSide })
    );
    board.position.set(0, 5.5, 0);
    g.add(board);
    // road markings
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_W, 1.4), new THREE.MeshBasicMaterial({ map: finishTexture() }));
    strip.rotation.x = -Math.PI / 2;
    strip.position.set(0, 0.02, 0);
    g.add(strip);

    g.position.set(0, 0, -distanceAhead);
    this.group.add(g);
    this.finishGate = g;
  }

  /**
   * Hold the finish gate at a fixed *time* from the nurse rather than a
   * fixed distance.
   *
   * A one-shot distance guess made when the gate spawns goes wrong as soon
   * as the player clips an obstacle and gets slowed, and they then never
   * reach the line before the clock expires. Positioning by time-to-arrival
   * is self-correcting: the gate is always `remaining - lead` seconds away
   * at the current nominal speed, so it arrives just before the round ends
   * no matter what happened on the way. The gate is far beyond the fog
   * while any correction is large, so the adjustment is never visible.
   */
  updateFinishGate(remaining, nominalSpeed, dt) {
    const g = this.finishGate;
    if (!g) return;

    const LEAD = 1.8; // cross the line this many seconds before the clock hits zero
    const target = -Math.max(0, nominalSpeed * (remaining - LEAD));
    g.position.z += (target - g.position.z) * (1 - Math.exp(-3 * dt));

    if (g.position.z > -1.5) this.finishCrossed = true;
  }

  // -----------------------------------------------------------------
  setSpeed(v) { this.speed = v; }

  /**
   * Freeze generation. Called while a question is displayed so no obstacle
   * row, pickup or scenery appears behind the card; existing objects stop
   * moving as the nurse decelerates to a standstill, because everything
   * scrolls at her speed.
   */
  setFrozen(v) {
    this.frozen = !!v;
    if (!this.frozen) {
      // don't let the distance accrued while stopped dump a burst of rows
      // the moment play resumes
      this.nextObstacleAt = Math.max(this.nextObstacleAt, this.distance + 12);
      this.nextCoinAt = Math.max(this.nextCoinAt, this.distance + 6);
      this.nextPropAt = Math.max(this.nextPropAt, this.distance + 4);
    }
  }

  update(dt, tier = 0) {
    this.time += dt;
    const dz = this.speed * dt;
    this.distance += dz;

    pulseEmergencyMaterials(this.time);

    // scroll road segments
    for (const seg of this.segments) {
      seg.position.z += dz;
      if (seg.position.z > RECYCLE_Z) seg.position.z -= SEG_LEN * SEG_COUNT;
    }

    // scroll + recycle obstacles
    for (let i = this.obstacles.length - 1; i >= 0; i--) {
      const o = this.obstacles[i];
      o.obj.position.z += dz;
      if (o.obj.position.z > RECYCLE_Z) {
        releaseObstacle(o.obj);
        this.obstacles.splice(i, 1);
      }
    }

    // scroll + animate collectibles
    for (let i = this.collectibles.length - 1; i >= 0; i--) {
      const c = this.collectibles[i];
      c.obj.position.z += dz;
      c.obj.rotation.y += c.data.spin * dt;
      c.obj.position.y = c.baseY + Math.sin(this.time * 2.4 + c.phase) * 0.09;
      if (c.obj.position.z > RECYCLE_Z || c.taken) {
        releaseCollectible(c.obj);
        this.collectibles.splice(i, 1);
      }
    }

    // scroll + recycle scenery
    for (let i = this.props.length - 1; i >= 0; i--) {
      const p = this.props[i];
      p.obj.position.z += dz;
      if (p.obj.position.z > RECYCLE_Z + 16) {
        if (p.pooled) releaseObstacle(p.obj);
        else {
          this.group.remove(p.obj);
          p.obj.traverse((o) => {
            if (!o.isMesh) return;
            if (!this.sharedGeos.has(o.geometry)) o.geometry.dispose();
            if (!this.sharedMats.has(o.material)) o.material.dispose();
          });
        }
        this.props.splice(i, 1);
      }
    }

    // The finish gate is NOT scrolled here - updateFinishGate() owns its
    // position so the two never fight over it.

    // ---- spawning, paced by distance travelled ----
    // Nothing is generated while a question is on screen.
    if (this.frozen) return;

    // Spacing scales with the current speed, so faster tiers never reduce
    // the reaction time the player gets between rows.
    const gap = Math.max(13, this.speed * 0.92);
    if (this.distance >= this.nextObstacleAt && !this.finishSpawned) {
      this._spawnObstacleRow(SPAWN_Z, tier);
      this.nextObstacleAt = this.distance + gap * (0.8 + Math.random() * 0.5);
    }
    if (this.distance >= this.nextCoinAt) {
      this._spawnCoinRun(SPAWN_Z + Math.random() * 20);
      this.nextCoinAt = this.distance + 10 + Math.random() * 12;
    }
    if (this.distance >= this.nextPropAt) {
      this._spawnSideProps(SPAWN_Z - Math.random() * 10);
      this._spawnSideProps(SPAWN_Z - Math.random() * 16);
      if (Math.random() > 0.5) this._spawnSideProps(SPAWN_Z - Math.random() * 22);
      this.nextPropAt = this.distance + 7 + Math.random() * 7;
    }
  }

  /** Drop all obstacles and collectibles near the nurse (used on finish). */
  clearNear(range = 40) {
    for (let i = this.obstacles.length - 1; i >= 0; i--) {
      const o = this.obstacles[i];
      if (o.obj.position.z > -range) {
        releaseObstacle(o.obj);
        this.obstacles.splice(i, 1);
      }
    }
  }

  dispose() {
    for (const o of this.obstacles) releaseObstacle(o.obj);
    for (const c of this.collectibles) releaseCollectible(c.obj);
    for (const p of this.props) if (p.pooled) releaseObstacle(p.obj);
    this.obstacles.length = 0;
    this.collectibles.length = 0;
    this.props.length = 0;

    this.scene.remove(this.group);
    this.group.traverse((o) => {
      if (!o.isMesh) return;
      o.geometry?.dispose?.();
      if (!Array.isArray(o.material)) o.material?.dispose?.();
    });
    Object.values(this.mats).forEach((m) => m.dispose?.());
    Object.values(this.geos).forEach((g) => g.dispose?.());
  }
}
