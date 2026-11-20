// One hair of a dry side-brush (侧锋) stroke. A rock bar is a bundle of these
// laid side by side across the width of the brush. Each hair follows the same
// gently bent path at its own offset, and lifts off the paper where a noise
// field dips. The noise is sampled at (distance along the stroke, position
// across the brush), so neighbouring hairs lift together and the gaps read as
// streaks of flying white (飞白) rather than speckle.
class RockLine {
    // path: {a, c, b} quadratic curve (start, control, end) in canvas pixels
    // across: -1..1, position across the brush; offset: pixels from the centre
    // opts: weight, color (css string), dry 0..1, edge 0..1 (1 = the loaded edge),
    //       t0 / t1 (where this hair touches down and lifts off), row (noise row)
    constructor(graphic, path, offset, opts) {
        this.graphic = graphic;
        this.path = path;
        this.offset = offset;
        Object.assign(this, opts);
    }

    point(t) {
        const { a, c, b } = this.path;
        const u = 1 - t;
        const x = u * u * a.x + 2 * u * t * c.x + t * t * b.x;
        const y = u * u * a.y + 2 * u * t * c.y + t * t * b.y;
        // normal of the curve at t
        const dx = 2 * u * (c.x - a.x) + 2 * t * (b.x - c.x);
        const dy = 2 * u * (c.y - a.y) + 2 * t * (b.y - c.y);
        const l = Math.hypot(dx, dy) || 1;
        return { x, y, nx: -dy / l, ny: dx / l };
    }

    draw() {
        const g = this.graphic;
        const ctx = g.drawingContext;
        const { a, b } = this.path;
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        const steps = Math.max(8, Math.floor(len / 2));
        ctx.strokeStyle = this.color;
        ctx.lineCap = "butt";
        let prev = null;
        for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            const inside = t >= this.t0 && t <= this.t1;
            // the hair presses in where it lands and thins out where it lifts
            const land = Math.min(1, (t - this.t0) / 0.03);
            const lift = Math.min(1, (this.t1 - t) / 0.1);
            const s = t * len;
            // ink runs out toward the end of the stroke, so more of it is lifted there
            const runOut = Math.pow(Math.max(0, (t - this.t0) / Math.max(0.01, this.t1 - this.t0)), 3) * 0.16;
            const thr = 0.31 + this.dry * 0.12 + (1 - this.edge) * (0.06 + this.dry * 0.1) + runOut;
            // each hair samples the streak field slightly shifted, so gaps have feathered,
            // not square, ends
            const sp = s + this.phase;
            const streak = g.noise(sp * 0.016, this.row);
            const grain = g.noise(sp * 0.11, this.row * 3.7 + 40);
            const v = streak * 0.75 + grain * 0.25 - thr;
            const drift = (g.noise(s * 0.008, this.row * 0.7 + 90) - 0.5) * 6;
            const fanned = this.offset * (1 + this.fan * (t - 0.5));
            const p = this.point(t);
            const x = p.x + p.nx * (fanned + drift);
            const y = p.y + p.ny * (fanned + drift);
            // width follows how firmly the hair is on the paper, so breaks taper
            const press = inside && v > 0 ? Math.min(1, v / 0.07) * Math.max(0, land) * Math.max(0, lift) : 0;
            if (press > 0.08 && prev) {
                ctx.lineWidth = this.weight * (0.25 + 0.75 * press);
                ctx.beginPath();
                ctx.moveTo(prev.x, prev.y);
                ctx.lineTo(x, y);
                ctx.stroke();
            }
            prev = { x, y };
        }
    }
}

export default RockLine;
