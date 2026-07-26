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
    this.activeElapsed = 0;
    this.gameAnchor = null;
    this.gameConfig = null;
    this.gameLayer = document.querySelector('#game-controls');
    this.gameCallbacks = {};
    this.game = this.createGameState();
    this.tempWorld = new THREE.Vector3();
    this.tempScale = new THREE.Vector3();
    this.tempCamera = new THREE.Vector3();
    this.resize = this.resize.bind(this);
    this.handlePointer = this.handlePointer.bind(this);
    addEventListener('resize', this.resize);
    this.canvas.addEventListener('pointerdown', this.handlePointer);
    this.resize();
  }

  connect(camera, controllers) {
    this.camera = camera;
    this.controllers = controllers;
  }

  setActive(key) {
    if (this.activeKey !== key) {
      this.restartGame(key);
    }
    this.activeKey = key;
  }

  setGameCallbacks(callbacks) {
    this.gameCallbacks = callbacks || {};
  }

  createGameState() {
    return {
      phase: 'orbit',
      collected: 0,
      bubbles: [],
      rescuedStars: [],
      feverTime: 0
    };
  }

  restartGame(key = this.activeKey) {
    this.activeElapsed = 0;
    this.game = this.createGameState();
    this.canvas.classList.remove('is-interactive');
    this.clearGameControls();
    if (key === 'jellyfish') this.notifyGame('orbit');
  }

  notifyGame(phase = this.game.phase) {
    this.gameCallbacks.onStateChange?.({
      phase,
      collected: this.game.collected,
      total: 5
    });
  }

  setPhotoMode(active) {
    this.photoMode = active;
  }

  reset() {
    this.particles.length = 0;
    this.activeKey = null;
    this.elapsed = 0;
    this.activeElapsed = 0;
    this.gameAnchor = null;
    this.gameConfig = null;
    this.game = this.createGameState();
    this.canvas.classList.remove('is-interactive');
    this.clearGameControls();
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
    if (this.activeKey) this.activeElapsed += delta;
    this.gameAnchor = null;
    this.gameConfig = null;

    const candidates = this.controllers.filter(({ key }) => !this.activeKey || key === this.activeKey);
    for (const { key, controller } of candidates) {
      const config = controller.config;
      const sources = controller.getEffectSources();
      sources.forEach((source, sourceIndex) => {
        if (!this.isVisible(source)) return;
        const screen = this.project(source);
        if (!screen || screen.x < -40 || screen.x > this.width + 40 || screen.y < -40 || screen.y > this.height + 40) return;

        if (config.renderMode === 'sprite2d') {
          if (!this.gameAnchor) {
            this.gameAnchor = screen;
            this.gameConfig = config;
          }
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

    this.updateGame(delta);
    for (const particle of this.particles) this.drawParticle(particle, delta);
    this.drawGameOverlay();
    this.particles = this.particles.filter((particle) => particle.life > 0);
    if (this.particles.length > this.profile.maxParticles) {
      this.particles.splice(0, this.particles.length - this.profile.maxParticles);
    }
  }

  updateGame(delta) {
    if (this.activeKey !== 'jellyfish' || !this.gameAnchor || !this.gameConfig) return;

    if (this.game.phase === 'orbit' && this.activeElapsed >= 4.85) {
      this.game.phase = 'bubbles';
      this.game.bubbles = [
        { angle: -0.2, distance: 0.86, speed: 0.36, popped: false },
        { angle: 0.95, distance: 1.02, speed: -0.29, popped: false },
        { angle: 2.15, distance: 0.9, speed: 0.31, popped: false },
        { angle: 3.35, distance: 1.08, speed: -0.33, popped: false },
        { angle: 4.65, distance: 0.94, speed: 0.27, popped: false }
      ];
      this.canvas.classList.add('is-interactive');
      this.createGameControls();
      this.notifyGame('bubbles');
    }

    const orbitRadius = Math.max(72, this.gameAnchor.size * 0.72);
    for (const bubble of this.game.bubbles) {
      if (bubble.popped) continue;
      bubble.angle += bubble.speed * delta;
      bubble.x = this.gameAnchor.x + Math.cos(bubble.angle) * orbitRadius * bubble.distance;
      bubble.y = this.gameAnchor.y + Math.sin(bubble.angle) * orbitRadius * bubble.distance * 0.68;
      bubble.radius = Math.max(24, Math.min(42, this.gameAnchor.size * 0.16));
      const safeMargin = bubble.radius + 8;
      bubble.x = Math.max(safeMargin, Math.min(this.width - safeMargin, bubble.x));
      bubble.y = Math.max(safeMargin + 92, Math.min(this.height - safeMargin - 94, bubble.y));
      this.positionGameControl(bubble);
    }

    for (const star of this.game.rescuedStars) {
      star.progress = Math.min(1, star.progress + delta * 1.7);
    }
    this.game.rescuedStars = this.game.rescuedStars.filter((star) => star.progress < 1);

    if (this.game.phase === 'fever') {
      this.game.feverTime += delta;
      const chance = delta * 58 * this.profile.spawnRate;
      if (Math.random() < chance) {
        for (let index = 0; index < 4; index += 1) {
          this.spawn(this.gameAnchor, this.gameConfig, 'jellyfish', this.gameAnchor.size * 0.9, true);
        }
      }
      if (this.game.feverTime >= 4.2) {
        this.game.phase = 'complete';
        this.notifyGame('complete');
      }
    }
  }

  handlePointer(event) {
    if (this.game.phase !== 'bubbles') return;
    const rect = this.canvas.getBoundingClientRect();
    const x = (event.clientX - rect.left) * this.width / rect.width;
    const y = (event.clientY - rect.top) * this.height / rect.height;
    const bubble = this.game.bubbles.find((candidate) => {
      if (candidate.popped || !candidate.radius) return false;
      return Math.hypot(x - candidate.x, y - candidate.y) <= candidate.radius * 2.1;
    });
    if (!bubble) return;

    event.preventDefault();
    this.popBubble(bubble);
  }

  popBubble(bubble) {
    if (!bubble || bubble.popped || this.game.phase !== 'bubbles') return;
    bubble.popped = true;
    bubble.button?.remove();
    this.game.collected += 1;
    this.game.rescuedStars.push({
      x: bubble.x,
      y: bubble.y,
      progress: 0,
      rotation: Math.random() * Math.PI * 2
    });
    this.spawnPopBurst(bubble.x, bubble.y);

    if (this.game.collected >= 5) {
      this.game.phase = 'fever';
      this.game.feverTime = 0;
      this.canvas.classList.remove('is-interactive');
      this.clearGameControls();
      this.notifyGame('fever');
    } else {
      this.notifyGame('bubbles');
    }
  }

  createGameControls() {
    this.clearGameControls();
    if (!this.gameLayer) return;
    this.game.bubbles.forEach((bubble, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'game-bubble-target';
      button.setAttribute('aria-label', `泡${index + 1}を割って星を救出`);
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.popBubble(bubble);
      });
      bubble.button = button;
      this.gameLayer.appendChild(button);
    });
  }

  positionGameControl(bubble) {
    if (!bubble.button) return;
    const diameter = bubble.radius * 4.2;
    bubble.button.style.width = `${diameter}px`;
    bubble.button.style.height = `${diameter}px`;
    bubble.button.style.transform = `translate3d(${bubble.x - diameter / 2}px, ${bubble.y - diameter / 2}px, 0)`;
  }

  clearGameControls() {
    this.gameLayer?.replaceChildren();
  }

  spawnPopBurst(x, y) {
    const colors = this.gameConfig?.effect.colors || ['#ffd1f1', '#cdb9ff', '#a9ebff'];
    for (let index = 0; index < 15; index += 1) {
      const angle = Math.PI * 2 * index / 15 + Math.random() * 0.2;
      const speed = 22 + Math.random() * 34;
      this.particles.push({
        key: 'jellyfish',
        type: index % 3 === 0 ? 'star' : 'spark',
        color: colors[index % colors.length],
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        rotation: angle,
        spin: (Math.random() - 0.5) * 3,
        size: 4 + Math.random() * 7,
        life: 1,
        decay: 0.75 + Math.random() * 0.35
      });
    }
  }

  drawGameOverlay() {
    if (this.activeKey !== 'jellyfish' || !this.gameAnchor) return;
    const ctx = this.ctx;

    if (this.game.phase === 'orbit') {
      this.drawGameLabel('クラゲが模型をぐるっと一周！', '✦');
    }

    if (this.game.phase === 'bubbles') {
      for (const bubble of this.game.bubbles) {
        if (!bubble.popped) this.drawGameBubble(bubble);
      }
      this.drawGameLabel(`泡をタッチ！  ★ ${this.game.collected}/5`, '○');
    }

    for (const star of this.game.rescuedStars) {
      const progress = 1 - Math.pow(1 - star.progress, 3);
      const x = star.x + (this.gameAnchor.x - star.x) * progress;
      const y = star.y + (this.gameAnchor.y - star.y) * progress - Math.sin(progress * Math.PI) * 42;
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.fillStyle = '#fff2a8';
      ctx.shadowBlur = 20;
      ctx.shadowColor = '#ffbcef';
      this.starPath(ctx, 10 + Math.sin(progress * Math.PI) * 8, x, y, star.rotation + progress * 4);
      ctx.fill();
      ctx.restore();
    }

    if (this.game.phase === 'fever') {
      this.drawFever();
      this.drawGameLabel('★ レインボーフィーバー！ ★', '✦');
    }
    if (this.game.phase === 'complete') {
      this.drawGameLabel('星を救出できたよ！ 写真を撮ろう', '★');
    }
  }

  drawGameBubble(bubble) {
    const ctx = this.ctx;
    const pulse = 1 + Math.sin(this.elapsed * 3 + bubble.angle * 2) * 0.08;
    const radius = bubble.radius * pulse;
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.shadowBlur = 18;
    ctx.shadowColor = '#c7b4ff';
    const gradient = ctx.createRadialGradient(
      bubble.x - radius * 0.28,
      bubble.y - radius * 0.32,
      radius * 0.08,
      bubble.x,
      bubble.y,
      radius
    );
    gradient.addColorStop(0, 'rgba(255,255,255,.88)');
    gradient.addColorStop(0.22, 'rgba(197,235,255,.34)');
    gradient.addColorStop(0.72, 'rgba(198,159,255,.18)');
    gradient.addColorStop(1, 'rgba(255,188,235,.52)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(bubble.x, bubble.y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255,255,255,.82)';
    ctx.stroke();
    ctx.fillStyle = '#fff0a8';
    ctx.shadowBlur = 12;
    ctx.shadowColor = '#ffb7ef';
    this.starPath(ctx, radius * 0.36, bubble.x, bubble.y, this.elapsed * 0.7 + bubble.angle);
    ctx.fill();
    ctx.restore();
  }

  drawFever() {
    const ctx = this.ctx;
    const time = this.game.feverTime;
    const radius = Math.max(90, this.gameAnchor.size * (0.8 + time * 0.12));
    const colors = ['#ff8cda', '#ffe47a', '#8dffe2', '#8eb9ff', '#c29aff'];
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.translate(this.gameAnchor.x, this.gameAnchor.y);
    ctx.rotate(time * 0.4);
    colors.forEach((color, index) => {
      ctx.globalAlpha = Math.max(0.15, 0.58 - index * 0.07);
      ctx.lineWidth = Math.max(3, radius * 0.035);
      ctx.strokeStyle = color;
      ctx.shadowBlur = 22;
      ctx.shadowColor = color;
      ctx.beginPath();
      ctx.arc(0, 0, radius * (0.58 + index * 0.13), 0, Math.PI * 2);
      ctx.stroke();
    });
    ctx.restore();
  }

  drawGameLabel(text, icon) {
    const ctx = this.ctx;
    const paddingX = 16;
    const height = 38;
    ctx.save();
    ctx.font = '800 13px -apple-system, BlinkMacSystemFont, "Hiragino Sans", sans-serif';
    const width = Math.min(this.width - 28, ctx.measureText(text).width + paddingX * 2 + 22);
    const x = (this.width - width) / 2;
    const y = Math.max(92, Math.min(this.height - 150, this.gameAnchor.y - this.gameAnchor.size * 0.74 - 52));
    ctx.fillStyle = 'rgba(24,13,54,.82)';
    ctx.strokeStyle = 'rgba(255,255,255,.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    this.roundedRect(ctx, x, y, width, height, 19);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowBlur = 10;
    ctx.shadowColor = '#c7a8ff';
    ctx.fillText(`${icon} ${text}`, this.width / 2, y + height / 2 + 1);
    ctx.restore();
  }

  roundedRect(ctx, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + width, y, x + width, y + height, r);
    ctx.arcTo(x + width, y + height, x, y + height, r);
    ctx.arcTo(x, y + height, x, y, r);
    ctx.arcTo(x, y, x + width, y, r);
    ctx.closePath();
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
