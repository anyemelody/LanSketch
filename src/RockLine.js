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
    //       t0 / t1 (where this hair touches down and lifts off), row (noise row),
    //       grain 0..1 (how much a fine per-hair tooth breaks it up), hair (that tooth's noise row)
    // The path may run in any direction (steep and vertical strokes too): offsets are
    // along the curve's normal and the noise is sampled by distance along the curve.
    // path may instead be {pts: [{x, y}, ...]}, a polyline (a contour run): the hair then
    // follows it with a smoothed normal. opts.press(t) widens the brush and thickens the
    // hairs (pressure at turns), opts.dryAt(t) lifts more of it (flying white on runs).
    constructor(graphic, path, offset, opts) {
        this.graphic = graphic;
        this.path = path;
        this.offset = offset;
        Object.assign(this, opts);
        if (path.pts) {
            const cum = [0];
            for (let i = 1; i < path.pts.length; i++)
                cum.push(cum[i - 1] + Math.hypot(path.pts[i].x - path.pts[i - 1].x, path.pts[i].y - path.pts[i - 1].y));
            this.cum = cum;
            this.total = cum[cum.length - 1] || 1;
        }
    }

    // position along the polyline at arc length d
    at(d) {
        const P = this.path.pts, C = this.cum;
        d = Math.max(0, Math.min(this.total, d));
        let i = 1;
        while (i < C.length - 1 && C[i] < d) i++;
        const f = (d - C[i - 1]) / Math.max(1e-6, C[i] - C[i - 1]);
        return { x: P[i - 1].x + (P[i].x - P[i - 1].x) * f, y: P[i - 1].y + (P[i].y - P[i - 1].y) * f };
    }

    point(t) {
        if (this.path.pts) {
            const d = t * this.total, p = this.at(d);
            // tangent over a few px either side, so the hairs turn corners smoothly
            const p0 = this.at(d - 5), p1 = this.at(d + 5);
            const dx = p1.x - p0.x, dy = p1.y - p0.y, l = Math.hypot(dx, dy) || 1;
            return { x: p.x, y: p.y, nx: -dy / l, ny: dx / l };
        }
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
        const len = this.path.pts ? this.total : Math.hypot(this.path.b.x - this.path.a.x, this.path.b.y - this.path.a.y);
        const steps = Math.max(8, Math.floor(len / 2));
        // a short stroke still breaks up along its length: its streaks are shorter
        const freq = 0.016 * Math.min(2.5, Math.max(1, 150 / len));
        ctx.strokeStyle = this.color;
        ctx.lineCap = "butt";
        ctx.lineJoin = "round";
        let prev = null, run = null;
        const flush = () => {
            if (!run) return;
            const lw = run.sum / (run.pts.length - 1);
            // a piece shorter than it is wide would read as a tick across the stroke
            const p0 = run.pts[0], p1 = run.pts[run.pts.length - 1];
            if (Math.hypot(p1.x - p0.x, p1.y - p0.y) < lw * 1.3) { run = null; return; }
            ctx.lineWidth = lw;
            ctx.beginPath();
            ctx.moveTo(run.pts[0].x, run.pts[0].y);
            for (let j = 1; j < run.pts.length; j++) ctx.lineTo(run.pts[j].x, run.pts[j].y);
            ctx.stroke();
            run = null;
        };
        for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            const inside = t >= this.t0 && t <= this.t1;
            // the hair presses in where it lands and thins out where it lifts
            // (over a few px at least, so short strokes taper too)
            const land = Math.min(1, (t - this.t0) / Math.max(0.03, 5 / len));
            const lift = Math.min(1, (this.t1 - t) / Math.max(0.1, 12 / len));
            const s = t * len;
            // ink runs out toward the end of the stroke, so more of it is lifted there
            const runOut = Math.pow(Math.max(0, (t - this.t0) / Math.max(0.01, this.t1 - this.t0)), 3) * 0.16 * (this.runOut === undefined ? 1 : this.runOut);
            const thr = 0.31 + this.dry * 0.12 + (1 - this.edge) * (0.06 + this.dry * 0.1) + runOut + (this.dryAt ? this.dryAt(t) : 0);
            // each hair samples the streak field slightly shifted, so gaps have feathered,
            // not square, ends
            const sp = s + this.phase;
            const streak = g.noise(sp * freq, this.row);
            const grain = g.noise(sp * 0.11, this.row * 3.7 + 40);
            // a fine tooth of the paper, this hair's own: breaks become grainy and irregular
            const gr = this.grain || 0;
            const tooth = gr > 0 ? (g.noise(sp * 0.42, (this.hair || 0) + 300) - 0.5) * 0.4 * gr : 0;
            const v = streak * 0.75 + grain * 0.25 + tooth - thr;
            const drift = (g.noise(s * 0.008, this.row * 0.7 + 90) - 0.5) * 6
                // and each hair wanders a little on its own, so the bundle is not ruled
                + (gr > 0 ? (g.noise(s * 0.03, (this.hair || 0) + 500) - 0.5) * 3 * gr : 0);
            // the hair's own load swells and thins along the stroke
            const swell = gr > 0 ? 0.55 + 0.9 * g.noise(s * 0.05, (this.hair || 0) + 700) : 1;
            const pr = this.press ? this.press(t) : 1;
            const fanned = this.offset * (1 + this.fan * (t - 0.5)) * pr;
            const p = this.point(t);
            const x = p.x + p.nx * (fanned + drift);
            const y = p.y + p.ny * (fanned + drift);
            // width follows how firmly the hair is on the paper, so breaks taper
            const press = inside && v > 0 ? Math.min(1, v / 0.07) * Math.max(0, land) * Math.max(0, lift) : 0;
            if (press > 0.08 && prev) {
                const w = this.weight * swell * (0.25 + 0.75 * press) * (0.6 + 0.4 * pr);
                // consecutive pieces of about the same width go down as one path, so the
                // hair has no seams where short translucent segments would meet
                if (run && Math.abs(w - run.w) < run.w * 0.25) { run.pts.push({ x, y }); run.sum += w; }
                else { flush(); run = { w, sum: w, pts: [prev, { x, y }] }; }
            } else flush();
            prev = { x, y };
        }
        flush();
    }
}

export default RockLine;
