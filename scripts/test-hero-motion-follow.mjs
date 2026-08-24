import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const motionPath = path.join(root, 'hero-motion-v4.js');
const motionCssPath = path.join(root, 'hero-motion-v4.css');
const indexPath = path.join(root, 'index.html');
const buildPath = path.join(root, 'scripts', 'build-public.cjs');
const source = fs.readFileSync(motionPath, 'utf8');
const cssSource = fs.readFileSync(motionCssPath, 'utf8');
const indexSource = fs.readFileSync(indexPath, 'utf8');
const buildSource = fs.readFileSync(buildPath, 'utf8');

function numberConstant(name) {
  const match = source.match(new RegExp(`const\\s+${name}\\s*=\\s*([0-9.]+)`));
  assert.ok(match, `missing numeric constant ${name}`);
  return Number(match[1]);
}

function between(start, end) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.ok(startIndex >= 0, `missing section start: ${start}`);
  assert.ok(endIndex > startIndex, `missing section end: ${end}`);
  return source.slice(startIndex, endIndex);
}

const reactionStart = numberConstant('REACTION_START');
const fineFollowMs = numberConstant('FOLLOW_TIME_DESKTOP_MS');
const coarseFollowMs = numberConstant('FOLLOW_TIME_COARSE_MS');
const magnetMs = numberConstant('MAGNET_DURATION');
const settleMs = numberConstant('CATCH_SETTLE_DURATION');
const minimumUsableFrames = numberConstant('MIN_USABLE_FRAMES');
const playablePrefixFrames = numberConstant('PLAYABLE_PREFIX_FRAMES');
const autoStartMaxWaitMs = numberConstant('AUTO_START_MAX_WAIT_MS');
const caughtPlaybackFps = numberConstant('CAUGHT_PLAYBACK_FPS');
const desktopCatchThreshold = numberConstant('DESKTOP_CATCH_THRESHOLD');

assert.ok(reactionStart <= 0.06, `character reaction starts too late: ${reactionStart}`);
assert.ok(fineFollowMs <= 24, `desktop follow is too soft: ${fineFollowMs}ms`);
assert.ok(coarseFollowMs <= 28, `coarse follow is too soft: ${coarseFollowMs}ms`);
assert.ok(
  magnetMs + settleMs >= 220 && magnetMs + settleMs <= 260,
  `gesture catch should finish in 220-260ms, got ${magnetMs + settleMs}ms`,
);
assert.ok(minimumUsableFrames >= 24, 'a badly incomplete sequence must use the static fallback');
assert.ok(
  playablePrefixFrames >= 6 && playablePrefixFrames <= 10,
  `interaction should buffer 6-10 contiguous frames, got ${playablePrefixFrames}`,
);
assert.ok(autoStartMaxWaitMs <= 400, `cold interaction feedback waits too long: ${autoStartMaxWaitMs}ms`);
assert.equal(caughtPlaybackFps, 30, 'caught sequence playback must remain at the 30fps acceptance target');

function followedFraction(timeConstantMs, elapsedMs = 80, fps = 60) {
  const stepMs = 1000 / fps;
  let current = 0;
  for (let elapsed = 0; elapsed < elapsedMs; elapsed += stepMs) {
    const frameMs = Math.min(stepMs, elapsedMs - elapsed);
    const follow = 1 - Math.exp(-frameMs / timeConstantMs);
    current += (1 - current) * follow;
  }
  return current;
}

const fineFractionAt80 = followedFraction(fineFollowMs);
const coarseFractionAt80 = followedFraction(coarseFollowMs);
assert.ok(fineFractionAt80 >= 0.9, `desktop light follows only ${fineFractionAt80} in 80ms`);
assert.ok(coarseFractionAt80 >= 0.9, `coarse light follows only ${coarseFractionAt80} in 80ms`);
const fineVisualAt80 = 0.06 * fineFractionAt80;
const fineReachAt80 = Math.max(
  0,
  (fineVisualAt80 - reactionStart) / (desktopCatchThreshold - reactionStart),
) * 0.8;
const fineFrameAt80 = fineReachAt80 <= 0 ? 0 : Math.max(1, Math.floor(fineReachAt80 * 30));
assert.ok(fineFrameAt80 >= 1, 'a 6% desktop drag must paint an actual reaction frame within 80ms');

const drawing = between('function nearestDecodedFrameIndex', 'async function loadImage');
assert.match(drawing, /\['loading', 'ready'\]\.includes\(sequence\.status\)/);
assert.match(drawing, /for \(let index = desiredIndex - 1; index >= 0; index -= 1\)/);
assert.doesNotMatch(drawing, /desiredIndex \+ 1/);
assert.match(drawing, /const desiredIndex = progress <= 0[\s\S]*Math\.max\(1,/);
assert.match(drawing, /if \(frameIndex < 0 \|\| !sequence\.frames\[frameIndex\]\) \{/);
assert.match(drawing, /if \(desiredIndex === 0\)[\s\S]*classList\.remove\('sequence-ready'\)/);
assert.match(drawing, /sideElements\[side\]\.classList\.add\('sequence-ready'\)/);

const loader = between('function finalizeSequenceLoad', 'function targetFromFrame');
assert.match(loader, /sequence\.failedFrames\.push\(index\)/);
assert.match(loader, /sequence\.loadedFrames >= MIN_USABLE_FRAMES/);
assert.doesNotMatch(loader, /while \(!sequence\.error\)/);
assert.doesNotMatch(loader, /sequence\.status !== 'loading' \|\| sequence\.error/);

const magnetize = between('function magnetize', 'function startDragFollower');
assert.match(magnetize, /runMagnetize\(side, MAGNET_DURATION, false\)/);
assert.doesNotMatch(magnetize, /waitForGestureSequence|releasePointerCapture|\.then\(/);

const autoDelivery = between('function autoDeliver', 'function syncGeometry');
assert.match(autoDelivery, /void loadSequence\(side, 'interaction'\)/);
assert.match(autoDelivery, /runtime\.pendingSide = side/);
assert.match(autoDelivery, /waitForSequencePlayable\(side, token\)/);
assert.match(autoDelivery, /beginAutoDeliver\(side\)/);
assert.doesNotMatch(autoDelivery, /INTERACTION_LOAD_FALLBACK_MS/);

const warmup = between('function warmSequencePair', 'function targetFromFrame');
assert.match(warmup, /RESOURCE_POLICY\.constrained/);
assert.match(warmup, /coarseQuery\.matches/);
assert.match(warmup, /prefetchStarterFrames/);
assert.match(source, /scheduleInitialSequenceWarmup\(\);/);
assert.match(source, /handle\.addEventListener\('pointerenter', \(\) => warmSequencePair\('hint'\)/);

assert.doesNotMatch(source, /LOADED_GESTURE_DURATION|waitForGestureSequence|queueAutoDelivery|INTERACTION_LOAD_FALLBACK_MS/);
assert.match(indexSource, /hero-motion-v4\.js\?v=20260825-responsive-input-r16/);
assert.match(indexSource, /hero-motion-v4\.css\?v=20260825-mobile-dual-input-r16/);
assert.match(indexSource, /长按光点左右滑，或点下面一个方向/);
assert.match(cssSource, /@media[\s\S]*\.light-handle\s*\{[\s\S]*pointer-events:\s*auto;[\s\S]*touch-action:\s*pan-y;/);
assert.match(indexSource, /\.contact-qr \{ max-width: 360px; grid-template-columns: 1fr; justify-items: center;/);
assert.match(indexSource, /hideBoundary = Math\.max\(showBoundary, window\.innerHeight \* 0\.72\)/);
assert.match(indexSource, /dockShown \? heroBottom < hideBoundary : heroBottom <= showBoundary/);
assert.match(indexSource, /todo-shield-56\.webp\?v=20260825-r13/);
assert.match(source, /const suffix = mobile \? '-s' : ''/);
assert.match(source, /mobile:\s*\{\s*width:\s*320,\s*height:\s*450\s*\}/);
assert.match(source, /MOBILE_ASSET_VERSION = '20260825-s320-r16'/);
assert.match(indexSource, /hero-boy-reach-03-s\.webp/);
assert.match(indexSource, /hero-girl-reach-03-s\.webp/);
assert.match(indexSource, /hero-boy-reach-29-s\.webp/);
assert.match(indexSource, /hero-girl-reach-29-s\.webp/);
assert.doesNotMatch(indexSource, /hero-(?:boy|girl)-reach-29-m\.webp/);
assert.match(buildSource, /Expected 180 current hero frames/);
assert.match(buildSource, /\(\?:-\[ms\]\)\?/);

const compactFrameDirectory = path.join(
  root,
  'assets',
  'character-sequences',
  'hero-reach-30f-20260823-r3',
);
const compactFrameFiles = fs.readdirSync(compactFrameDirectory)
  .filter((name) => /hero-(?:boy|girl)-reach-\d{2}-s\.webp/.test(name));
assert.equal(compactFrameFiles.length, 60, 'mobile sequence must contain both complete 30-frame sets');
const compactFrameBytes = compactFrameFiles.reduce(
  (total, name) => total + fs.statSync(path.join(compactFrameDirectory, name)).size,
  0,
);
assert.ok(compactFrameBytes <= 380_000, `mobile sequence payload regressed to ${compactFrameBytes} bytes`);

function createClassList() {
  const values = new Set();
  return {
    add: (...names) => names.forEach((name) => values.add(name)),
    remove: (...names) => names.forEach((name) => values.delete(name)),
    toggle: (name, force) => {
      const next = force === undefined ? !values.has(name) : Boolean(force);
      if (next) values.add(name);
      else values.delete(name);
      return next;
    },
    contains: (name) => values.has(name),
  };
}

function createElement(name, rect = { left: 0, top: 0, width: 100, height: 100 }) {
  let currentRect = { ...rect };
  const attributes = new Map();
  const listeners = new Map();
  let capturedPointer = null;
  const element = {
    name,
    classList: createClassList(),
    dataset: {},
    style: { setProperty(key, value) { this[key] = String(value); } },
    disabled: false,
    textContent: '',
    href: '',
    tabIndex: 0,
    offsetWidth: currentRect.width,
    offsetHeight: currentRect.height,
    naturalWidth: 768,
    naturalHeight: 1080,
    setAttribute(key, value) { attributes.set(key, String(value)); },
    getAttribute(key) { return attributes.get(key) ?? null; },
    removeAttribute(key) { attributes.delete(key); },
    addEventListener(type, listener) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(listener);
    },
    dispatch(type, event = {}) {
      for (const listener of listeners.get(type) || []) listener({ target: element, ...event });
    },
    dispatchEvent(event) { element.dispatch(event.type, event); return true; },
    getBoundingClientRect() {
      return {
        ...currentRect,
        right: currentRect.left + currentRect.width,
        bottom: currentRect.top + currentRect.height,
      };
    },
    setRect(nextRect) {
      currentRect = { ...currentRect, ...nextRect };
      element.offsetWidth = currentRect.width;
      element.offsetHeight = currentRect.height;
    },
    getContext() { return { globalCompositeOperation: 'source-over', drawImage() {} }; },
    hasPointerCapture(pointerId) { return capturedPointer === pointerId; },
    releasePointerCapture(pointerId) { if (capturedPointer === pointerId) capturedPointer = null; },
    setPointerCapture(pointerId) { capturedPointer = pointerId; },
    querySelector() { return null; },
  };
  return element;
}

function createRuntimeHarness({
  resolvedFetch = false,
  coarse = false,
  fetchDelayMs = null,
  failFetch = null,
} = {}) {
  const width = coarse ? 390 : 1280;
  const height = coarse ? 844 : 720;
  const halfWidth = width / 2;
  const stageTop = coarse ? 112 : 58;
  const hero = createElement('hero', { left: 0, top: 0, width, height });
  const blueSide = createElement('blue-side', { left: 0, top: 0, width: halfWidth, height });
  const orangeSide = createElement('orange-side', { left: halfWidth, top: 0, width: halfWidth, height });
  const blueFinal = createElement('blue-final', { left: 0, top: stageTop, width: halfWidth, height: height - stageTop });
  const orangeFinal = createElement('orange-final', { left: halfWidth, top: stageTop, width: halfWidth, height: height - stageTop });
  const blueNeutral = createElement('blue-neutral');
  const orangeNeutral = createElement('orange-neutral');
  blueSide.querySelector = (selector) => selector === '.neutral-frame' ? blueNeutral : blueFinal;
  orangeSide.querySelector = (selector) => selector === '.neutral-frame' ? orangeNeutral : orangeFinal;

  const nodes = {
    '#duelHero': hero,
    '.light-handle': createElement('handle'),
    '.handle-caption': createElement('caption'),
    '#heroInstruction': createElement('instruction'),
    '#heroStatus': createElement('status'),
    '.catch-bloom': createElement('bloom'),
    '.catch-exposure': createElement('exposure'),
    '.hero-tablist': createElement('controls'),
    '#heroCta': createElement('cta'),
    '#heroCompare': createElement('compare'),
    '#heroFallback': createElement('fallback'),
    '[data-side="blue"]': blueSide,
    '[data-side="orange"]': orangeSide,
    '[data-final-frame="blue"]': blueFinal,
    '[data-final-frame="orange"]': orangeFinal,
    '[data-sequence="blue"]': createElement('blue-canvas'),
    '[data-sequence="orange"]': createElement('orange-canvas'),
  };
  const autoButtons = [createElement('blue-button'), createElement('orange-button')];
  autoButtons[0].dataset.autoSide = 'blue';
  autoButtons[1].dataset.autoSide = 'orange';

  let now = 0;
  let nextRafId = 1;
  let nextTimerId = 1;
  const rafCallbacks = new Map();
  const timerCallbacks = new Map();
  const idleCallbacks = [];
  const fetchUrls = [];
  const windowListeners = new Map();
  const runtimeWindow = {
    matchMedia: (query) => ({
      matches: coarse && query.includes('pointer: coarse'),
      addEventListener() {},
    }),
    addEventListener(type, listener) {
      if (!windowListeners.has(type)) windowListeners.set(type, []);
      windowListeners.get(type).push(listener);
    },
    dispatch(type, event = {}) {
      for (const listener of windowListeners.get(type) || []) listener(event);
    },
    setTimeout(callback, delay = 0) {
      const id = nextTimerId++;
      timerCallbacks.set(id, { callback, dueAt: now + Number(delay || 0) });
      return id;
    },
    clearTimeout(id) { timerCallbacks.delete(id); },
    requestIdleCallback(callback) { idleCallbacks.push(callback); return 1; },
    requestAnimationFrame(callback) {
      const id = nextRafId++;
      rafCallbacks.set(id, callback);
      return id;
    },
    cancelAnimationFrame(id) { rafCallbacks.delete(id); },
    createImageBitmap: async (_blob, options = {}) => ({
      width: options.resizeWidth || 768,
      height: options.resizeHeight || 1080,
      close() {},
    }),
  };
  const runtimeDocument = {
    querySelector: (selector) => nodes[selector] || null,
    querySelectorAll: (selector) => selector === '[data-auto-side]' ? autoButtons : [],
  };
  const fetchResponse = { ok: true, blob: async () => ({}) };
  const runtimeContext = {
    window: runtimeWindow,
    document: runtimeDocument,
    navigator: { deviceMemory: 8, connection: { saveData: false } },
    performance: { now: () => now },
    fetch: (url) => {
      fetchUrls.push(url);
      if (resolvedFetch) return Promise.resolve(fetchResponse);
      if (fetchDelayMs !== null) {
        const delay = typeof fetchDelayMs === 'function' ? fetchDelayMs(url) : fetchDelayMs;
        return new Promise((resolve, reject) => {
          runtimeWindow.setTimeout(() => {
            if (typeof failFetch === 'function' && failFetch(url)) {
              reject(new Error(`planned frame failure: ${url}`));
              return;
            }
            resolve(fetchResponse);
          }, delay);
        });
      }
      return new Promise(() => {});
    },
    requestAnimationFrame: runtimeWindow.requestAnimationFrame,
    cancelAnimationFrame: runtimeWindow.cancelAnimationFrame,
    setTimeout: runtimeWindow.setTimeout,
    clearTimeout: runtimeWindow.clearTimeout,
    ResizeObserver: class { observe() {} },
    console,
  };
  runtimeWindow.window = runtimeWindow;
  runtimeWindow.document = runtimeDocument;
  runtimeWindow.navigator = runtimeContext.navigator;
  runtimeWindow.performance = runtimeContext.performance;

  vm.runInNewContext(source, runtimeContext, { filename: motionPath });

  return {
    hero,
    handle: nodes['.light-handle'],
    autoButtons,
    blueSide,
    orangeSide,
    runtimeWindow,
    idleCallbacks,
    fetchUrls,
    state: () => runtimeWindow.__heroMotion.getState(),
    time: () => now,
    advance(milliseconds) {
      const end = now + milliseconds;
      while (now < end - 0.001) {
        now = Math.min(end, now + 1000 / 60);
        const dueTimers = [...timerCallbacks.entries()]
          .filter(([, timer]) => timer.dueAt <= now);
        dueTimers.forEach(([id, timer]) => {
          timerCallbacks.delete(id);
          timer.callback();
        });
        const callbacks = [...rafCallbacks.values()];
        rafCallbacks.clear();
        callbacks.forEach((callback) => callback(now));
      }
    },
    async advanceAsync(milliseconds, stepMs = 20) {
      let remaining = milliseconds;
      while (remaining > 0.001) {
        const step = Math.min(stepMs, remaining);
        this.advance(step);
        remaining -= step;
        await new Promise((resolve) => setImmediate(resolve));
      }
    },
    async waitForReady() {
      for (let attempt = 0; attempt < 120; attempt += 1) {
        if (Object.values(this.state().sequenceStatus).every((status) => status === 'ready')) return;
        await new Promise((resolve) => setImmediate(resolve));
      }
      assert.fail(`sequence warmup did not finish: ${JSON.stringify(this.state().sequenceStatus)}`);
    },
  };
}

const warmHarness = createRuntimeHarness({ resolvedFetch: true });
assert.equal(warmHarness.runtimeWindow.__HERO_MOTION_V4_ACTIVE__, true, 'hero motion must initialize');
assert.equal(warmHarness.hero.dataset.motionVersion, 'v4-single-take30-responsive-input-r16');
assert.equal(warmHarness.idleCallbacks.length, 1, 'desktop hero should schedule one idle warmup');
warmHarness.idleCallbacks[0]();
await warmHarness.waitForReady();
assert.ok(warmHarness.fetchUrls.some((url) => url.includes('hero-boy-reach-00.webp')), 'desktop warmup starts blue');
assert.ok(warmHarness.fetchUrls.some((url) => url.includes('hero-girl-reach-00.webp')), 'desktop warmup starts orange');

const pointerDown = { button: 0, pointerType: 'mouse', pointerId: 7, clientX: 640, clientY: 300, preventDefault() {} };
warmHarness.handle.dispatch('pointerdown', pointerDown);
const warmGeometry = warmHarness.state().geometry;
warmHarness.runtimeWindow.dispatch('pointermove', { ...pointerDown, clientX: 640 + warmGeometry.gestureSpan * 0.06 });
warmHarness.advance(80);
const warmReaction = warmHarness.state();
assert.equal(warmReaction.phase, 'dragging');
assert.ok(Number(warmReaction.characterDrawKey.orange) >= 1, '6% warm drag paints a visible child reaction frame');

const coldHarness = createRuntimeHarness({ resolvedFetch: false });
coldHarness.handle.dispatch('pointerdown', pointerDown);
const coldGeometry = coldHarness.state().geometry;
const centerX = coldGeometry.center.x;
coldHarness.runtimeWindow.dispatch('pointermove', { ...pointerDown, clientX: 640 + coldGeometry.gestureSpan * 0.3 });
coldHarness.advance(32);
const coldThirty = coldHarness.state();
assert.equal(coldThirty.phase, 'dragging');
assert.equal(coldThirty.pointerActive, true);
assert.ok(coldThirty.current.x > centerX, 'cold drag moves the light before frames finish');

coldHarness.runtimeWindow.dispatch('pointermove', { ...pointerDown, clientX: 640 + coldGeometry.gestureSpan * 0.6 });
coldHarness.advance(32);
const coldSixty = coldHarness.state();
assert.equal(coldSixty.phase, 'dragging');
assert.equal(coldSixty.pointerActive, true);
assert.ok(coldSixty.current.x > coldThirty.current.x, 'cold drag keeps following later pointer moves');

coldHarness.runtimeWindow.dispatch('pointermove', { ...pointerDown, clientX: 640 + coldGeometry.gestureSpan * 0.85 });
const commitStart = coldHarness.state();
const targetX = coldGeometry.orange.x;
const distanceBeforeCommitFrame = Math.abs(targetX - commitStart.current.x);
coldHarness.advance(32);
const coldCommitted = coldHarness.state();
assert.equal(coldCommitted.phase, 'magnetizing');
assert.equal(coldCommitted.pointerActive, false);
assert.ok(
  Math.abs(targetX - coldCommitted.current.x) < distanceBeforeCommitFrame,
  'committed cold gesture continues toward the palm without waiting for images',
);
coldHarness.advance(248);
assert.equal(coldHarness.state().phase, 'caught', 'cold gesture reaches caught state without a load timeout');

const coarseHarness = createRuntimeHarness({ resolvedFetch: false, coarse: true });
assert.equal(coarseHarness.idleCallbacks.length, 1, 'coarse devices should schedule compressed starter-frame prefetch');
coarseHarness.autoButtons[0].dispatch('click');
assert.equal(coarseHarness.state().phase, 'idle', 'mobile Tab holds the motion briefly while starter frames buffer');
assert.equal(coarseHarness.state().pendingSide, 'blue', 'mobile Tab records the direction immediately');
assert.equal(coarseHarness.autoButtons[0].disabled, true, 'mobile Tab shows a busy state immediately');
coarseHarness.advance(autoStartMaxWaitMs + 20);
await new Promise((resolve) => setImmediate(resolve));
assert.equal(coarseHarness.state().phase, 'magnetizing', 'mobile Tab starts after the bounded starter-frame wait');
coarseHarness.advance(820);
assert.equal(coarseHarness.state().phase, 'caught', 'mobile Tab completes without waiting for all images');

const delayedDrawHarness = createRuntimeHarness({ coarse: true, fetchDelayMs: 600 });
delayedDrawHarness.autoButtons[0].dispatch('click');
let firstRealDrawAt = null;
for (let elapsed = 20; elapsed <= 700; elapsed += 20) {
  await delayedDrawHarness.advanceAsync(20);
  const state = delayedDrawHarness.state();
  if (Number(state.characterDrawKey.blue) >= 2) {
    firstRealDrawAt = elapsed;
    assert.notEqual(state.phase, 'caught', 'real child movement must happen before the final caught pose');
    break;
  }
}
assert.ok(firstRealDrawAt !== null, 'delayed mobile loading must paint at least the third child frame');
assert.ok(firstRealDrawAt <= 700, `real child movement took too long: ${firstRealDrawAt}ms`);
assert.match(
  delayedDrawHarness.fetchUrls[0] || '',
  /hero-boy-reach-00-s\.webp/,
  'mobile interaction must request the compact starter sequence first',
);
await delayedDrawHarness.advanceAsync(900);
const delayedCaught = delayedDrawHarness.state();
assert.equal(delayedCaught.phase, 'caught', 'delayed mobile interaction still reaches the caught state');
assert.equal(delayedCaught.sequenceStatus.blue, 'loading', 'delayed sequence remains loading at caught');
assert.equal(delayedCaught.sequenceLoads.blue.active, true, 'a loading caught sequence keeps its canvas active');
assert.ok(Number(delayedCaught.characterDrawKey.blue) >= 2, 'a loading caught sequence keeps its real decoded pose');
let lastOrderedKey = Number(delayedCaught.characterDrawKey.blue);
for (let elapsed = 0; elapsed < 3600 && lastOrderedKey < 29; elapsed += 20) {
  await delayedDrawHarness.advanceAsync(20);
  const nextKey = Number(delayedDrawHarness.state().characterDrawKey.blue);
  assert.ok(
    nextKey <= lastOrderedKey + 1,
    `caught playback jumped from frame ${lastOrderedKey} to ${nextKey}`,
  );
  lastOrderedKey = nextKey;
}
assert.equal(lastOrderedKey, 29, 'caught playback visibly advances through every remaining frame');

const outOfOrderHarness = createRuntimeHarness({
  coarse: true,
  fetchDelayMs: (url) => {
    const index = Number(url.match(/reach-(\d{2})-s\.webp/)?.[1] ?? 0);
    if (index === 29) return 5;
    if (index >= 24) return 650;
    return 30;
  },
});
outOfOrderHarness.autoButtons[0].dispatch('click');
const outOfOrderKeys = [];
const outOfOrderEvents = [];
for (let elapsed = 0; elapsed < 2600; elapsed += 20) {
  await outOfOrderHarness.advanceAsync(20);
  const rawKey = outOfOrderHarness.state().characterDrawKey.blue;
  if (rawKey === '') continue;
  const key = Number(rawKey);
  if (outOfOrderKeys.at(-1) !== key) {
    outOfOrderKeys.push(key);
    outOfOrderEvents.push({ key, at: outOfOrderHarness.time() });
  }
}
assert.equal(outOfOrderHarness.state().caughtSide, 'blue', 'out-of-order sequence still catches the chosen side');
assert.equal(outOfOrderHarness.state().sequenceStatus.blue, 'ready', 'out-of-order complete sequence becomes ready');
assert.equal(outOfOrderKeys.at(-1), 29, 'out-of-order loading still reaches the final frame');
for (let index = 1; index < outOfOrderKeys.length; index += 1) {
  assert.ok(
    outOfOrderKeys[index] <= outOfOrderKeys[index - 1] + 1,
    `early frame 29 caused a jump from ${outOfOrderKeys[index - 1]} to ${outOfOrderKeys[index]}`,
  );
}
const orderedTailStart = outOfOrderEvents.find((event) => event.key === 24);
const orderedTailEnd = outOfOrderEvents.find((event) => event.key === 29);
assert.ok(orderedTailStart && orderedTailEnd, 'ordered timing audit must observe frames 24 through 29');
const orderedTailDuration = orderedTailEnd.at - orderedTailStart.at;
assert.ok(
  orderedTailDuration >= 120 && orderedTailDuration <= 260,
  `ordered tail must stay near 30fps, got ${orderedTailDuration}ms for frames 24-29`,
);

const failedFrameHarness = createRuntimeHarness({
  coarse: true,
  fetchDelayMs: (url) => {
    const index = Number(url.match(/reach-(\d{2})-s\.webp/)?.[1] ?? 0);
    if (index === 29) return 5;
    if (index >= 24) return 900;
    return 30;
  },
  failFetch: (url) => /hero-boy-reach-24-s\.webp/.test(url),
});
failedFrameHarness.autoButtons[0].dispatch('click');
await failedFrameHarness.advanceAsync(2300);
const failedFrameState = failedFrameHarness.state();
assert.equal(failedFrameState.phase, 'caught', 'single-frame failure keeps the interaction in a stable caught state');
assert.equal(failedFrameState.sequenceStatus.blue, 'failed', 'a gapped sequence cannot be declared playback-ready');
assert.equal(failedFrameState.sequenceLoads.blue.active, false, 'single-frame failure falls back from the incomplete canvas');
assert.equal(failedFrameState.poseSide, 'blue', 'single-frame failure exposes the complete static caught pose');
assert.equal(failedFrameState.caughtPlaybackActive, false, 'single-frame failure stops caught playback RAF work');
const drawsAfterFailure = failedFrameState.drawCount;
await failedFrameHarness.advanceAsync(500);
assert.equal(
  failedFrameHarness.state().drawCount,
  drawsAfterFailure,
  'single-frame failure cannot leave a hidden playback loop drawing forever',
);

const escapeHarness = createRuntimeHarness({ resolvedFetch: false, coarse: true });
escapeHarness.autoButtons[0].dispatch('click');
assert.equal(escapeHarness.state().pendingSide, 'blue', 'Escape case begins from a pending selection');
escapeHarness.runtimeWindow.dispatch('keydown', { key: 'Escape', preventDefault() {} });
assert.equal(escapeHarness.state().pendingSide, null, 'Escape cancels the pending selection immediately');
await escapeHarness.advanceAsync(1100);
assert.equal(escapeHarness.state().phase, 'idle', 'Escape cancellation returns to idle');
assert.equal(escapeHarness.state().caughtSide, null, 'Escape cancellation cannot fire a stale catch callback');

const resizeHarness = createRuntimeHarness({ resolvedFetch: false, coarse: true });
resizeHarness.autoButtons[0].dispatch('click');
assert.equal(resizeHarness.state().pendingSide, 'blue', 'resize case begins from a pending selection');
resizeHarness.hero.setRect({ width: 844, height: 390 });
resizeHarness.runtimeWindow.dispatch('resize');
assert.equal(resizeHarness.state().pendingSide, null, 'structural resize cancels a pending selection');
assert.equal(resizeHarness.state().phase, 'idle', 'structural resize restores idle immediately');
await resizeHarness.advanceAsync(900);
assert.equal(resizeHarness.state().phase, 'idle', 'structural resize remains idle after the old wait window');
assert.equal(resizeHarness.state().caughtSide, null, 'structural resize cannot fire a stale catch callback');

const switchHarness = createRuntimeHarness({ resolvedFetch: false, coarse: true });
switchHarness.autoButtons[0].dispatch('click');
await switchHarness.advanceAsync(autoStartMaxWaitMs + 20);
await switchHarness.advanceAsync(820);
assert.equal(switchHarness.state().caughtSide, 'blue', 'switch case first catches the blue side');
switchHarness.autoButtons[1].dispatch('pointerdown', {
  button: 0,
  pointerType: 'touch',
  pointerId: 23,
});
switchHarness.autoButtons[1].dispatch('click');
const switching = switchHarness.state();
assert.equal(switching.phase, 'returning', 'switching sides first returns the light to center');
assert.equal(switching.pendingSide, 'orange', 'switching sides keeps the new direction pending');
assert.equal(
  switching.sequenceLoads.orange.reason,
  'interaction',
  'switching promotes a pointer hint to interaction priority',
);
await switchHarness.advanceAsync(autoStartMaxWaitMs + 40);
assert.equal(switchHarness.state().phase, 'magnetizing', 'cold opposite Tab starts after return and bounded buffering');
await switchHarness.advanceAsync(820);
assert.equal(switchHarness.state().caughtSide, 'orange', 'cold opposite Tab completes on the selected side');

const touchHarness = createRuntimeHarness({ resolvedFetch: false, coarse: true });
const touchDown = {
  button: 0,
  pointerType: 'touch',
  pointerId: 17,
  clientX: 640,
  clientY: 300,
};
touchHarness.handle.dispatch('pointerdown', touchDown);
assert.equal(touchHarness.state().phase, 'pressing', 'mobile light accepts a real long press');
assert.equal(touchHarness.state().pointerActive, true, 'mobile long press keeps the pointer active');
touchHarness.advance(numberConstant('HOLD_DELAY') + 10);
touchHarness.runtimeWindow.dispatch('pointermove', { ...touchDown, clientX: 674, clientY: 301 });
assert.equal(touchHarness.state().phase, 'dragging', 'horizontal movement after the hold becomes a drag');

const scrollHarness = createRuntimeHarness({ resolvedFetch: false, coarse: true });
scrollHarness.handle.dispatch('pointerdown', touchDown);
scrollHarness.runtimeWindow.dispatch('pointermove', { ...touchDown, clientX: 642, clientY: 326 });
assert.equal(scrollHarness.state().phase, 'idle', 'vertical movement is yielded back to page scrolling');
assert.equal(scrollHarness.state().pointerActive, false, 'page-scroll yield releases pointer capture');

console.log('HERO_MOTION_FOLLOW_OK', JSON.stringify({
  reactionStart,
  fineFollowMs,
  coarseFollowMs,
  playablePrefixFrames,
  autoStartMaxWaitMs,
  gestureCatchMs: magnetMs + settleMs,
  fineFractionAt80: Number(fineFractionAt80.toFixed(3)),
  coarseFractionAt80: Number(coarseFractionAt80.toFixed(3)),
}));
