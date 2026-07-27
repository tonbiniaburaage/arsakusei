export class SoundController {
  constructor() {
    this.context = null;
    this.master = null;
  }

  ensureContext() {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;
    if (!this.context) {
      this.context = new AudioContextClass();
      this.master = this.context.createGain();
      this.master.gain.value = 0.16;
      this.master.connect(this.context.destination);
    }
    if (this.context.state === 'suspended') this.context.resume().catch(() => {});
    return this.context;
  }

  tone({ frequency, endFrequency = frequency, duration = 0.12, type = 'sine', volume = 0.24, delay = 0 }) {
    const context = this.ensureContext();
    if (!context || !this.master) return;
    const start = context.currentTime + delay;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(30, endFrequency), start + duration);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain);
    gain.connect(this.master);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.03);
  }

  pop(step = 0) {
    const frequency = 390 + step * 78;
    this.tone({ frequency, endFrequency: frequency * 1.32, duration: 0.105, type: 'sine', volume: 0.34 });
    this.tone({ frequency: frequency * 0.52, endFrequency: frequency * 0.4, duration: 0.075, type: 'triangle', volume: 0.15 });
  }

  splash(power = 0.6) {
    const base = 170 + power * 90;
    this.tone({ frequency: base, endFrequency: base * 2.4, duration: 0.22, type: 'sine', volume: 0.3 });
    this.tone({ frequency: 620, endFrequency: 880, duration: 0.13, type: 'triangle', volume: 0.14, delay: 0.08 });
  }

  trace(step = 0) {
    const notes = [523, 659, 784, 988, 1175];
    this.tone({ frequency: notes[Math.min(step, notes.length - 1)], duration: 0.12, type: 'sine', volume: 0.24 });
  }

  success(key) {
    const notes = key === 'whale'
      ? [392, 523, 659]
      : key === 'turtle'
        ? [523, 659, 784]
        : [659, 784, 988];
    notes.forEach((frequency, index) => {
      this.tone({ frequency, duration: 0.24, type: index === 2 ? 'triangle' : 'sine', volume: 0.26, delay: index * 0.095 });
    });
  }
}
