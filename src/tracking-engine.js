import * as THREE from 'three';
import { MindARThree } from 'mindar-image-three';
import { CreatureController } from './creature-controller.js';
import { CREATURE_ORDER } from './creature-config.js';

export class TrackingEngine {
  constructor(container, configs, profile, effects, callbacks = {}) {
    this.container = container;
    this.configs = configs;
    this.profile = profile;
    this.effects = effects;
    this.callbacks = callbacks;
    this.clock = new THREE.Clock();
    this.started = false;
    this.activeKey = null;
    this.entries = [];

    this.mindar = new MindARThree({
      container,
      imageTargetSrc: './assets/targets/creature-targets.mind',
      maxTrack: 1,
      warmupTolerance: 4,
      missTolerance: 20,
      filterMinCF: 0.0007,
      filterBeta: 16,
      uiLoading: 'no',
      uiScanning: 'no',
      uiError: 'no'
    });

    this.renderer = this.mindar.renderer;
    this.scene = this.mindar.scene;
    this.camera = this.mindar.camera;
    this.renderer.setPixelRatio(profile.pixelRatio);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    CREATURE_ORDER.forEach((key) => this.addCreatureAnchor(key));
    this.effects.connect(this.camera, this.entries);

    this.scene.add(new THREE.HemisphereLight(0xf3eaff, 0x10213d, 2.55));
    const keyLight = new THREE.DirectionalLight(0xffffff, 2.2);
    keyLight.position.set(-2, 3, 4);
    this.scene.add(keyLight);
  }

  addCreatureAnchor(key) {
    const config = this.configs[key];
    const anchor = this.mindar.addAnchor(config.targetIndex);
    const world = new THREE.Group();
    world.position.z = 0.2;
    anchor.group.add(world);
    const controller = new CreatureController(world, config, { worldScale: 0.42 });
    const entry = { key, config, anchor, world, controller };
    this.entries.push(entry);

    anchor.onTargetFound = () => {
      this.activeKey = key;
      this.effects.setActive(key);
      this.callbacks.onTargetFound?.(key, config);
    };
    anchor.onTargetLost = () => {
      if (this.activeKey === key) {
        this.activeKey = null;
        this.effects.setActive(null);
      }
      this.callbacks.onTargetLost?.(key, config);
    };
  }

  async start() {
    const results = await Promise.all(this.entries.map(({ controller }) => controller.load()));
    await this.mindar.start();
    this.started = true;
    this.renderer.setAnimationLoop(() => this.render());
    return { results, tracking: true };
  }

  render() {
    const delta = Math.min(this.clock.getDelta(), 0.05);
    const elapsed = this.clock.elapsedTime;
    this.entries.forEach(({ controller }) => controller.update(delta, elapsed));
    this.renderer.render(this.scene, this.camera);
    this.effects.update(delta);
  }

  renderOnce() {
    this.renderer.render(this.scene, this.camera);
  }

  setPhotoMode(active) {
    this.entries.forEach(({ key, controller }) => {
      controller.setPhotoMode(active && (!this.activeKey || key === this.activeKey));
    });
    this.effects.setPhotoMode(active);
  }

  reset() {
    const active = this.entries.find(({ key }) => key === this.activeKey);
    if (active) active.controller.reset();
    else this.entries.forEach(({ controller }) => controller.reset());
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
    this.effects.reset();
  }
}
