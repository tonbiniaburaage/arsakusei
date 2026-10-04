import { FilesetResolver, GestureRecognizer } from '../vendor/mediapipe/vision_bundle.mjs';
import { GESTURE_DEFINITIONS, GESTURE_SETTINGS } from './gesture-config.js';

const ALLOWED_GESTURES = ['Open_Palm', 'Closed_Fist', 'Victory'];
const PALM_LANDMARKS = [0, 5, 9, 13, 17];
const FINGER_PAIRS = [[8, 6], [12, 10], [16, 14], [20, 18]];

export class GestureController {
  constructor(video, elements, callbacks = {}) {
    this.video = video;
    this.elements = elements;
    this.callbacks = callbacks;
    this.settings = GESTURE_SETTINGS;
    this.recognizer = null;
    this.timer = null;
    this.lastVideoTime = -1;
    this.lastSampleAt = performance.now();
    this.history = [];
    this.active = null;
    this.cooldownUntil = 0;
    this.guideIndex = 0;
    this.guideChangedAt = performance.now();
    this.lastUiProgress = -1;
  }

  async start() {
    if (!this.recognizer) this.recognizer = await this.createRecognizer();
    this.stopTimer();
    this.lastVideoTime = -1;
    this.lastSampleAt = performance.now();
    this.timer = setInterval(() => this.sample(), this.settings.inferenceIntervalMs);
    this.showIdleGuide(true);
  }

  stop() {
    this.stopTimer();
    this.recognizer?.close?.();
    this.recognizer = null;
    this.history.length = 0;
    this.active = null;
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
      numHands: this.settings.maxHands,
      minHandDetectionConfidence: 0.45,
      minHandPresenceConfidence: 0.45,
      minTrackingConfidence: 0.45,
      cannedGesturesClassifierOptions: {
        scoreThreshold: 0.38,
        categoryAllowlist: ALLOWED_GESTURES
      }
    };
    try {
      return await GestureRecognizer.createFromOptions(vision, options);
    } catch (error) {
      console.warn('GPUで手ジェスチャー認識を開始できないためCPUに切り替えます。', error);
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
      console.warn('手ジェスチャーの認識を継続できません。', error);
      this.callbacks.onUnavailable?.(error);
      this.stopTimer();
      return;
    }
    const candidate = this.readCandidate(result);
    this.updateStability(candidate, now);
  }

  readCandidate(result) {
    const landmarks = result?.landmarks || [];
    const gestures = result?.gestures || [];
    const hands = landmarks.map((points, index) => ({
      points,
      center: this.palmCenter(points),
      size: this.handSize(points),
      gesture: gestures[index]?.[0]?.categoryName || 'None',
      score: gestures[index]?.[0]?.score || 0
    }));

    const doubleHand = this.readTwoHandCandidate(hands);
    if (doubleHand) return doubleHand;

    let best = null;
    for (const hand of hands) {
      if (!this.inRoi(hand.center, this.settings.singleHandRoi)) continue;
      if (!ALLOWED_GESTURES.includes(hand.gesture)) continue;
      if (hand.score < this.settings.confidence[hand.gesture]) continue;
      if (!best || hand.score > best.confidence) {
        best = { key: hand.gesture, position: hand.center, confidence: hand.score };
      }
    }
    return best;
  }

  readTwoHandCandidate(hands) {
    if (hands.length < 2) return null;
    const [first, second] = hands;
    if (this.extendedFingerCount(first.points) < this.settings.twoHand.minExtendedFingers) return null;
    if (this.extendedFingerCount(second.points) < this.settings.twoHand.minExtendedFingers) return null;
    const midpoint = {
      x: (first.center.x + second.center.x) / 2,
      y: (first.center.y + second.center.y) / 2
    };
    if (!this.inRoi(midpoint, this.settings.twoHandRoi)) return null;
    const distance = Math.hypot(first.center.x - second.center.x, first.center.y - second.center.y);
    const averageSize = Math.max(0.001, (first.size + second.size) / 2);
    const normalizedDistance = distance / averageSize;
    if (normalizedDistance < this.settings.twoHand.minNormalizedDistance) return null;
    if (normalizedDistance > this.settings.twoHand.maxNormalizedDistance) return null;
    return { key: 'Two_Hand_Crab', position: midpoint, confidence: 0.9 };
  }

  updateStability(candidate, now) {
    const delta = Math.min(0.2, Math.max(0, (now - this.lastSampleAt) / 1000));
    this.lastSampleAt = now;
    this.history.push(candidate?.key || null);
    if (this.history.length > this.settings.historySize) this.history.shift();

    if (now < this.cooldownUntil) {
      this.active = null;
      this.updateGuide(null, 0, true);
      return;
    }

    if (candidate) {
      if (!this.active) {
        this.active = { ...candidate, hold: delta };
      } else if (this.active.key === candidate.key) {
        this.active.hold += delta;
        this.active.position.x += (candidate.position.x - this.active.position.x) * 0.28;
        this.active.position.y += (candidate.position.y - this.active.position.y) * 0.28;
        this.active.confidence = candidate.confidence;
      } else {
        this.active.hold = Math.max(0, this.active.hold - delta * 0.72);
        if (this.active.hold === 0) this.active = { ...candidate, hold: delta };
      }
    } else if (this.active) {
      this.active.hold = Math.max(0, this.active.hold - delta * this.settings.progressDecay);
      if (this.active.hold === 0) this.active = null;
    }

    if (!this.active) {
      this.showIdleGuide();
      return;
    }

    const votes = this.history.filter((key) => key === this.active.key).length;
    const holdTarget = this.settings.holdSeconds[this.active.key];
    const progress = Math.min(1, votes / this.settings.requiredVotes, this.active.hold / holdTarget);
    this.updateGuide(this.active.key, progress, false);

    if (votes >= this.settings.requiredVotes && this.active.hold >= holdTarget) {
      this.trigger(this.active, now);
    }
  }

  trigger(active, now) {
    const definition = GESTURE_DEFINITIONS[active.key];
    this.cooldownUntil = now + this.settings.cooldownMs;
    this.history.length = 0;
    this.active = null;
    this.elements.guide.classList.add('is-success');
    this.elements.ghost.textContent = definition.symbol;
    this.elements.label.textContent = definition.success;
    this.elements.progress.style.setProperty('--progress', '360deg');
    this.callbacks.onSummon?.({
      type: definition.creature,
      x: active.position.x,
      y: active.position.y,
      special: Boolean(definition.special),
      label: definition.success
    });
    setTimeout(() => {
      this.elements.guide.classList.remove('is-success');
      this.showIdleGuide(true);
    }, 1450);
  }

  showIdleGuide(force = false) {
    const now = performance.now();
    const keys = ['Open_Palm', 'Closed_Fist', 'Victory', 'Two_Hand_Crab'];
    if (force || now - this.guideChangedAt > 4200) {
      this.guideIndex = force ? 0 : (this.guideIndex + 1) % keys.length;
      this.guideChangedAt = now;
    }
    this.updateGuide(keys[this.guideIndex], 0, false, true);
  }

  updateGuide(key, progress, coolingDown = false, idle = false) {
    const definition = GESTURE_DEFINITIONS[key] || GESTURE_DEFINITIONS.Open_Palm;
    const isTwoHand = key === 'Two_Hand_Crab';
    this.elements.guide.classList.toggle('is-two-hand', isTwoHand);
    this.elements.guide.classList.toggle('is-tracking', !idle && !coolingDown && progress > 0);
    this.elements.guide.classList.toggle('is-cooling-down', coolingDown);
    this.elements.ghost.textContent = definition.symbol;
    this.elements.label.textContent = coolingDown ? '海のなかまが合流中…' : definition.prompt;
    const progressDegrees = `${Math.round(progress * 360)}deg`;
    if (progressDegrees !== this.lastUiProgress) {
      this.elements.progress.style.setProperty('--progress', progressDegrees);
      this.lastUiProgress = progressDegrees;
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

  extendedFingerCount(points) {
    const wrist = points[0];
    if (!wrist) return 0;
    return FINGER_PAIRS.reduce((count, [tipIndex, pipIndex]) => {
      const tip = points[tipIndex];
      const pip = points[pipIndex];
      if (!tip || !pip) return count;
      const tipDistance = Math.hypot(tip.x - wrist.x, tip.y - wrist.y);
      const pipDistance = Math.hypot(pip.x - wrist.x, pip.y - wrist.y);
      return count + (tipDistance > pipDistance * 1.14 ? 1 : 0);
    }, 0);
  }

  inRoi(point, roi) {
    return point.x >= roi.xMin && point.x <= roi.xMax && point.y >= roi.yMin && point.y <= roi.yMax;
  }
}
