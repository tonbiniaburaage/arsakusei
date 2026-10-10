import * as THREE from 'three';
import { MindARThree } from 'mindar-image-three';
import { CreatureController } from './creature-controller.js?v=20261010-apriltag1';
import { AprilTagMarkerDetector } from './apriltag-marker-detector.js?v=20261010-apriltag1';

const TARGETS = [
  { key: 'jellyfish', targetIndex: 0, offset: [0, 0, 0.2], sizeCorrection: 1 },
  { key: 'whale', targetIndex: 1, offset: [0, 0, 0.2], sizeCorrection: 1 },
  { key: 'turtle', targetIndex: 2, offset: [0, 0, 0.2], sizeCorrection: 1 },
  // 模型を置く右側が白い補助カードも同じ生き物として認識する。
  { key: 'jellyfish', targetIndex: 3, offset: [0, 0, 0.2], sizeCorrection: 1 },
  { key: 'whale', targetIndex: 4, offset: [0, 0, 0.2], sizeCorrection: 1 },
  { key: 'turtle', targetIndex: 5, offset: [0, 0, 0.2], sizeCorrection: 1 }
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
    this.modelVideo = null;
    this.modelDetector = new AprilTagMarkerDetector();
    this.modelLastSeen = -Infinity;
    this.modelHoldSeconds = 2.8;
    this.roughEntries = new Map();
    this.gameLockedKey = null;
    this.releaseTimer = null;
    this.lossHoldMs = 2800;
    this.lossFadeMs = 700;
    this.stateRetentionMs = 7000;
    this.smoothingPosition = new THREE.Vector3();
    this.smoothingQuaternion = new THREE.Quaternion();
    this.smoothingScale = new THREE.Vector3();
    this.mindar = new MindARThree({
      container,
      imageTargetSrc: './assets/targets/creature-targets.mind?v=20261010-ipad-models3',
      maxTrack: 1,
      // 旧カードも引き続き利用できるように残す。新しい小型マーカーは
      // WebAssemblyのAprilTag検出器で連続2回読み取って起動する。
      warmupTolerance: 2,
      missTolerance: 68,
      filterMinCF: 0.0012,
      filterBeta: 2.2,
      uiLoading: 'no',
      uiScanning: 'no',
      uiError: 'no'
    });
    // 展示ではiPadの画面側に模型を置くため、内カメラを明示的に使う。
    this.mindar.shouldFaceUser = true;

    this.renderer = this.mindar.renderer;
    this.scene = this.mindar.scene;
    this.camera = this.mindar.camera;
    this.renderer.setPixelRatio(profile.pixelRatio);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    TARGETS.forEach((target) => this.addCreatureAnchor(target));
    this.addModelFallbacks();
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
      if (this.gameLockedKey && this.gameLockedKey !== key) return;
      if (!this.gameLockedKey && this.effects.collectedStamps?.has(key)) return;
      const resumedDuringGrace = this.activeEntry === entry && smoothRoot.visible;
      const handoffEntry = this.activeEntry !== entry
        && this.activeEntry?.key === key
        && this.activeEntry?.smoothRoot?.visible
        ? this.activeEntry
        : null;
      const resumeGame = this.effects.activeKey === key;
      if (handoffEntry) {
        smoothRoot.position.copy(handoffEntry.smoothRoot.position);
        smoothRoot.quaternion.copy(handoffEntry.smoothRoot.quaternion);
        smoothRoot.scale.copy(handoffEntry.smoothRoot.scale);
        entry.initialized = true;
      }
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
      if (!resumedDuringGrace && !handoffEntry) entry.initialized = false;
      smoothRoot.visible = true;
      controller.setTrackingOpacity(1);
      this.hideModelFallbacks();
      this.activeKey = key;
      this.activeEntry = entry;
      this.gameLockedKey = key;
      this.effects.clearMarkerAnchor?.();
      if (!resumedDuringGrace && !handoffEntry && !resumeGame) controller.reset();
      this.effects.setActive(key);
      if (!resumedDuringGrace && !handoffEntry) this.callbacks.onTargetFound?.(key, config);
      if (!resumedDuringGrace && !handoffEntry && resumeGame) this.effects.notifyGame();
    };
    anchor.onTargetLost = () => {
      entry.tracked = false;
      if (this.gameLockedKey === key) {
        // ゲーム開始後はスタンプ取得まで、最後に認識した位置で演出を継続する。
        entry.lossStartedAt = performance.now();
        controller.setTrackingOpacity(1);
        smoothRoot.visible = true;
        return;
      }
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

  addModelFallbacks() {
    for (const config of Object.values(this.configs)) {
      const world = new THREE.Group();
      world.visible = false;
      world.position.z = -4;
      this.camera.add(world);
      const controller = new CreatureController(world, config, { worldScale: 0.8 });
      const entry = {
        key: config.key,
        config,
        targetIndex: -1,
        anchor: null,
        world,
        controller,
        rough: true,
        tracked: false
      };
      this.roughEntries.set(config.key, entry);
      this.entries.push(entry);
    }
    this.scene.add(this.camera);
  }

  async start() {
    const [results] = await Promise.all([
      Promise.all(this.entries.map(({ controller }) => controller.load())),
      this.modelDetector.initialize()
    ]);
    await this.mindar.start();
    this.modelVideo = this.getCaptureSources().video;
    await this.tuneCameraForKiosk(this.modelVideo);
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
    this.updateModelDetection(elapsed);
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
        if (this.gameLockedKey === entry.key) {
          entry.controller.setTrackingOpacity(1);
          entry.smoothRoot.visible = true;
          continue;
        }
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
      const deadZone = 0.006;
      if (distance > deadZone) {
        // 小刻みな手ブレには追従せず、大きく構え直した時だけ少し速く戻す。
        const cutoff = distance > 0.16 ? 1.8 : 0.72;
        const alpha = 1 - Math.exp(-Math.PI * 2 * cutoff * delta);
        entry.smoothRoot.position.lerp(this.smoothingPosition, alpha);
      }
      const rotationDistance = entry.smoothRoot.quaternion.angleTo(this.smoothingQuaternion);
      if (rotationDistance > 0.025) {
        const rotationCutoff = rotationDistance > 0.35 ? 1.55 : 0.68;
        const rotationAlpha = 1 - Math.exp(-Math.PI * 2 * rotationCutoff * delta);
        entry.smoothRoot.quaternion.slerp(this.smoothingQuaternion, rotationAlpha);
      }
      // 認識ノイズによる拡大・縮小を防ぐため、初回取得後のスケールは固定する。
    }
  }

  updateModelDetection(elapsed) {
    const exactActive = this.activeEntry && !this.activeEntry.rough;
    if (exactActive) {
      this.modelDetector.reset();
      this.hideModelFallbacks();
      return;
    }
    if (this.gameLockedKey) return;

    const video = this.modelVideo || this.getCaptureSources().video;
    if (!video || video.readyState < 2 || !video.videoWidth) return;
    this.modelVideo = video;
    const match = this.modelDetector.scan(video, elapsed);
    if (match) {
      this.modelLastSeen = elapsed;
      this.showModelFallback(match);
      return;
    }

    if (this.activeEntry?.rough && elapsed - this.modelLastSeen > this.modelHoldSeconds) {
      const { key, config } = this.activeEntry;
      this.hideModelFallbacks();
      this.activeEntry = null;
      this.activeKey = null;
      this.effects.setActive(null);
      this.callbacks.onTargetLost?.(key, config);
    }
  }

  showModelFallback(match) {
    if (this.gameLockedKey && this.gameLockedKey !== match.key) return;
    if (this.effects.collectedStamps?.has(match.key)) return;
    const entry = this.roughEntries.get(match.key);
    if (!entry) return;
    this.hideModelFallbacks(entry);
    const depth = 4;
    const projection = this.camera.projectionMatrix.elements;
    const x = (match.x - 0.5) * 2 * depth / projection[0];
    const y = (0.5 - match.y) * 2 * depth / projection[5];
    const target = this.smoothingPosition.set(x, y, -depth);
    if (!entry.world.visible) entry.world.position.copy(target);
    else if (entry.world.position.distanceToSquared(target) > 0.0036) entry.world.position.lerp(target, 0.08);

    if (!entry.world.visible) {
      entry.world.visible = true;
      entry.controller.reset();
    }
    entry.tracked = true;
    if (this.activeEntry !== entry) {
      this.activeEntry = entry;
      this.activeKey = entry.key;
      this.gameLockedKey = entry.key;
      this.effects.setMarkerAnchor?.(entry.key, entry.config, match);
      this.effects.setActive(entry.key);
      this.callbacks.onTargetFound?.(entry.key, entry.config, {
        marker: true,
        tagId: match.tagId,
        confidence: match.confidence
      });
    } else {
      this.effects.setMarkerAnchor?.(entry.key, entry.config, match);
    }
  }

  hideModelFallbacks(except = null) {
    for (const entry of this.roughEntries.values()) {
      if (entry === except) continue;
      entry.world.visible = false;
      entry.tracked = false;
    }
  }

  releaseGameLock(key) {
    if (this.gameLockedKey !== key) return;
    this.gameLockedKey = null;
    this.modelDetector.reset();
    this.modelLastSeen = this.clock.elapsedTime;
    if (this.releaseTimer) clearTimeout(this.releaseTimer);
    const entry = this.activeEntry;
    if (!entry || entry.key !== key || entry.tracked) return;
    this.releaseTimer = setTimeout(() => {
      this.releaseTimer = null;
      if (this.gameLockedKey || this.activeEntry !== entry || entry.tracked) return;
      entry.controller.setTrackingOpacity?.(0);
      if (entry.smoothRoot) entry.smoothRoot.visible = false;
      if (entry.world) entry.world.visible = false;
      this.activeEntry = null;
      this.activeKey = null;
      this.effects.setActive(null);
      this.callbacks.onTargetLost?.(key, entry.config);
    }, 900);
  }

  async tuneCameraForKiosk(video) {
    const track = video?.srcObject?.getVideoTracks?.()[0];
    if (!track?.applyConstraints) return;
    try {
      const capabilities = track.getCapabilities?.() || {};
      const continuous = {};
      for (const name of ['exposureMode', 'focusMode', 'whiteBalanceMode']) {
        if (Array.isArray(capabilities[name]) && capabilities[name].includes('continuous')) {
          continuous[name] = 'continuous';
        }
      }
      const constraints = { frameRate: { ideal: 30, max: 30 } };
      if (Object.keys(continuous).length) constraints.advanced = [continuous];
      await track.applyConstraints(constraints);
    } catch (error) {
      console.info('カメラの常設向け自動調整は端末標準設定を使用します。', error);
    }
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
    this.hideModelFallbacks();
    this.modelDetector.stop();
    this.gameLockedKey = null;
    if (this.releaseTimer) clearTimeout(this.releaseTimer);
    this.releaseTimer = null;
    this.entries.forEach((entry) => {
      if (entry.lossTimer) clearTimeout(entry.lossTimer);
      if (entry.stateTimer) clearTimeout(entry.stateTimer);
      entry.lossTimer = null;
      entry.stateTimer = null;
    });
    this.effects.reset();
  }
}
