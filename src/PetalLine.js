class PetalLine {
  constructor(steps, index, totalLine, curveAmp, graphic, flowerColor, noiseSeed) {
    this.graphic = graphic;
    this.originPos = this.graphic.createVector(0, 0);
    this.pos = this.originPos;
    this.pPos = this.pos.copy();
    this.vel = graphic.createVector(0, 0);
    this.index = index + 1;
    this.totalLine = totalLine;
    this.lineStep = 0;
    this.totalStep = steps;
    this.petalLength = 1;
    this.stop = false;
    this.curveAmp = curveAmp;
    this.theta = 0;
    this.strokeWeight = 6;
    this.lineRatio = 0;
    this.ampNoise = this.graphic.random(0, 1);
    this.noiseSeed = noiseSeed;
    this.brightness = 0;
    this.hue = flowerColor;
    this.saturation = 0;
    this.strokeColor = this.graphic.color(0, 0, 0);
    this.noise = this.graphic.random();
  }

  setup() {
    this.graphic.noiseSeed(this.noiseSeed);
    this.graphic.angleMode(this.graphic.RADIANS);
    if (this.index == 0 || this.index == this.totalLine - 1) {
    } else {
      this.petalLength *= this.graphic.random(0.8, 1);
    }
    this.lineRatio = this.graphic.map(this.index / this.totalLine, 0, 1, 0, Math.PI);
    let AmpWeight = this.graphic.map(this.index / this.totalLine, 0, 1, -0.6, 0.6);
    this.curveAmp *= AmpWeight;
    this.strokeWeight *= (1.2 - Math.sin(this.lineRatio));
    this.curvePow = Math.floor(this.graphic.random(1,3));
    //hue noise
    this.hue += (this.graphic.noise(this.index * 0.1)-0.5)*70;
    this.hue = this.graphic.constrain(this.hue, 0, 360);
  }

  updateStep() {
    this.theta = this.graphic.map(Math.pow((this.lineStep / this.totalStep), this.curvePow), 0, 1, 0, Math.PI);
    //petal thinkness noise
    this.curveAmp += (this.graphic.noise(this.ampNoise + this.lineStep * 0.006) - 0.5) * 1.;
    this.pos = this.graphic.createVector(this.lineStep * this.petalLength, Math.sin(this.theta) * this.curveAmp);
    this.pos = this.pos.add(this.originPos);
    this.lineStep++;
  }

  drawLine() {
    // define stroke alpha
    let strokeAlpha = this.graphic.map(this.lineStep / this.totalStep, 0, 1, 10, 70);
    this.brightness = (this.graphic.noise(this.ampNoise + this.lineStep * 0.06) + 0.5) * 80;
    this.saturation = this.graphic.map(this.brightness, 40, 120, 90, 30);
    this.strokeColor = this.graphic.color(this.hue, this.saturation, this.brightness, strokeAlpha);
    this.graphic.stroke(this.strokeColor);
    // define strokewight
    let updateWeight = this.graphic.map(this.lineStep / this.totalStep, 0, 1, this.strokeWeight * 0.1, this.strokeWeight);
    this.graphic.strokeWeight(updateWeight);
    this.graphic.strokeJoin(this.graphic.ROUND);
    this.graphic.line(this.pPos.x, this.pPos.y, this.pos.x, this.pos.y);
    this.pPos = this.pos.copy();
  }

  checkStep() {
    if (this.lineStep >= this.totalStep) {
      this.stop = true;
    }
  }
}

export default PetalLine;

