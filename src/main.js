import { AmbientOcean } from './ambient-ocean.js?v=20261004-gestures1';
import { CameraMotionDetector } from './motion-detector.js?v=20261004-kiosk1';
import { GestureController } from './gesture-controller.js?v=20261004-gestures1';

const app = document.querySelector('#app');
const video = document.querySelector('#camera');
const canvas = document.querySelector('#ocean');
const setup = document.querySelector('#setup');
const setupTitle = document.querySelector('#setup-title');
const setupMessage = document.querySelector('#setup-message');
const cameraButton = document.querySelector('#camera-button');
const fullscreenButton = document.querySelector('#fullscreen-button');
const status = document.querySelector('#status');
const context = canvas.getContext('2d');

const gestureElements = {
  guide: document.querySelector('#gesture-guide'),
  progress: document.querySelector('#gesture-progress'),
  ghost: document.querySelector('#gesture-ghost'),
  label: document.querySelector('#gesture-label')
};

const ocean = new AmbientOcean();
const motion = new CameraMotionDetector(video, ({ x, y, intensity }) => {
  ocean.reactToMotion(x, y, intensity);
});
const gestures = new GestureController(video, gestureElements, {
  onSummon({ type, x, y, special, label }) {
    ocean.summonCreature(type, x, y, { special });
    status.textContent = label;
    clearTimeout(gestureStatusTimer);
    gestureStatusTimer = setTimeout(() => {
      status.textContent = '手のポーズで海のなかまを呼んでみよう';
    }, 1800);
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
  setup.hidden = true;
  app.classList.remove('is-starting');
  app.classList.add('is-running');
  status.textContent = 'ジェスチャー召喚のプレビュー';
  const samples = [
    { type: 'octopus', x: 0.25, y: 0.7, label: 'タコのなかまが現れた！' },
    { type: 'puffer', x: 0.3, y: 0.66, label: 'フグのなかまがふくらんだ！' },
    { type: 'crab', x: 0.27, y: 0.72, label: 'カニのなかまが現れた！' },
    { type: 'crab', x: 0.5, y: 0.68, special: true, label: '大きなカニが現れた！' }
  ];
  let index = 0;
  const summonNext = () => {
    const sample = samples[index % samples.length];
    ocean.summonCreature(sample.type, sample.x, sample.y, { special: sample.special });
    status.textContent = sample.label;
    index += 1;
  };
  summonNext();
  previewTimer = setInterval(summonNext, 3200);
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
    stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 1920 },
        height: { ideal: 1080 },
        frameRate: { ideal: 30, max: 30 }
      },
      audio: false
    });
    video.srcObject = stream;
    await video.play();
    motion.start();
    app.classList.remove('is-starting');
    app.classList.add('is-running');
    status.textContent = '手の認識を準備中…';
    setup.classList.add('is-hidden');
    setTimeout(() => { setup.hidden = true; }, 580);
    gestures.start().then(() => {
      status.textContent = '手のポーズで海のなかまを呼んでみよう';
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
}

function resize() {
  const dpr = Math.min(devicePixelRatio || 1, 1.5);
  canvas.width = Math.max(1, Math.round(innerWidth * dpr));
  canvas.height = Math.max(1, Math.round(innerHeight * dpr));
  canvas.style.width = `${innerWidth}px`;
  canvas.style.height = `${innerHeight}px`;
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function render(timestamp) {
  const delta = Math.min((timestamp - lastFrame) / 1000, 0.05);
  lastFrame = timestamp;
  context.clearRect(0, 0, innerWidth, innerHeight);
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
