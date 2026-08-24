(() => {
try {
const HOLD_DELAY = 260;
const TOUCH_SLOP = 24;
const AXIS_LOCK_SLOP = 8;
const AXIS_DOMINANCE = 1.08;
const DESKTOP_CATCH_THRESHOLD = 0.84;
const COARSE_CATCH_THRESHOLD = 0.62;
const COARSE_RELEASE_COMMIT_PX = 24;
const MAGNET_DURATION = 120;
const AUTO_DURATION = 800;
const CATCH_SETTLE_DURATION = 120;
const FRAME_COUNT = 30;
const MIN_USABLE_FRAMES = 24;
const CATCH_SETTLE_FRAMES = 6;
const CATCH_SETTLE_START = (FRAME_COUNT - CATCH_SETTLE_FRAMES) / FRAME_COUNT;
const REACTION_START = 0.05;
const DRAG_REACH_SHARE = CATCH_SETTLE_START;
const FOLLOW_TIME_DESKTOP_MS = 24;
const FOLLOW_TIME_COARSE_MS = 28;
const LOAD_PRIORITY = { background: 0, hint: 1, interaction: 2 };
const LOAD_WORKERS = { background: 1, hint: 2, interaction: 4 };
// Four workers cap expensive bitmap decodes even when a chosen side is promoted.
const MAX_CONCURRENT_DECODES = 4;
const LOW_MEMORY_DEVICE_GB = 4;
const FRAME_DECODE_SIZE = {
  desktop: { width: 768, height: 1080 },
  mobile: { width: 448, height: 630 },
};

function resolveResourcePolicy(navigatorLike = navigator) {
  const connection = navigatorLike.connection
    || navigatorLike.mozConnection
    || navigatorLike.webkitConnection;
  const rawDeviceMemory = Number(navigatorLike.deviceMemory);
  const deviceMemory = Number.isFinite(rawDeviceMemory) && rawDeviceMemory > 0
    ? rawDeviceMemory
    : null;
  const saveData = Boolean(connection?.saveData);
  const lowMemory = deviceMemory !== null && deviceMemory <= LOW_MEMORY_DEVICE_GB;
  return Object.freeze({
    constrained: saveData || lowMemory,
    saveData,
    lowMemory,
    deviceMemory,
  });
}

const RESOURCE_POLICY = resolveResourcePolicy();

const SIDE_COPY = {
  blue: {
    route: 'AI 学习力',
    child: '把问题想明白',
    cta: '看看孩子怎样学会学习',
    status: '光已经稳稳落进男孩手里。',
  },
  orange: {
    route: 'AI 创造',
    child: '把想法做出来',
    cta: '看看孩子怎样把想法做出来',
    status: '光已经稳稳落进女孩手里。',
  },
};

const CHARACTER = { blue: 'boy', orange: 'girl' };
const ASSET_BASE = 'assets/character-sequences/hero-reach-30f-20260823-r3';
const PALM = {
  blue: { x: 0.919985, y: 0.406087 },
  orange: { x: 0.15477, y: 0.386302 },
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const lerp = (from, to, progress) => from + (to - from) * progress;
const easeOutCubic = (value) => 1 - Math.pow(1 - value, 3);
const smoothStep = (value) => value * value * (3 - 2 * value);
const arcEnvelope = (value) => 16 * value * value * (1 - value) * (1 - value);

let activeFrameDecodes = 0;
const frameDecodeQueue = [];

async function withFrameDecodeSlot(callback) {
  if (activeFrameDecodes >= MAX_CONCURRENT_DECODES) {
    await new Promise((resolve) => frameDecodeQueue.push(resolve));
  }
  activeFrameDecodes += 1;
  try {
    return await callback();
  } finally {
    activeFrameDecodes -= 1;
    frameDecodeQueue.shift()?.();
  }
}

function resizedFrameSurface(source, size) {
  const surface = 'OffscreenCanvas' in window
    ? new OffscreenCanvas(size.width, size.height)
    : Object.assign(document.createElement('canvas'), size);
  const context = surface.getContext('2d', { alpha: true });
  context.drawImage(source, 0, 0, size.width, size.height);
  return surface;
}

const hero = document.querySelector('#duelHero');
const handle = document.querySelector('.light-handle');
const handleCaption = document.querySelector('.handle-caption');
const instructionNode = document.querySelector('#heroInstruction');
const statusNode = document.querySelector('#heroStatus');
const bloom = document.querySelector('.catch-bloom');
const exposure = document.querySelector('.catch-exposure');
const controls = document.querySelector('.hero-tablist');
const resultCta = document.querySelector('#heroCta');
const compareHint = document.querySelector('#heroCompare');
const fallbackLink = document.querySelector('#heroFallback');
const autoButtons = [...document.querySelectorAll('[data-auto-side]')];

const sideElements = {
  blue: document.querySelector('[data-side="blue"]'),
  orange: document.querySelector('[data-side="orange"]'),
};
const finalFrames = {
  blue: document.querySelector('[data-final-frame="blue"]'),
  orange: document.querySelector('[data-final-frame="orange"]'),
};
const canvases = {
  blue: document.querySelector('[data-sequence="blue"]'),
  orange: document.querySelector('[data-sequence="orange"]'),
};

const requiredNodes = [
  hero,
  handle,
  handleCaption,
  instructionNode,
  statusNode,
  bloom,
  exposure,
  controls,
  resultCta,
  compareHint,
  fallbackLink,
  sideElements.blue,
  sideElements.orange,
  finalFrames.blue,
  finalFrames.orange,
  canvases.blue,
  canvases.orange,
];
if (requiredNodes.some((node) => !node) || autoButtons.length !== 2) {
  throw new Error('Hero Motion v4 required DOM is incomplete.');
}

const coarseQuery = window.matchMedia('(pointer: coarse)');
const reducedQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

const runtime = {
  phase: 'idle',
  candidate: null,
  caughtSide: null,
  poseSide: null,
  pointerId: null,
  pointerType: null,
  startClientX: 0,
  startClientY: 0,
  latestClientX: 0,
  holdReady: false,
  frame: 0,
  tweenFrame: 0,
  pressTimer: 0,
  token: 0,
  timers: new Set(),
  current: { x: 0, y: 0, scale: 1 },
  motionTarget: null,
  velocity: { x: 0, y: 0 },
  visualProgress: 0,
  characterProgress: { blue: 0, orange: 0 },
  characterDrawKey: { blue: '', orange: '' },
  lastFrameAt: 0,
  geometry: null,
  lastHeroSize: null,
  blooming: false,
  swapMaskedSide: null,
  statusText: '光停在舞台中央，等你亲手把它交出去。',
  drawCount: 0,
  longTasks: [],
  seenSides: { blue: false, orange: false },
  pendingSide: null,
  pendingKind: null,
  sequenceErrors: [],
};

const sequences = {
  blue: {
    status: 'idle', frames: [], mobile: false, context: null, active: false,
    priority: LOAD_PRIORITY.background, activeWorkers: 0, nextFrame: 0,
    loadedFrames: 0, failedFrames: [], loadPromise: null, resolveLoad: null, error: null,
    requestedAt: 0, readyAt: 0, reason: null, backgroundScheduled: false,
  },
  orange: {
    status: 'idle', frames: [], mobile: false, context: null, active: false,
    priority: LOAD_PRIORITY.background, activeWorkers: 0, nextFrame: 0,
    loadedFrames: 0, failedFrames: [], loadPromise: null, resolveLoad: null, error: null,
    requestedAt: 0, readyAt: 0, reason: null, backgroundScheduled: false,
  },
};

function pendingSequenceLoading() {
  if (reducedQuery.matches || !runtime.pendingSide) return false;
  return ['idle', 'loading'].includes(sequences[runtime.pendingSide].status);
}

function frameSrc(side, index, mobile) {
  const suffix = mobile ? '-m' : '';
  return `${ASSET_BASE}/hero-${CHARACTER[side]}-reach-${String(index).padStart(2, '0')}${suffix}.webp`;
}

function setStatus(text) {
  runtime.statusText = text;
  statusNode.textContent = text;
  instructionNode.textContent = instructionText();
}

function instructionText() {
  if (pendingSequenceLoading()) {
    return `${runtime.pendingSide === 'blue' ? '男孩' : '女孩'}的动作正在接入 · 方向已经记住`;
  }
  const { phase, candidate, caughtSide } = runtime;
  if (phase === 'idle') {
    return isTabPrimaryMode()
      ? '点下面一个方向，看孩子接住这束光'
      : '按住中间的光 · 左右拖到孩子手里';
  }
  if (phase === 'pressing') {
    return runtime.holdReady
      ? '光圈已蓄满 · 向左或右滑'
      : '不要松手 · 光圈蓄满后向左或右滑';
  }
  if (phase === 'dragging') {
    if (candidate === 'blue') return '方向已选中 · 松手也会送到男孩手里';
    if (candidate === 'orange') return '方向已选中 · 松手也会送到女孩手里';
    return '保持按住 · 选一个方向';
  }
  if (phase === 'magnetizing') return '孩子正朝这束光伸手';
  if (phase === 'catching') return '这一刻，选择开始发亮';
  if (phase === 'returning') return runtime.statusText;
  if (caughtSide) return `${SIDE_COPY[caughtSide].route} · ${SIDE_COPY[caughtSide].child}`;
  return '光正在回到中间';
}

function updateUi() {
  const { phase, candidate, caughtSide } = runtime;
  const loading = pendingSequenceLoading();
  const selectedSide = caughtSide || candidate;
  const tabPrimaryMode = isTabPrimaryMode();
  const controlsLocked = autoDeliveryLocked();
  ['idle', 'pressing', 'dragging', 'magnetizing', 'catching', 'caught', 'returning'].forEach((name) => {
    hero.classList.toggle(`phase-${name}`, phase === name);
  });
  ['blue', 'orange'].forEach((side) => {
    hero.classList.toggle(`candidate-${side}`, candidate === side);
    hero.classList.toggle(`caught-${side}`, caughtSide === side);
  });
  hero.classList.toggle('sequence-loading', loading);
  hero.classList.toggle('tap-primary-mode', tabPrimaryMode);
  hero.classList.toggle('drag-primary-mode', !tabPrimaryMode);
  hero.dataset.motionPhase = phase;
  hero.dataset.caughtSide = caughtSide || '';
  hero.dataset.sequenceBlue = sequences.blue.status;
  hero.dataset.sequenceOrange = sequences.orange.status;
  hero.dataset.pendingSequence = runtime.pendingSide
    ? `${runtime.pendingSide}:${sequences[runtime.pendingSide].status}`
    : '';
  hero.dataset.drawCount = String(runtime.drawCount);
  instructionNode.textContent = instructionText();
  instructionNode.classList.remove('is-hidden');
  handleCaption.textContent = phase === 'pressing'
    ? runtime.holdReady ? '向左或右' : '继续按住'
    : phase === 'dragging'
      ? '向左或右'
      : '按住';
  handle.disabled = false;
  handle.tabIndex = tabPrimaryMode ? -1 : 0;
  handle.setAttribute('aria-hidden', tabPrimaryMode ? 'true' : 'false');
  handle.setAttribute(
    'aria-label',
    '按住光点并左右拖动，也可以用键盘左右方向键选择',
  );
  handle.setAttribute('aria-busy', loading ? 'true' : 'false');
  autoButtons.forEach((button) => {
    button.disabled = controlsLocked;
    button.setAttribute(
      'aria-busy',
      loading && runtime.pendingSide === button.dataset.autoSide ? 'true' : 'false',
    );
    button.setAttribute('aria-pressed', selectedSide === button.dataset.autoSide ? 'true' : 'false');
  });
  controls.classList.toggle('is-loading', loading);
  controls.classList.toggle('is-busy', controlsLocked);
  fallbackLink.classList.remove('is-visible');

  for (const side of ['blue', 'orange']) {
    const active = selectedSide === side;
    sideElements[side].classList.toggle('is-active', active);
    sideElements[side].classList.toggle('is-inactive', Boolean(selectedSide) && !active);
    sideElements[side].classList.toggle('is-caught', caughtSide === side);
  }

  if (!caughtSide) {
    resultCta.classList.remove('is-visible', 'is-blue', 'is-orange');
    resultCta.setAttribute('aria-hidden', 'true');
    resultCta.setAttribute('tabindex', '-1');
    compareHint.classList.remove('is-visible');
  } else {
    const copy = SIDE_COPY[caughtSide];
    resultCta.href = caughtSide === 'blue' ? '/learning' : '/create';
    resultCta.textContent = copy.cta;
    resultCta.classList.toggle('is-blue', caughtSide === 'blue');
    resultCta.classList.toggle('is-orange', caughtSide === 'orange');
    resultCta.classList.add('is-visible');
    resultCta.setAttribute('aria-hidden', 'false');
    resultCta.removeAttribute('tabindex');
    const seenCount = Number(runtime.seenSides.blue) + Number(runtime.seenSides.orange);
    compareHint.classList.toggle('is-visible', seenCount === 1);
  }
}

function setPhase(phase) {
  runtime.phase = phase;
  updateUi();
}

function setCandidate(side) {
  runtime.candidate = side;
  updateUi();
}

function setCaughtSide(side) {
  runtime.caughtSide = side;
  updateUi();
}

function setPoseSide(side) {
  runtime.poseSide = side;
  for (const currentSide of ['blue', 'orange']) {
    const neutral = sideElements[currentSide].querySelector('.neutral-frame');
    const reach = sideElements[currentSide].querySelector('.reach-frame');
    const visible = side === currentSide;
    neutral.classList.toggle('frame-hidden', visible);
    reach.classList.toggle('frame-visible', visible);
  }
}

function setBlooming(active) {
  runtime.blooming = active;
  bloom.classList.toggle('is-blooming', active);
  exposure.classList.toggle('is-flashing', active);
}

function setSwapMaskedSide(side) {
  runtime.swapMaskedSide = side;
  for (const currentSide of ['blue', 'orange']) {
    sideElements[currentSide].classList.toggle('swap-masked', side === currentSide);
  }
}

function setLight(point, scale = 1) {
  runtime.current = { x: point.x, y: point.y, scale };
  handle.style.transform = `translate3d(${point.x}px, ${point.y}px, 0) translate(-50%, -50%) scale(${scale})`;
}

function setBloomPosition(point) {
  bloom.style.transform = `translate3d(${point.x}px, ${point.y}px, 0) translate(-50%, -50%)`;
}

function setEnergy(blue, orange) {
  hero.style.setProperty('--blue-energy', String(clamp(blue, 0, 1)));
  hero.style.setProperty('--orange-energy', String(clamp(orange, 0, 1)));
}

function nearestDecodedFrameIndex(frames, desiredIndex) {
  if (frames[desiredIndex]) return desiredIndex;
  for (let index = desiredIndex - 1; index >= 0; index -= 1) {
    if (frames[index]) return index;
  }
  // Never jump ahead of the user's gesture just because a later decode wins a
  // race. Keep the static fallback until a safe current-or-earlier pose exists.
  return -1;
}

function drawCharacterProgress(side, value, force = false) {
  const progress = clamp(value, 0, 1);
  runtime.characterProgress[side] = progress;
  const sequence = sequences[side];
  if (!['loading', 'ready'].includes(sequence.status) || !sequence.active) return false;

  const canvas = canvases[side];
  const context = sequence.context || canvas.getContext('2d', { alpha: true, desynchronized: true });
  const desiredIndex = progress <= 0
    ? 0
    : Math.max(1, Math.min(FRAME_COUNT - 1, Math.floor(progress * FRAME_COUNT)));
  const frameIndex = nearestDecodedFrameIndex(sequence.frames, desiredIndex);
  if (frameIndex < 0 || !sequence.frames[frameIndex]) {
    if (desiredIndex === 0) {
      runtime.characterDrawKey[side] = '';
      sideElements[side].classList.remove('sequence-ready');
    }
    return false;
  }
  const drawKey = String(frameIndex);
  if (!force && runtime.characterDrawKey[side] === drawKey) return true;
  runtime.characterDrawKey[side] = drawKey;

  context.globalCompositeOperation = 'copy';
  context.drawImage(sequence.frames[frameIndex], 0, 0);
  sideElements[side].classList.add('sequence-ready');
  runtime.drawCount += 1;
  hero.dataset.drawCount = String(runtime.drawCount);
  return true;
}

function activateSequence(side, progress = 0) {
  const sequence = sequences[side];
  if (!['loading', 'ready'].includes(sequence.status)) return false;
  if (!sequence.active) {
    sequence.active = true;
    runtime.characterDrawKey[side] = '';
  }
  if (drawCharacterProgress(side, progress, true)) {
    // Reveal only after a decoded frame has been painted. A loading sequence can
    // now follow the gesture progressively without ever flashing a blank canvas.
    sideElements[side].classList.add('sequence-ready');
    return true;
  }
  return false;
}

async function loadImage(url, mobile) {
  const response = await fetch(url, { cache: 'force-cache' });
  if (!response.ok) throw new Error(`Unable to load sequence frame: ${url}`);
  const blob = await response.blob();
  const size = FRAME_DECODE_SIZE[mobile ? 'mobile' : 'desktop'];

  return withFrameDecodeSlot(async () => {
    if ('createImageBitmap' in window) {
      let bitmap;
      try {
        bitmap = await window.createImageBitmap(blob, {
          resizeWidth: size.width,
          resizeHeight: size.height,
          resizeQuality: 'high',
        });
      } catch {
        bitmap = await window.createImageBitmap(blob);
      }
      if (bitmap.width === size.width && bitmap.height === size.height) return bitmap;
      const surface = resizedFrameSurface(bitmap, size);
      bitmap.close?.();
      return surface;
    }

    const image = new Image();
    const objectUrl = URL.createObjectURL(blob);
    image.decoding = 'async';
    image.src = objectUrl;
    try {
      if (image.decode) {
        await image.decode();
      } else {
        await new Promise((resolve, reject) => {
          image.onload = resolve;
          image.onerror = reject;
        });
      }
      return resizedFrameSurface(image, size);
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  });
}

function sequenceWorkerCount(sequence) {
  if (sequence.priority >= LOAD_PRIORITY.interaction) return LOAD_WORKERS.interaction;
  if (sequence.priority >= LOAD_PRIORITY.hint) return LOAD_WORKERS.hint;
  return LOAD_WORKERS.background;
}

function reportSequenceFailure(side, error, index) {
  const url = frameSrc(side, index, sequences[side].mobile);
  const detail = {
    side,
    index,
    url,
    message: error instanceof Error ? error.message : String(error),
    at: Date.now(),
  };
  runtime.sequenceErrors.push(detail);
  window.__HERO_MOTION_V4_ERRORS__ ||= [];
  window.__HERO_MOTION_V4_ERRORS__.push(detail);
  try {
    hero.dispatchEvent(new CustomEvent('hero:sequence-error', { detail }));
  } catch {
    // The console and public diagnostic state remain available in older WebViews.
  }
  console.error('[Hero Motion v4] sequence frame failed; skipping it unless the usable-frame threshold is missed.', detail, error);
}

function releaseSequenceFrames(sequence) {
  sequence.frames.forEach((frame) => frame?.close?.());
  sequence.frames = [];
}

function releaseDecodedSequence(side) {
  const sequence = sequences[side];
  if (sequence.status === 'loading' || sequence.activeWorkers > 0) return false;
  if (sequence.status !== 'ready' && sequence.status !== 'failed') return false;

  releaseSequenceFrames(sequence);
  sequence.status = 'idle';
  sequence.context = null;
  sequence.active = false;
  sequence.priority = LOAD_PRIORITY.background;
  sequence.nextFrame = 0;
  sequence.loadedFrames = 0;
  sequence.failedFrames = [];
  sequence.loadPromise = null;
  sequence.resolveLoad = null;
  sequence.error = null;
  sequence.requestedAt = 0;
  sequence.readyAt = 0;
  sequence.reason = null;
  sequence.backgroundScheduled = false;
  runtime.characterDrawKey[side] = '';
  sideElements[side].classList.remove('sequence-ready');
  canvases[side].width = 1;
  canvases[side].height = 1;
  return true;
}

function releaseUnusedDecodedSequences(keepSide = null) {
  if (
    !RESOURCE_POLICY.constrained
    && !coarseQuery.matches
    && !runtime.geometry?.coarseInteraction
  ) return false;
  let released = false;
  for (const side of ['blue', 'orange']) {
    if (side === keepSide || runtime.pendingSide === side) continue;
    released = releaseDecodedSequence(side) || released;
  }
  if (released) updateUi();
  return released;
}

function finalizeSequenceLoad(side) {
  const sequence = sequences[side];
  if (sequence.status !== 'loading' || sequence.activeWorkers > 0) return;

  if (sequence.loadedFrames >= MIN_USABLE_FRAMES) {
    sequence.status = 'ready';
    sequence.readyAt = performance.now();
    const canvas = canvases[side];
    if (!sequence.context) {
      canvas.width = sequence.frames[0].width;
      canvas.height = sequence.frames[0].height;
      sequence.context = canvas.getContext('2d', { alpha: true, desynchronized: true });
    }
    if (runtime.caughtSide === side && !sequence.frames[FRAME_COUNT - 1]) {
      sequence.active = false;
      sideElements[side].classList.remove('sequence-ready');
      setPoseSide(side);
    } else if (runtime.caughtSide === side && !(runtime.poseSide === side && !sequence.active)) {
      sequence.active = true;
      activateSequence(side, 1);
    } else if (sequence.active) {
      activateSequence(side, runtime.characterProgress[side]);
    }
  } else {
    sequence.status = 'failed';
    sequence.readyAt = performance.now();
    releaseSequenceFrames(sequence);
    sequence.active = false;
    sideElements[side].classList.remove('sequence-ready');
    if (
      runtime.candidate === side
      && runtime.phase === 'caught'
    ) {
      setPoseSide(side);
    }
  }

  const completedStatus = sequence.status;
  sequence.resolveLoad?.(completedStatus);
  sequence.resolveLoad = null;
  updateUi();
  if (
    completedStatus === 'ready'
    && runtime.pendingSide !== side
    && (
      runtime.phase === 'idle'
      || (runtime.phase === 'caught' && runtime.caughtSide !== side)
    )
  ) {
    releaseUnusedDecodedSequences(runtime.caughtSide);
  }
}

async function runSequenceWorker(side) {
  const sequence = sequences[side];
  sequence.activeWorkers += 1;
  try {
    while (true) {
      const index = sequence.nextFrame;
      if (index >= FRAME_COUNT) break;
      sequence.nextFrame += 1;
      try {
        sequence.frames[index] = await loadImage(frameSrc(side, index, sequence.mobile), sequence.mobile);
        sequence.loadedFrames += 1;
        if (sequence.active && drawCharacterProgress(side, runtime.characterProgress[side])) {
          sideElements[side].classList.add('sequence-ready');
        }
      } catch (error) {
        sequence.error ||= error;
        sequence.failedFrames.push(index);
        reportSequenceFailure(side, error, index);
      }
    }
  } finally {
    sequence.activeWorkers -= 1;
    if (sequence.nextFrame < FRAME_COUNT) {
      ensureSequenceWorkers(side);
    }
    finalizeSequenceLoad(side);
  }
}

function ensureSequenceWorkers(side) {
  const sequence = sequences[side];
  if (sequence.status !== 'loading') return;
  const desiredWorkers = sequenceWorkerCount(sequence);
  while (sequence.activeWorkers < desiredWorkers && sequence.nextFrame < FRAME_COUNT) {
    // The worker increments synchronously before its first await.
    void runSequenceWorker(side);
  }
}

function loadSequence(side, reason = 'background') {
  const sequence = sequences[side];
  if (reducedQuery.matches) return Promise.resolve('reduced');

  const priority = LOAD_PRIORITY[reason] ?? LOAD_PRIORITY.background;
  sequence.priority = Math.max(sequence.priority, priority);
  if (!sequence.reason || priority >= LOAD_PRIORITY[sequence.reason]) sequence.reason = reason;

  if (sequence.status === 'ready' || sequence.status === 'failed') {
    return Promise.resolve(sequence.status);
  }
  if (sequence.status === 'loading') {
    ensureSequenceWorkers(side);
    return sequence.loadPromise;
  }

  const viewport = hero.getBoundingClientRect();
  sequence.mobile = viewport.width <= 768 || (viewport.width <= 900 && viewport.height <= 500);
  sequence.status = 'loading';
  sequence.frames = Array(FRAME_COUNT);
  sequence.nextFrame = 0;
  sequence.loadedFrames = 0;
  sequence.failedFrames = [];
  sequence.error = null;
  sequence.requestedAt = performance.now();
  sequence.readyAt = 0;
  const canvas = canvases[side];
  const size = FRAME_DECODE_SIZE[sequence.mobile ? 'mobile' : 'desktop'];
  canvas.width = size.width;
  canvas.height = size.height;
  sequence.context = canvas.getContext('2d', { alpha: true, desynchronized: true });
  sequence.loadPromise = new Promise((resolve) => {
    sequence.resolveLoad = resolve;
  });
  updateUi();
  ensureSequenceWorkers(side);
  return sequence.loadPromise;
}

function scheduleComplementaryPreload(selectedSide) {
  if (
    reducedQuery.matches
    || RESOURCE_POLICY.constrained
    || coarseQuery.matches
    || runtime.geometry?.coarseInteraction
  ) return;
  const otherSide = selectedSide === 'blue' ? 'orange' : 'blue';
  const sequence = sequences[otherSide];
  if (sequence.status !== 'idle' || sequence.backgroundScheduled) return;
  sequence.backgroundScheduled = true;
  const start = () => {
    sequence.backgroundScheduled = false;
    if (sequence.status === 'idle') void loadSequence(otherSide, 'background');
  };
  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(start, { timeout: 1400 });
  } else {
    window.setTimeout(start, 420);
  }
}

function warmSequencePair(reason = 'hint') {
  if (reducedQuery.matches || RESOURCE_POLICY.constrained || coarseQuery.matches) return;
  for (const side of ['blue', 'orange']) void loadSequence(side, reason);
}

function scheduleInitialSequenceWarmup() {
  if (reducedQuery.matches || RESOURCE_POLICY.constrained || coarseQuery.matches) return;
  const start = () => warmSequencePair('background');
  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(start, { timeout: 600 });
  } else {
    window.setTimeout(start, 100);
  }
}

function targetFromFrame(side, heroRect) {
  const sideElement = sideElements[side];
  const frame = finalFrames[side];
  const palm = PALM[side];
  if (!sideElement || !frame || !frame.offsetWidth || !frame.offsetHeight) {
    return side === 'blue'
      ? { x: heroRect.width * 0.34, y: heroRect.height * 0.43 }
      : { x: heroRect.width * 0.66, y: heroRect.height * 0.39 };
  }
  const sideRect = sideElement.getBoundingClientRect();
  const frameRect = frame.getBoundingClientRect();
  const naturalWidth = frame.naturalWidth || 768;
  const naturalHeight = frame.naturalHeight || 1080;
  const scale = Math.min(frameRect.width / naturalWidth, frameRect.height / naturalHeight);
  const renderedWidth = naturalWidth * scale;
  const renderedHeight = naturalHeight * scale;
  const renderedLeft = frameRect.left + (frameRect.width - renderedWidth) / 2;
  const renderedTop = frameRect.top + (frameRect.height - renderedHeight) / 2;
  return {
    x: renderedLeft - heroRect.left + renderedWidth * palm.x,
    y: renderedTop - heroRect.top + renderedHeight * palm.y,
    sideX: sideRect.left - heroRect.left,
  };
}

function measure() {
  const rect = hero.getBoundingClientRect();
  const mobile = rect.width <= 768;
  const phoneLandscape = rect.width <= 900 && rect.height <= 500;
  const coarseInteraction = mobile || phoneLandscape || coarseQuery.matches;
  const center = { x: rect.width * 0.5, y: rect.height * (mobile ? 0.415 : 0.405) };
  const geometry = {
    rect,
    mobile,
    coarseInteraction,
    center,
    blue: targetFromFrame('blue', rect),
    orange: targetFromFrame('orange', rect),
    gestureSpan: coarseInteraction ? clamp(rect.width * 0.2, 72, 96) : Math.max(rect.width * 0.28, 118),
  };
  runtime.geometry = geometry;
  return geometry;
}

function isTabPrimaryMode() {
  return Boolean(coarseQuery.matches || runtime.geometry?.coarseInteraction);
}

function autoDeliveryLocked() {
  return Boolean(runtime.pendingSide)
    || !['idle', 'caught'].includes(runtime.phase);
}

function resolvedCatchThreshold(geometry = runtime.geometry || measure()) {
  return geometry.coarseInteraction ? COARSE_CATCH_THRESHOLD : DESKTOP_CATCH_THRESHOLD;
}

function releasePointerCapture() {
  const pointerId = runtime.pointerId;
  runtime.pointerId = null;
  runtime.pointerType = null;
  if (pointerId !== null && handle.hasPointerCapture?.(pointerId)) {
    handle.releasePointerCapture(pointerId);
  }
}

function clearTimers() {
  runtime.timers.forEach((timer) => window.clearTimeout(timer));
  runtime.timers.clear();
  if (runtime.pressTimer) {
    window.clearTimeout(runtime.pressTimer);
    runtime.pressTimer = 0;
  }
}

function schedule(callback, delay, token = runtime.token) {
  const timer = window.setTimeout(() => {
    runtime.timers.delete(timer);
    if (token === runtime.token) callback();
  }, delay);
  runtime.timers.add(timer);
  return timer;
}

function stopMotion(releasePointer = false) {
  runtime.token += 1;
  runtime.pendingSide = null;
  runtime.pendingKind = null;
  clearTimers();
  if (runtime.frame) cancelAnimationFrame(runtime.frame);
  if (runtime.tweenFrame) cancelAnimationFrame(runtime.tweenFrame);
  runtime.frame = 0;
  runtime.tweenFrame = 0;
  runtime.motionTarget = null;
  runtime.velocity = { x: 0, y: 0 };
  runtime.lastFrameAt = 0;
  runtime.holdReady = false;
  if (releasePointer) releasePointerCapture();
  return runtime.token;
}

function animatePosition(to, duration, options = {}) {
  if (runtime.tweenFrame) cancelAnimationFrame(runtime.tweenFrame);
  const token = runtime.token;
  const from = { ...runtime.current };
  const arc = reducedQuery.matches ? 0 : options.arc ?? Math.min(28, Math.abs(to.x - from.x) * 0.12);
  const resolvedDuration = reducedQuery.matches ? 1 : duration;
  const startedAt = performance.now();

  const frame = (now) => {
    if (token !== runtime.token) return;
    const raw = clamp((now - startedAt) / Math.max(resolvedDuration, 1), 0, 1);
    const progress = easeOutCubic(raw);
    const point = {
      x: lerp(from.x, to.x, progress),
      y: lerp(from.y, to.y, progress) - Math.sin(Math.PI * progress) * arc,
    };
    setLight(point, lerp(from.scale, options.scale ?? 1, progress));
    options.onUpdate?.(progress, raw);
    if (raw < 1) {
      runtime.tweenFrame = requestAnimationFrame(frame);
    } else {
      runtime.tweenFrame = 0;
      options.onDone?.();
    }
  };
  runtime.tweenFrame = requestAnimationFrame(frame);
}

function animateMagnetPosition(to, duration, options = {}) {
  if (runtime.frame) cancelAnimationFrame(runtime.frame);
  if (runtime.tweenFrame) cancelAnimationFrame(runtime.tweenFrame);
  runtime.frame = 0;
  const token = runtime.token;
  const from = { ...runtime.current };
  const resolvedDuration = reducedQuery.matches ? 1 : duration;
  const durationSeconds = Math.max(resolvedDuration / 1000, 0.001);
  const delta = { x: to.x - from.x, y: to.y - from.y };
  const distance = Math.max(Math.hypot(delta.x, delta.y), 0.001);
  const direction = { x: delta.x / distance, y: delta.y / distance };
  const normal = { x: -direction.y, y: direction.x };
  const baseSpeed = distance / durationSeconds;
  const incoming = runtime.velocity;
  const alongSpeed = clamp(incoming.x * direction.x + incoming.y * direction.y, 0, baseSpeed * 1.75);
  const lateralSpeed = clamp(incoming.x * normal.x + incoming.y * normal.y, -baseSpeed * 0.3, baseSpeed * 0.3);
  const initialVelocity = {
    x: direction.x * alongSpeed + normal.x * lateralSpeed,
    y: direction.y * alongSpeed + normal.y * lateralSpeed,
  };
  const arc = reducedQuery.matches ? 0 : Math.min(options.arc ?? 7, distance * 0.2);
  const startedAt = performance.now();
  let previousPoint = from;
  let previousTime = startedAt;

  const frame = (now) => {
    if (token !== runtime.token) return;
    const raw = clamp((now - startedAt) / Math.max(resolvedDuration, 1), 0, 1);
    const raw2 = raw * raw;
    const raw3 = raw2 * raw;
    const startWeight = 2 * raw3 - 3 * raw2 + 1;
    const velocityWeight = raw3 - 2 * raw2 + raw;
    const endWeight = -2 * raw3 + 3 * raw2;
    const lift = arc * arcEnvelope(raw);
    const point = {
      x: startWeight * from.x + velocityWeight * durationSeconds * initialVelocity.x + endWeight * to.x,
      y: startWeight * from.y + velocityWeight * durationSeconds * initialVelocity.y + endWeight * to.y - lift,
    };
    const progress = smoothStep(raw);
    const elapsed = Math.max((now - previousTime) / 1000, 1 / 240);
    runtime.velocity = { x: (point.x - previousPoint.x) / elapsed, y: (point.y - previousPoint.y) / elapsed };
    previousPoint = point;
    previousTime = now;
    setLight(point, lerp(from.scale, options.scale ?? 1, progress));
    options.onUpdate?.(progress, raw);
    if (raw < 1) {
      runtime.tweenFrame = requestAnimationFrame(frame);
    } else {
      runtime.tweenFrame = 0;
      runtime.velocity = { x: 0, y: 0 };
      setLight(to, options.scale ?? 1);
      options.onDone?.();
    }
  };
  runtime.tweenFrame = requestAnimationFrame(frame);
}

function resetVisualState() {
  setCandidate(null);
  setCaughtSide(null);
  setPoseSide(null);
  setBlooming(false);
  setSwapMaskedSide(null);
}

function returnToCenter(message = '松开了，光回到中间。再试一次。') {
  const fromReach = { ...runtime.characterProgress };
  stopMotion(true);
  const token = runtime.token;
  const geometry = measure();
  for (const side of ['blue', 'orange']) {
    if (fromReach[side] > 0) activateSequence(side, fromReach[side]);
  }
  resetVisualState();
  setEnergy(0, 0);
  setPhase('returning');
  setStatus(message);
  animatePosition(geometry.center, 300, {
    scale: 1,
    arc: 16,
    onUpdate: (_progress, raw) => {
      drawCharacterProgress('blue', lerp(fromReach.blue, 0, raw));
      drawCharacterProgress('orange', lerp(fromReach.orange, 0, raw));
    },
    onDone: () => {
      drawCharacterProgress('blue', 0);
      drawCharacterProgress('orange', 0);
      schedule(() => {
        setPhase('idle');
        setStatus('光停在舞台中央，等你亲手把它交出去。');
        releaseUnusedDecodedSequences();
      }, 620, token);
    },
  });
}

function yieldToPageScroll() {
  const geometry = runtime.geometry || measure();
  stopMotion(true);
  resetVisualState();
  drawCharacterProgress('blue', 0);
  drawCharacterProgress('orange', 0);
  setEnergy(0, 0);
  runtime.visualProgress = 0;
  runtime.motionTarget = null;
  setLight(geometry.center, 1);
  setPhase('idle');
  setStatus('光停在舞台中央，等你亲手把它交出去。');
  releaseUnusedDecodedSequences();
}

function finishCatch(side) {
  const geometry = runtime.geometry || measure();
  const target = geometry[side];
  setCandidate(side);
  setBloomPosition(target);
  if (sequences[side].status !== 'ready' || !sequences[side].frames[FRAME_COUNT - 1]) {
    sequences[side].active = false;
    sideElements[side].classList.remove('sequence-ready');
    setPoseSide(side);
  } else {
    activateSequence(side, 1);
  }
  drawCharacterProgress(side, 1);
  setLight(target, 1.08);
  setEnergy(side === 'blue' ? 1 : 0, side === 'orange' ? 1 : 0);
  setBlooming(false);
  setSwapMaskedSide(null);
  runtime.seenSides[side] = true;
  setCaughtSide(side);
  setPhase('caught');
  setStatus(SIDE_COPY[side].status);
  releaseUnusedDecodedSequences(side);
  scheduleComplementaryPreload(side);
}

function playCatchSettle(side) {
  const geometry = runtime.geometry || measure();
  const target = geometry[side];
  if (reducedQuery.matches) {
    finishCatch(side);
    return;
  }

  if (runtime.tweenFrame) cancelAnimationFrame(runtime.tweenFrame);
  const token = runtime.token;
  const startedAt = performance.now();
  const fromProgress = Math.max(runtime.characterProgress[side], CATCH_SETTLE_START);
  setCandidate(side);
  setBloomPosition(target);
  setBlooming(true);
  setPhase('catching');
  setStatus('光已落进掌心，孩子正在稳稳接住它……');
  if (!sequences[side].active && sequences[side].status === 'failed') setPoseSide(side);

  const frame = (now) => {
    if (token !== runtime.token) return;
    const raw = clamp((now - startedAt) / CATCH_SETTLE_DURATION, 0, 1);
    const progress = smoothStep(raw);
    const settleLift = Math.pow(Math.sin(Math.PI * progress), 2);
    drawCharacterProgress(side, lerp(fromProgress, 1, raw));
    setLight(
      { x: target.x, y: target.y - settleLift * 2.2 },
      1.08 + settleLift * 0.018,
    );
    const energy = lerp(0.9, 1, progress);
    setEnergy(side === 'blue' ? energy : 0, side === 'orange' ? energy : 0);
    if (raw < 1) {
      runtime.tweenFrame = requestAnimationFrame(frame);
    } else {
      runtime.tweenFrame = 0;
      finishCatch(side);
    }
  };
  runtime.tweenFrame = requestAnimationFrame(frame);
}

function runMagnetize(side, duration = MAGNET_DURATION, startFromNeutral = false) {
  const geometry = runtime.geometry || measure();
  setPhase('magnetizing');
  releasePointerCapture();
  setStatus(sequences[side].status === 'failed'
    ? '动作素材没有完整加载，先用简化效果把光送过去。'
    : '对了，就是这里——松手也不会掉。');
  if (reducedQuery.matches) {
    finishCatch(side);
    return;
  }

  if (sequences[side].status === 'ready') activateSequence(side, startFromNeutral ? 0 : runtime.characterProgress[side]);
  const reachStart = startFromNeutral ? 0 : runtime.characterProgress[side];
  const startingEnergy = Math.max(Math.abs(runtime.visualProgress), 0.68);
  animateMagnetPosition(geometry[side], duration, {
    scale: 1.08,
    arc: 0,
    onUpdate: (progress, raw) => {
      drawCharacterProgress(side, lerp(reachStart, CATCH_SETTLE_START, raw));
      const energy = lerp(startingEnergy, 0.9, progress);
      setEnergy(side === 'blue' ? energy : 0, side === 'orange' ? energy : 0);
    },
    onDone: () => {
      drawCharacterProgress(side, CATCH_SETTLE_START);
      playCatchSettle(side);
    },
  });
}

function magnetize(side) {
  if (runtime.phase !== 'dragging') return;
  if (reducedQuery.matches || sequences[side].status === 'failed') {
    runMagnetize(side);
    return;
  }
  if (sequences[side].status === 'idle') void loadSequence(side, 'interaction');
  activateSequence(side, runtime.characterProgress[side]);
  // Commit immediately from the current drag position. Decoded frames keep
  // filling the canvas in place; the gesture never pauses or restarts at frame 0.
  runMagnetize(side, MAGNET_DURATION, false);
}

function startDragFollower() {
  if (runtime.frame) cancelAnimationFrame(runtime.frame);
  const token = runtime.token;
  runtime.lastFrameAt = performance.now();

  const frame = (now) => {
    if (token !== runtime.token || runtime.phase !== 'dragging') {
      runtime.frame = 0;
      return;
    }
    const target = runtime.motionTarget || {
      ...runtime.current,
      progress: runtime.visualProgress,
      side: runtime.candidate,
    };
    const elapsed = Math.max((now - runtime.lastFrameAt) / 1000, 1 / 240);
    const deltaTime = Math.min(elapsed, 1 / 30);
    runtime.lastFrameAt = now;
    const followTime = (
      runtime.geometry?.coarseInteraction ? FOLLOW_TIME_COARSE_MS : FOLLOW_TIME_DESKTOP_MS
    ) / 1000;
    const follow = reducedQuery.matches ? 1 : 1 - Math.exp(-deltaTime / followTime);
    const previous = runtime.current;
    const next = {
      x: lerp(previous.x, target.x, follow),
      y: lerp(previous.y, target.y, follow),
      scale: lerp(previous.scale, target.scale, follow),
    };
    runtime.velocity = { x: (next.x - previous.x) / deltaTime, y: (next.y - previous.y) / deltaTime };
    runtime.visualProgress = lerp(runtime.visualProgress, target.progress ?? 0, follow);
    setLight(next, next.scale);
    setEnergy(clamp(-runtime.visualProgress, 0, 1), clamp(runtime.visualProgress, 0, 1));

    const catchThreshold = resolvedCatchThreshold();
    const blueReach = clamp(
      (-runtime.visualProgress - REACTION_START) / (catchThreshold - REACTION_START),
      0,
      1,
    ) * DRAG_REACH_SHARE;
    const orangeReach = clamp(
      (runtime.visualProgress - REACTION_START) / (catchThreshold - REACTION_START),
      0,
      1,
    ) * DRAG_REACH_SHARE;
    drawCharacterProgress('blue', blueReach);
    drawCharacterProgress('orange', orangeReach);

    const settled = Math.hypot(target.x - next.x, target.y - next.y) < 0.08
      && Math.hypot(runtime.velocity.x, runtime.velocity.y) < 1
      && Math.abs((target.progress ?? 0) - runtime.visualProgress) < 0.001;
    if (settled) {
      runtime.frame = 0;
      return;
    }
    runtime.frame = requestAnimationFrame(frame);
  };
  runtime.frame = requestAnimationFrame(frame);
}

function updateFromPointer(clientX) {
  if (runtime.phase !== 'dragging') return;
  const geometry = runtime.geometry || measure();
  const deltaX = clientX - runtime.startClientX;
  const side = deltaX < 0 ? 'blue' : 'orange';
  const rawProgress = clamp(Math.abs(deltaX) / geometry.gestureSpan, 0, 1);
  const target = geometry[side];
  const catchThreshold = resolvedCatchThreshold(geometry);
  const routeLift = reducedQuery.matches ? 0 : (geometry.coarseInteraction ? 9 : 12) * arcEnvelope(rawProgress);
  runtime.motionTarget = {
    x: lerp(geometry.center.x, target.x, rawProgress),
    y: lerp(geometry.center.y, target.y, rawProgress) - routeLift,
    scale: lerp(1, 1.05, rawProgress),
    progress: side === 'blue' ? -rawProgress : rawProgress,
    side: rawProgress > 0.05 ? side : null,
  };
  if (rawProgress <= 0.05 && runtime.candidate !== null) {
    setCandidate(null);
    setStatus('保持按住，选一个方向。');
  } else if (rawProgress > 0.05 && runtime.candidate !== side) {
    setCandidate(side);
    setStatus(side === 'blue' ? '继续向左，男孩会伸手来接。' : '继续向右，女孩会伸手来接。');
    if (!reducedQuery.matches) {
      void loadSequence(side, 'interaction');
      activateSequence(side, runtime.characterProgress[side]);
    }
  }
  if (rawProgress >= catchThreshold) {
    magnetize(side);
  } else if (!runtime.frame) {
    startDragFollower();
  }
}

function startDragging() {
  if (runtime.pointerId === null) return;
  runtime.pressTimer = 0;
  runtime.geometry = measure();
  runtime.motionTarget = { ...runtime.current, progress: 0, side: null };
  runtime.velocity = { x: 0, y: 0 };
  runtime.visualProgress = 0;
  setPhase('dragging');
  setStatus('向左或右滑动。方向明确后，松手也会自动送过去。');
  startDragFollower();
}

function handlePointerDown(event) {
  if (event.button !== undefined && event.button !== 0) return;
  runtime.geometry = measure();
  if (event.pointerType !== 'mouse' || isTabPrimaryMode() || autoDeliveryLocked()) return;
  if (event.pointerType === 'mouse') event.preventDefault();
  warmSequencePair('hint');
  if (runtime.phase === 'caught') {
    returnToCenter('光回到中间了。现在可以换一个方向。');
    return;
  }

  stopMotion(true);
  runtime.pointerId = event.pointerId;
  runtime.pointerType = event.pointerType;
  runtime.startClientX = event.clientX;
  runtime.startClientY = event.clientY;
  runtime.latestClientX = event.clientX;
  runtime.holdReady = false;
  runtime.visualProgress = 0;
  // A sequence that completed in the background is revealed only at frame 0,
  // before this new gesture starts, never halfway through an existing reach.
  for (const side of ['blue', 'orange']) {
    if (sequences[side].status === 'ready') activateSequence(side, 0);
  }
  drawCharacterProgress('blue', 0);
  drawCharacterProgress('orange', 0);
  resetVisualState();
  setEnergy(0, 0);
  try {
    handle.setPointerCapture?.(event.pointerId);
  } catch {
    // Window-level listeners keep the gesture safe in WebViews without capture.
  }

  if (event.pointerType === 'touch' || event.pointerType === 'pen') {
    setPhase('pressing');
    setStatus('继续按住，光圈蓄满后向左或右滑。');
    const token = runtime.token;
    runtime.pressTimer = window.setTimeout(() => {
      if (token === runtime.token && runtime.pointerId !== null && runtime.phase === 'pressing') {
        runtime.pressTimer = 0;
        runtime.holdReady = true;
        setStatus('光圈已蓄满。现在向左或右滑。');
        updateUi();
      }
    }, HOLD_DELAY);
  } else {
    startDragging();
  }
}

function handlePointerMove(event) {
  if (event.pointerId !== runtime.pointerId) return;
  runtime.latestClientX = event.clientX;
  if (runtime.phase === 'pressing') {
    const deltaX = event.clientX - runtime.startClientX;
    const deltaY = event.clientY - runtime.startClientY;
    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);
    if (absY >= AXIS_LOCK_SLOP && absY > absX * AXIS_DOMINANCE) {
      yieldToPageScroll();
      return;
    }
    if (runtime.holdReady && absX >= AXIS_LOCK_SLOP && absX > absY * AXIS_DOMINANCE) {
      startDragging();
      updateFromPointer(event.clientX);
      return;
    }
    if (!runtime.holdReady && Math.hypot(deltaX, deltaY) > TOUCH_SLOP) {
      returnToCenter('先长按住光点，等光圈蓄满后再左右滑。');
    }
    return;
  }
  if (runtime.phase === 'dragging') updateFromPointer(event.clientX);
}

function handlePointerEnd(event) {
  if (event.pointerId !== runtime.pointerId) return;
  if (runtime.phase === 'pressing') {
    returnToCenter(runtime.holdReady
      ? '光圈已蓄满，下次向左或右滑。'
      : '按得再久一点，等光圈蓄满后再滑。');
  } else if (runtime.phase === 'dragging') {
    updateFromPointer(event.clientX);
    if (runtime.phase === 'dragging') {
      const geometry = runtime.geometry || measure();
      const deltaX = event.clientX - runtime.startClientX;
      if (geometry.coarseInteraction && Math.abs(deltaX) >= COARSE_RELEASE_COMMIT_PX) {
        magnetize(deltaX < 0 ? 'blue' : 'orange');
      } else {
        returnToCenter('还没有选定方向，光回到中间了。再试一次。');
      }
    }
  } else {
    releasePointerCapture();
  }
}

function handlePointerCancel(event) {
  if (event.pointerId !== runtime.pointerId) return;
  if (runtime.pointerType === 'touch' || runtime.pointerType === 'pen') {
    yieldToPageScroll();
    return;
  }
  returnToCenter('手势被系统中断，光已回到中间。');
}

function handleLostPointerCapture(event) {
  if (
    event.pointerId === runtime.pointerId
    && (runtime.phase === 'pressing' || runtime.phase === 'dragging')
  ) {
    if (runtime.pointerType === 'touch' || runtime.pointerType === 'pen') {
      yieldToPageScroll();
    } else {
      returnToCenter('手势被系统中断，光已回到中间。');
    }
  }
}

function beginAutoDeliver(side) {
  stopMotion(true);
  runtime.geometry = measure();
  runtime.velocity = { x: 0, y: 0 };
  runtime.visualProgress = 0;
  drawCharacterProgress('blue', 0);
  drawCharacterProgress('orange', 0);
  resetVisualState();
  activateSequence(side, 0);
  setCandidate(side);
  setPhase('magnetizing');
  setStatus(sequences[side].status === 'failed'
    ? `动作素材没有完整加载，先用简化效果进入${SIDE_COPY[side].route}。`
    : `正在把光交给${SIDE_COPY[side].route}。`);
  if (reducedQuery.matches) {
    finishCatch(side);
    return;
  }
  animateMagnetPosition(runtime.geometry[side], AUTO_DURATION - CATCH_SETTLE_DURATION, {
    scale: 1.08,
    arc: 18,
    onUpdate: (progress, raw) => {
      const reach = lerp(0, CATCH_SETTLE_START, raw);
      drawCharacterProgress(side, reach);
      const energy = lerp(0, 0.9, progress);
      setEnergy(side === 'blue' ? energy : 0, side === 'orange' ? energy : 0);
    },
    onDone: () => {
      drawCharacterProgress(side, CATCH_SETTLE_START);
      playCatchSettle(side);
    },
  });
}

function autoDeliver(side) {
  if (!Object.prototype.hasOwnProperty.call(SIDE_COPY, side) || autoDeliveryLocked()) return;
  if (!reducedQuery.matches && sequences[side].status === 'idle') {
    void loadSequence(side, 'interaction');
  }
  if (runtime.phase === 'idle') {
    beginAutoDeliver(side);
    return;
  }

  const fromReach = { ...runtime.characterProgress };
  stopMotion(true);
  const geometry = measure();
  for (const currentSide of ['blue', 'orange']) {
    if (fromReach[currentSide] > 0) activateSequence(currentSide, fromReach[currentSide]);
  }
  resetVisualState();
  setEnergy(0, 0);
  setPhase('returning');
  setStatus('光先回到中间，再完整走向你选的方向。');
  animatePosition(geometry.center, 220, {
    scale: 1,
    arc: 10,
    onUpdate: (_progress, raw) => {
      drawCharacterProgress('blue', lerp(fromReach.blue, 0, raw));
      drawCharacterProgress('orange', lerp(fromReach.orange, 0, raw));
    },
    onDone: () => {
      drawCharacterProgress('blue', 0);
      drawCharacterProgress('orange', 0);
      beginAutoDeliver(side);
    },
  });
}

function syncGeometry() {
  const geometry = measure();
  const previous = runtime.lastHeroSize;
  const orientation = geometry.rect.width > geometry.rect.height ? 'landscape' : 'portrait';
  const structuralResize = previous && (
    Math.abs(previous.width - geometry.rect.width) > 4
    || previous.orientation !== orientation
  );
  runtime.lastHeroSize = { width: geometry.rect.width, height: geometry.rect.height, orientation };
  if (structuralResize && runtime.phase !== 'idle' && runtime.phase !== 'caught') {
    stopMotion(true);
    resetVisualState();
    drawCharacterProgress('blue', 0);
    drawCharacterProgress('orange', 0);
    setEnergy(0, 0);
    setPhase('idle');
    setStatus('屏幕方向已调整，光回到中间了。');
    setLight(geometry.center, 1);
    releaseUnusedDecodedSequences();
    return;
  }
  if (runtime.phase === 'idle') setLight(geometry.center, 1);
  if (runtime.phase === 'caught' && runtime.caughtSide) {
    setLight(geometry[runtime.caughtSide], 1.08);
    setBloomPosition(geometry[runtime.caughtSide]);
  }
}

handle.addEventListener('pointerdown', handlePointerDown);
handle.addEventListener('pointerenter', () => warmSequencePair('hint'), { once: true });
handle.addEventListener('focus', () => warmSequencePair('hint'), { once: true });
window.addEventListener('pointermove', handlePointerMove);
window.addEventListener('pointerup', handlePointerEnd);
window.addEventListener('pointercancel', handlePointerCancel);
handle.addEventListener('lostpointercapture', handleLostPointerCapture);
handle.addEventListener('keydown', (event) => {
  if (isTabPrimaryMode()) return;
  if (event.key === 'ArrowLeft') {
    event.preventDefault();
    autoDeliver('blue');
  } else if (event.key === 'ArrowRight') {
    event.preventDefault();
    autoDeliver('orange');
  }
});
window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && (runtime.phase !== 'idle' || runtime.pendingSide)) {
    event.preventDefault();
    returnToCenter('光回到中间了。现在可以换一个方向。');
  }
});

document.querySelectorAll('[data-auto-side]').forEach((button) => {
  button.addEventListener('click', () => autoDeliver(button.dataset.autoSide));
  const hint = () => {
    if (!reducedQuery.matches) void loadSequence(button.dataset.autoSide, 'hint');
  };
  button.addEventListener('pointerenter', hint, { once: true });
  button.addEventListener('pointerdown', hint, { once: true });
  button.addEventListener('focus', hint, { once: true });
});
resultCta.addEventListener('click', (event) => {
  compareHint.classList.remove('is-visible');
  if (reducedQuery.matches) return;
  event.preventDefault();
  const href = resultCta.getAttribute('href');
  const wipe = document.getElementById(runtime.caughtSide === 'blue' ? 'wipeBlue' : 'wipeOrange');
  if (!wipe) {
    window.location.href = href;
    return;
  }
  wipe.classList.add('go');
  window.setTimeout(() => {
    window.location.href = href;
  }, 480);
});

const resizeObserver = new ResizeObserver(syncGeometry);
resizeObserver.observe(hero);
window.addEventListener('resize', syncGeometry);
finalFrames.blue.addEventListener('load', syncGeometry);
finalFrames.orange.addEventListener('load', syncGeometry);
coarseQuery.addEventListener?.('change', () => {
  syncGeometry();
  updateUi();
});
reducedQuery.addEventListener?.('change', () => {
  updateUi();
});

if ('PerformanceObserver' in window) {
  try {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) runtime.longTasks.push(entry.duration);
    });
    observer.observe({ type: 'longtask', buffered: true });
  } catch {
    // Long-task timing is diagnostic only.
  }
}

window.__heroMotion = {
  assetSetId: 'hero-reach-30f-20260823-r3',
  autoDeliver,
  preloadSide: (side) => (
    Object.prototype.hasOwnProperty.call(sequences, side)
      ? loadSequence(side, 'hint')
      : Promise.reject(new Error(`Unknown hero side: ${side}`))
  ),
  reset: returnToCenter,
  getState: () => ({
    phase: runtime.phase,
    candidate: runtime.candidate,
    caughtSide: runtime.caughtSide,
    current: { ...runtime.current },
    visualProgress: runtime.visualProgress,
    characterProgress: { ...runtime.characterProgress },
    characterDrawKey: { ...runtime.characterDrawKey },
    pointerActive: runtime.pointerId !== null,
    sequenceStatus: { blue: sequences.blue.status, orange: sequences.orange.status },
    sequenceLoads: Object.fromEntries(['blue', 'orange'].map((side) => {
      const sequence = sequences[side];
      return [side, {
        status: sequence.status,
        active: sequence.active,
        reason: sequence.reason,
        loadedFrames: sequence.loadedFrames,
        failedFrames: [...sequence.failedFrames],
        durationMs: sequence.readyAt && sequence.requestedAt
          ? Math.round(sequence.readyAt - sequence.requestedAt)
          : null,
      }];
    })),
    pendingSide: runtime.pendingSide,
    sequenceErrors: [...runtime.sequenceErrors],
    drawCount: runtime.drawCount,
    longTasks: [...runtime.longTasks],
    resourcePolicy: { ...RESOURCE_POLICY },
    tuning: {
      reactionStart: REACTION_START,
      followDesktopMs: FOLLOW_TIME_DESKTOP_MS,
      followCoarseMs: FOLLOW_TIME_COARSE_MS,
      gestureCatchMs: MAGNET_DURATION + CATCH_SETTLE_DURATION,
    },
    geometry: runtime.geometry,
  }),
};

syncGeometry();
updateUi();
scheduleInitialSequenceWarmup();
hero.dataset.motionVersion = 'v4-single-take30-responsive-input-r12';
window.__HERO_MOTION_V4_ACTIVE__ = true;

} catch (error) {
  window.__HERO_MOTION_V4_ERROR__ = {
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : '',
  };
  console.error('[Hero Motion v4] initialization failed; legacy fallback remains available.', error);
}
})();
