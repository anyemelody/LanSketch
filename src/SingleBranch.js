import BranchLine from "./BranchLine";

class SingleBranch {
    // habit (optional) shapes the clump this leaf belongs to, without touching the walker:
    //   baseSpread: px either side of the crevice the roots are scattered over (80)
    //   spread: 1 = leaves start out in every upward direction, smaller = a tight bunch (1)
    //   curl: how much of its turn a leaf keeps, smaller = longer, straighter sweeps (1)
    //   unison: 0 = leaves curl either way, 1 = all toward `dir` (0);  dir: -1 or 1
    constructor(graphic, BranchIndex, totalBranch, branchLength, rock, habit = {}) {
        this.graphic = graphic;
        this.habit = habit;
        this.totalLineNum = Math.floor(this.graphic.random(6, 9));
        this.branchLines = [];
        this.branchIndex = BranchIndex;
        this.totalBranch = totalBranch;
        this.branchRatio = (this.branchIndex + 1) / this.totalBranch;
        if (rock) {
            // root hides just behind the stone, between the crevice and the nearby edges
            // (a smaller stone, further up the slope, gathers its leaves closer together)
            const k = rock.scale || 1;
            const reach = habit.baseSpread === undefined ? 80 : habit.baseSpread;
            const baseX = rock.crevice.x + this.graphic.random(-80, 80) * (reach / 80) * k;
            const baseY = rock.topY(baseX) + this.graphic.random(8, 16) * k;
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
        const h = this.habit;
        if (h.spread !== undefined) this.startRotate = -Math.PI / 2 + (this.startRotate + Math.PI / 2) * h.spread;
        if (h.unison) this.rotateAngle += ((h.dir || 1) * Math.abs(this.rotateAngle) - this.rotateAngle) * h.unison;
        if (h.curl !== undefined) this.rotateAngle *= h.curl;
        // a long leaf keeps turning by rotateRatio every step: hold its total turn to what her longest
        // leaves (810 steps) had, and ease it with the habit, or the extra length winds into a spiral
        if (h.curl !== undefined) this.rotateRatio *= h.curl;
        if (this.totalStep > 810) this.rotateRatio *= 810 / this.totalStep;
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

    // runs all lines to the end; returns the leaf for LeafMesh (lines in draw order).
    // scale shrinks the finished leaf (points and widths) for the smaller clumps.
    // tilt (rad) turns the whole leaf about its base, so a clump can grow at a slant
    bake(scale = 1, tilt = 0) {
        const lines = [];
        for (let i = this.totalLineNum - 1; i >= 0; i--) lines.push(this.branchLines[i].run());
        this.stop = true;
        if (scale !== 1) for (const l of lines) {
            for (let k = 0; k < l.pts.length; k++) l.pts[k] *= scale;
            for (let k = 0; k < l.widths.length; k++) l.widths[k] *= scale;
        }
        if (tilt !== 0) {
            const c = Math.cos(tilt), s = Math.sin(tilt);
            for (const l of lines) for (let k = 0; k < l.pts.length; k += 2) {
                const x = l.pts[k], y = l.pts[k + 1];
                l.pts[k] = c * x - s * y;
                l.pts[k + 1] = s * x + c * y;
            }
        }
        const base = { x: 512 + this.translatePos.x, y: 512 + this.translatePos.y };
        const P = lines[0].pts, m = Math.floor(P.length / 4);
        return { base, length: this.totalStep, scale, lines, mid: { x: base.x + P[m * 2], y: base.y + P[m * 2 + 1] } };
    }
}
export default SingleBranch;


