import { AREngine } from './ar-engine.js';
import { TrackingEngine } from './tracking-engine.js';
import { EffectController } from './effect-controller.js';
import { PhotoController } from './photo-controller.js';
import { CREATURES, qualityProfile } from './creature-config.js';

const stage = document.querySelector('#stage');
const effectsCanvas = document.querySelector('#effects');
const welcome = document.querySelector('#welcome');
const startButton = document.querySelector('#start-button');
const demoButton = document.querySelector('#demo-button');
const demoCreature = document.querySelector('#demo-creature');
const photoButton = document.querySelector('#photo-button');
const resetButton = document.querySelector('#reset-button');
const status = document.querySelector('#status');
const phaseBadge = document.querySelector('#phase-badge');
const trackingGuide = document.querySelector('#tracking-guide');
const activeCreature = document.querySelector('#active-creature');

const profile = qualityProfile();
const effects = new EffectController(effectsCanvas, profile);
let engine = null;
let trackingMode = false;

const photoController = new PhotoController({
  button: photoButton,
  getEngine: () => engine,
  effectsCanvas,
  countdown: document.querySelector('#capture-countdown'),
  flash: document.querySelector('#capture-flash'),
  preview: document.querySelector('#photo-preview'),
  previewImage: document.querySelector('#photo-image'),
  saveButton: document.querySelector('#photo-save'),
  closeButton: document.querySelector('#photo-close'),
  toast: document.querySelector('#toast')
});

startButton.addEventListener('click', () => startExperience({ tracking: true }));
demoButton.addEventListener('click', () => {
  const key = demoCreature.value;
  startExperience({ tracking: false, config: CREATURES[key] });
});

async function startExperience({ tracking, config }) {
  trackingMode = tracking;
  startButton.disabled = true;
  demoButton.disabled = true;
  demoCreature.disabled = true;
  startButton.textContent = tracking ? 'カメラを準備中…' : '3Dを準備中…';
  status.textContent = tracking ? 'カメラの使用を許可してください' : `${config.label}を準備しています`;

  try {
    engine?.stop?.();
    engine = null;
    stage.replaceChildren();
    effects.reset();

    engine = tracking
      ? new TrackingEngine(stage, CREATURES, profile, effects, {
          onTargetFound: handleTargetFound,
          onTargetLost: handleTargetLost
        })
      : new AREngine(stage, config, profile, effects);

    const result = await engine.start();
    leaveWelcome();
    resetButton.hidden = false;
    photoButton.hidden = false;
    phaseBadge.hidden = false;

    if (tracking) {
      trackingGuide.hidden = false;
      activeCreature.hidden = true;
      photoController.setEnabled(false);
      status.textContent = 'クラゲ・クジラ・カメの認識カードを探しています';
    } else {
      activeCreature.textContent = `${config.icon} ${config.label}`;
      activeCreature.hidden = false;
      photoController.setEnabled(true);
      status.textContent = result.usedPlaceholder
        ? `仮の${config.label}モデルを表示中`
        : `${config.label}モデルを表示中`;
    }
  } catch (error) {
    console.warn('ARを開始できませんでした。', error);
    engine?.stop?.();
    engine = null;
    stage.replaceChildren();
    effects.reset();
    status.textContent = `開始できませんでした：${friendlyError(error)}`;
    startButton.disabled = false;
    demoButton.disabled = false;
    demoCreature.disabled = false;
    startButton.textContent = 'もう一度ためす';
  }
}

function handleTargetFound(key, config) {
  trackingGuide.hidden = true;
  activeCreature.textContent = `${config.icon} ${config.label}を認識`;
  activeCreature.hidden = false;
  photoController.setEnabled(true);
  status.textContent = `${config.label}が現れました。スマホをゆっくり動かしてみよう`;
}

function handleTargetLost(key, config) {
  if (!trackingMode) return;
  activeCreature.hidden = true;
  trackingGuide.hidden = false;
  photoController.setEnabled(false);
  status.textContent = `${config.label}のカードをもう一度映してください`;
}

function leaveWelcome() {
  welcome.classList.add('is-leaving');
  setTimeout(() => welcome.hidden = true, 360);
}

resetButton.addEventListener('click', () => {
  engine?.reset?.();
  status.textContent = '泳ぎを最初の状態へ戻しました';
});

addEventListener('pagehide', () => engine?.stop?.());

function friendlyError(error) {
  if (error?.name === 'NotAllowedError') return 'カメラの許可が必要です';
  if (error?.name === 'NotFoundError') return 'カメラが見つかりません';
  if (!window.isSecureContext) return 'HTTPSで開いてください';
  return error?.message || 'ブラウザとカメラ設定を確認してください';
}
