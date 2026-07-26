export const CREATURE_ORDER = ['jellyfish', 'whale', 'turtle'];

export const CREATURES = {
  jellyfish: {
    key: 'jellyfish',
    targetIndex: 0,
    label: 'クラゲ',
    icon: '✦',
    modelUrl: './assets/models/jellyfish.glb',
    scale: 0.9,
    animationSpeed: 0.8,
    effect: { colors: ['#ffd1f1', '#cdb9ff', '#a9ebff'], starRatio: 0.48 },
    population: [
      { type: 'jellyfish', size: 1.18, base: [-0.92, 0.58, 0.05], range: [0.22, 0.16, 0.22], speed: 0.46, phase: 0.2, photo: [-0.72, 0.56, 0.12] },
      { type: 'jellyfish', size: 0.9, base: [0.86, 0.54, -0.2], range: [0.18, 0.24, 0.28], speed: 0.58, phase: 1.7, photo: [0.7, 0.5, 0.06] },
      { type: 'jellyfish', size: 0.82, base: [-0.78, -0.34, 0.22], range: [0.28, 0.17, 0.24], speed: 0.52, phase: 3.1, photo: [-0.74, -0.3, 0.16] },
      { type: 'jellyfish', size: 0.63, base: [0.82, -0.42, 0.16], range: [0.2, 0.21, 0.3], speed: 0.72, phase: 4.4, photo: [0.72, -0.34, 0.14] },
      { type: 'jellyfish', size: 0.58, base: [0.12, 0.92, -0.42], range: [0.32, 0.12, 0.2], speed: 0.64, phase: 5.8, photo: [0.08, 0.82, -0.16] }
    ],
    colors: { body: 0xbca7ff, glow: 0xffb8ec, accent: 0x89dfff }
  },
  whale: {
    key: 'whale',
    targetIndex: 1,
    label: 'クジラ',
    icon: '≈',
    modelUrl: './assets/models/whale.glb',
    scale: 1.34,
    animationSpeed: 0.45,
    effect: { colors: ['#d8f8ff', '#8eeaff', '#85a9ff'], starRatio: 0.18 },
    population: [
      { type: 'whale', size: 1.65, base: [0, 0.18, -0.45], range: [1.08, 0.24, 0.62], speed: 0.3, phase: 0.4, photo: [0, 0.38, -0.15] }
    ],
    colors: { body: 0x719cd1, glow: 0x8ddfff, accent: 0xf0fbff }
  },
  turtle: {
    key: 'turtle',
    targetIndex: 2,
    label: 'ウミガメ',
    icon: '⬡',
    modelUrl: './assets/models/turtle.glb',
    scale: 0.96,
    animationSpeed: 0.32,
    effect: { colors: ['#c9ffe9', '#79e8d0', '#ffe3a1'], starRatio: 0.22 },
    population: [
      { type: 'turtle', size: 1.12, base: [-0.08, 0.26, -0.18], range: [0.86, 0.2, 0.44], speed: 0.25, phase: 1.2, photo: [0.48, 0.3, -0.08] }
    ],
    colors: { body: 0x70bca7, glow: 0x8fffdc, accent: 0xffdf91 }
  }
};

export function selectedCreature() {
  const requested = new URLSearchParams(location.search).get('creature');
  return CREATURES[requested] ? requested : 'jellyfish';
}

export function qualityProfile() {
  const memory = navigator.deviceMemory || 4;
  const cores = navigator.hardwareConcurrency || 4;
  const lowPower = memory <= 3 || cores <= 4;
  return {
    lowPower,
    pixelRatio: Math.min(devicePixelRatio || 1, lowPower ? 1 : 1.5),
    maxParticles: lowPower ? 54 : 92,
    spawnRate: lowPower ? 0.55 : 1
  };
}
