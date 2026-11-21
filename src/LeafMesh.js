// The orchid leaves, kept as geometry so they can sway.
//
// At setup every BranchLine walker is run to the end (SingleBranch.bake) and its
// points are kept in leaf-local coordinates (origin = leaf base). Each line becomes a
// ribbon in one static vertex buffer; the whole clump is drawn with one draw call into
// two half-float targets, then one full-screen pass turns that into ink on this
// module's own WebGL canvas, which index.js copies onto the main canvas once per frame.
//
// Ink: the old version stamped every step as a round-capped segment with alpha 1/100
// into an 8-bit layer and copied that layer onto the screen once per leaf each frame.
// Measured on this machine, a point hit by K stamps of channel value C (0..255) ends
// up in the layer with
//   alpha A(K) = 3K (K <= 2 -> 6), 2K + 2 (up to 106), 54 + K (up to 206), then stuck
//   colour d(K) = min(K, C - 49) for C >= 51, else 0       (premultiplied, 0..255)
// because 8-bit rounding stops each channel early. So thin, lone strands come out a
// translucent mid grey, dark lines come out black, and only dense overlaps turn green.
// Pass 1 adds up K (and the colour terms) for every pixel from the ribbons: a ribbon
// pixel at distance x from the centre line is hit by 1 + 2*sqrt(r^2 - x^2) stamps (one
// stamp per px of length), averaged over the pixel. Pass 2 applies the rules above and
// the repeated copies: alpha_final = 1 - (1 - A)^copies, where copies is the number of
// leaves in the clump a strand belongs to (the old loop copied the layer once per leaf),
// averaged over the strands at that pixel by their stamp counts. So a clump looks the
// same however many clumps share the picture.
//
// Smaller clumps: a leaf's points and widths are scaled by its clump scale s after the
// walk, so its stamps are s px apart; a pixel then sees 1/s times as many stamps along
// the strand, which is what the old renderer would have made of the same leaf drawn small.
//
// Sway: a vertex at t (0 root .. 1 tip) of leaf i is turned about the leaf base by
//   angle = flex_i * t^FLEX_POWER * (breeze_i(time, t) + gust_i)
// breeze is two slow sines travelling up the leaf, gust_i is a damped spring kicked by
// clicks. With BREEZE_STRENGTH = 0 and no clicks the leaves are in their rest pose.
// Per-leaf constants (base, flex, phase, speed, scale, copies) and the one per-leaf
// value that changes (the gust angle) live in a small float texture, one column per leaf.

// ---- tunables ---------------------------------------------------------------------
export const GROW_STEPS_PER_SECOND = 40;   // walker steps drawn per second while the leaves grow
const INK_COPIES_PER_LEAF = 1;             // ink strength: 1 = the old look (layer copied once per leaf); higher is more solid
const AA = 1.0;                            // px of extra ribbon width, room for the soft edge
const EDGE_SOFTNESS = 0.3;                 // half-width (px) of the blur across a strand edge; 0.5 = one pixel

export const BREEZE_STRENGTH = 0.018;             // breeze angle (rad) at the tip of a leaf with flex 1
export const BREEZE_SPEED = 1.5;                  // breeze angular speed (rad/s); 1.5 is a ~4 s sway
export const BREEZE_SPEED_SPREAD = 0.15;          // each leaf's speed is BREEZE_SPEED * (1 +/- this)
export const BREEZE_WAVE = 1.6;                   // phase lag (rad) from root to tip, so the sway travels up the leaf
export const BREEZE_SECOND = 0.45;                // size of the second, slower sine relative to the first
export const BREEZE_SECOND_SPEED = 0.43;          // its speed relative to the first (not a simple ratio)

export const FLEX_REF_LENGTH = 600;               // a leaf this many steps long has flex 1
export const FLEX_LENGTH_POWER = 1.0;             // flex = (length / FLEX_REF_LENGTH)^this; long leaves are floppier
export const FLEX_POWER = 1.5;                    // how the bend is spread along the leaf: angle grows as t^this

export const GUST_STRENGTH = 0.22;                // angular kick (rad/s) of a click right on a leaf
export const GUST_RADIUS = 260;                   // px; the kick falls off as exp(-(distance / radius)^2)
export const GUST_MAX_SPEED = 0.25;               // tanh limit on the spring speed (rad/s), so clicks cannot pile up
export const DAMPING_RATIO = 0.25;                // under-damped: swings back a few times and settles
export const GUST_FREQ_SHORT = 0.6;               // natural frequency (Hz) of the shortest leaves
export const GUST_FREQ_LONG = 0.3;                // and of the longest; in between by length
export const LENGTH_SHORT = 160, LENGTH_LONG = 810; // leaf lengths (steps) those two frequencies belong to

const MAX_LEAVES = 256;                    // width of the per-leaf data texture
// -------------------------------------------------------------------------------------

const VERT = `#version 300 es
precision highp float;
in vec2 a_pos;      // rest position, leaf-local
in vec4 a_meta;     // across (signed px from centre line), half width, t, step
in vec3 a_col;
in float a_leaf;
uniform vec2 u_res;
uniform sampler2D u_leafTex;   // per leaf: row 0 base x, base y, flex, phase; row 1 speed, gust angle, scale, copies
uniform float u_time, u_breeze, u_wave, u_flexPow, u_second, u_secondSpeed;
out float v_across, v_r, v_step, v_scale, v_copies;
out vec3 v_col;
void main() {
  int i = int(a_leaf + 0.5);
  vec4 L0 = texelFetch(u_leafTex, ivec2(i, 0), 0);
  vec4 L1 = texelFetch(u_leafTex, ivec2(i, 1), 0);
  float t = a_meta.z;
  float breeze = sin(L1.x * u_time + L0.w - u_wave * t)
               + u_second * sin(L1.x * u_secondSpeed * u_time + 1.7 * L0.w - 0.6 * u_wave * t);
  float th = L0.z * pow(t, u_flexPow) * (u_breeze * breeze + L1.y);
  float c = cos(th), s = sin(th);
  vec2 p = L0.xy + vec2(c * a_pos.x - s * a_pos.y, s * a_pos.x + c * a_pos.y);
  vec2 clip = p / u_res * 2.0 - 1.0;
  gl_Position = vec4(clip.x, clip.y, 0.0, 1.0);   // drawn into a texture: y stays down
  v_across = a_meta.x;
  v_r = a_meta.y;
  v_step = a_meta.w;
  v_col = a_col;
  v_scale = L1.z;
  v_copies = L1.w;
}`;

// pass 1: stamp counts, added up over all ribbons
const FRAG_ACC = `#version 300 es
precision highp float;
in float v_across, v_r, v_step, v_scale, v_copies;
in vec3 v_col;
uniform float u_steps, u_halfPx;
layout(location = 0) out vec4 o0;   // K, eligible K per channel
layout(location = 1) out vec4 o1;   // K * (C - 49) per channel / 64, K * copies / 64
// integral of the chord 2*sqrt(r^2 - x^2) from 0 to x
float F(float x, float r) {
  return x * sqrt(max(r * r - x * x, 0.0)) + r * r * asin(clamp(x / r, -1.0, 1.0));
}
void main() {
  float r = max(v_r, 1e-4);
  // a growing leaf ends in a round cap, as the old round-capped stamps did
  float over = (v_step - u_steps) * v_scale;   // px past the growing end
  if (over > 0.0) {
    if (over >= r) discard;
    r = sqrt(r * r - over * over);
  }
  float a = clamp(v_across - u_halfPx, -r, r);
  float b = clamp(v_across + u_halfPx, -r, r);
  // stamps are v_scale px apart along a scaled-down leaf
  float K = ((b - a) + (F(b, r) - F(a, r)) / v_scale) / (2.0 * u_halfPx);
  if (K <= 0.0) discard;
  vec3 C = v_col * 255.0;
  vec3 e = step(50.5, C);
  o0 = vec4(K, K * e);
  o1 = vec4(K * e * (C - 49.0) / 64.0, K * v_copies / 64.0);
}`;

// pass 2: what the old 8-bit layer and its repeated copies made of those counts
const QUAD_VERT = `#version 300 es
const vec2 P[3] = vec2[3](vec2(-1.0, -1.0), vec2(3.0, -1.0), vec2(-1.0, 3.0));
void main() { gl_Position = vec4(P[gl_VertexID], 0.0, 1.0); }`;

const FRAG_RESOLVE = `#version 300 es
precision highp float;
uniform sampler2D u_t0, u_t1;
uniform float u_copies, u_height;
out vec4 outColor;
void main() {
  ivec2 px = ivec2(gl_FragCoord.x, u_height - gl_FragCoord.y);
  vec4 t0 = texelFetch(u_t0, px, 0);
  float K = t0.x;
  if (K <= 0.0) { outColor = vec4(0.0); return; }
  vec3 E = t0.yzw;
  vec4 t1 = texelFetch(u_t1, px, 0) * 64.0;
  vec3 S = t1.xyz;
  float copies = t1.w / K * u_copies;   // stamp-weighted clump size of the strands here
  float A = K <= 2.0 ? 3.0 * K : (K <= 52.0 ? 2.0 * K + 2.0 : min(54.0 + K, 206.0));
  // where strands overlap, a channel stops at the ink-weighted average level of the strands
  vec3 d = min(E, S / max(E, 1e-4));
  A /= 255.0;
  d /= 255.0;
  float alpha = 1.0 - pow(1.0 - A, copies);
  outColor = vec4(d / A * alpha, alpha);
}`;

function compile(gl, type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
}

class LeafMesh {
    // leaves: [{ base: {x, y} canvas px, length: steps, scale, copies, mid, lines: [{ pts, widths, rgb }] }]
    //   pts and widths are in canvas px (already multiplied by scale); copies = leaves in its clump
    // rand: () => [0, 1), for the per-leaf breeze phase and speed
    constructor(width, height, leaves, rand) {
        this.width = width;
        this.height = height;
        if (leaves.length > MAX_LEAVES) console.warn('LeafMesh: only the first', MAX_LEAVES, 'of', leaves.length, 'leaves are drawn');
        this.leaves = leaves.slice(0, MAX_LEAVES);
        this.canvas = document.createElement('canvas');
        this.canvas.width = width;
        this.canvas.height = height;
        const gl = this.gl = this.canvas.getContext('webgl2', {
            alpha: true, premultipliedAlpha: true, antialias: true, depth: false, stencil: false,
            preserveDrawingBuffer: false
        });
        this.program = this.makeProgram();
        this.buildMesh();
        this.leafCount = this.leaves.length;
        // per-leaf constants and spring state; row 0 of the data texture never changes
        this.leafData = new Float32Array(MAX_LEAVES * 2 * 4);
        this.base = new Float32Array(MAX_LEAVES * 2);
        this.springs = this.leaves.map((leaf, i) => {
            const scale = leaf.scale || 1;
            const len = leaf.length * scale;   // drawn length in px
            this.base[i * 2] = leaf.base.x;
            this.base[i * 2 + 1] = leaf.base.y;
            const k = Math.min(1, Math.max(0, (len - LENGTH_SHORT) / (LENGTH_LONG - LENGTH_SHORT)));
            const freq = GUST_FREQ_SHORT + (GUST_FREQ_LONG - GUST_FREQ_SHORT) * k;
            const s = {
                flex: Math.pow(len / FLEX_REF_LENGTH, FLEX_LENGTH_POWER),
                phase: rand() * Math.PI * 2,
                speed: BREEZE_SPEED * (1 + (rand() * 2 - 1) * BREEZE_SPEED_SPREAD),
                omega: 2 * Math.PI * freq,
                angle: 0,
                vel: 0,
                mid: leaf.mid
            };
            const o0 = i * 4, o1 = (MAX_LEAVES + i) * 4;
            this.leafData.set([leaf.base.x, leaf.base.y, s.flex, s.phase], o0);
            this.leafData.set([s.speed, 0, scale, leaf.copies || this.leaves.length], o1);
            return s;
        });
        this.leafTex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, this.leafTex);
        gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA32F, MAX_LEAVES, 2);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, MAX_LEAVES, 2, gl.RGBA, gl.FLOAT, this.leafData);
        this.steps = 0;
        this.breeze = BREEZE_STRENGTH; // can be changed live, e.g. lan.leaves.breeze = 0 for the rest pose
    }

    makeProgram() {
        const gl = this.gl;
        const link = (vs, fs) => {
            const p = gl.createProgram();
            gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
            gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
            gl.linkProgram(p);
            if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
            return p;
        };
        const p = link(VERT, FRAG_ACC);
        this.resolve = link(QUAD_VERT, FRAG_RESOLVE);
        this.loc = {};
        for (const n of ['u_res', 'u_leafTex', 'u_time', 'u_breeze', 'u_wave', 'u_flexPow', 'u_second',
            'u_secondSpeed', 'u_steps', 'u_halfPx']) {
            this.loc[n] = gl.getUniformLocation(p, n);
        }
        for (const n of ['u_t0', 'u_t1', 'u_copies', 'u_height']) this.loc[n] = gl.getUniformLocation(this.resolve, n);
        // two half-float targets for the stamp counts
        if (!gl.getExtension('EXT_color_buffer_float')) throw new Error('LeafMesh needs EXT_color_buffer_float');
        this.fbo = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
        this.targets = [0, 1].map((k) => {
            const t = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, t);
            gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA16F, this.width, this.height);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
            gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + k, gl.TEXTURE_2D, t, 0);
            return t;
        });
        gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        return p;
    }

    // two vertices per recorded point, offset along the local normal
    buildMesh() {
        const gl = this.gl;
        let nPts = 0, nSegs = 0;
        for (const leaf of this.leaves) for (const line of leaf.lines) {
            const n = line.pts.length / 2;
            nPts += n;
            nSegs += n - 1;
        }
        const FL = 10; // floats per vertex: pos2 meta4 col3 leaf1
        const data = new Float32Array(nPts * 2 * FL);
        const index = new Uint32Array(nSegs * 6);
        let v = 0, e = 0;
        this.leaves.forEach((leaf, li) => {
            for (const line of leaf.lines) {
                const P = line.pts, n = P.length / 2, total = n - 1;
                const start = v;
                for (let k = 0; k < n; k++) {
                    const k0 = Math.max(0, k - 1), k1 = Math.min(n - 1, k + 1);
                    let tx = P[k1 * 2] - P[k0 * 2], ty = P[k1 * 2 + 1] - P[k0 * 2 + 1];
                    const tl = Math.hypot(tx, ty) || 1;
                    const nx = -ty / tl, ny = tx / tl;
                    const r = line.widths[k] / 2;
                    const ext = r + AA;
                    for (const side of [-1, 1]) {
                        const o = v * FL;
                        data[o] = P[k * 2] + nx * ext * side;
                        data[o + 1] = P[k * 2 + 1] + ny * ext * side;
                        data[o + 2] = ext * side;
                        data[o + 3] = r;
                        data[o + 4] = k / total;
                        data[o + 5] = k;
                        data[o + 6] = line.rgb[0];
                        data[o + 7] = line.rgb[1];
                        data[o + 8] = line.rgb[2];
                        data[o + 9] = li;
                        v++;
                    }
                }
                for (let k = 0; k < n - 1; k++) {
                    const a = start + k * 2;
                    index[e++] = a; index[e++] = a + 1; index[e++] = a + 2;
                    index[e++] = a + 1; index[e++] = a + 3; index[e++] = a + 2;
                }
            }
        });
        this.indexCount = e;
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
        attr('a_meta', 4, 2);
        attr('a_col', 3, 6);
        attr('a_leaf', 1, 9);
        const ib = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, index, gl.STATIC_DRAW);
        gl.bindVertexArray(null);
    }

    // a click at canvas (x, y): each leaf is kicked away from the click, less with distance
    gust(x, y) {
        this.springs.forEach((s, i) => {
            const bx = this.base[i * 2], by = this.base[i * 2 + 1];
            const mx = s.mid.x, my = s.mid.y;
            // direction the leaf's middle moves for a positive angle
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

    // dt: seconds since the last frame, time: seconds since start
    update(dt, time) {
        this.time = time;
        this.steps = time * GROW_STEPS_PER_SECOND;
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
    }

    render() {
        const gl = this.gl;
        const L = this.loc;
        gl.viewport(0, 0, this.width, this.height);
        // pass 1: add up stamp counts
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE);
        gl.useProgram(this.program);
        // only the gust angles change: rewrite row 1 of the data texture
        this.springs.forEach((s, i) => { this.leafData[(MAX_LEAVES + i) * 4 + 1] = s.angle; });
        gl.activeTexture(gl.TEXTURE2);
        gl.bindTexture(gl.TEXTURE_2D, this.leafTex);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 1, MAX_LEAVES, 1, gl.RGBA, gl.FLOAT, this.leafData, MAX_LEAVES * 4);
        gl.uniform1i(L.u_leafTex, 2);
        gl.uniform2f(L.u_res, this.width, this.height);
        gl.uniform1f(L.u_time, this.time || 0);
        gl.uniform1f(L.u_breeze, this.breeze);
        gl.uniform1f(L.u_wave, BREEZE_WAVE);
        gl.uniform1f(L.u_flexPow, FLEX_POWER);
        gl.uniform1f(L.u_second, BREEZE_SECOND);
        gl.uniform1f(L.u_secondSpeed, BREEZE_SECOND_SPEED);
        gl.uniform1f(L.u_steps, this.steps);
        gl.uniform1f(L.u_halfPx, EDGE_SOFTNESS * 1024 / this.width);
        gl.bindVertexArray(this.vao);
        gl.drawElements(gl.TRIANGLES, this.indexCount, gl.UNSIGNED_INT, 0);
        gl.bindVertexArray(null);
        // pass 2: turn the counts into ink on the canvas
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.disable(gl.BLEND);
        gl.useProgram(this.resolve);
        this.targets.forEach((t, k) => {
            gl.activeTexture(gl.TEXTURE0 + k);
            gl.bindTexture(gl.TEXTURE_2D, t);
        });
        gl.uniform1i(L.u_t0, 0);
        gl.uniform1i(L.u_t1, 1);
        gl.uniform1f(L.u_copies, INK_COPIES_PER_LEAF);
        gl.uniform1f(L.u_height, this.height);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        return this.canvas;
    }

    // rest-pose position of a leaf's tip on its first line, and where it is drawn now
    // (for checking the sway from the console)
    tip(i) {
        const leaf = this.leaves[i], s = this.springs[i];
        if (!leaf) return null;
        const P = leaf.lines[0].pts, n = P.length / 2;
        const t = 1, th0 = 0;
        const breeze = Math.sin(s.speed * this.time + s.phase - BREEZE_WAVE * t)
            + BREEZE_SECOND * Math.sin(s.speed * BREEZE_SECOND_SPEED * this.time + 1.7 * s.phase - 0.6 * BREEZE_WAVE * t);
        const th = th0 + s.flex * (this.breeze * breeze + s.angle);
        const x = P[(n - 1) * 2], y = P[(n - 1) * 2 + 1];
        const c = Math.cos(th), sn = Math.sin(th);
        return {
            rest: { x: leaf.base.x + x, y: leaf.base.y + y },
            now: { x: leaf.base.x + c * x - sn * y, y: leaf.base.y + sn * x + c * y }
        };
    }
}

export default LeafMesh;
