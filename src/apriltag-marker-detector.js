const SCAN_LONG_EDGE = 640;
const SCAN_SHORT_EDGE_LIMIT = 480;
const SCAN_INTERVAL_SECONDS = 0.1;
const TAG_TO_CREATURE = new Map([
  [0, 'jellyfish'],
  [1, 'whale'],
  [2, 'turtle']
]);

export class AprilTagMarkerDetector {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.context = this.canvas.getContext('2d', {
      alpha: false,
      willReadFrequently: true
    });
    this.worker = null;
    this.ready = false;
    this.busy = false;
    this.lastCheck = -Infinity;
    this.nextRequestId = 1;
    this.pending = new Map();
    this.latestMatch = null;
  }

  initialize() {
    if (this.ready) return Promise.resolve();
    if (this.initializing) return this.initializing;
    this.initializing = new Promise((resolve, reject) => {
      const workerUrl = new URL('../vendor/apriltag/apriltag-worker.js', import.meta.url);
      const worker = new Worker(workerUrl);
      this.worker = worker;
      const timeout = setTimeout(() => reject(new Error('識別マーカーの準備がタイムアウトしました')), 15000);

      worker.addEventListener('message', (event) => {
        const message = event.data || {};
        if (message.type === 'ready') {
          clearTimeout(timeout);
          this.ready = true;
          resolve();
          return;
        }
        if (message.type === 'error') {
          clearTimeout(timeout);
          reject(new Error(message.message || '識別マーカーを準備できませんでした'));
          return;
        }
        if (message.type === 'result') this.handleWorkerResult(message);
      });
      worker.addEventListener('error', (event) => {
        clearTimeout(timeout);
        reject(new Error(event.message || '識別マーカー処理を開始できませんでした'));
      }, { once: true });
    });
    return this.initializing;
  }

  scan(video, elapsedSeconds) {
    const match = this.latestMatch;
    this.latestMatch = null;
    if (
      !this.ready
      || this.busy
      || !this.context
      || !video
      || video.readyState < 2
      || !video.videoWidth
      || elapsedSeconds - this.lastCheck < SCAN_INTERVAL_SECONDS
    ) return match;

    this.lastCheck = elapsedSeconds;
    this.resizeFor(video.videoWidth, video.videoHeight);
    try {
      this.context.drawImage(video, 0, 0, this.canvas.width, this.canvas.height);
      const imageData = this.context.getImageData(0, 0, this.canvas.width, this.canvas.height);
      const metrics = coverMetrics(video.videoWidth, video.videoHeight, innerWidth, innerHeight);
      this.requestDetection(imageData, metrics, true).catch(() => {});
    } catch {
      this.busy = false;
    }
    return match;
  }

  async detectCanvas(source) {
    if (!this.ready) await this.initialize();
    if (this.busy) throw new Error('識別処理が実行中です');
    this.resizeFor(source.width, source.height);
    this.context.drawImage(source, 0, 0, this.canvas.width, this.canvas.height);
    const imageData = this.context.getImageData(0, 0, this.canvas.width, this.canvas.height);
    const metrics = { scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0 };
    return this.requestDetection(imageData, metrics, false);
  }

  requestDetection(imageData, metrics, stabilize) {
    const requestId = this.nextRequestId++;
    const grayscale = rgbaToGrayscale(imageData.data);
    this.busy = true;
    const promise = new Promise((resolve, reject) => {
      this.pending.set(requestId, { resolve, reject, metrics, stabilize });
    });
    this.worker.postMessage({
      type: 'detect',
      requestId,
      pixels: grayscale.buffer,
      width: imageData.width,
      height: imageData.height
    }, [grayscale.buffer]);
    return promise;
  }

  handleWorkerResult(message) {
    this.busy = false;
    const pending = this.pending.get(message.requestId);
    if (!pending) return;
    this.pending.delete(message.requestId);
    if (message.error) console.warn('AprilTag recognition:', message.error);
    const match = selectKnownMarker(message.detections || [], this.canvas.width, this.canvas.height, pending.metrics);
    if (pending.stabilize) {
      const stable = this.stabilize(match);
      if (stable) this.latestMatch = stable;
    }
    pending.resolve(match);
  }

  stabilize(match) {
    if (!match) return null;
    // 識別済みAprilTagはエラー訂正付きの固有IDなので、1フレームで即時起動する。
    return {
      ...match,
      confidence: 1
    };
  }

  resizeFor(sourceWidth, sourceHeight) {
    const aspect = sourceWidth / sourceHeight;
    let width = SCAN_LONG_EDGE;
    let height = Math.round(width / aspect);
    if (height > SCAN_SHORT_EDGE_LIMIT) {
      height = SCAN_SHORT_EDGE_LIMIT;
      width = Math.round(height * aspect);
    }
    if (this.canvas.width !== width) this.canvas.width = width;
    if (this.canvas.height !== height) this.canvas.height = height;
  }

  reset() {
    this.latestMatch = null;
  }

  stop() {
    this.worker?.terminate();
    this.worker = null;
    this.ready = false;
    this.initializing = null;
    this.busy = false;
    for (const pending of this.pending.values()) pending.reject(new Error('識別処理を終了しました'));
    this.pending.clear();
    this.reset();
  }
}

function selectKnownMarker(detections, width, height, metrics) {
  const matches = detections
    .map((detection) => markerMatch(detection, width, height, metrics))
    .filter(Boolean)
    .sort((a, b) => b.coverage - a.coverage);
  return matches[0] || null;
}

function markerMatch(detection, width, height, metrics) {
  const tagId = Number(detection?.id);
  const key = TAG_TO_CREATURE.get(tagId);
  if (!key || !detection?.center || !Array.isArray(detection.corners)) return null;
  const coverage = polygonArea(detection.corners) / (width * height);
  if (coverage < 0.0012 || coverage > 0.58) return null;
  const rawX = detection.center.x / width;
  const rawY = detection.center.y / height;
  return {
    key,
    tagId,
    confidence: 1,
    coverage,
    x: clamp(rawX * metrics.scaleX + metrics.offsetX, 0, 1),
    y: clamp(rawY * metrics.scaleY + metrics.offsetY, 0, 1)
  };
}

function coverMetrics(videoWidth, videoHeight, viewportWidth, viewportHeight) {
  const scale = Math.max(viewportWidth / videoWidth, viewportHeight / videoHeight);
  const displayedWidth = videoWidth * scale;
  const displayedHeight = videoHeight * scale;
  return {
    scaleX: displayedWidth / viewportWidth,
    scaleY: displayedHeight / viewportHeight,
    offsetX: -(displayedWidth - viewportWidth) / (2 * viewportWidth),
    offsetY: -(displayedHeight - viewportHeight) / (2 * viewportHeight)
  };
}

function rgbaToGrayscale(rgba) {
  const grayscale = new Uint8Array(rgba.length / 4);
  for (let source = 0, target = 0; source < rgba.length; source += 4, target += 1) {
    grayscale[target] = (rgba[source] * 77 + rgba[source + 1] * 150 + rgba[source + 2] * 29) >> 8;
  }
  return grayscale;
}

function polygonArea(points) {
  let area = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    area += current.x * next.y - next.x * current.y;
  }
  return Math.abs(area) * 0.5;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export { TAG_TO_CREATURE };
