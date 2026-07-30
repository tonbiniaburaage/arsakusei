import * as THREE from 'three';
import { MindARThree } from 'mindar-image-three';
import { CreatureController } from './creature-controller.js?v=20260730-autoquality';

const TARGETS = [
  { key: 'jellyfish', targetIndex: 0, offset: [0, 0, 0.2], sizeCorrection: 1 },
  { key: 'whale', targetIndex: 1, offset: [0, 0, 0.2], sizeCorrection: 1 },
  { key: 'turtle', targetIndex: 2, offset: [0, 0, 0.2], sizeCorrection: 1 },
  // 同じカードの部分画像。斜めからカードの左側／下側だけ見えた場合にも使う。
  // 左側ターゲットは幅390px、元カードは幅900px。座標系の幅差を補正して同じ表示サイズにする。
  { key: 'jellyfish', targetIndex: 3, offset: [0.64, 0, 0.2], sizeCorrection: 900 / 390 },
  { key: 'jellyfish', targetIndex: 4, offset: [0, 0.18, 0.2], sizeCorrection: 1 }
];

export class TrackingEngine {
  constructor(container, configs, profile, effects, callbacks = {}) {
    this.container = container;
    this.configs = configs;
    this.profile = profile;
    this.effects = effects;
    this.callbacks = callbacks;
    this.clock = new THREE.Clock();
    this.lastFrameAt = -Infinity;
    this.frameInterval = profile.maxFPS ? 1000 / profile.maxFPS : 0;
    this.started = false;
    this.activeKey = null;
    this.activeEntry = null;
    this.entries = [];
    this.roughVideo = null;
    this.roughLastCheck = 0;
    this.roughStableFrames = 0;
    this.roughLastSeen = -Infinity;
    this.roughHoldSeconds = 3.8;
    this.lossHoldMs = 1800;
    this.lossFadeMs = 500;
    this.stateRetentionMs = 5000;
    this.smoothingPosition = new THREE.Vector3();
    this.smoothingQuaternion = new THREE.Quaternion();
    this.smoothingScale = new THREE.Vector3();
    this.scanCanvas = document.createElement('canvas');
    this.scanCanvas.width = 120;
    this.scanCanvas.height = 90;
    this.scanContext = this.scanCanvas.getContext('2d', {
      alpha: false,
      willReadFrequently: true
    });

    this.mindar = new MindARThree({
      container,
      imageTargetSrc: './assets/targets/creature-targets.mind?v=20260729-whitecards',
      maxTrack: 1,
      warmupTolerance: 2,
      missTolerance: 35,
      filterMinCF: 0.0015,
      filterBeta: 2.5,
      uiLoading: 'no',
      uiScanning: 'no',
      uiError: 'no'
    });

    this.renderer = this.mindar.renderer;
    this.scene = this.mindar.scene;
    this.camera = this.mindar.camera;
    this.renderer.setPixelRatio(profile.pixelRatio);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    TARGETS.forEach((target) => this.addCreatureAnchor(target));
    this.addRoughFallback();
    this.effects.connect(this.camera, this.entries);

    this.scene.add(new THREE.HemisphereLight(0xf3eaff, 0x10213d, 2.55));
    const keyLight = new THREE.DirectionalLight(0xffffff, 2.2);
    keyLight.position.set(-2, 3, 4);
    this.scene.add(keyLight);
  }

  addCreatureAnchor({ key, targetIndex, offset, sizeCorrection = 1 }) {
    const config = this.configs[key];
    const anchor = this.mindar.addAnchor(targetIndex);
    const smoothRoot = new THREE.Group();
    smoothRoot.visible = false;
    this.scene.add(smoothRoot);
    const world = new THREE.Group();
    world.position.set(...offset);
    smoothRoot.add(world);
    const controller = new CreatureController(world, config, {
      worldScale: 0.42 * sizeCorrection
    });
    const entry = {
      key,
      config,
      targetIndex,
      sizeCorrection,
      anchor,
      smoothRoot,
      world,
      controller,
      rough: false,
      tracked: false,
      initialized: false,
      lossTimer: null,
      stateTimer: null,
      lossStartedAt: 0
    };
    this.entries.push(entry);

    anchor.onTargetFound = () => {
      const resumedDuringGrace = this.activeEntry === entry && smoothRoot.visible;
      const resumeGame = this.effects.activeKey === key;
      this.hideCompetingExactEntries(entry);
      if (entry.lossTimer) {
        clearTimeout(entry.lossTimer);
        entry.lossTimer = null;
      }
      if (entry.stateTimer) {
        clearTimeout(entry.stateTimer);
        entry.stateTimer = null;
      }
      entry.lossStartedAt = 0;
      entry.tracked = true;
      if (!resumedDuringGrace) entry.initialized = false;
      smoothRoot.visible = true;
      controller.setTrackingOpacity(1);
      this.hideRoughFallback();
      this.activeKey = key;
      this.activeEntry = entry;
      if (!resumedDuringGrace && !resumeGame) controller.reset();
      this.effects.setActive(key);
      if (!resumedDuringGrace) this.callbacks.onTargetFound?.(key, config);
      if (!resumedDuringGrace && resumeGame) this.effects.notifyGame();
    };
    anchor.onTargetLost = () => {
      entry.tracked = false;
      if (entry.lossTimer) clearTimeout(entry.lossTimer);
      if (entry.stateTimer) clearTimeout(entry.stateTimer);
      entry.lossStartedAt = performance.now();
      entry.lossTimer = setTimeout(() => {
        entry.lossTimer = null;
        if (entry.tracked) return;
        controller.setTrackingOpacity(0);
        smoothRoot.visible = false;
        if (this.activeEntry !== entry) return;
        this.activeKey = null;
        this.activeEntry = null;
        this.callbacks.onTargetLost?.(key, config);
      }, this.lossHoldMs + this.lossFadeMs);
      entry.stateTimer = setTimeout(() => {
        entry.stateTimer = null;
        if (entry.tracked || this.activeEntry?.key === key) return;
        if (this.effects.activeKey === key) this.effects.setActive(null);
      }, this.stateRetentionMs);
    };
  }

  hideCompetingExactEntries(nextEntry) {
    for (const entry of this.entries) {
      if (entry === nextEntry || entry.rough || !entry.smoothRoot) continue;
      if (entry.lossTimer) clearTimeout(entry.lossTimer);
      if (entry.stateTimer) clearTimeout(entry.stateTimer);
      entry.lossTimer = null;
      entry.stateTimer = null;
      entry.tracked = false;
      entry.lossStartedAt = 0;
      entry.controller.setTrackingOpacity(0);
      entry.smoothRoot.visible = false;
    }
  }

  addRoughFallback() {
    const config = this.configs.jellyfish;
    const world = new THREE.Group();
    world.visible = false;
    world.position.z = -4;
    this.camera.add(world);
    this.scene.add(this.camera);
    const controller = new CreatureController(world, config, { worldScale: 0.8 });
    this.roughEntry = {
      key: 'jellyfish',
      config,
      targetIndex: -1,
      anchor: null,
      world,
      controller,
      rough: true
    };
    this.entries.push(this.roughEntry);
  }

  async start() {
    const results = await Promise.all(this.entries.map(({ controller }) => controller.load()));
    await this.mindar.start();
    this.roughVideo = this.getCaptureSources().video;
    this.started = true;
    this.renderer.setAnimationLoop((timestamp) => this.render(timestamp));
    return { results, tracking: true };
  }

  render(timestamp = performance.now()) {
    if (this.frameInterval && timestamp - this.lastFrameAt < this.frameInterval) return;
    this.lastFrameAt = timestamp;
    const delta = Math.min(this.clock.getDelta(), 0.05);
    const elapsed = this.clock.elapsedTime;
    this.updateSmoothedAnchors(delta);
    this.updateRoughDetection(elapsed);
    this.entries.forEach(({ controller }) => controller.update(delta, elapsed));
    this.renderer.render(this.scene, this.camera);
    this.effects.update(delta);
  }

  renderOnce() {
    this.renderer.render(this.scene, this.camera);
  }

  setPhotoMode(active) {
    this.entries.forEach(({ key, controller }) => {
      controller.setPhotoMode(active && (!this.activeEntry || controller === this.activeEntry.controller));
    });
    this.effects.setPhotoMode(active);
  }

  reset() {
    if (this.activeEntry) this.activeEntry.controller.reset();
    else this.entries.forEach(({ controller }) => controller.reset());
  }

  updateSmoothedAnchors(delta) {
    this.scene.updateMatrixWorld(true);
    for (const entry of this.entries) {
      if (entry.rough || !entry.smoothRoot) continue;
      if (!entry.tracked) {
        if (entry.lossStartedAt && entry.smoothRoot.visible) {
          const lostFor = performance.now() - entry.lossStartedAt;
          const fadeProgress = Math.max(0, Math.min(1, (lostFor - this.lossHoldMs) / this.lossFadeMs));
          entry.controller.setTrackingOpacity(1 - fadeProgress);
        }
        continue;
      }
      entry.controller.setTrackingOpacity(1);
      entry.anchor.group.getWorldPosition(this.smoothingPosition);
      entry.anchor.group.getWorldQuaternion(this.smoothingQuaternion);
      entry.anchor.group.getWorldScale(this.smoothingScale);

      if (!entry.initialized) {
        entry.smoothRoot.position.copy(this.smoothingPosition);
        entry.smoothRoot.quaternion.copy(this.smoothingQuaternion);
        entry.smoothRoot.scale.copy(this.smoothingScale);
        entry.initialized = true;
        continue;
      }

      const distance = entry.smoothRoot.position.distanceTo(this.smoothingPosition);
      const deadZone = 0.0024;
      if (distance > deadZone) {
        const speed = distance / Math.max(delta, 0.001);
        const cutoff = 2.2 + Math.min(8.5, speed * 5.5);
        const alpha = 1 - Math.exp(-Math.PI * 2 * cutoff * delta);
        entry.smoothRoot.position.lerp(this.smoothingPosition, alpha);
      }
      const rotationAlpha = 1 - Math.exp(-Math.PI * 2 * 2.8 * delta);
      entry.smoothRoot.quaternion.slerp(this.smoothingQuaternion, rotationAlpha);
      entry.smoothRoot.scale.lerp(this.smoothingScale, Math.min(1, rotationAlpha * 0.72));
    }
  }

  updateRoughDetection(elapsed) {
    if (!this.scanContext || elapsed - this.roughLastCheck < 0.18) return;
    this.roughLastCheck = elapsed;

    const exactActive = this.activeEntry && !this.activeEntry.rough;
    if (exactActive) {
      this.roughStableFrames = 0;
      this.hideRoughFallback();
      return;
    }

    const video = this.roughVideo || this.getCaptureSources().video;
    if (!video || video.readyState < 2 || !video.videoWidth) return;
    this.roughVideo = video;

    let imageData;
    try {
      this.scanContext.drawImage(video, 0, 0, this.scanCanvas.width, this.scanCanvas.height);
      imageData = this.scanContext.getImageData(0, 0, this.scanCanvas.width, this.scanCanvas.height);
    } catch {
      return;
    }

    const match = this.findPurpleArea(imageData);
    if (match) {
      this.roughStableFrames = Math.min(6, this.roughStableFrames + 1);
      this.roughLastSeen = elapsed;
      if (this.roughStableFrames >= 3) this.showRoughFallback(match);
      return;
    }

    this.roughStableFrames = Math.max(0, this.roughStableFrames - 1);
    if (this.activeEntry?.rough && elapsed - this.roughLastSeen > this.roughHoldSeconds) {
      const { key, config } = this.roughEntry;
      this.hideRoughFallback();
      this.activeEntry = null;
      this.activeKey = null;
      this.effects.setActive(null);
      this.callbacks.onTargetLost?.(key, config);
    }
  }

  findPurpleArea(imageData) {
    const { data, width, height } = imageData;
    let count = 0;
    let sumX = 0;
    let sumY = 0;
    let minX = width;
    let minY = height;
    let maxX = 0;
    let maxY = 0;

    for (let y = 0; y < height; y += 2) {
      for (let x = 0; x < width; x += 2) {
        const offset = (y * width + x) * 4;
        const red = data[offset];
        const green = data[offset + 1];
        const blue = data[offset + 2];
        const chroma = Math.max(red, green, blue) - Math.min(red, green, blue);
        const purple = blue > 72
          && red > 62
          && blue > green * 1.08
          && red > green * 0.9
          && chroma > 14;
        if (!purple) continue;
        count += 1;
        sumX += x;
        sumY += y;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }

    const spreadX = maxX - minX;
    const spreadY = maxY - minY;
    if (count < 82 || spreadX < 14 || spreadY < 10) return null;
    return {
      x: sumX / count / width,
      y: sumY / count / height,
      coverage: count / (width * height / 4)
    };
  }

  showRoughFallback(match) {
    const entry = this.roughEntry;
    const depth = 4;
    const projection = this.camera.projectionMatrix.elements;
    const x = (match.x - 0.5) * 2 * depth / projection[0];
    const y = (0.5 - match.y) * 2 * depth / projection[5];
    const target = this.smoothingPosition.set(x, y, -depth);
    if (!entry.world.visible) entry.world.position.copy(target);
    else if (entry.world.position.distanceToSquared(target) > 0.0005) entry.world.position.lerp(target, 0.18);

    if (!entry.world.visible) {
      entry.world.visible = true;
      entry.controller.reset();
    }
    if (this.activeEntry !== entry) {
      this.activeEntry = entry;
      this.activeKey = entry.key;
      this.effects.setActive(entry.key);
      this.callbacks.onTargetFound?.(entry.key, entry.config, { rough: true });
    }
  }

  hideRoughFallback() {
    if (this.roughEntry) this.roughEntry.world.visible = false;
  }

  getCaptureSources() {
    const videos = [...document.querySelectorAll('video')];
    const video = videos.find((candidate) => candidate.srcObject && candidate.videoWidth > 0) || null;
    return { video, webglCanvas: this.renderer.domElement };
  }

  stop() {
    this.renderer.setAnimationLoop(null);
    if (this.started) {
      this.mindar.stop();
      this.started = false;
    }
    this.hideRoughFallback();
    this.entries.forEach((entry) => {
      if (entry.lossTimer) clearTimeout(entry.lossTimer);
      if (entry.stateTimer) clearTimeout(entry.stateTimer);
      entry.lossTimer = null;
      entry.stateTimer = null;
    });
    this.effects.reset();
  }
}
