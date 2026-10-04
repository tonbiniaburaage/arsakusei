const TAU = Math.PI * 2;

export class AmbientOcean {
  constructor() {
    this.seed = 0x51ea;
    this.sweepFish = this.makeFish(24, 'sweep');
    this.ringFish = this.makeFish(17, 'ring');
    this.laneFish = this.makeFish(11, 'lane');
    this.bubbles = this.makeBubbles(18);
    this.ripples = [];
    this.summonedCreatures = [];
    this.sharks = [];
    this.hands = [];
    this.lastHands = [];
    this.handVelocity = { x: 0, y: 0 };
    this.handCharge = 0;
    this.current = { x: 0, y: 0, strength: 0 };
    this.vortex = null;
    this.specialFlash = 0;
    this.interactionLockout = 0;
    this.motionBoost = 0;
    this.swimTime = 0;
  }

  random() {
    this.seed = (this.seed * 1664525 + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }

  makeFish(count, school) {
    return Array.from({ length: count }, (_, index) => ({
      school,
      index,
      u: count <= 1 ? 0 : index / (count - 1),
      offset: (this.random() - 0.5) * 2,
      size: 0.72 + this.random() * 0.62,
      phase: this.random() * TAU,
      tone: this.random()
    }));
  }

  makeBubbles(count) {
    return Array.from({ length: count }, () => ({
      x: this.random(),
      y: this.random(),
      size: 1.3 + this.random() * 3.8,
      speed: 0.018 + this.random() * 0.035,
      phase: this.random() * TAU
    }));
  }

  draw(ctx, width, height, time, delta) {
    if (!width || !height) return;
    this.motionBoost = Math.max(0, this.motionBoost - delta * 0.72);
    this.frameDelta = delta;
    this.updateInteractionState(delta);
    this.swimTime += delta * (1 + this.motionBoost * 1.65);
    ctx.save();
    this.drawWater(ctx, width, height, time);
    this.drawHandFields(ctx, width, height, time);
    this.drawSweepSchool(ctx, width, height, this.swimTime);
    this.drawRingSchool(ctx, width, height, this.swimTime);
    this.drawLaneSchool(ctx, width, height, this.swimTime);
    this.drawBubbles(ctx, width, height, time, delta);
    this.drawSummonedCreatures(ctx, width, height, time, delta);
    this.drawSharks(ctx, width, height, time, delta);
    this.drawMotionRipples(ctx, width, height, delta);
    this.drawSpecialFlash(ctx, width, height);
    ctx.restore();
  }

  setHandInteraction({ hands = [], velocity = { x: 0, y: 0 }, speed = 0, charge = 0 } = {}) {
    if (this.interactionLockout > 0) return;
    this.lastHands = this.hands.length ? this.hands : this.lastHands;
    this.hands = hands.map((hand) => ({ x: hand.x, y: hand.y, size: hand.size || 0.18 }));
    this.handVelocity.x += (velocity.x - this.handVelocity.x) * 0.46;
    this.handVelocity.y += (velocity.y - this.handVelocity.y) * 0.46;
    this.handCharge += (charge - this.handCharge) * 0.38;
    if (speed > 0.48) {
      this.current.x = this.handVelocity.x;
      this.current.y = this.handVelocity.y;
      this.current.strength = Math.min(1, speed * 0.7);
      this.motionBoost = Math.max(this.motionBoost, Math.min(1, speed * 0.45));
    }
  }

  releaseHands(position) {
    const origin = position || this.lastHands[0] || { x: 0.5, y: 0.55 };
    this.hands = [];
    this.lastHands = [origin];
    for (const fish of [...this.sweepFish, ...this.ringFish, ...this.laneFish]) {
      const angle = Math.atan2((fish.lastY ?? this.random()) - origin.y, (fish.lastX ?? this.random()) - origin.x);
      const kick = 0.14 + this.random() * 0.13;
      fish.ivx = (fish.ivx || 0) + Math.cos(angle) * kick;
      fish.ivy = (fish.ivy || 0) + Math.sin(angle) * kick;
    }
    this.reactToMotion(origin.x, origin.y, 0.9);
  }

  startVortex(x, y) {
    this.vortex = { x, y, age: 0, life: 4.2, strength: 1 };
    this.reactToMotion(x, y, 1);
  }

  launchShark(x = 0.5, y = 0.55) {
    const fromLeft = x > 0.5;
    this.sharks.push({
      x: fromLeft ? -0.28 : 1.28,
      y: Math.max(0.25, Math.min(0.75, y)),
      direction: fromLeft ? 1 : -1,
      age: 0,
      life: 2.25,
      phase: this.random() * TAU
    });
    this.specialFlash = 1;
    this.interactionLockout = 1.65;
    this.current.x = fromLeft ? 1.35 : -1.35;
    this.current.y = 0;
    this.current.strength = 1.35;
    this.releaseHands({ x, y });
  }

  updateInteractionState(delta) {
    this.current.strength = Math.max(0, this.current.strength - delta * 1.15);
    this.handVelocity.x *= Math.pow(0.12, delta);
    this.handVelocity.y *= Math.pow(0.12, delta);
    this.specialFlash = Math.max(0, this.specialFlash - delta * 1.8);
    this.interactionLockout = Math.max(0, this.interactionLockout - delta);
    if (this.vortex) {
      this.vortex.age += delta;
      this.vortex.life -= delta;
      this.vortex.strength = Math.min(1, this.vortex.age / 0.45) * Math.min(1, this.vortex.life / 0.8);
      if (this.vortex.life <= 0) this.vortex = null;
    }
  }

  reactToMotion(x, y, intensity = 0.5) {
    this.motionBoost = Math.max(this.motionBoost, 0.45 + intensity * 0.55);
    this.ripples.push({ x, y, age: 0, life: 1.25, intensity });
    if (this.ripples.length > 5) this.ripples.shift();
  }

  summonCreature(type, x, y, { special = false } = {}) {
    const count = special ? 4 : type === 'puffer' ? 5 : 4;
    for (let index = 0; index < count; index += 1) {
      const angle = -Math.PI * (0.18 + this.random() * 0.64);
      const speed = 0.035 + this.random() * 0.045;
      this.summonedCreatures.push({
        type,
        special: special && index === 0,
        x: x + (this.random() - 0.5) * 0.035,
        y: y + (this.random() - 0.5) * 0.035,
        vx: Math.cos(angle) * speed * (this.random() > 0.5 ? 1 : -1),
        vy: Math.sin(angle) * speed,
        size: (special && index === 0 ? 2.25 : 0.78 + this.random() * 0.52),
        phase: this.random() * TAU,
        age: 0,
        life: special && index === 0 ? 24 : 16 + this.random() * 6
      });
    }
    this.reactToMotion(x, y, special ? 1 : 0.78);
  }

  drawWater(ctx, width, height, time) {
    const wash = ctx.createLinearGradient(0, 0, 0, height);
    wash.addColorStop(0, 'rgba(22, 174, 216, .105)');
    wash.addColorStop(0.48, 'rgba(12, 111, 170, .075)');
    wash.addColorStop(1, 'rgba(9, 35, 91, .14)');
    ctx.fillStyle = wash;
    ctx.fillRect(0, 0, width, height);

    ctx.globalCompositeOperation = 'screen';
    const glowX = width * (0.5 + Math.sin(time * 0.075) * 0.08);
    const glow = ctx.createRadialGradient(glowX, -height * 0.04, 0, glowX, 0, height * 0.64);
    glow.addColorStop(0, 'rgba(196, 249, 255, .20)');
    glow.addColorStop(0.38, 'rgba(102, 222, 255, .075)');
    glow.addColorStop(1, 'rgba(70, 177, 255, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, height * 0.75);

    ctx.lineWidth = Math.max(1, width * 0.0022);
    for (let index = 0; index < 5; index += 1) {
      const phase = time * 0.18 + index * 1.7;
      const x = width * (0.08 + index * 0.21 + Math.sin(phase) * 0.055);
      ctx.strokeStyle = `rgba(173, 241, 255, ${0.035 + index * 0.007})`;
      ctx.beginPath();
      ctx.moveTo(x, -10);
      ctx.quadraticCurveTo(x + Math.sin(phase) * width * 0.07, height * 0.25, x - width * 0.1, height * 0.58);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  drawHandFields(ctx, width, height, time) {
    if (!this.hands.length && !this.vortex) return;
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (const hand of this.hands) {
      const x = hand.x * width;
      const y = hand.y * height;
      const pulse = 1 + Math.sin(time * 5.2) * 0.07;
      const radius = Math.min(width, height) * (0.085 + this.handCharge * 0.045) * pulse;
      const glow = ctx.createRadialGradient(x, y, 0, x, y, radius);
      glow.addColorStop(0, `rgba(230, 255, 255, ${0.2 + this.handCharge * 0.2})`);
      glow.addColorStop(0.38, `rgba(88, 232, 255, ${0.13 + this.handCharge * 0.12})`);
      glow.addColorStop(1, 'rgba(47, 140, 255, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = `rgba(187, 250, 255, ${0.26 + this.handCharge * 0.4})`;
      ctx.lineWidth = 1.5 + this.handCharge * 2;
      ctx.beginPath();
      ctx.arc(x, y, radius * (0.62 + Math.sin(time * 3.1) * 0.05), 0, TAU);
      ctx.stroke();
    }

    if (this.hands.length === 2 && this.handCharge > 0.02) {
      const first = this.hands[0];
      const second = this.hands[1];
      const centerX = (first.x + second.x) * width * 0.5;
      const centerY = (first.y + second.y) * height * 0.5;
      const radius = Math.min(width, height) * (0.025 + this.handCharge * 0.075);
      const core = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius);
      core.addColorStop(0, `rgba(255,255,255,${0.65 + this.handCharge * 0.3})`);
      core.addColorStop(0.26, 'rgba(103,245,255,.72)');
      core.addColorStop(1, 'rgba(73,103,255,0)');
      ctx.fillStyle = core;
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, 0, TAU);
      ctx.fill();
      for (let index = 0; index < 7; index += 1) {
        const angle = time * (1.8 + this.handCharge) + index / 7 * TAU;
        const orbit = radius * (0.65 + index % 3 * 0.22);
        ctx.fillStyle = index % 2 ? '#b7f9ff' : '#b8a9ff';
        ctx.globalAlpha = 0.28 + this.handCharge * 0.55;
        ctx.beginPath();
        ctx.arc(centerX + Math.cos(angle) * orbit, centerY + Math.sin(angle) * orbit, 2 + this.handCharge * 3, 0, TAU);
        ctx.fill();
      }
    }

    if (this.vortex) {
      const x = this.vortex.x * width;
      const y = this.vortex.y * height;
      const base = Math.min(width, height) * (0.08 + this.vortex.strength * 0.13);
      for (let index = 0; index < 5; index += 1) {
        const radiusX = base * (0.45 + index * 0.22);
        const radiusY = radiusX * 0.42;
        ctx.strokeStyle = `rgba(${130 + index * 18}, ${220 + index * 5}, 255, ${0.5 - index * 0.065})`;
        ctx.lineWidth = Math.max(1, base * 0.025);
        ctx.beginPath();
        ctx.ellipse(x, y, radiusX, radiusY, time * 0.8 + index * 0.36, 0.2, TAU - 0.35);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  drawSweepSchool(ctx, width, height, time) {
    const travel = ((time * 0.027) % 1.42) - 0.24;
    for (const fish of this.sweepFish) {
      const spread = fish.u * 0.46;
      let x = travel + spread;
      if (x > 1.16) x -= 1.42;
      const arc = Math.pow((fish.u - 0.48) * 2, 2);
      const y = 0.27 + arc * 0.18 + fish.offset * 0.032 + Math.sin(time * 0.55 + fish.phase) * 0.009;
      const slope = (fish.u - 0.48) * 0.72;
      const moved = this.moveFish(fish, x, y, this.frameDelta || 1 / 60);
      this.drawFish(ctx, moved.x * width, moved.y * height, Math.atan2(slope + moved.vy * 1.7, 1 + moved.vx * 1.7), Math.min(width, height) * 0.026 * fish.size, fish.tone, 0.40);
    }
  }

  drawRingSchool(ctx, width, height, time) {
    const centerX = width * 0.76;
    const centerY = height * 0.35;
    for (const fish of this.ringFish) {
      const angle = fish.u * TAU + time * 0.17 + fish.offset * 0.13;
      const radiusX = width * (0.12 + fish.offset * 0.008);
      const radiusY = height * (0.105 + fish.offset * 0.006);
      const x = centerX + Math.cos(angle) * radiusX;
      const y = centerY + Math.sin(angle) * radiusY;
      const direction = Math.atan2(Math.cos(angle) * radiusY, -Math.sin(angle) * radiusX);
      const moved = this.moveFish(fish, x / width, y / height, this.frameDelta || 1 / 60);
      this.drawFish(ctx, moved.x * width, moved.y * height, direction + Math.atan2(moved.vy, Math.max(0.2, 1 + moved.vx)), Math.min(width, height) * 0.021 * fish.size, fish.tone, 0.44);
    }
  }

  drawLaneSchool(ctx, width, height, time) {
    const travel = ((time * 0.042) % 1.55) - 0.28;
    for (const fish of this.laneFish) {
      let x = travel + fish.u * 0.34;
      if (x > 1.18) x -= 1.55;
      const y = 0.72 + fish.offset * 0.055 + Math.sin(time * 0.42 + fish.phase) * 0.012;
      const near = fish.index === this.laneFish.length - 1;
      const moved = this.moveFish(fish, x, y, this.frameDelta || 1 / 60);
      this.drawFish(
        ctx,
        moved.x * width,
        moved.y * height,
        Math.sin(time * 0.35 + fish.phase) * 0.07 + Math.atan2(moved.vy, Math.max(0.2, 1 + moved.vx)),
        Math.min(width, height) * (near ? 0.042 : 0.027) * fish.size,
        fish.tone,
        near ? 0.34 : 0.40
      );
    }
  }

  moveFish(fish, baseX, baseY, delta) {
    fish.ix ??= 0;
    fish.iy ??= 0;
    fish.ivx ??= 0;
    fish.ivy ??= 0;
    const x = baseX + fish.ix;
    const y = baseY + fish.iy;

    if (this.hands.length) {
      let nearest = this.hands[0];
      let nearestDistance = Infinity;
      for (const hand of this.hands) {
        const distance = Math.hypot(hand.x - x, hand.y - y);
        if (distance < nearestDistance) {
          nearest = hand;
          nearestDistance = distance;
        }
      }
      const radius = 0.43;
      if (nearestDistance < radius && nearestDistance > 0.018) {
        const pull = (1 - nearestDistance / radius) * 0.012;
        fish.ivx += (nearest.x - x) / nearestDistance * pull;
        fish.ivy += (nearest.y - y) / nearestDistance * pull;
      }
    }

    if (this.current.strength > 0) {
      fish.ivx += this.current.x * this.current.strength * 0.0042;
      fish.ivy += this.current.y * this.current.strength * 0.0042;
    }

    if (this.vortex) {
      const dx = x - this.vortex.x;
      const dy = y - this.vortex.y;
      const distance = Math.max(0.035, Math.hypot(dx, dy));
      if (distance < 0.58) {
        const force = (1 - distance / 0.58) * this.vortex.strength;
        fish.ivx += (-dy / distance * 0.012 - dx * 0.008) * force;
        fish.ivy += (dx / distance * 0.012 - dy * 0.008) * force;
      }
    }

    fish.ivx += -fish.ix * 0.0025;
    fish.ivy += -fish.iy * 0.0025;
    fish.ivx *= 0.92;
    fish.ivy *= 0.92;
    const frameScale = Math.min(2, delta * 60);
    fish.ix += fish.ivx * frameScale;
    fish.iy += fish.ivy * frameScale;
    fish.ix = Math.max(-0.42, Math.min(0.42, fish.ix));
    fish.iy = Math.max(-0.36, Math.min(0.36, fish.iy));
    fish.lastX = baseX + fish.ix;
    fish.lastY = baseY + fish.iy;
    return { x: fish.lastX, y: fish.lastY, vx: fish.ivx, vy: fish.ivy };
  }

  drawFish(ctx, x, y, rotation, size, tone, alpha) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotation);
    ctx.scale(size, size);
    ctx.globalAlpha = alpha;
    const blue = Math.round(111 + tone * 61);
    const green = Math.round(57 + tone * 75);
    ctx.fillStyle = `rgb(7, ${green}, ${blue})`;

    ctx.beginPath();
    ctx.moveTo(-0.8, 0);
    ctx.bezierCurveTo(-0.36, -0.53, 0.42, -0.48, 0.88, -0.08);
    ctx.bezierCurveTo(0.42, 0.44, -0.36, 0.48, -0.8, 0);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-0.68, 0);
    ctx.lineTo(-1.22, -0.48);
    ctx.lineTo(-1.08, 0);
    ctx.lineTo(-1.22, 0.48);
    ctx.closePath();
    ctx.fill();

    ctx.globalAlpha = alpha * 0.8;
    ctx.fillStyle = 'rgba(185, 247, 255, .75)';
    ctx.beginPath();
    ctx.arc(0.53, -0.08, 0.055, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  drawBubbles(ctx, width, height, time, delta) {
    ctx.lineWidth = 1;
    for (const bubble of this.bubbles) {
      bubble.y -= bubble.speed * Math.min(delta, 0.05);
      if (bubble.y < -0.04) {
        bubble.y = 1.04;
        bubble.x = this.random();
      }
      const x = (bubble.x + Math.sin(time * 0.7 + bubble.phase) * 0.015) * width;
      const y = bubble.y * height;
      ctx.globalAlpha = 0.24;
      ctx.strokeStyle = '#baf5ff';
      ctx.beginPath();
      ctx.arc(x, y, bubble.size, 0, TAU);
      ctx.stroke();
      ctx.globalAlpha = 0.16;
      ctx.fillStyle = '#e9fdff';
      ctx.beginPath();
      ctx.arc(x - bubble.size * 0.3, y - bubble.size * 0.32, Math.max(0.7, bubble.size * 0.22), 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  drawSummonedCreatures(ctx, width, height, time, delta) {
    for (const creature of this.summonedCreatures) {
      creature.age += delta;
      creature.life -= delta;
      creature.x += creature.vx * delta;
      creature.y += creature.vy * delta;
      creature.y += Math.sin(time * 1.3 + creature.phase) * delta * 0.004;
      if (creature.x < -0.08) creature.x = 1.08;
      if (creature.x > 1.08) creature.x = -0.08;
      if (creature.y < 0.08) {
        creature.y = 0.08;
        creature.vy = Math.abs(creature.vy) * 0.6;
      }
      const appear = Math.min(1, creature.age / 0.52);
      const disappear = Math.min(1, creature.life / 1.4);
      const pop = 1 + Math.sin(Math.min(1, creature.age / 0.52) * Math.PI) * 0.26;
      const unit = Math.min(width, height) * 0.033 * creature.size * appear * pop;
      ctx.save();
      ctx.translate(creature.x * width, creature.y * height);
      ctx.rotate(Math.sin(time * 1.05 + creature.phase) * 0.08);
      ctx.scale(unit, unit);
      ctx.globalAlpha = disappear * 0.9;
      if (creature.type === 'octopus') this.drawOctopus(ctx);
      if (creature.type === 'puffer') this.drawPuffer(ctx);
      if (creature.type === 'crab') this.drawCrab(ctx, creature.special);
      ctx.restore();
    }
    this.summonedCreatures = this.summonedCreatures.filter((creature) => creature.life > 0);
  }

  drawSharks(ctx, width, height, time, delta) {
    for (const shark of this.sharks) {
      shark.age += delta;
      shark.life -= delta;
      shark.x += shark.direction * delta * 0.76;
      const appear = Math.min(1, shark.age / 0.22);
      const fade = Math.min(1, shark.life / 0.42);
      const unit = Math.min(width, height) * 0.13;
      ctx.save();
      ctx.translate(shark.x * width, (shark.y + Math.sin(time * 4 + shark.phase) * 0.012) * height);
      ctx.scale(shark.direction * unit, unit);
      ctx.globalAlpha = appear * fade * 0.78;
      ctx.shadowColor = '#56dcff';
      ctx.shadowBlur = 0.2;
      const gradient = ctx.createLinearGradient(-1.5, -0.5, 1.25, 0.5);
      gradient.addColorStop(0, '#031939');
      gradient.addColorStop(0.5, '#07517b');
      gradient.addColorStop(1, '#0aa0bd');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.moveTo(-1.45, 0);
      ctx.lineTo(-2.05, -0.72);
      ctx.lineTo(-1.9, 0);
      ctx.lineTo(-2.05, 0.72);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-1.5, 0);
      ctx.bezierCurveTo(-0.7, -0.62, 0.75, -0.62, 1.55, -0.08);
      ctx.quadraticCurveTo(1.72, 0, 1.52, 0.12);
      ctx.bezierCurveTo(0.66, 0.63, -0.7, 0.55, -1.5, 0);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-0.25, -0.43);
      ctx.lineTo(0.18, -1.12);
      ctx.lineTo(0.48, -0.42);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-0.25, 0.36);
      ctx.lineTo(0.28, 0.8);
      ctx.lineTo(0.48, 0.31);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#d8fbff';
      ctx.beginPath();
      ctx.arc(1.02, -0.18, 0.07, 0, TAU);
      ctx.fill();
      ctx.restore();

      const wakeX = (shark.x - shark.direction * 0.12) * width;
      const wakeY = shark.y * height;
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.strokeStyle = `rgba(151,242,255,${appear * fade * 0.42})`;
      ctx.lineWidth = Math.max(2, unit * 0.025);
      for (let index = 0; index < 3; index += 1) {
        ctx.beginPath();
        ctx.arc(wakeX, wakeY, unit * (0.48 + index * 0.26), -1.15, 1.15);
        ctx.stroke();
      }
      ctx.restore();
    }
    this.sharks = this.sharks.filter((shark) => shark.life > 0 && shark.x > -0.45 && shark.x < 1.45);
  }

  drawSpecialFlash(ctx, width, height) {
    if (this.specialFlash <= 0) return;
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = this.specialFlash * 0.26;
    const glow = ctx.createRadialGradient(width * 0.5, height * 0.55, 0, width * 0.5, height * 0.55, Math.max(width, height) * 0.7);
    glow.addColorStop(0, '#dfffff');
    glow.addColorStop(0.34, '#50eaff');
    glow.addColorStop(1, 'rgba(36,91,255,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  }

  drawOctopus(ctx) {
    const gradient = ctx.createRadialGradient(-0.2, -0.3, 0.08, 0, 0, 1.2);
    gradient.addColorStop(0, '#f7d8ff');
    gradient.addColorStop(0.42, '#aa77e7');
    gradient.addColorStop(1, '#456ab9');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.ellipse(0, -0.15, 0.78, 0.72, 0, Math.PI, TAU);
    ctx.quadraticCurveTo(0.72, 0.45, 0.5, 0.52);
    ctx.quadraticCurveTo(0.28, 0.33, 0.08, 0.52);
    ctx.quadraticCurveTo(-0.15, 0.32, -0.36, 0.53);
    ctx.quadraticCurveTo(-0.62, 0.35, -0.74, 0.16);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(188, 222, 255, .72)';
    ctx.lineWidth = 0.12;
    ctx.lineCap = 'round';
    for (let index = -2; index <= 2; index += 1) {
      ctx.beginPath();
      ctx.moveTo(index * 0.23, 0.38);
      ctx.quadraticCurveTo(index * 0.34 + Math.sin(index) * 0.13, 0.9, index * 0.31, 1.18);
      ctx.stroke();
    }
    this.drawFace(ctx, -0.14);
  }

  drawPuffer(ctx) {
    ctx.fillStyle = '#e7c65a';
    ctx.strokeStyle = '#fff0a8';
    ctx.lineWidth = 0.09;
    ctx.beginPath();
    const spikes = 18;
    for (let index = 0; index < spikes * 2; index += 1) {
      const angle = index / (spikes * 2) * TAU;
      const radius = index % 2 === 0 ? 1.02 : 0.78;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#78a4c8';
    ctx.beginPath();
    ctx.moveTo(-0.72, 0);
    ctx.lineTo(-1.28, -0.42);
    ctx.lineTo(-1.18, 0.38);
    ctx.closePath();
    ctx.fill();
    this.drawFace(ctx, -0.04);
  }

  drawCrab(ctx, special) {
    ctx.fillStyle = special ? '#ff8bc8' : '#ff8395';
    ctx.strokeStyle = 'rgba(255, 225, 238, .82)';
    ctx.lineWidth = 0.11;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.ellipse(0, 0.15, 0.83, 0.58, 0, 0, TAU);
    ctx.fill();
    ctx.stroke();
    for (const side of [-1, 1]) {
      for (let index = 0; index < 3; index += 1) {
        const y = 0.02 + index * 0.22;
        ctx.beginPath();
        ctx.moveTo(side * 0.58, y);
        ctx.lineTo(side * (1.05 + index * 0.08), y + 0.22);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(side * 0.62, -0.12);
      ctx.quadraticCurveTo(side * 1.08, -0.65, side * 1.28, -0.34);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(side * 1.33, -0.4, 0.33, side < 0 ? -0.2 : Math.PI, side < 0 ? Math.PI * 1.32 : Math.PI * 0.32);
      ctx.stroke();
    }
    this.drawFace(ctx, 0.06);
    if (special) {
      ctx.fillStyle = '#fff5a8';
      for (let index = 0; index < 3; index += 1) {
        const x = (index - 1) * 0.48;
        ctx.beginPath();
        ctx.arc(x, -0.85 - Math.abs(index - 1) * 0.08, 0.1, 0, TAU);
        ctx.fill();
      }
    }
  }

  drawFace(ctx, y) {
    ctx.fillStyle = '#092f5a';
    ctx.beginPath();
    ctx.moveTo(-0.18, y);
    ctx.arc(-0.27, y, 0.09, 0, TAU);
    ctx.moveTo(0.36, y);
    ctx.arc(0.27, y, 0.09, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = '#092f5a';
    ctx.lineWidth = 0.055;
    ctx.beginPath();
    ctx.arc(0, y + 0.08, 0.18, 0.14, Math.PI - 0.14);
    ctx.stroke();
  }

  drawMotionRipples(ctx, width, height, delta) {
    ctx.globalCompositeOperation = 'screen';
    for (const ripple of this.ripples) {
      ripple.age += delta;
      ripple.life -= delta;
      const progress = Math.min(1, ripple.age / 1.15);
      const alpha = Math.max(0, 1 - progress);
      const x = ripple.x * width;
      const y = ripple.y * height;
      const radius = (24 + progress * Math.min(width, height) * 0.17) * (0.8 + ripple.intensity * 0.35);
      const glow = ctx.createRadialGradient(x, y, 0, x, y, radius * 0.58);
      glow.addColorStop(0, `rgba(226, 253, 255, ${alpha * 0.24})`);
      glow.addColorStop(1, 'rgba(80, 223, 255, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(x, y, radius * 0.58, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = `rgba(172, 244, 255, ${alpha * 0.72})`;
      ctx.lineWidth = 1.5 + ripple.intensity * 1.5;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, TAU);
      ctx.stroke();
      ctx.strokeStyle = `rgba(132, 218, 255, ${alpha * 0.38})`;
      ctx.beginPath();
      ctx.arc(x, y, radius * 0.64, 0, TAU);
      ctx.stroke();
    }
    this.ripples = this.ripples.filter((ripple) => ripple.life > 0);
    ctx.globalCompositeOperation = 'source-over';
  }
}
