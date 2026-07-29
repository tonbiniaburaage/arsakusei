import { AREngine } from './ar-engine.js?v=20260729-wave';
import { TrackingEngine } from './tracking-engine.js?v=20260729-wave';
import { EffectController } from './effect-controller.js?v=20260729-wave';
import { PhotoController } from './photo-controller.js?v=20260729-wave';
import { CREATURES, qualityProfile } from './creature-config.js?v=20260729-wave';

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
let starting = false;

effects.setGameCallbacks({
  onStateChange({ key, phase, count, total }) {
    const config = CREATURES[key];
    if (phase === 'intro' && config) status.textContent = `ドリーミー${config.label}が現れた！`;
    if (phase === 'jelly-rhythm') status.textContent = `光る泡をタッチ！　${count}/${total}`;
    if (phase === 'jellyfish-celebrate') status.textContent = 'レインボーフィーバー！';
    if (phase === 'whale-charge') status.textContent = `波乗りスターキャッチ！　${count}/${total}`;
    if (phase === 'whale-celebrate') status.textContent = '星が空まで届いたよ！';
    if (phase === 'turtle-polish') status.textContent = `甲羅をぐるぐる磨こう！　${count}/${total}秒`;
    if (phase === 'turtle-celebrate') status.textContent = '甲羅がキラキラになったよ！';
    if (phase === 'complete') status.textContent = 'クリア！';
  }
});

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

startButton.addEventListener('click', () => startExperience({ tracking: true, auto: false }));
demoButton.addEventListener('click', () => {
  const key = demoCreature.value;
  startExperience({ tracking: false, config: CREATURES[key] });
});

async function startExperience({ tracking, config, auto = false }) {
  if (starting) return;
  starting = true;
  trackingMode = tracking;
  startButton.disabled = true;
  demoButton.disabled = true;
  demoCreature.disabled = true;
  startButton.textContent = tracking ? 'カメラを準備中…' : '演出を準備中…';
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
      if (result.renderMode === 'sprite2d') {
        effects.restartGame(config.key);
        status.textContent = `ドリーミー${config.label}が現れた！`;
      } else {
        status.textContent = result.usedPlaceholder
          ? `仮の${config.label}モデルを表示中`
          : `${config.label}モデルを表示中`;
      }
    }
  } catch (error) {
    console.warn('ARを開始できませんでした。', error);
    engine?.stop?.();
    engine = null;
    stage.replaceChildren();
    effects.reset();
    status.textContent = auto
      ? '自動でカメラを起動できませんでした。下のボタンをタップしてください'
      : `開始できませんでした：${friendlyError(error)}`;
    startButton.disabled = false;
    demoButton.disabled = false;
    demoCreature.disabled = false;
    startButton.textContent = 'タップしてカメラを起動';
  } finally {
    starting = false;
  }
}

function handleTargetFound(key, config, detail = {}) {
  trackingGuide.hidden = true;
  activeCreature.textContent = detail.rough
    ? `${config.icon} ${config.label}をかんたん認識`
    : `${config.icon} ${config.label}を認識`;
  activeCreature.hidden = false;
  photoController.setEnabled(true);
  status.textContent = `ドリーミー${config.label}が現れた！`;
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
  if (effects.activeKey) effects.restartGame(effects.activeKey);
  else status.textContent = '泳ぎを最初の状態へ戻しました';
});

addEventListener('pagehide', () => engine?.stop?.());

const pageOptions = new URLSearchParams(location.search);
if (pageOptions.get('demo') !== '1') {
  setTimeout(() => startExperience({ tracking: true, auto: true }), 80);
} else {
  status.textContent = '\u30ab\u30e1\u30e9\u306a\u3057\u78ba\u8a8d\u304b\u3089\u751f\u7269\u3092\u9078\u3079\u307e\u3059';
}

function friendlyError(error) {
  if (error?.name === 'NotAllowedError') return 'カメラの許可が必要です';
  if (error?.name === 'NotFoundError') return 'カメラが見つかりません';
  if (!window.isSecureContext) return 'HTTPSで開いてください';
  return error?.message || 'ブラウザとカメラ設定を確認してください';
}
