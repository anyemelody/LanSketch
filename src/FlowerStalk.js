// Flower stalks (花葶) and the flowers they carry, as geometry for FlowerMesh.
//
// A stalk rises from its clump's root, behind the stone, leaning to one side and arching
// further over toward its tip, with a slight kink at every node (the zig-zag of a jointed
// stalk). Nodes sit along its upper two thirds; each carries one flower on a very short
// pedicel, on alternating sides, on the outside of the kink. The last one or two nodes
// carry closed buds that never open. Flowers get smaller toward the tip.
//
// The open flowers are hers, unchanged: SingleFlower / SinglePetal / PetalLine are set
// up and every PetalLine is run to the end (PetalLine.bake). The finished flower is
// turned so that her fan of petals faces out from the stalk and scaled down as a whole
// (points and widths); FlowerMesh keeps the stamp density of the original, so a petal
// is inked the way the old renderer inked it, only smaller.
//
// All coordinates are canvas px (y down). A stalk's points are relative to its base; a
// flower's points are relative to its node on the stalk, in the rest pose.

import SingleFlower from "./SingleFlower";

// ---- tunables ---------------------------------------------------------------------
// the low (main) clump flowers freely, the small one up the slope only now and then
const STALKS_LOW = [1, 3];               // stalks on the low clump (inclusive)
const STALKS_HIGH = [0, 1];              // stalks on the clump further up
const STALK_LENGTH = [300, 440];         // px at clump scale 1 (short leaves are 160-420)
const STALK_LEAN = [0.12, 0.42];         // rad from vertical at the root
const STALK_ARCH = [0.35, 0.9];          // rad the stalk turns further over along its length
const STALK_WOBBLE = 0.025;              // rad of slow random wander in its heading
const STALK_WIDTH_BASE = [2.6, 3.8];     // px at the root (times sqrt of clump scale)
const STALK_WIDTH_TIP = 1.0;             // px at the tip
const STALK_HSB = [12, 48, 36];          // muted warm reddish brown (hue 0-360, sat, bright 0-100)
const STALK_ALPHA = 0.78;                // lighter than the leaves
const NODE_DARKEN = 14;                  // brightness drop (0-100) at a node joint
const NODES_LOW = [2, 5];                // nodes per stalk on the low clump (inclusive), one flower each
const NODES_HIGH = [1, 4];               // and on the clump further up
const NODE_START = [0.33, 0.42];         // where the first node sits, as a fraction of the length
const ZIGZAG = [0.15, 0.28];               // rad the stalk kinks at each node
const TIP_BUDS_LOW = [0, 2];             // closed buds at the last nodes of a low stalk: sometimes none
const TIP_BUDS_HIGH = [1, 2];            // a high stalk always ends in a bud or two (it keeps at least one flower)
export const FLOWER_SCALE = [0.5, 0.68];   // flower size on a stalk, relative to her standalone 30-72 px flower
const PETAL_MIN_WIDTH = 1.1;              // px: petal lines are not thinned below this when a flower is scaled down
const FLOWER_TIP_SHRINK = 0.25;           // the flower nearest the tip is this much smaller than the lowest
const FACING = [0.9, 1.35];              // rad between the stalk and the way a flower faces
const FACING_UP = 0.25;                  // and how much that is pulled toward straight up
const PEDICEL = [3, 6];                  // px, the flower's own short stem (times clump scale)
const BUD_LENGTH = 0.55;                 // a bud is this fraction of its flower's petal length
const BUD_HSB = [0, 70, 30];             // bud colour: the flower hue, darker (hue offset, sat, bright)
const BUD_ALPHA = 0.85;
export const HEART_DOTS = true;          // tiny dark red dots at the heart of an open flower
const HEART_DOT_COUNT = [2, 4];          // (inclusive)
const HEART_DOT_HSB = [356, 85, 48];     // dark red
const HEART_DOT_ALPHA = 0.9;
const HEART_DOT_RADIUS = [1.0, 1.5];     // px
const EDGE = 40;                         // px, stalks and flowers stay this far inside the canvas
// -------------------------------------------------------------------------------------

export const KIND = { STALK: 0, PETAL: 1, BUD: 2, DOT: 3, PEDICEL: 4 };

function hsb(h, s, b) {
    s /= 100; b /= 100;
    const f = (n) => {
        const k = (n + h / 60) % 6;
        return b - b * s * Math.max(0, Math.min(k, 4 - k, 1));
    };
    return [f(5), f(3), f(1)];
}

const lerp = (a, b, t) => a + (b - a) * t;

// mean direction of her fan of n petals: petal i is turned map(i, 0, n, -PI, 0.6 PI)
function fanCentre(n) {
    return -Math.PI + (1.6 * Math.PI) * (n - 1) / (2 * n);
}

// a plain ribbon line: points, full widths, rgba, steps (for the growing end)
function ribbon(kind, pts, widths, cols, extra = {}) {
    const n = widths.length;
    const steps = new Float32Array(n);
    for (let k = 0; k < n; k++) steps[k] = k;
    return Object.assign({ kind, pts, widths, cols, steps, n: n - 1, density: 1, delay: 0 }, extra);
}

// the stalk's centre line, rest pose, relative to its base
function walkStalk(R, L, lean, arch, nodeArcs, kinks) {
    const ds = 2;
    const N = Math.ceil(L / ds);
    const pts = new Float32Array((N + 1) * 2);
    const heading = new Float32Array(N + 1);
    let x = 0, y = 0, h = -Math.PI / 2 + lean;
    const turn = Math.sign(lean) || 1;
    let wob = 0, wobV = 0;
    heading[0] = h;
    for (let k = 1; k <= N; k++) {
        const s = k * ds, u = s / L;
        // the arch: more of the turn near the top, as a stalk bends over under its flowers
        h += turn * arch * 2.3 * Math.pow(u, 1.3) * ds / L;
        // a kink at each node, spread over 6 px
        nodeArcs.forEach((a, j) => { if (s > a - 3 && s <= a + 3) h += kinks[j] * ds / 6; });
        // a slow wander
        wobV += (R() - 0.5) * 0.004; wobV *= 0.95;
        wob = Math.max(-STALK_WOBBLE, Math.min(STALK_WOBBLE, wob + wobV));
        x += Math.cos(h + wob) * ds;
        y += Math.sin(h + wob) * ds;
        pts[k * 2] = x; pts[k * 2 + 1] = y;
        heading[k] = h + wob;
    }
    return { pts, heading, ds, N };
}

// her flower, set up and run to the end
function herFlower(g, flowerColor) {
    const f = new SingleFlower(g, g.createVector(0, 0), flowerColor);
    f.setFlower();
    const baked = f.bake();
    baked.nbPetals = f.nbPetals;
    return baked;
}

// turns her baked flower into ribbon lines around (0,0) = the heart, facing angle phi,
// scaled by f. Lines are thinned to about one point per px; the stamp density keeps the
// original spacing, so the ink is the same.
function placeFlower(baked, phi, f, R, stagger) {
    const rho = phi - fanCentre(baked.nbPetals);
    const lines = [];
    // petals open one after another, in a shuffled order
    const order = baked.petals.map((_, i) => i).sort(() => R() - 0.5);
    baked.petals.forEach((petal, pi) => {
        const a = petal.rotate + rho, c = Math.cos(a), s = Math.sin(a);
        const delay = stagger * order.indexOf(pi) / Math.max(1, baked.petals.length - 1);
        for (const line of petal.lines) {
            const n = line.widths.length;
            const stride = Math.max(1, Math.round(0.8 / f));
            const keep = [];
            for (let k = 0; k < n; k += stride) keep.push(k);
            if (keep[keep.length - 1] !== n - 1) keep.push(n - 1);
            const m = keep.length;
            const pts = new Float32Array(m * 2), widths = new Float32Array(m), cols = new Float32Array(m * 4),
                steps = new Float32Array(m), density = new Float32Array(m);
            keep.forEach((k, j) => {
                const x = line.pts[k * 2] * f, y = line.pts[k * 2 + 1] * f;
                pts[j * 2] = c * x - s * y;
                pts[j * 2 + 1] = s * x + c * y;
                // a shrunk flower keeps its lines at least PETAL_MIN_WIDTH wide (where they were that wide
                // to begin with), or the thin middle lines stop covering the gaps between them
                widths[j] = Math.max(line.widths[k] * f, Math.min(line.widths[k], PETAL_MIN_WIDTH));
                cols.set(line.cols.subarray(k * 4, k * 4 + 4), j * 4);
                steps[j] = k;
                // the old stamps were one walker step apart
                const k0 = Math.max(0, k - 1), k1 = Math.min(n - 1, Math.max(k, 1));
                const sp = Math.hypot(line.pts[k1 * 2] - line.pts[k0 * 2], line.pts[k1 * 2 + 1] - line.pts[k0 * 2 + 1]) * f;
                density[j] = 1 / Math.max(sp, 0.05 * f);
            });
            lines.push({ kind: KIND.PETAL, pts, widths, cols, steps, n: n - 1, density, delay });
        }
    });
    return lines;
}

// a closed bud: a slim teardrop of three short lines, darker than the flower (two edges and a body)
function makeBud(len, width, phi, hue, R) {
    const lines = [];
    const c = Math.cos(phi), s = Math.sin(phi);
    const n = Math.max(6, Math.ceil(len / 0.7));
    const col = hsb(((hue + BUD_HSB[0]) % 360 + 360) % 360, BUD_HSB[1], BUD_HSB[2]);
    [-1, 0, 1].forEach((side, i) => {
        const amp = side * width * 0.5 * lerp(0.85, 1.1, R());
        const pow = lerp(0.6, 0.8, R());
        const pts = new Float32Array((n + 1) * 2), widths = new Float32Array(n + 1), cols = new Float32Array((n + 1) * 4);
        for (let k = 0; k <= n; k++) {
            const u = k / n;
            const x = u * len, y = Math.sin(Math.PI * Math.pow(u, pow)) * amp;
            pts[k * 2] = c * x - s * y;
            pts[k * 2 + 1] = s * x + c * y;
            // the outer two lines draw the edges; the middle one is as wide as the bud, a body of ink
            widths[k] = i === 1 ? Math.max(0.6, width * 0.8 * Math.sin(Math.PI * Math.pow(u, pow))) : lerp(1.7, 0.6, u);
            const dark = 1 - 0.25 * u;
            cols.set([col[0] * dark, col[1] * dark, col[2] * dark, BUD_ALPHA * lerp(0.8, 1, u) * (i === 1 ? 0.6 : 1)], k * 4);
        }
        lines.push(ribbon(KIND.BUD, pts, widths, cols));
    });
    return lines;
}

// tiny dark red dots at the heart, a little toward the way the flower faces
function makeDots(phi, f, R) {
    const n = Math.floor(lerp(HEART_DOT_COUNT[0], HEART_DOT_COUNT[1] + 1, R()));
    const col = hsb(...HEART_DOT_HSB);
    const c = Math.cos(phi), s = Math.sin(phi);
    const k = Math.max(0.7, f / 0.5);
    const dots = [];
    for (let i = 0; i < n; i++) {
        const a = lerp(1.2, 3.6, R()) * k, b = lerp(-2.2, 2.2, R()) * k;
        const r = lerp(HEART_DOT_RADIUS[0], HEART_DOT_RADIUS[1], R()) * Math.sqrt(k);
        dots.push({ kind: KIND.DOT, x: c * a - s * b, y: s * a + c * b, r, col: [...col, HEART_DOT_ALPHA] });
    }
    return dots;
}

// One clump's stalks. clump: { base: {x, y} (root centre), scale, rock }, R: () => [0, 1),
// g: a p5 graphic in HSB mode for her flower code, flowerColor: hue for the picture.
// first: true for the main clump. Returns stalks for FlowerMesh.
export function planStalks(clump, R, g, flowerColor, first) {
    const range = first ? STALKS_LOW : STALKS_HIGH;
    const count = Math.floor(lerp(range[0], range[1] + 1, R()));
    const sc = clump.scale;
    const stalks = [];
    let lastSide = R() < 0.5 ? -1 : 1;
    for (let si = 0; si < count; si++) {
        // neighbouring stalks on one clump lean to different sides
        const side = si % 2 === 0 ? lastSide : -lastSide;
        const st = buildStalk(clump, R, g, flowerColor, side, first);
        if (st) stalks.push(st);
    }
    return stalks;
}

function buildStalk(clump, R, g, flowerColor, side0, low) {
    const sc = clump.scale;
    const rock = clump.rock;
    // a few tries: shorter or leaning the other way if it would leave the canvas
    for (let attempt = 0; attempt < 8; attempt++) {
        const side = attempt % 2 === 0 ? side0 : -side0;
        const bx = rock.crevice.x + lerp(-40, 40, R()) * sc;
        const by = rock.topY(bx) + lerp(10, 16, R()) * sc;
        const L = lerp(STALK_LENGTH[0], STALK_LENGTH[1], R()) * sc * (1 - attempt * 0.06);
        // the whole clump grows at a slant, and the stalk with it
        const lean = Math.max(-1.0, Math.min(1.0, side * lerp(STALK_LEAN[0], STALK_LEAN[1], R()) + (clump.tilt || 0)));
        const arch = lerp(STALK_ARCH[0], STALK_ARCH[1], R());
        const nodeRange = low ? NODES_LOW : NODES_HIGH;
        const nNodes = Math.floor(lerp(nodeRange[0], nodeRange[1] + 1, R()));
        const start = lerp(NODE_START[0], NODE_START[1], R());
        // nodes closer together toward the tip; the last one is the tip itself
        const nodeArcs = [];
        let acc = 0;
        const gaps = [];
        for (let j = 0; j < nNodes - 1; j++) { gaps.push(1 - 0.35 * j / Math.max(1, nNodes - 2)); acc += gaps[j]; }
        let a = start * L;
        nodeArcs.push(a);
        for (let j = 0; j < nNodes - 1; j++) { a += gaps[j] / acc * (L - start * L); nodeArcs.push(Math.min(a, L)); }
        nodeArcs[nNodes - 1] = L;
        // each flower picks its own side; the stalk kinks away from it
        const flowerSide = nodeArcs.map(() => (R() < 0.5 ? -1 : 1));
        const kinks = nodeArcs.map((_, j) => -flowerSide[j] * lerp(ZIGZAG[0], ZIGZAG[1], R()));
        const walk = walkStalk(R, L, lean, arch, nodeArcs, kinks);
        // inside the canvas?
        let ok = true;
        for (let k = 0; k <= walk.N; k++) {
            const x = bx + walk.pts[k * 2], y = by + walk.pts[k * 2 + 1];
            if (x < EDGE + 30 || x > 1024 - EDGE - 30 || y < EDGE + 30) { ok = false; break; }
        }
        if (!ok && attempt < 7) continue;
        return assemble(clump, R, g, flowerColor, { bx, by, L, walk, nodeArcs, flowerSide, low });
    }
    return null;
}

function assemble(clump, R, g, flowerColor, p) {
    const sc = clump.scale;
    const { walk, nodeArcs, flowerSide, L } = p;
    const N = walk.N;
    // the stalk ribbon
    const w0 = lerp(STALK_WIDTH_BASE[0], STALK_WIDTH_BASE[1], R()) * Math.sqrt(sc);
    const widths = new Float32Array(N + 1), cols = new Float32Array((N + 1) * 4), steps = new Float32Array(N + 1);
    const base = hsb(...STALK_HSB);
    let bn = 0;
    for (let k = 0; k <= N; k++) {
        const s = Math.min(k * walk.ds, L), u = s / L;
        let near = 0;
        for (const a of nodeArcs) near = Math.max(near, 1 - Math.abs(s - a) / 4);
        widths[k] = lerp(w0, STALK_WIDTH_TIP, Math.pow(u, 0.8)) + 0.5 * Math.max(0, near);
        bn += (R() - 0.5) * 0.6; bn *= 0.97;     // a little unevenness in the ink along the stroke
        const dark = (Math.max(0, near) * NODE_DARKEN + bn) / 100;
        const k2 = Math.max(0.3, 1 - dark / (STALK_HSB[2] / 100));
        cols.set([base[0] * k2, base[1] * k2, base[2] * k2, Math.min(1, STALK_ALPHA * (1 + 0.4 * Math.max(0, near)))], k * 4);
        steps[k] = s;
    }
    const stalkLine = { kind: KIND.STALK, pts: walk.pts, widths, cols, steps, n: L, density: 1, delay: 0 };
    const at = (s) => {
        const k = Math.min(N, Math.round(s / walk.ds));
        return { x: walk.pts[k * 2], y: walk.pts[k * 2 + 1], h: walk.heading[k], t: k / N };
    };
    // flowers
    const budRange = p.low ? TIP_BUDS_LOW : TIP_BUDS_HIGH;
    const nTip = Math.min(nodeArcs.length - 1, Math.floor(lerp(budRange[0], budRange[1] + 1, R())));
    const flowers = [];
    const nOpen = nodeArcs.length - nTip;
    nodeArcs.forEach((arc, j) => {
        const node = at(arc);
        const side = flowerSide[j];
        const tipBud = j >= nOpen;
        const fs = lerp(FLOWER_SCALE[0], FLOWER_SCALE[1], R()) * sc * (1 - FLOWER_TIP_SHRINK * j / Math.max(1, nodeArcs.length - 1));
        let phi = node.h + side * (tipBud ? lerp(0.25, 0.5, R()) : lerp(FACING[0], FACING[1], R()));
        // pull toward up (angles in (-PI, PI], up is -PI/2)
        let d = -Math.PI / 2 - phi;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        phi += d * (tipBud ? FACING_UP * 0.5 : FACING_UP);
        const ped = lerp(PEDICEL[0], PEDICEL[1], R()) * sc;
        const hx = Math.cos(phi) * ped, hy = Math.sin(phi) * ped;
        const lines = [];
        // pedicel, in the stalk's colour
        const pn = Math.max(3, Math.ceil(ped / 0.8));
        const ppts = new Float32Array((pn + 1) * 2), pw = new Float32Array(pn + 1), pc = new Float32Array((pn + 1) * 4);
        for (let k = 0; k <= pn; k++) {
            ppts[k * 2] = hx * k / pn; ppts[k * 2 + 1] = hy * k / pn;
            pw[k] = lerp(1.3, 1.0, k / pn);
            pc.set([base[0] * 0.85, base[1] * 0.85, base[2] * 0.85, STALK_ALPHA], k * 4);
        }
        lines.push(ribbon(KIND.PEDICEL, ppts, pw, pc));
        // her flower (also made for buds, so the random sequence does not depend on which is which)
        const baked = herFlower(g, flowerColor);
        const petalLen = baked.size * fs;
        const budLen = Math.max(6, petalLen * BUD_LENGTH * (tipBud ? 0.8 : 1));
        const bud = makeBud(budLen, budLen * 0.36, phi, flowerColor, R);
        const shift = (ls) => ls.forEach((l) => { for (let k = 0; k < l.pts.length; k += 2) { l.pts[k] += hx; l.pts[k + 1] += hy; } });
        shift(bud);
        lines.push(...bud);
        if (!tipBud) {
            const petals = placeFlower(baked, phi, fs, R, 0.15);
            shift(petals);
            lines.push(...petals);
            if (HEART_DOTS) for (const dot of makeDots(phi, fs, R)) { dot.x += hx; dot.y += hy; lines.push(dot); }
        }
        flowers.push({ t: node.t, arc, anchor: { x: node.x, y: node.y }, openable: !tipBud, lines, size: petalLen });
    });
    const m = at(L * 0.5);
    return {
        base: { x: p.bx, y: p.by },
        length: L,
        scale: sc,
        mid: { x: p.bx + m.x, y: p.by + m.y },
        line: stalkLine,
        flowers
    };
}
