export class CameraMotionDetector {
  constructor(video, onMotion) {
    this.video = video;
    this.onMotion = onMotion;
    this.canvas = document.createElement('canvas');
    this.canvas.width = 128;
    this.canvas.height = 72;
    this.context = this.canvas.getContext('2d', { alpha: false, willReadFrequently: true });
    this.previous = null;
    this.timer = null;
    this.cooldownUntil = 0;
  }

  start() {
    this.stop();
    this.previous = null;
    this.timer = setInterval(() => this.sample(), 80);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.previous = null;
  }

  sample() {
    if (this.video.readyState < 2 || !this.video.videoWidth) return;
    const { width, height } = this.canvas;
    this.context.drawImage(this.video, 0, 0, width, height);
    const pixels = this.context.getImageData(0, 0, width, height).data;
    const current = new Uint8Array(width * height);
    let changed = 0;
    let sumX = 0;
    let sumY = 0;

    for (let y = 0; y < height; y += 2) {
      for (let x = 0; x < width; x += 2) {
        const pixelOffset = (y * width + x) * 4;
        const sampleOffset = y * width + x;
        const brightness = Math.round(
          pixels[pixelOffset] * 0.299
          + pixels[pixelOffset + 1] * 0.587
          + pixels[pixelOffset + 2] * 0.114
        );
        current[sampleOffset] = brightness;
        if (!this.previous || Math.abs(brightness - this.previous[sampleOffset]) < 28) continue;
        changed += 1;
        sumX += x;
        sumY += y;
      }
    }

    this.previous = current;
    const now = performance.now();
    if (changed < 48 || now < this.cooldownUntil) return;
    const sampleCount = width * height / 4;
    const intensity = Math.min(1, changed / (sampleCount * 0.22));
    // カメラ映像は鏡像表示なので、検出位置の左右も反転する。
    this.onMotion?.({
      x: 1 - sumX / changed / width,
      y: sumY / changed / height,
      intensity
    });
    this.cooldownUntil = now + 95;
  }
}
