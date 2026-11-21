import RockLine from "./RockLine";

const W = 1024, H = 1024;
const LEAN_IN = 100;      // anchor this far (px) from the centre: the stone leans toward the centre
const EDGE = 36;          // flecks and strokes stop this far (px) from the left and right edges
const EDGE_BOTTOM = 16;   // and this far from the bottom
const SIDE_MARGIN = 14;   // a stone's feet are squeezed in to keep this far from the side edges
const FOOT_MARGIN = 6;    // and the whole stone is lifted so its foot stays this far above the bottom
const MASS_TOWARD_LEAN = 0.8;   // chance the bigger part of the stone lies toward the lean (the picture's centre)

// ---- stone types: the upper profile of a stone, foot to foot (px at scale 1) ----
// Stones, not peaks: every top is a flat, a dome or a slanted plane, and convex corners
// sharper than CORNER_MIN are chamfered, so nothing narrows to a point.
// odds: relative weight (0 = off). rootH: height of the orchid's ledge or gap above the
// foot (the part of the stone below the roots; capped by the room above the bottom).
// back: how far the stone reaches behind the roots; front: how far toward its mass.
// top: how far the highest part of the top rises above the roots. second: the smaller
// stone's rise (pair: the stone across the gap; stacked: the stone sitting on top).
// needs: px of room below the roots a type needs to be chosen at all.
const TYPES = [
    // rounded-angular boulder: a broad faceted dome
    { name: "boulder", odds: 1, rootH: [45, 80], back: [110, 150], front: [130, 190], top: [25, 60], needs: 40 },
    // slab with a slanted top plane, higher at the front or at the back
    { name: "slab", odds: 1, rootH: [40, 75], back: [110, 150], front: [140, 200], top: [30, 70], needs: 40 },
    // blocky stone with a step: the orchid on the lower ledge, a broad flat or slanting top above
    { name: "block", odds: 0.9, rootH: [45, 95], back: [110, 145], front: [130, 180], top: [40, 85], needs: 45 },
    // two stones leaning together, the orchid in the gap between them
    { name: "pair", odds: 0.8, rootH: [45, 80], back: [120, 160], front: [130, 180], top: [40, 70], second: [32, 58], needs: 45 },
    // a small stone sitting on, or tucked against, the far end of a big one
    { name: "stacked", odds: 0.7, rootH: [45, 80], back: [110, 150], front: [150, 200], top: [15, 40], second: [22, 45], needs: 40 },
    // a block whose top juts out a little on one side, dark under the lip
    { name: "overhang", odds: 0.7, rootH: [45, 85], back: [110, 150], front: [130, 180], top: [30, 65], needs: 45 }
];
const CORNER_MIN = 120;   // degrees: a convex corner of the profile sharper than this is cut off
const ROOT_DEPTH = 12;    // px the profile at the roots sits above the anchor (leaf roots go 8-16 px under topY)
const LIFT_MAX = 40;      // px a stone may be lifted off its anchor to keep its foot on the canvas
const FACET = 0.05;       // the profile's segments are broken into facets bent this much (fraction of their length)

// ---- contour (勾): a few broken dark brush strokes along the profile, never the foot ----
const CONTOUR_COUNT = [4, 7];       // strokes per stone
const CONTOUR_LEN = [45, 130];      // px each
const CONTOUR_GAP = [6, 30];        // px of paper between strokes
const CONTOUR_W = [10, 20];         // px brush width (wider on the shade side, thinner on the light side)
const CONTOUR_OVERSHOOT = 12;       // px a stroke may run on straight past its end
const CONTOUR_TURN = 0.8;           // rad: at a sharper turn of the profile one stroke ends and the next begins
const CONTOUR_LOW = [0.22, 0.4];    // no contour on the lowest part of the stone (fraction of its height): the foot is lost
const CONTOUR_INK = { b: [2, 8], a: [72, 92], dry: 0.28, grain: 0.7 };

// ---- wash (染): pale ink inside the profile, darkest under the ridge and on the shade side, fading out at the foot ----
const WASH = {
    strength: 0.5,        // peak alpha of one layer
    layers: [2, 3],       // overlapping wash layers, each with its own edge
    soft: [1.5, 9],       // px edge softness (crisp to wet-in-wet)
    drop: [-4, 14],       // px a layer's edge sits below the contour (stops short) or above it (bleeds past)
    ridge: 1.4,           // tone just under the ridge (the rest of the inside is much paler)
    ridgeDepth: 34,       // px over which that fades
    shade: 0.5,           // extra tone toward the shade side
    fade: 0.6,            // fraction of the height (from the foot up) over which the wash fades to nothing
    warp: 9,              // px the noise pushes the edge about
    planes: [1, 2],       // paper-white planes left inside
    rootClear: 0.3,       // lighter round the roots so the leaves read through
    res: 0.5              // resolution of the wash buffer (it is smoothed up)
};
const WASH_TIDE = 0.9;              // darker stain line just inside a wash layer's edge (渍印), like the background's; 0 = off

// ---- details (细节): sparse, on top ----
const TEXTURE_COUNT = [2, 5];       // dry texture strokes (皴), following the plane they sit on
const TEXTURE_LEN = [24, 55];       // px
const CLEFT_COUNT = [1, 2];         // dark wet accents in clefts and under overhangs
const MOSS = [2, 6];                // moss dots (苔点) along the ridge
const INNER_EDGE_ODDS = 0.75;        // chance of an inner contour stroke along the edge between the top plane and the front face
const DOUBLE_ODDS = 0.5;            // chance of a second, lighter contour stroke doubling the first on the ridge
// ---- hairs (shared with the flecks) ----
const CLUMP_PULL = 0.4;             // how strongly hairs gather into clumps across the brush (0 = evenly ruled)
const BROAD_HAIR_ODDS = 0.12;       // share of hairs that are much broader than the rest
const BROAD_HAIR = [2.0, 3.2];      // how much broader
const OBLIQUE_PRESS = 1.35;         // steep strokes: hair weight multiplier
const INK = {
    pale: { b: [28, 40], a: [36, 52], dry: 0.7, body: 5, grain: 0.6 },      // trail and slope flecks
    mid: { b: [14, 24], a: [44, 62], dry: 0.5, body: 0, grain: 0.6 },       // the doubling contour
    tex: { b: [8, 18], a: [50, 70], dry: 0.5, body: 0, grain: 0.8 },        // texture strokes
    cleft: { b: [2, 8], a: [68, 86], dry: 0.1, body: 0, grain: 0.4 }        // wet accents in clefts
};

// Small seeded random generator so a rock can be reproduced from its seed.
function mulberry32(a) {
    return function () {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// An ink stone built the way it is painted: a few broken dark contour strokes along an
// angular profile (peak, shoulder, notch; the foot left open), a pale wash inside it that
// is darkest under the ridge and dissolves toward the foot, with a dried stain line at its
// edge, then a few details: dry texture strokes along the planes, dark accents in the
// clefts, moss dots. The orchid roots in a cleft or on a ledge, so its leaves come up from
// behind the stone's edge. Translucent, drawn once. Canvas pixels, origin top left (P2D).
class Rock {
    // opts (all optional, for the smaller clumps further up the slope):
    //   anchor {x, y}: where the orchid roots (default: picked from the seed in the bottom band)
    //   scale: size of the whole stone, strokes and dabs (default 1)
    //   lean: -1 or 1, the side the mass leans to (default: from the seed, toward the centre near an edge)
    constructor(graphic, seed, opts = {}) {
        this.graphic = graphic;
        this.seed = seed;
        this.rand = mulberry32(seed);
        this.scale = opts.scale || 1;
        this.side = this.rand() < 0.5 ? -1 : 1;
        let cx = 512 + this.r(-0.3, 0.3) * W;
        let cy = this.r(H * 2 / 3, H * 7 / 8);
        if (opts.anchor) { cx = opts.anchor.x; cy = opts.anchor.y; }
        // far from the centre, the stone leans back toward it so it is not cut by the edge
        if (cx - W / 2 > LEAN_IN) this.side = -1;
        else if (W / 2 - cx > LEAN_IN) this.side = 1;
        if (opts.lean) this.side = Math.sign(opts.lean);
        this.crevice = { x: cx, y: cy };
        this.plan(cx, cy);
    }

    r(a, b) { return a + (b - a) * this.rand(); }
    rr(range) { return this.r(range[0], range[1]); }
    pick(odds) { return this.rand() < odds; }

    // the profile: key points (u toward the mass, h up from the foot), broken into facets,
    // then placed on the canvas with the roots at the anchor
    plan(cx, cy) {
        const k = this.scale;
        const below = (H - FOOT_MARGIN - cy) / k + LIFT_MAX;
        let ok = TYPES.filter((t) => t.odds > 0 && t.needs <= below);
        if (!ok.length) ok = TYPES.filter((t) => t.odds > 0).sort((p, q) => p.needs - q.needs).slice(0, 1);
        let v = this.rand() * ok.reduce((s, t) => s + t.odds, 0);
        let type = ok[ok.length - 1];
        for (const t of ok) { v -= t.odds; if (v <= 0) { type = t; break; } }
        this.form = { name: type.name };
        const hR = Math.max(28, Math.min(this.rr(type.rootH), below));
        const L = this.rr(type.back), F = this.rr(type.front);
        const tH = this.rr(type.top);
        const key = [];
        const add = (u, h, tag) => key.push({ u, h: Math.max(0, h), tag });
        const name = type.name;
        // which end of a slanted top is higher (slab), which side the second stone is on
        const frontHigh = this.pick(0.6);
        // behind the roots: a blunt back shoulder and a broad back top falling to the ledge
        const hB = name === "slab" && !frontHigh ? hR + tH : name === "pair" ? hR + this.rr(type.second) : hR * this.r(0.85, 1.05);
        add(-L, 0, "foot");
        add(-L * this.r(0.84, 0.92), hB * this.r(0.5, 0.7), "shoulder");
        add(-L * this.r(0.62, 0.74), hB * this.r(0.88, 0.98), "top");
        if (name === "pair") {
            // the back stone's top slants up toward the gap, then its inner wall drops in
            add(-this.r(26, 40), hB, "top");
            add(-this.r(6, 12), hR + (hB - hR) * this.r(0.25, 0.4), "wall");
        } else {
            add(-L * this.r(0.35, 0.45), name === "slab" && !frontHigh ? hR + tH * this.r(0.6, 0.75) : hR * this.r(0.92, 1.02), "top");
            add(-this.r(25, 40), hR + this.r(-3, 4), "ledge");
        }
        add(0, hR, name === "pair" ? "notch" : "root");
        if (name === "boulder") {
            add(this.r(20, 35), hR + this.r(0, 6), "ledge");
            // a broad dome: the top stays high over most of the front part
            add(F * this.r(0.18, 0.26), hR + tH * this.r(0.72, 0.85), "top");
            add(F * this.r(0.4, 0.5), hR + tH, "peak");
            add(F * this.r(0.62, 0.7), hR + tH * this.r(0.9, 1.0), "top");
            add(F * this.r(0.82, 0.88), hR * 0.6 + tH * this.r(0.55, 0.7), "shoulder");
        } else if (name === "slab") {
            add(this.r(20, 35), hR + this.r(0, 5), "ledge");
            if (frontHigh) {
                // one tilted plane rising to the front edge, then a cut corner and the front wall
                add(F * this.r(0.45, 0.55), hR + tH * this.r(0.5, 0.6), "top");
                add(F * this.r(0.78, 0.86), hR + tH, "peak");
                add(F * this.r(0.9, 0.95), hR + tH * this.r(0.6, 0.75), "shoulder");
            } else {
                add(F * this.r(0.4, 0.55), hR + tH * this.r(0.1, 0.25), "top");
                add(F * this.r(0.8, 0.88), hR * this.r(0.65, 0.85), "shoulder");
            }
        } else if (name === "block") {
            const us = this.r(35, 60);
            add(us * 0.55, hR + this.r(-2, 3), "ledge");
            add(us, hR + this.r(2, 6), "notch");
            add(us + this.r(10, 18), hR + tH * this.r(0.75, 0.85), "corner");
            add(us + this.r(26, 40), hR + tH * this.r(0.92, 1.0), "top");
            add(F * this.r(0.78, 0.86), hR + tH * this.r(0.95, 1.12), "peak");
            add(F * this.r(0.92, 0.96), hR + tH * this.r(0.6, 0.75), "shoulder");
        } else if (name === "pair") {
            const t2 = tH;
            add(this.r(6, 12), hR + t2 * this.r(0.25, 0.4), "wall");
            add(this.r(26, 40), hR + t2, "peak");
            add(F * this.r(0.55, 0.65), hR + t2 * this.r(0.8, 0.92), "top");
            add(F * this.r(0.86, 0.92), hR * this.r(0.55, 0.75) + t2 * 0.3, "shoulder");
        } else if (name === "stacked") {
            const t2 = this.rr(type.second);
            add(this.r(20, 35), hR + this.r(0, 5), "ledge");
            add(F * this.r(0.3, 0.4), hR + tH, "top");
            add(F * this.r(0.48, 0.55), hR + tH * this.r(0.85, 1.0), "notch");
            add(F * this.r(0.56, 0.6), hR + tH + t2 * this.r(0.8, 0.9), "top");
            add(F * this.r(0.68, 0.74), hR + tH + t2, "peak");
            add(F * this.r(0.8, 0.84), hR + tH + t2 * this.r(0.85, 0.95), "top");
            add(F * this.r(0.87, 0.9), hR + tH + t2 * this.r(0.35, 0.5), "shoulder");
            add(F * this.r(0.92, 0.96), hR * 0.5 + tH * 0.4, "shoulder");
        } else {
            // overhang: a broad top running out to a lip, a short dark undercut, then the wall
            add(this.r(20, 35), hR + this.r(0, 5), "ledge");
            add(F * this.r(0.3, 0.42), hR + tH * this.r(0.8, 0.92), "top");
            add(F * this.r(0.72, 0.82), hR + tH, "peak");
            add(F * this.r(0.9, 0.94), hR + tH * this.r(0.88, 0.95), "lip");
            add(F * this.r(0.95, 0.97), hR + tH * this.r(0.62, 0.74), "under");
        }
        add(F, 0, "foot");
        // the ground under the roots: within reach of the widest clump the profile stays well above the foot
        const floor = Math.min(hR, 42);
        for (const p of key) if (Math.abs(p.u) <= 95 && p.tag !== "foot") p.h = Math.max(p.h, floor);
        // keep the profile running one way along u
        for (let i = 1; i < key.length; i++) key[i].u = Math.max(key[i].u, key[i - 1].u + 6);
        // facets: long segments bend once or twice, except round the roots (a level ledge)
        const pts = [];
        for (let i = 0; i < key.length - 1; i++) {
            const p = key[i], q = key[i + 1];
            pts.push(p);
            const len = Math.hypot(q.u - p.u, q.h - p.h);
            if (p.tag === "root" || q.tag === "root" || len < 26) continue;
            const n = len > 70 ? 2 : 1;
            for (let j = 1; j <= n; j++) {
                const f = j / (n + 1) + this.r(-0.1, 0.1);
                const off = this.r(-1, 1) * FACET * len;
                const nu = -(q.h - p.h) / len, nh = (q.u - p.u) / len;
                pts.push({ u: p.u + (q.u - p.u) * f + nu * off, h: Math.max(0, p.h + (q.h - p.h) * f + nh * off), tag: "facet" });
            }
        }
        pts.push(key[key.length - 1]);
        // blunt every convex corner sharper than CORNER_MIN: cut it off, twice if need be
        for (let pass = 0; pass < 3; pass++) {
            for (let i = 1; i < pts.length - 1; i++) {
                const p = pts[i], a = pts[i - 1], c = pts[i + 1];
                if (p.tag === "root" || p.tag === "notch") continue;
                const t = (p.u - a.u) / Math.max(1e-6, c.u - a.u);
                if (p.h <= a.h + (c.h - a.h) * t) continue;            // concave: a notch, leave it
                const ax = a.u - p.u, ah = a.h - p.h, cx2 = c.u - p.u, ch = c.h - p.h;
                const ang = Math.acos(Math.max(-1, Math.min(1, (ax * cx2 + ah * ch) / (Math.hypot(ax, ah) * Math.hypot(cx2, ch) || 1)))) * 180 / Math.PI;
                if (ang >= CORNER_MIN) continue;
                const f = 0.3;
                pts.splice(i, 1, { u: p.u + ax * f, h: p.h + ah * f, tag: p.tag }, { u: p.u + cx2 * f, h: p.h + ch * f, tag: "facet" });
                i++;
            }
        }
        // on the canvas: the mass toward the lean, mostly
        const m = this.pick(MASS_TOWARD_LEAN) ? this.side : -this.side;
        const rootY = cy - ROOT_DEPTH * k;
        let P = pts.map((p) => ({ x: cx + m * p.u * k, y: rootY + (hR - p.h) * k, tag: p.tag, h: p.h }));
        if (m < 0) P.reverse();
        // squeeze the feet in from the side edges, lift the stone off the bottom
        const xmin = P[0].x, xmax = P[P.length - 1].x;
        if (xmin < SIDE_MARGIN) { const f = Math.max(0.1, (cx - SIDE_MARGIN) / (cx - xmin)); for (const p of P) if (p.x < cx) p.x = cx - (cx - p.x) * f; }
        if (xmax > W - SIDE_MARGIN) { const f = Math.max(0.1, (W - SIDE_MARGIN - cx) / (xmax - cx)); for (const p of P) if (p.x > cx) p.x = cx + (p.x - cx) * f; }
        let footY = rootY + hR * k;
        const lift = Math.max(0, footY - (H - FOOT_MARGIN));
        for (const p of P) p.y -= lift;
        footY -= lift;
        this.profile = P;
        this.footY = footY;
        this.rootY = rootY - lift;
        this.topYmin = Math.min(...P.map((p) => p.y));
        this.crevice.y = cy - lift;
        this.mass = m;
        this.type = type;
        // the lowest outer point toward the lean (slopeHints and the trail start there)
        const back = this.side > 0 ? P[0] : P[P.length - 1], out = this.side > 0 ? P[P.length - 1] : P[0];
        const foot = { a: { x: back.x, y: footY }, b: { x: out.x, y: footY }, w: 10 * k };
        this.bars = [foot, foot, foot];
    }

    // y of the profile at canvas x (the profile runs left to right)
    profileY(x) {
        const P = this.profile;
        if (x <= P[0].x) return this.footY;
        for (let i = 0; i < P.length - 1; i++) {
            if (x <= P[i + 1].x) {
                const t = (x - P[i].x) / Math.max(1e-6, P[i + 1].x - P[i].x);
                return P[i].y + (P[i + 1].y - P[i].y) * t;
            }
        }
        return this.footY;
    }

    // y of the stone's top at canvas x, for leaf and stalk roots (they go 8-16 px under it).
    // Near the roots it never rises above the ledge, so roots behind a peak sit inside the
    // stone at the ledge's height; and it keeps them above the foot.
    topY(x) {
        const k = this.scale;
        let y = this.profileY(x);
        if (Math.abs(x - this.crevice.x) < 100 * k) y = Math.max(y, this.rootY);
        return Math.min(y, this.footY - 22 * k);
    }

    // height of a canvas y as a fraction of the stone's (0 at the foot, 1 at the top)
    hfrac(y) { return (this.footY - y) / Math.max(1, this.footY - this.topYmin); }

    // ---- wash ----
    // per pixel, at reduced size: each layer is the inside of the noise-pushed profile with
    // a soft cover and a stain line just inside its edge, toned darker under the ridge and
    // toward the shade side, fading out downward; paper-white planes are kept out
    drawWash() {
        const g = this.graphic, k = this.scale;
        const P = this.profile;
        const pad = 24 * k;
        const x0 = Math.floor(P[0].x - pad), x1 = Math.ceil(P[P.length - 1].x + pad);
        const y0 = Math.floor(this.topYmin - pad), y1 = Math.ceil(this.footY + 6 * k);
        const res = WASH.res;
        const bw = Math.max(2, Math.ceil((x1 - x0) * res)), bh = Math.max(2, Math.ceil((y1 - y0) * res));
        const nl = Math.round(g.random(WASH.layers[0], WASH.layers[1] + 0.99));
        // the first layer fills the profile; the others are patches inside it, each with
        // its own stain line, so stain boundaries also show inside the stone
        const layers = [];
        const peaksAll = P.filter((p) => p.tag === "peak");
        for (let j = 0; j < nl; j++) {
            const drop = g.random(WASH.drop[0], WASH.drop[1]) * k * (j === 0 ? 0.5 : 1);
            const sx = g.random(0.94, 1.03), mid = (P[0].x + P[P.length - 1].x) / 2;
            const L = {
                pts: P.map((p) => ({ x: mid + (p.x - mid) * sx, y: p.y + drop })),
                soft: g.random(WASH.soft[0], WASH.soft[1]) * Math.sqrt(k) + 1,
                strength: WASH.strength * (j === 0 ? 1 : g.random(0.6, 1.0)),
                nz: g.random(1000)
            };
            if (j > 0) {
                const pk = peaksAll.length ? peaksAll[Math.floor(g.random(peaksAll.length))] : P[Math.floor(P.length / 2)];
                L.blob = { x: pk.x + g.random(-40, 40) * k, y: pk.y + g.random(25, 60) * k, rx: g.random(40, 90) * k, ry: g.random(30, 65) * k };
            }
            layers.push(L);
        }
        // paper-white planes: a long sliver falling from under a peak
        const planes = [];
        const peaks = P.filter((p) => p.tag === "peak");
        const np = Math.min(peaks.length + 1, Math.round(g.random(WASH.planes[0], WASH.planes[1] + 0.99)));
        for (let j = 0; j < np; j++) {
            const pk = peaks.length ? peaks[j % peaks.length] : P[Math.floor(P.length / 2)];
            const dir = g.random() < 0.5 ? -1 : 1;
            const top = { x: pk.x + dir * g.random(4, 14) * k, y: pk.y + g.random(10, 22) * k };
            const len = (this.footY - top.y) * g.random(0.45, 0.75);
            const lean = dir * g.random(0.15, 0.5);
            const wd = g.random(10, 22) * k;
            planes.push([top, { x: top.x + lean * len + wd, y: top.y + len }, { x: top.x + lean * len - wd * 0.2, y: top.y + len * 1.05 }]);
        }
        // two stones leaning together: a sliver of paper falls from the gap between them
        if (this.form.name === "pair") {
            const gp = P.find((p) => p.tag === "notch");
            if (gp) {
                const len = (this.footY - gp.y) * g.random(0.55, 0.8), wd = g.random(5, 10) * k, lean = g.random(-0.15, 0.15) * len;
                planes.push([{ x: gp.x, y: gp.y + 4 * k }, { x: gp.x + lean + wd, y: gp.y + len }, { x: gp.x + lean - wd, y: gp.y + len }]);
            }
        }
        const shadeSign = this.shadeSign = g.random() < 0.5 ? -1 : 1;
        const peakX = peaks.length ? peaks[peaks.length - 1].x : (P[0].x + P[P.length - 1].x) / 2;
        const halfW = Math.max(40, (P[P.length - 1].x - P[0].x) / 2);
        const off = document.createElement("canvas");
        off.width = bw; off.height = bh;
        const octx = off.getContext("2d");
        const img = octx.createImageData(bw, bh);
        const data = img.data;
        // signed distance to a polyline profile: positive below it (inside)
        const signed = (pts, x, y) => {
            let d = Infinity;
            for (let i = 0; i < pts.length - 1; i++) {
                const a = pts[i], b = pts[i + 1];
                const dx = b.x - a.x, dy = b.y - a.y;
                const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy || 1)));
                d = Math.min(d, Math.hypot(x - a.x - dx * t, y - a.y - dy * t));
            }
            let inside = false;
            if (x > pts[0].x && x < pts[pts.length - 1].x) {
                for (let i = 0; i < pts.length - 1; i++) {
                    if (x >= pts[i].x && x <= pts[i + 1].x) {
                        const t = (x - pts[i].x) / Math.max(1e-6, pts[i + 1].x - pts[i].x);
                        inside = y > pts[i].y + (pts[i + 1].y - pts[i].y) * t;
                        break;
                    }
                }
            }
            return inside ? d : -d;
        };
        const inTri = (tri, x, y) => {
            let s = 0;
            for (let i = 0; i < 3; i++) {
                const a = tri[i], b = tri[(i + 1) % 3];
                s += (b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x) > 0 ? 1 : -1;
            }
            return Math.abs(s) === 3;
        };
        // signed distance to a triangle, positive inside
        const triIns = (tri, x, y) => {
            let d = Infinity;
            for (let i = 0; i < 3; i++) {
                const a = tri[i], b = tri[(i + 1) % 3];
                const dx = b.x - a.x, dy = b.y - a.y;
                const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy || 1)));
                d = Math.min(d, Math.hypot(x - a.x - dx * t, y - a.y - dy * t));
            }
            return inTri(tri, x, y) ? d : -d;
        };
        const rootR = 60 * k;
        for (let py = 0; py < bh; py++) {
            const Y = y0 + (py + 0.5) / res;
            const hf0 = this.hfrac(Y);
            if (hf0 < -0.15) continue;
            for (let px = 0; px < bw; px++) {
                const X = x0 + (px + 0.5) / res;
                const wx = ((g.noise(X * 0.018, Y * 0.018, 3.1) - 0.5) * 2 + (g.noise(X * 0.07, Y * 0.07, 5.3) - 0.5)) * WASH.warp * k;
                const wy = ((g.noise(X * 0.018 + 40, Y * 0.018, 7.7) - 0.5) * 2 + (g.noise(X * 0.07 + 40, Y * 0.07, 9.1) - 0.5)) * WASH.warp * k;
                const broken = smooth(0.38, 0.62, g.noise(X * 0.03, Y * 0.03, 11.3));
                const side = Math.max(0, Math.min(1, (X - peakX) * shadeSign / halfW + 0.3));
                // big soft blotches, and a fine grain where the pigment settles in the paper
                // the fade toward the foot is pushed about too, so the foot dissolves unevenly
                const fade = smooth(0, WASH.fade, hf0 + (g.noise(X * 0.02, Y * 0.01, 41.3) - 0.5) * 0.35);
                if (fade <= 0) continue;
                const blotch = (0.6 + 0.8 * g.noise(X * 0.012, Y * 0.012, 21.5)) * (0.8 + 0.4 * g.noise(X * 0.2, Y * 0.2, 31.7));
                let keep = 1;
                for (const tri of planes) keep = Math.min(keep, 1 - 0.85 * smooth(0, 7 * k, triIns(tri, X + wx, Y + wy)));
                const dr = Math.hypot(X - this.crevice.x, Y - this.rootY);
                const clear = 1 - WASH.rootClear * Math.exp(-(dr * dr) / (rootR * rootR));
                let a = 0;
                for (const L of layers) {
                    const insP = signed(L.pts, X + wx, Y + wy);
                    if (insP <= 0) continue;
                    let ins = insP;
                    if (L.blob) {
                        const B = L.blob;
                        const ex = (X + wx * 1.5 - B.x) / B.rx, ey = (Y + wy * 1.5 - B.y) / B.ry;
                        const ang = Math.atan2(ey, ex);
                        const R = 0.75 + 0.5 * g.noise(Math.cos(ang) * 1.3 + L.nz, Math.sin(ang) * 1.3);
                        ins = Math.min(ins, (R - Math.hypot(ex, ey)) * Math.min(B.rx, B.ry));
                        if (ins <= 0) continue;
                    }
                    const cover = smooth(0, L.soft, ins);
                    const rim = cover * (1 - smooth(0, L.soft * 1.2 + 3 * k, ins));
                    const ridge = Math.exp(-insP / (WASH.ridgeDepth * k));
                    const tone = L.strength * fade * blotch * (0.15 + WASH.ridge * ridge) * (1 + WASH.shade * side);
                    const val = cover * tone * (1 + WASH_TIDE * rim * broken * 3);
                    a = 1 - (1 - a) * (1 - Math.min(1, val));
                }
                a *= keep * clear;
                if (a <= 0.004) continue;
                const o = (py * bw + px) * 4;
                data[o] = 104; data[o + 1] = 102; data[o + 2] = 99;
                data[o + 3] = Math.min(255, a * 255);
            }
        }
        octx.putImageData(img, 0, 0);
        const ctx = g.drawingContext;
        ctx.save();
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(off, x0, y0, bw / res, bh / res);
        ctx.restore();
    }

    // ---- brush along a polyline ----
    // a loaded brush following pts: thick and thin, pressing where the path turns, drier on
    // the straight runs, loaded on the outer (upper) side. loaded: +1 / -1 across the path
    brushPath(pts, w, ink, opts = {}) {
        const g = this.graphic;
        if (pts.length < 2) return;
        const cum = [0];
        for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
        const total = cum[cum.length - 1];
        if (total < 6) return;
        // corners: where the path turns, as t along it, with how sharply
        const corners = [];
        for (let i = 1; i < pts.length - 1; i++) {
            const ax = pts[i].x - pts[i - 1].x, ay = pts[i].y - pts[i - 1].y;
            const bx = pts[i + 1].x - pts[i].x, by = pts[i + 1].y - pts[i].y;
            const turn = Math.abs(Math.atan2(ax * by - ay * bx, ax * bx + ay * by));
            if (turn > 0.3) corners.push({ t: cum[i] / total, s: Math.min(1, turn / 1.1) });
        }
        const nz = g.random(100);
        const press = (t) => {
            let p = 0.6 + 0.5 * Math.min(1, t / 0.06) * (1 - 0.55 * smooth(0.75, 1, t)) + 0.35 * (g.noise(t * 3, nz) - 0.5);
            for (const c of corners) p += 0.6 * c.s * Math.exp(-Math.pow((t - c.t) / 0.05, 2));
            if (t < 0.06) p += 0.4 * (1 - t / 0.06);          // the brush lands with a press
            return Math.max(0.25, p);
        };
        const dryAt = (t) => {
            let near = 1;
            for (const c of corners) near = Math.min(near, Math.abs(t - c.t) / 0.18);
            return (opts.dry === undefined ? 0.1 : opts.dry) * Math.min(1, near) - 0.04 * (1 - Math.min(1, t / 0.1));
        };
        const k = this.scale;
        const n = Math.max(6, Math.round(w * 1.4));
        const loaded = opts.loaded || -1;
        const rowBase = g.random(1000);
        const nc = 2 + Math.floor(g.random(3));
        const clumps = [];
        for (let j = 0; j < nc; j++) clumps.push({ at: g.random(-1, 1), load: g.random(0.7, 1.3) });
        for (let i = 0; i < n; i++) {
            let across = n > 1 ? (i / (n - 1)) * 2 - 1 : 0;
            let near = clumps[0];
            for (const c of clumps) if (Math.abs(c.at - across) < Math.abs(near.at - across)) near = c;
            across += (near.at - across) * CLUMP_PULL * g.random(0.5, 1);
            const edge = (across * loaded + 1) / 2;
            let weight = g.random(0.9, 2.6) * (0.7 + 0.5 * edge) * near.load * Math.sqrt(k);
            if (g.random() < BROAD_HAIR_ODDS) weight *= g.random(BROAD_HAIR[0], BROAD_HAIR[1]);
            weight = Math.min(weight, Math.max(1.5, w / 4));
            new RockLine(g, { pts }, across * w / 2 + g.random(-0.8, 0.8), {
                weight,
                color: this.col(g.random(25, 45), g.random(2, 6), g.random(ink.b[0], ink.b[1]),
                    g.random(ink.a[0], ink.a[1]) * (0.5 + 0.5 * edge) * Math.min(1.15, near.load)),
                dry: ink.dry * g.random(0.85, 1.15),
                grain: ink.grain,
                edge,
                t0: Math.max(0, Math.pow(g.random(), 2) * 0.06),
                t1: 1 - Math.pow(g.random(), 0.7) * 0.12 - (1 - edge) * g.random(0, 0.12),
                row: rowBase + across * 1.1,
                hair: g.random(1000),
                phase: g.random(-14, 14),
                fan: 0,
                press, dryAt
            }).draw();
        }
    }

    // the point at arc length d along the profile
    pointAt(d) {
        const P = this.profile, cum = this.cum;
        let i = 1;
        while (i < cum.length - 1 && cum[i] < d) i++;
        const f = Math.max(0, Math.min(1, (d - cum[i - 1]) / Math.max(1e-6, cum[i] - cum[i - 1])));
        return { x: P[i - 1].x + (P[i].x - P[i - 1].x) * f, y: P[i - 1].y + (P[i].y - P[i - 1].y) * f };
    }

    // the stretch of the profile between arc lengths d0 and d1, nudged off it a little
    run(d0, d1, inset = 0) {
        const P = this.profile, k = this.scale;
        const cum = this.cum;
        const at = (d) => {
            let i = 1;
            while (i < cum.length - 1 && cum[i] < d) i++;
            const f = Math.max(0, Math.min(1, (d - cum[i - 1]) / Math.max(1e-6, cum[i] - cum[i - 1])));
            const a = P[i - 1], b = P[i];
            const l = Math.hypot(b.x - a.x, b.y - a.y) || 1;
            // inward normal (the profile runs left to right; inside is below)
            return { x: a.x + (b.x - a.x) * f - (b.y - a.y) / l * inset, y: a.y + (b.y - a.y) * f + (b.x - a.x) / l * inset };
        };
        const pts = [at(d0)];
        for (let i = 0; i < cum.length; i++) if (cum[i] > d0 && cum[i] < d1) pts.push(at(cum[i]));
        pts.push(at(d1));
        // a slight wobble so the brush does not trace the profile exactly
        const nz = this.graphic.random(100);
        return pts.map((p, i) => ({ x: p.x, y: p.y + (this.graphic.noise(i * 0.7, nz) - 0.5) * 3 * k }));
    }

    drawContour() {
        const g = this.graphic, k = this.scale, P = this.profile;
        this.cum = [0];
        for (let i = 1; i < P.length; i++) this.cum.push(this.cum[i - 1] + Math.hypot(P[i].x - P[i - 1].x, P[i].y - P[i - 1].y));
        const total = this.cum[this.cum.length - 1];
        const peaks = P.filter((p) => p.tag === "peak");
        const peakX = peaks.length ? peaks[peaks.length - 1].x : (P[0].x + P[P.length - 1].x) / 2;
        const shade = this.shadeSign;
        const lowShade = g.random(CONTOUR_LOW[0], CONTOUR_LOW[1]), lowLight = lowShade + 0.2;
        // candidate runs along the profile, separated by gaps of paper
        // sharp turns of the profile: a stroke ends there and the next one starts again a
        // little before it, so corners are pressed, crossed or doubled, never bent round
        const sharp = [];
        for (let i = 1; i < P.length - 1; i++) {
            const ax = P[i].x - P[i - 1].x, ay = P[i].y - P[i - 1].y, bx = P[i + 1].x - P[i].x, by = P[i + 1].y - P[i].y;
            if (Math.abs(Math.atan2(ax * by - ay * bx, ax * bx + ay * by)) > CONTOUR_TURN) sharp.push(this.cum[i]);
        }
        const cands = [];
        let d = g.random(0, 20) * k;
        while (d < total) {
            const len = g.random(CONTOUR_LEN[0], CONTOUR_LEN[1]) * k;
            let d1 = Math.min(total, d + len);
            const cut = sharp.find((c) => c > d + 12 * k && c < d1);
            let next = null;
            if (cut !== undefined) { d1 = cut; next = cut - g.random(-4, 10) * k; }
            // trim the run where it drops into the lost foot
            const ptAt = (dd) => this.pointAt(dd);
            let a = d, b = d1;
            const isShade = (x) => (x - peakX) * shade > 0;
            const low = (dd) => { const p = ptAt(dd); return this.hfrac(p.y) < (isShade(p.x) ? lowShade : lowLight); };
            while (a < b && low(a)) a += 4 * k;
            while (b > a && low(b)) b -= 4 * k;
            if (b - a > 20 * k) {
                const mid = ptAt((a + b) / 2);
                const top = this.hfrac(mid.y) > 0.6;
                const score = (top ? 0.9 : isShade(mid.x) ? 0.75 : 0.3) + g.random(0, 0.5);
                cands.push({ a, b, score, shade: isShade(mid.x), top });
            }
            d = next !== null && g.random() < 0.75 ? next : d1 + g.random(CONTOUR_GAP[0], CONTOUR_GAP[1]) * k;
        }
        const want = Math.round(g.random(CONTOUR_COUNT[0], CONTOUR_COUNT[1] + 0.99));
        const chosen = cands.slice().sort((p, q) => q.score - p.score).slice(0, want);
        this.ridgeRuns = chosen.filter((c) => c.top);
        for (const c of chosen) {
            // run on past the corner at either end, sometimes
            const pts = this.run(c.a, c.b);
            // run on straight past the end, sometimes, as a quick brush does at a corner
            for (const end of [0, 1]) {
                if (g.random() > 0.45 || pts.length < 2) continue;
                const p = end ? pts[pts.length - 1] : pts[0], q = end ? pts[pts.length - 2] : pts[1];
                const l = Math.hypot(p.x - q.x, p.y - q.y) || 1, o = g.random(3, CONTOUR_OVERSHOOT) * k;
                const e = { x: p.x + (p.x - q.x) / l * o, y: p.y + (p.y - q.y) / l * o };
                if (end) pts.push(e); else pts.unshift(e);
            }
            const w = g.random(CONTOUR_W[0], CONTOUR_W[1]) * k * (c.shade ? 1.15 : c.top ? 1 : 0.7);
            this.brushPath(pts, w, CONTOUR_INK, { dry: 0.12 });
        }
        // an inner edge: where the top plane turns down into the front face, a broken stroke
        // a little below the top's outline, so the stone reads as a solid block, not a mound
        if (g.random() < INNER_EDGE_ODDS) {
            let hi = 0;
            for (let i = 1; i < P.length; i++) if (P[i].y < P[hi].y) hi = i;
            let i0 = hi, i1 = hi;
            const isTop = (p) => (p.tag === "top" || p.tag === "peak" || p.tag === "facet") && this.hfrac(p.y) > 0.55;
            while (i0 > 0 && isTop(P[i0 - 1])) i0--;
            while (i1 < P.length - 1 && isTop(P[i1 + 1])) i1++;
            const d0 = this.cum[i0], d1 = this.cum[i1];
            if (d1 - d0 > 40 * k) {
                const a = d0 + (d1 - d0) * g.random(0.05, 0.3), b = d1 - (d1 - d0) * g.random(0.05, 0.3);
                const depth = Math.min(30, (this.footY - this.topYmin) / k * 0.22) * g.random(0.7, 1.1) * k;
                this.brushPath(this.run(a, b, depth), g.random(CONTOUR_W[0], CONTOUR_W[1]) * k * 0.55, CONTOUR_INK, { dry: 0.18 });
            }
        }
        // a second, lighter stroke doubling part of the ridge, a little inside
        if (this.ridgeRuns.length && g.random() < DOUBLE_ODDS) {
            const c = this.ridgeRuns[Math.floor(g.random(this.ridgeRuns.length))];
            const a = c.a + (c.b - c.a) * g.random(0, 0.3), b = c.b - (c.b - c.a) * g.random(0, 0.3);
            this.brushPath(this.run(a, b, g.random(6, 10) * k), g.random(4, 7) * k, INK.mid, { dry: 0.2 });
        }
    }

    // ---- details ----
    // a straight stroke in canvas px for sideBrush
    seg(a, b, w, ink) {
        const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
        const bend = this.graphic.random(-0.06, 0.06) * len;
        const c = { x: (a.x + b.x) / 2 - (b.y - a.y) / len * bend, y: (a.y + b.y) / 2 + (b.x - a.x) / len * bend };
        const bar = { a, b, c, w, ink, dir: Math.sign(b.x - a.x) || 1, len };
        if (Math.abs(b.y - a.y) > Math.abs(b.x - a.x) * 0.58) { bar.thick = true; bar.loaded = 1; }
        return bar;
    }

    // inside the stone, with room to spare above the foot?
    inside(p, margin) { return p.y > this.profileY(p.x) + margin && this.hfrac(p.y) > 0.18 && p.x > this.profile[0].x && p.x < this.profile[this.profile.length - 1].x; }

    drawDetails() {
        const g = this.graphic, k = this.scale, P = this.profile;
        // planes: the flanks either side of each peak, and the ledges
        const flanks = [];
        for (let i = 0; i < P.length; i++) {
            if (P[i].tag !== "peak") continue;
            for (const dir of [-1, 1]) {
                let j = i;
                while (j + dir >= 0 && j + dir < P.length && P[j + dir].y >= P[j].y - 1 && j - i < 4 && i - j < 4) j += dir;
                if (j !== i) flanks.push({ a: P[i], b: P[j] });
            }
        }
        for (let i = 0; i < P.length - 1; i++) {
            const a = P[i], b = P[i + 1];
            if (Math.abs(b.y - a.y) < 0.3 * Math.abs(b.x - a.x) && b.x - a.x > 24 * k && this.hfrac(a.y) > 0.4) flanks.push({ a, b, ledge: true });
        }
        // texture strokes: a few per plane, parallel, following the way the plane runs
        let left = Math.round(g.random(TEXTURE_COUNT[0], TEXTURE_COUNT[1] + 0.99));
        const order = flanks.map((f) => ({ f, s: g.random() + (f.ledge ? 0 : 0.4) })).sort((p, q) => q.s - p.s).map((o) => o.f);
        for (const f of order) {
            if (left <= 0) break;
            const dx = f.b.x - f.a.x, dy = f.b.y - f.a.y, l = Math.hypot(dx, dy) || 1;
            // down the slope (or along a ledge), and inward from it
            let ux = dx / l, uy = dy / l;
            if (uy < 0) { ux = -ux; uy = -uy; }
            const nx = -dy / l, ny = dx / l;
            const inward = ny > 0 ? 1 : -1;
            const count = Math.min(left, 1 + Math.floor(g.random(f.ledge ? 2 : 3)));
            const t0 = g.random(0.15, 0.55), depth = g.random(10, 24) * k;
            for (let j = 0; j < count; j++) {
                const t = t0 + j * g.random(0.12, 0.2);
                const base = { x: f.a.x + dx * t, y: f.a.y + dy * t };
                const dd = depth + j * g.random(6, 12) * k;
                const s = { x: base.x + nx * inward * dd, y: base.y + ny * inward * dd };
                const len = g.random(TEXTURE_LEN[0], TEXTURE_LEN[1]) * k * (f.ledge ? 0.6 : 1);
                const rot = g.random(-0.12, 0.12);
                const ex = ux * Math.cos(rot) - uy * Math.sin(rot), ey = ux * Math.sin(rot) + uy * Math.cos(rot);
                const e = { x: s.x + ex * len, y: s.y + ey * len };
                if (!this.inside(s, 4 * k) || !this.inside(e, 2 * k)) continue;
                this.sideBrush(this.seg(s, e, g.random(5, 9) * k, "tex"), Math.max(5, Math.round(7 * k + 3)));
                left--;
            }
        }
        // dark wet accents in the clefts and under the step
        const clefts = P.filter((p) => p.tag === "notch" || p.tag === "corner" || p.tag === "under" || p.tag === "wall");
        if (!clefts.length) clefts.push(...P.filter((p) => p.tag === "ledge"));
        const nAcc = Math.min(clefts.length, Math.round(g.random(CLEFT_COUNT[0], CLEFT_COUNT[1] + 0.99)));
        for (let j = 0; j < nAcc; j++) {
            const c = clefts[j];
            const s = { x: c.x + g.random(-4, 4) * k, y: c.y + g.random(3, 8) * k };
            const ang = Math.PI / 2 + g.random(-0.35, 0.35);
            const len = g.random(14, 30) * k;
            this.sideBrush(this.seg(s, { x: s.x + Math.cos(ang) * len, y: s.y + Math.sin(ang) * len }, g.random(5, 8) * k, "cleft"),
                Math.max(5, Math.round(6 * k + 3)));
        }
        // moss dots along the ridge, in small clusters
        const ridge = P.filter((p) => this.hfrac(p.y) > 0.55);
        const nm = Math.round(g.random(MOSS[0], MOSS[1] + 0.99));
        for (let j = 0; j < nm && ridge.length; j++) {
            const p = ridge[Math.floor(g.random(ridge.length))];
            this.dab(p.x + g.random(-10, 10) * k, p.y + g.random(-1, 4) * k, g.random(4, 8) * k, g.random(2.5, 4.5) * k,
                g.random(-0.8, 0.8), g.random(4, 10), g.random(72, 90));
        }
    }

    drawDabs() {
        const g = this.graphic;
        const { x } = this.crevice;
        const k = this.scale;
        // one or two dark wet presses where the orchid comes out of the stone
        const n = g.random() < 0.5 ? 1 : 2;
        for (let i = 0; i < n; i++) {
            const dx = (i === 0 ? g.random(-12, 12) : g.random(18, 34) * (g.random() < 0.5 ? -1 : 1)) * k;
            this.dab(x + dx, this.topY(x + dx) + g.random(8, 14) * k, g.random(12, 22) * k, g.random(4, 7) * k,
                g.random(-0.35, 0.35), g.random(4, 9), g.random(78, 90));
        }
    }

    // small detached dabs and flecks trailing off past the outer foot, fading out
    drawTrail() {
        const g = this.graphic;
        const s = this.side;
        const k = this.scale;
        const foot = this.bars[2].b;
        let x = foot.x + s * g.random(6, 20) * k;
        let y = Math.min(foot.y - g.random(0, 10) * k, H - EDGE_BOTTOM);
        const n = Math.floor(g.random(3, 6));
        for (let i = 0; i < n; i++) {
            if (x < 120 || x > W - 120) break;
            const fade = 1 - i / n;
            if (g.random() < 0.35) {
                const len = g.random(14, 30) * k;
                const fleck = this.fit(this.bar(x, x + s * len, y, g.random(5, 9) * k, "pale", g.random(-4, 4) * k));
                this.sideBrush(fleck, 5);
            } else {
                this.dab(x, y, g.random(4, 9) * (0.6 + 0.4 * fade) * k, g.random(2, 4) * k, g.random(-1, 1),
                    g.random(15, 35), 30 + 45 * fade);
            }
            x += s * g.random(8, 40) * k;
            y = Math.min(y + g.random(-6, 14) * k, H - EDGE_BOTTOM);
        }
    }

    // draws everything once into this.graphic; clear = false paints over what is there
    // (several stones share one layer). Wash first, then the contour, then the details.
    draw(clear = true) {
        const g = this.graphic;
        g.randomSeed(this.seed);
        g.noiseSeed(this.seed);
        if (clear) g.clear();
        this.drawWash();
        this.drawContour();
        this.drawDetails();
        this.drawDabs();
        this.drawTrail();
    }

    col(h, s, b, a) { return this.graphic.color(h, s, b, a).toString(); }

    // keep a stroke inside the canvas: clamp it at the side edges, lift it off the bottom
    fit(bar) {
        const lo = EDGE, hi = W - EDGE;
        const cl = (v) => Math.min(hi, Math.max(lo, v));
        // half the width sticks out sideways from a steep stroke
        const sideways = Math.abs(bar.b.y - bar.a.y) > Math.abs(bar.b.x - bar.a.x) ? bar.w / 2 : 0;
        const cls = (v) => Math.min(hi - sideways, Math.max(lo + sideways, v));
        bar.a.x = cls(bar.a.x); bar.b.x = cls(bar.b.x); bar.c.x = cl(bar.c.x);
        const bottom = Math.max(bar.a.y, bar.b.y, (bar.a.y + 2 * bar.c.y + bar.b.y) / 4) + bar.w / 2;
        const dy = bottom - (H - EDGE_BOTTOM);
        if (dy > 0) { bar.a.y -= dy; bar.b.y -= dy; bar.c.y -= dy; }
        bar.len = Math.hypot(bar.b.x - bar.a.x, bar.b.y - bar.a.y);
        bar.dir = Math.sign(bar.b.x - bar.a.x) || 1;
        return bar;
    }

    // a bar: centre line from (x0,y) to (x1,y + rise), bend, width, ink load (canvas px;
    // for the trail and slope flecks)
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

    // one side-brush stroke: many hairs across the width, loaded on one edge, gathered
    // into a few clumps with some broad hairs among the fine ones. strands: a fixed
    // small hair count for flecks (no ink body under them)
    sideBrush(bar, strands) {
        const g = this.graphic;
        const ink = INK[bar.ink];
        // a smaller stone is painted with a smaller brush: fewer, finer hairs
        const k = this.scale;
        // a steep wet stroke (an upright body) is laid fuller, so it reads as a plane, not as rain
        const steepWet = bar.wet && Math.abs(bar.b.y - bar.a.y) > Math.abs(bar.b.x - bar.a.x);
        const perPx = bar.wet ? (steepWet ? 0.9 : 0.5) : bar.thick ? 1.5 : 1;   // hairs per px of width, roughly
        const n = strands || Math.max(8, Math.floor(Math.min(64, bar.w * perPx * g.random(0.85, 1.1))));
        if (!strands && ink.body > 0) this.body(bar, ink.body * (steepWet ? 2 : 1), (ink.b[0] + ink.b[1]) / 2 + 22);
        // which edge carries the ink; the top slab is loaded along its upper edge, where
        // it sits over the ends of the leaves
        const flip = g.random() < 0.5 ? -1 : 1;
        const loaded = bar.loaded || (bar.seat ? -bar.dir : flip);
        const skew = g.random(-0.15, 0.15) * (bar.seat ? 0.25 : 1);   // slant of the brush where it lands (the seat lands square, under the roots)
        const rowBase = g.random(1000);
        const fan = g.random(-0.35, 0.35) * (bar.seat ? 0.2 : 1);   // brush opens or closes along the stroke (the seat hardly)
        const path = { a: bar.a, b: bar.b, c: bar.c };
        // clumps across the brush: centres and how much ink each one holds
        const nc = 3 + Math.floor(g.random(4));
        const clumps = [];
        for (let j = 0; j < nc; j++) clumps.push({ at: g.random(-1, 1), load: g.random(0.65, 1.3) });
        for (let i = 0; i < n; i++) {
            let across = n > 1 ? (i / (n - 1)) * 2 - 1 : 0;
            let near = clumps[0];
            for (const c of clumps) if (Math.abs(c.at - across) < Math.abs(near.at - across)) near = c;
            across += (near.at - across) * CLUMP_PULL * g.random(0.5, 1);
            // a wet stroke keeps its ink right across, drying only near one edge
            const side = across * loaded;
            let edge = bar.wet ? Math.min(1, Math.max(0.1, 1 - (side - 0.35) / 0.65)) : (side + 1) / 2;
            // the seat keeps some ink on its dry side too: the roots sit in its lower half
            if (bar.seat) edge = 0.35 + 0.65 * edge;
            const ragged = Math.pow(g.random(), 0.6);
            let weight = g.random(0.8, 2.8) * (0.7 + 0.5 * edge) * near.load * Math.sqrt(k);
            if (g.random() < BROAD_HAIR_ODDS) weight *= g.random(BROAD_HAIR[0], BROAD_HAIR[1]);
            // the short oblique strokes are pressed harder: a fuller, wetter brush
            if (bar.thick) weight *= OBLIQUE_PRESS;
            weight = Math.min(weight, Math.max(1.5, bar.w / 5));
            const gap = bar.w / Math.max(1, n - 1);
            new RockLine(g, path, across * bar.w / 2 + g.random(-1, 1) * Math.max(1.2, gap), {
                weight,
                color: this.col(g.random(25, 45), g.random(2, 6), g.random(ink.b[0], ink.b[1]),
                    g.random(ink.a[0], ink.a[1]) * (0.45 + 0.55 * edge) * Math.min(1.15, near.load)),
                dry: ink.dry * g.random(0.85, 1.15) * (bar.thick || steepWet ? 0.6 : bar.seat ? 0.5 : 1),
                grain: ink.grain,
                edge,
                t0: Math.max(0, skew * (across + 1) + Math.pow(g.random(), 1.3) * (bar.wet ? 0.14 : 0.1)),
                t1: 1 - ragged * (bar.wet ? 0.22 : bar.seat ? 0.08 : 0.3) - (1 - edge) * g.random(0, 0.15),
                row: rowBase + across * (steepWet ? 0.6 : 1.3),
                hair: g.random(1000),
                runOut: bar.seat ? 0.3 : 1,   // the seat keeps its ink to the end, under the roots
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

    // a few loose pale dabs and dry flecks on the way from this stone to another one,
    // hinting at the slope between them; n is 0..3, kept sparse
    slopeHints(other, n) {
        const g = this.graphic;
        g.randomSeed(this.seed + 17);
        for (let i = 0; i < n; i++) {
            const t = (i + 1) / (n + 1) + g.random(-0.08, 0.08);
            // from the far end of this stone's low slab toward the other stone's
            const a = this.bars[2].b, b = other.bars[2].a;
            const x = a.x + (b.x - a.x) * t + g.random(-20, 20);
            const y = Math.min(H - 24, a.y + (b.y - a.y) * t + g.random(-12, 12));
            if (x < 60 || x > W - 60) continue;
            const k = Math.min(this.scale, other.scale);
            if (g.random() < 0.4) {
                const len = g.random(14, 34) * k;
                const sgn = b.x > a.x ? 1 : -1;
                const fleck = this.fit(this.bar(x, x + sgn * len, y, g.random(5, 8) * k, "pale", g.random(-4, 4) * k));
                this.sideBrush(fleck, 5);
            } else {
                this.dab(x, y, g.random(5, 10) * k, g.random(2, 4) * k, g.random(-0.6, 0.6), g.random(20, 38), g.random(35, 60));
            }
        }
    }

}

export default Rock;
