import BranchLine from "./BranchLine";

class SingleBranch {
    constructor(graphic, BranchIndex, totalBranch, branchLength, rock) {
        this.graphic = graphic;
        this.totalLineNum = Math.floor(this.graphic.random(6, 9));
        this.branchLines = [];
        this.branchIndex = BranchIndex;
        this.totalBranch = totalBranch;
        this.branchRatio = (this.branchIndex + 1) / this.totalBranch;
        if (rock) {
            // root hides just behind the stone, between the crevice and the nearby edges
            const baseX = rock.crevice.x + this.graphic.random(-80, 80);
            const baseY = rock.topY(baseX) + this.graphic.random(8, 16);
            this.translatePos = this.graphic.createVector(baseX - 512, baseY - 512);
        } else {
            this.translatePos = this.graphic.createVector(this.graphic.random(-100, 100), this.graphic.random(400, 450));
        }
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

    // runs all lines to the end; returns the leaf for LeafMesh (lines in draw order)
    bake() {
        const lines = [];
        for (let i = this.totalLineNum - 1; i >= 0; i--) lines.push(this.branchLines[i].run());
        this.stop = true;
        const base = { x: 512 + this.translatePos.x, y: 512 + this.translatePos.y };
        const P = lines[0].pts, m = Math.floor(P.length / 4);
        return { base, length: this.totalStep, lines, mid: { x: base.x + P[m * 2], y: base.y + P[m * 2 + 1] } };
    }
}
export default SingleBranch;


