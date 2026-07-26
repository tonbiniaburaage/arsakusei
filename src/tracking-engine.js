import * as THREE from 'three';
import { MindARThree } from 'mindar-image-three';
import { CreatureController } from './creature-controller.js';

export class TrackingEngine {
  constructor(container, config, callbacks = {}) {
    this.config = config;
    this.callbacks = callbacks;
    this.clock = new THREE.Clock();
    this.started = false;
    this.mindar = new MindARThree({
      container,
      imageTargetSrc: './assets/targets/demo-card.mind',
      maxTrack: 1,
      warmupTolerance: 3,
      missTolerance: 15,
      filterMinCF: 0.0008,
      filterBeta: 18,
      uiLoading: 'no',
      uiScanning: 'no',
      uiError: 'no'
    });

    this.renderer = this.mindar.renderer;
    this.scene = this.mindar.scene;
    this.camera = this.mindar.camera;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.anchor = this.mindar.addAnchor(0);
    this.world = new THREE.Group();
    this.world.position.z = 0.2;
    this.anchor.group.add(this.world);
    this.creature = new CreatureController(this.world, config, { worldScale: 0.42 });

    this.anchor.onTargetFound = () => this.callbacks.onTargetFound?.();
    this.anchor.onTargetLost = () => this.callbacks.onTargetLost?.();

    this.scene.add(new THREE.HemisphereLight(0xf3eaff, 0x122342, 2.6));
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(-2, 3, 4);
    this.scene.add(key);
  }

  async start() {
    const result = await this.creature.load();
    await this.mindar.start();
    this.started = true;
    this.renderer.setAnimationLoop(() => this.render());
    return { ...result, tracking: true };
  }

  render() {
    const delta = Math.min(this.clock.getDelta(), 0.05);
    this.creature.update(delta, this.clock.elapsedTime);
    this.renderer.render(this.scene, this.camera);
  }

  reset() {
    this.creature.reset();
  }

  stop() {
    this.renderer.setAnimationLoop(null);
    if (this.started) {
      this.mindar.stop();
      this.started = false;
    }
  }
}
