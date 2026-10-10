const SCAN_WIDTH = 192;
const SCAN_HEIGHT = 144;
const GRID_SIZE = 12;
const MAX_CANDIDATES = 7;
const MIN_COMPONENT_AREA = 54;
const REFERENCE_SOURCES = {
  jellyfish: {
    src: new URL('../assets/targets/resin-jellyfish-reference.png', import.meta.url).href,
    crop: { x: 0.17, y: 0.1, width: 0.66, height: 0.78 }
  },
  whale: {
    src: new URL('../assets/targets/resin-whale-reference.png', import.meta.url).href,
    crop: { x: 0.02, y: 0.1, width: 0.88, height: 0.58 }
  },
  turtle: {
    src: new URL('../assets/targets/resin-turtle-reference.png', import.meta.url).href,
    crop: { x: 0.1, y: 0.2, width: 0.72, height: 0.64 }
  }
};

const FALLBACK_DESCRIPTORS = {
  jellyfish: [{ aspect: 0.82, fill: 0.52, lowerRatio: 0.35 }],
  whale: [
    { aspect: 1.62, fill: 0.48, lowerRatio: 0.48 },
    // 手で尾を持った際に輪郭が分断されたクジラの部分シルエット。
    { aspect: 1.2, fill: 0.44, lowerRatio: 0.54 }
  ],
  turtle: [{ aspect: 1.28, fill: 0.55, lowerRatio: 0.52 }]
};

export class ResinModelDetector {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = SCAN_WIDTH;
    this.canvas.height = SCAN_HEIGHT;
    this.context = this.canvas.getContext('2d', {
      alpha: false,
      willReadFrequently: true
    });
    this.mask = new Uint8Array(SCAN_WIDTH * SCAN_HEIGHT);
    this.closedMask = new Uint8Array(SCAN_WIDTH * SCAN_HEIGHT);
    this.visited = new Uint8Array(SCAN_WIDTH * SCAN_HEIGHT);
    this.queue = new Uint32Array(SCAN_WIDTH * SCAN_HEIGHT);
    this.references = new Map();
    this.history = [];
    this.lastCheck = -Infinity;
    // 手持ちで2〜3秒しか見せない運用を想定し、約9fpsで軽量スキャンする。
    this.intervalSeconds = 0.11;
    this.ready = false;
  }

  async initialize() {
    const entries = await Promise.all(Object.entries(REFERENCE_SOURCES).map(async ([key, source]) => {
      try {
        const image = await loadImage(source.src);
        const descriptors = [1, 0.45, 0.24]
          .map((brightness) => this.describeReferenceImage(key, image, brightness))
          .filter(Boolean);
        return [key, descriptors];
      } catch (error) {
        console.warn(`模型の参照画像を読み込めませんでした: ${key}`, error);
        return [key, null];
      }
    }));

    for (const [key, descriptors] of entries) {
      if (descriptors?.length) this.references.set(key, descriptors);
    }
    this.ready = true;
  }

  describeReferenceImage(key, image, brightness = 1) {
    const source = REFERENCE_SOURCES[key];
    if (!source || !image) return null;
    drawContainedCrop(this.context, image, source.crop);
    const imageData = this.context.getImageData(0, 0, SCAN_WIDTH, SCAN_HEIGHT);
    if (brightness !== 1) {
      for (let index = 0; index < imageData.data.length; index += 4) {
        imageData.data[index] *= brightness;
        imageData.data[index + 1] *= brightness;
        imageData.data[index + 2] *= brightness;
      }
    }
    return this.describe(imageData);
  }

  reset() {
    this.history.length = 0;
  }

  scan(video, elapsedSeconds) {
    if (!this.ready || !this.context || !video || video.readyState < 2 || !video.videoWidth) return null;
    if (elapsedSeconds - this.lastCheck < this.intervalSeconds) return null;
    this.lastCheck = elapsedSeconds;

    try {
      this.context.drawImage(video, 0, 0, SCAN_WIDTH, SCAN_HEIGHT);
      const imageData = this.context.getImageData(0, 0, SCAN_WIDTH, SCAN_HEIGHT);
      const candidates = this.describeCandidates(imageData);
      const matches = candidates
        .map((descriptor) => this.classify(descriptor))
        .filter(Boolean)
        .sort((a, b) => b.selectionScore - a.selectionScore);
      const result = matches[0] || null;
      return this.stabilize(result);
    } catch {
      return null;
    }
  }

  describe(imageData) {
    return this.describeCandidates(imageData, 1)[0] || null;
  }

  describeCandidates(imageData, limit = MAX_CANDIDATES) {
    const { data, width, height } = imageData;
    const histogram = new Uint32Array(64);
    for (let index = 0; index < data.length; index += 16) {
      const luminance = data[index] * 0.24 + data[index + 1] * 0.62 + data[index + 2] * 0.14;
      histogram[Math.min(63, Math.floor(luminance / 4))] += 1;
    }
    const median = histogramPercentile(histogram, 0.5) * 4;
    const high = Math.max(20, histogramPercentile(histogram, 0.88) * 4);
    const gain = clamp(118 / high, 1, 3.4);

    this.mask.fill(0);
    for (let y = 1; y < height - 1; y += 1) {
      for (let x = 1; x < width - 1; x += 1) {
        const pixel = y * width + x;
        const offset = pixel * 4;
        const red = Math.min(255, data[offset] * gain);
        const green = Math.min(255, data[offset + 1] * gain);
        const blue = Math.min(255, data[offset + 2] * gain);
        const luminance = red * 0.24 + green * 0.62 + blue * 0.14;
        const coolRatio = (blue + 10) / (green + 10);
        const redRatio = (red + 10) / (green + 10);
        const chroma = Math.max(red, green, blue) - Math.min(red, green, blue);
        const violet = coolRatio > 1.045
          && redRatio > 0.78
          && blue >= red * 0.9
          && blue - green > Math.max(3, 11 / gain);
        const translucent = luminance > Math.max(18, median * gain + 10)
          && coolRatio > 0.985
          && redRatio > 0.86
          && blue >= red * 0.88
          && chroma < 96;
        if (violet || translucent) this.mask[pixel] = 1;
      }
    }

    closeMask(this.mask, this.closedMask, width, height);
    return this.componentDescriptors(this.closedMask, width, height, limit);
  }

  componentDescriptors(mask, width, height, limit) {
    this.visited.fill(0);
    const descriptors = [];
    for (let start = 0; start < mask.length; start += 1) {
      if (!mask[start] || this.visited[start]) continue;
      let head = 0;
      let tail = 0;
      this.queue[tail++] = start;
      this.visited[start] = 1;
      let minX = width;
      let minY = height;
      let maxX = 0;
      let maxY = 0;

      while (head < tail) {
        const pixel = this.queue[head++];
        const x = pixel % width;
        const y = Math.floor(pixel / width);
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);

        for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
          for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
            if (!offsetX && !offsetY) continue;
            const nextX = x + offsetX;
            const nextY = y + offsetY;
            if (nextX < 0 || nextX >= width || nextY < 0 || nextY >= height) continue;
            const next = nextY * width + nextX;
            if (!mask[next] || this.visited[next]) continue;
            this.visited[next] = 1;
            this.queue[tail++] = next;
          }
        }
      }

      const area = tail;
      const bboxWidth = maxX - minX + 1;
      const bboxHeight = maxY - minY + 1;
      const coverage = area / (width * height);
      // 過小な光点と、人・窓・カーテンなど画面の大半を占める領域を除外。
      if (
        area < MIN_COMPONENT_AREA
        || bboxWidth < 8
        || bboxHeight < 7
        || coverage < 0.012
        || coverage > 0.3
      ) continue;

      const grid = new Float32Array(GRID_SIZE * GRID_SIZE);
      let lowerPixels = 0;
      for (let index = 0; index < tail; index += 1) {
        const pixel = this.queue[index];
        const x = pixel % width;
        const y = Math.floor(pixel / width);
        const gridX = Math.min(GRID_SIZE - 1, Math.floor((x - minX) / bboxWidth * GRID_SIZE));
        const gridY = Math.min(GRID_SIZE - 1, Math.floor((y - minY) / bboxHeight * GRID_SIZE));
        grid[gridY * GRID_SIZE + gridX] += 1;
        if (y >= minY + bboxHeight * 0.56) lowerPixels += 1;
      }
      const cellArea = Math.max(1, bboxWidth * bboxHeight / (GRID_SIZE * GRID_SIZE));
      for (let index = 0; index < grid.length; index += 1) {
        grid[index] = Math.min(1, grid[index] / cellArea);
      }

      descriptors.push({
        x: (minX + maxX) * 0.5 / width,
        y: (minY + maxY) * 0.5 / height,
        coverage,
        area,
        aspect: bboxWidth / bboxHeight,
        fill: area / (bboxWidth * bboxHeight),
        lowerRatio: lowerPixels / area,
        grid
      });
    }
    descriptors.sort((a, b) => b.area - a.area);
    return descriptors.slice(0, limit);
  }

  classify(descriptor) {
    const scores = this.rank(descriptor);
    const best = scores[0];
    const margin = best.score - scores[1].score;
    if (best.score < 0.6 || margin < 0.055) return null;
    const centerDistance = Math.hypot(descriptor.x - 0.5, descriptor.y - 0.52);
    const confidence = clamp(best.score * 0.72 + margin * 1.55, 0, 1);
    return {
      key: best.key,
      confidence,
      score: best.score,
      margin,
      // 中央付近の候補をわずかに優先し、窓や照明を拾いにくくする。
      selectionScore: confidence + Math.max(0, 0.08 - centerDistance * 0.09),
      x: descriptor.x,
      y: descriptor.y,
      coverage: descriptor.coverage
    };
  }

  rank(descriptor) {
    const scores = [];
    for (const key of Object.keys(REFERENCE_SOURCES)) {
      const references = [
        ...(this.references.get(key) || []),
        ...FALLBACK_DESCRIPTORS[key]
      ];
      let score = Math.max(...references.map((reference) => {
        const gridScore = reference.grid ? Math.max(
          gridSimilarity(descriptor.grid, reference.grid, false),
          gridSimilarity(descriptor.grid, reference.grid, true)
        ) : 0.45;
        const aspectScore = Math.exp(-Math.abs(Math.log(descriptor.aspect / reference.aspect)) * 1.5);
        const fillScore = Math.max(0, 1 - Math.abs(descriptor.fill - reference.fill) * 2.4);
        const lowerScore = Math.max(0, 1 - Math.abs(descriptor.lowerRatio - reference.lowerRatio) * 3.2);
        return gridScore * 0.55 + aspectScore * 0.23 + fillScore * 0.08 + lowerScore * 0.14;
      }));

      if (key === 'jellyfish' && descriptor.aspect < 1.02 && descriptor.lowerRatio > 0.27) score += 0.08;
      if (key === 'whale' && descriptor.aspect > 1.48) score += 0.07;
      if (
        key === 'whale'
        && descriptor.aspect >= 1.12
        && descriptor.fill < 0.5
        && descriptor.lowerRatio > 0.48
      ) score += 0.1;
      if (key === 'turtle' && descriptor.aspect >= 1.02 && descriptor.aspect <= 1.55) score += 0.035;
      scores.push({ key, score });
    }
    scores.sort((a, b) => b.score - a.score);
    return scores;
  }

  stabilize(result) {
    this.history.push(result);
    if (this.history.length > 6) this.history.shift();
    if (!result) return null;

    const matching = this.history.filter((entry) => entry?.key === result.key);
    const confidence = matching.reduce((sum, entry) => sum + entry.confidence, 0) / matching.length;
    // 強い候補は2回、通常候補は3回で確定。約220〜330msで起動できる。
    const requiredHits = confidence >= 0.78 ? 2 : 3;
    if (matching.length < requiredHits || confidence < 0.62) return null;
    return {
      key: result.key,
      confidence,
      x: matching.reduce((sum, entry) => sum + entry.x, 0) / matching.length,
      y: matching.reduce((sum, entry) => sum + entry.y, 0) / matching.length,
      coverage: matching.reduce((sum, entry) => sum + entry.coverage, 0) / matching.length
    };
  }
}

function closeMask(source, target, width, height) {
  target.fill(0);
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = y * width + x;
      let neighbors = 0;
      for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
        for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
          neighbors += source[(y + offsetY) * width + x + offsetX];
        }
      }
      if (source[index] || neighbors >= 3) target[index] = 1;
    }
  }
}

function gridSimilarity(candidate, reference, mirror) {
  let overlap = 0;
  let total = 0;
  for (let y = 0; y < GRID_SIZE; y += 1) {
    for (let x = 0; x < GRID_SIZE; x += 1) {
      const candidateValue = candidate[y * GRID_SIZE + x];
      const referenceX = mirror ? GRID_SIZE - 1 - x : x;
      const referenceValue = reference[y * GRID_SIZE + referenceX];
      overlap += Math.min(candidateValue, referenceValue);
      total += Math.max(candidateValue, referenceValue);
    }
  }
  return total ? overlap / total : 0;
}

function histogramPercentile(histogram, percentile) {
  const total = histogram.reduce((sum, value) => sum + value, 0);
  const target = total * percentile;
  let count = 0;
  for (let index = 0; index < histogram.length; index += 1) {
    count += histogram[index];
    if (count >= target) return index;
  }
  return histogram.length - 1;
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

function drawContainedCrop(context, image, crop) {
  const sourceX = image.naturalWidth * crop.x;
  const sourceY = image.naturalHeight * crop.y;
  const sourceWidth = image.naturalWidth * crop.width;
  const sourceHeight = image.naturalHeight * crop.height;
  const scale = Math.min(SCAN_WIDTH / sourceWidth, SCAN_HEIGHT / sourceHeight);
  const width = sourceWidth * scale;
  const height = sourceHeight * scale;
  const x = (SCAN_WIDTH - width) * 0.5;
  const y = (SCAN_HEIGHT - height) * 0.5;
  context.save();
  context.fillStyle = '#000';
  context.fillRect(0, 0, SCAN_WIDTH, SCAN_HEIGHT);
  context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, x, y, width, height);
  context.restore();
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
