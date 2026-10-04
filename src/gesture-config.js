export const GESTURE_SETTINGS = Object.freeze({
  inferenceIntervalMs: 80,
  historySize: 12,
  requiredVotes: 8,
  cooldownMs: 2500,
  progressDecay: 0.52,
  maxHands: 2,
  confidence: {
    Open_Palm: 0.52,
    Victory: 0.5,
    Closed_Fist: 0.62
  },
  holdSeconds: {
    Open_Palm: 0.48,
    Victory: 0.52,
    Closed_Fist: 0.82,
    Two_Hand_Crab: 0.68
  },
  singleHandRoi: {
    xMin: 0.02,
    xMax: 0.5,
    yMin: 0.48,
    yMax: 0.97
  },
  twoHandRoi: {
    xMin: 0.12,
    xMax: 0.88,
    yMin: 0.4,
    yMax: 0.98
  },
  twoHand: {
    minExtendedFingers: 3,
    minNormalizedDistance: 0.28,
    maxNormalizedDistance: 1.75
  }
});

export const GESTURE_DEFINITIONS = Object.freeze({
  Open_Palm: {
    creature: 'octopus',
    symbol: '✋',
    shortLabel: 'ひらいて',
    prompt: '手のひらを手形に合わせよう',
    success: 'タコのなかまが現れた！'
  },
  Closed_Fist: {
    creature: 'puffer',
    symbol: '✊',
    shortLabel: 'にぎって',
    prompt: 'こぶしを手形に合わせよう',
    success: 'フグのなかまがふくらんだ！'
  },
  Victory: {
    creature: 'crab',
    symbol: '✌',
    shortLabel: 'Vサイン',
    prompt: 'Vサインを手形に合わせよう',
    success: 'カニのなかまが現れた！'
  },
  Two_Hand_Crab: {
    creature: 'crab',
    symbol: '👐',
    shortLabel: '両手をひらいて',
    prompt: 'ひらいた両手を近づけてみよう',
    success: '大きなカニが現れた！',
    special: true
  }
});
