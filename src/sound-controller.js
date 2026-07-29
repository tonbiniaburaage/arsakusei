export class SoundController {
  constructor() {
    this.context = null;
    this.master = null;
    this.noiseBuffer = null;
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

  noise({
    duration = 0.4,
    volume = 0.24,
    delay = 0,
    filterType = 'bandpass',
    filterStart = 900,
    filterEnd = 420
  } = {}) {
    const context = this.ensureContext();
    if (!context || !this.master) return;
    if (!this.noiseBuffer) {
      const frameCount = Math.ceil(context.sampleRate * 1.4);
      this.noiseBuffer = context.createBuffer(1, frameCount, context.sampleRate);
      const data = this.noiseBuffer.getChannelData(0);
      for (let index = 0; index < frameCount; index += 1) {
        data[index] = Math.random() * 2 - 1;
      }
    }

    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    const start = context.currentTime + delay;
    source.buffer = this.noiseBuffer;
    filter.type = filterType;
    filter.Q.value = filterType === 'bandpass' ? 0.8 : 0.45;
    filter.frequency.setValueAtTime(Math.max(40, filterStart), start);
    filter.frequency.exponentialRampToValueAtTime(Math.max(40, filterEnd), start + duration);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + Math.min(0.035, duration * 0.2));
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    source.start(start);
    source.stop(start + duration + 0.03);
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

  polish(step = 0) {
    const notes = [440, 659, 880];
    const frequency = notes[Math.min(step, notes.length - 1)];
    this.tone({ frequency, endFrequency: frequency * 1.18, duration: 0.14, type: 'sine', volume: 0.2 });
    this.tone({ frequency: frequency * 1.5, endFrequency: frequency * 2, duration: 0.1, type: 'triangle', volume: 0.1, delay: 0.04 });
  }

  duck() {
    this.tone({ frequency: 520, endFrequency: 360, duration: 0.11, type: 'square', volume: 0.12 });
    this.tone({ frequency: 610, endFrequency: 430, duration: 0.12, type: 'square', volume: 0.1, delay: 0.12 });
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

  collect() {
    [280, 360, 470, 620, 820].forEach((frequency, index) => {
      this.tone({
        frequency,
        endFrequency: frequency * 1.32,
        duration: 0.34,
        type: index % 2 ? 'triangle' : 'sine',
        volume: 0.09 + index * 0.018,
        delay: index * 0.32
      });
    });
  }

  stamp() {
    this.tone({ frequency: 760, endFrequency: 510, duration: 0.1, type: 'triangle', volume: 0.24 });
    this.tone({ frequency: 980, endFrequency: 1220, duration: 0.18, type: 'sine', volume: 0.2, delay: 0.08 });
  }

  finale() {
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
    this.noise({
      duration: 0.58,
      volume: 0.16,
      delay: 0.34,
      filterType: 'bandpass',
      filterStart: 420,
      filterEnd: 1450
    });
  }
}
