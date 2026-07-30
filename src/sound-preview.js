import { SoundController } from './sound-controller.js?v=20260730-autoquality';

class PreviewSoundController extends SoundController {
  ensureContext() {
    const context = super.ensureContext();
    if (context && this.master) this.master.gain.value = 0.2;
    return context;
  }

  waterCracker() {
    this.noise({ duration: 0.38, volume: 0.34, filterStart: 1350, filterEnd: 320 });
    [0.12, 0.25, 0.39].forEach((delay, index) => {
      this.noise({
        duration: 0.085,
        volume: 0.3 - index * 0.035,
        delay,
        filterType: 'highpass',
        filterStart: 2100 + index * 350,
        filterEnd: 1200
      });
      this.tone({
        frequency: 330 + index * 95,
        endFrequency: 650 + index * 160,
        duration: 0.12,
        type: 'triangle',
        volume: 0.19,
        delay
      });
    });
    [784, 988, 1318].forEach((frequency, index) => {
      this.tone({ frequency, endFrequency: frequency * 1.08, duration: 0.38, volume: 0.12, delay: 0.48 + index * 0.08 });
    });
    return 1.05;
  }

  bigWave() {
    this.tone({ frequency: 105, endFrequency: 54, duration: 0.9, type: 'sine', volume: 0.25 });
    this.noise({ duration: 1.0, volume: 0.32, filterType: 'lowpass', filterStart: 260, filterEnd: 1550 });
    this.noise({ duration: 0.34, volume: 0.4, delay: 0.72, filterType: 'highpass', filterStart: 2400, filterEnd: 720 });
    this.tone({ frequency: 310, endFrequency: 770, duration: 0.28, type: 'triangle', volume: 0.13, delay: 0.73 });
    return 1.25;
  }

  bubbleBurst() {
    const notes = [300, 390, 510, 660, 850, 1080, 1370];
    notes.forEach((frequency, index) => {
      const delay = index * 0.095;
      this.tone({
        frequency,
        endFrequency: frequency * 1.42,
        duration: 0.1 + index * 0.006,
        type: index % 2 ? 'triangle' : 'sine',
        volume: 0.18,
        delay
      });
    });
    this.noise({ duration: 0.12, volume: 0.12, delay: 0.58, filterType: 'highpass', filterStart: 2600, filterEnd: 1500 });
    return 1.0;
  }

  shellChime() {
    [523, 659, 784, 1047, 1318].forEach((frequency, index) => {
      this.tone({
        frequency,
        endFrequency: frequency * 1.03,
        duration: 0.72 - index * 0.055,
        type: index % 2 ? 'triangle' : 'sine',
        volume: 0.13,
        delay: index * 0.13
      });
    });
    this.tone({ frequency: 1568, endFrequency: 1760, duration: 0.54, volume: 0.09, delay: 0.65 });
    return 1.35;
  }

  oceanFanfare() {
    const notes = [
      [392, 0],
      [523, 0.13],
      [659, 0.26],
      [784, 0.39],
      [1047, 0.54]
    ];
    notes.forEach(([frequency, delay], index) => {
      this.tone({
        frequency,
        endFrequency: frequency * 1.06,
        duration: index === notes.length - 1 ? 0.55 : 0.24,
        type: index % 2 ? 'triangle' : 'sine',
        volume: 0.18,
        delay
      });
    });
    this.noise({ duration: 0.58, volume: 0.16, delay: 0.34, filterType: 'bandpass', filterStart: 420, filterEnd: 1450 });
    return 1.3;
  }

  play(key) {
    if (key === 'water-cracker') return this.waterCracker();
    if (key === 'big-wave') return this.bigWave();
    if (key === 'bubble-burst') return this.bubbleBurst();
    if (key === 'shell-chime') return this.shellChime();
    return this.oceanFanfare();
  }
}

const labels = {
  'water-cracker': '水しぶきクラッカー',
  'big-wave': '大波スプラッシュ',
  'bubble-burst': '泡の連続破裂',
  'shell-chime': '貝殻チャイム',
  'ocean-fanfare': '海のファンファーレ'
};

const sound = new PreviewSoundController();
const status = document.querySelector('#status');
const buttons = [...document.querySelectorAll('[data-sound]')];
let unlockTimer = null;

buttons.forEach((button) => {
  button.addEventListener('click', () => {
    const context = sound.ensureContext();
    if (!context) {
      status.textContent = 'このブラウザでは音を再生できません';
      return;
    }
    if (unlockTimer) clearTimeout(unlockTimer);
    buttons.forEach((candidate) => candidate.disabled = true);
    const key = button.dataset.sound;
    const duration = sound.play(key);
    status.textContent = `再生中：${labels[key]}`;
    navigator.vibrate?.(12);
    unlockTimer = setTimeout(() => {
      buttons.forEach((candidate) => candidate.disabled = false);
      status.textContent = `再生しました：${labels[key]}`;
    }, duration * 1000);
  });
});
