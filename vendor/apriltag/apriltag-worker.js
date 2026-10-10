/*
 * Lightweight worker bridge for the AprilTag 3 WebAssembly build from
 * arenaxr/apriltag-js-standalone (BSD-3-Clause). See LICENSE and NOTICE.md.
 */
importScripts('./apriltag_wasm.js');

let moduleInstance = null;
let setImageBuffer = null;
let detectTags = null;
const decoder = new TextDecoder();

function decodeDetections() {
  const jsonStruct = detectTags();
  const jsonLength = moduleInstance.getValue(jsonStruct, 'i32');
  if (!jsonLength) return [];
  const jsonPointer = moduleInstance.getValue(jsonStruct + 4, 'i32');
  const bytes = moduleInstance.HEAPU8.subarray(jsonPointer, jsonPointer + jsonLength);
  return JSON.parse(decoder.decode(bytes));
}

async function initialize() {
  moduleInstance = await AprilTagWasm({
    locateFile(path) {
      return new URL(path, self.location.href).href;
    }
  });

  const initializeDetector = moduleInstance.cwrap('atagjs_init', 'number', []);
  const setDetectorOptions = moduleInstance.cwrap(
    'atagjs_set_detector_options',
    'number',
    ['number', 'number', 'number', 'number', 'number', 'number', 'number']
  );
  setImageBuffer = moduleInstance.cwrap(
    'atagjs_set_img_buffer',
    'number',
    ['number', 'number', 'number']
  );
  detectTags = moduleInstance.cwrap('atagjs_detect', 'number', []);

  initializeDetector();
  // Match the upstream browser wrapper's verified defaults. The main thread
  // only consumes ID and screen point even though pose data is returned.
  setDetectorOptions(2, 0, 1, 1, 4, 1, 1);
  self.postMessage({ type: 'ready' });
}

self.addEventListener('message', (event) => {
  const { type, requestId, pixels, width, height } = event.data || {};
  if (type !== 'detect' || !moduleInstance || !pixels || !width || !height) return;
  try {
    const grayscale = new Uint8Array(pixels);
    const imagePointer = setImageBuffer(width, height, width);
    moduleInstance.HEAPU8.set(grayscale, imagePointer);
    self.postMessage({ type: 'result', requestId, detections: decodeDetections() });
  } catch (error) {
    self.postMessage({
      type: 'result',
      requestId,
      detections: [],
      error: error?.message || String(error)
    });
  }
});

initialize().catch((error) => {
  self.postMessage({ type: 'error', message: error?.message || String(error) });
});
