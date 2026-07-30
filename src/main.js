import { AREngine } from './ar-engine.js?v=20260730-autoquality';
import { TrackingEngine } from './tracking-engine.js?v=20260730-autoquality';
import { EffectController } from './effect-controller.js?v=20260730-autoquality';
import { PhotoController } from './photo-controller.js?v=20260730-autoquality';
import { CREATURE_ORDER, CREATURES, qualityProfile } from './creature-config.js?v=20260730-autoquality';

const stage = document.querySelector('#stage');
const effectsCanvas = document.querySelector('#effects');
const welcome = document.querySelector('#welcome');
const startButton = document.querySelector('#start-button');
const demoButton = document.querySelector('#demo-button');
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
let demoSequenceActive = false;
let demoTransitionTimer = null;

effects.setGameCallbacks({
  onStateChange({ key, phase, count, total }) {
    const config = CREATURES[key];
    if (phase === 'intro' && config) status.textContent = `ドリーミー${config.label}が現れた！`;
    if (phase === 'jelly-rhythm') status.textContent = `光る泡をタッチ！　${count}/${total}`;
    if (phase === 'jellyfish-celebrate') status.textContent = 'クラゲ、クリア！';
    if (phase === 'whale-charge') status.textContent = `クジラを長押ししてみて！　${count}/${total}`;
    if (phase === 'whale-rise') status.textContent = 'チャージMAX！ 大波がくるよ！';
    if (phase === 'whale-celebrate') status.textContent = 'クジラ、クリア！';
    if (phase === 'turtle-polish') status.textContent = `甲羅をぐるぐる磨こう！　${count}/${total}秒`;
    if (phase === 'turtle-celebrate') status.textContent = 'カメ、クリア！';
    if (phase === 'light-collect') status.textContent = '光る模型にスマホを向けて、海の光を集めよう！';
    if (phase === 'stamp') status.textContent = `${config?.label || '海のなかま'}の光るスタンプをゲット！`;
    if (phase === 'complete') status.textContent = 'スタンプを集めて、海の光を完成させよう！';
    if (phase === 'all-complete') status.textContent = '3つの海の光がそろったよ！';
    if (phase === 'finished') status.textContent = 'おしまい';
    handleDemoStateChange(key, phase);
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

startButton.addEventListener('click', () => {
  stopDemoSequence();
  startExperience({ tracking: true, auto: false });
});
demoButton.addEventListener('click', () => startDemoSequence());

function startDemoSequence() {
  if (starting) return;
  stopDemoSequence();
  demoSequenceActive = true;
  effects.clearCollectedStamps();
  startExperience({ tracking: false, config: CREATURES[CREATURE_ORDER[0]] });
}

function stopDemoSequence() {
  demoSequenceActive = false;
  if (demoTransitionTimer) clearTimeout(demoTransitionTimer);
  demoTransitionTimer = null;
}

function handleDemoStateChange(key, phase) {
  if (!demoSequenceActive) return;
  if (phase === 'finished') {
    demoSequenceActive = false;
    return;
  }
  if (phase !== 'complete' || demoTransitionTimer) return;
  const currentIndex = CREATURE_ORDER.indexOf(key);
  const nextKey = CREATURE_ORDER[currentIndex + 1];
  if (!nextKey) return;
  status.textContent = `次は${CREATURES[nextKey].label}！`;
  demoTransitionTimer = setTimeout(() => {
    demoTransitionTimer = null;
    if (!demoSequenceActive) return;
    startExperience({ tracking: false, config: CREATURES[nextKey] });
  }, 1450);
}

async function startExperience({ tracking, config, auto = false }) {
  if (starting) return;
  starting = true;
  trackingMode = tracking;
  startButton.disabled = true;
  demoButton.disabled = true;
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
      status.textContent = '光る模型にスマホを向けて、海の光を集めよう！';
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
  else status.textContent = 'ゲームを最初からやり直します';
});

addEventListener('pagehide', () => engine?.stop?.());

const pageOptions = new URLSearchParams(location.search);
if (pageOptions.get('demo') !== '1') {
  setTimeout(() => startExperience({ tracking: true, auto: true }), 80);
} else {
  status.textContent = 'デモボタンで3種類の演出を順番に確認できます';
}

function friendlyError(error) {
  if (error?.name === 'NotAllowedError') return 'カメラの許可が必要です';
  if (error?.name === 'NotFoundError') return 'カメラが見つかりません';
  if (!window.isSecureContext) return 'HTTPSで開いてください';
  return error?.message || 'ブラウザとカメラ設定を確認してください';
}
