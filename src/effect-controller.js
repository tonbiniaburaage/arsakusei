import * as THREE from 'three';
import { SoundController } from './sound-controller.js?v=20260727-games';

const GAME_TOTALS = {
  jellyfish: 5,
  whale: 3,
  turtle: 5
};

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
    this.sound = new SoundController();
    this.game = this.createGameState(null);
    this.tempWorld = new THREE.Vector3();
    this.tempScale = new THREE.Vector3();
    this.tempCamera = new THREE.Vector3();
    this.resize = this.resize.bind(this);
    this.handlePointer = this.handlePointer.bind(this);
    addEventListener('resize', this.resize);
    this.canvas.addEventListener('pointerdown', this.handlePointer);
    this.canvas.addEventListener('pointermove', this.handlePointer);
    this.canvas.addEventListener('pointerup', this.handlePointer);
    this.canvas.addEventListener('pointercancel', this.handlePointer);
    this.resize();
  }

  connect(camera, controllers) {
    this.camera = camera;
    this.controllers = controllers;
  }

  setActive(key) {
    if (this.activeKey !== key) this.restartGame(key);
    this.activeKey = key;
  }

  setGameCallbacks(callbacks) {
    this.gameCallbacks = callbacks || {};
  }

  createGameState(key) {
    return {
      key,
      phase: key ? 'intro' : 'idle',
      count: 0,
      total: GAME_TOTALS[key] || 0,
      bubble: null,
      rescuedStars: [],
      celebrateTime: 0,
      charging: false,
      charge: 0,
      launches: [],
      traceIndex: 0,
      tracePoints: [],
      traceTrail: [],
      tracing: false,
      moved: false
    };
  }

  restartGame(key = this.activeKey) {
    this.activeElapsed = 0;
    this.game = this.createGameState(key);
    this.canvas.classList.remove('is-interactive');
    this.clearGameControls();
    if (key) this.notifyGame('intro');
  }

  notifyGame(phase = this.game.phase) {
    this.gameCallbacks.onStateChange?.({
      key: this.game.key,
      phase,
      count: this.game.count,
      total: this.game.total
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
    this.game = this.createGameState(null);
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
      controller.getEffectSources().forEach((source, sourceIndex) => {
        if (!this.isVisible(source)) return;
        const screen = this.project(source);
        if (!screen || screen.x < -70 || screen.x > this.width + 70 || screen.y < -70 || screen.y > this.height + 70) return;
        if (!this.gameAnchor) {
          this.gameAnchor = screen;
          this.gameConfig = config;
        }
        this.drawCreatureAura(screen, sourceIndex, config, key);
        const chance = delta * (this.photoMode ? 38 : 18) * this.profile.spawnRate;
        if (Math.random() < chance) this.spawnAmbient(screen, config, key);
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
    if (!this.activeKey || !this.gameAnchor || !this.gameConfig) return;
    if (this.game.key !== this.activeKey) this.restartGame(this.activeKey);

    if (this.game.phase === 'intro') {
      const introDuration = this.activeKey === 'jellyfish' ? 3.7 : 1.8;
      if (this.activeElapsed >= introDuration) {
        if (this.activeKey === 'jellyfish') this.beginJellyfishGame();
        if (this.activeKey === 'whale') this.beginWhaleGame();
        if (this.activeKey === 'turtle') this.beginTurtleGame();
      }
    }

    if (this.game.phase === 'jelly-rhythm') this.updateJellyfishGame();
    if (this.game.phase === 'whale-charge') this.updateWhaleGame(delta);
    if (this.game.phase === 'turtle-trace') this.updateTurtleGame();

    for (const star of this.game.rescuedStars) star.progress = Math.min(1, star.progress + delta * 1.8);
    this.game.rescuedStars = this.game.rescuedStars.filter((star) => star.progress < 1);
    for (const launch of this.game.launches) launch.progress = Math.min(1, launch.progress + delta * (0.72 + launch.power * 0.5));
    this.game.launches = this.game.launches.filter((launch) => launch.progress < 1);

    if (this.game.phase.endsWith('celebrate')) {
      this.game.celebrateTime += delta;
      if (Math.random() < delta * 58 * this.profile.spawnRate) {
        for (let index = 0; index < 3; index += 1) {
          this.spawnAmbient(this.gameAnchor, this.gameConfig, this.activeKey, true);
        }
      }
      if (this.game.celebrateTime >= 2.8) {
        this.game.phase = 'complete';
        this.notifyGame('complete');
      }
    }
  }

  beginJellyfishGame() {
    this.game.phase = 'jelly-rhythm';
    this.canvas.classList.add('is-interactive');
    this.createJellyBubble();
    this.notifyGame();
  }

  createJellyBubble() {
    const placements = [
      [-0.72, -0.34],
      [0.68, -0.42],
      [-0.68, 0.26],
      [0.7, 0.25],
      [0.02, 0.58]
    ];
    const [offsetX, offsetY] = placements[this.game.count];
    this.game.bubble = { offsetX, offsetY, radius: 34, pulse: 0 };
    this.createGameButton({
      label: `光る泡${this.game.count + 1}を割る`,
      className: 'game-bubble-target',
      onClick: () => this.popJellyBubble()
    });
  }

  updateJellyfishGame() {
    const bubble = this.game.bubble;
    if (!bubble) return;
    const radius = Math.max(88, this.gameAnchor.size * 0.74);
    bubble.pulse += 0.08;
    bubble.radius = Math.max(28, Math.min(42, this.gameAnchor.size * 0.17));
    bubble.x = this.gameAnchor.x + bubble.offsetX * radius;
    bubble.y = this.gameAnchor.y + bubble.offsetY * radius;
    const margin = bubble.radius + 10;
    bubble.x = Math.max(margin, Math.min(this.width - margin, bubble.x));
    bubble.y = Math.max(margin + 96, Math.min(this.height - margin - 92, bubble.y));
    this.positionControl(this.game.control, bubble.x, bubble.y, bubble.radius * 4.4, bubble.radius * 4.4);
  }

  popJellyBubble() {
    const bubble = this.game.bubble;
    if (!bubble || this.game.phase !== 'jelly-rhythm') return;
    this.sound.pop(this.game.count);
    navigator.vibrate?.(18);
    this.game.count += 1;
    this.game.rescuedStars.push({
      x: bubble.x,
      y: bubble.y,
      progress: 0,
      rotation: Math.random() * Math.PI * 2
    });
    this.spawnBurst(bubble.x, bubble.y, 'jellyfish');
    this.clearGameControls();
    this.game.bubble = null;

    if (this.game.count >= this.game.total) {
      this.startCelebrate('jellyfish');
    } else {
      this.createJellyBubble();
      this.notifyGame();
    }
  }

  beginWhaleGame() {
    this.game.phase = 'whale-charge';
    this.createWhaleControl();
    this.notifyGame();
  }

  createWhaleControl() {
    const button = this.createGameButton({
      label: '長押しして潮吹きパワーをためる',
      className: 'game-action-target game-action-target--whale'
    });
    button.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      button.setPointerCapture?.(event.pointerId);
      this.sound.ensureContext();
      this.game.charging = true;
      this.game.charge = Math.max(0.12, this.game.charge);
      this.game.moved = false;
    });
    const release = (event) => {
      if (!this.game.charging) return;
      event.preventDefault();
      this.game.charging = false;
      this.game.moved = true;
      this.launchWhaleStar(Math.max(0.48, this.game.charge));
      this.game.charge = 0;
    };
    button.addEventListener('pointerup', release);
    button.addEventListener('pointercancel', release);
    button.addEventListener('click', (event) => {
      event.preventDefault();
      if (this.game.moved) {
        this.game.moved = false;
        return;
      }
      this.launchWhaleStar(0.62);
    });
  }

  updateWhaleGame(delta) {
    if (this.game.charging) this.game.charge = Math.min(1, this.game.charge + delta * 0.92);
    this.positionControl(
      this.game.control,
      this.gameAnchor.x,
      this.gameAnchor.y + this.gameAnchor.size * 0.08,
      Math.max(180, this.gameAnchor.size * 1.4),
      Math.max(120, this.gameAnchor.size * 0.72)
    );
  }

  launchWhaleStar(power) {
    if (this.game.phase !== 'whale-charge') return;
    this.sound.splash(power);
    navigator.vibrate?.(28);
    this.game.count += 1;
    this.game.launches.push({
      x: this.gameAnchor.x,
      y: this.gameAnchor.y - this.gameAnchor.size * 0.38,
      power,
      progress: 0,
      drift: (Math.random() - 0.5) * 90
    });
    this.spawnBurst(this.gameAnchor.x, this.gameAnchor.y - this.gameAnchor.size * 0.35, 'whale');
    if (this.game.count >= this.game.total) this.startCelebrate('whale');
    else this.notifyGame();
  }

  beginTurtleGame() {
    this.game.phase = 'turtle-trace';
    this.canvas.classList.add('is-interactive');
    this.createTurtleControl();
    this.notifyGame();
  }

  createTurtleControl() {
    const button = this.createGameButton({
      label: 'カメの甲羅をなぞる',
      className: 'game-action-target game-action-target--turtle'
    });
    button.addEventListener('pointerdown', (event) => {
      this.game.tracing = true;
      this.game.moved = false;
      this.sound.ensureContext();
      this.processTurtleTrace(event);
    });
    button.addEventListener('pointermove', (event) => {
      if (!this.game.tracing) return;
      this.game.moved = true;
      this.processTurtleTrace(event);
    });
    const finish = () => {
      this.game.tracing = false;
    };
    button.addEventListener('pointerup', finish);
    button.addEventListener('pointercancel', finish);
    button.addEventListener('click', (event) => {
      event.preventDefault();
      if (this.game.moved) {
        this.game.moved = false;
        return;
      }
      this.advanceTurtleTrace();
    });
  }

  updateTurtleGame() {
    const size = Math.max(110, this.gameAnchor.size);
    const offsets = [
      [-0.42, 0.02],
      [-0.2, -0.22],
      [0.08, -0.28],
      [0.34, -0.12],
      [0.42, 0.14]
    ];
    this.game.tracePoints = offsets.map(([x, y]) => ({
      x: this.gameAnchor.x + x * size,
      y: this.gameAnchor.y + y * size
    }));
    this.positionControl(
      this.game.control,
      this.gameAnchor.x,
      this.gameAnchor.y,
      Math.max(210, size * 1.4),
      Math.max(130, size * 0.78)
    );
  }

  processTurtleTrace(event) {
    if (this.game.phase !== 'turtle-trace') return;
    const rect = this.canvas.getBoundingClientRect();
    const x = (event.clientX - rect.left) * this.width / rect.width;
    const y = (event.clientY - rect.top) * this.height / rect.height;
    this.game.traceTrail.push({ x, y, life: 1 });
    const point = this.game.tracePoints[this.game.traceIndex];
    const tolerance = Math.max(52, this.gameAnchor.size * 0.28);
    if (point && Math.hypot(x - point.x, y - point.y) <= tolerance) this.advanceTurtleTrace();
  }

  advanceTurtleTrace() {
    if (this.game.phase !== 'turtle-trace') return;
    const point = this.game.tracePoints[this.game.traceIndex] || this.gameAnchor;
    this.sound.trace(this.game.traceIndex);
    navigator.vibrate?.(12);
    this.spawnBurst(point.x, point.y, 'turtle');
    this.game.traceIndex += 1;
    this.game.count = this.game.traceIndex;
    if (this.game.traceIndex >= this.game.total) this.startCelebrate('turtle');
    else this.notifyGame();
  }

  startCelebrate(key) {
    this.game.phase = `${key}-celebrate`;
    this.game.celebrateTime = 0;
    this.game.charging = false;
    this.canvas.classList.remove('is-interactive');
    this.clearGameControls();
    this.sound.success(key);
    navigator.vibrate?.([30, 35, 55]);
    this.notifyGame();
  }

  handlePointer(event) {
    if (this.game.phase === 'jelly-rhythm' && event.type === 'pointerdown') {
      const point = this.eventPoint(event);
      const bubble = this.game.bubble;
      if (bubble && Math.hypot(point.x - bubble.x, point.y - bubble.y) <= bubble.radius * 2.2) {
        event.preventDefault();
        this.popJellyBubble();
      }
    }
    if (this.game.phase === 'turtle-trace') {
      if (event.type === 'pointerdown') this.game.tracing = true;
      if (event.type === 'pointermove' && this.game.tracing) this.processTurtleTrace(event);
      if (event.type === 'pointerup' || event.type === 'pointercancel') this.game.tracing = false;
    }
  }

  eventPoint(event) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * this.width / rect.width,
      y: (event.clientY - rect.top) * this.height / rect.height
    };
  }

  createGameButton({ label, className, onClick }) {
    this.clearGameControls();
    const button = document.createElement('button');
    button.type = 'button';
    button.className = className;
    button.setAttribute('aria-label', label);
    if (onClick) {
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        onClick();
      });
    }
    this.game.control = button;
    this.gameLayer?.appendChild(button);
    return button;
  }

  positionControl(control, x, y, width, height) {
    if (!control) return;
    control.style.width = `${width}px`;
    control.style.height = `${height}px`;
    control.style.transform = `translate3d(${x - width / 2}px, ${y - height / 2}px, 0)`;
  }

  clearGameControls() {
    this.gameLayer?.replaceChildren();
    if (this.game) this.game.control = null;
  }

  drawGameOverlay() {
    if (!this.activeKey || !this.gameAnchor) return;
    if (this.game.phase === 'intro') {
      this.drawGameLabel(`ドリーミー${this.gameConfig.label}が現れた！`, this.gameConfig.icon);
    }
    if (this.game.phase === 'jelly-rhythm') {
      if (this.game.bubble) this.drawGameBubble(this.game.bubble);
      this.drawGameLabel(`光る泡をタッチ！ ${this.game.count}/${this.game.total}`, '○');
    }
    if (this.game.phase === 'whale-charge') {
      this.drawWhaleCharge();
      this.drawGameLabel(`長押しで潮吹き！ ${this.game.count}/${this.game.total}`, '≈');
    }
    if (this.game.phase === 'turtle-trace') {
      this.drawTurtleTrace();
      this.drawGameLabel(`甲羅の光をなぞろう！ ${this.game.count}/${this.game.total}`, '◇');
    }

    this.drawRescuedStars();
    this.drawWhaleLaunches();
    if (this.game.phase.endsWith('celebrate')) this.drawCelebration();
    if (this.game.phase === 'complete') this.drawGameLabel('クリア！', '★');
  }

  drawGameBubble(bubble) {
    const ctx = this.ctx;
    const pulse = 1 + Math.sin(this.elapsed * 5.2) * 0.09;
    const radius = bubble.radius * pulse;
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.shadowBlur = 22;
    ctx.shadowColor = '#c7b4ff';
    const gradient = ctx.createRadialGradient(
      bubble.x - radius * 0.3,
      bubble.y - radius * 0.34,
      radius * 0.08,
      bubble.x,
      bubble.y,
      radius
    );
    gradient.addColorStop(0, 'rgba(255,255,255,.94)');
    gradient.addColorStop(0.26, 'rgba(190,235,255,.38)');
    gradient.addColorStop(0.72, 'rgba(196,150,255,.18)');
    gradient.addColorStop(1, 'rgba(255,174,230,.6)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(bubble.x, bubble.y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(255,255,255,.88)';
    ctx.stroke();
    ctx.globalAlpha = 0.65;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(bubble.x, bubble.y, radius * (1.28 + Math.sin(this.elapsed * 5.2) * 0.08), 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#fff2a8';
    this.starPath(ctx, radius * 0.35, bubble.x, bubble.y, this.elapsed);
    ctx.fill();
    ctx.restore();
  }

  drawRescuedStars() {
    const ctx = this.ctx;
    for (const star of this.game.rescuedStars) {
      const progress = 1 - Math.pow(1 - star.progress, 3);
      const x = star.x + (this.gameAnchor.x - star.x) * progress;
      const y = star.y + (this.gameAnchor.y - star.y) * progress - Math.sin(progress * Math.PI) * 45;
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.fillStyle = '#fff1a8';
      ctx.shadowBlur = 22;
      ctx.shadowColor = '#ffb7ed';
      this.starPath(ctx, 11 + Math.sin(progress * Math.PI) * 8, x, y, star.rotation + progress * 4);
      ctx.fill();
      ctx.restore();
    }
  }

  drawWhaleCharge() {
    const ctx = this.ctx;
    const x = this.gameAnchor.x;
    const y = this.gameAnchor.y + this.gameAnchor.size * 0.54;
    const width = Math.min(210, Math.max(130, this.gameAnchor.size));
    ctx.save();
    ctx.fillStyle = 'rgba(13,45,82,.7)';
    ctx.strokeStyle = 'rgba(210,250,255,.75)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    this.roundedRect(ctx, x - width / 2, y, width, 18, 9);
    ctx.fill();
    ctx.stroke();
    const fill = Math.max(0.08, this.game.charge);
    const gradient = ctx.createLinearGradient(x - width / 2, y, x + width / 2, y);
    gradient.addColorStop(0, '#65e7ff');
    gradient.addColorStop(0.62, '#85b8ff');
    gradient.addColorStop(1, '#ffe981');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    this.roundedRect(ctx, x - width / 2 + 3, y + 3, (width - 6) * fill, 12, 6);
    ctx.fill();
    ctx.restore();
  }

  drawWhaleLaunches() {
    const ctx = this.ctx;
    for (const launch of this.game.launches) {
      const progress = 1 - Math.pow(1 - launch.progress, 2);
      const x = launch.x + Math.sin(progress * Math.PI) * launch.drift;
      const y = launch.y - progress * (180 + launch.power * 170);
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.fillStyle = '#fff09a';
      ctx.shadowBlur = 24;
      ctx.shadowColor = '#71dcff';
      this.starPath(ctx, 13 + launch.power * 9, x, y, progress * 5);
      ctx.fill();
      ctx.strokeStyle = 'rgba(108,229,255,.7)';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(launch.x, launch.y);
      ctx.quadraticCurveTo(launch.x + launch.drift, (launch.y + y) / 2, x, y + 18);
      ctx.stroke();
      ctx.restore();
    }
  }

  drawTurtleTrace() {
    const ctx = this.ctx;
    const points = this.game.tracePoints;
    if (!points.length) return;
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.setLineDash([7, 9]);
    ctx.lineWidth = 5;
    ctx.strokeStyle = 'rgba(207,255,239,.46)';
    ctx.shadowBlur = 12;
    ctx.shadowColor = '#78efd7';
    ctx.beginPath();
    points.forEach((point, index) => index ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y));
    ctx.stroke();
    ctx.setLineDash([]);
    points.forEach((point, index) => {
      const reached = index < this.game.traceIndex;
      const active = index === this.game.traceIndex;
      ctx.fillStyle = reached ? '#fff1a0' : active ? '#ffb9dc' : 'rgba(159,255,226,.72)';
      ctx.shadowBlur = active ? 22 : 11;
      this.starPath(ctx, active ? 13 : 9, point.x, point.y, this.elapsed * 0.6 + index);
      ctx.fill();
    });
    ctx.strokeStyle = '#ffb9dc';
    ctx.lineWidth = 6;
    ctx.globalAlpha = 0.78;
    ctx.beginPath();
    this.game.traceTrail.slice(-28).forEach((point, index) => {
      index ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y);
    });
    ctx.stroke();
    ctx.restore();
    this.game.traceTrail = this.game.traceTrail.slice(-34);
  }

  drawCelebration() {
    if (this.activeKey === 'jellyfish') this.drawRainbowRings();
    if (this.activeKey === 'whale') this.drawWhaleCelebration();
    if (this.activeKey === 'turtle') this.drawTurtleCelebration();
    this.drawGameLabel('やったね！', '★');
  }

  drawRainbowRings() {
    const colors = ['#ff8cda', '#ffe47a', '#8dffe2', '#8eb9ff', '#c29aff'];
    const radius = Math.max(86, this.gameAnchor.size * (0.76 + this.game.celebrateTime * 0.08));
    this.ctx.save();
    this.ctx.globalCompositeOperation = 'screen';
    colors.forEach((color, index) => {
      this.ctx.globalAlpha = 0.52 - index * 0.055;
      this.ctx.lineWidth = 5;
      this.ctx.strokeStyle = color;
      this.ctx.beginPath();
      this.ctx.arc(this.gameAnchor.x, this.gameAnchor.y, radius * (0.58 + index * 0.13), 0, Math.PI * 2);
      this.ctx.stroke();
    });
    this.ctx.restore();
  }

  drawWhaleCelebration() {
    const ctx = this.ctx;
    const radius = Math.max(100, this.gameAnchor.size * 0.7);
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.strokeStyle = '#70e8ff';
    ctx.lineWidth = 5;
    ctx.shadowBlur = 18;
    ctx.shadowColor = '#5ca7ff';
    for (let index = 0; index < 4; index += 1) {
      ctx.globalAlpha = 0.62 - index * 0.11;
      ctx.beginPath();
      ctx.arc(this.gameAnchor.x, this.gameAnchor.y + radius * 0.35, radius * (0.55 + index * 0.26), Math.PI * 1.08, Math.PI * 1.92);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawTurtleCelebration() {
    const ctx = this.ctx;
    const radius = Math.max(88, this.gameAnchor.size * 0.58);
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.translate(this.gameAnchor.x, this.gameAnchor.y);
    ctx.rotate(this.game.celebrateTime * 0.45);
    ['#8ff5db', '#fff09b', '#ffb7dc'].forEach((color, index) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = 4;
      ctx.globalAlpha = 0.65 - index * 0.12;
      ctx.beginPath();
      ctx.ellipse(0, 0, radius * (0.75 + index * 0.2), radius * (0.42 + index * 0.12), index * 0.6, 0, Math.PI * 2);
      ctx.stroke();
    });
    ctx.restore();
  }

  drawCreatureAura(screen, index, config, key) {
    if (key === 'whale') return this.drawWhaleAura(screen, config);
    if (key === 'turtle') return this.drawTurtleAura(screen, config);
    return this.drawJellyAura(screen, index, config);
  }

  drawJellyAura(screen, index, config) {
    const ctx = this.ctx;
    const radius = Math.max(48, screen.size * 0.58);
    const time = this.elapsed + index * 1.37;
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const aura = ctx.createRadialGradient(screen.x, screen.y, radius * 0.18, screen.x, screen.y, radius * 1.22);
    aura.addColorStop(0, 'rgba(255,218,249,.09)');
    aura.addColorStop(0.55, 'rgba(177,143,255,.11)');
    aura.addColorStop(1, 'rgba(120,205,255,0)');
    ctx.fillStyle = aura;
    ctx.beginPath();
    ctx.arc(screen.x, screen.y, radius * 1.22, 0, Math.PI * 2);
    ctx.fill();
    for (let orbit = 0; orbit < 4; orbit += 1) {
      const angle = time * 0.38 + orbit * 1.6;
      ctx.fillStyle = config.effect.colors[orbit % config.effect.colors.length];
      this.starPath(ctx, 4 + orbit, screen.x + Math.cos(angle) * radius, screen.y + Math.sin(angle) * radius * 0.72, angle);
      ctx.fill();
    }
    ctx.restore();
  }

  drawWhaleAura(screen) {
    const ctx = this.ctx;
    const radius = Math.max(54, screen.size * 0.56);
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.strokeStyle = 'rgba(100,226,255,.3)';
    ctx.lineWidth = 2.5;
    ctx.setLineDash([8, 10]);
    ctx.lineDashOffset = -this.elapsed * 24;
    for (let index = 0; index < 3; index += 1) {
      ctx.beginPath();
      ctx.ellipse(screen.x, screen.y + radius * 0.42, radius * (0.65 + index * 0.18), radius * (0.2 + index * 0.06), 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.restore();
  }

  drawTurtleAura(screen) {
    const ctx = this.ctx;
    const radius = Math.max(54, screen.size * 0.55);
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.translate(screen.x, screen.y);
    ctx.rotate(Math.sin(this.elapsed * 0.4) * 0.08);
    ctx.strokeStyle = 'rgba(145,247,217,.28)';
    ctx.lineWidth = 3;
    for (let index = 0; index < 3; index += 1) {
      ctx.beginPath();
      ctx.ellipse(0, 0, radius * (0.62 + index * 0.17), radius * (0.36 + index * 0.1), index * 0.44, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  spawnAmbient(screen, config, key, celebration = false) {
    const color = config.effect.colors[Math.floor(Math.random() * config.effect.colors.length)];
    let type = 'star';
    if (key === 'jellyfish') type = Math.random() < 0.48 ? 'star' : Math.random() < 0.72 ? 'bubble' : 'spark';
    if (key === 'whale') type = Math.random() < 0.68 ? 'drop' : 'star';
    if (key === 'turtle') type = Math.random() < 0.58 ? 'petal' : 'star';
    const radius = Math.max(38, screen.size * (celebration ? 0.82 : 0.56));
    this.particles.push({
      key,
      type,
      color,
      x: screen.x + (Math.random() - 0.5) * radius * 1.6,
      y: screen.y + (Math.random() - 0.5) * radius,
      vx: (Math.random() - 0.5) * (celebration ? 36 : 16),
      vy: key === 'whale' ? -15 - Math.random() * 28 : -8 - Math.random() * 18,
      rotation: Math.random() * Math.PI * 2,
      spin: (Math.random() - 0.5) * 2.2,
      size: 3 + Math.random() * (celebration ? 10 : 7),
      life: 1,
      decay: 0.42 + Math.random() * 0.34
    });
  }

  spawnBurst(x, y, key) {
    const config = this.gameConfig;
    for (let index = 0; index < 16; index += 1) {
      const angle = Math.PI * 2 * index / 16 + Math.random() * 0.18;
      const speed = 28 + Math.random() * 42;
      const type = key === 'whale'
        ? index % 3 === 0 ? 'star' : 'drop'
        : key === 'turtle'
          ? index % 3 === 0 ? 'star' : 'petal'
          : index % 3 === 0 ? 'star' : 'spark';
      this.particles.push({
        key,
        type,
        color: config.effect.colors[index % config.effect.colors.length],
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        rotation: angle,
        spin: (Math.random() - 0.5) * 3,
        size: 5 + Math.random() * 8,
        life: 1,
        decay: 0.78 + Math.random() * 0.3
      });
    }
  }

  drawParticle(particle, delta) {
    particle.x += particle.vx * delta;
    particle.y += particle.vy * delta;
    particle.rotation += particle.spin * delta;
    particle.life -= particle.decay * delta;
    const alpha = Math.max(0, particle.life);
    const ctx = this.ctx;
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = alpha * 0.82;
    ctx.translate(particle.x, particle.y);
    ctx.rotate(particle.rotation);
    ctx.shadowBlur = this.photoMode ? 14 : 9;
    ctx.shadowColor = particle.color;
    ctx.fillStyle = particle.color;
    ctx.strokeStyle = particle.color;
    if (particle.type === 'bubble') {
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(0, 0, particle.size, 0, Math.PI * 2);
      ctx.stroke();
    } else if (particle.type === 'star') {
      this.starPath(ctx, particle.size);
      ctx.fill();
    } else if (particle.type === 'spark') {
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(-particle.size, 0);
      ctx.lineTo(particle.size, 0);
      ctx.moveTo(0, -particle.size);
      ctx.lineTo(0, particle.size);
      ctx.stroke();
    } else if (particle.type === 'drop') {
      ctx.beginPath();
      ctx.ellipse(0, 0, particle.size * 0.55, particle.size, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.ellipse(0, 0, particle.size, particle.size * 0.48, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  drawGameLabel(text, icon) {
    const ctx = this.ctx;
    const height = 40;
    ctx.save();
    ctx.font = '800 13px -apple-system, BlinkMacSystemFont, "Hiragino Sans", sans-serif';
    const width = Math.min(this.width - 28, ctx.measureText(text).width + 58);
    const x = (this.width - width) / 2;
    const y = Math.max(96, Math.min(this.height - 150, this.gameAnchor.y - this.gameAnchor.size * 0.7 - 54));
    ctx.fillStyle = 'rgba(20,13,50,.84)';
    ctx.strokeStyle = 'rgba(255,255,255,.38)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    this.roundedRect(ctx, x, y, width, height, 20);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowBlur = 10;
    ctx.shadowColor = this.activeKey === 'whale' ? '#68dfff' : this.activeKey === 'turtle' ? '#79f1d4' : '#c7a8ff';
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
