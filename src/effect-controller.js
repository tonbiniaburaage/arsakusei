import * as THREE from 'three';
import { SoundController } from './sound-controller.js?v=20260731-stable-v7';

const GAME_TOTALS = {
  jellyfish: 5,
  whale: 3,
  turtle: 3
};

const CELEBRATE_SECONDS = {
  jellyfish: 2.55,
  whale: 2.75,
  turtle: 2.4
};
const TURTLE_POLISH_SECONDS = 3;
const SURPRISE_CHANCE = 0.3;
const LIGHT_COLLECT_SECONDS = 2;
const STAMP_SECONDS = 2;
const STAMP_STORAGE_KEY = 'dreamy-ocean-light-stamps';
const STAMP_ORDER = ['jellyfish', 'whale', 'turtle'];
const INTRO_SECONDS = 1;

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
    this.duckImage = new Image();
    this.duckImage.decoding = 'async';
    this.duckImage.src = './assets/sprites/mini-duck-surprise.png';
    this.stampImages = {};
    {
      const stampSources = {
        jellyfish: './assets/sprites/dreamy-jellyfish-stamp.png',
        whale: './assets/sprites/dreamy-whale-source.png',
        turtle: './assets/sprites/dreamy-turtle-source.png'
      };
      for (const [key, src] of Object.entries(stampSources)) {
        const image = new Image();
        image.decoding = 'async';
        image.src = src;
        this.stampImages[key] = image;
      }
    }
    this.collectedStamps = this.loadCollectedStamps();
    this.forceSurprise = new URLSearchParams(location.search).get('surprise') === '1';
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
      traceTrail: [],
      rubbing: false,
      rubProgress: 0,
      rubSoundStep: 0,
      lastRubPoint: null,
      lastRubMove: 0,
      moved: false,
      waveTime: 0,
      wavePulse: 0,
      bubbleHatTime: 0,
      whaleOopsTime: 0,
      absorbTime: 0,
      stampTime: 0,
      allClearTime: 0,
      newStamp: null,
      surpriseChecked: false,
      surpriseUsed: false,
      duckParadeStarted: false,
      ducks: []
    };
  }

  restartGame(key = this.activeKey) {
    this.activeElapsed = 0;
    this.clearCreatureReactions();
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

  loadCollectedStamps() {
    try {
      const saved = JSON.parse(sessionStorage.getItem(STAMP_STORAGE_KEY) || '[]');
      return new Set(saved.filter((key) => STAMP_ORDER.includes(key)));
    } catch {
      return new Set();
    }
  }

  saveCollectedStamps() {
    try {
      sessionStorage.setItem(STAMP_STORAGE_KEY, JSON.stringify([...this.collectedStamps]));
    } catch {
      // ストレージを利用できないブラウザでも、現在の表示中はスタンプを保持する。
    }
  }

  clearCollectedStamps() {
    this.collectedStamps.clear();
    this.saveCollectedStamps();
  }

  setPhotoMode(active) {
    this.photoMode = active;
  }

  reset() {
    this.clearCreatureReactions();
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
      if (this.activeElapsed >= INTRO_SECONDS) {
        if (this.activeKey === 'jellyfish') this.beginJellyfishGame();
        if (this.activeKey === 'whale') this.beginWhaleGame();
        if (this.activeKey === 'turtle') this.beginTurtleGame();
      }
    }

    if (this.game.phase === 'jelly-rhythm') this.updateJellyfishGame();
    if (this.game.phase === 'whale-charge') this.updateWhaleGame(delta);
    if (this.game.phase === 'whale-rise') {
      this.game.waveTime += delta;
      this.game.wavePulse = Math.min(1, this.game.wavePulse + delta * 2.4);
      if (this.game.waveTime >= 0.82) this.startCelebrate('whale');
    }
    if (this.game.phase === 'turtle-polish') this.updateTurtleGame(delta);

    for (const star of this.game.rescuedStars) star.progress = Math.min(1, star.progress + delta * 1.8);
    this.game.rescuedStars = this.game.rescuedStars.filter((star) => star.progress < 1);
    for (const launch of this.game.launches) launch.progress = Math.min(1, launch.progress + delta * (0.72 + launch.power * 0.5));
    this.game.launches = this.game.launches.filter((launch) => launch.progress < 1);
    this.game.bubbleHatTime = Math.max(0, this.game.bubbleHatTime - delta);
    this.game.whaleOopsTime = Math.max(0, this.game.whaleOopsTime - delta);
    this.game.wavePulse = Math.min(1, this.game.wavePulse + delta * 2.1);
    this.game.ducks.forEach((duck) => {
      duck.delay -= delta;
      if (duck.delay > 0) return;
      duck.age += delta;
      duck.life -= delta;
      duck.x += duck.vx * delta;
      duck.rotation = Math.sin(duck.age * 5.2 + duck.bobPhase) * 0.08;
    });
    this.game.ducks = this.game.ducks.filter((duck) => duck.life > 0);

    if (this.game.phase.endsWith('celebrate')) {
      this.game.celebrateTime += delta;
      this.updateComicReaction();
      if (Math.random() < delta * 58 * this.profile.spawnRate) {
        for (let index = 0; index < 3; index += 1) {
          this.spawnAmbient(this.gameAnchor, this.gameConfig, this.activeKey, true);
        }
      }
      if (this.game.celebrateTime >= CELEBRATE_SECONDS[this.activeKey]) {
        this.beginLightCollection();
      }
    }

    if (this.game.phase === 'light-collect') {
      this.game.absorbTime += delta;
      if (this.game.absorbTime >= LIGHT_COLLECT_SECONDS) this.awardLightStamp();
    }

    if (this.game.phase === 'stamp') {
      this.game.stampTime += delta;
      if (this.game.stampTime >= STAMP_SECONDS) {
        const allCollected = STAMP_ORDER.every((key) => this.collectedStamps.has(key));
        this.game.phase = allCollected ? 'all-complete' : 'complete';
        this.game.allClearTime = 0;
        if (allCollected) {
          this.sound.finale();
          navigator.vibrate?.([35, 35, 65, 40, 95]);
        }
        this.notifyGame();
      }
    }

    if (this.game.phase === 'all-complete') {
      this.game.allClearTime += delta;
      if (this.game.allClearTime >= 6.2) {
        this.game.phase = 'finished';
        this.notifyGame();
      }
    }
  }

  beginLightCollection() {
    this.clearCreatureReactions();
    this.game.phase = 'light-collect';
    this.game.absorbTime = 0;
    this.sound.collect();
    navigator.vibrate?.(22);
    this.notifyGame();
  }

  awardLightStamp() {
    const key = this.activeKey;
    this.collectedStamps.add(key);
    this.saveCollectedStamps();
    this.game.phase = 'stamp';
    this.game.stampTime = 0;
    this.game.newStamp = key;
    this.sound.stamp();
    navigator.vibrate?.([18, 30, 45]);
    this.notifyGame();
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
    if (this.game.count === 2) this.game.bubbleHatTime = 1.8;
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
    this.canvas.classList.add('is-interactive');
    this.notifyGame();
  }

  updateWhaleGame(delta) {
    if (this.game.charging) this.game.charge = Math.min(1, this.game.charge + delta * 0.92);
  }

  launchWhaleStar(power) {
    if (this.game.phase !== 'whale-charge') return;
    this.sound.splash(power);
    navigator.vibrate?.(28);
    this.game.count += 1;
    this.game.wavePulse = 0;
    if (power < 0.55) this.game.whaleOopsTime = 1.15;
    this.game.launches.push({
      x: this.gameAnchor.x,
      y: this.gameAnchor.y - this.gameAnchor.size * 0.38,
      power,
      progress: 0,
      drift: (Math.random() - 0.5) * 90
    });
    const blowholeX = this.gameAnchor.x + this.gameAnchor.size * 0.06;
    const blowholeY = this.gameAnchor.y - this.gameAnchor.size * 0.42;
    this.spawnBurst(blowholeX, blowholeY, 'whale');
    this.spawnWhalePlume(blowholeX, blowholeY, power);
    if (this.game.count >= this.game.total) {
      this.game.waveTime = 0;
      this.game.phase = 'whale-rise';
      this.game.charging = false;
      this.clearGameControls();
      this.notifyGame();
    }
    else this.notifyGame();
  }

  beginTurtleGame() {
    this.game.phase = 'turtle-polish';
    this.canvas.classList.add('is-interactive');
    this.createTurtleControl();
    this.notifyGame();
  }

  createTurtleControl() {
    const button = this.createGameButton({
      label: 'カメの甲羅を指でぐるぐる磨く',
      className: 'game-action-target game-action-target--turtle'
    });
    button.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      button.setPointerCapture?.(event.pointerId);
      this.game.rubbing = true;
      this.game.moved = false;
      this.sound.ensureContext();
      this.game.lastRubPoint = this.eventPoint(event);
      this.game.lastRubMove = performance.now();
    });
    button.addEventListener('pointermove', (event) => {
      if (!this.game.rubbing) return;
      event.preventDefault();
      this.processTurtlePolish(event);
    });
    const finish = () => {
      this.game.rubbing = false;
      this.game.lastRubPoint = null;
    };
    button.addEventListener('pointerup', finish);
    button.addEventListener('pointercancel', finish);
    button.addEventListener('click', (event) => {
      event.preventDefault();
      if (this.game.moved) {
        this.game.moved = false;
        return;
      }
      this.addTurtlePolish(0.75);
    });
  }

  updateTurtleGame(delta) {
    const size = Math.max(110, this.gameAnchor.size);
    this.positionControl(
      this.game.control,
      this.gameAnchor.x,
      this.gameAnchor.y,
      Math.max(210, size * 1.4),
      Math.max(130, size * 0.78)
    );
    if (this.game.rubbing && performance.now() - this.game.lastRubMove < 190) {
      this.addTurtlePolish(delta);
    }
  }

  processTurtlePolish(event) {
    if (this.game.phase !== 'turtle-polish') return;
    const point = this.eventPoint(event);
    const previous = this.game.lastRubPoint;
    this.game.lastRubPoint = point;
    if (!previous) return;
    const distance = Math.hypot(point.x - previous.x, point.y - previous.y);
    if (distance < 2) return;
    this.game.moved = true;
    this.game.lastRubMove = performance.now();
    this.game.traceTrail.push({ x: point.x, y: point.y });
  }

  addTurtlePolish(seconds) {
    if (this.game.phase !== 'turtle-polish') return;
    const previous = this.game.rubProgress;
    this.game.rubProgress = Math.min(TURTLE_POLISH_SECONDS, previous + seconds);
    const step = Math.min(2, Math.floor(this.game.rubProgress));
    if (step > this.game.rubSoundStep) {
      this.game.rubSoundStep = step;
      this.sound.polish(step);
      navigator.vibrate?.(12);
      this.spawnBurst(this.gameAnchor.x, this.gameAnchor.y, 'turtle');
    }
    this.game.count = Math.min(this.game.total, Math.floor(this.game.rubProgress + 0.01));
    if (this.game.rubProgress >= TURTLE_POLISH_SECONDS) {
      this.startCelebrate('turtle');
    } else if (Math.floor(previous) !== Math.floor(this.game.rubProgress)) {
      this.notifyGame();
    }
  }

  startCelebrate(key) {
    this.game.phase = `${key}-celebrate`;
    this.game.celebrateTime = 0;
    this.game.charging = false;
    this.game.rubbing = false;
    this.canvas.classList.remove('is-interactive');
    this.clearGameControls();
    this.sound.success(key);
    this.sound.comic(key);
    navigator.vibrate?.([30, 35, 55]);
    this.notifyGame();
  }

  updateComicReaction() {
    const reaction = {
      jellyfish: 'jelly-balloon',
      whale: 'whale-surprised',
      turtle: 'turtle-dizzy'
    }[this.activeKey];
    this.controllers.forEach(({ key, controller }) => {
      controller.setReaction?.(key === this.activeKey ? reaction : null, this.game.celebrateTime);
    });

    if (
      this.activeKey === 'whale'
      && this.game.celebrateTime >= 0.62
      && !this.game.duckParadeStarted
    ) {
      this.game.duckParadeStarted = true;
      this.spawnWhaleDuckParade();
    }
  }

  clearCreatureReactions() {
    this.controllers.forEach(({ controller }) => controller.setReaction?.());
  }

  handlePointer(event) {
    if (this.game.phase === 'whale-charge') {
      if (event.type === 'pointerdown' && !this.game.charging) {
        event.preventDefault();
        this.canvas.setPointerCapture?.(event.pointerId);
        this.sound.ensureContext();
        this.game.charging = true;
        this.game.charge = Math.max(0.12, this.game.charge);
      }
      if ((event.type === 'pointerup' || event.type === 'pointercancel') && this.game.charging) {
        event.preventDefault();
        this.game.charging = false;
        this.launchWhaleStar(Math.max(0.48, this.game.charge));
        this.game.charge = 0;
      }
      return;
    }
    if (this.game.phase === 'jelly-rhythm' && event.type === 'pointerdown') {
      const point = this.eventPoint(event);
      const bubble = this.game.bubble;
      if (bubble && Math.hypot(point.x - bubble.x, point.y - bubble.y) <= bubble.radius * 2.2) {
        event.preventDefault();
        this.popJellyBubble();
      }
    }
    if (this.game.phase === 'turtle-polish') {
      if (event.type === 'pointerdown') {
        this.game.rubbing = true;
        this.game.lastRubPoint = this.eventPoint(event);
      }
      if (event.type === 'pointermove' && this.game.rubbing) this.processTurtlePolish(event);
      if (event.type === 'pointerup' || event.type === 'pointercancel') {
        this.game.rubbing = false;
        this.game.lastRubPoint = null;
      }
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
    if (!this.activeKey) return;
    if (!this.gameAnchor) {
      this.drawStampBook();
      return;
    }
    if (this.game.phase === 'intro') {
      this.drawGameLabel(`ドリーミー${this.gameConfig.label}が現れた！`, this.gameConfig.icon);
    }
    if (this.game.phase === 'jelly-rhythm') {
      if (this.game.bubble) this.drawGameBubble(this.game.bubble);
      this.drawGameLabel(`光る泡をタッチ！ ${this.game.count}/${this.game.total}`, '○');
    }
    if (this.game.phase === 'whale-charge') {
      this.drawWhaleBuildWaves();
      this.drawWhaleCharge();
      this.drawGameLabel(`画面を長押ししてみて！ ${this.game.count}/${this.game.total}`, '≈');
    }
    if (this.game.phase === 'whale-rise') {
      this.drawWhaleBuildWaves();
      this.drawGameLabel('チャージMAX！ 大波がくるよ！', '≈');
    }
    if (this.game.phase === 'turtle-polish') {
      this.drawTurtlePolish();
      this.drawGameLabel(`甲羅をぐるぐる磨こう！ ${Math.round(this.game.rubProgress / TURTLE_POLISH_SECONDS * 100)}%`, '◇');
    }

    this.drawRescuedStars();
    this.drawWhaleLaunches();
    this.drawFunnyReactions();
    this.drawDuckSurprise();
    if (this.game.phase.endsWith('celebrate')) this.drawCelebration();
    if (this.game.phase === 'light-collect') {
      this.drawLightAbsorption();
      this.drawGameLabel('光る模型にスマホを向けて、海の光を集めよう！', '✦');
    }
    if (this.game.phase === 'stamp') {
      this.drawStampAward();
      this.drawGameLabel('光るスタンプをゲット！', '★');
    }
    if (this.game.phase === 'complete') {
      const remaining = STAMP_ORDER.filter((key) => !this.collectedStamps.has(key)).length;
      this.drawGameLabel(`スタンプあと${remaining}こ！`, '★');
    }
    if (this.game.phase === 'all-complete') this.drawAllClear();
    if (this.game.phase === 'finished') this.drawAllClear('おしまい');
    this.drawStampBook();
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

  drawWhaleBuildWaves() {
    const ctx = this.ctx;
    const level = Math.max(0, Math.min(3, this.game.count));
    const chargingLift = this.game.charging ? this.game.charge * 0.42 : 0;
    const visualLevel = Math.min(3, level + chargingLift);
    const baseY = Math.min(this.height - 100, this.gameAnchor.y + this.gameAnchor.size * 0.72);
    const rise = visualLevel * Math.max(34, this.gameAnchor.size * 0.18);
    const waveY = baseY - rise;
    const pulse = 1 - Math.pow(1 - Math.min(1, this.game.wavePulse), 3);
    const alpha = 0.24 + visualLevel * 0.15;

    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = Math.min(0.92, alpha * (0.65 + pulse * 0.35));
    const gradient = ctx.createLinearGradient(0, waveY - 50, 0, this.height);
    gradient.addColorStop(0, 'rgba(218,253,255,.72)');
    gradient.addColorStop(0.3, 'rgba(74,222,255,.38)');
    gradient.addColorStop(0.72, 'rgba(90,143,255,.2)');
    gradient.addColorStop(1, 'rgba(126,88,221,0)');
    ctx.fillStyle = gradient;
    ctx.shadowBlur = 20 + visualLevel * 5;
    ctx.shadowColor = '#66e5ff';

    const amplitude = 12 + visualLevel * 8 + Math.sin(this.elapsed * 4.8) * 4;
    ctx.beginPath();
    ctx.moveTo(-30, this.height + 20);
    ctx.lineTo(-30, waveY);
    const segments = 5;
    for (let index = 0; index < segments; index += 1) {
      const startX = this.width * index / segments - 30;
      const endX = this.width * (index + 1) / segments + 30;
      const direction = index % 2 ? -1 : 1;
      ctx.bezierCurveTo(
        startX + (endX - startX) * 0.34,
        waveY - amplitude * direction,
        startX + (endX - startX) * 0.66,
        waveY + amplitude * direction,
        endX,
        waveY
      );
    }
    ctx.lineTo(this.width + 30, this.height + 20);
    ctx.closePath();
    ctx.fill();

    ctx.globalAlpha = Math.min(1, 0.42 + visualLevel * 0.13);
    ctx.strokeStyle = 'rgba(240,255,255,.92)';
    ctx.lineWidth = 3 + visualLevel * 0.55;
    ctx.setLineDash([14, 10]);
    ctx.lineDashOffset = -this.elapsed * (35 + visualLevel * 12);
    ctx.beginPath();
    ctx.moveTo(-20, waveY);
    for (let index = 0; index < segments; index += 1) {
      const startX = this.width * index / segments - 20;
      const endX = this.width * (index + 1) / segments + 20;
      const direction = index % 2 ? -1 : 1;
      ctx.bezierCurveTo(
        startX + (endX - startX) * 0.34,
        waveY - amplitude * direction,
        startX + (endX - startX) * 0.66,
        waveY + amplitude * direction,
        endX,
        waveY
      );
    }
    ctx.stroke();
    ctx.setLineDash([]);
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

  drawTurtlePolish() {
    const ctx = this.ctx;
    const progress = this.game.rubProgress / TURTLE_POLISH_SECONDS;
    const radius = Math.max(58, this.gameAnchor.size * 0.5);
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.translate(this.gameAnchor.x, this.gameAnchor.y);
    ctx.rotate(this.elapsed * (0.75 + progress * 1.4));
    ctx.lineWidth = 6;
    ctx.strokeStyle = 'rgba(211,255,245,.78)';
    ctx.shadowBlur = 16 + progress * 20;
    ctx.shadowColor = progress > 0.66 ? '#ffe0ff' : '#78efd7';
    ctx.beginPath();
    ctx.arc(0, 0, radius, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress);
    ctx.stroke();
    const facets = 5 + Math.floor(progress * 7);
    for (let index = 0; index < facets; index += 1) {
      const angle = index / facets * Math.PI * 2;
      const distance = radius * (0.38 + (index % 3) * 0.14);
      ctx.fillStyle = ['#b6fff0', '#fff0a8', '#ffb9e2', '#b9c8ff'][index % 4];
      this.diamondPath(ctx, 5 + progress * 7, Math.cos(angle) * distance, Math.sin(angle) * distance);
      ctx.fill();
    }
    ctx.restore();

    // 小さな子にも回す方向が伝わる、甲羅を囲む時計回りの矢印。
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.strokeStyle = 'rgba(235,255,250,.88)';
    ctx.fillStyle = 'rgba(255,241,166,.95)';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.shadowBlur = 14;
    ctx.shadowColor = '#79f1d4';
    ctx.setLineDash([10, 7]);
    const guideRadius = radius * 1.14;
    for (const startAngle of [-Math.PI * 0.8, Math.PI * 0.2]) {
      const endAngle = startAngle + Math.PI * 0.72;
      ctx.beginPath();
      ctx.arc(this.gameAnchor.x, this.gameAnchor.y, guideRadius, startAngle, endAngle);
      ctx.stroke();
      const tipX = this.gameAnchor.x + Math.cos(endAngle) * guideRadius;
      const tipY = this.gameAnchor.y + Math.sin(endAngle) * guideRadius;
      const tangent = endAngle + Math.PI / 2;
      ctx.beginPath();
      ctx.moveTo(tipX, tipY);
      ctx.lineTo(tipX - Math.cos(tangent - 0.62) * 14, tipY - Math.sin(tangent - 0.62) * 14);
      ctx.lineTo(tipX - Math.cos(tangent + 0.62) * 14, tipY - Math.sin(tangent + 0.62) * 14);
      ctx.closePath();
      ctx.fill();
    }
    ctx.setLineDash([]);
    ctx.restore();

    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.strokeStyle = '#ffb9dc';
    ctx.lineWidth = 7;
    ctx.globalAlpha = 0.48 + progress * 0.34;
    ctx.shadowBlur = 14;
    ctx.shadowColor = '#8fffe1';
    ctx.beginPath();
    this.game.traceTrail.slice(-34).forEach((point, index) => {
      index ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y);
    });
    ctx.stroke();
    ctx.restore();
    this.game.traceTrail = this.game.traceTrail.slice(-42);
  }

  drawCelebration() {
    if (this.activeKey === 'jellyfish') this.drawRainbowRings();
    if (this.activeKey === 'whale') this.drawWhaleCelebration();
    if (this.activeKey === 'turtle') this.drawTurtleCelebration();
    const label = this.activeKey === 'turtle' ? 'カメ' : this.gameConfig.label;
    this.drawGameLabel(`${label}、クリア！`, '★');
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
    const waveProgress = Math.min(1, this.game.celebrateTime / 1.75);
    const waveY = this.height * (1.13 - waveProgress * 1.38);
    const waveAlpha = waveProgress < 0.72 ? 1 : Math.max(0, (1 - waveProgress) / 0.28);
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = waveAlpha;
    const waveGradient = ctx.createLinearGradient(0, waveY - 120, 0, this.height);
    waveGradient.addColorStop(0, 'rgba(221,252,255,.82)');
    waveGradient.addColorStop(0.18, 'rgba(106,229,255,.68)');
    waveGradient.addColorStop(0.55, 'rgba(112,158,255,.4)');
    waveGradient.addColorStop(1, 'rgba(213,156,255,.08)');
    ctx.fillStyle = waveGradient;
    ctx.shadowBlur = 26;
    ctx.shadowColor = '#78e8ff';
    ctx.beginPath();
    ctx.moveTo(-80, this.height + 80);
    ctx.lineTo(-80, waveY + 20);
    const waveWidth = this.width / 3;
    ctx.bezierCurveTo(
      waveWidth * 0.45,
      waveY - 85,
      waveWidth * 0.72,
      waveY + 86,
      waveWidth,
      waveY - 18
    );
    ctx.bezierCurveTo(
      waveWidth * 1.35,
      waveY - 104,
      waveWidth * 1.7,
      waveY + 78,
      waveWidth * 2,
      waveY - 8
    );
    ctx.bezierCurveTo(
      waveWidth * 2.35,
      waveY - 92,
      waveWidth * 2.72,
      waveY + 64,
      this.width + 80,
      waveY - 22
    );
    ctx.lineTo(this.width + 80, this.height + 80);
    ctx.closePath();
    ctx.fill();

    ctx.lineWidth = 5;
    ctx.strokeStyle = 'rgba(255,255,255,.74)';
    ctx.setLineDash([18, 12]);
    ctx.lineDashOffset = -this.game.celebrateTime * 90;
    ctx.beginPath();
    ctx.moveTo(-40, waveY + 8);
    ctx.bezierCurveTo(this.width * 0.18, waveY - 76, this.width * 0.34, waveY + 68, this.width * 0.5, waveY - 12);
    ctx.bezierCurveTo(this.width * 0.68, waveY - 78, this.width * 0.82, waveY + 62, this.width + 40, waveY - 16);
    ctx.stroke();
    ctx.setLineDash([]);

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
    for (let index = 0; index < 10; index += 1) {
      const x = (index * 83 + this.game.celebrateTime * 110) % (this.width + 80) - 40;
      const y = waveY - 18 - Math.sin(index * 1.7) * 46;
      ctx.fillStyle = index % 2 ? '#fff1a8' : '#dffcff';
      index % 3 === 0
        ? this.starPath(ctx, 5 + index % 4, x, y, this.elapsed + index)
        : this.bubblePath(ctx, 4 + index % 5, x, y);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  drawTurtleCelebration() {
    const ctx = this.ctx;
    const radius = Math.max(88, this.gameAnchor.size * 0.58);
    const reveal = Math.min(1, this.game.celebrateTime / 0.75);
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.translate(this.gameAnchor.x, this.gameAnchor.y);
    ctx.rotate(this.game.celebrateTime * 0.45);
    const gemGlow = ctx.createRadialGradient(0, 0, 4, 0, 0, radius);
    gemGlow.addColorStop(0, `rgba(255,255,255,${0.42 * reveal})`);
    gemGlow.addColorStop(0.38, `rgba(128,255,226,${0.24 * reveal})`);
    gemGlow.addColorStop(0.72, `rgba(255,175,231,${0.15 * reveal})`);
    gemGlow.addColorStop(1, 'rgba(155,125,255,0)');
    ctx.fillStyle = gemGlow;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(239,255,251,.78)';
    ctx.lineWidth = 3;
    ctx.shadowBlur = 25;
    ctx.shadowColor = '#8fffe1';
    this.diamondPath(ctx, radius * (0.46 + reveal * 0.1));
    ctx.stroke();
    ['#8ff5db', '#fff09b', '#ffb7dc'].forEach((color, index) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = 4;
      ctx.globalAlpha = 0.65 - index * 0.12;
      ctx.beginPath();
      ctx.ellipse(0, 0, radius * (0.75 + index * 0.2), radius * (0.42 + index * 0.12), index * 0.6, 0, Math.PI * 2);
      ctx.stroke();
    });
    for (let index = 0; index < 12; index += 1) {
      const angle = index / 12 * Math.PI * 2 + this.game.celebrateTime * 0.55;
      const distance = radius * (0.45 + (index % 3) * 0.22);
      ctx.fillStyle = ['#e7fff9', '#fff2a8', '#ffc6e7', '#c8c6ff'][index % 4];
      ctx.shadowBlur = 20;
      ctx.shadowColor = ctx.fillStyle;
      this.diamondPath(ctx, 7 + index % 4, Math.cos(angle) * distance, Math.sin(angle) * distance);
      ctx.fill();
    }
    ctx.restore();
  }

  drawStampBook() {
    const ctx = this.ctx;
    const y = Math.max(108, Math.min(136, this.height * 0.16));
    const panelWidth = 148;
    const panelHeight = 61;
    ctx.save();
    ctx.fillStyle = 'rgba(15,10,38,.64)';
    ctx.strokeStyle = 'rgba(255,255,255,.3)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    this.roundedRect(ctx, 10, y - 14, panelWidth, panelHeight, 17);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.88)';
    ctx.font = '800 9px -apple-system, BlinkMacSystemFont, "Hiragino Sans", sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('ひかりスタンプ', 19, y - 3);

    STAMP_ORDER.forEach((key, index) => {
      const x = 32 + index * 44;
      const slotY = y + 23;
      const isLanding = this.game.phase === 'stamp'
        && this.game.newStamp === key
        && this.game.stampTime < STAMP_SECONDS;
      if (this.collectedStamps.has(key) && !isLanding) {
        this.drawStampPortrait(key, x, slotY, 33, 0.92, (index - 1) * 0.08);
      } else {
        ctx.save();
        ctx.globalAlpha = 0.48;
        ctx.strokeStyle = 'rgba(255,255,255,.55)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.arc(x, slotY, 16, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(255,255,255,.62)';
        ctx.font = '700 13px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(['✦', '≈', '◇'][index], x, slotY + 1);
        ctx.restore();
      }
    });
    ctx.restore();
  }

  drawStampPortrait(key, x, y, size, alpha = 1, rotation = 0) {
    const ctx = this.ctx;
    const image = this.stampImages[key];
    const colors = {
      jellyfish: ['#d7b8ff', '#ffb8e7'],
      whale: ['#71e5ff', '#6da1ff'],
      turtle: ['#82f0d1', '#ffe58a']
    }[key];
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y);
    ctx.rotate(rotation);
    ctx.shadowBlur = 13;
    ctx.shadowColor = colors[0];
    ctx.fillStyle = 'rgba(20,13,50,.72)';
    ctx.strokeStyle = colors[0];
    ctx.lineWidth = Math.max(2, size * 0.07);
    ctx.beginPath();
    ctx.arc(0, 0, size / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.clip();
    if (image?.complete && image.naturalWidth) {
      ctx.globalAlpha = alpha * 0.82;
      ctx.drawImage(image, -size * 0.55, -size * 0.55, size * 1.1, size * 1.1);
    } else {
      ctx.globalAlpha = alpha;
      ctx.fillStyle = colors[1];
      ctx.font = `800 ${size * 0.46}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(key === 'jellyfish' ? '✦' : key === 'whale' ? '≈' : '◇', 0, 1);
    }
    ctx.restore();
  }

  drawLightAbsorption() {
    const ctx = this.ctx;
    const progress = Math.min(1, this.game.absorbTime / LIGHT_COLLECT_SECONDS);
    const sourceX = this.gameAnchor.x;
    const sourceY = this.gameAnchor.y + this.gameAnchor.size * 0.04;
    const focusX = this.width * 0.5;
    const focusY = Math.max(155, Math.min(this.height * 0.34, sourceY - this.gameAnchor.size * 0.8));
    const colors = this.gameConfig.effect.colors;
    const fadeIn = Math.min(1, progress * 5);
    const fadeOut = Math.min(1, (1 - progress) * 7);
    const envelope = Math.min(fadeIn, fadeOut);
    const span = Math.hypot(focusX - sourceX, focusY - sourceY);

    ctx.save();
    ctx.globalCompositeOperation = 'screen';

    const sourceGlow = ctx.createRadialGradient(sourceX, sourceY, 2, sourceX, sourceY, Math.max(62, this.gameAnchor.size * 0.62));
    sourceGlow.addColorStop(0, `rgba(255,255,255,${0.58 * envelope})`);
    sourceGlow.addColorStop(0.28, this.hexToRgba(colors[1] || colors[0], 0.34 * envelope));
    sourceGlow.addColorStop(1, this.hexToRgba(colors[0], 0));
    ctx.fillStyle = sourceGlow;
    ctx.beginPath();
    ctx.arc(sourceX, sourceY, Math.max(62, this.gameAnchor.size * 0.62), 0, Math.PI * 2);
    ctx.fill();

    for (let ribbon = 0; ribbon < 5; ribbon += 1) {
      const side = ribbon % 2 ? -1 : 1;
      const spread = (48 + ribbon * 24) * side;
      const controlX1 = sourceX + (focusX - sourceX) * 0.14 + spread * 1.15;
      const controlY1 = sourceY + (focusY - sourceY) * 0.18;
      const controlX2 = focusX - (focusX - sourceX) * 0.16 - spread * 1.05;
      const controlY2 = focusY - (focusY - sourceY) * 0.18;
      const ribbonGradient = ctx.createLinearGradient(sourceX, sourceY, focusX, focusY);
      ribbonGradient.addColorStop(0, this.hexToRgba(colors[ribbon % colors.length], 0.08));
      ribbonGradient.addColorStop(0.46, this.hexToRgba(colors[(ribbon + 1) % colors.length], 0.72 * envelope));
      ribbonGradient.addColorStop(1, 'rgba(255,255,255,.88)');
      ctx.strokeStyle = ribbonGradient;
      ctx.lineWidth = 3.8 + ribbon % 3 * 2;
      ctx.shadowBlur = 18;
      ctx.shadowColor = colors[(ribbon + 1) % colors.length];
      ctx.setLineDash([18 + ribbon * 2, 14]);
      ctx.lineDashOffset = -this.game.absorbTime * (145 + ribbon * 18);
      ctx.beginPath();
      ctx.moveTo(sourceX, sourceY);
      ctx.bezierCurveTo(controlX1, controlY1, controlX2, controlY2, focusX, focusY);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    const dx = focusX - sourceX;
    const dy = focusY - sourceY;
    const length = Math.max(1, Math.hypot(dx, dy));
    const normalX = -dy / length;
    const normalY = dx / length;
    const particleCount = this.profile.lowPower ? 20 : 42;
    for (let index = 0; index < particleCount; index += 1) {
      const t = (progress * 1.9 + index / particleCount) % 1;
      const eased = 1 - Math.pow(1 - t, 1.7);
      const spiral = Math.sin(t * Math.PI * 6 + index * 1.73);
      const radius = (1 - t) * Math.min(118, span * 0.38) * (0.38 + index % 5 * 0.12);
      const x = sourceX + dx * eased + normalX * spiral * radius;
      const y = sourceY + dy * eased + normalY * spiral * radius;
      const size = 2 + (index % 5) * 0.9 + t * 2.2;
      const alpha = Math.sin(t * Math.PI) * envelope;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = colors[index % colors.length];
      ctx.shadowBlur = 10 + t * 12;
      ctx.shadowColor = ctx.fillStyle;
      if (index % 6 === 0) {
        this.starPath(ctx, size * 1.25, x, y, this.elapsed * 2 + index);
      } else {
        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
      }
      ctx.fill();
    }

    ctx.globalAlpha = Math.min(1, 0.45 + progress * 0.7);
    const focusRadius = 18 + Math.sin(progress * Math.PI) * 24;
    const focusGlow = ctx.createRadialGradient(focusX, focusY, 0, focusX, focusY, focusRadius * 2.4);
    focusGlow.addColorStop(0, 'rgba(255,255,255,.98)');
    focusGlow.addColorStop(0.25, this.hexToRgba(colors[1] || colors[0], 0.82));
    focusGlow.addColorStop(1, this.hexToRgba(colors[0], 0));
    ctx.fillStyle = focusGlow;
    ctx.beginPath();
    ctx.arc(focusX, focusY, focusRadius * 2.4, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = envelope * 0.8;
    ctx.strokeStyle = 'rgba(235,255,255,.9)';
    ctx.lineWidth = 2.5;
    for (let ring = 0; ring < 3; ring += 1) {
      ctx.beginPath();
      ctx.ellipse(
        focusX,
        focusY,
        25 + ring * 16 + Math.sin(this.elapsed * 4 + ring) * 5,
        9 + ring * 5,
        this.elapsed * (ring % 2 ? -0.7 : 0.7),
        0,
        Math.PI * 2
      );
      ctx.stroke();
    }
    ctx.restore();
  }

  drawStampAward() {
    const progress = Math.min(1, this.game.stampTime / STAMP_SECONDS);
    const eased = 1 - Math.pow(1 - progress, 3);
    const index = Math.max(0, STAMP_ORDER.indexOf(this.game.newStamp));
    const targetY = Math.max(108, Math.min(136, this.height * 0.16)) + 23;
    const targetX = 32 + index * 44;
    const startX = this.width * 0.5;
    const startY = Math.max(155, this.height * 0.3);
    const x = startX + (targetX - startX) * eased;
    const y = startY + (targetY - startY) * eased - Math.sin(progress * Math.PI) * 46;
    const size = 78 - eased * 45;
    const ctx = this.ctx;

    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = Math.sin(progress * Math.PI) * 0.75;
    ctx.strokeStyle = '#fff5bd';
    ctx.lineWidth = 4;
    ctx.shadowBlur = 22;
    ctx.shadowColor = this.gameConfig.effect.colors[1] || this.gameConfig.effect.colors[0];
    ctx.beginPath();
    ctx.arc(x, y, size * (0.72 + progress * 0.45), 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    this.drawStampPortrait(this.game.newStamp, x, y, size, 1, (1 - progress) * -0.24);
  }

  drawAllClear(label = '海の光、コンプリート！') {
    const ctx = this.ctx;
    const time = this.game.allClearTime;
    const reveal = Math.min(1, time / 0.9);
    const gather = 1 - Math.pow(1 - Math.min(1, time / 1.35), 3);
    const finale = Math.max(0, Math.min(1, (time - 1.05) / 1.75));
    const cx = this.width / 2;
    const cy = this.height * 0.46;
    const radius = Math.min(this.width, this.height) * 0.36;

    ctx.save();
    ctx.globalAlpha = 0.3 * reveal;
    const deepOcean = ctx.createLinearGradient(0, 0, 0, this.height);
    deepOcean.addColorStop(0, 'rgba(5,17,56,.3)');
    deepOcean.addColorStop(0.5, 'rgba(8,39,82,.52)');
    deepOcean.addColorStop(1, 'rgba(31,12,67,.5)');
    ctx.fillStyle = deepOcean;
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.restore();

    // 海面から差し込む光。画面全体を使うが、カメラ映像は残す。
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const beamCount = this.profile.lowPower ? 3 : 7;
    for (let index = 0; index < beamCount; index += 1) {
      const topX = this.width * (0.08 + index / Math.max(1, beamCount - 1) * 0.84);
      const sway = Math.sin(time * 0.42 + index * 1.7) * this.width * 0.025;
      const beamWidth = this.width * (0.07 + index % 3 * 0.018);
      const beam = ctx.createLinearGradient(0, 0, 0, cy + radius);
      beam.addColorStop(0, `rgba(201,249,255,${0.16 * reveal})`);
      beam.addColorStop(0.54, `rgba(105,220,255,${0.075 * reveal})`);
      beam.addColorStop(1, 'rgba(119,148,255,0)');
      ctx.fillStyle = beam;
      ctx.beginPath();
      ctx.moveTo(topX - beamWidth, 0);
      ctx.lineTo(topX + beamWidth, 0);
      ctx.lineTo(cx + sway + beamWidth * 0.42, cy + radius);
      ctx.lineTo(cx + sway - beamWidth * 0.42, cy + radius);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

    // 水面の反射模様。無限ミラーのように奥へ重なる。
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.lineWidth = 2;
    ctx.shadowBlur = 12;
    ctx.shadowColor = '#89eaff';
    const causticRows = this.profile.lowPower ? 3 : 7;
    for (let row = 0; row < causticRows; row += 1) {
      const y = this.height * (0.16 + row * 0.105);
      ctx.globalAlpha = reveal * (0.16 + row % 2 * 0.05);
      ctx.strokeStyle = row % 3 === 0 ? '#d7fbff' : row % 3 === 1 ? '#8de9ff' : '#c8a9ff';
      ctx.beginPath();
      ctx.moveTo(-30, y);
      for (let segment = 0; segment < 5; segment += 1) {
        const startX = this.width * segment / 5;
        const endX = this.width * (segment + 1) / 5 + 30;
        const lift = Math.sin(time * 1.15 + row + segment * 1.4) * 12;
        ctx.bezierCurveTo(
          startX + this.width * 0.06,
          y - 13 - lift,
          endX - this.width * 0.06,
          y + 13 + lift,
          endX,
          y
        );
      }
      ctx.stroke();
    }
    ctx.restore();

    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius * 1.6);
    glow.addColorStop(0, `rgba(255,255,255,${0.48 * reveal})`);
    glow.addColorStop(0.26, `rgba(144,235,255,${0.3 * reveal})`);
    glow.addColorStop(0.6, `rgba(210,151,255,${0.18 * reveal})`);
    glow.addColorStop(1, 'rgba(118,255,219,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, this.width, this.height);

    const mirrorColors = ['#ffb8e7', '#71e5ff', '#82f0d1', '#d7f8ff', '#b599ff', '#7fe9ff'];
    mirrorColors.forEach((color, index) => {
      const depth = index / mirrorColors.length;
      ctx.globalAlpha = reveal * (0.74 - depth * 0.42);
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(1.5, 5 - index * 0.55);
      ctx.shadowBlur = 26 - index * 2;
      ctx.shadowColor = color;
      ctx.beginPath();
      ctx.ellipse(
        cx,
        cy,
        radius * (0.5 + index * 0.18) + Math.sin(time * 1.8 + index) * 7,
        radius * (0.34 + index * 0.125) + Math.cos(time * 1.5 + index) * 5,
        time * (index % 2 ? -0.055 : 0.055),
        0,
        Math.PI * 2
      );
      ctx.stroke();
    });
    ctx.restore();

    // フィナーレ中盤に、光る大波が下から画面を横切る。
    if (finale > 0 && finale < 1) {
      const waveY = this.height * (1.08 - finale * 0.78);
      const waveAlpha = Math.sin(finale * Math.PI) * 0.62;
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = waveAlpha;
      const wave = ctx.createLinearGradient(0, waveY - 90, 0, this.height);
      wave.addColorStop(0, 'rgba(226,255,255,.82)');
      wave.addColorStop(0.3, 'rgba(93,224,255,.46)');
      wave.addColorStop(0.72, 'rgba(123,129,255,.2)');
      wave.addColorStop(1, 'rgba(187,126,255,0)');
      ctx.fillStyle = wave;
      ctx.beginPath();
      ctx.moveTo(-50, this.height + 20);
      ctx.lineTo(-50, waveY);
      ctx.bezierCurveTo(this.width * 0.18, waveY - 74, this.width * 0.34, waveY + 52, this.width * 0.5, waveY - 14);
      ctx.bezierCurveTo(this.width * 0.68, waveY - 82, this.width * 0.83, waveY + 58, this.width + 50, waveY - 20);
      ctx.lineTo(this.width + 50, this.height + 20);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(244,255,255,.88)';
      ctx.lineWidth = 4;
      ctx.setLineDash([18, 12]);
      ctx.lineDashOffset = -time * 95;
      ctx.beginPath();
      ctx.moveTo(-30, waveY);
      ctx.bezierCurveTo(this.width * 0.18, waveY - 72, this.width * 0.34, waveY + 50, this.width * 0.5, waveY - 12);
      ctx.bezierCurveTo(this.width * 0.68, waveY - 78, this.width * 0.83, waveY + 55, this.width + 30, waveY - 18);
      ctx.stroke();
      ctx.restore();
    }

    STAMP_ORDER.forEach((key, index) => {
      const angle = -Math.PI / 2 + (index - 1) * 0.78 + time * (index === 1 ? -0.035 : 0.035);
      const distance = radius * (0.5 + Math.sin(time * 0.8 + index) * 0.025);
      const targetX = cx + Math.cos(angle) * distance;
      const targetY = cy + Math.sin(angle) * distance;
      const stampY = Math.max(108, Math.min(136, this.height * 0.16)) + 23;
      const startX = 32 + index * 44;
      this.drawStampPortrait(
        key,
        startX + (targetX - startX) * gather,
        stampY + (targetY - stampY) * gather - Math.sin(gather * Math.PI) * 58,
        33 + gather * 43,
        reveal,
        (1 - gather) * (index - 1) * 0.15 + Math.sin(time + index) * 0.06
      );
    });

    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const sparkleCount = this.profile.lowPower ? 14 : 30;
    for (let index = 0; index < sparkleCount; index += 1) {
      const angle = index / sparkleCount * Math.PI * 2 + time * 0.24;
      const distance = radius * (0.72 + (index % 4) * 0.16);
      ctx.fillStyle = ['#fff3a8', '#d4faff', '#ffc4eb', '#b9ffe9'][index % 4];
      ctx.globalAlpha = reveal * (0.55 + index % 3 * 0.16);
      this.starPath(ctx, 4 + index % 5, cx + Math.cos(angle) * distance, cy + Math.sin(angle) * distance, angle);
      ctx.fill();
    }

    const bubbleCount = this.profile.lowPower ? 10 : 22;
    for (let index = 0; index < bubbleCount; index += 1) {
      const loop = (time * (0.12 + index % 4 * 0.018) + index / bubbleCount) % 1;
      const x = (index * 83 % Math.max(1, this.width)) + Math.sin(time + index) * 18;
      const y = this.height * (1.06 - loop * 1.14);
      const bubbleSize = 3 + index % 5 * 1.5;
      ctx.globalAlpha = reveal * Math.sin(loop * Math.PI) * 0.55;
      ctx.strokeStyle = index % 3 === 0 ? '#ffd1ef' : '#c8f6ff';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(x, y, bubbleSize, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.globalAlpha = reveal;
    const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, 62 + Math.sin(time * 2) * 8);
    core.addColorStop(0, 'rgba(255,255,255,.96)');
    core.addColorStop(0.18, 'rgba(255,239,168,.72)');
    core.addColorStop(0.5, 'rgba(121,236,255,.32)');
    core.addColorStop(1, 'rgba(189,142,255,0)');
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(cx, cy, 70, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff5ad';
    ctx.shadowBlur = 28;
    ctx.shadowColor = '#91eaff';
    this.starPath(ctx, 15 + Math.sin(time * 2.4) * 2, cx, cy, time * 0.35);
    ctx.fill();
    ctx.restore();
    this.drawGameLabel(label, '✦');
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

  drawFunnyReactions() {
    if (!this.gameAnchor) return;
    const ctx = this.ctx;
    if (this.game.phase === 'jellyfish-celebrate') this.drawJellyBalloonReaction();
    if (this.game.phase === 'turtle-celebrate') this.drawTurtleDizzyReaction();

    if (this.game.bubbleHatTime > 0) {
      const age = 1.8 - this.game.bubbleHatTime;
      const alpha = Math.min(1, this.game.bubbleHatTime * 1.7);
      const radius = Math.max(28, this.gameAnchor.size * 0.22);
      const originX = this.gameAnchor.x;
      const originY = this.gameAnchor.y - this.gameAnchor.size * 0.34;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.globalCompositeOperation = 'screen';
      ctx.shadowBlur = 14;
      ctx.shadowColor = '#a9ebff';
      for (let index = 0; index < 12; index += 1) {
        const progress = (age * (0.46 + index % 3 * 0.08) + index * 0.083) % 1;
        const bubbleRadius = Math.max(4, radius * (0.13 + index % 4 * 0.045));
        const spread = radius * (0.9 - progress * 0.22);
        const x = originX + Math.sin(index * 2.17 + age * 4.2) * spread;
        const y = originY - progress * radius * 2.25 + Math.cos(index * 1.31) * radius * 0.2;
        ctx.globalAlpha = alpha * Math.sin(progress * Math.PI) * 0.86;
        const bubble = ctx.createRadialGradient(
          x - bubbleRadius * 0.32,
          y - bubbleRadius * 0.34,
          bubbleRadius * 0.08,
          x,
          y,
          bubbleRadius
        );
        bubble.addColorStop(0, 'rgba(255,255,255,.9)');
        bubble.addColorStop(0.28, 'rgba(182,238,255,.28)');
        bubble.addColorStop(0.74, 'rgba(201,174,255,.15)');
        bubble.addColorStop(1, 'rgba(143,222,255,.5)');
        ctx.fillStyle = bubble;
        ctx.strokeStyle = index % 3 === 0 ? '#ffd0ed' : '#def9ff';
        ctx.lineWidth = 1.5 + index % 2;
        ctx.beginPath();
        ctx.arc(x, y, bubbleRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        if (index % 3 === 0) {
          ctx.fillStyle = '#fff4b0';
          this.starPath(ctx, Math.max(2.5, bubbleRadius * 0.32), x + bubbleRadius * 0.7, y - bubbleRadius * 0.6, age + index);
          ctx.fill();
        }
      }
      ctx.restore();
    }

    if (this.game.whaleOopsTime > 0) {
      const alpha = Math.min(1, this.game.whaleOopsTime * 1.7);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.globalCompositeOperation = 'screen';
      ctx.fillStyle = '#dffcff';
      ctx.font = '900 30px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.shadowBlur = 14;
      ctx.shadowColor = '#6ee7ff';
      ctx.fillText('？', this.gameAnchor.x + this.gameAnchor.size * 0.34, this.gameAnchor.y - this.gameAnchor.size * 0.28);
      ctx.beginPath();
      ctx.ellipse(
        this.gameAnchor.x + this.gameAnchor.size * 0.04,
        this.gameAnchor.y - this.gameAnchor.size * 0.48,
        6,
        12,
        -0.25,
        0,
        Math.PI * 2
      );
      ctx.fill();
      ctx.restore();
    }

  }

  drawJellyBalloonReaction() {
    const time = this.game.celebrateTime;
    if (time > 1.16 && time < 1.34) return;
    const ctx = this.ctx;
    const inflation = time < 0.56
      ? 1 - Math.pow(1 - time / 0.56, 3)
      : Math.max(0, 1 - (time - 1.34) / 0.74);
    const radius = Math.max(48, this.gameAnchor.size * (0.5 + inflation * 0.12));

    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = Math.min(0.88, 0.38 + inflation * 0.5);
    ctx.strokeStyle = '#eafcff';
    ctx.lineWidth = 3.2;
    ctx.shadowBlur = 22;
    ctx.shadowColor = '#d3a8ff';
    ctx.beginPath();
    ctx.arc(this.gameAnchor.x, this.gameAnchor.y, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha *= 0.78;
    ctx.strokeStyle = '#ffbfe9';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(
      this.gameAnchor.x - radius * 0.18,
      this.gameAnchor.y - radius * 0.2,
      radius * 0.72,
      Math.PI * 1.08,
      Math.PI * 1.62
    );
    ctx.stroke();

    if (time >= 0.96) {
      const leak = Math.min(1, (time - 0.96) / 0.58);
      for (let index = 0; index < 6; index += 1) {
        const x = this.gameAnchor.x + radius * 0.72 + leak * (28 + index * 12);
        const y = this.gameAnchor.y + Math.sin(index * 1.8 + time * 12) * (5 + index);
        ctx.globalAlpha = (1 - leak * 0.45) * (0.68 - index * 0.075);
        ctx.strokeStyle = index % 2 ? '#d8f8ff' : '#ffd1ef';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(x, y, 4 + index * 0.7, Math.PI * 0.25, Math.PI * 1.75);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  drawTurtleDizzyReaction() {
    const time = this.game.celebrateTime;
    const ctx = this.ctx;
    const alpha = Math.min(1, time * 4) * Math.max(0, 1 - (time - 1.8) / 0.5);
    const radius = Math.max(56, this.gameAnchor.size * 0.52);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.globalCompositeOperation = 'screen';
    for (let index = 0; index < 7; index += 1) {
      const angle = time * 3.6 + index / 7 * Math.PI * 2;
      const distance = radius * (0.76 + index % 2 * 0.18);
      ctx.fillStyle = ['#fff3a8', '#b9ffe7', '#ffc5e9'][index % 3];
      this.starPath(
        ctx,
        5 + index % 3,
        this.gameAnchor.x + Math.cos(angle) * distance,
        this.gameAnchor.y + Math.sin(angle) * distance * 0.55,
        -angle
      );
      ctx.fill();
    }
    ctx.restore();
  }

  spawnWhaleDuckParade() {
    if (this.game.surpriseChecked || this.game.surpriseUsed) return;
    this.game.surpriseChecked = true;
    if (!this.forceSurprise && Math.random() > SURPRISE_CHANCE) return;
    this.game.surpriseUsed = true;
    const count = this.profile.lowPower ? 4 : 8;
    for (let index = 0; index < count; index += 1) {
      const isLateDuck = index === count - 1;
      const size = isLateDuck ? 24 : 29 + index % 3 * 4;
      this.game.ducks.push({
        x: -size - (isLateDuck ? 0 : index * 13),
        y: this.height * (0.55 + (index % 3) * 0.034),
        vx: isLateDuck ? 365 : 248 + index % 3 * 15,
        rotation: 0,
        size,
        life: 4.2,
        maxLife: 4.2,
        delay: isLateDuck ? 0.82 : index * 0.055,
        age: 0,
        bobPhase: index * 1.23,
        isLateDuck
      });
    }
    this.sound.duck();
  }

  drawDuckSurprise() {
    if (!this.duckImage.complete || !this.duckImage.naturalWidth) return;
    const ctx = this.ctx;
    for (const duck of this.game.ducks) {
      if (duck.delay > 0) continue;
      const alpha = Math.min(1, duck.age * 5, duck.life * 2.2);
      ctx.save();
      ctx.globalAlpha = alpha;
      const bobSpeed = duck.isLateDuck ? 12.5 : 6.4;
      const duckY = duck.y + Math.sin(duck.age * bobSpeed + duck.bobPhase) * (duck.isLateDuck ? 9 : 7);
      if (duck.isLateDuck) {
        ctx.strokeStyle = 'rgba(220,251,255,.86)';
        ctx.lineWidth = 2.4;
        ctx.lineCap = 'round';
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#76e7ff';
        for (let index = 0; index < 3; index += 1) {
          ctx.beginPath();
          ctx.moveTo(duck.x - duck.size * (0.65 + index * 0.34), duckY + (index - 1) * 7);
          ctx.lineTo(duck.x - duck.size * (1.22 + index * 0.45), duckY + (index - 1) * 7);
          ctx.stroke();
        }
      }
      ctx.translate(duck.x, duckY);
      ctx.rotate(duck.rotation);
      ctx.drawImage(this.duckImage, -duck.size / 2, -duck.size / 2, duck.size, duck.size);
      if (duck.isLateDuck && duck.age < 1.15) {
        ctx.rotate(-duck.rotation);
        ctx.fillStyle = '#bff6ff';
        ctx.beginPath();
        ctx.arc(duck.size * 0.54, -duck.size * 0.58, 3.4, 0, Math.PI * 2);
        ctx.arc(duck.size * 0.78, -duck.size * 0.74, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  spawnWhalePlume(x, y, power) {
    const count = 18 + Math.round(power * 12);
    for (let index = 0; index < count; index += 1) {
      const spread = (index / Math.max(1, count - 1) - 0.5) * 1.15;
      const speed = 80 + Math.random() * 95 + power * 70;
      this.particles.push({
        key: 'whale',
        type: index % 6 === 0 ? 'star' : 'drop',
        color: index % 5 === 0 ? '#fff0a8' : index % 2 ? '#dffcff' : '#70e8ff',
        x: x + (Math.random() - 0.5) * 10,
        y,
        vx: Math.sin(spread) * speed * 0.56,
        vy: -Math.cos(spread) * speed,
        rotation: spread,
        spin: (Math.random() - 0.5) * 3,
        size: 4 + Math.random() * 8,
        life: 1,
        decay: 0.62 + Math.random() * 0.42
      });
    }
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
    const y = Math.max(138, Math.min(this.height - 150, this.gameAnchor.y - this.gameAnchor.size * 0.7 - 54));
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

  diamondPath(ctx, radius, offsetX = 0, offsetY = 0) {
    ctx.beginPath();
    ctx.moveTo(offsetX, offsetY - radius);
    ctx.lineTo(offsetX + radius * 0.72, offsetY);
    ctx.lineTo(offsetX, offsetY + radius);
    ctx.lineTo(offsetX - radius * 0.72, offsetY);
    ctx.closePath();
  }

  bubblePath(ctx, radius, offsetX = 0, offsetY = 0) {
    ctx.beginPath();
    ctx.arc(offsetX, offsetY, radius, 0, Math.PI * 2);
    ctx.closePath();
  }

  hexToRgba(hex, alpha) {
    const value = String(hex || '#ffffff').replace('#', '');
    const normalized = value.length === 3
      ? value.split('').map((character) => character + character).join('')
      : value.padEnd(6, 'f').slice(0, 6);
    const number = Number.parseInt(normalized, 16);
    const red = number >> 16 & 255;
    const green = number >> 8 & 255;
    const blue = number & 255;
    return `rgba(${red},${green},${blue},${alpha})`;
  }

  clear() {
    this.ctx.clearRect(0, 0, this.width, this.height);
  }
}
