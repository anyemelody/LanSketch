// The flower stalks and their flowers, kept as geometry so they can sway and bloom.
//
// Shares the leaves' WebGL context: drawn with one draw call straight onto the leaf
// canvas after the leaves are resolved, so leaves, stalks and flowers reach the picture
// in one copy. Ordinary premultiplied-alpha blending, in the order the lines were given
// (far clumps first; per stalk the stalk, then each flower's pedicel, bud, petals, dots).
//
// Ink of a petal line: the old renderer drew every walker step as a hard-edged, round-
// capped segment (p5 WEBGL, no antialias) with the step's alpha, so a pixel at distance x
// from a line was covered by about 1 + 2*sqrt(r^2 - x^2) / spacing stamps and ends up with
// alpha 1 - (1 - a)^that. That is what the fragment shader works out, averaged over the
// pixel. Stalks, buds, pedicels and dots are plain translucent strokes.
//
// Sway: the same formula and the same kind of damped spring as a leaf (see LeafMesh). A
// stalk vertex at t (0 root .. 1 tip) turns about the stalk base by
//   angle(t) = flex * t^FLEX_POWER * (breeze(time, t) + gust)
// A flower rides its node: its anchor is the stalk point at the node's t turned by
// angle(t), and the whole flower turns rigidly by angle(t) plus a small nod of its own.
//
// Bloom: every petal line grows from the heart, its steps shown up to bloom * steps (each
// petal a little later than the one before); the closed bud fades as the petals come.

import {
    BREEZE_STRENGTH, BREEZE_SPEED, BREEZE_SPEED_SPREAD, BREEZE_WAVE, BREEZE_SECOND, BREEZE_SECOND_SPEED,
    FLEX_REF_LENGTH, FLEX_LENGTH_POWER, FLEX_POWER, GUST_STRENGTH, GUST_RADIUS, GUST_MAX_SPEED, DAMPING_RATIO,
    GUST_FREQ_SHORT, GUST_FREQ_LONG, LENGTH_SHORT, LENGTH_LONG
} from "./LeafMesh";
import { KIND } from "./FlowerStalk";

// ---- tunables ---------------------------------------------------------------------
const STALK_FLEX = 1.3;                  // a stalk is this much floppier than a leaf of the same length
const STALK_DELAY = [2.5, 5];            // s before a stalk starts to grow (the first leaves come first)
const STALK_GROW_PX_PER_SECOND = 34;     // stalk growth speed (leaves grow 40 steps/s)
const BUD_GROW_SECONDS = 1.2;            // a bud swells this long once the stalk has passed its node
const BLOOM_SECONDS = 4;                 // a flower takes this long to open
const PETAL_STAGGER = 0.15;              // the last petal starts this far (in bloom 0..1) after the first
const SELF_OPEN = [1, 2];                // flowers per picture that open by themselves (inclusive)
const SELF_OPEN_DELAY = [2, 5];          // s after their stalk has finished growing
const NOD_AMP = 0.035;                   // rad (~2 deg): a flower's own slight nod on its node
const NOD_LAG = 1.1;                     // rad its nod lags behind the stalk's sway
const NOD_GUST = 0.3;                    // s: after a click a flower also swings with its stalk's speed
const EDGE_SOFTNESS = 0.4;               // half-width (px) of the blur across a line edge (0.4 matched the old hard-edged stamps best)
const AA = 1.0;                          // px of extra ribbon width, room for the soft edge
const MAX_STALKS = 16;
const MAX_FLOWERS = 96;
// -------------------------------------------------------------------------------------

const VERT = `#version 300 es
precision highp float;
in vec2 a_pos;      // stalk: rest position from the base; flower: from its node, rest pose
in vec2 a_anchor;   // flower: its node, from the stalk base
in vec4 a_meta;     // across (signed px), half width, t, step
in vec4 a_col;      // rgb, alpha (straight)
in vec4 a_info;     // stalk, flower (-1 none), kind, steps of the line
in vec2 a_ext;      // stamp density (stamps per px), petal delay | dot: along (px)
uniform vec2 u_res;
uniform vec4 u_stalk[${MAX_STALKS}];   // flex, phase, speed, gust angle
uniform vec4 u_stalkB[${MAX_STALKS}];  // base x, base y, shown length (px), _
uniform vec4 u_flower[${MAX_FLOWERS}]; // bloom, bud growth, nod (rad), _
uniform float u_time, u_breeze, u_wave, u_flexPow, u_second, u_secondSpeed;
out float v_across, v_r, v_step, v_n, v_density, v_ext, v_bloom, v_grow, v_reveal;
flat out int v_kind;
out vec4 v_col;
vec2 rot(vec2 p, float a) { float c = cos(a), s = sin(a); return vec2(c * p.x - s * p.y, s * p.x + c * p.y); }
void main() {
  int si = int(a_info.x + 0.5);
  int fi = int(a_info.y + 0.5);
  vec4 S = u_stalk[si], B = u_stalkB[si];
  float t = a_meta.z;
  float breeze = sin(S.z * u_time + S.y - u_wave * t)
               + u_second * sin(S.z * u_secondSpeed * u_time + 1.7 * S.y - 0.6 * u_wave * t);
  float th = S.x * pow(t, u_flexPow) * (u_breeze * breeze + S.w);
  vec2 p;
  v_bloom = 0.0; v_grow = 1.0;
  if (a_info.y < -0.5) {
    p = rot(a_pos, th);
  } else {
    vec4 F = u_flower[fi];
    p = rot(a_anchor, th) + rot(a_pos, th + F.z);
    v_bloom = F.x; v_grow = F.y;
  }
  p += B.xy;
  vec2 clip = p / u_res * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);   // straight onto the canvas: flip y
  v_across = a_meta.x;
  v_r = a_meta.y;
  v_step = a_meta.w;
  v_n = a_info.w;
  v_density = a_ext.x;
  v_ext = a_ext.y;
  v_reveal = B.z;
  v_kind = int(a_info.z + 0.5);
  v_col = a_col;
}`;

const FRAG = `#version 300 es
precision highp float;
in float v_across, v_r, v_step, v_n, v_density, v_ext, v_bloom, v_grow, v_reveal;
flat in int v_kind;
in vec4 v_col;
uniform float u_halfPx, u_stagger;
out vec4 outColor;
// integral of the chord 2*sqrt(r^2 - x^2) from 0 to x
float F(float x, float r) {
  return x * sqrt(max(r * r - x * x, 0.0)) + r * r * asin(clamp(x / r, -1.0, 1.0));
}
void main() {
  float r = max(v_r, 1e-4);
  float h = u_halfPx;
  float fade = 1.0;
  if (v_kind == ${KIND.DOT}) {
    // a round dot; v_ext is the position along
    fade = smoothstep(0.55, 0.9, v_bloom) * step(0.5, v_grow);
    float d = length(vec2(v_across, v_ext));
    float cov = clamp((r + h - d) / (2.0 * h), 0.0, 1.0);
    float a = v_col.a * cov * fade;
    if (a <= 0.0) discard;
    outColor = vec4(v_col.rgb * a, a);
    return;
  }
  // how far the line is shown (in its own steps), and the px between steps
  float reveal, sp = 1.0;
  if (v_kind == ${KIND.STALK}) {
    reveal = v_reveal;
  } else if (v_kind == ${KIND.PETAL}) {
    reveal = clamp((v_bloom - v_ext) / (1.0 - u_stagger), 0.0, 1.0) * v_n;
    sp = 1.0 / v_density;
  } else {
    reveal = v_grow * v_n;
    sp = 1.0 / max(v_density, 1e-4);
    if (v_kind == ${KIND.BUD}) fade = 1.0 - smoothstep(0.0, 0.4, v_bloom);
  }
  if (reveal <= 0.0 || fade <= 0.0) discard;
  // the growing end is round, as the old round-capped stamps were
  float over = (v_step - reveal) * sp;
  if (over > 0.0) {
    if (over >= r) discard;
    r = sqrt(r * r - over * over);
  }
  float a = clamp(v_across - h, -r, r);
  float b = clamp(v_across + h, -r, r);
  float cov = (b - a) / (2.0 * h);
  if (cov <= 0.0) discard;
  float alpha;
  if (v_kind == ${KIND.PETAL}) {
    // stamps over this pixel: 1 + density * chord, averaged over the covered part
    float K = 1.0 + v_density * (F(b, r) - F(a, r)) / max(b - a, 1e-4);
    alpha = cov * (1.0 - pow(1.0 - v_col.a, K));
  } else {
    alpha = cov * v_col.a;
  }
  alpha *= fade;
  outColor = vec4(v_col.rgb * alpha, alpha);
}`;

function compile(gl, type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
}

const smooth = (x) => x * x * (3 - 2 * x);
const clamp01 = (x) => Math.min(1, Math.max(0, x));

class FlowerMesh {
    // gl: the leaves' WebGL2 context; stalks: from FlowerStalk.planStalks, in draw order
    // rand: () => [0, 1), for phases, delays and which flowers open by themselves
    constructor(gl, width, height, stalks, rand) {
        this.gl = gl;
        this.width = width;
        this.height = height;
        this.stalks = stalks.slice(0, MAX_STALKS);
        this.flowers = [];
        this.stalks.forEach((st, si) => {
            for (const f of st.flowers) {
                if (this.flowers.length >= MAX_FLOWERS) break;
                f.stalk = si;
                f.index = this.flowers.length;
                this.flowers.push(f);
            }
        });
        this.time = 0;
        this.breeze = BREEZE_STRENGTH;   // lan.flowers.breeze = 0 (and nod = 0) for the rest pose
        this.nod = NOD_AMP;
        this.stalkU = new Float32Array(MAX_STALKS * 4);
        this.stalkB = new Float32Array(MAX_STALKS * 4);
        this.flowerU = new Float32Array(MAX_FLOWERS * 4);
        this.springs = this.stalks.map((st) => {
            const len = st.length;
            const k = clamp01((len - LENGTH_SHORT) / (LENGTH_LONG - LENGTH_SHORT));
            const freq = GUST_FREQ_SHORT + (GUST_FREQ_LONG - GUST_FREQ_SHORT) * k;
            const delay = STALK_DELAY[0] + (STALK_DELAY[1] - STALK_DELAY[0]) * rand();
            return {
                flex: STALK_FLEX * Math.pow(len / FLEX_REF_LENGTH, FLEX_LENGTH_POWER),
                phase: rand() * Math.PI * 2,
                speed: BREEZE_SPEED * (1 + (rand() * 2 - 1) * BREEZE_SPEED_SPREAD),
                omega: 2 * Math.PI * freq,
                angle: 0, vel: 0,
                delay,
                done: delay + len / (STALK_GROW_PX_PER_SECOND * st.scale)   // s when fully grown
            };
        });
        for (const f of this.flowers) {
            const sp = this.springs[f.stalk];
            f.budAt = sp.delay + f.arc / (STALK_GROW_PX_PER_SECOND * this.stalks[f.stalk].scale);
            f.openAt = null;
            f.nodPhase = rand() * Math.PI * 2;
            f.bloom = 0;
            f.grow = 0;
        }
        // one or two open by themselves, a few seconds after their stalk is grown
        const openable = this.flowers.filter((f) => f.openable);
        const nSelf = Math.min(openable.length, SELF_OPEN[0] + Math.floor(rand() * (SELF_OPEN[1] - SELF_OPEN[0] + 1)));
        for (let i = 0; i < nSelf; i++) {
            const j = Math.floor(rand() * openable.length);
            const f = openable.splice(j, 1)[0];
            f.openAt = this.springs[f.stalk].done + SELF_OPEN_DELAY[0] + (SELF_OPEN_DELAY[1] - SELF_OPEN_DELAY[0]) * rand();
        }
        this.makeProgram();
        this.buildMesh();
    }

    makeProgram() {
        const gl = this.gl;
        const p = this.program = gl.createProgram();
        gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, VERT));
        gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, FRAG));
        gl.linkProgram(p);
        if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
        this.loc = {};
        for (const n of ['u_res', 'u_stalk', 'u_stalkB', 'u_flower', 'u_time', 'u_breeze', 'u_wave', 'u_flexPow',
            'u_second', 'u_secondSpeed', 'u_halfPx', 'u_stagger']) this.loc[n] = gl.getUniformLocation(p, n);
    }

    buildMesh() {
        const gl = this.gl;
        const FL = 18; // pos2 anchor2 meta4 col4 info4 ext2
        // gather lines in draw order
        const items = [];
        this.stalks.forEach((st, si) => {
            items.push({ line: st.line, si, fi: -1, t: null, anchor: null });
            for (const f of st.flowers) {
                if (f.index === undefined) continue;
                for (const line of f.lines) items.push({ line, si, fi: f.index, t: f.t, anchor: f.anchor });
            }
        });
        let nV = 0, nI = 0;
        for (const { line } of items) {
            if (line.kind === KIND.DOT) { nV += 4; nI += 6; continue; }
            const n = line.widths.length;
            nV += n * 2; nI += (n - 1) * 6;
        }
        const data = new Float32Array(nV * FL);
        const index = new Uint32Array(nI);
        let v = 0, e = 0;
        const put = (x, y, ax, ay, across, r, t, step, col, si, fi, kind, n, dens, ext) => {
            const o = v * FL;
            data[o] = x; data[o + 1] = y; data[o + 2] = ax; data[o + 3] = ay;
            data[o + 4] = across; data[o + 5] = r; data[o + 6] = t; data[o + 7] = step;
            data[o + 8] = col[0]; data[o + 9] = col[1]; data[o + 10] = col[2]; data[o + 11] = col[3];
            data[o + 12] = si; data[o + 13] = fi; data[o + 14] = kind; data[o + 15] = n;
            data[o + 16] = dens; data[o + 17] = ext;
            v++;
        };
        for (const { line, si, fi, t, anchor } of items) {
            const ax = anchor ? anchor.x : 0, ay = anchor ? anchor.y : 0;
            if (line.kind === KIND.DOT) {
                const R = line.r + AA, start = v;
                for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
                    put(line.x + sx * R, line.y + sy * R, ax, ay, sx * R, line.r, t, 0, line.col, si, fi, KIND.DOT, 1, 1, sy * R);
                }
                index.set([start, start + 1, start + 2, start + 1, start + 3, start + 2], e);
                e += 6;
                continue;
            }
            const P = line.pts, n = line.widths.length, start = v;
            for (let k = 0; k < n; k++) {
                const k0 = Math.max(0, k - 1), k1 = Math.min(n - 1, k + 1);
                const tx = P[k1 * 2] - P[k0 * 2], ty = P[k1 * 2 + 1] - P[k0 * 2 + 1];
                const tl = Math.hypot(tx, ty) || 1;
                const nx = -ty / tl, ny = tx / tl;
                const r = line.widths[k] / 2, ext = r + AA;
                const col = line.cols.subarray(k * 4, k * 4 + 4);
                const tt = fi < 0 ? k / (n - 1) : t;
                const dens = typeof line.density === 'number' ? line.density : line.density[k];
                for (const side of [-1, 1]) {
                    put(P[k * 2] + nx * ext * side, P[k * 2 + 1] + ny * ext * side, ax, ay, ext * side, r, tt,
                        line.steps[k], col, si, fi, line.kind, line.n, dens, line.delay || 0);
                }
            }
            for (let k = 0; k < n - 1; k++) {
                const a = start + k * 2;
                index[e++] = a; index[e++] = a + 1; index[e++] = a + 2;
                index[e++] = a + 1; index[e++] = a + 3; index[e++] = a + 2;
            }
        }
        this.indexCount = e;
        this.vertexCount = v;
        this.vao = gl.createVertexArray();
        gl.bindVertexArray(this.vao);
        const vb = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, vb);
        gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
        const attr = (name, size, offset) => {
            const l = gl.getAttribLocation(this.program, name);
            gl.enableVertexAttribArray(l);
            gl.vertexAttribPointer(l, size, gl.FLOAT, false, FL * 4, offset * 4);
        };
        attr('a_pos', 2, 0);
        attr('a_anchor', 2, 2);
        attr('a_meta', 4, 4);
        attr('a_col', 4, 8);
        attr('a_info', 4, 12);
        attr('a_ext', 2, 16);
        const ib = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, index, gl.STATIC_DRAW);
        gl.bindVertexArray(null);
    }

    // a click at canvas (x, y): each stalk is kicked away from the click, less with distance
    gust(x, y) {
        this.springs.forEach((s, i) => {
            const st = this.stalks[i];
            const bx = st.base.x, by = st.base.y, mx = st.mid.x, my = st.mid.y;
            const rx = mx - bx, ry = my - by;
            const rl = Math.hypot(rx, ry) || 1;
            const dx = -ry / rl, dy = rx / rl;
            const ax = mx - x, ay = my - y;
            const dist = Math.hypot(ax, ay);
            const sign = Math.sign(dx * ax + dy * ay) || 1;
            const kick = GUST_STRENGTH * sign * Math.exp(-Math.pow(dist / GUST_RADIUS, 2));
            s.vel = GUST_MAX_SPEED * Math.tanh((s.vel + kick) / GUST_MAX_SPEED);
        });
    }

    // the sway angle of stalk i at t, as the shader computes it
    angle(i, t) {
        const s = this.springs[i];
        const breeze = Math.sin(s.speed * this.time + s.phase - BREEZE_WAVE * t)
            + BREEZE_SECOND * Math.sin(s.speed * BREEZE_SECOND_SPEED * this.time + 1.7 * s.phase - 0.6 * BREEZE_WAVE * t);
        return s.flex * Math.pow(t, FLEX_POWER) * (this.breeze * breeze + s.angle);
    }

    nodAngle(f) {
        const s = this.springs[f.stalk];
        const base =Math.sin(s.speed * this.time + s.phase - BREEZE_WAVE * f.t - NOD_LAG + 0.3 * Math.sin(f.nodPhase));
        return this.nod * base + NOD_GUST * s.vel * (this.nod / NOD_AMP);
    }

    // where flower i's node is drawn now (canvas px), and where its stalk point at that t is
    // (for checking from the console that a flower stays on its node)
    where(i) {
        const f = this.flowers[i], st = this.stalks[f.stalk];
        const th = this.angle(f.stalk, f.t);
        const c = Math.cos(th), s = Math.sin(th);
        const anchor = { x: st.base.x + c * f.anchor.x - s * f.anchor.y, y: st.base.y + s * f.anchor.x + c * f.anchor.y };
        // the stalk's own vertex at that t, from its line
        const L = st.line, n = L.widths.length, k = Math.round(f.t * (n - 1));
        const px = L.pts[k * 2], py = L.pts[k * 2 + 1];
        const th2 = this.angle(f.stalk, k / (n - 1));
        const stalkPt = { x: st.base.x + Math.cos(th2) * px - Math.sin(th2) * py, y: st.base.y + Math.sin(th2) * px + Math.cos(th2) * py };
        return { anchor, stalkPt, rest: { x: st.base.x + f.anchor.x, y: st.base.y + f.anchor.y }, angle: th + this.nodAngle(f) };
    }

    // opens the closed flower nearest to (x, y), if there is one; returns it
    openNearest(x, y) {
        let best = null, bd = Infinity;
        for (const f of this.flowers) {
            if (!f.openable || f.openAt !== null || f.grow < 0.5) continue;
            const w = this.where(f.index).anchor;
            const d = Math.hypot(w.x - x, w.y - y);
            if (d < bd) { bd = d; best = f; }
        }
        if (best) best.openAt = this.time;
        return best;
    }

    update(dt, time) {
        this.time = time;
        dt = Math.min(dt, 0.1);
        const n = Math.max(1, Math.ceil(dt / (1 / 240)));
        const h = dt / n;
        for (const s of this.springs) {
            for (let k = 0; k < n; k++) {
                const acc = -s.omega * s.omega * s.angle - 2 * DAMPING_RATIO * s.omega * s.vel;
                s.vel += acc * h;
                s.angle += s.vel * h;
            }
        }
        for (const f of this.flowers) {
            f.grow = clamp01((time - f.budAt) / BUD_GROW_SECONDS);
            if (f.openAt !== null) f.bloom = smooth(clamp01((time - f.openAt) / BLOOM_SECONDS));
        }
    }

    render() {
        const gl = this.gl, L = this.loc;
        if (!this.indexCount) return;
        this.stalks.forEach((st, i) => {
            const s = this.springs[i];
            this.stalkU.set([s.flex, s.phase, s.speed, s.angle], i * 4);
            const shown = Math.max(0, this.time - s.delay) * STALK_GROW_PX_PER_SECOND * st.scale;
            this.stalkB.set([st.base.x, st.base.y, shown, 0], i * 4);
        });
        for (const f of this.flowers) this.flowerU.set([f.bloom, f.grow, this.nodAngle(f), 0], f.index * 4);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, this.width, this.height);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        gl.useProgram(this.program);
        gl.uniform2f(L.u_res, this.width, this.height);
        gl.uniform4fv(L.u_stalk, this.stalkU);
        gl.uniform4fv(L.u_stalkB, this.stalkB);
        gl.uniform4fv(L.u_flower, this.flowerU);
        gl.uniform1f(L.u_time, this.time);
        gl.uniform1f(L.u_breeze, this.breeze);
        gl.uniform1f(L.u_wave, BREEZE_WAVE);
        gl.uniform1f(L.u_flexPow, FLEX_POWER);
        gl.uniform1f(L.u_second, BREEZE_SECOND);
        gl.uniform1f(L.u_secondSpeed, BREEZE_SECOND_SPEED);
        gl.uniform1f(L.u_halfPx, EDGE_SOFTNESS);
        gl.uniform1f(L.u_stagger, PETAL_STAGGER);
        gl.bindVertexArray(this.vao);
        gl.drawElements(gl.TRIANGLES, this.indexCount, gl.UNSIGNED_INT, 0);
        gl.bindVertexArray(null);
    }
}

export default FlowerMesh;
