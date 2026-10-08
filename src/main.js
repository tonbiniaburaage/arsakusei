import { AmbientOcean } from './ambient-ocean.js?v=20261009-pc6';
import { CameraMotionDetector } from './motion-detector.js?v=20261009-pc6';
import { GestureController } from './gesture-controller.js?v=20261009-pc6';
import { WaterRenderer } from './water-renderer.js?v=20261009-pc6';

const app = document.querySelector('#app');
const video = document.querySelector('#camera');
const waterCanvas = document.querySelector('#water-scene');
const canvas = document.querySelector('#ocean');
const setup = document.querySelector('#setup');
const setupTitle = document.querySelector('#setup-title');
const setupMessage = document.querySelector('#setup-message');
const cameraButton = document.querySelector('#camera-button');
const fullscreenButton = document.querySelector('#fullscreen-button');
const status = document.querySelector('#status');
const context = canvas.getContext('2d');
const water = new WaterRenderer(waterCanvas, video);
if (!water.available) app.classList.add('is-webgl-disabled');

const gestureElements = {
  guide: document.querySelector('#gesture-guide'),
  progress: document.querySelector('#gesture-progress'),
  label: document.querySelector('#gesture-label')
};

const ocean = new AmbientOcean();
const motion = new CameraMotionDetector(video, ({ x, y, intensity }) => {
  ocean.reactToMotion(x, y, intensity);
  water.addRipple(x, y, intensity);
});
const gestures = new GestureController(video, gestureElements, {
  onInteraction(state) {
    applyInteractionState(state);
  },
  onHandsLost(position) {
    ocean.releaseHands(position);
    water.setHands([], 0);
    water.addRipple(position?.x ?? 0.5, position?.y ?? 0.55, 1);
    showTemporaryStatus('魚たちがびっくりして散らばった！');
  },
  onVortex({ x, y }) {
    ocean.startVortex(x, y);
    water.addRipple(x, y, 1.35);
    showTemporaryStatus('ぐるぐる渦潮が発生！');
  },
  onSpecial({ x, y, direction }) {
    ocean.launchShark(x, y, direction);
    water.addRipple(x, y, 1.6);
    showTemporaryStatus('光のクジラが横切る！');
  },
  onCreatureGesture({ type, x, y, stage = 1 }) {
    if (type === 'garden-eel') {
      ocean.summonGardenEels(x, y, stage);
      showTemporaryStatus(`ちんあなごが増えた！ ${stage}/3`);
    } else {
      ocean.summonWalkingCrabs(x, y, stage === 3 ? 10 : 4);
      showTemporaryStatus(stage === 3 ? 'カニがどっと増えた！' : `カニが現れた！ ${stage}/3`);
    }
  },
  onUnavailable() {
    status.textContent = '魚たちの水中世界をお楽しみください';
    gestureElements.guide.hidden = true;
  }
});

let stream = null;
let starting = false;
let lastFrame = performance.now();
let gestureStatusTimer = null;
let previewTimer = null;
const previewMode = new URLSearchParams(location.search).get('preview') === '1';

cameraButton.addEventListener('click', () => startCamera(false));
fullscreenButton.addEventListener('click', toggleFullscreen);
addEventListener('keydown', (event) => {
  if (event.key.toLowerCase() === 'f') toggleFullscreen();
});
addEventListener('resize', resize);
addEventListener('pagehide', stopCamera);

resize();
requestAnimationFrame(render);
if (previewMode) startPreview();
else setTimeout(() => startCamera(true), 120);

function startPreview() {
  app.classList.add('is-water-preview');
  setup.hidden = true;
  app.classList.remove('is-starting');
  app.classList.add('is-running');
  gestureElements.guide.hidden = false;
  status.textContent = 'インタラクション・プレビュー';
  let startedAt = performance.now();
  let previousPhase = '';
  let sharkLaunched = false;
  let eelLaunched = false;
  let crabLaunched = false;
  previewTimer = setInterval(() => {
    const elapsed = (performance.now() - startedAt) / 1000;
    const cycle = elapsed % 20;
    let phase = 'gather';
    if (cycle >= 3 && cycle < 4.4) phase = 'flow';
    else if (cycle >= 4.4 && cycle < 5.6) phase = 'scatter';
    else if (cycle >= 5.6 && cycle < 8.4) phase = 'vortex';
    else if (cycle >= 8.4 && cycle < 13) phase = 'special';
    else if (cycle >= 13 && cycle < 16.5) phase = 'garden-eel';
    else if (cycle >= 16.5) phase = 'crab-walk';

    if (phase === 'gather') {
      if (previousPhase !== phase) {
        sharkLaunched = false;
        eelLaunched = false;
        crabLaunched = false;
      }
      const hand = { x: 0.34 + Math.sin(elapsed * 1.4) * 0.08, y: 0.57 + Math.cos(elapsed * 1.1) * 0.05, size: 0.2 };
      applyInteractionState({
        hands: [
          hand,
          { x: 0.67 + Math.sin(elapsed * 1.1) * 0.06, y: 0.36, size: 0.17 },
          { x: 0.76 + Math.cos(elapsed * 1.25) * 0.05, y: 0.72, size: 0.19 }
        ],
        speed: 0.12
      });
      gestureElements.label.textContent = '魚が手に集まっているよ';
    } else if (phase === 'flow') {
      const hand = { x: 0.2 + (cycle - 3) * 0.45, y: 0.55, size: 0.2 };
      applyInteractionState({ hands: [hand], velocity: { x: 1.3, y: 0 }, speed: 1.3 });
      gestureElements.label.textContent = '水流で魚が流される！';
    } else if (phase === 'scatter') {
      applyInteractionState({ hands: [] });
      if (previousPhase !== phase) ocean.releaseHands({ x: 0.72, y: 0.55 });
      gestureElements.label.textContent = '手をかざしてみよう';
    } else if (phase === 'vortex') {
      const angle = (cycle - 5.6) * 4.2;
      const hand = { x: 0.42 + Math.cos(angle) * 0.13, y: 0.55 + Math.sin(angle) * 0.13, size: 0.2 };
      applyInteractionState({ hands: [hand], speed: 0.8 });
      if (previousPhase !== phase) {
        ocean.startVortex(0.42, 0.55);
        water.addRipple(0.42, 0.55, 1.35);
      }
      gestureElements.label.textContent = 'ぐるぐる渦潮が発生！';
    } else if (phase === 'special') {
      const charge = Math.min(1, (cycle - 8.4) / 3);
      applyInteractionState({
        hands: [{ x: 0.38, y: 0.58, size: 0.2 }, { x: 0.62, y: 0.58, size: 0.2 }],
        charge
      });
      gestureElements.label.textContent = '両手を左右どちらかへ伸ばして、ためろ！';
      gestureElements.progress.style.setProperty('--progress', `${charge * 100}%`);
      if (charge >= 1 && !sharkLaunched) {
        ocean.launchShark(0.5, 0.58, { x: 0.86, y: -0.5 });
        water.addRipple(0.5, 0.58, 1.6);
        sharkLaunched = true;
        gestureElements.label.textContent = '光のクジラが横切る！';
      }
    } else if (phase === 'garden-eel') {
      applyInteractionState({ hands: [{ x: 0.32, y: 0.58, size: 0.2 }], speed: 0 });
      if (!eelLaunched) {
        ocean.summonGardenEels(0.32, 0.58);
        eelLaunched = true;
      }
      gestureElements.label.textContent = '人差し指で、ちんあなごを呼ぼう';
    } else if (phase === 'crab-walk') {
      applyInteractionState({ hands: [{ x: 0.68, y: 0.58, size: 0.2 }], speed: 0 });
      if (!crabLaunched) {
        ocean.summonWalkingCrabs(0.68, 0.58);
        crabLaunched = true;
      }
      gestureElements.label.textContent = 'ピースで、カニたちがお散歩！';
    }
    previousPhase = phase;
  }, 50);
}

function applyInteractionState(state) {
  ocean.setHandInteraction(state);
  water.setHands(state.hands || [], state.charge || 0);
}

async function startCamera(automatic) {
  if (starting || stream) return;
  starting = true;
  cameraButton.disabled = true;
  cameraButton.textContent = 'カメラを準備中…';
  status.textContent = 'カメラを準備中…';

  try {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('このブラウザはカメラに対応していません');
    }
    stream = await requestCameraStream();
    video.srcObject = stream;
    await video.play();
    motion.start();
    app.classList.remove('is-starting');
    app.classList.add('is-running');
    status.textContent = '手の認識を準備中…';
    setup.classList.add('is-hidden');
    setTimeout(() => { setup.hidden = true; }, 580);
    gestures.start().then(() => {
      status.textContent = '手を動かして魚たちと遊んでみよう';
    }).catch((error) => {
      console.warn('手ジェスチャー認識を初期化できません。', error);
      status.textContent = '魚たちの水中世界をお楽しみください';
      gestureElements.guide.hidden = true;
    });
  } catch (error) {
    stream = null;
    setup.hidden = false;
    setup.classList.remove('is-hidden');
    setupTitle.textContent = cameraErrorTitle(error, automatic);
    setupMessage.textContent = friendlyError(error);
    cameraButton.disabled = false;
    cameraButton.textContent = 'カメラを起動';
    status.textContent = 'カメラ待機中';
  } finally {
    starting = false;
  }
}

function stopCamera() {
  motion.stop();
  gestures.stop();
  clearTimeout(gestureStatusTimer);
  if (previewTimer) clearInterval(previewTimer);
  stream?.getTracks().forEach((track) => track.stop());
  stream = null;
  app.classList.remove('is-water-rendering');
}

async function requestCameraStream() {
  const preferred = {
    video: {
      width: { ideal: 1920 },
      height: { ideal: 1080 },
      frameRate: { ideal: 30, max: 30 }
    },
    audio: false
  };
  try {
    return await navigator.mediaDevices.getUserMedia(preferred);
  } catch (error) {
    if (!['OverconstrainedError', 'NotReadableError', 'AbortError'].includes(error?.name)) throw error;
    return navigator.mediaDevices.getUserMedia({ video: true, audio: false });
  }
}

function showTemporaryStatus(message) {
  status.textContent = message;
  clearTimeout(gestureStatusTimer);
  gestureStatusTimer = setTimeout(() => {
    status.textContent = '手を動かして魚たちと遊んでみよう';
  }, 1600);
}

function resize() {
  const dpr = Math.min(devicePixelRatio || 1, 1.35);
  canvas.width = Math.max(1, Math.round(innerWidth * dpr));
  canvas.height = Math.max(1, Math.round(innerHeight * dpr));
  canvas.style.width = `${innerWidth}px`;
  canvas.style.height = `${innerHeight}px`;
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  water.resize(innerWidth, innerHeight, dpr);
}

function render(timestamp) {
  const delta = Math.min((timestamp - lastFrame) / 1000, 0.05);
  lastFrame = timestamp;
  context.clearRect(0, 0, innerWidth, innerHeight);
  const waterHasCamera = water.render(timestamp / 1000, delta);
  if (!previewMode) app.classList.toggle('is-water-rendering', waterHasCamera);
  ocean.draw(context, innerWidth, innerHeight, timestamp / 1000, delta);
  requestAnimationFrame(render);
}

async function toggleFullscreen() {
  try {
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
    else await document.exitFullscreen();
  } catch {
    setupMessage.textContent = 'ブラウザのメニューから全画面表示にしてください。';
  }
}

function friendlyError(error) {
  if (!window.isSecureContext) return 'HTTPSまたはlocalhostで開いてください。';
  if (error?.name === 'NotAllowedError') return 'ブラウザのカメラ許可を「許可」にして、もう一度起動してください。';
  if (error?.name === 'NotFoundError') return 'PCにカメラが接続されているか確認してください。';
  if (error?.name === 'NotReadableError') return 'ほかのアプリがカメラを使用していないか確認してください。';
  return error?.message || 'カメラとブラウザの設定を確認してください。';
}

function cameraErrorTitle(error, automatic) {
  if (error?.name === 'NotFoundError') return 'カメラが見つかりません';
  if (error?.name === 'NotReadableError') return 'カメラを使用できません';
  if (error?.name === 'NotAllowedError' || automatic) return 'カメラの許可が必要です';
  return 'カメラを起動できませんでした';
}
