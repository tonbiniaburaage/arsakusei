import * as THREE from 'three';
import { CreatureController } from './creature-controller.js';

export class AREngine {
  constructor(container, config) {
    this.container = container;
    this.config = config;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(48, innerWidth / innerHeight, 0.01, 100);
    this.clock = new THREE.Clock();
    this.renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      preserveDrawingBuffer: true,
      powerPreference: 'high-performance'
    });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.6));
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.container.appendChild(this.renderer.domElement);
    this.world = new THREE.Group();
    this.world.position.z = -4;
    this.scene.add(this.world);
    this.creature = new CreatureController(this.world, config, { worldScale: 0.8 });

    this.scene.add(new THREE.HemisphereLight(0xece5ff, 0x18294e, 2.4));
    const key = new THREE.DirectionalLight(0xffffff, 2.5);
    key.position.set(-2, 3, 4);
    this.scene.add(key);

    this.resize = this.resize.bind(this);
    addEventListener('resize', this.resize);
  }

  async start() {
    const result = await this.creature.load();
    this.renderer.setAnimationLoop(() => this.render());
    return { ...result, tracking: false };
  }

  render() {
    const delta = Math.min(this.clock.getDelta(), 0.05);
    this.creature.update(delta, this.clock.elapsedTime);
    this.renderer.render(this.scene, this.camera);
  }

  resize() {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.6));
    this.renderer.setSize(innerWidth, innerHeight);
  }
}
