import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';

const cutoutTextureCache = new Map();

export class CreatureController {
  constructor(parent, config, { worldScale = 1 } = {}) {
    this.parent = parent;
    this.config = config;
    this.worldScale = worldScale;
    this.root = new THREE.Group();
    this.instances = [];
    this.timeOrigin = 0;
    this.lastElapsed = 0;
    this.photoBlend = 0;
    this.photoMode = false;
    this.trackingOpacity = 1;
    this.reaction = { type: null, time: 0 };
    this.parent.add(this.root);
  }

  async load() {
    if (this.config.renderMode === 'sprite2d') {
      return await this.loadSpritePopulation();
    }

    const source = await this.loadSource();
    const population = this.config.population;

    population.forEach((motion, index) => {
      const object = source.scene ? cloneSkeleton(source.scene) : this.createPlaceholder();
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

    return { usedPlaceholder: !source.scene, count: this.instances.length, key: this.config.key };
  }

  async loadSpritePopulation() {
    const texture = await this.loadCutoutTexture(this.config.spriteUrl);
    const aspect = texture.image.width / texture.image.height;

    this.config.population.forEach((motion, index) => {
      const material = new THREE.SpriteMaterial({
        map: texture,
        color: 0xffffff,
        transparent: true,
        opacity: 0.98,
        depthWrite: false,
        alphaTest: 0.015
      });
      const sprite = new THREE.Sprite(material);
      const height = this.config.scale * motion.size * this.worldScale;
      sprite.scale.set(height * aspect, height, 1);
      sprite.userData.baseScale = sprite.scale.clone();

      const instance = new THREE.Group();
      const visual = new THREE.Group();
      visual.add(sprite);
      instance.add(visual);
      instance.userData = {
        motion,
        visual,
        sprite,
        spriteIndex: index,
        mixers: [],
        isSprite2D: true
      };
      this.root.add(instance);
      this.instances.push(instance);
      this.applyMotion(instance, 0, index);
    });

    return {
      usedPlaceholder: false,
      count: this.instances.length,
      key: this.config.key,
      renderMode: 'sprite2d'
    };
  }

  async loadCutoutTexture(url) {
    if (!cutoutTextureCache.has(url)) {
      const pending = this.createCutoutTexture(url).catch((error) => {
        cutoutTextureCache.delete(url);
        throw error;
      });
      cutoutTextureCache.set(url, pending);
    }
    return await cutoutTextureCache.get(url);
  }

  async createCutoutTexture(url) {
    const image = new Image();
    image.decoding = 'async';
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error(`2D画像を読み込めませんでした: ${url}`));
      image.src = url;
    });
    if (image.decode) {
      try {
        await image.decode();
      } catch {
        // onload後にdecodeが失敗する一部Safariでも、読み込み済み画像はそのまま使用できる。
      }
    }

    const source = document.createElement('canvas');
    source.width = image.naturalWidth;
    source.height = image.naturalHeight;
    const sourceContext = source.getContext('2d', { willReadFrequently: true });
    sourceContext.drawImage(image, 0, 0);
    const imageData = sourceContext.getImageData(0, 0, source.width, source.height);
    const { data } = imageData;
    const width = source.width;
    const height = source.height;
    const visited = new Uint8Array(width * height);
    const queue = new Int32Array(width * height);
    let head = 0;
    let tail = 0;

    const isBackground = (index) => {
      const offset = index * 4;
      const red = data[offset];
      const green = data[offset + 1];
      const blue = data[offset + 2];
      return red > 236 && green > 236 && blue > 236
        && Math.max(red, green, blue) - Math.min(red, green, blue) < 18;
    };
    const enqueue = (index) => {
      if (visited[index] || !isBackground(index)) return;
      visited[index] = 1;
      queue[tail] = index;
      tail += 1;
    };

    for (let x = 0; x < width; x += 1) {
      enqueue(x);
      enqueue((height - 1) * width + x);
    }
    for (let y = 1; y < height - 1; y += 1) {
      enqueue(y * width);
      enqueue(y * width + width - 1);
    }

    while (head < tail) {
      const index = queue[head];
      head += 1;
      const x = index % width;
      const y = Math.floor(index / width);
      if (x > 0) enqueue(index - 1);
      if (x < width - 1) enqueue(index + 1);
      if (y > 0) enqueue(index - width);
      if (y < height - 1) enqueue(index + width);
    }

    let minX = width;
    let minY = height;
    let maxX = 0;
    let maxY = 0;
    for (let index = 0; index < visited.length; index += 1) {
      const offset = index * 4;
      if (visited[index]) {
        data[offset + 3] = 0;
        continue;
      }
      if (data[offset + 3] < 8) continue;
      const x = index % width;
      const y = Math.floor(index / width);
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
    sourceContext.putImageData(imageData, 0, 0);

    const padding = 8;
    minX = Math.max(0, minX - padding);
    minY = Math.max(0, minY - padding);
    maxX = Math.min(width - 1, maxX + padding);
    maxY = Math.min(height - 1, maxY + padding);
    const crop = document.createElement('canvas');
    crop.width = maxX - minX + 1;
    crop.height = maxY - minY + 1;
    crop.getContext('2d').drawImage(
      source,
      minX,
      minY,
      crop.width,
      crop.height,
      0,
      0,
      crop.width,
      crop.height
    );

    const texture = new THREE.CanvasTexture(crop);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.generateMipmaps = false;
    texture.needsUpdate = true;
    return texture;
  }

  async loadSource() {
    try {
      const response = await fetch(this.config.modelUrl, { method: 'HEAD' });
      if (response.ok) return await new GLTFLoader().loadAsync(this.config.modelUrl);
    } catch (error) {
      console.info(`${this.config.label}のGLBを読み込めないため仮モデルを表示します。`, error);
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

  createPlaceholder() {
    if (this.config.key === 'whale') return this.createWhalePlaceholder();
    if (this.config.key === 'turtle') return this.createTurtlePlaceholder();
    return this.createJellyfishPlaceholder();
  }

  createMaterial(opacity = 0.88) {
    return new THREE.MeshPhysicalMaterial({
      color: this.config.colors.body,
      emissive: this.config.colors.glow,
      emissiveIntensity: 0.13,
      roughness: 0.3,
      transparent: true,
      opacity,
      transmission: 0.1,
      thickness: 0.4,
      side: THREE.DoubleSide
    });
  }

  createJellyfishPlaceholder() {
    const group = new THREE.Group();
    const material = this.createMaterial(0.82);
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
    group.add(this.createGlow());
    return group;
  }

  createWhalePlaceholder() {
    const group = new THREE.Group();
    const material = this.createMaterial(0.9);
    const pale = new THREE.MeshStandardMaterial({
      color: 0xdff8ff,
      emissive: this.config.colors.glow,
      emissiveIntensity: 0.08,
      transparent: true,
      opacity: 0.82
    });

    const body = new THREE.Mesh(new THREE.SphereGeometry(0.78, 24, 16), material);
    body.scale.set(1.55, 0.62, 0.68);
    group.add(body);

    const belly = new THREE.Mesh(new THREE.SphereGeometry(0.64, 20, 12), pale);
    belly.scale.set(1.36, 0.36, 0.58);
    belly.position.set(0.08, -0.28, 0);
    group.add(belly);

    const tailRoot = new THREE.Group();
    tailRoot.position.x = -1.3;
    tailRoot.userData.tail = true;
    for (const side of [-1, 1]) {
      const tail = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.72, 3), material);
      tail.rotation.z = side * Math.PI * 0.48;
      tail.rotation.x = Math.PI / 2;
      tail.position.set(-0.18, side * 0.25, 0);
      tailRoot.add(tail);
    }
    group.add(tailRoot);

    for (const side of [-1, 1]) {
      const fin = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.72, 3), material);
      fin.rotation.z = side * Math.PI * 0.5;
      fin.rotation.x = Math.PI / 2;
      fin.position.set(0.15, -0.22, side * 0.55);
      group.add(fin);
    }

    const eyeMaterial = new THREE.MeshBasicMaterial({ color: 0x23395d });
    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 8), eyeMaterial);
      eye.position.set(0.7, 0.14, side * 0.55);
      group.add(eye);
    }
    group.add(this.createGlow());
    return group;
  }

  createTurtlePlaceholder() {
    const group = new THREE.Group();
    const material = this.createMaterial(0.9);
    const shellMaterial = new THREE.MeshPhysicalMaterial({
      color: this.config.colors.body,
      emissive: this.config.colors.glow,
      emissiveIntensity: 0.11,
      roughness: 0.38,
      transparent: true,
      opacity: 0.9
    });

    const shell = new THREE.Mesh(new THREE.SphereGeometry(0.72, 24, 16), shellMaterial);
    shell.scale.set(1.08, 0.4, 0.82);
    shell.position.y = 0.1;
    group.add(shell);

    const shellRim = new THREE.Mesh(
      new THREE.TorusGeometry(0.62, 0.055, 8, 24),
      new THREE.MeshStandardMaterial({
        color: this.config.colors.accent,
        emissive: this.config.colors.accent,
        emissiveIntensity: 0.15,
        transparent: true,
        opacity: 0.68
      })
    );
    shellRim.rotation.x = Math.PI / 2;
    shellRim.scale.x = 1.18;
    shellRim.position.y = 0.1;
    group.add(shellRim);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 16, 12), material);
    head.position.x = 0.9;
    head.scale.set(1.2, 0.85, 0.9);
    group.add(head);

    const eyeMaterial = new THREE.MeshBasicMaterial({ color: 0x163f47 });
    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.025, 7, 7), eyeMaterial);
      eye.position.set(1.1, 0.07, side * 0.15);
      group.add(eye);
    }

    const flipperPositions = [
      [0.45, -0.06, 0.65, 0.42],
      [0.45, -0.06, -0.65, -0.42],
      [-0.5, -0.04, 0.56, 0.2],
      [-0.5, -0.04, -0.56, -0.2]
    ];
    flipperPositions.forEach(([x, y, z, angle], index) => {
      const flipper = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 8), material);
      flipper.scale.set(index < 2 ? 1.25 : 0.85, 0.2, 0.45);
      flipper.position.set(x, y, z);
      flipper.rotation.y = angle;
      flipper.userData.flipper = true;
      flipper.userData.flipperPhase = index * 1.4;
      group.add(flipper);
    });
    group.add(this.createGlow());
    return group;
  }

  createGlow() {
    const glow = new THREE.PointLight(this.config.colors.glow, 1.35, 3);
    glow.position.set(0, 0.2, 0.55);
    return glow;
  }

  setPhotoMode(active) {
    this.photoMode = active;
  }

  setTrackingOpacity(opacity) {
    this.trackingOpacity = Math.max(0, Math.min(1, opacity));
  }

  setReaction(type = null, time = 0) {
    this.reaction.type = type;
    this.reaction.time = time;
  }

  reset() {
    this.timeOrigin = this.lastElapsed;
    this.setReaction();
    this.instances.forEach((instance, index) => this.applyMotion(instance, 0, index));
  }

  update(delta, elapsed) {
    this.lastElapsed = elapsed;
    const localElapsed = elapsed - this.timeOrigin;
    const photoTarget = this.photoMode ? 1 : 0;
    this.photoBlend += (photoTarget - this.photoBlend) * Math.min(1, delta * 4.8);

    this.instances.forEach((instance, index) => {
      instance.userData.mixers.forEach((mixer) => mixer.update(delta * this.config.animationSpeed));
      this.applyMotion(instance, localElapsed, index);
      this.applyPhotoPose(instance);
      this.animateParts(instance, localElapsed);
      this.applyReaction(instance);
      this.animateSprite(instance, localElapsed);
    });
  }

  applyReaction(instance) {
    const { type, time } = this.reaction;
    if (!type || !instance.userData.isSprite2D) return;

    if (type === 'jelly-balloon') {
      if (time < 0.22) {
        const progress = 1 - Math.pow(1 - time / 0.22, 3);
        instance.userData.choreoScale *= 1 + progress * 0.42;
        instance.position.y += progress * 0.08 * this.worldScale;
      } else if (time < 0.5) {
        const progress = (time - 0.22) / 0.28;
        instance.userData.choreoScale *= 1.42 - progress * 0.1;
        instance.position.x += Math.sin(progress * Math.PI) * 0.1 * this.worldScale;
        instance.position.y += (0.08 + progress * 1.25) * this.worldScale;
        instance.rotation.z += Math.sin(progress * Math.PI * 4) * 0.09;
      } else if (time < 0.94) {
        const progress = 1 - Math.pow(1 - (time - 0.5) / 0.44, 3);
        instance.position.x += Math.sin(progress * Math.PI) * -0.08 * this.worldScale;
        instance.position.y += (1 - progress) * 1.33 * this.worldScale;
        instance.userData.choreoScale *= 1.32 - progress * 0.32;
        instance.rotation.z += Math.sin(progress * Math.PI * 5) * (1 - progress) * 0.2;
      } else {
        const settle = Math.max(0, 1 - (time - 0.94) / 0.25);
        instance.rotation.z += Math.sin((time - 0.94) * 20) * settle * 0.1;
        instance.userData.choreoScale *= 1 - Math.sin((time - 0.94) * 14) * settle * 0.03;
      }
      return;
    }

    if (type === 'turtle-dizzy') {
      if (time < 0.7) {
        const progress = 1 - Math.pow(1 - time / 0.7, 3);
        instance.rotation.z += progress * Math.PI * 4.4;
        instance.userData.choreoScale *= 1 + Math.sin(progress * Math.PI * 5) * 0.045;
      } else if (time < 1.8) {
        const progress = (time - 0.7) / 1.1;
        instance.position.x += Math.sin(progress * Math.PI * 2.3) * 0.34 * this.worldScale;
        instance.position.y += Math.sin(progress * Math.PI) * -0.18 * this.worldScale;
        instance.rotation.z += Math.sin(progress * Math.PI * 3) * 0.26 * (1 - progress);
      } else {
        const settle = Math.max(0, 1 - (time - 1.8) / 0.52);
        instance.rotation.z += Math.sin((time - 1.8) * 16) * settle * 0.11;
      }
      return;
    }

    if (type === 'whale-surprised' && time > 0.72) {
      const glance = Math.min(1, (time - 0.72) / 0.28)
        * Math.max(0, 1 - (time - 2.55) / 0.55);
      instance.rotation.z += Math.sin((time - 0.72) * 2.2) * glance * 0.07;
    }
  }

  animateSprite(instance, elapsed) {
    const sprite = instance.userData.sprite;
    if (!sprite) return;
    const { motion, spriteIndex } = instance.userData;
    const phase = elapsed * motion.speed * 2.4 + motion.phase + spriteIndex * 0.35;
    const keepJellyfishSize = motion.type === 'jellyfish2d';
    const pulse = keepJellyfishSize ? 1 : 1 + Math.sin(phase * 2.2) * 0.025;
    const stretch = keepJellyfishSize ? 1 : 1 + Math.cos(phase * 1.7) * 0.018;
    const base = sprite.userData.baseScale;
    const choreoScale = instance.userData.choreoScale || 1;
    sprite.scale.set(base.x * pulse * choreoScale, base.y * stretch * choreoScale, 1);
    sprite.material.rotation = Math.sin(phase * 0.8) * 0.045;
    const choreoOpacity = instance.userData.choreoOpacity ?? 0.98;
    sprite.material.opacity = choreoOpacity * (0.975 + Math.sin(phase * 1.3) * 0.02) * this.trackingOpacity;
  }

  applyMotion(instance, elapsed, index) {
    const { motion, visual } = instance.userData;
    const t = elapsed * motion.speed + motion.phase;
    const [bx, by, bz] = motion.base;
    const [rx, ry, rz] = motion.range;

    if (motion.type === 'jellyfish2d') {
      const entranceDuration = 0.72;
      if (elapsed < entranceDuration) {
        const progress = Math.min(1, elapsed / entranceDuration);
        const eased = 1 - Math.pow(1 - progress, 3);
        instance.position.set(
          (bx - 0.42 * (1 - eased)) * this.worldScale,
          by * this.worldScale,
          bz * this.worldScale
        );
        instance.userData.choreoScale = 1;
        instance.userData.choreoOpacity = 0.2 + eased * 0.78;
      } else {
        const idleTime = elapsed - entranceDuration;
        const loop = idleTime * 0.62 + motion.phase;
        instance.position.set(
          (bx + Math.sin(loop) * rx) * this.worldScale,
          (by + Math.sin(loop * 1.37 + 0.7) * ry) * this.worldScale,
          bz * this.worldScale
        );
        instance.userData.choreoScale = 1;
        instance.userData.choreoOpacity = 0.98;
      }
      instance.rotation.set(0, 0, Math.sin(elapsed * 0.34) * 0.035);
      visual.position.y = Math.sin(elapsed * 0.72) * 0.018 * this.worldScale;
      return;
    }

    if (motion.type === 'whale2d') {
      const entrance = Math.min(1, elapsed / 0.72);
      const eased = 1 - Math.pow(1 - entrance, 3);
      const loop = t * 0.92;
      const leap = Math.pow(Math.max(0, Math.sin(loop * 0.5)), 8) * ry * 0.48;
      instance.position.set(
        (bx - 0.9 * (1 - eased) + Math.sin(loop) * rx) * this.worldScale,
        (by + Math.sin(loop * 2) * ry - leap) * this.worldScale,
        (bz + Math.cos(loop) * rz) * this.worldScale
      );
      instance.userData.choreoScale = 0.72 + eased * 0.28 + Math.sin(t * 1.4) * 0.025;
      instance.userData.choreoOpacity = 0.25 + eased * 0.73;
      instance.rotation.z = Math.cos(loop) * 0.09 - Math.sin(loop * 2) * 0.035;
      visual.position.y = Math.sin(t * 1.5) * 0.022 * this.worldScale;
      return;
    }

    if (motion.type === 'turtle2d') {
      const entrance = Math.min(1, elapsed / 0.78);
      const eased = 1 - Math.pow(1 - entrance, 3);
      const loop = t * 0.72;
      const cornerX = Math.tanh(Math.sin(loop) * 2.1);
      const cornerY = Math.tanh(Math.cos(loop) * 2.1);
      instance.position.set(
        (bx + 0.78 * (1 - eased) + cornerX * rx) * this.worldScale,
        (by + cornerY * ry + Math.sin(loop * 2) * 0.035) * this.worldScale,
        (bz + Math.cos(loop) * rz) * this.worldScale
      );
      instance.userData.choreoScale = 0.7 + eased * 0.3 + Math.sin(t * 1.2) * 0.02;
      instance.userData.choreoOpacity = 0.22 + eased * 0.76;
      instance.rotation.z = Math.cos(loop) * 0.1;
      visual.position.y = Math.sin(t * 1.25) * 0.018 * this.worldScale;
      return;
    }

    if (motion.type === 'whale') {
      instance.position.set(
        (bx + Math.sin(t) * rx) * this.worldScale,
        (by + Math.sin(t * 1.6) * ry) * this.worldScale,
        (bz + Math.cos(t) * rz) * this.worldScale
      );
      instance.rotation.y = Math.atan2(Math.cos(t) * rx, -Math.sin(t) * rz) - Math.PI / 2;
      instance.rotation.z = Math.sin(t * 1.2) * 0.08;
      visual.rotation.x = Math.sin(t * 1.5) * 0.06;
      return;
    }

    if (motion.type === 'turtle') {
      instance.position.set(
        (bx + Math.sin(t * 0.82) * rx) * this.worldScale,
        (by + Math.sin(t * 1.35) * ry) * this.worldScale,
        (bz + Math.sin(t * 0.54 + index) * rz) * this.worldScale
      );
      instance.rotation.y = Math.sin(t * 0.55) * 0.58;
      instance.rotation.z = Math.sin(t * 0.72) * 0.07;
      visual.rotation.x = Math.sin(t * 0.48) * 0.09;
      return;
    }

    instance.position.set(
      (bx + Math.sin(t * 0.73) * rx + Math.sin(t * 0.21 + index) * rx * 0.3) * this.worldScale,
      (by + Math.sin(t * 1.11) * ry) * this.worldScale,
      (bz + Math.cos(t * 0.61 + index * 0.7) * rz) * this.worldScale
    );
    instance.rotation.y = Math.sin(t * 0.49 + index) * 0.42;
    instance.rotation.z = Math.sin(t * 0.83 + index * 0.4) * 0.1;
    visual.position.y = Math.sin(t * 1.7) * 0.035 * this.worldScale;
    visual.rotation.x = Math.sin(t * 0.42) * 0.08;
  }

  applyPhotoPose(instance) {
    if (this.photoBlend < 0.005) return;
    const { motion } = instance.userData;
    const [x, y, z] = motion.photo;
    const target = new THREE.Vector3(x, y, z).multiplyScalar(this.worldScale);
    instance.position.lerp(target, this.photoBlend * 0.18);
    if (motion.type === 'whale') instance.rotation.y *= 1 - this.photoBlend * 0.15;
    if (motion.type === 'jellyfish') instance.rotation.y *= 1 - this.photoBlend * 0.4;
  }

  animateParts(instance, elapsed) {
    const t = elapsed * this.config.animationSpeed;
    instance.userData.visual.traverse((object) => {
      if (object.userData.tentaclePhase !== undefined) {
        object.rotation.y = Math.sin(t * 2.1 + object.userData.tentaclePhase) * 0.12;
      }
      if (object.userData.tail) {
        object.rotation.y = Math.sin(t * 3.2) * 0.28;
      }
      if (object.userData.flipper) {
        object.rotation.x = Math.sin(t * 2.1 + object.userData.flipperPhase) * 0.3;
      }
    });
  }

  getEffectSources() {
    return this.instances.map((instance) => instance.userData.sprite || instance);
  }
}
