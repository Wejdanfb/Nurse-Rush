import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Collapse every static mesh in a group into one mesh per material.
 *
 * An ambulance is ~30 primitives and a nurse's hair is ~90 small spheres;
 * drawn individually that is 120 draw calls for two objects. Merged by
 * material it is under ten, which is the difference between a smooth and a
 * stuttery frame on a phone. Materials are preserved by reference, so
 * shared materials (such as the pulsing emergency lamps) keep working.
 *
 * Only call this on groups whose meshes never move relative to each other.
 */
export function mergeByMaterial(group, { castShadow = true, receiveShadow = false } = {}) {
  const buckets = new Map();
  const leftovers = [];

  group.traverse((o) => {
    if (!o.isMesh) return;
    const geo = o.geometry;
    const mat = o.material;
    if (!geo || Array.isArray(mat) || !geo.attributes?.position) {
      leftovers.push(o);
      return;
    }
    if (!buckets.has(mat)) buckets.set(mat, []);
    const clone = geo.clone();
    o.updateWorldMatrix(true, false);
    // bring it into the group's own space
    const m = new THREE.Matrix4().copy(group.matrixWorld).invert().multiply(o.matrixWorld);
    clone.applyMatrix4(m);
    // merging needs a consistent attribute set
    if (!clone.attributes.uv) {
      const n = clone.attributes.position.count;
      clone.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    }
    clone.deleteAttribute('tangent');
    buckets.get(mat).push(clone);
  });

  if (!buckets.size) return group;

  // drop the originals
  const toRemove = [];
  group.traverse((o) => { if (o.isMesh && !leftovers.includes(o)) toRemove.push(o); });
  for (const o of toRemove) o.parent?.remove(o);

  for (const [mat, geos] of buckets) {
    let merged;
    try {
      merged = geos.length === 1 ? geos[0] : mergeGeometries(geos, false);
    } catch (e) {
      merged = null;
    }
    if (!merged) {
      // merging failed (mismatched attributes) - fall back to separate meshes
      for (const g of geos) {
        const mesh = new THREE.Mesh(g, mat);
        mesh.castShadow = castShadow;
        mesh.receiveShadow = receiveShadow;
        group.add(mesh);
      }
      continue;
    }
    if (geos.length > 1) geos.forEach((g) => g.dispose());
    const mesh = new THREE.Mesh(merged, mat);
    mesh.castShadow = castShadow;
    mesh.receiveShadow = receiveShadow;
    group.add(mesh);
  }

  return group;
}
