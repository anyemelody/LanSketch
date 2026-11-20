import RockLine from "./RockLine";

const W = 1024, H = 1024;
const LEAN_IN = 100;      // anchor this far (px) from the centre: the stone leans toward the centre
const EDGE = 36;          // slabs stop this far (px) from the left and right edges
const EDGE_BOTTOM = 16;   // and this far from the bottom

// Small seeded random generator so a rock can be reproduced from its seed.
function mulberry32(a) {
    return function () {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// An ink rock in a few strokes (寥寥数笔): no outline and no fill. A handful of dry
// side-brush bars stacked like slabs, a pale wash under them, a few dark dabs
// where the orchid roots, and some small dots trailing off into the paper.
// Everything is translucent, drawn once. Canvas pixels, origin top left (P2D).
class Rock {
    constructor(graphic, seed) {
        this.graphic = graphic;
        this.seed = seed;
        this.rand = mulberry32(seed);
        // the mass leans to one side of the orchid
        this.side = this.rand() < 0.5 ? -1 : 1;
        // anchor: anywhere in the middle 60% across, and in the bottom band between
        // 1/3 and 1/8 of the height measured from the bottom
        const cx = 512 + this.r(-0.3, 0.3) * W;
        const cy = this.r(H * 2 / 3, H * 7 / 8);
        // far from the centre, the stone leans back toward it so it is not cut by the edge
        if (cx - W / 2 > LEAN_IN) this.side = -1;
        else if (W / 2 - cx > LEAN_IN) this.side = 1;
        this.crevice = { x: cx, y: cy };
        this.bars = this.planBars(cx, cy).map((b) => this.fit(b));
        this.edge = this.buildTop();
    }

    r(a, b) { return a + (b - a) * this.rand(); }

    // keep a bar inside the canvas: shorten it at the side edges, lift it off the bottom
    fit(bar) {
        const lo = EDGE, hi = W - EDGE;
        const cl = (v) => Math.min(hi, Math.max(lo, v));
        bar.a.x = cl(bar.a.x); bar.b.x = cl(bar.b.x); bar.c.x = cl(bar.c.x);
        bar.len = Math.abs(bar.b.x - bar.a.x);
        const bottom = Math.max(bar.a.y, bar.b.y, (bar.a.y + 2 * bar.c.y + bar.b.y) / 4) + bar.w / 2;
        const dy = bottom - (H - EDGE_BOTTOM);
        if (dy > 0) { bar.a.y -= dy; bar.b.y -= dy; bar.c.y -= dy; }
        return bar;
    }

    // a bar: centre line from (x0,y) to (x1,y + rise), bend, width, ink load
    bar(x0, x1, y, w, ink, rise) {
        const s = Math.sign(x1 - x0) || 1;
        const len = Math.abs(x1 - x0);
        const a = { x: x0, y };
        const b = { x: x1, y: y + (rise !== undefined ? rise : this.r(-0.1, 0.12) * len) };
        const c = {
            x: (a.x + b.x) / 2 + this.r(-0.1, 0.1) * len,
            y: (a.y + b.y) / 2 + this.r(-0.08, 0.08) * len
        };
        return { a, b, c, w, ink, dir: s, len };
    }

    planBars(cx, cy) {
        const s = this.side;
        const bars = [];
        // slabs stacked under one another, each a little further toward the lean side,
        // touching or just apart so together they read as one stone
        const below = (b, w) => b.a.y + b.w / 2 + w / 2 + this.r(-4, 10);
        // top slab: the orchid grows out of it
        const t0 = cx - s * this.r(85, 95);
        const w1 = this.r(32, 40);
        const top = this.bar(t0, t0 + s * this.r(170, 180), cy + 10, w1, "dark", this.r(-6, 6));
        bars.push(top);
        // second slab, starting under the orchid and reaching out further
        const w2 = this.r(26, 34);
        const m0 = cx - s * this.r(0, 30);
        const mid = this.bar(m0, m0 + s * this.r(150, 180), below(top, w2), w2, this.rand() < 0.5 ? "dark" : "mid");
        bars.push(mid);
        // third, lowest and furthest, pale
        const w3 = this.r(20, 28);
        const l0 = cx + s * this.r(70, 120);
        bars.push(this.bar(l0, l0 + s * this.r(110, 160), below(mid, w3), w3, "pale"));
        // a short slab on the other side of the orchid, sometimes
        if (this.rand() < 0.65) {
            const o0 = cx - s * this.r(85, 105);
            const w4 = this.r(18, 26);
            bars.push(this.bar(o0, o0 - s * this.r(60, 100), below(top, w4) - this.r(0, 10), w4,
                this.rand() < 0.5 ? "pale" : "mid"));
        }
        return bars;
    }

    // the implied top of the stone, for leaf roots: the upper edge of the top slab,
    // falling away to the other slabs on either side
    buildTop() {
        const pts = [];
        for (const b of this.bars) {
            pts.push({ x: b.a.x, y: b.a.y - b.w / 2 });
            pts.push({ x: b.b.x, y: b.b.y - b.w / 2 });
        }
        pts.sort((p, q) => p.x - q.x);
        // keep the upper envelope only near the top slab, so topY is smooth there
        const top = this.bars[0];
        const lo = Math.min(top.a.x, top.b.x), hi = Math.max(top.a.x, top.b.x);
        const edge = pts.filter((p) => p.x < lo || p.x > hi);
        const n = 6;
        for (let i = 0; i <= n; i++) {
            const t = i / n;
            const u = 1 - t;
            edge.push({
                x: u * u * top.a.x + 2 * u * t * top.c.x + t * t * top.b.x,
                y: u * u * top.a.y + 2 * u * t * top.c.y + t * t * top.b.y - top.w / 2
            });
        }
        edge.sort((p, q) => p.x - q.x);
        return edge;
    }

    // y of the implied stone top at canvas x, so leaf bases can sit in the top slab
    topY(x) {
        const p = this.edge;
        if (x <= p[0].x) return p[0].y;
        for (let i = 0; i < p.length - 1; i++) {
            if (x <= p[i + 1].x) {
                const t = (x - p[i].x) / Math.max(1e-6, p[i + 1].x - p[i].x);
                return p[i].y + (p[i + 1].y - p[i].y) * t;
            }
        }
        return p[p.length - 1].y;
    }

    col(h, s, b, a) { return this.graphic.color(h, s, b, a).toString(); }

    // one dry side-brush bar: many hairs across the width, loaded on one edge
    sideBrush(bar, strands) {
        const g = this.graphic;
        const ink = {
            dark: { b: [5, 12], a: [55, 78], dry: 0.3, body: 8 },
            mid: { b: [14, 24], a: [48, 68], dry: 0.5, body: 6.5 },
            pale: { b: [28, 40], a: [36, 52], dry: 0.7, body: 5 }
        }[bar.ink];
        const n = strands || Math.floor(g.random(28, 40));
        if (!strands) this.body(bar, ink.body, (ink.b[0] + ink.b[1]) / 2 + 22);
        // which edge carries the ink; the top slab is loaded along its upper edge, where
        // it sits over the ends of the leaves
        const flip = g.random() < 0.5 ? -1 : 1;
        const loaded = bar === this.bars[0] ? -bar.dir : flip;
        const skew = g.random(-0.15, 0.15);       // slant of the brush where it lands
        const rowBase = g.random(1000);
        const fan = g.random(-0.35, 0.35);         // brush opens or closes along the stroke
        const path = { a: bar.a, b: bar.b, c: bar.c };
        for (let i = 0; i < n; i++) {
            const across = n > 1 ? (i / (n - 1)) * 2 - 1 : 0;
            const edge = (across * loaded + 1) / 2;
            const ragged = Math.pow(g.random(), 0.6);
            new RockLine(g, path, across * bar.w / 2 + g.random(-1.2, 1.2), {
                weight: g.random(1.0, 3.4) * (0.7 + 0.5 * edge),
                color: this.col(g.random(25, 45), g.random(2, 6), g.random(ink.b[0], ink.b[1]),
                    g.random(ink.a[0], ink.a[1]) * (0.45 + 0.55 * edge)),
                dry: ink.dry * g.random(0.9, 1.1),
                edge,
                t0: Math.max(0, skew * (across + 1) + Math.pow(g.random(), 2) * 0.12),
                t1: 1 - ragged * 0.3 - (1 - edge) * g.random(0, 0.15),
                row: rowBase + across * 1.3,
                phase: g.random(-14, 14),
                fan
            }).draw();
        }
    }

    // a point on a bar's centre curve and its normal
    along(bar, t) {
        const { a, b, c } = bar;
        const u = 1 - t;
        const dx = 2 * u * (c.x - a.x) + 2 * t * (b.x - c.x);
        const dy = 2 * u * (c.y - a.y) + 2 * t * (b.y - c.y);
        const l = Math.hypot(dx, dy) || 1;
        return {
            x: u * u * a.x + 2 * u * t * c.x + t * t * b.x,
            y: u * u * a.y + 2 * u * t * c.y + t * t * b.y,
            nx: -dy / l, ny: dx / l
        };
    }

    // the grey body of ink a side brush leaves under its hairs: one flat translucent
    // band with ragged edges, stopping before the dry tail of the stroke
    body(bar, alpha, bright) {
        const g = this.graphic;
        const ctx = g.drawingContext;
        const n = 16, t1 = g.random(0.6, 0.85), k = g.random(100);
        const edgePts = (side) => {
            const pts = [];
            for (let i = 0; i <= n; i++) {
                const t = 0.02 + (t1 - 0.02) * (i / n);
                const p = this.along(bar, t);
                // narrow where the brush lands and where it runs dry
                const u = (t - 0.02) / (t1 - 0.02);
                const shape = Math.min(1, u / 0.12) * Math.min(1, (1 - u) / 0.35);
                const off = side * bar.w * shape * (0.4 + (g.noise(t * 6, k + side) - 0.5) * 0.4);
                pts.push({ x: p.x + p.nx * off, y: p.y + p.ny * off });
            }
            return pts;
        };
        const pts = [...edgePts(-1), ...edgePts(1).reverse()];
        ctx.fillStyle = this.col(35, 4, bright, alpha);
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (const p of pts) ctx.lineTo(p.x, p.y);
        ctx.closePath();
        ctx.fill();
    }

    // a pale wash patch: an irregular flat blob in two slightly offset layers, with
    // the faintly darker rim that a drying wash leaves
    wash(x0, x1, y, h, alpha) {
        const g = this.graphic;
        const ctx = g.drawingContext;
        const k = g.random(100);
        // the noisy outline reaches about 1.5x the radius plus the layer offset; keep it
        // inside the canvas by narrowing it at the sides and lifting it off the bottom
        {
            const cx = (x0 + x1) / 2;
            const room = Math.min(cx, W - cx) - 12 - 6;
            const rx = Math.min(Math.abs(x1 - x0) / 2, Math.max(8, room / 1.5));
            const s = Math.sign(x1 - x0) || 1;
            x0 = cx - s * rx; x1 = cx + s * rx;
            h = Math.min(h, Math.max(6, (H - 10 - 4 - y) / 1.6));
            y = Math.min(y, H - 14 - h * 1.6);
        }
        for (let layer = 0; layer < 2; layer++) {
            const ox = g.random(-12, 12), oy = g.random(-4, 4);
            const cx = (x0 + x1) / 2 + ox, rx = Math.abs(x1 - x0) / 2;
            const pts = [];
            const n = 40;
            for (let i = 0; i < n; i++) {
                const ang = (i / n) * Math.PI * 2;
                const r = 0.45 + g.noise(Math.cos(ang) * 1.8 + k, Math.sin(ang) * 1.8 + layer * 7) * 1.0;
                // flatter on top, the wash pools along the bottom
                const sy = Math.sin(ang) < 0 ? 0.8 : 1.1;
                pts.push({ x: cx + Math.cos(ang) * rx * r, y: y + oy + Math.sin(ang) * h * r * sy });
            }
            ctx.beginPath();
            ctx.moveTo(pts[0].x, pts[0].y);
            for (const p of pts) ctx.lineTo(p.x, p.y);
            ctx.closePath();
            ctx.fillStyle = this.col(35, 3, 45, alpha * (layer ? 0.7 : 1));
            ctx.fill();
            ctx.lineWidth = 1.2;
            ctx.strokeStyle = this.col(35, 3, 40, alpha * 0.5);
            ctx.stroke();
        }
    }

    // a small angular wet dab, tapered at one end, with a faint bleed under it
    dab(x, y, L, W, ang, bright, alpha) {
        const g = this.graphic;
        const ctx = g.drawingContext;
        const halo = ctx.createRadialGradient(x, y, 0, x, y, L * 1.1);
        halo.addColorStop(0, this.col(35, 4, bright + 20, alpha * 0.1));
        halo.addColorStop(1, this.col(35, 4, bright + 20, 0));
        ctx.fillStyle = halo;
        ctx.beginPath();
        ctx.arc(x, y, L * 1.1, 0, Math.PI * 2);
        ctx.fill();
        // a short brush press: heavy where it lands, tapering where it leaves,
        // with a slight bend and ragged sides
        const bend = g.random(-0.25, 0.25) * W;
        const n = 10, top = [], bot = [];
        for (let i = 0; i <= n; i++) {
            const t = i / n;
            const half = (W / 2) * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.15 + 0.05)), 0.5) * (1.15 - 0.6 * t);
            const xx = -L / 2 + L * t;
            const yy = bend * Math.sin(Math.PI * t);
            top.push([xx, yy - half * g.random(0.8, 1.1)]);
            bot.push([xx, yy + half * g.random(0.8, 1.1)]);
        }
        const pts = [...top, ...bot.reverse()];
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(ang);
        ctx.fillStyle = this.col(35, 4, bright, alpha);
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
    }

    drawWash() {
        const g = this.graphic;
        const [top, mid, low] = this.bars;
        const s = this.side;
        // one wash under the low slab, sometimes a smaller one under the short slab opposite
        const wx = low.a.x + s * g.random(-50, 10);
        this.wash(wx, wx + s * g.random(130, 190), (mid.b.y + low.a.y) / 2 + g.random(0, 10), g.random(18, 26), g.random(5, 8));
        if (g.random() < 0.6) {
            const o = this.bars[3] || top;
            this.wash(o.a.x - s * g.random(0, 20), o.b.x, o.a.y + g.random(4, 14), g.random(12, 18), g.random(5, 8));
        }
    }

    drawBars() {
        for (const b of this.bars) this.sideBrush(b);
    }

    drawDabs() {
        const g = this.graphic;
        const { x } = this.crevice;
        const s = this.side;
        // along the line where the orchid roots, covering where the leaves converge
        const n = Math.floor(g.random(2, 4));
        for (let i = 0; i < n; i++) {
            const dx = (n > 1 ? (i / (n - 1)) * 2 - 1 : 0) * g.random(35, 55) + g.random(-10, 10);
            this.dab(x + dx, this.topY(x + dx) + g.random(12, 18), g.random(18, 28), g.random(6, 9),
                g.random(-0.25, 0.25), g.random(4, 9), g.random(82, 92));
        }
        // one in the gap between the second and third slab
        const mid = this.bars[1];
        this.dab(mid.b.x - s * g.random(10, 30), Math.min(H - 12, mid.b.y + mid.w / 2 + g.random(4, 10)), g.random(10, 16),
            g.random(4, 7), g.random(-0.5, 0.5), g.random(8, 14), g.random(70, 85));
    }

    // small detached dabs and flecks trailing off past the lowest slab, fading out
    drawTrail() {
        const g = this.graphic;
        const s = this.side;
        const low = this.bars[2];
        let x = low.b.x + s * g.random(10, 25);
        let y = Math.min(low.b.y + g.random(-6, 10), H - EDGE_BOTTOM);
        const n = Math.floor(g.random(4, 7));
        for (let i = 0; i < n; i++) {
            if (x < 120 || x > W - 120) break;
            const fade = 1 - i / n;
            if (g.random() < 0.35) {
                // a tiny dry fleck, a few hairs
                const len = g.random(14, 30);
                const fleck = this.fit(this.bar(x, x + s * len, y, g.random(5, 9), "pale", g.random(-4, 4)));
                this.sideBrush(fleck, 5);
            } else {
                this.dab(x, y, g.random(4, 9) * (0.6 + 0.4 * fade), g.random(2, 4), g.random(-1, 1),
                    g.random(15, 35), 30 + 45 * fade);
            }
            x += s * g.random(8, 40);
            y = Math.min(y + g.random(-6, 14), H - EDGE_BOTTOM);
        }
    }

    // draws everything once into this.graphic
    draw() {
        const g = this.graphic;
        g.randomSeed(this.seed);
        g.noiseSeed(this.seed);
        g.clear();
        this.drawWash();
        this.drawBars();
        this.drawDabs();
        this.drawTrail();
    }
}

export default Rock;
