import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';

export class CreatureController {
  constructor(parent, config, { worldScale = 1 } = {}) {
    this.parent = parent;
    this.config = config;
    this.worldScale = worldScale;
    this.root = new THREE.Group();
    this.instances = [];
    this.timeOrigin = 0;
    this.lastElapsed = 0;
    this.parent.add(this.root);
  }

  async load() {
    const source = await this.loadSource();
    const population = this.config.population || [{ size: 1, base: [0, 0, 0], range: [0, 0, 0], speed: 1, phase: 0 }];

    population.forEach((motion, index) => {
      const object = source.scene ? cloneSkeleton(source.scene) : this.createJellyfishPlaceholder();
      const instance = new THREE.Group();
      const visual = new THREE.Group();
      visual.add(object);
      instance.add(visual);
      instance.userData = { motion, visual, mixers: [] };
      this.root.add(instance);

      this.normalizeModel(object, motion.size);
      if (source.animations?.length) {
        const mixer = new THREE.AnimationMixer(object);
        source.animations.forEach((clip) => mixer.clipAction(clip).play());
        instance.userData.mixers.push(mixer);
      }
      this.instances.push(instance);
      this.applyMotion(instance, 0, index);
    });

    return { usedPlaceholder: !source.scene, count: this.instances.length };
  }

  async loadSource() {
    try {
      const response = await fetch(this.config.modelUrl, { method: 'HEAD' });
      if (response.ok) return await new GLTFLoader().loadAsync(this.config.modelUrl);
    } catch (error) {
      console.info('GLBモデルを読み込めないため仮モデルを表示します。', error);
    }
    return { scene: null, animations: [] };
  }

  normalizeModel(object, instanceScale) {
    const box = new THREE.Box3().setFromObject(object);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const largest = Math.max(size.x, size.y, size.z) || 1;
    const scale = this.config.scale * instanceScale * this.worldScale / largest;
    object.position.sub(center);
    object.scale.setScalar(scale);
  }

  createJellyfishPlaceholder() {
    const group = new THREE.Group();
    const material = new THREE.MeshPhysicalMaterial({
      color: this.config.colors.body,
      emissive: this.config.colors.glow,
      emissiveIntensity: 0.16,
      roughness: 0.24,
      transparent: true,
      opacity: 0.82,
      transmission: 0.18,
      thickness: 0.5,
      side: THREE.DoubleSide
    });

    const bell = new THREE.Mesh(
      new THREE.SphereGeometry(0.72, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.62),
      material
    );
    bell.scale.y = 0.72;
    bell.position.y = 0.25;
    group.add(bell);

    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(0.58, 0.07, 9, 24),
      new THREE.MeshStandardMaterial({
        color: this.config.colors.accent,
        emissive: this.config.colors.accent,
        emissiveIntensity: 0.22,
        transparent: true,
        opacity: 0.7
      })
    );
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.22;
    group.add(rim);

    for (let index = 0; index < 7; index += 1) {
      const x = (index - 3) * 0.16;
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(x, 0.2, 0),
        new THREE.Vector3(x + Math.sin(index) * 0.12, -0.32, 0.04),
        new THREE.Vector3(x - Math.cos(index) * 0.14, -0.92, -0.03)
      ]);
      const tentacle = new THREE.Mesh(
        new THREE.TubeGeometry(curve, 14, 0.027, 6, false),
        material.clone()
      );
      tentacle.userData.tentaclePhase = index * 0.7;
      group.add(tentacle);
    }

    const glow = new THREE.PointLight(this.config.colors.glow, 1.5, 3);
    glow.position.set(0, 0.2, 0.5);
    group.add(glow);
    return group;
  }

  reset() {
    this.timeOrigin = this.lastElapsed;
    this.instances.forEach((instance, index) => this.applyMotion(instance, 0, index));
  }

  update(delta, elapsed) {
    this.lastElapsed = elapsed;
    const localElapsed = elapsed - this.timeOrigin;
    this.instances.forEach((instance, index) => {
      instance.userData.mixers.forEach((mixer) => mixer.update(delta * this.config.animationSpeed));
      this.applyMotion(instance, localElapsed, index);
    });
  }

  applyMotion(instance, elapsed, index) {
    const { motion, visual } = instance.userData;
    const t = elapsed * motion.speed + motion.phase;
    const [bx, by, bz] = motion.base;
    const [rx, ry, rz] = motion.range;

    instance.position.set(
      (bx + Math.sin(t * 0.73) * rx + Math.sin(t * 0.21 + index) * rx * 0.3) * this.worldScale,
      (by + Math.sin(t * 1.11) * ry) * this.worldScale,
      (bz + Math.cos(t * 0.61 + index * 0.7) * rz) * this.worldScale
    );
    instance.rotation.y = Math.sin(t * 0.49 + index) * 0.42;
    instance.rotation.z = Math.sin(t * 0.83 + index * 0.4) * 0.1;
    visual.position.y = Math.sin(t * 1.7) * 0.035 * this.worldScale;
    visual.rotation.x = Math.sin(t * 0.42) * 0.08;

    visual.traverse((object) => {
      if (object.userData.tentaclePhase === undefined) return;
      object.rotation.y = Math.sin(t * 2.1 + object.userData.tentaclePhase) * 0.12;
    });
  }
}
