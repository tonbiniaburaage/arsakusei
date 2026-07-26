import { AREngine } from './ar-engine.js';
import { TrackingEngine } from './tracking-engine.js';
import { CREATURES, selectedCreature } from './creature-config.js';

const stage = document.querySelector('#stage');
const welcome = document.querySelector('#welcome');
const startButton = document.querySelector('#start-button');
const demoButton = document.querySelector('#demo-button');
const resetButton = document.querySelector('#reset-button');
const status = document.querySelector('#status');
const phaseBadge = document.querySelector('#phase-badge');
const trackingGuide = document.querySelector('#tracking-guide');

const creatureKey = selectedCreature();
const config = CREATURES[creatureKey];
let engine;

startButton.addEventListener('click', () => startExperience({ tracking: true }));
demoButton.addEventListener('click', () => startExperience({ tracking: false }));

async function startExperience({ tracking }) {
  startButton.disabled = true;
  demoButton.disabled = true;
  startButton.textContent = tracking ? 'カメラを準備中…' : '3Dを準備中…';
  status.textContent = tracking ? 'カメラの使用を許可してください' : '5匹の動きを準備しています';

  try {
    stage.replaceChildren();
    engine = tracking
      ? new TrackingEngine(stage, config, {
          onTargetFound: handleTargetFound,
          onTargetLost: handleTargetLost
        })
      : new AREngine(stage, config);

    const result = await engine.start();
    leaveWelcome();
    resetButton.hidden = false;
    phaseBadge.hidden = false;

    if (tracking) {
      trackingGuide.hidden = false;
      status.textContent = 'テスト用カードを探しています';
    } else {
      status.textContent = result.usedPlaceholder
        ? `仮の${config.label}を${result.count}匹表示中`
        : `${config.label}を${result.count}匹表示中`;
    }
  } catch (error) {
    console.warn('ARを開始できませんでした。', error);
    engine?.stop?.();
    engine = null;
    status.textContent = `開始できませんでした：${friendlyError(error)}`;
    startButton.disabled = false;
    demoButton.disabled = false;
    startButton.textContent = 'もう一度ためす';
  }
}

function handleTargetFound() {
  trackingGuide.hidden = true;
  status.textContent = `${config.label}が現れました。スマホをゆっくり動かしてみよう`;
}

function handleTargetLost() {
  trackingGuide.hidden = false;
  status.textContent = 'カードをもう一度映してください';
}

function leaveWelcome() {
  welcome.classList.add('is-leaving');
  setTimeout(() => welcome.hidden = true, 360);
}

resetButton.addEventListener('click', () => {
  engine?.reset?.();
  status.textContent = `${config.label}の泳ぎをリセットしました`;
});

addEventListener('pagehide', () => engine?.stop?.());

function friendlyError(error) {
  if (error?.name === 'NotAllowedError') return 'カメラの許可が必要です';
  if (error?.name === 'NotFoundError') return 'カメラが見つかりません';
  if (!window.isSecureContext) return 'HTTPSで開いてください';
  return error?.message || 'ブラウザとカメラ設定を確認してください';
}
