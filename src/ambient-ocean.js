const TAU = Math.PI * 2;

export class AmbientOcean {
  constructor() {
    this.seed = 0x51ea;
    this.boidSchools = this.makeBoidSchools();
    this.bubbles = this.makeBubbles(48);
    this.ripples = [];
    this.summonedCreatures = [];
    this.gardenEels = [];
    this.walkingCrabs = [];
    this.sharks = [];
    this.hands = [];
    this.lastHands = [];
    this.handVelocity = { x: 0, y: 0 };
    this.handCharge = 0;
    this.current = { x: 0, y: 0, strength: 0 };
    this.vortex = null;
    this.vortexSchool = [];
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
      size: this.random() > 0.84 ? 1.45 + this.random() * 0.75 : 0.48 + this.random() * 1.05,
      phase: this.random() * TAU,
      tone: this.random()
    }));
  }

  makeBoidSchools() {
    const layouts = [
      { count: 30, x: 0.16, y: 0.22, scale: 0.72, direction: 1 },
      { count: 26, x: 0.77, y: 0.25, scale: 0.55, direction: -1 },
      { count: 28, x: 0.38, y: 0.48, scale: 0.88, direction: 1 },
      { count: 24, x: 0.82, y: 0.62, scale: 1.08, direction: -1 },
      { count: 26, x: 0.18, y: 0.76, scale: 0.66, direction: 1 },
      { count: 22, x: 0.58, y: 0.14, scale: 0.46, direction: -1 },
      { count: 24, x: 0.48, y: 0.84, scale: 0.78, direction: 1 },
      { count: 20, x: 0.9, y: 0.43, scale: 0.62, direction: -1 }
    ];
    return layouts.map((layout, schoolIndex) => ({
      ...layout,
      phase: this.random() * TAU,
      fish: Array.from({ length: layout.count }, (_, index) => {
        const angle = this.random() * TAU;
        const speed = (0.025 + this.random() * 0.028) * 1.5;
        return {
          school: schoolIndex,
          index,
          x: layout.x + (this.random() - 0.5) * 0.22,
          y: layout.y + (this.random() - 0.5) * 0.12,
          vx: Math.cos(angle) * speed + layout.direction * 0.027,
          vy: Math.sin(angle) * speed * 0.55,
          size: this.random() > 0.82 ? 1.45 + this.random() * 1.05 : 0.34 + this.random() * 1.2,
          phase: this.random() * TAU,
          tone: this.random(),
          touch: 0
        };
      })
    }));
  }

  makeBubbles(count) {
    return Array.from({ length: count }, () => ({
      x: this.random(),
      y: this.random(),
      size: 3.2 + this.random() * 11.8,
      speed: 0.022 + this.random() * 0.048,
      phase: this.random() * TAU
    }));
  }

  makeDriftSchools(count) {
    return Array.from({ length: count }, (_, index) => ({
      fish: this.makeFish(7 + Math.floor(this.random() * 6), `drift-${index}`),
      y: 0.18 + this.random() * 0.68,
      speed: 0.018 + this.random() * 0.028,
      direction: index % 2 === 0 ? 1 : -1,
      spreadX: 0.09 + this.random() * 0.09,
      spreadY: 0.025 + this.random() * 0.035,
      phase: this.random() * TAU,
      scale: 0.62 + this.random() * 0.65
    }));
  }

  draw(ctx, width, height, time, delta) {
    if (!width || !height) return;
    this.motionBoost = Math.max(0, this.motionBoost - delta * 1.35);
    this.frameDelta = delta;
    this.updateInteractionState(delta);
    this.swimTime += delta * (1 + this.motionBoost * 1.65);
    ctx.save();
    this.drawWater(ctx, width, height, time);
    this.drawHandFields(ctx, width, height, time);
    this.drawBoidSchools(ctx, width, height, this.swimTime, delta);
    this.drawVortexSchool(ctx, width, height, time);
    this.drawGardenEels(ctx, width, height, time, delta);
    this.drawWalkingCrabs(ctx, width, height, time, delta);
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
    this.hands = hands.map((hand) => ({
      x: hand.x,
      y: hand.y,
      size: hand.size || 0.18,
      suppressAttraction: Boolean(hand.suppressAttraction || hand.gesture === 'Pointing_Up')
    }));
    this.handVelocity.x += (velocity.x - this.handVelocity.x) * 0.72;
    this.handVelocity.y += (velocity.y - this.handVelocity.y) * 0.72;
    this.handCharge += (charge - this.handCharge) * 0.38;
    if (speed > 0.2) {
      this.current.x = this.handVelocity.x;
      this.current.y = this.handVelocity.y;
      this.current.strength = Math.min(1.3, speed * 1.05);
      this.motionBoost = Math.max(this.motionBoost, Math.min(1, speed * 0.65));
    }
  }

  releaseHands(position) {
    const origin = position || this.lastHands[0] || { x: 0.5, y: 0.55 };
    this.hands = [];
    this.lastHands = [origin];
    const allFish = this.boidSchools.flatMap((school) => school.fish);
    for (const fish of allFish) {
      const angle = Math.atan2(fish.y - origin.y, fish.x - origin.x);
      const distance = Math.hypot(fish.x - origin.x, fish.y - origin.y);
      if (distance > 0.48) continue;
      const kick = (0.1 + this.random() * 0.08) * (1 - distance / 0.6);
      fish.vx += Math.cos(angle) * kick;
      fish.vy += Math.sin(angle) * kick;
      fish.touch = 0.62;
    }
    this.reactToMotion(origin.x, origin.y, 0.9);
  }

  startVortex(x, y) {
    this.vortex = { x, y, age: 0, life: 4.2, strength: 1 };
    this.vortexSchool = Array.from({ length: 56 }, (_, index) => ({
      angle: index / 56 * TAU + (this.random() - 0.5) * 0.18,
      radius: 0.075 + this.random() * 0.24,
      speed: 0.72 + this.random() * 0.95,
      size: 0.42 + this.random() * 1.32,
      tone: this.random(),
      phase: this.random() * TAU
    }));
    this.reactToMotion(x, y, 1);
  }

  launchShark(x = 0.5, y = 0.55, direction = { x: 1, y: 0 }) {
    const dx = direction.x < 0 ? -1 : 1;
    const dy = 0;
    this.sharks.push({
      x: dx > 0 ? -0.28 : 1.28,
      y: Math.max(0.28, Math.min(0.76, y)),
      dx,
      dy,
      rotation: dx > 0 ? 0 : Math.PI,
      speed: 1.56 / 3,
      age: 0,
      life: 3.35,
      phase: this.random() * TAU
    });
    this.specialFlash = 1;
    this.interactionLockout = 1.65;
    this.current.x = dx * 1.35;
    this.current.y = dy * 1.35;
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
      if (this.vortex.life <= 0) {
        this.vortex = null;
        this.vortexSchool = [];
      }
    }
  }

  reactToMotion(x, y, intensity = 0.5) {
    this.motionBoost = Math.max(this.motionBoost, 0.45 + intensity * 0.55);
    this.ripples.push({ x, y, age: 0, life: 2.1, intensity, phase: this.random() * TAU });
    if (this.ripples.length > 6) this.ripples.shift();
    for (const fish of this.boidSchools.flatMap((school) => school.fish)) {
      const dx = fish.x - x;
      const dy = fish.y - y;
      const distance = Math.hypot(dx, dy);
      if (distance > 0.24 || distance < 0.006) continue;
      const force = (1 - distance / 0.24) * (0.035 + intensity * 0.055);
      fish.vx += dx / distance * force;
      fish.vy += dy / distance * force;
      fish.touch = Math.max(fish.touch, intensity);
    }
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

  summonGardenEels(x, y, amount = 3) {
    for (let index = 0; index < amount; index += 1) {
      this.gardenEels.push({
        x: Math.max(0.07, Math.min(0.93, x + (index - (amount - 1) / 2) * 0.072)),
        baseY: Math.max(0.78, Math.min(0.94, y + 0.25 + Math.abs(index - (amount - 1) / 2) * 0.018)),
        height: 0.085 + this.random() * 0.055,
        phase: this.random() * TAU,
        age: 0,
        life: 18 + this.random() * 3
      });
    }
    this.reactToMotion(x, Math.min(0.92, y + 0.25), 0.72);
  }

  summonWalkingCrabs(x, y, amount = 6) {
    for (let index = 0; index < amount; index += 1) {
      const direction = index % 2 === 0 ? 1 : -1;
      this.walkingCrabs.push({
        x: Math.max(0.05, Math.min(0.95, x + (this.random() - 0.5) * 0.22)),
        y: Math.max(0.45, Math.min(0.9, y + (this.random() - 0.5) * 0.18)),
        vx: direction * (0.022 + this.random() * 0.028),
        size: 0.72 + this.random() * 0.45,
        phase: this.random() * TAU,
        age: 0,
        life: 10 + this.random() * 2
      });
    }
    this.reactToMotion(x, y, 0.74);
  }

  drawWater(ctx, width, height, time) {
    const wash = ctx.createLinearGradient(0, 0, 0, height);
    wash.addColorStop(0, 'rgba(22, 174, 216, .035)');
    wash.addColorStop(0.48, 'rgba(12, 111, 170, .022)');
    wash.addColorStop(1, 'rgba(9, 35, 91, .055)');
    ctx.fillStyle = wash;
    ctx.fillRect(0, 0, width, height);

    ctx.globalCompositeOperation = 'screen';
    const glowX = width * (0.5 + Math.sin(time * 0.075) * 0.08);
    const glow = ctx.createRadialGradient(glowX, -height * 0.04, 0, glowX, 0, height * 0.64);
    glow.addColorStop(0, 'rgba(196, 249, 255, .085)');
    glow.addColorStop(0.38, 'rgba(102, 222, 255, .03)');
    glow.addColorStop(1, 'rgba(70, 177, 255, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, height * 0.75);

    ctx.lineWidth = Math.max(1, width * 0.0022);
    for (let index = 0; index < 5; index += 1) {
      const phase = time * 0.18 + index * 1.7;
      const x = width * (0.08 + index * 0.21 + Math.sin(phase) * 0.055);
      ctx.strokeStyle = `rgba(173, 241, 255, ${0.014 + index * 0.003})`;
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
      const base = Math.min(width, height) * (0.1 + this.vortex.strength * 0.15);
      const palette = [
        [119, 207, 241],
        [153, 218, 244],
        [178, 202, 239],
        [198, 188, 232]
      ];
      for (let index = 0; index < 8; index += 1) {
        const radius = base * (0.24 + index * 0.115 + Math.sin(time * 1.2 + index) * 0.018);
        const offsetX = Math.sin(time * 0.7 + index * 1.8) * base * 0.07;
        const offsetY = Math.cos(time * 0.62 + index * 1.3) * base * 0.055;
        const color = palette[index % palette.length];
        ctx.strokeStyle = `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${(0.42 - index * 0.032) * this.vortex.strength})`;
        ctx.lineWidth = Math.max(2, base * (0.023 - index * 0.0014));
        ctx.beginPath();
        ctx.arc(x + offsetX, y + offsetY, radius, 0, TAU);
        ctx.stroke();
      }
      for (let index = 0; index < 11; index += 1) {
        const angle = index / 11 * TAU + time * (index % 2 ? 0.16 : -0.12);
        const orbit = base * (0.48 + index % 4 * 0.17);
        const radius = base * (0.055 + index % 3 * 0.026);
        const color = palette[(index + 1) % palette.length];
        ctx.fillStyle = `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${(0.12 + index % 2 * 0.035) * this.vortex.strength})`;
        ctx.beginPath();
        ctx.arc(x + Math.cos(angle) * orbit, y + Math.sin(angle) * orbit, radius, 0, TAU);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  drawBoidSchools(ctx, width, height, time, delta) {
    const dt = Math.min(0.034, Math.max(0.008, delta));
    const aspect = width / Math.max(1, height);
    const attractingHands = this.hands.filter((hand) => !hand.suppressAttraction);

    for (const school of this.boidSchools) {
      const targetX = school.x + Math.sin(time * 0.075 + school.phase) * 0.2;
      const targetY = school.y + Math.cos(time * 0.09 + school.phase) * 0.075;
      const updates = [];

      for (const fish of school.fish) {
        let separationX = 0;
        let separationY = 0;
        let alignmentX = 0;
        let alignmentY = 0;
        let cohesionX = 0;
        let cohesionY = 0;
        let neighborCount = 0;

        for (const neighbor of school.fish) {
          if (neighbor === fish) continue;
          const dx = neighbor.x - fish.x;
          const dy = neighbor.y - fish.y;
          const distanceSquared = dx * dx * aspect * aspect + dy * dy;
          if (distanceSquared > 0.018 || distanceSquared < 0.000001) continue;
          const distance = Math.sqrt(distanceSquared);
          neighborCount += 1;
          alignmentX += neighbor.vx;
          alignmentY += neighbor.vy;
          cohesionX += neighbor.x;
          cohesionY += neighbor.y;
          if (distance < 0.052) {
            const separation = (0.052 - distance) / 0.052;
            separationX -= dx / distance * separation;
            separationY -= dy / distance * separation;
          }
        }

        let ax = Math.sin(time * 0.43 + fish.phase) * 0.006;
        let ay = Math.cos(time * 0.37 + fish.phase * 1.7) * 0.004;
        if (neighborCount) {
          alignmentX /= neighborCount;
          alignmentY /= neighborCount;
          cohesionX = cohesionX / neighborCount - fish.x;
          cohesionY = cohesionY / neighborCount - fish.y;
          ax += (alignmentX - fish.vx) * 0.72 + cohesionX * 0.17 + separationX * 0.38;
          ay += (alignmentY - fish.vy) * 0.72 + cohesionY * 0.17 + separationY * 0.38;
        }

        ax += (targetX - fish.x) * 0.022 + school.direction * 0.0028;
        ay += (targetY - fish.y) * 0.018;

        for (const hand of attractingHands) {
          const dx = hand.x - fish.x;
          const dy = hand.y - fish.y;
          const distance = Math.max(0.004, Math.hypot(dx * aspect, dy));
          if (distance > 1.45) continue;
          if (distance < 0.075) {
            const touchForce = (0.075 - distance) * 4.8;
            ax -= dx / distance * touchForce;
            ay -= dy / distance * touchForce;
            fish.touch = 1;
          } else {
            const influence = 1 - distance / 1.45;
            const rawDistance = Math.max(0.004, Math.hypot(dx, dy));
            const pull = influence * 1.28;
            ax += dx / distance * pull;
            ay += dy / distance * pull;
            const desiredSpeed = 0.42 + influence * 0.42;
            ax += (dx / rawDistance * desiredSpeed - fish.vx) * 3.8;
            ay += (dy / rawDistance * desiredSpeed - fish.vy) * 3.8;
            ax += this.handVelocity.x * influence * 0.2;
            ay += this.handVelocity.y * influence * 0.2;
          }
        }

        if (this.current.strength > 0) {
          ax += this.current.x * this.current.strength * 0.34;
          ay += this.current.y * this.current.strength * 0.34;
        }
        if (this.vortex) {
          const dx = fish.x - this.vortex.x;
          const dy = fish.y - this.vortex.y;
          const distance = Math.max(0.025, Math.hypot(dx * aspect, dy));
          if (distance < 0.6) {
            const force = (1 - distance / 0.6) * this.vortex.strength;
            ax += (-dy / distance * 0.36 - dx * 0.13) * force;
            ay += (dx / distance * 0.36 - dy * 0.13) * force;
          }
        }

        const margin = 0.055;
        if (fish.x < margin) ax += (margin - fish.x) * 1.2;
        if (fish.x > 1 - margin) ax -= (fish.x - (1 - margin)) * 1.2;
        if (fish.y < margin) ay += (margin - fish.y) * 1.2;
        if (fish.y > 1 - margin) ay -= (fish.y - (1 - margin)) * 1.2;

        let vx = fish.vx + ax * dt;
        let vy = fish.vy + ay * dt;
        const speed = Math.hypot(vx, vy);
        const minSpeed = (0.018 + school.scale * 0.009) * 1.5;
        const gathering = attractingHands.length ? 0.68 : 0;
        const maxSpeed = 0.165 + gathering + this.motionBoost * 0.1 + fish.touch * 0.055;
        if (speed > maxSpeed) {
          vx = vx / speed * maxSpeed;
          vy = vy / speed * maxSpeed;
        } else if (speed < minSpeed) {
          const heading = speed > 0.0001 ? Math.atan2(vy, vx) : fish.phase;
          vx = Math.cos(heading) * minSpeed;
          vy = Math.sin(heading) * minSpeed;
        }
        updates.push({ fish, vx, vy });
      }

      for (const update of updates) {
        const { fish, vx, vy } = update;
        fish.vx = vx;
        fish.vy = vy;
        fish.x += vx * dt;
        fish.y += vy * dt;
        fish.touch = Math.max(0, fish.touch - dt * 3.2);
        const heading = Math.atan2(vy, vx);
        const speedStretch = 1 + Math.min(0.2, Math.hypot(vx, vy) * 0.9);
        this.drawFish(
          ctx,
          fish.x * width,
          fish.y * height,
          heading,
          Math.min(width, height) * 0.021 * fish.size * school.scale * speedStretch,
          fish.tone,
          0.32 + school.scale * 0.13 + fish.touch * 0.12,
          time * (5.4 + Math.hypot(vx, vy) * 24) + fish.phase
        );
      }
    }
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

  drawDriftSchools(ctx, width, height, time) {
    for (const school of this.driftSchools) {
      const rawTravel = (time * school.speed + school.phase / TAU) % 1.45;
      const centerX = school.direction > 0 ? rawTravel - 0.22 : 1.22 - rawTravel;
      const centerY = school.y + Math.sin(time * 0.32 + school.phase) * 0.035;
      for (const fish of school.fish) {
        const column = (fish.u - 0.5) * school.spreadX;
        const row = fish.offset * school.spreadY + Math.sin(fish.phase + time * 0.55) * 0.008;
        let x = centerX + column * school.direction;
        if (x < -0.25) x += 1.45;
        if (x > 1.25) x -= 1.45;
        const y = centerY + row;
        const moved = this.moveFish(fish, x, y, this.frameDelta || 1 / 60);
        const heading = school.direction > 0 ? 0 : Math.PI;
        this.drawFish(
          ctx,
          moved.x * width,
          moved.y * height,
          heading + Math.atan2(moved.vy, Math.max(0.2, 1 + Math.abs(moved.vx))),
          Math.min(width, height) * 0.019 * fish.size * school.scale,
          fish.tone,
          0.3 + school.scale * 0.08
        );
      }
    }
  }

  drawVortexSchool(ctx, width, height, time) {
    if (!this.vortex || !this.vortexSchool.length) return;
    const centerX = this.vortex.x * width;
    const centerY = this.vortex.y * height;
    const unit = Math.min(width, height);
    for (const fish of this.vortexSchool) {
      const angle = fish.angle + this.vortex.age * fish.speed;
      const radius = unit * fish.radius * (0.84 + Math.sin(time * 1.4 + fish.phase) * 0.08);
      const x = centerX + Math.cos(angle) * radius;
      const y = centerY + Math.sin(angle) * radius;
      const alpha = (0.24 + fish.size * 0.12) * this.vortex.strength;
      this.drawFish(
        ctx,
        x,
        y,
        angle + Math.PI / 2,
        unit * 0.018 * fish.size,
        fish.tone,
        alpha
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

    const attractingHands = this.hands.filter((hand) => !hand.suppressAttraction);
    if (attractingHands.length) {
      let nearest = attractingHands[0];
      let nearestDistance = Infinity;
      for (const hand of attractingHands) {
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

  drawFish(ctx, x, y, rotation, size, tone, alpha, swimPhase = 0) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotation);
    ctx.scale(size, size);
    ctx.globalAlpha = alpha;
    const palette = tone < 0.34
      ? { body: '#07558d', eye: 'rgba(217, 250, 255, .86)' }
      : tone < 0.72
        ? { body: '#35b9d0', eye: 'rgba(239, 255, 255, .92)' }
        : { body: '#d5f7fb', eye: 'rgba(24, 102, 145, .9)' };
    ctx.fillStyle = palette.body;

    ctx.beginPath();
    ctx.moveTo(-0.8, 0);
    ctx.bezierCurveTo(-0.36, -0.53, 0.42, -0.48, 0.88, -0.08);
    ctx.bezierCurveTo(0.42, 0.44, -0.36, 0.48, -0.8, 0);
    ctx.fill();
    const tailWave = Math.sin(swimPhase) * 0.18;
    ctx.beginPath();
    ctx.moveTo(-0.68, 0);
    ctx.lineTo(-1.2, -0.48 + tailWave);
    ctx.lineTo(-1.07, tailWave * 0.35);
    ctx.lineTo(-1.2, 0.48 + tailWave);
    ctx.closePath();
    ctx.fill();

    ctx.globalAlpha = alpha * 0.42;
    ctx.beginPath();
    ctx.moveTo(-0.05, -0.28);
    ctx.quadraticCurveTo(-0.25, -0.62 - tailWave * 0.35, -0.46, -0.3);
    ctx.quadraticCurveTo(-0.25, -0.34, -0.05, -0.28);
    ctx.fill();

    ctx.globalAlpha = alpha * 0.9;
    ctx.fillStyle = palette.eye;
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

  drawGardenEels(ctx, width, height, time, delta) {
    for (const eel of this.gardenEels) {
      eel.age += delta;
      eel.life -= delta;
      const appear = Math.min(1, eel.age / 0.58);
      const fade = Math.min(1, eel.life / 0.8);
      const length = height * eel.height * appear;
      const sway = Math.sin(time * 1.35 + eel.phase) * Math.min(width, height) * 0.006;
      const x = eel.x * width;
      const y = eel.baseY * height;
      const bodyWidth = Math.max(11, Math.min(width, height) * 0.018);
      ctx.save();
      ctx.globalAlpha = fade * 0.92;
      ctx.lineCap = 'round';
      const bodyGradient = ctx.createLinearGradient(x, y - length, x, y);
      bodyGradient.addColorStop(0, '#ff8a6f');
      bodyGradient.addColorStop(0.42, '#ffc3ae');
      bodyGradient.addColorStop(0.62, '#edf9f8');
      bodyGradient.addColorStop(1, '#35b8cf');
      ctx.strokeStyle = bodyGradient;
      ctx.lineWidth = bodyWidth;
      ctx.shadowColor = 'rgba(111, 229, 239, .38)';
      ctx.shadowBlur = Math.min(width, height) * 0.012;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + sway, y - length);
      ctx.stroke();

      ctx.shadowBlur = 0;
      ctx.strokeStyle = 'rgba(130, 234, 244, .34)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.ellipse(x, y + 2, ctx.lineWidth * 12, ctx.lineWidth * 4.5, 0, 0, TAU);
      ctx.stroke();
      ctx.restore();
    }
    this.gardenEels = this.gardenEels.filter((eel) => eel.life > 0);
  }

  drawWalkingCrabs(ctx, width, height, time, delta) {
    for (const crab of this.walkingCrabs) {
      crab.age += delta;
      crab.life -= delta;
      crab.x += crab.vx * delta;
      if (crab.x < -0.08) crab.x = 1.08;
      if (crab.x > 1.08) crab.x = -0.08;
      const appear = Math.min(1, crab.age / 0.36);
      const fade = Math.min(1, crab.life / 0.8);
      const unit = Math.min(width, height) * 0.025 * crab.size * appear;
      ctx.save();
      ctx.translate(crab.x * width, crab.y * height);
      ctx.scale(crab.vx < 0 ? -unit : unit, unit);
      ctx.globalAlpha = fade * 0.88;
      const crabGradient = ctx.createLinearGradient(-1.4, -0.7, 1.2, 0.7);
      crabGradient.addColorStop(0, '#ff936f');
      crabGradient.addColorStop(0.54, '#ff5e68');
      crabGradient.addColorStop(1, '#dd2457');
      ctx.fillStyle = crabGradient;
      ctx.strokeStyle = crabGradient;
      ctx.lineWidth = 0.15;
      ctx.lineCap = 'round';
      ctx.shadowColor = 'rgba(255, 105, 111, .28)';
      ctx.shadowBlur = 0.12;
      ctx.beginPath();
      ctx.ellipse(0, 0, 0.82, 0.53, 0, 0, TAU);
      ctx.fill();
      for (const side of [-1, 1]) {
        for (let index = 0; index < 4; index += 1) {
          ctx.beginPath();
          ctx.moveTo(side * 0.54, -0.08 + index * 0.18);
          ctx.quadraticCurveTo(side * 0.88, 0.04 + index * 0.19, side * (1.12 + index * 0.045), 0.14 + index * 0.2);
          ctx.stroke();
        }
        ctx.beginPath();
        ctx.moveTo(side * 0.55, -0.28);
        ctx.quadraticCurveTo(side * 0.86, -0.58, side * 1.06, -0.68);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(side * 0.96, -0.62);
        ctx.quadraticCurveTo(side * 1.2, -1.02, side * 1.5, -0.86);
        ctx.quadraticCurveTo(side * 1.34, -0.65, side * 1.55, -0.48);
        ctx.quadraticCurveTo(side * 1.18, -0.38, side * 0.96, -0.62);
        ctx.fill();
      }
      ctx.restore();
    }
    this.walkingCrabs = this.walkingCrabs.filter((crab) => crab.life > 0);
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
      shark.x += shark.dx * delta * shark.speed;
      shark.y += shark.dy * delta * shark.speed;
      const appear = Math.min(1, shark.age / 0.22);
      const fade = Math.min(1, shark.life / 0.42);
      const unit = Math.min(width, height) * 0.13;
      ctx.save();
      ctx.translate(shark.x * width, (shark.y + Math.sin(time * 4 + shark.phase) * 0.012) * height);
      ctx.rotate(shark.rotation);
      ctx.scale(unit, unit);
      ctx.globalAlpha = appear * fade * 0.78;
      ctx.shadowColor = '#56dcff';
      ctx.shadowBlur = 0.2;
      const gradient = ctx.createLinearGradient(1.6, -0.3, -2.0, 0.3);
      gradient.addColorStop(0, '#19b9dc');
      gradient.addColorStop(0.48, '#0878ad');
      gradient.addColorStop(1, '#20339b');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.moveTo(-1.35, 0);
      ctx.lineTo(-2.1, -0.72);
      ctx.lineTo(-1.82, 0);
      ctx.lineTo(-2.1, 0.72);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-1.48, -0.12);
      ctx.bezierCurveTo(-0.72, -0.55, 0.7, -0.62, 1.46, -0.26);
      ctx.quadraticCurveTo(1.78, -0.02, 1.46, 0.24);
      ctx.bezierCurveTo(0.62, 0.62, -0.62, 0.58, -1.48, 0.12);
      ctx.quadraticCurveTo(-1.62, 0, -1.48, -0.12);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-0.18, 0.37);
      ctx.quadraticCurveTo(0.12, 0.93, 0.62, 0.86);
      ctx.lineTo(0.36, 0.34);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      const wakeX = (shark.x - shark.dx * 0.12) * width;
      const wakeY = (shark.y - shark.dy * 0.12) * height;
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
    this.sharks = this.sharks.filter((shark) => shark.life > 0 && shark.x > -0.45 && shark.x < 1.45 && shark.y > -0.45 && shark.y < 1.45);
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
      const progress = Math.min(1, ripple.age / 1.85);
      const alpha = Math.max(0, Math.sin(Math.min(1, ripple.age / 0.18) * Math.PI * 0.5) * (1 - progress));
      const x = ripple.x * width;
      const y = ripple.y * height;
      const radius = (18 + progress * Math.min(width, height) * 0.24) * (0.78 + ripple.intensity * 0.34);
      const glow = ctx.createRadialGradient(x, y, 0, x, y, radius * 0.78);
      glow.addColorStop(0, `rgba(226, 253, 255, ${alpha * 0.075})`);
      glow.addColorStop(0.52, `rgba(80, 223, 255, ${alpha * 0.025})`);
      glow.addColorStop(1, 'rgba(80, 223, 255, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(x, y, radius * 0.78, 0, TAU);
      ctx.fill();
      for (let ring = 0; ring < 3; ring += 1) {
        const ringRadius = radius * (1 - ring * 0.15) - ring * 8;
        if (ringRadius <= 0) continue;
        ctx.strokeStyle = `rgba(${155 - ring * 7}, ${239 - ring * 4}, 255, ${alpha * (0.34 - ring * 0.07)})`;
        ctx.lineWidth = Math.max(1, 1.4 + ripple.intensity * 0.85 - ring * 0.25);
        ctx.beginPath();
        ctx.ellipse(
          x + Math.sin(ripple.phase + ring) * progress * 5,
          y + Math.cos(ripple.phase * 1.3 + ring) * progress * 3,
          ringRadius,
          ringRadius * (0.79 + ring * 0.025),
          Math.sin(ripple.phase) * 0.08,
          0,
          TAU
        );
        ctx.stroke();
      }
      for (let sparkle = 0; sparkle < 3; sparkle += 1) {
        const angle = ripple.phase + sparkle / 3 * TAU + progress * 0.4;
        const orbit = radius * (0.52 + sparkle % 2 * 0.18);
        ctx.globalAlpha = alpha * 0.32;
        ctx.fillStyle = sparkle % 2 ? '#dffeff' : '#82eaff';
        ctx.beginPath();
        ctx.arc(x + Math.cos(angle) * orbit, y + Math.sin(angle) * orbit * 0.79, 1.4 + ripple.intensity * 1.7, 0, TAU);
        ctx.fill();
      }
    }
    this.ripples = this.ripples.filter((ripple) => ripple.life > 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }
}
