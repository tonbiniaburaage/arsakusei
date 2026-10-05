import { FilesetResolver, GestureRecognizer } from '../vendor/mediapipe/vision_bundle.mjs';

const PALM_LANDMARKS = [0, 5, 9, 13, 17];
const SAMPLE_INTERVAL_MS = 52;
const CIRCLE_WINDOW_MS = 1450;
const CIRCLE_TRIGGER_RADIANS = Math.PI * 1.52;
const SPECIAL_CHARGE_SECONDS = 3;

export class GestureController {
  constructor(video, elements, callbacks = {}) {
    this.video = video;
    this.elements = elements;
    this.callbacks = callbacks;
    this.recognizer = null;
    this.timer = null;
    this.lastVideoTime = -1;
    this.lastSampleAt = performance.now();
    this.previousPrimary = null;
    this.smoothedVelocity = { x: 0, y: 0 };
    this.path = [];
    this.hadHands = false;
    this.missedFrames = 0;
    this.lastDetectedHands = [];
    this.lastChargeDistance = null;
    this.chargePairLatched = false;
    this.twoHandCharge = 0;
    this.chargeOrigin = null;
    this.specialCooldownUntil = 0;
    this.vortexCooldownUntil = 0;
    this.gestureStates = new Map([
      ['Pointing_Up', { hold: 0, cooldownUntil: 0 }],
      ['Victory', { hold: 0, cooldownUntil: 0 }]
    ]);
    this.lastUiProgress = '';
  }

  async start() {
    if (!this.recognizer) this.recognizer = await this.createRecognizer();
    this.stopTimer();
    this.lastVideoTime = -1;
    this.lastSampleAt = performance.now();
    this.timer = setInterval(() => this.sample(), SAMPLE_INTERVAL_MS);
    this.showIdleGuide();
  }

  stop() {
    this.stopTimer();
    this.recognizer?.close?.();
    this.recognizer = null;
    this.path.length = 0;
    this.previousPrimary = null;
    this.hadHands = false;
    this.lastDetectedHands = [];
    this.lastChargeDistance = null;
    this.chargePairLatched = false;
  }

  stopTimer() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async createRecognizer() {
    const wasmRoot = new URL('../vendor/mediapipe/wasm/', import.meta.url).href;
    const modelPath = new URL('../assets/models/gesture_recognizer.task', import.meta.url).href;
    const vision = await FilesetResolver.forVisionTasks(wasmRoot);
    const options = {
      baseOptions: { modelAssetPath: modelPath, delegate: 'GPU' },
      runningMode: 'VIDEO',
      numHands: 6,
      minHandDetectionConfidence: 0.42,
      minHandPresenceConfidence: 0.42,
      minTrackingConfidence: 0.42
    };
    try {
      return await GestureRecognizer.createFromOptions(vision, options);
    } catch (error) {
      console.warn('GPUで手認識を開始できないためCPUに切り替えます。', error);
      return GestureRecognizer.createFromOptions(vision, {
        ...options,
        baseOptions: { modelAssetPath: modelPath, delegate: 'CPU' }
      });
    }
  }

  sample() {
    if (!this.recognizer || this.video.readyState < 2 || !this.video.videoWidth) return;
    if (this.video.currentTime === this.lastVideoTime) return;
    this.lastVideoTime = this.video.currentTime;
    const now = performance.now();
    let result;
    try {
      result = this.recognizer.recognizeForVideo(this.video, now);
    } catch (error) {
      console.warn('手の認識を継続できません。', error);
      this.callbacks.onUnavailable?.(error);
      this.stopTimer();
      return;
    }
    this.update(this.readHands(result), now);
  }

  readHands(result) {
    return (result?.landmarks || []).map((points, index) => ({
      ...this.palmCenter(points),
      size: this.handSize(points),
      gesture: result?.gestures?.[index]?.[0]?.categoryName || 'None',
      gestureScore: result?.gestures?.[index]?.[0]?.score || 0,
      handedness: result?.handednesses?.[index]?.[0]?.categoryName || 'Unknown'
    }));
  }

  update(hands, now) {
    const delta = Math.min(0.18, Math.max(0.016, (now - this.lastSampleAt) / 1000));
    this.lastSampleAt = now;

    if (!hands.length) {
      this.missedFrames += 1;
      this.resetGestureHolds();
      this.twoHandCharge = Math.max(0, this.twoHandCharge - delta * 2.6);
      if (this.twoHandCharge === 0) this.chargeOrigin = null;
      if (this.hadHands && this.missedFrames >= 5) {
        this.hadHands = false;
        this.callbacks.onHandsLost?.(this.previousPrimary);
        this.previousPrimary = null;
        this.path.length = 0;
        this.lastDetectedHands = [];
        this.lastChargeDistance = null;
        this.chargePairLatched = false;
      }
      const bufferedHands = this.missedFrames < 5 ? this.lastDetectedHands : [];
      this.callbacks.onInteraction?.({ hands: bufferedHands, velocity: { x: 0, y: 0 }, speed: 0, charge: this.twoHandCharge });
      if (!bufferedHands.length) this.showIdleGuide();
      return;
    }

    this.missedFrames = 0;
    this.hadHands = true;
    this.lastDetectedHands = hands.map((hand) => ({ ...hand }));
    const primary = this.choosePrimary(hands);
    const rawVelocity = this.previousPrimary
      ? { x: (primary.x - this.previousPrimary.x) / delta, y: (primary.y - this.previousPrimary.y) / delta }
      : { x: 0, y: 0 };
    this.smoothedVelocity.x += (rawVelocity.x - this.smoothedVelocity.x) * 0.46;
    this.smoothedVelocity.y += (rawVelocity.y - this.smoothedVelocity.y) * 0.46;
    const speed = Math.hypot(this.smoothedVelocity.x, this.smoothedVelocity.y);
    this.previousPrimary = { ...primary };
    const chargePair = this.findChargePair(hands);
    const chargingHands = new Set(chargePair || []);
    const freeHands = hands.filter((hand) => !chargingHands.has(hand));

    if (chargePair) {
      this.path.length = 0;
      const freeGestureTriggers = this.updateCreatureGestures(freeHands, delta, now);
      this.triggerCreatureGestures(freeGestureTriggers);
      const midpoint = {
        x: (chargePair[0].x + chargePair[1].x) / 2,
        y: (chargePair[0].y + chargePair[1].y) / 2
      };
      if (now < this.specialCooldownUntil) {
        this.twoHandCharge = 0;
        this.chargeOrigin = null;
        if (!this.elements.guide.classList.contains('is-success')) this.updateGuide('海の力を整えています…', 0, true);
      } else {
        this.twoHandCharge = Math.min(1, this.twoHandCharge + delta / SPECIAL_CHARGE_SECONDS);
        if (!this.chargeOrigin) this.chargeOrigin = { ...midpoint };
        this.updateGuide('両手を左右どちらかへ伸ばして、ためろ！', this.twoHandCharge, true);
        if (this.twoHandCharge >= 1) {
          const direction = this.chargeDirection(midpoint);
          this.specialCooldownUntil = now + 3200;
          this.twoHandCharge = 0;
          this.chargeOrigin = null;
          this.callbacks.onSpecial?.({ ...midpoint, direction });
          this.announce('必殺！サメ・ストリーム！');
        }
      }
    } else {
      this.twoHandCharge = Math.max(0, this.twoHandCharge - delta * 2.4);
      if (this.twoHandCharge === 0) this.chargeOrigin = null;
      const creatureGestures = this.updateCreatureGestures(hands, delta, now);
      const circle = this.updateCirclePath(primary, now);
      if (creatureGestures.length) {
        this.path.length = 0;
        this.triggerCreatureGestures(creatureGestures, true);
      } else if (circle.triggered && now >= this.vortexCooldownUntil) {
        this.vortexCooldownUntil = now + 4200;
        this.path.length = 0;
        this.callbacks.onVortex?.({ x: circle.x, y: circle.y });
        this.announce('ぐるぐる渦潮が発生！');
      } else if (speed > 0.82) {
        this.updateGuide('水流で魚が流される！', Math.min(1, speed / 1.8), false);
      } else if (!this.elements.guide.classList.contains('is-success')) {
        const pointingHand = hands.find((hand) => hand.gesture === 'Pointing_Up' && hand.gestureScore >= 0.56);
        const victoryHand = hands.find((hand) => hand.gesture === 'Victory' && hand.gestureScore >= 0.52);
        const gestureHint = pointingHand
          ? '人差し指をそのまま上げてみよう'
          : victoryHand
            ? 'ピースをそのまま見せてみよう'
            : circle.progress > 0.28
              ? 'そのまま大きくぐるぐる！'
              : '魚が手に集まっているよ';
        const gestureProgress = Math.max(...[...this.gestureStates.values()].map((state) => state.hold / 0.34), 0);
        const progress = gestureProgress > 0 ? Math.min(1, gestureProgress) : circle.progress;
        this.updateGuide(gestureHint, progress, false);
      }
    }

    this.callbacks.onInteraction?.({
      hands: hands.map((hand) => ({
        ...hand,
        suppressAttraction: chargingHands.has(hand) || hand.gesture === 'Pointing_Up'
      })),
      velocity: this.smoothedVelocity,
      speed,
      charge: this.twoHandCharge
    });
  }

  choosePrimary(hands) {
    if (!this.previousPrimary || hands.length === 1) return hands[0];
    return hands.reduce((nearest, hand) => {
      const distance = Math.hypot(hand.x - this.previousPrimary.x, hand.y - this.previousPrimary.y);
      const nearestDistance = Math.hypot(nearest.x - this.previousPrimary.x, nearest.y - this.previousPrimary.y);
      return distance < nearestDistance ? hand : nearest;
    }, hands[0]);
  }

  chargeDirection(midpoint) {
    const origin = this.chargeOrigin || { x: 0.5, y: 0.55 };
    let x = midpoint.x - origin.x;
    let y = midpoint.y - origin.y;
    let length = Math.hypot(x, y);
    if (length < 0.055) {
      x = midpoint.x - 0.5;
      y = midpoint.y - 0.55;
      length = Math.hypot(x, y);
    }
    if (length < 0.035) return { x: 1, y: 0 };
    return { x: x / length, y: y / length };
  }

  findChargePair(hands) {
    let best = null;
    let bestDistance = Infinity;
    let bestNormalizedDistance = Infinity;
    for (let firstIndex = 0; firstIndex < hands.length - 1; firstIndex += 1) {
      for (let secondIndex = firstIndex + 1; secondIndex < hands.length; secondIndex += 1) {
        const first = hands[firstIndex];
        const second = hands[secondIndex];
        const distance = Math.hypot(first.x - second.x, first.y - second.y);
        const averageSize = Math.max(0.06, (first.size + second.size) / 2);
        const normalizedDistance = distance / averageSize;
        const oppositeHands = first.handedness === 'Unknown'
          || second.handedness === 'Unknown'
          || first.handedness !== second.handedness;
        if (!oppositeHands || Math.abs(first.y - second.y) > 0.17) continue;
        if (distance > 0.22 || normalizedDistance < 0.22 || normalizedDistance > 1.35) continue;
        if (normalizedDistance < bestNormalizedDistance) {
          bestDistance = distance;
          bestNormalizedDistance = normalizedDistance;
          best = [first, second];
        }
      }
    }
    if (!best) {
      this.lastChargeDistance = null;
      this.chargePairLatched = false;
      return null;
    }
    const closing = this.lastChargeDistance !== null
      && this.lastChargeDistance - bestDistance > 0.006;
    if (closing && bestNormalizedDistance <= 1.08) this.chargePairLatched = true;
    if (bestNormalizedDistance > 1.22) this.chargePairLatched = false;
    this.lastChargeDistance = bestDistance;
    return this.chargePairLatched && bestNormalizedDistance <= 1.12 ? best : null;
  }

  updateCreatureGestures(hands, delta, now) {
    const triggers = [];
    for (const [gesture, state] of this.gestureStates) {
      const threshold = gesture === 'Pointing_Up' ? 0.56 : 0.52;
      const hand = hands.find((candidate) => candidate.gesture === gesture && candidate.gestureScore >= threshold);
      if (!hand) {
        state.hold = Math.max(0, state.hold - delta * 2.8);
        continue;
      }
      state.hold += delta;
      if (state.hold < 0.34 || now < state.cooldownUntil) continue;
      state.hold = 0;
      state.cooldownUntil = now + 4800;
      triggers.push({
        type: gesture === 'Pointing_Up' ? 'garden-eel' : 'crab-walk',
        x: hand.x,
        y: hand.y
      });
    }
    return triggers;
  }

  triggerCreatureGestures(triggers, announce = false) {
    for (const trigger of triggers) this.callbacks.onCreatureGesture?.(trigger);
    if (!announce || !triggers.length) return;
    const hasEels = triggers.some((trigger) => trigger.type === 'garden-eel');
    const hasCrabs = triggers.some((trigger) => trigger.type === 'crab-walk');
    if (hasEels && hasCrabs) this.announce('ちんあなごとカニが現れた！');
    else if (hasEels) this.announce('ちんあなごが生えてきた！');
    else this.announce('カニたちがお散歩を始めた！');
  }

  resetGestureHolds() {
    for (const state of this.gestureStates.values()) state.hold = 0;
  }

  updateCirclePath(point, now) {
    this.path.push({ x: point.x, y: point.y, time: now });
    this.path = this.path.filter((sample) => now - sample.time <= CIRCLE_WINDOW_MS);
    if (this.path.length < 9) return { progress: 0, triggered: false, x: point.x, y: point.y };

    const center = this.path.reduce((sum, sample) => ({ x: sum.x + sample.x, y: sum.y + sample.y }), { x: 0, y: 0 });
    center.x /= this.path.length;
    center.y /= this.path.length;
    const radii = this.path.map((sample) => Math.hypot(sample.x - center.x, sample.y - center.y));
    const averageRadius = radii.reduce((sum, radius) => sum + radius, 0) / radii.length;
    if (averageRadius < 0.055 || averageRadius > 0.34) return { progress: 0, triggered: false, ...center };

    let angle = 0;
    for (let index = 1; index < this.path.length; index += 1) {
      const previous = Math.atan2(this.path[index - 1].y - center.y, this.path[index - 1].x - center.x);
      const current = Math.atan2(this.path[index].y - center.y, this.path[index].x - center.x);
      let difference = current - previous;
      if (difference > Math.PI) difference -= Math.PI * 2;
      if (difference < -Math.PI) difference += Math.PI * 2;
      angle += difference;
    }
    const consistency = radii.filter((radius) => Math.abs(radius - averageRadius) < averageRadius * 0.72).length / radii.length;
    const progress = Math.min(1, Math.abs(angle) / CIRCLE_TRIGGER_RADIANS) * consistency;
    return { progress, triggered: Math.abs(angle) >= CIRCLE_TRIGGER_RADIANS && consistency > 0.72, ...center };
  }

  announce(label) {
    this.elements.guide.classList.add('is-success');
    this.updateGuide(label, 1, false);
    setTimeout(() => {
      this.elements.guide.classList.remove('is-success');
      this.showIdleGuide();
    }, 1350);
  }

  showIdleGuide() {
    if (this.elements.guide.classList.contains('is-success')) return;
    this.updateGuide('手をかざしてみよう', 0, false);
  }

  updateGuide(label, progress, twoHand) {
    this.elements.guide.classList.toggle('is-two-hand', Boolean(twoHand));
    this.elements.guide.classList.toggle('is-tracking', progress > 0);
    this.elements.label.textContent = label;
    const progressValue = `${Math.round(Math.min(1, progress) * 100)}%`;
    if (progressValue !== this.lastUiProgress) {
      this.elements.progress.style.setProperty('--progress', progressValue);
      this.lastUiProgress = progressValue;
    }
  }

  palmCenter(points) {
    const center = PALM_LANDMARKS.reduce((sum, index) => {
      sum.x += points[index]?.x || 0;
      sum.y += points[index]?.y || 0;
      return sum;
    }, { x: 0, y: 0 });
    return { x: 1 - center.x / PALM_LANDMARKS.length, y: center.y / PALM_LANDMARKS.length };
  }

  handSize(points) {
    let minX = 1;
    let minY = 1;
    let maxX = 0;
    let maxY = 0;
    for (const point of points) {
      minX = Math.min(minX, point.x);
      minY = Math.min(minY, point.y);
      maxX = Math.max(maxX, point.x);
      maxY = Math.max(maxY, point.y);
    }
    return Math.hypot(maxX - minX, maxY - minY);
  }
}
