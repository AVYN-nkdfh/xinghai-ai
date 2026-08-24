import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const motionPath = path.join(root, 'hero-motion-v4.js');
const indexPath = path.join(root, 'index.html');
const source = fs.readFileSync(motionPath, 'utf8');
const indexSource = fs.readFileSync(indexPath, 'utf8');

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
const desktopCatchThreshold = numberConstant('DESKTOP_CATCH_THRESHOLD');

assert.ok(reactionStart <= 0.06, `character reaction starts too late: ${reactionStart}`);
assert.ok(fineFollowMs <= 24, `desktop follow is too soft: ${fineFollowMs}ms`);
assert.ok(coarseFollowMs <= 28, `coarse follow is too soft: ${coarseFollowMs}ms`);
assert.ok(
  magnetMs + settleMs >= 220 && magnetMs + settleMs <= 260,
  `gesture catch should finish in 220-260ms, got ${magnetMs + settleMs}ms`,
);
assert.ok(minimumUsableFrames >= 24, 'a badly incomplete sequence must use the static fallback');

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
assert.match(autoDelivery, /beginAutoDeliver\(side\)/);
assert.doesNotMatch(autoDelivery, /queueAutoDelivery|INTERACTION_LOAD_FALLBACK_MS|\.then\(/);

const warmup = between('function warmSequencePair', 'function targetFromFrame');
assert.match(warmup, /RESOURCE_POLICY\.constrained/);
assert.match(warmup, /coarseQuery\.matches/);
assert.match(source, /scheduleInitialSequenceWarmup\(\);/);
assert.match(source, /handle\.addEventListener\('pointerenter', \(\) => warmSequencePair\('hint'\)/);

assert.doesNotMatch(source, /LOADED_GESTURE_DURATION|waitForGestureSequence|queueAutoDelivery/);
assert.match(indexSource, /hero-motion-v4\.js\?v=20260824-responsive-input-r12/);

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
    offsetWidth: rect.width,
    offsetHeight: rect.height,
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
    getBoundingClientRect() { return { ...rect, right: rect.left + rect.width, bottom: rect.top + rect.height }; },
    getContext() { return { globalCompositeOperation: 'source-over', drawImage() {} }; },
    hasPointerCapture(pointerId) { return capturedPointer === pointerId; },
    releasePointerCapture(pointerId) { if (capturedPointer === pointerId) capturedPointer = null; },
    setPointerCapture(pointerId) { capturedPointer = pointerId; },
    querySelector() { return null; },
  };
  return element;
}

function createRuntimeHarness({ resolvedFetch = false, coarse = false } = {}) {
  const hero = createElement('hero', { left: 0, top: 0, width: 1280, height: 720 });
  const blueSide = createElement('blue-side', { left: 0, top: 0, width: 640, height: 720 });
  const orangeSide = createElement('orange-side', { left: 640, top: 0, width: 640, height: 720 });
  const blueFinal = createElement('blue-final', { left: 0, top: 58, width: 640, height: 662 });
  const orangeFinal = createElement('orange-final', { left: 640, top: 58, width: 640, height: 662 });
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
  const rafCallbacks = new Map();
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
    setTimeout: () => 1,
    clearTimeout() {},
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
      return resolvedFetch ? Promise.resolve(fetchResponse) : new Promise(() => {});
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
    advance(milliseconds) {
      const end = now + milliseconds;
      while (now < end - 0.001) {
        now = Math.min(end, now + 1000 / 60);
        const callbacks = [...rafCallbacks.values()];
        rafCallbacks.clear();
        callbacks.forEach((callback) => callback(now));
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
assert.equal(warmHarness.hero.dataset.motionVersion, 'v4-single-take30-responsive-input-r12');
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
assert.equal(coarseHarness.idleCallbacks.length, 0, 'coarse devices must not decode both sequences in advance');
coarseHarness.autoButtons[0].dispatch('click');
assert.equal(coarseHarness.state().phase, 'magnetizing', 'mobile Tab starts immediately while images load');
coarseHarness.advance(820);
assert.equal(coarseHarness.state().phase, 'caught', 'mobile Tab completes without waiting for all images');

console.log('HERO_MOTION_FOLLOW_OK', JSON.stringify({
  reactionStart,
  fineFollowMs,
  coarseFollowMs,
  gestureCatchMs: magnetMs + settleMs,
  fineFractionAt80: Number(fineFractionAt80.toFixed(3)),
  coarseFractionAt80: Number(coarseFractionAt80.toFixed(3)),
}));
