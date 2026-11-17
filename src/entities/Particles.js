import * as THREE from 'three';

/**
 * Pooled particle burst system. A fixed pool of small meshes is recycled,
 * so there is no per-frame allocation and no GC spikes on mobile.
 */

const PALETTE = {
  gold:  0xffc244,
  teal:  0x45dcc8,
  white: 0xffffff,
  rose:  0xff4d6d,
  green: 0x35d986,
};

export class Particles {
  constructor(scene, { count = 170 } = {}) {
    this.scene = scene;
    this.pool = [];
    this.active = [];

    const geo = new THREE.OctahedronGeometry(0.075, 0);
    this.geo = geo;
    this.materials = {};
    for (const [name, color] of Object.entries(PALETTE)) {
      this.materials[name] = new THREE.MeshBasicMaterial({
        color, transparent: true, opacity: 1, depthWrite: false,
      });
    }

    for (let i = 0; i < count; i++) {
      const m = new THREE.Mesh(geo, this.materials.white);
      m.visible = false;
      m.frustumCulled = false;
      scene.add(m);
      this.pool.push({
        mesh: m, life: 0, max: 1,
        vx: 0, vy: 0, vz: 0, spin: 0, scale: 1, gravity: -9,
      });
    }
  }

  burst(position, {
    count = 12, color = 'teal', speed = 3.2, spread = 1,
    life = 0.55, size = 1, gravity = -9, upward = 1.4,
  } = {}) {
    const matName = this.materials[color] ? color : 'teal';
    for (let i = 0; i < count; i++) {
      const p = this.pool.find((q) => q.life <= 0);
      if (!p) return;
      p.mesh.material = this.materials[matName];
      p.mesh.position.copy(position);
      p.mesh.visible = true;
      p.mesh.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);

      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * spread;
      p.vx = Math.cos(a) * r * speed * 0.5;
      p.vz = Math.sin(a) * r * speed * 0.5;
      p.vy = (upward + Math.random() * 1.6) * speed * 0.42;
      p.spin = (Math.random() - 0.5) * 16;
      p.gravity = gravity;
      p.max = life * (0.7 + Math.random() * 0.6);
      p.life = p.max;
      p.scale = size * (0.6 + Math.random() * 0.75);
      p.mesh.scale.setScalar(p.scale);
    }
  }

  /** ring of particles - used for collecting and for the finish line */
  ring(position, { count = 16, color = 'gold', radius = 0.5, life = 0.5, size = 0.8 } = {}) {
    const matName = this.materials[color] ? color : 'gold';
    for (let i = 0; i < count; i++) {
      const p = this.pool.find((q) => q.life <= 0);
      if (!p) return;
      const a = (i / count) * Math.PI * 2;
      p.mesh.material = this.materials[matName];
      p.mesh.position.set(
        position.x + Math.cos(a) * radius * 0.3,
        position.y,
        position.z + Math.sin(a) * radius * 0.3
      );
      p.mesh.visible = true;
      p.vx = Math.cos(a) * 3.4;
      p.vz = Math.sin(a) * 3.4;
      p.vy = 1.3;
      p.spin = 10;
      p.gravity = -3.2;
      p.max = life;
      p.life = life;
      p.scale = size;
      p.mesh.scale.setScalar(size);
    }
  }

  update(dt, worldScrollZ = 0) {
    for (const p of this.pool) {
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) { p.mesh.visible = false; continue; }

      p.vy += p.gravity * dt;
      p.mesh.position.x += p.vx * dt;
      p.mesh.position.y += p.vy * dt;
      p.mesh.position.z += p.vz * dt + worldScrollZ;
      p.mesh.rotation.x += p.spin * dt;
      p.mesh.rotation.y += p.spin * 0.7 * dt;

      const k = p.life / p.max;
      p.mesh.scale.setScalar(p.scale * (0.35 + k * 0.8));
      if (p.mesh.position.y < 0.03) { p.mesh.position.y = 0.03; p.vy *= -0.32; p.vx *= 0.7; p.vz *= 0.7; }
    }
  }

  clear() {
    for (const p of this.pool) { p.life = 0; p.mesh.visible = false; }
  }

  dispose() {
    this.clear();
    for (const p of this.pool) this.scene.remove(p.mesh);
    this.geo.dispose();
    Object.values(this.materials).forEach((m) => m.dispose());
  }
}
