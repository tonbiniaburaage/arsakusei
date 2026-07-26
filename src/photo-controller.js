export class PhotoController {
  constructor({
    button,
    getEngine,
    effectsCanvas,
    countdown,
    flash,
    preview,
    previewImage,
    saveButton,
    closeButton,
    toast
  }) {
    this.button = button;
    this.getEngine = getEngine;
    this.effectsCanvas = effectsCanvas;
    this.countdown = countdown;
    this.flash = flash;
    this.preview = preview;
    this.previewImage = previewImage;
    this.saveButton = saveButton;
    this.closeButton = closeButton;
    this.toast = toast;
    this.busy = false;
    this.photoFile = null;
    this.photoUrl = null;

    this.button.addEventListener('click', () => this.capture());
    this.saveButton.addEventListener('click', () => this.shareOrSave());
    this.closeButton.addEventListener('click', () => this.closePreview());
  }

  setEnabled(enabled) {
    this.button.disabled = !enabled;
  }

  async capture() {
    const engine = this.getEngine();
    if (!engine || this.busy || this.button.disabled) return;
    this.busy = true;
    this.button.disabled = true;
    engine.setPhotoMode?.(true);

    try {
      this.countdown.hidden = false;
      this.countdown.textContent = '✦';
      await this.delay(650);
      this.countdown.hidden = true;
      await new Promise((resolve) => requestAnimationFrame(resolve));
      engine.renderOnce?.();

      const blob = await this.compose(engine);
      this.flash.classList.remove('is-active');
      void this.flash.offsetWidth;
      this.flash.classList.add('is-active');
      this.openPreview(blob);
    } catch (error) {
      console.warn('写真を作成できませんでした。', error);
      this.showToast('写真を作成できませんでした');
    } finally {
      engine.setPhotoMode?.(false);
      this.busy = false;
      this.button.disabled = false;
    }
  }

  async compose(engine) {
    const { video, webglCanvas } = engine.getCaptureSources();
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const longEdge = Math.min(Math.max(innerWidth, innerHeight) * dpr, 1600);
    const scale = longEdge / Math.max(innerWidth, innerHeight);
    const width = Math.max(1, Math.round(innerWidth * scale));
    const height = Math.max(1, Math.round(innerHeight * scale));
    const output = document.createElement('canvas');
    output.width = width;
    output.height = height;
    const ctx = output.getContext('2d');

    if (video?.videoWidth) {
      this.drawCover(ctx, video, width, height);
    } else {
      const background = ctx.createRadialGradient(width * 0.5, height * 0.34, 0, width * 0.5, height * 0.45, height);
      background.addColorStop(0, '#2a1852');
      background.addColorStop(1, '#090616');
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, width, height);
    }

    if (webglCanvas) ctx.drawImage(webglCanvas, 0, 0, width, height);
    if (this.effectsCanvas) ctx.drawImage(this.effectsCanvas, 0, 0, width, height);

    const glow = ctx.createLinearGradient(0, 0, 0, height);
    glow.addColorStop(0, 'rgba(180,150,255,.10)');
    glow.addColorStop(0.55, 'rgba(0,0,0,0)');
    glow.addColorStop(1, 'rgba(5,2,20,.15)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, height);

    return await new Promise((resolve, reject) => {
      output.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Canvas export failed')), 'image/jpeg', 0.92);
    });
  }

  drawCover(ctx, video, width, height) {
    const sourceAspect = video.videoWidth / video.videoHeight;
    const targetAspect = width / height;
    let sx = 0;
    let sy = 0;
    let sw = video.videoWidth;
    let sh = video.videoHeight;
    if (sourceAspect > targetAspect) {
      sw = video.videoHeight * targetAspect;
      sx = (video.videoWidth - sw) / 2;
    } else {
      sh = video.videoWidth / targetAspect;
      sy = (video.videoHeight - sh) / 2;
    }
    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, width, height);
  }

  openPreview(blob) {
    if (this.photoUrl) URL.revokeObjectURL(this.photoUrl);
    this.photoUrl = URL.createObjectURL(blob);
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    this.photoFile = new File([blob], `dreamy-ocean-ar-${stamp}.jpg`, { type: 'image/jpeg' });
    this.previewImage.src = this.photoUrl;
    this.preview.hidden = false;
  }

  async shareOrSave() {
    if (!this.photoFile) return;
    try {
      if (navigator.canShare?.({ files: [this.photoFile] })) {
        await navigator.share({
          files: [this.photoFile],
          title: 'ドリーミー海のなかま AR',
          text: '海のなかまと一緒に撮りました'
        });
        this.showToast('共有画面を開きました');
      } else {
        const link = document.createElement('a');
        link.href = this.photoUrl;
        link.download = this.photoFile.name;
        link.click();
        this.showToast('写真を保存しました');
      }
    } catch (error) {
      if (error?.name !== 'AbortError') {
        window.open(this.photoUrl, '_blank', 'noopener');
        this.showToast('画像を長押しして保存してください');
      }
    }
  }

  closePreview() {
    this.preview.hidden = true;
  }

  showToast(message) {
    this.toast.textContent = message;
    this.toast.hidden = false;
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toast.hidden = true, 2400);
  }

  delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
