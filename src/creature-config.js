export const CREATURE_ORDER = ['jellyfish', 'whale', 'turtle'];

export const CREATURES = {
  jellyfish: {
    key: 'jellyfish',
    targetIndex: 0,
    label: 'クラゲ',
    icon: '✦',
    renderMode: 'sprite2d',
    spriteUrl: './assets/sprites/dreamy-jellyfish-source.png',
    modelUrl: './assets/models/jellyfish.glb',
    scale: 0.9,
    animationSpeed: 0.8,
    effect: { colors: ['#ffd1f1', '#cdb9ff', '#a9ebff'], starRatio: 0.48 },
    population: [
      {
        type: 'jellyfish2d',
        size: 1.5,
        base: [0.42, 0.42, -0.08],
        range: [0.92, 0.54, 0.18],
        speed: 0.46,
        phase: 0.2,
        photo: [0.55, 0.4, -0.08]
      }
    ],
    colors: { body: 0xbca7ff, glow: 0xffb8ec, accent: 0x89dfff }
  },
  whale: {
    key: 'whale',
    targetIndex: 1,
    label: 'クジラ',
    icon: '≈',
    renderMode: 'sprite2d',
    spriteUrl: './assets/sprites/dreamy-whale-source.png',
    scale: 1.04,
    animationSpeed: 0.7,
    effect: { colors: ['#e8fbff', '#67e6ff', '#5b9dff', '#ffe98a'], starRatio: 0.3 },
    population: [
      { type: 'whale2d', size: 1.45, base: [0.05, 0.22, -0.08], range: [0.16, 0.1, 0.04], speed: 0.5, phase: 0.4, photo: [0.08, 0.28, -0.08] }
    ],
    colors: { body: 0x719cd1, glow: 0x8ddfff, accent: 0xf0fbff }
  },
  turtle: {
    key: 'turtle',
    targetIndex: 2,
    label: 'ウミガメ',
    icon: '⬡',
    renderMode: 'sprite2d',
    spriteUrl: './assets/sprites/dreamy-turtle-source.png',
    scale: 1.02,
    animationSpeed: 0.58,
    effect: { colors: ['#d8fff3', '#70efd7', '#fff09f', '#ffb9dc'], starRatio: 0.42 },
    population: [
      { type: 'turtle2d', size: 1.48, base: [0.04, 0.22, -0.08], range: [0.14, 0.09, 0.035], speed: 0.44, phase: 1.2, photo: [0.05, 0.28, -0.08] }
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
    maxParticles: lowPower ? 90 : 160,
    spawnRate: lowPower ? 0.72 : 1.2
  };
}
