const MAX_RIPPLES = 4;
const MAX_HANDS = 6;

const VERTEX_SHADER = `
attribute vec2 aPosition;
varying vec2 vUv;
void main() {
  vUv = aPosition * 0.5 + 0.5;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}`;

const FRAGMENT_SHADER = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uCamera;
uniform float uTime;
uniform float uHasCamera;
uniform float uAspect;
uniform vec3 uRipples[${MAX_RIPPLES}];
uniform float uRippleCount;
uniform vec3 uHands[${MAX_HANDS}];
uniform float uHandCount;
uniform float uCharge;

void main() {
  vec2 uv = vUv;
  vec2 scaled = vec2((uv.x - 0.5) * uAspect, uv.y - 0.5);
  vec2 warp = vec2(
    sin(uv.y * 13.0 + uTime * 0.62) + sin(uv.y * 31.0 - uTime * 0.31),
    cos(uv.x * 15.0 - uTime * 0.48) + sin(uv.x * 27.0 + uTime * 0.27)
  ) * 0.0009;
  float rippleLight = 0.0;

  for (int i = 0; i < ${MAX_RIPPLES}; i++) {
    if (float(i) >= uRippleCount) break;
    vec2 center = uRipples[i].xy;
    vec2 delta = scaled - vec2((center.x - 0.5) * uAspect, center.y - 0.5);
    float distanceToCenter = length(delta);
    float age = uRipples[i].z;
    float ring = sin(distanceToCenter * 82.0 - age * 11.0);
    float envelope = exp(-distanceToCenter * 4.6) * exp(-age * 0.72);
    warp += normalize(delta + vec2(0.0001)) * ring * envelope * 0.0022;
    rippleLight += pow(max(0.0, ring), 5.0) * envelope * 0.42;
  }

  float handGlow = 0.0;
  for (int i = 0; i < ${MAX_HANDS}; i++) {
    if (float(i) >= uHandCount) break;
    vec2 hand = vec2((uHands[i].x - 0.5) * uAspect, uHands[i].y - 0.5);
    float d = length(scaled - hand);
    handGlow += exp(-d * (11.0 - uHands[i].z * 3.0));
    warp += normalize(scaled - hand + vec2(0.0001)) * exp(-d * 15.0) * 0.0014;
  }

  vec2 cameraUv = vec2(1.0 - uv.x, uv.y) + warp;
  vec3 cameraColor = texture2D(uCamera, clamp(cameraUv, 0.002, 0.998)).rgb;
  vec3 fallback = mix(vec3(0.015, 0.12, 0.25), vec3(0.02, 0.47, 0.64), pow(1.0 - uv.y, 1.7));
  vec3 color = mix(fallback, cameraColor, uHasCamera);

  color += vec3(0.72, 0.94, 1.0) * rippleLight * 0.055;
  color += vec3(0.72, 0.95, 1.0) * handGlow * (0.012 + uCharge * 0.025);
  gl_FragColor = vec4(color, 1.0);
}`;

export class WaterRenderer {
  constructor(canvas, video) {
    this.canvas = canvas;
    this.video = video;
    this.gl = canvas?.getContext('webgl', {
      alpha: false,
      antialias: false,
      desynchronized: true,
      powerPreference: 'high-performance'
    });
    this.available = Boolean(this.gl);
    this.ripples = [];
    this.hands = [];
    this.charge = 0;
    this.lastRenderAt = -Infinity;
    this.hasCameraFrame = false;
    this.rippleData = new Float32Array(MAX_RIPPLES * 3);
    this.handData = new Float32Array(MAX_HANDS * 3);
    canvas?.addEventListener('webglcontextlost', (event) => {
      event.preventDefault();
      this.available = false;
      this.hasCameraFrame = false;
    });
    canvas?.addEventListener('webglcontextrestored', () => {
      // 展示中にGPUが一時停止した場合は、すべてのWebGL資源を確実に作り直す。
      location.reload();
    });
    if (this.available) this.initialize();
  }

  initialize() {
    const gl = this.gl;
    const program = this.createProgram(VERTEX_SHADER, FRAGMENT_SHADER);
    if (!program) {
      this.available = false;
      return;
    }
    this.program = program;
    this.locations = {
      position: gl.getAttribLocation(program, 'aPosition'),
      camera: gl.getUniformLocation(program, 'uCamera'),
      time: gl.getUniformLocation(program, 'uTime'),
      hasCamera: gl.getUniformLocation(program, 'uHasCamera'),
      aspect: gl.getUniformLocation(program, 'uAspect'),
      ripples: gl.getUniformLocation(program, 'uRipples[0]'),
      rippleCount: gl.getUniformLocation(program, 'uRippleCount'),
      hands: gl.getUniformLocation(program, 'uHands[0]'),
      handCount: gl.getUniformLocation(program, 'uHandCount'),
      charge: gl.getUniformLocation(program, 'uCharge')
    };
    this.buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
    this.texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([3, 35, 72, 255]));
  }

  createProgram(vertexSource, fragmentSource) {
    const gl = this.gl;
    const compile = (type, source) => {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.warn('水中シェーダーを準備できません。', gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
      }
      return shader;
    };
    const vertex = compile(gl.VERTEX_SHADER, vertexSource);
    const fragment = compile(gl.FRAGMENT_SHADER, fragmentSource);
    if (!vertex || !fragment) return null;
    const program = gl.createProgram();
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.warn('水中シェーダーを接続できません。', gl.getProgramInfoLog(program));
      gl.deleteProgram(program);
      return null;
    }
    return program;
  }

  resize(width, height, dpr = 1) {
    if (!this.available) return;
    const pixelWidth = Math.max(1, Math.round(width * dpr));
    const pixelHeight = Math.max(1, Math.round(height * dpr));
    if (this.canvas.width !== pixelWidth || this.canvas.height !== pixelHeight) {
      this.canvas.width = pixelWidth;
      this.canvas.height = pixelHeight;
    }
    this.gl.viewport(0, 0, pixelWidth, pixelHeight);
  }

  setHands(hands = [], charge = 0) {
    this.hands = hands.slice(0, MAX_HANDS).map((hand) => ({ x: hand.x, y: hand.y, size: hand.size || 0.18 }));
    this.charge = charge || 0;
  }

  addRipple(x, y, intensity = 0.5) {
    this.ripples.push({ x, y, age: 0, intensity });
    if (this.ripples.length > MAX_RIPPLES) this.ripples.shift();
  }

  render(time, delta) {
    if (!this.available || !this.program) return false;
    for (const ripple of this.ripples) ripple.age += delta * (0.85 + ripple.intensity * 0.15);
    this.ripples = this.ripples.filter((ripple) => ripple.age < 4.2);
    if (time - this.lastRenderAt < 1 / 24) return this.hasCameraFrame;
    this.lastRenderAt = time;
    const gl = this.gl;
    gl.useProgram(this.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    let hasCamera = 0;
    if (this.video?.readyState >= 2 && this.video.videoWidth) {
      try {
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.video);
        hasCamera = 1;
      } catch {
        hasCamera = 0;
      }
    }
    this.rippleData.fill(0);
    this.handData.fill(0);
    this.ripples.forEach((ripple, index) => {
      const offset = index * 3;
      this.rippleData[offset] = ripple.x;
      this.rippleData[offset + 1] = ripple.y;
      this.rippleData[offset + 2] = ripple.age;
    });
    this.hands.forEach((hand, index) => {
      const offset = index * 3;
      this.handData[offset] = hand.x;
      this.handData[offset + 1] = hand.y;
      this.handData[offset + 2] = hand.size;
    });
    gl.enableVertexAttribArray(this.locations.position);
    gl.vertexAttribPointer(this.locations.position, 2, gl.FLOAT, false, 0, 0);
    gl.uniform1i(this.locations.camera, 0);
    gl.uniform1f(this.locations.time, time);
    gl.uniform1f(this.locations.hasCamera, hasCamera);
    gl.uniform1f(this.locations.aspect, this.canvas.width / Math.max(1, this.canvas.height));
    gl.uniform3fv(this.locations.ripples, this.rippleData);
    gl.uniform1f(this.locations.rippleCount, this.ripples.length);
    gl.uniform3fv(this.locations.hands, this.handData);
    gl.uniform1f(this.locations.handCount, this.hands.length);
    gl.uniform1f(this.locations.charge, this.charge);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    this.hasCameraFrame = Boolean(hasCamera);
    return this.hasCameraFrame;
  }
}
