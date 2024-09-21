import PetalLine from "./PetalLine";

class SinglePetal {
  constructor(graphic, petalIndex, totalPetals, size, flowerColor) {
    this.graphic = graphic;
    this.lineNum = Math.floor(this.graphic.random(16, 20));
    this.petal = [];
    this.steps = size + Math.floor(this.graphic.random(-10, 10));
    this.curveAmp = this.steps*0.1+this.graphic.random(2,10);
    this.petalIndex = petalIndex;
    this.totalPetals = totalPetals;
    this.rotateRandom = this.graphic.random(-0.12, 0.12) * Math.PI;
    this.flowerColor = flowerColor;
    this.noiseSeed = this.graphic.random(0, 1000);
  }

  setPetal() {
    for (let i = 0; i < this.lineNum; i++) {
      this.petal[i] = new PetalLine(this.steps, i, this.lineNum, this.curveAmp, this.graphic, this.flowerColor, this.noiseSeed);
      this.petal[i].setup();
    }
    this.rotate = this.graphic.map(this.petalIndex, 0, this.totalPetals, -1.0 * Math.PI, 0.6 * Math.PI);
    this.rotate += this.rotateRandom;
  }

  drawPetal() {
    for (let i = 0; i < this.lineNum; i++) {
      if (!this.petal[i].stop) {
        this.graphic.push();
        this.graphic.rotate(this.rotate);
        this.petal[i].updateStep();
        this.petal[i].drawLine();
        this.petal[i].checkStep();
        this.graphic.pop();
      }
    }
  }
}
export default SinglePetal;
