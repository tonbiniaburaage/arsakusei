import * as THREE from 'three';
import { CreatureController } from './creature-controller.js?v=20260730-comic-v4';

export class AREngine {
  constructor(container, config, profile, effects) {
    this.container = container;
    this.config = config;
    this.profile = profile;
    this.effects = effects;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(48, innerWidth / innerHeight, 0.01, 100);
    this.clock = new THREE.Clock();
    this.lastFrameAt = -Infinity;
    this.frameInterval = profile.maxFPS ? 1000 / profile.maxFPS : 0;
    this.renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: !profile.lowPower,
      powerPreference: 'high-performance'
    });
    this.renderer.setPixelRatio(profile.pixelRatio);
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.container.appendChild(this.renderer.domElement);

    this.world = new THREE.Group();
    this.world.position.z = -4;
    this.scene.add(this.world);
    this.creature = new CreatureController(this.world, config, { worldScale: 0.8 });
    this.effects.connect(this.camera, [{ key: config.key, controller: this.creature }]);
    this.effects.setActive(config.key);

    this.scene.add(new THREE.HemisphereLight(0xece5ff, 0x18294e, 2.4));
    const keyLight = new THREE.DirectionalLight(0xffffff, 2.5);
    keyLight.position.set(-2, 3, 4);
    this.scene.add(keyLight);

    this.resize = this.resize.bind(this);
    addEventListener('resize', this.resize);
  }

  async start() {
    const result = await this.creature.load();
    this.renderer.setAnimationLoop((timestamp) => this.render(timestamp));
    return { ...result, tracking: false };
  }

  render(timestamp = performance.now()) {
    if (this.frameInterval && timestamp - this.lastFrameAt < this.frameInterval) return;
    this.lastFrameAt = timestamp;
    const delta = Math.min(this.clock.getDelta(), 0.05);
    this.creature.update(delta, this.clock.elapsedTime);
    this.renderer.render(this.scene, this.camera);
    this.effects.update(delta);
  }

  renderOnce() {
    this.renderer.render(this.scene, this.camera);
  }

  setPhotoMode(active) {
    this.creature.setPhotoMode(active);
    this.effects.setPhotoMode(active);
  }

  reset() {
    this.creature.reset();
  }

  getCaptureSources() {
    return { video: null, webglCanvas: this.renderer.domElement };
  }

  resize() {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(this.profile.pixelRatio);
    this.renderer.setSize(innerWidth, innerHeight);
  }

  stop() {
    this.renderer.setAnimationLoop(null);
    removeEventListener('resize', this.resize);
    this.effects.reset();
  }
}
