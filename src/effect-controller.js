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
    this.elapsed = 0;
    this.tempWorld = new THREE.Vector3();
    this.tempScale = new THREE.Vector3();
    this.tempCamera = new THREE.Vector3();
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
    this.elapsed = 0;
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
    this.elapsed += delta;

    const candidates = this.controllers.filter(({ key }) => !this.activeKey || key === this.activeKey);
    for (const { key, controller } of candidates) {
      const config = controller.config;
      const sources = controller.getEffectSources();
      sources.forEach((source, sourceIndex) => {
        if (!this.isVisible(source)) return;
        const screen = this.project(source);
        if (!screen || screen.x < -40 || screen.x > this.width + 40 || screen.y < -40 || screen.y > this.height + 40) return;

        if (config.renderMode === 'sprite2d') {
          this.drawDreamAura(screen, sourceIndex, config);
          const chance = delta * 34 * this.profile.spawnRate * (this.photoMode ? 2.7 : 1);
          if (Math.random() < chance) {
            const burst = this.photoMode ? 3 : 2;
            for (let index = 0; index < burst; index += 1) {
              this.spawn(screen, config, key, Math.max(34, screen.size * 0.58), true);
            }
          }
        } else {
          const chance = delta * 13 * this.profile.spawnRate * (this.photoMode ? 2.5 : 1);
          if (Math.random() < chance) this.spawn(screen, config, key);
        }
      });
    }

    for (const particle of this.particles) this.drawParticle(particle, delta);
    this.particles = this.particles.filter((particle) => particle.life > 0);
    if (this.particles.length > this.profile.maxParticles) {
      this.particles.splice(0, this.particles.length - this.profile.maxParticles);
    }
  }

  project(object) {
    object.getWorldPosition(this.tempWorld);
    this.tempCamera.copy(this.tempWorld).applyMatrix4(this.camera.matrixWorldInverse);
    const cameraDepth = Math.max(0.01, Math.abs(this.tempCamera.z));
    object.getWorldScale(this.tempScale);
    const projectedSize = Math.abs(
      this.tempScale.y * this.height * this.camera.projectionMatrix.elements[5] / (cameraDepth * 2)
    );
    this.tempWorld.project(this.camera);
    if (this.tempWorld.z < -1 || this.tempWorld.z > 1) return null;
    return {
      x: (this.tempWorld.x * 0.5 + 0.5) * this.width,
      y: (-this.tempWorld.y * 0.5 + 0.5) * this.height,
      size: Math.max(48, Math.min(360, projectedSize))
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

  spawn(screen, config, key, radius = 34, dreamy = false) {
    const typeRoll = Math.random();
    const starRatio = config.effect.starRatio;
    const type = dreamy && typeRoll > 0.82
      ? 'spark'
      : typeRoll < starRatio ? 'star' : typeRoll < 0.72 ? 'mote' : 'bubble';
    const color = config.effect.colors[Math.floor(Math.random() * config.effect.colors.length)];
    this.particles.push({
      key,
      type,
      color,
      x: screen.x + (Math.random() - 0.5) * radius * 1.5,
      y: screen.y + (Math.random() - 0.5) * radius * 1.15,
      vx: (Math.random() - 0.5) * (dreamy ? 18 : 9),
      vy: -8 - Math.random() * (dreamy ? 22 : 13),
      rotation: Math.random() * Math.PI * 2,
      spin: (Math.random() - 0.5) * 1.5,
      size: type === 'bubble' ? 3 + Math.random() * 10 : 2.5 + Math.random() * (dreamy ? 7 : 5),
      life: 1,
      decay: 0.38 + Math.random() * 0.34
    });
  }

  drawDreamAura(screen, index, config) {
    const ctx = this.ctx;
    const radius = Math.max(44, screen.size * 0.58);
    const time = this.elapsed + index * 1.37;
    const pulse = 1 + Math.sin(time * 2.1) * 0.055;

    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.translate(screen.x, screen.y);
    ctx.rotate(Math.sin(time * 0.62) * 0.08);

    const aura = ctx.createRadialGradient(0, 0, radius * 0.16, 0, 0, radius * 1.18 * pulse);
    aura.addColorStop(0, 'rgba(255,220,250,.07)');
    aura.addColorStop(0.46, 'rgba(192,157,255,.10)');
    aura.addColorStop(0.76, 'rgba(125,220,255,.08)');
    aura.addColorStop(1, 'rgba(140,105,255,0)');
    ctx.fillStyle = aura;
    ctx.beginPath();
    ctx.arc(0, 0, radius * 1.2 * pulse, 0, Math.PI * 2);
    ctx.fill();

    ctx.lineWidth = Math.max(1, radius * 0.012);
    ctx.setLineDash([radius * 0.09, radius * 0.12]);
    ctx.lineDashOffset = -time * radius * 0.08;
    ctx.strokeStyle = 'rgba(225,205,255,.20)';
    ctx.beginPath();
    ctx.ellipse(0, 0, radius * 0.98, radius * 0.68, time * 0.08, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    for (let orbit = 0; orbit < 4; orbit += 1) {
      const angle = time * (0.34 + orbit * 0.035) + orbit * Math.PI * 0.53;
      const distance = radius * (0.82 + (orbit % 2) * 0.22);
      const x = Math.cos(angle) * distance;
      const y = Math.sin(angle) * distance * 0.7;
      const size = Math.max(2.5, radius * (0.035 + orbit * 0.004));
      ctx.fillStyle = config.effect.colors[orbit % config.effect.colors.length];
      ctx.shadowBlur = this.photoMode ? 18 : 11;
      ctx.shadowColor = ctx.fillStyle;
      this.starPath(ctx, size, x, y, angle);
      ctx.fill();
    }

    ctx.globalAlpha = 0.16 + Math.sin(time * 2.3) * 0.035;
    ctx.strokeStyle = index % 2 ? '#b7eaff' : '#f5c9ff';
    ctx.lineWidth = Math.max(1.3, radius * 0.014);
    for (let ribbon = -1; ribbon <= 1; ribbon += 1) {
      const x = ribbon * radius * 0.22;
      ctx.beginPath();
      ctx.moveTo(x, radius * 0.32);
      ctx.bezierCurveTo(
        x + Math.sin(time * 1.5 + ribbon) * radius * 0.16,
        radius * 0.72,
        x + Math.cos(time * 1.2 + ribbon) * radius * 0.2,
        radius * 1.05,
        x + Math.sin(time + ribbon) * radius * 0.12,
        radius * 1.35
      );
      ctx.stroke();
    }
    ctx.restore();
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
    } else if (particle.type === 'spark') {
      ctx.strokeStyle = particle.color;
      ctx.lineWidth = Math.max(1, particle.size * 0.22);
      ctx.beginPath();
      ctx.moveTo(-particle.size, 0);
      ctx.lineTo(particle.size, 0);
      ctx.moveTo(0, -particle.size);
      ctx.lineTo(0, particle.size);
      ctx.stroke();
    } else {
      ctx.fillStyle = particle.color;
      ctx.beginPath();
      ctx.arc(0, 0, particle.size * 0.52, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  starPath(ctx, radius, offsetX = 0, offsetY = 0, rotation = 0) {
    ctx.beginPath();
    for (let index = 0; index < 10; index += 1) {
      const r = index % 2 ? radius * 0.42 : radius;
      const angle = rotation - Math.PI / 2 + index * Math.PI / 5;
      const x = offsetX + Math.cos(angle) * r;
      const y = offsetY + Math.sin(angle) * r;
      index ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.closePath();
  }

  clear() {
    this.ctx.clearRect(0, 0, this.width, this.height);
  }
}
