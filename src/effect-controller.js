import * as THREE from 'three';

export class EffectController {
  constructor(canvas, profile) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.profile = profile;
    this.camera = null;
    this.controllers = [];
    this.particles = [];
    this.photoMode = false;
    this.activeKey = null;
    this.tempWorld = new THREE.Vector3();
    this.resize = this.resize.bind(this);
    addEventListener('resize', this.resize);
    this.resize();
  }

  connect(camera, controllers) {
    this.camera = camera;
    this.controllers = controllers;
  }

  setActive(key) {
    this.activeKey = key;
  }

  setPhotoMode(active) {
    this.photoMode = active;
  }

  reset() {
    this.particles.length = 0;
    this.activeKey = null;
    this.clear();
  }

  resize() {
    this.width = innerWidth;
    this.height = innerHeight;
    const dpr = this.profile.pixelRatio;
    this.canvas.width = Math.floor(this.width * dpr);
    this.canvas.height = Math.floor(this.height * dpr);
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  update(delta) {
    this.clear();
    if (!this.camera) return;

    const candidates = this.controllers.filter(({ key }) => !this.activeKey || key === this.activeKey);
    for (const { key, controller } of candidates) {
      const config = controller.config;
      for (const source of controller.getEffectSources()) {
        if (!this.isVisible(source)) continue;
        const screen = this.project(source);
        if (!screen || screen.x < -40 || screen.x > this.width + 40 || screen.y < -40 || screen.y > this.height + 40) continue;
        const chance = delta * 13 * this.profile.spawnRate * (this.photoMode ? 2.5 : 1);
        if (Math.random() < chance) this.spawn(screen, config, key);
      }
    }

    for (const particle of this.particles) this.drawParticle(particle, delta);
    this.particles = this.particles.filter((particle) => particle.life > 0);
    if (this.particles.length > this.profile.maxParticles) {
      this.particles.splice(0, this.particles.length - this.profile.maxParticles);
    }
  }

  project(object) {
    object.getWorldPosition(this.tempWorld);
    this.tempWorld.project(this.camera);
    if (this.tempWorld.z < -1 || this.tempWorld.z > 1) return null;
    return {
      x: (this.tempWorld.x * 0.5 + 0.5) * this.width,
      y: (-this.tempWorld.y * 0.5 + 0.5) * this.height
    };
  }

  isVisible(object) {
    let current = object;
    while (current) {
      if (!current.visible) return false;
      current = current.parent;
    }
    return true;
  }

  spawn(screen, config, key) {
    const typeRoll = Math.random();
    const starRatio = config.effect.starRatio;
    const type = typeRoll < starRatio ? 'star' : typeRoll < 0.72 ? 'mote' : 'bubble';
    const color = config.effect.colors[Math.floor(Math.random() * config.effect.colors.length)];
    this.particles.push({
      key,
      type,
      color,
      x: screen.x + (Math.random() - 0.5) * 34,
      y: screen.y + (Math.random() - 0.5) * 26,
      vx: (Math.random() - 0.5) * 9,
      vy: -8 - Math.random() * 13,
      rotation: Math.random() * Math.PI * 2,
      spin: (Math.random() - 0.5) * 1.5,
      size: type === 'bubble' ? 3 + Math.random() * 8 : 2 + Math.random() * 5,
      life: 1,
      decay: 0.42 + Math.random() * 0.36
    });
  }

  drawParticle(particle, delta) {
    particle.x += particle.vx * delta;
    particle.y += particle.vy * delta;
    particle.rotation += particle.spin * delta;
    particle.life -= particle.decay * delta;
    const alpha = Math.max(0, particle.life);
    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = alpha * 0.78;
    ctx.translate(particle.x, particle.y);
    ctx.rotate(particle.rotation);
    ctx.shadowBlur = this.photoMode ? 13 : 8;
    ctx.shadowColor = particle.color;

    if (particle.type === 'bubble') {
      ctx.strokeStyle = particle.color;
      ctx.lineWidth = 1.25;
      ctx.beginPath();
      ctx.arc(0, 0, particle.size, 0, Math.PI * 2);
      ctx.stroke();
    } else if (particle.type === 'star') {
      ctx.fillStyle = particle.color;
      this.starPath(ctx, particle.size);
      ctx.fill();
    } else {
      ctx.fillStyle = particle.color;
      ctx.beginPath();
      ctx.arc(0, 0, particle.size * 0.52, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  starPath(ctx, radius) {
    ctx.beginPath();
    for (let index = 0; index < 8; index += 1) {
      const r = index % 2 ? radius * 0.36 : radius;
      const angle = -Math.PI / 2 + index * Math.PI / 4;
      const x = Math.cos(angle) * r;
      const y = Math.sin(angle) * r;
      index ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.closePath();
  }

  clear() {
    this.ctx.clearRect(0, 0, this.width, this.height);
  }
}
