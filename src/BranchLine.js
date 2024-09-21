class BranchLine {
    constructor(graphic, startRotation, totalStep, weight, rotateDir, rotateAngle, fold, ratio, rotateRatio, deltaRotateNoise) {
        this.graphic = graphic;
        this.startRotation = startRotation;
        this.pos = this.graphic.createVector(0, 0);
        this.pPos = this.pos.copy();
        this.vel = this.graphic.createVector(0, 0);
        this.deltaRotate = 0;
        this.lineStep = 0;
        this.totalStep = totalStep;
        this.stop = false;
        this.strokeWeight = weight;
        this.deltastrokeWeightNoise = this.graphic.random(1);
        this.brightness = this.graphic.random(0, 40);
        this.saturation = this.graphic.random(0, 40);
        this.hue = this.graphic.random(70, 120);
        this.strokeColor = this.graphic.color(this.hue, this.saturation, this.brightness, 1.);
        this.rotateDir = rotateDir;
        this.rotateAngle = rotateAngle;
        this.lineRatio = ratio;
        this.fold = fold;
        this.rotateRatio = rotateRatio;
        this.deltaRotateNoise = deltaRotateNoise;
    }

    update() {
        let curRotate = 0;
        //angle difference between two lines
        // this.rotateAngle += this.rotateRatio * (this.rotateDir * -1);
        // this.deltaRotate = (this.rotateAngle / this.totalStep) * this.lineStep;
        // curRotate = this.startRotation + this.deltaRotate;
        if (this.totalStep > 450) {
            this.rotateAngle += this.rotateRatio * (this.rotateDir * -1);
            this.deltaRotate = (this.rotateAngle / this.totalStep) * this.lineStep;
            curRotate = this.startRotation + this.deltaRotate;
        } else {
            this.deltaRotate = (this.rotateAngle / this.totalStep) * this.lineStep;
            this.deltaRotateNoise += 0.006;
            let noiseRotate = this.graphic.noise(this.deltaRotateNoise) - 0.5;
            curRotate = this.startRotation + this.deltaRotate + noiseRotate;
        };
        this.vel = this.graphic.createVector(
            this.graphic.cos(curRotate),
            this.graphic.sin(curRotate)
        )

        this.deltastrokeWeightNoise += 0.1;
        let rNoise = (this.graphic.noise(this.deltastrokeWeightNoise) - 0.5) * 4;
        let r = (Math.sin(this.graphic.map(this.lineStep / this.totalStep, 0, 1, 0, Math.PI * 2) * this.fold)) * (this.strokeWeight + rNoise) * 0.005;
        let theta = this.graphic.map(this.lineRatio, 0, 1, 0, Math.PI);
        let offset = this.graphic.createVector(r * this.graphic.cos(theta), r * this.graphic.sin(theta));
        this.vel.add(offset);
        this.pos.add(this.vel);
        this.lineStep++;
    }

    draw() {
        //define stroke alpha
        this.graphic.stroke(this.strokeColor);
        let basicWeight = this.graphic.map(this.lineStep / this.totalStep, 0, 1, this.strokeWeight, 0.1);
        this.graphic.strokeWeight(basicWeight);
        this.graphic.line(this.pPos.x, this.pPos.y, this.pos.x, this.pos.y);
        this.pPos = this.pos.copy();
    }

    checkStep() {
        if (this.lineStep >= this.totalStep) {
            this.stop = true;
        }
    }
}

export default BranchLine;
