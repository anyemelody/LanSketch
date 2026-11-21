const canvasSketch = require('canvas-sketch');
const p5 = require('p5');
const glslify = require('glslify');
import SingleBranch from "./SingleBranch";
import Rock from "./Rock";
import LeafMesh from "./LeafMesh";
import FlowerMesh from "./FlowerMesh";
import { planStalks } from "./FlowerStalk";


new p5();

const settings = {
  dimensions: [1024, 1024],
  p5: true,
  animate: true,
  contest: "webgl",
  attributes: {
    antialias: true
  }
};

// background shader settings, changed live from the slider panel (top right)
const bg = {
  INK_STRENGTH: 0.6,                 // how dark the wash gets where the layers pile up
  BLEED: 0.07,                       // how far the ink creeps along the paper fibres
  TIDE: 2.0,                         // extra pigment along the edge of each wash as it dries
  GRAIN: 0.18,                       // pigment settling into the paper grain
  TINT: 0.8,                         // 0 = pure grey ink, 1 = the full drifting colour
  BG_TIME_PER_SECOND: 2.5            // background drift speed (it used to be 0.1 per frame at ~25 fps)
};
const BG_SLIDERS = [                 // name, min, max
  ['INK_STRENGTH', 0, 1.5], ['BLEED', 0, 0.3], ['TIDE', 0, 3], ['GRAIN', 0, 1.5], ['TINT', 0, 1], ['BG_TIME_PER_SECOND', 0, 10]
];

// a small, quiet, collapsible panel of sliders for the background
function makeBgPanel() {
  const panel = document.createElement('div');
  panel.style.cssText = 'position:fixed;top:8px;right:8px;z-index:10;font:11px/1.4 sans-serif;color:#555;' +
    'background:rgba(250,248,243,0.85);border:1px solid rgba(0,0,0,0.08);border-radius:4px;padding:4px 8px;user-select:none';
  const head = document.createElement('div');
  head.textContent = 'background ▸';
  head.style.cssText = 'cursor:pointer;text-align:right';
  const body = document.createElement('div');
  body.style.display = 'none';
  head.addEventListener('click', () => {
    const open = body.style.display === 'none';
    body.style.display = open ? 'block' : 'none';
    head.textContent = open ? 'background ▾' : 'background ▸';
  });
  for (const [name, min, max] of BG_SLIDERS) {
    const row = document.createElement('label');
    row.style.cssText = 'display:block;margin:4px 0';
    const text = document.createElement('div');
    const input = document.createElement('input');
    input.type = 'range'; input.min = min; input.max = max; input.step = (max - min) / 300; input.value = bg[name];
    input.style.cssText = 'width:160px;display:block;accent-color:#8a8580';
    const show = () => { text.textContent = name + '  ' + (+bg[name]).toFixed(3); };
    input.addEventListener('input', () => { bg[name] = +input.value; show(); });
    show();
    row.append(text, input);
    body.append(row);
  }
  panel.append(head, body);
  // clicks on the panel are not clicks on the picture
  for (const ev of ['pointerdown', 'click', 'mousedown', 'mouseup', 'pointerup', 'touchstart'])
    panel.addEventListener(ev, (e) => e.stopPropagation());
  document.body.appendChild(panel);
  return panel;
}

// ---- clumps -----------------------------------------------------------------------
const CLUMP_ODDS = [0, 0.5, 0.5];    // chance of 1, 2, 3 clumps
const CLUMP_TILT_BACK = 0.35;        // chance that a clump leans against the general flow of the group (顾盼)
const INK_COPIES_FLOOR = 30;         // a clump of only a few leaves is still inked as strongly as one of this many
// How a clump grows. One is picked per clump, so a picture mixes a full, open clump with
// a few long leaves bunched together and swept to one side.
//   odds: [as the main clump, as a guest]     short / long: how many leaves of each kind
//   lengthShort / lengthLong: steps (px) a leaf runs before it ends; long ones may leave the canvas
//   tilt: rad the whole clump leans           baseSpread, spread, curl, unison: see SingleBranch
const HABITS = [
  { name: 'full', odds: [0.3, 0.15], short: [24, 48], long: [6, 9], lengthShort: [160, 420], lengthLong: [360, 810],
    tilt: [0.1, 0.4], baseSpread: 80, spread: [1, 1], curl: [1, 1], unison: [0, 0] },
  { name: 'loose', odds: [0.35, 0.35], short: [9, 18], long: [3, 6], lengthShort: [160, 460], lengthLong: [420, 950],
    tilt: [0.15, 0.6], baseSpread: 50, spread: [0.55, 0.8], curl: [0.7, 1], unison: [0.2, 0.6] },
  { name: 'few', odds: [0.35, 0.5], short: [3, 7], long: [2, 5], lengthShort: [200, 520], lengthLong: [520, 1250],
    tilt: [0.25, 0.9], baseSpread: 22, spread: [0.25, 0.5], curl: [0.45, 0.8], unison: [0.6, 0.95] }
];
const SLOPE_HINTS = 3;               // at most this many loose dabs between neighbouring stones
// Where the clumps sit. Each layout is a list of slots, the main (full size, lowest) clump
// first: [x from, x to, height from, height to, scale from, scale to], x as a fraction of
// the width from the left, height as a fraction of the canvas height measured from the
// bottom. Layouts are mirrored at random; guests may sit close to an edge and grow out of the picture. They follow the usual rules of the genre: one
// host and smaller guests, never at the same height, never evenly spaced, three clumps
// on an uneven triangle, and one large area of paper left empty.
const LAYOUTS = {
  2: [
    // across the diagonal: host low on one side, guest high on the other
    [[0.10, 0.46, 0.05, 0.30, 1, 1], [0.54, 0.96, 0.34, 0.80, 0.5, 0.8]],
    // host low near the middle, guest above and out to one side
    [[0.34, 0.66, 0.05, 0.30, 1, 1], [0.04, 0.34, 0.36, 0.80, 0.45, 0.7]]
  ],
  3: [
    // uneven triangle: host low at one side, one across and a little higher, the smallest high between them
    [[0.10, 0.44, 0.05, 0.30, 1, 1], [0.58, 0.96, 0.20, 0.50, 0.6, 0.8], [0.30, 0.66, 0.52, 0.82, 0.4, 0.55]],
    // climbing a slope with uneven steps: two nearer each other, the third further off
    [[0.10, 0.42, 0.05, 0.30, 1, 1], [0.42, 0.70, 0.26, 0.52, 0.6, 0.8], [0.70, 0.96, 0.48, 0.80, 0.4, 0.55]],
    // host low in the middle, guests staggered up either side at different heights
    [[0.34, 0.66, 0.05, 0.30, 1, 1], [0.04, 0.32, 0.24, 0.54, 0.6, 0.8], [0.64, 0.96, 0.44, 0.80, 0.4, 0.55]]
  ]
};
const CLUMP_MIN_GAP = 230;           // px: no two clumps closer than this
const CLUMP_MIN_STEP = 70;           // px: and no two at nearly the same height
// -------------------------------------------------------------------------------------

// Small seeded random generator, for the few things outside p5 (flower colour, sway phases).
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const lerp = (a, b, t) => a + (b - a) * t;
// an independent random stream k for this seed (mulberry32 of seed + k gives nearly the
// same first numbers for neighbouring seeds, so the seed is hashed first)
function stream(k) {
  let x = (seed ^ Math.imul(k, 0x9E3779B1)) | 0;
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  return mulberry32((x ^ (x >>> 16)) >>> 0);
}

// ?seed=N makes the whole picture reproducible; without it a fresh seed is picked
const params = new URLSearchParams(window.location.search);
const seedParam = params.get('seed');
const seed = seedParam !== null && seedParam.trim() !== '' && Number.isFinite(Number(seedParam))
  ? Math.floor(Math.abs(Number(seedParam))) % 4294967296
  : Math.floor(Math.random() * 1e9);
console.log("seed", seed, "(add ?seed=" + seed + " to the URL to see this picture again)");
const rand = mulberry32(seed);

let flowerColor = Math.floor(rand() * 360);

let rockCanvas, branchCanvas, flowerGraphic, bgShader, shaderCanvas, timer, leaves, flowers;
let startTime = null, lastTime = null;


window.preload = () => {
  bgShader = loadShader('./simple.vert', './splash.frag');
};

// Pick a layout for this seed and place the clumps in its slots.
function planClumps(R) {
  const W = 1024, H = 1024;
  const u = R();
  const n = u < CLUMP_ODDS[0] ? 1 : u < CLUMP_ODDS[0] + CLUMP_ODDS[1] ? 2 : 3;
  const options = LAYOUTS[n];
  const layout = options[Math.floor(R() * options.length) % options.length];
  const mirror = R() < 0.5;
  // the slots are wide and overlap a little, so draw again if two clumps land too close
  let clumps;
  for (let tries = 0; tries < 40; tries++) {
    clumps = layout.map((slot, i) => {
      const fx = lerp(slot[0], slot[1], R());
      return { x: W * (mirror ? 1 - fx : fx), y: H * (1 - lerp(slot[2], slot[3], R())), scale: lerp(slot[4], slot[5], R()), main: i === 0 };
    });
    const tight = clumps.some((p, i) => clumps.some((q, j) => j > i &&
      (Math.hypot(p.x - q.x, p.y - q.y) < CLUMP_MIN_GAP || Math.abs(p.y - q.y) < CLUMP_MIN_STEP)));
    if (!tight) break;
  }
  // the group leans one way, toward the emptier side of the picture; any clump may lean back
  const meanX = clumps.reduce((sum, c) => sum + c.x * c.scale, 0) / clumps.reduce((sum, c) => sum + c.scale, 0);
  const flow = meanX < W / 2 ? 1 : -1;
  let previous = null;
  for (const c of clumps) {
    // a habit for each clump, not the same one twice running
    let pick = null;
    for (let tries = 0; tries < 6 && (!pick || pick === previous); tries++) {
      let v = R();
      for (const hb of HABITS) { pick = hb; v -= hb.odds[c.main ? 0 : 1]; if (v < 0) break; }
    }
    previous = pick;
    const dir = R() < CLUMP_TILT_BACK ? -flow : flow;
    c.tilt = dir * lerp(pick.tilt[0], pick.tilt[1], R());
    c.habit = {
      name: pick.name, pick,
      baseSpread: pick.baseSpread,
      spread: lerp(pick.spread[0], pick.spread[1], R()),
      curl: lerp(pick.curl[0], pick.curl[1], R()),
      unison: lerp(pick.unison[0], pick.unison[1], R()),
      dir: R() < 0.8 ? dir : -dir     // mostly sweeping the way the clump leans
    };
  }
  return clumps;
}

// A start / stop button (top left) that records the canvas to a webm file. Stops by itself after
// RECORD_MAX_SECONDS. Only the picture is recorded, not the button or the slider panel.
const RECORD_MAX_SECONDS = 90;
function makeRecordButton() {
  const button = document.createElement('button');
  button.style.cssText = 'position:fixed;top:8px;left:8px;z-index:10;font:12px/1.4 sans-serif;padding:4px 10px;';
  button.textContent = 'Record';
  let recorder = null, timer = null;
  const stop = () => { if (recorder && recorder.state !== 'inactive') recorder.stop(); };
  button.addEventListener('click', () => {
    if (recorder && recorder.state !== 'inactive') { stop(); return; }
    const canvas = document.querySelector('canvas');
    const mimeType = ['video/webm;codecs=vp9', 'video/webm'].find((type) => MediaRecorder.isTypeSupported(type));
    recorder = new MediaRecorder(canvas.captureStream(60), { mimeType, videoBitsPerSecond: 16000000 });
    const chunks = [];
    recorder.ondataavailable = (event) => chunks.push(event.data);
    recorder.onstop = () => {
      clearInterval(timer);
      const link = document.createElement('a');
      link.href = URL.createObjectURL(new Blob(chunks, { type: 'video/webm' }));
      link.download = 'lan-seed-' + seed + '.webm';
      link.click();
      button.textContent = 'Saved. Record again';
    };
    recorder.start();
    let elapsed = 0;
    button.textContent = 'Stop (0s)';
    timer = setInterval(() => {
      elapsed++;
      button.textContent = 'Stop (' + elapsed + 's)';
      if (elapsed >= RECORD_MAX_SECONDS) stop();
    }, 1000);
  });
  // clicks on the button are not clicks on the picture
  for (const ev of ['pointerdown', 'mousedown', 'mouseup', 'pointerup', 'touchstart'])
    button.addEventListener(ev, (e) => e.stopPropagation());
  document.body.appendChild(button);
  return button;
}

const sketch = (gl) => {
  noiseSeed(seed);
  // the leaves are no longer drawn with p5: this small graphics only supplies the seeded
  // random(), color() and vectors that SingleBranch and BranchLine use to build them
  branchCanvas = createGraphics(1, 1);
  shaderCanvas = createGraphics(1024, 1024, WEBGL);
  branchCanvas.randomSeed(seed);
  //draw background shader
  shaderCanvas.shader(bgShader);
  timer = 0;
  branchCanvas.colorMode(HSB, 360, 100, 100, 100);
  // and this one does the same for her flower code
  flowerGraphic = createGraphics(1, 1);
  flowerGraphic.colorMode(HSB, 360, 100, 100, 100);
  flowerGraphic.randomSeed(seed + 1);
  // the stones share one layer, drawn once
  rockCanvas = createGraphics(1024, 1024);
  rockCanvas.pixelDensity(1);
  rockCanvas.colorMode(HSB, 360, 100, 100, 100);
  rockCanvas.clear();

  // every clump gets its own stone at its place in the layout
  const clumps = planClumps(stream(5));
  clumps.forEach((c, k) => {
    c.rock = new Rock(rockCanvas, c.main ? seed : seed + 101 * k, { anchor: { x: c.x, y: c.y }, scale: c.scale });
  });
  const mainRock = clumps[0].rock;

  // leaves, one clump at a time (each clump's walkers share the noise seed of its last leaf)
  const baked = [];
  clumps.forEach((c, k) => {
    if (!c.main) branchCanvas.randomSeed(seed + 7919 * k);
    const s = c.scale;
    const hb = c.habit, pk = hb.pick;
    const nShort = Math.max(2, Math.round(branchCanvas.random(pk.short[0], pk.short[1]) * (c.main ? 1 : Math.sqrt(s))));
    const nLong = Math.max(1, Math.round(branchCanvas.random(pk.long[0], pk.long[1]) * (c.main ? 1 : Math.sqrt(s))));
    const shortlines = [], longlines = [];
    for (let i = 0; i < nShort; i++) {
      let shortLength = Math.floor(branchCanvas.random(pk.lengthShort[0], pk.lengthShort[1]));
      shortlines[i] = new SingleBranch(branchCanvas, i, nShort, shortLength, c.rock, hb);
      shortlines[i].setSingleBranch();
    }
    for (let i = 0; i < nLong; i++) {
      let branchLength = Math.floor(branchCanvas.random(pk.lengthLong[0], pk.lengthLong[1]));
      longlines[i] = new SingleBranch(branchCanvas, i, nLong, branchLength, c.rock, hb);
      longlines[i].setSingleBranch();
    }
    // run every leaf to the end now and keep its shape; in the order the old loop used
    const copies = Math.max(nShort + nLong, INK_COPIES_FLOOR);
    for (let i = shortlines.length - 1; i >= 0; i--) baked.push({ ...shortlines[i].bake(s, c.tilt), copies });
    for (let i = longlines.length - 1; i >= 0; i--) baked.push({ ...longlines[i].bake(s, c.tilt), copies });
  });
  leaves = new LeafMesh(1024, 1024, baked, mulberry32(seed + 2));

  // stones, the furthest (highest) first, then a few loose dabs between neighbours
  const far = clumps.slice().sort((p, q) => p.y - q.y);
  for (const c of far) c.rock.draw(false);
  if (far.length > 1) {
    const R = stream(6);
    let hints = Math.floor(R() * (SLOPE_HINTS + 1));
    for (let i = 0; i < far.length - 1 && hints > 0; i++) {
      const n = i === far.length - 2 ? hints : Math.floor(R() * (hints + 1));
      far[i + 1].rock.slopeHints(far[i].rock, n);
      hints -= n;
    }
  }

  // flower stalks, far clumps first, with her flowers on them
  const stalks = [];
  const R = stream(3);
  for (const c of far) stalks.push(...planStalks(c, R, flowerGraphic, flowerColor, c.main));
  flowers = new FlowerMesh(leaves.gl, 1024, 1024, stalks, stream(4));
  // for poking at from the console, e.g. lan.leaves.breeze = 0, lan.flowers.flowers[0]
  window.lan = { leaves, flowers, seed, rock: mainRock, clumps, flowerColor, bg };
  const bgPanel = makeBgPanel();
  // open the page with ?record to get a button that saves a video of the canvas
  if (params.has('record')) makeRecordButton();

  // a click blows a gust through the leaves and stalks, and opens the nearest closed flower
  document.addEventListener("pointerdown", (e) => {
    if (bgPanel.contains(e.target)) return;
    const c = document.querySelector("canvas");
    const r = c.getBoundingClientRect();
    const x = (e.clientX - r.left) * 1024 / r.width, y = (e.clientY - r.top) * 1024 / r.height;
    leaves.gust(x, y);
    flowers.gust(x, y);
    flowers.openNearest(x, y);
  });

  return ({ gl, width, height }) => {
    const now = performance.now() / 1000;
    if (startTime === null) { startTime = now; lastTime = now; }
    const time = now - startTime, dt = now - lastTime;
    lastTime = now;
    //draw background shader
    // the drift keeps its place when its speed is changed from the panel
    timer += Math.min(dt, 0.1) * bg.BG_TIME_PER_SECOND;
    bgShader.setUniform('u_resolution', [1024, 1024]);
    bgShader.setUniform('u_time', timer);
    bgShader.setUniform('u_tuned', 1);
    bgShader.setUniform('u_ink', bg.INK_STRENGTH);
    bgShader.setUniform('u_bleed', bg.BLEED);
    bgShader.setUniform('u_tide', bg.TIDE);
    bgShader.setUniform('u_grain', bg.GRAIN);
    bgShader.setUniform('u_tint', bg.TINT);
    shaderCanvas.noStroke();
    shaderCanvas.quad(-512, -512, 512, -512, 512, 512, -512, 512);
    image(shaderCanvas, 0, 0);
    // leaves, then the stalks and flowers over them, on the same canvas: one copy
    leaves.update(dt, time);
    flowers.update(dt, time);
    leaves.render();
    flowers.render();
    drawingContext.drawImage(leaves.canvas, 0, 0, width, height);

    // the stones stand in front, so roots and the feet of the stalks are hidden behind them
    image(rockCanvas, 0, 0);
  };
};

canvasSketch(sketch, settings);
