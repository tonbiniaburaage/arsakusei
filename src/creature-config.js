export const CREATURES = {
  jellyfish: {
    label: 'クラゲ',
    modelUrl: './assets/models/jellyfish.glb',
    scale: 0.9,
    verticalOffset: -0.12,
    animationSpeed: 0.8,
    population: [
      { size: 1.18, base: [-0.92, 0.58, 0.05], range: [0.22, 0.16, 0.22], speed: 0.46, phase: 0.2 },
      { size: 0.9, base: [0.86, 0.54, -0.2], range: [0.18, 0.24, 0.28], speed: 0.58, phase: 1.7 },
      { size: 0.82, base: [-0.78, -0.34, 0.22], range: [0.28, 0.17, 0.24], speed: 0.52, phase: 3.1 },
      { size: 0.63, base: [0.82, -0.42, 0.16], range: [0.2, 0.21, 0.3], speed: 0.72, phase: 4.4 },
      { size: 0.58, base: [0.12, 0.92, -0.42], range: [0.32, 0.12, 0.2], speed: 0.64, phase: 5.8 }
    ],
    colors: {
      body: 0xbca7ff,
      glow: 0xffb8ec,
      accent: 0x89dfff
    }
  },
  whale: {
    label: 'クジラ',
    modelUrl: './assets/models/whale.glb',
    scale: 1.25,
    verticalOffset: 0,
    animationSpeed: 0.45,
    population: [
      { size: 1.8, base: [0, 0.35, -0.45], range: [1.25, 0.22, 0.55], speed: 0.24, phase: 0 }
    ],
    colors: { body: 0x719cd1, glow: 0xb9d8ff, accent: 0xffffff }
  },
  turtle: {
    label: 'ウミガメ',
    modelUrl: './assets/models/turtle.glb',
    scale: 0.85,
    verticalOffset: 0,
    animationSpeed: 0.32,
    population: [
      { size: 1.05, base: [-0.15, 0.3, -0.15], range: [0.85, 0.2, 0.45], speed: 0.2, phase: 1 }
    ],
    colors: { body: 0x70bca7, glow: 0xb8ffe2, accent: 0xffe3a4 }
  }
};

export function selectedCreature() {
  const requested = new URLSearchParams(location.search).get('creature');
  return CREATURES[requested] ? requested : 'jellyfish';
}
