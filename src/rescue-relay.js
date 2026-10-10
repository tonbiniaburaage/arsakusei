const TAU = Math.PI * 2;
const TARGET_COUNT = 20;
const TRIGGER_SECONDS = 3;

export class RescueRelay {
  constructor({ trigger, triggerProgress, counter, counterValue, instruction, logo, onStatus, onModeChange } = {}) {
    this.trigger = trigger;
    this.triggerProgress = triggerProgress;
    this.counter = counter;
    this.counterValue = counterValue;
    this.instruction = instruction;
    this.logo = logo;
    this.onStatus = onStatus;
    this.onModeChange = onModeChange;
    this.mode = 'idle';
    this.hands = [];
    this.velocity = { x: 0, y: 0 };
    this.speed = 0;
    this.hold = 0;
    this.swipeCooldown = 0;
    this.previousHands = [];
    this.lastInteractionAt = performance.now();
    this.fish = [];
    this.mantas = [];
    this.bursts = [];
    this.count = 0;
    this.finaleTime = 0;
    this.playTime = 0;
    this.currents = [];
    this.seed = 0x52455343;
    this.mantaSprite = typeof Image === 'undefined' ? null : new Image();
    if (this.mantaSprite) this.mantaSprite.src = new URL('../assets/ui/manta-silhouette.png', import.meta.url).href;
    this.updateUi();
  }

  random() {
    this.seed = (this.seed * 1664525 + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }

  isActive() {
    return this.mode === 'playing' || this.mode === 'finale';
  }

  setInteraction({ hands = [], velocity = { x: 0, y: 0 }, speed = 0 } = {}) {
    const now = performance.now();
    const delta = Math.min(0.14, Math.max(0.025, (now - this.lastInteractionAt) / 1000));
    this.lastInteractionAt = now;
    const previousHands = this.previousHands;
    this.hands = hands;
    this.velocity = velocity;
    this.speed = speed;
    if (this.mode === 'playing' && this.swipeCooldown <= 0 && hands.length && previousHands.length) {
      const movedHands = hands.map((hand) => {
        const previous = previousHands.reduce((nearest, candidate) => {
          const distance = Math.hypot(candidate.x - hand.x, candidate.y - hand.y);
          const nearestDistance = Math.hypot(nearest.x - hand.x, nearest.y - hand.y);
          return distance < nearestDistance ? candidate : nearest;
        }, previousHands[0]);
        return {
          hand,
          velocity: { x: (hand.x - previous.x) / delta, y: (hand.y - previous.y) / delta }
        };
      }).filter((entry) => Math.hypot(entry.velocity.x, entry.velocity.y) > 0.12);
      const guided = new Set();
      let remaining = 10;
      for (const entry of movedHands) {
        if (remaining <= 0) break;
        remaining -= this.guideFish(entry.hand, entry.velocity, guided, Math.min(6, remaining));
        this.currents.push({
          x: entry.hand.x,
          y: entry.hand.y,
          vx: entry.velocity.x,
          vy: entry.velocity.y,
          age: 0
        });
      }
      if (this.currents.length > 4) this.currents.splice(0, this.currents.length - 4);
      if (movedHands.length) this.swipeCooldown = 0.09;
    }
    this.previousHands = hands.map((hand) => ({ x: hand.x, y: hand.y }));
  }

  update(delta) {
    this.swipeCooldown = Math.max(0, this.swipeCooldown - delta);
    if (this.mode === 'idle' || this.mode === 'holding') this.updateTrigger(delta);
    else if (this.mode === 'playing') this.updateFish(delta);
    else if (this.mode === 'finale') this.updateFinale(delta);
  }

  updateTrigger(delta) {
    const hovering = this.hands.some((hand) => hand.x >= 0.76 && hand.y <= 0.24);
    if (hovering) {
      this.mode = 'holding';
      this.hold = Math.min(TRIGGER_SECONDS, this.hold + delta);
      if (this.hold >= TRIGGER_SECONDS) this.start();
    } else {
      this.mode = 'idle';
      this.hold = Math.max(0, this.hold - delta * 2.4);
    }
    this.updateUi();
  }

  start() {
    this.mode = 'playing';
    this.onModeChange?.(this.mode);
    this.hold = 0;
    this.count = 0;
    this.playTime = 0;
    this.fish = Array.from({ length: TARGET_COUNT }, (_, index) => ({
      x: 0.12 + this.random() * 0.44,
      y: 0.18 + this.random() * 0.65,
      vx: 0.012 + this.random() * 0.018,
      vy: (this.random() - 0.5) * 0.025,
      size: 0.72 + this.random() * 0.72,
      phase: this.random() * TAU,
      tone: index % 3,
      guided: 0,
      alive: true
    }));
    this.previousHands = this.hands.map((hand) => ({ x: hand.x, y: hand.y }));
    this.bursts.length = 0;
    this.currents.length = 0;
    this.onStatus?.('手を振って、20匹の魚を光る輪へ送ろう！');
    this.updateUi();
  }

  guideFish(hand, velocity, guided = new Set(), limit = 6) {
    const length = Math.max(0.001, Math.hypot(velocity.x, velocity.y));
    const directionX = velocity.x / length;
    const directionY = velocity.y / length;
    const candidates = this.fish
      .filter((fish) => fish.alive)
      .filter((fish) => !guided.has(fish))
      .filter((fish) => Math.hypot(fish.x - hand.x, fish.y - hand.y) <= 0.36)
      .sort((a, b) => Math.hypot(a.x - hand.x, a.y - hand.y) - Math.hypot(b.x - hand.x, b.y - hand.y))
      .slice(0, limit);
    for (const fish of candidates) {
      const force = 0.44 + this.random() * 0.12;
      fish.vx = directionX * force;
      fish.vy = directionY * force * 0.86;
      fish.guided = 1.2;
      guided.add(fish);
    }
    return candidates.length;
  }

  updateFish(delta) {
    this.playTime += delta;
    for (const current of this.currents) current.age += delta;
    this.currents = this.currents.filter((current) => current.age < 0.85);
    const assist = Math.min(1, Math.max(0, (this.playTime - 20) / 15));
    const ring = { x: 0.8, y: 0.57, radius: 0.12 + assist * 0.025 };
    for (const fish of this.fish) {
      if (!fish.alive) continue;
      const dx = ring.x - fish.x;
      const dy = ring.y - fish.y;
      const distance = Math.hypot(dx, dy);
      const nearRing = distance < 0.3 + assist * 0.08;
      const attraction = nearRing
        ? (fish.guided > 0 ? 0.13 : 0.045 + assist * 0.04)
        : 0.006 + assist * 0.006;
      fish.vx += dx / Math.max(0.01, distance) * attraction * delta;
      fish.vy += dy / Math.max(0.01, distance) * attraction * delta;
      fish.vx *= Math.pow(0.58, delta);
      fish.vy *= Math.pow(0.58, delta);
      const speed = Math.hypot(fish.vx, fish.vy);
      const maxSpeed = fish.guided > 0 ? 0.58 : 0.085 + assist * 0.025;
      if (speed > maxSpeed) {
        fish.vx = fish.vx / speed * maxSpeed;
        fish.vy = fish.vy / speed * maxSpeed;
      }
      fish.x += fish.vx * delta;
      fish.y += fish.vy * delta;
      fish.guided = Math.max(0, fish.guided - delta * 0.55);
      if (fish.x < 0.03 || fish.x > 0.97) fish.vx *= -1;
      if (fish.y < 0.1 || fish.y > 0.92) fish.vy *= -1;
      fish.x = Math.max(0.025, Math.min(0.975, fish.x));
      fish.y = Math.max(0.09, Math.min(0.93, fish.y));
      if (distance <= ring.radius) this.collectFish(fish);
    }
  }

  collectFish(fish) {
    fish.alive = false;
    this.count += 1;
    this.bursts.push({ x: fish.x, y: fish.y, age: 0 });
    this.updateUi();
    if (this.count >= TARGET_COUNT) this.complete();
  }

  complete() {
    this.mode = 'finale';
    this.onModeChange?.(this.mode);
    this.finaleTime = 0;
    this.mantas = Array.from({ length: 5 }, (_, index) => ({
      x: -0.28 - index * 0.2,
      y: 0.2 + index * 0.145 + (this.random() - 0.5) * 0.05,
      speed: 0.22 + this.random() * 0.035,
      size: 0.82 + this.random() * 0.38,
      phase: this.random() * TAU
    }));
    this.logo?.classList.add('is-visible');
    this.onStatus?.('海のレスキュー成功！マンタの群れがやってきた！');
    this.updateUi();
  }

  updateFinale(delta) {
    this.finaleTime += delta;
    for (const manta of this.mantas) manta.x += manta.speed * delta;
    if (this.finaleTime < 7.2) return;
    this.logo?.classList.remove('is-visible');
    this.mode = 'idle';
    this.onModeChange?.(this.mode);
    this.mantas.length = 0;
    this.count = 0;
    this.onStatus?.('手を動かして魚たちと遊んでみよう');
    this.updateUi();
  }

  updateUi() {
    const progress = Math.min(1, this.hold / TRIGGER_SECONDS);
    this.trigger?.style.setProperty('--rescue-progress', `${progress * 100}%`);
    this.trigger?.classList.toggle('is-holding', this.mode === 'holding');
    this.trigger?.toggleAttribute('hidden', this.mode === 'playing' || this.mode === 'finale');
    this.counter?.toggleAttribute('hidden', this.mode !== 'playing');
    this.instruction?.toggleAttribute('hidden', this.mode !== 'playing');
    if (this.counterValue) this.counterValue.textContent = String(this.count);
  }

  draw(ctx, width, height, time, delta) {
    this.update(delta);
    if (this.mode === 'playing') {
      this.drawCurrents(ctx, width, height);
      this.drawRing(ctx, width, height, time);
      for (const fish of this.fish) if (fish.alive) this.drawFish(ctx, fish, width, height, time);
      this.drawBursts(ctx, width, height, delta);
    } else if (this.mode === 'finale') {
      for (const manta of this.mantas) this.drawManta(ctx, manta, width, height, time);
    }
  }

  drawCurrents(ctx, width, height) {
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (const current of this.currents) {
      const length = Math.max(0.001, Math.hypot(current.vx, current.vy));
      const dx = current.vx / length;
      const dy = current.vy / length;
      const fade = Math.max(0, 1 - current.age / 0.85);
      const trail = Math.min(width, height) * 0.16;
      ctx.strokeStyle = `rgba(190, 250, 255, ${fade * 0.34})`;
      ctx.lineWidth = Math.max(2, Math.min(width, height) * 0.004 * fade);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(current.x * width - dx * trail * 0.65, current.y * height - dy * trail * 0.65);
      ctx.quadraticCurveTo(
        current.x * width - dy * trail * 0.12,
        current.y * height + dx * trail * 0.12,
        current.x * width + dx * trail * 0.35,
        current.y * height + dy * trail * 0.35
      );
      ctx.stroke();
    }
    ctx.restore();
  }

  drawRing(ctx, width, height, time) {
    const x = width * 0.8;
    const y = height * 0.57;
    const assist = Math.min(1, Math.max(0, (this.playTime - 20) / 15));
    const radius = Math.min(width, height) * (0.12 + assist * 0.025);
    const pulse = 1 + Math.sin(time * 4.2) * 0.055;
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.shadowColor = '#80f6ff';
    ctx.shadowBlur = radius * 0.32;
    ctx.strokeStyle = 'rgba(213, 255, 255, .92)';
    ctx.lineWidth = Math.max(5, radius * 0.075);
    ctx.beginPath();
    ctx.arc(x, y, radius * pulse, 0, TAU);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(80, 223, 255, .46)';
    ctx.lineWidth *= 0.42;
    ctx.beginPath();
    ctx.arc(x, y, radius * 0.77, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }

  drawFish(ctx, fish, width, height, time) {
    const unit = Math.min(width, height) * 0.022 * fish.size;
    const rotation = Math.atan2(fish.vy, fish.vx);
    const colors = ['#ffffff', '#effeff', '#caf8ff'];
    ctx.save();
    ctx.translate(fish.x * width, fish.y * height);
    ctx.rotate(rotation);
    ctx.scale(unit, unit);
    ctx.fillStyle = colors[fish.tone];
    ctx.shadowColor = '#8ff4ff';
    ctx.shadowBlur = 0.12 + fish.guided * 0.35;
    ctx.beginPath();
    ctx.moveTo(-0.7, 0);
    ctx.lineTo(-1.22, -0.43);
    ctx.lineTo(-1.1, 0);
    ctx.lineTo(-1.22, 0.43);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-0.72, 0);
    ctx.bezierCurveTo(-0.28, -0.54, 0.6, -0.42, 0.92, 0);
    ctx.bezierCurveTo(0.58, 0.42, -0.28, 0.54, -0.72, 0);
    ctx.fill();
    ctx.restore();
  }

  drawBursts(ctx, width, height, delta) {
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (const burst of this.bursts) {
      burst.age += delta;
      const progress = Math.min(1, burst.age / 0.72);
      ctx.globalAlpha = 1 - progress;
      ctx.strokeStyle = '#dfffff';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(burst.x * width, burst.y * height, 12 + progress * 54, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
    this.bursts = this.bursts.filter((burst) => burst.age < 0.72);
  }

  drawManta(ctx, manta, width, height, time) {
    const unit = Math.min(width, height) * 0.145 * manta.size;
    ctx.save();
    ctx.translate(manta.x * width, (manta.y + Math.sin(time * 1.8 + manta.phase) * 0.018) * height);
    ctx.rotate(Math.PI / 2);
    ctx.scale(unit, unit);
    if (this.mantaSprite?.complete && this.mantaSprite.naturalWidth) {
      ctx.globalAlpha = 0.9;
      ctx.shadowColor = '#59e8ff';
      ctx.shadowBlur = 0.18;
      ctx.drawImage(this.mantaSprite, -1.7, -1.5, 3.4, 3);
      ctx.restore();
      return;
    }
    const wing = Math.sin(time * 3.4 + manta.phase) * 0.06;
    const gradient = ctx.createLinearGradient(-1.5, -0.6, 1.3, 0.7);
    gradient.addColorStop(0, 'rgba(59, 224, 241, .82)');
    gradient.addColorStop(0.55, 'rgba(20, 115, 178, .88)');
    gradient.addColorStop(1, 'rgba(22, 48, 124, .9)');
    ctx.fillStyle = gradient;
    ctx.shadowColor = '#59e8ff';
    ctx.shadowBlur = 0.18;
    ctx.beginPath();
    ctx.moveTo(0, -0.76);
    ctx.lineTo(-0.18, -0.71);
    ctx.lineTo(-0.23, -0.59);
    ctx.bezierCurveTo(-0.62, -0.57, -1.18, -0.4 - wing, -1.62, -0.08 - wing);
    ctx.bezierCurveTo(-1.78, 0.04, -1.7, 0.15, -1.46, 0.12);
    ctx.bezierCurveTo(-0.82, 0.03, -0.53, 0.22, -0.28, 0.47 + wing);
    ctx.quadraticCurveTo(0, 0.69, 0.28, 0.47 + wing);
    ctx.bezierCurveTo(0.53, 0.22, 0.82, 0.03, 1.46, 0.12);
    ctx.bezierCurveTo(1.7, 0.15, 1.78, 0.04, 1.62, -0.08 - wing);
    ctx.bezierCurveTo(1.18, -0.4 - wing, 0.62, -0.57, 0.23, -0.59);
    ctx.lineTo(0.18, -0.71);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(112, 226, 246, .74)';
    ctx.lineWidth = 0.065;
    ctx.beginPath();
    ctx.moveTo(0, 0.5);
    ctx.bezierCurveTo(-0.02, 1.04, 0.06, 1.58, 0, 2.28);
    ctx.stroke();
    ctx.restore();
  }
}
