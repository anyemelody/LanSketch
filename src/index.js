const canvasSketch = require('canvas-sketch');
const p5 = require('p5');
const glslify = require('glslify');
import SingleFlower from "./SingleFlower";
import SingleBranch from "./SingleBranch";


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


let shortTotalLine;
let shortlines = [];

let longTotalLine;
let longlines = [];

let flowers = [];
let flowerColor = Math.floor(Math.random() * 360);

let branchCanvas, flowerCanvas, bgShader, shaderCanvas, timer;


window.preload = () => {
  bgShader = loadShader('./simple.vert', './splash.frag');
};


const sketch = (gl) => {
  branchCanvas = createGraphics(1024, 1024, WEBGL);
  flowerCanvas = createGraphics(1024, 1024, WEBGL);
  shaderCanvas = createGraphics(1024, 1024, WEBGL);
  flowerCanvas.blendMode(BLEND);
  //draw background shader
  shaderCanvas.shader(bgShader);
  timer = 0;
  //setup branch canvas
  branchCanvas.colorMode(HSB, 360, 100, 100, 100);
  branchCanvas.strokeCap(ROUND);
  branchCanvas.strokeJoin(ROUND);
  flowerCanvas.colorMode(HSB, 360, 100, 100, 100);
  shortTotalLine = Math.floor(branchCanvas.random(24, 48));
  longTotalLine = Math.floor(branchCanvas.random(6, 9)); //6,9
  //define short lines
  for (let i = 0; i < shortTotalLine; i++) {
    let shortLength = Math.floor(branchCanvas.random(160, 420));
    shortlines[i] = new SingleBranch(branchCanvas, i, shortTotalLine, shortLength);
    shortlines[i].setSingleBranch();
  }
  // define long lines
  for (let i = 0; i < longTotalLine; i++) {
    let branchLength = Math.floor(branchCanvas.random(360, 810));
    longlines[i] = new SingleBranch(branchCanvas, i, longTotalLine, branchLength);
    longlines[i].setSingleBranch();
  }



  document.addEventListener("click", (e) => {
    let flower = new SingleFlower(
      flowerCanvas,
      flowerCanvas.createVector(mouseX, mouseY),
      flowerColor
    );
    flower.setFlower();
    flowers.push(flower);
  });

  return ({ gl, width, height }) => {
    //draw background shader
    timer = frameCount * 0.1;
    shaderCanvas.noStroke();
    shaderCanvas.quad(-512, -512, 512, -512, 512, 512, -512, 512);
    bgShader.setUniform('u_resolution', [1024, 1024]);
    bgShader.setUniform('u_time', timer);
    image(shaderCanvas, 0, 0);
    // draw branches
    if (shortlines.length > 0) {
      for (let i = shortlines.length - 1; i >= 0; i--) {
        // if (!shortlines[i].stop) {
        branchCanvas.push();
        branchCanvas.translate(shortlines[i].translatePos.x, shortlines[i].translatePos.y);
        shortlines[i].drawSingleBranch();
        image(branchCanvas, 0, 0);
        // branchCanvas.clear();
        branchCanvas.reset();
        branchCanvas.pop();
        // }
      }
    }
    //draw long lines
    if (longlines.length > 0) {
      for (let i = longlines.length - 1; i >= 0; i--) {
        // if (!longlines[i].stop) {
        branchCanvas.push();
        branchCanvas.translate(longlines[i].translatePos.x, longlines[i].translatePos.y);
        longlines[i].drawSingleBranch();
        branchCanvas.pop();
        image(branchCanvas, 0, 0);
        //  branchCanvas.clear();
        branchCanvas.reset();
        // }
      }
    }

    //animate flowers
    if (flowers.length > 0) {
      flowerCanvas.push();
      flowerCanvas.translate(-width / 2, -height / 2);
      flowers[flowers.length - 1].drawFlower();
      flowerCanvas.pop();
      image(flowerCanvas, 0, 0);
      // flowerCanvas.clear();
    }
  };
};

canvasSketch(sketch, settings);
