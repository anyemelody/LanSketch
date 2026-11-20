const canvasSketch = require('canvas-sketch');
const p5 = require('p5');
const glslify = require('glslify');
import SingleFlower from "./SingleFlower";
import SingleBranch from "./SingleBranch";
import Rock from "./Rock";
import LeafMesh from "./LeafMesh";


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

const BG_TIME_PER_SECOND = 2.5;      // background drift speed (it used to be 0.1 per frame at ~25 fps)
const FLOWER_STEPS_PER_SECOND = 25;  // flower growth steps per second (it used to be one per frame at ~25 fps)

// Small seeded random generator, for the few things outside p5 (flower colour, sway phases).
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ?seed=N makes the whole picture reproducible; without it a fresh seed is picked
const params = new URLSearchParams(window.location.search);
const seedParam = params.get('seed');
const seed = seedParam !== null && seedParam.trim() !== '' && Number.isFinite(Number(seedParam))
  ? Math.floor(Math.abs(Number(seedParam))) % 4294967296
  : Math.floor(Math.random() * 1e9);
console.log("seed", seed, "(add ?seed=" + seed + " to the URL to see this picture again)");
const rand = mulberry32(seed);

let shortTotalLine;
let shortlines = [];

let longTotalLine;
let longlines = [];

let flowers = [];
let flowerColor = Math.floor(rand() * 360);

let rock, rockCanvas, branchCanvas, flowerCanvas, bgShader, shaderCanvas, timer, leaves;
let startTime = null, lastTime = null, flowerSteps = 0;


window.preload = () => {
  bgShader = loadShader('./simple.vert', './splash.frag');
};


const sketch = (gl) => {
  noiseSeed(seed);
  // the leaves are no longer drawn with p5: this small graphics only supplies the seeded
  // random(), color() and vectors that SingleBranch and BranchLine use to build them
  branchCanvas = createGraphics(1, 1);
  flowerCanvas = createGraphics(1024, 1024, WEBGL);
  shaderCanvas = createGraphics(1024, 1024, WEBGL);
  branchCanvas.randomSeed(seed);
  flowerCanvas.randomSeed(seed + 1);
  flowerCanvas.blendMode(BLEND);
  //draw background shader
  shaderCanvas.shader(bgShader);
  timer = 0;
  branchCanvas.colorMode(HSB, 360, 100, 100, 100);
  flowerCanvas.colorMode(HSB, 360, 100, 100, 100);
  // the rock is drawn once into its own layer, before the leaves so they can root in it
  rockCanvas = createGraphics(1024, 1024);
  rockCanvas.pixelDensity(1);
  rockCanvas.colorMode(HSB, 360, 100, 100, 100);
  let rockSeed = seed;
  console.log("rock seed", rockSeed);
  rock = new Rock(rockCanvas, rockSeed);
  rock.draw();
  shortTotalLine = Math.floor(branchCanvas.random(24, 48));
  longTotalLine = Math.floor(branchCanvas.random(6, 9)); //6,9
  //define short lines
  for (let i = 0; i < shortTotalLine; i++) {
    let shortLength = Math.floor(branchCanvas.random(160, 420));
    shortlines[i] = new SingleBranch(branchCanvas, i, shortTotalLine, shortLength, rock);
    shortlines[i].setSingleBranch();
  }
  // define long lines
  for (let i = 0; i < longTotalLine; i++) {
    let branchLength = Math.floor(branchCanvas.random(360, 810));
    longlines[i] = new SingleBranch(branchCanvas, i, longTotalLine, branchLength, rock);
    longlines[i].setSingleBranch();
  }

  // run every leaf to the end now and keep its shape; drawn in the order the old loop used
  const baked = [];
  for (let i = shortlines.length - 1; i >= 0; i--) baked.push(shortlines[i].bake());
  for (let i = longlines.length - 1; i >= 0; i--) baked.push(longlines[i].bake());
  leaves = new LeafMesh(1024, 1024, baked, mulberry32(seed + 2));
  // for poking at from the console, e.g. lan.leaves.breeze = 0
  window.lan = { leaves, seed, rock };

  document.addEventListener("click", (e) => {
    let flower = new SingleFlower(
      flowerCanvas,
      flowerCanvas.createVector(mouseX, mouseY),
      flowerColor
    );
    flower.setFlower();
    flowers.push(flower);
  });

  // a click also blows a gust through the leaves
  document.addEventListener("pointerdown", (e) => {
    const c = document.querySelector("canvas");
    const r = c.getBoundingClientRect();
    leaves.gust((e.clientX - r.left) * 1024 / r.width, (e.clientY - r.top) * 1024 / r.height);
  });

  return ({ gl, width, height }) => {
    const now = performance.now() / 1000;
    if (startTime === null) { startTime = now; lastTime = now; }
    const time = now - startTime, dt = now - lastTime;
    lastTime = now;
    //draw background shader
    timer = time * BG_TIME_PER_SECOND;
    shaderCanvas.noStroke();
    shaderCanvas.quad(-512, -512, 512, -512, 512, 512, -512, 512);
    bgShader.setUniform('u_resolution', [1024, 1024]);
    bgShader.setUniform('u_time', timer);
    image(shaderCanvas, 0, 0);
    // draw leaves
    leaves.update(dt, time);
    drawingContext.drawImage(leaves.render(), 0, 0, width, height);

    // the rock stands in front of the leaves, so their roots are hidden behind stone
    image(rockCanvas, 0, 0);

    //animate flowers
    if (flowers.length > 0) {
      flowerSteps += Math.min(dt, 0.1) * FLOWER_STEPS_PER_SECOND;
      flowerCanvas.push();
      flowerCanvas.translate(-width / 2, -height / 2);
      for (; flowerSteps >= 1; flowerSteps--) flowers[flowers.length - 1].drawFlower();
      flowerCanvas.pop();
      image(flowerCanvas, 0, 0);
    }
  };
};

canvasSketch(sketch, settings);
