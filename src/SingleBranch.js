import BranchLine from "./BranchLine";

class SingleBranch {
    constructor(graphic, BranchIndex, totalBranch, branchLength) {
        this.graphic = graphic;
        this.totalLineNum = Math.floor(this.graphic.random(6, 9));
        this.branchLines = [];
        this.branchIndex = BranchIndex;
        this.totalBranch = totalBranch;
        this.branchRatio = (this.branchIndex + 1) / this.totalBranch;
        this.translatePos = this.graphic.createVector(this.graphic.random(-100, 100), this.graphic.random(400, 450));
        this.stop = false;
        this.noiseSeed = this.graphic.random(0, 1000);
        this.deltaRotateNoise = this.graphic.random(1);
        this.graphic.noiseSeed(this.noiseSeed);
        this.fold = Math.floor(this.graphic.random(2, 5));
        this.totalStep = branchLength;
        this.lineWeight = this.totalLineNum * 1.2;
        this.rotateRatio = this.graphic.random(0.002, 0.007);
        this.rot = 0;
        this.deltaRotateNoise = this.graphic.random(1);
    }

    setSingleBranch() {
        if (this.totalStep > 450) {
            this.startRotate = this.graphic.random(-0.8, -0.2) * this.graphic.PI;
            this.rotateAngle = this.graphic.random(-1., 1.) * this.graphic.PI;
        } else {
            this.startRotate = this.graphic.random(-0.9, -0.1) * this.graphic.PI;
            this.rotateAngle = (1.8 * this.branchRatio - 0.9 + this.graphic.random(-0.2, 0.2)) * this.graphic.PI;
        }
        this.rotateDir = Math.sign(this.rotateAngle);
        this.rot = this.startRotate;

        let options = { width: 1024, height: 1024 };
        this.buffer = this.graphic.createFramebuffer(options);

        for (let i = 0; i < this.totalLineNum; i++) {
            this.lineRatio = i / this.totalLineNum;
            this.branchLines[i] = new BranchLine(
                this.graphic,
                this.startRotate,
                this.totalStep,
                this.lineWeight,
                this.rotateDir,
                this.rotateAngle,
                this.fold,
                this.lineRatio,
                this.rotateRatio,
                this.deltaRotateNoise
            );
        }
    }

    drawSingleBranch() {
        for (let i = this.totalLineNum - 1; i >= 0; i--) {
            if (!this.branchLines[i].stop) {
                this.branchLines[i].update();
                this.branchLines[i].draw();
                this.branchLines[i].checkStep();
            } else {
                this.stop = true;
            }
        }
    }
}
export default SingleBranch;


