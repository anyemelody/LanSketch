#ifdef GL_ES
precision mediump float;
#endif

#define _PerlinPrecision 8.0;
#define _PerlinOctaves 8.0;
#define _PerlinSeed 0.0;

uniform vec2 u_resolution;
uniform float u_time;

float rnd(vec2 xy) {
    return fract(sin(dot(xy, vec2(12.9898 - 0.0, 78.233 + 0.0))) * (43758.5453 + 0.0));
}
float inter(float a, float b, float x) {
    //return a*(1.0-x) + b*x; // Linear interpolation
    float f = (1.0 - cos(x * 3.1415927)) * 0.5; // Cosine interpolation
    return a * (1.0 - f) + b * f;
}
// the same value noise as before, in three depths: the fine octaves cost a lot and only show at sharp edges
float perlin(vec2 uv) {
    float t = _PerlinPrecision;					// Precision
    float p = 0.0;								// Final heightmap value
    float weight = 0.6597540;               // 1 / 2^0.6, halves every octave
    for(int i = 0; i < 6; i++) {
        vec2 lo = floor(t * uv) / t;
        vec2 hi = ceil(t * uv) / t;
        float a = rnd(lo);                      //	a----b
        float b = rnd(vec2(hi.x, lo.y));        //	|    |
        float c = rnd(vec2(lo.x, hi.y));        //	c----d
        float d = rnd(hi);
        if(hi.x == 1.0) {
            b = rnd(vec2(0.0, lo.y));
            d = rnd(vec2(0.0, hi.y));
        }
        // Cosine interpolation
        vec2 f = (1.0 - cos(fract(t * uv) * 3.1415927)) * 0.5;
        p += mix(mix(a, b, f.x), mix(c, d, f.x), f.y) * weight;
        weight *= 0.5;
        t *= 2.0;
    }
    return p;
}

float perlinSoft(vec2 uv) {
    float t = _PerlinPrecision;					// Precision
    float p = 0.0;								// Final heightmap value
    float weight = 0.6597540;               // 1 / 2^0.6, halves every octave
    for(int i = 0; i < 4; i++) {
        vec2 lo = floor(t * uv) / t;
        vec2 hi = ceil(t * uv) / t;
        float a = rnd(lo);                      //	a----b
        float b = rnd(vec2(hi.x, lo.y));        //	|    |
        float c = rnd(vec2(lo.x, hi.y));        //	c----d
        float d = rnd(hi);
        if(hi.x == 1.0) {
            b = rnd(vec2(0.0, lo.y));
            d = rnd(vec2(0.0, hi.y));
        }
        // Cosine interpolation
        vec2 f = (1.0 - cos(fract(t * uv) * 3.1415927)) * 0.5;
        p += mix(mix(a, b, f.x), mix(c, d, f.x), f.y) * weight;
        weight *= 0.5;
        t *= 2.0;
    }
    return p;
}

vec3 hsv2rgb(vec3 c) {
    vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

float remap(float value, float min1, float max1, float min2, float max2) {
    return min2 + (value - min1) * (max2 - min2) / (max1 - min1);
}

// ---- tunables -------------------------------------------------------------
// set from the page (the sliders in index.js); u_tuned stays 0 until they are, and the defaults below apply
uniform float u_tuned;
uniform float u_ink;     // INK_STRENGTH: how dark the wash gets where the layers pile up
uniform float u_bleed;   // BLEED: how far the ink creeps along the paper fibres (feathered edges)
uniform float u_tide;    // TIDE: extra pigment left along the edge of each wash as it dries
uniform float u_grain;   // GRAIN: pigment settling into the paper grain
uniform float u_tint;    // TINT: 0 = pure grey ink, 1 = the full drifting colour
// ---------------------------------------------------------------------------

void main() {
    vec2 uv = gl_FragCoord.xy / u_resolution.xy;
    float seed = u_time * 0.01;
    bool tuned = u_tuned > 0.5;
    float INK_STRENGTH = tuned ? u_ink : 0.7;
    float BLEED = tuned ? u_bleed : 0.07;
    float TIDE = tuned ? u_tide : 2.0;
    float GRAIN = tuned ? u_grain : 0.3;
    float TINT = tuned ? u_tint : 0.8;

    //ink bleeds unevenly into wet paper: push the coordinates around with noise before laying the washes
    vec2 creep = vec2(perlinSoft((uv + vec2(3.1, seed * 0.5)) * 0.45), perlinSoft((uv + vec2(7.7, 1.3 - seed * 0.5)) * 0.45)) - 0.62;
    vec2 wuv = uv + creep * BLEED;

    float noise_scale = remap(sin(seed), -1., 1., 0.1, 0.5); //smaller value, larger size

    const float loop = 12.;
    float pigment = 0.;
    vec3 tint = vec3(0.);
    float tintWeight = 0.;
    for(float i = 0.; i < loop; i++) {
        float xRange = remap(cos(seed - i * 0.5), -1., 1., 0., 1.);
        float yRange = remap(sin(seed + i * 1.), -1., 1., 0.2, 0.8);
        float r = length(wuv - vec2(xRange, yRange)); //r controls the pos
        float h = (noise_scale + i * 0.1) * perlin((wuv + i * 0.1) * 0.2) + r;
        //each wash has its own edge: some were laid on wet paper and fade out, some dried with a sharp rim
        float soft = mix(0.015, 0.22, rnd(vec2(i, 3.7)));
        float inside = 0.8 - h;
        float cover = smoothstep(0., soft, inside);
        //tide line: pigment gathers just inside the edge
        float rim = cover * (1. - smoothstep(0., soft * 1.5 + 0.02, inside));
        float layer = cover * (1. + TIDE * rim);
        pigment += layer / loop;

        float hue = (h + i) * 0.2 + seed;
        tint += hsv2rgb(vec3(hue, 0.45, 0.62)) * layer;
        tintWeight += layer;
    }
    tint /= max(tintWeight, 0.0001);

    //granulation: the pigment sits unevenly in the tooth of the paper
    float tooth = perlinSoft(uv * 6.) / 1.24;
    float fine = rnd(floor(gl_FragCoord.xy * 0.5));
    pigment *= 1. + GRAIN * ((tooth - 0.5) * 1.6 + (fine - 0.5) * 0.25);

    vec3 ink = mix(vec3(0.42, 0.42, 0.4), tint, TINT);
    vec3 paper = vec3(0.985, 0.98, 0.965);
    float amount = clamp(INK_STRENGTH * pow(max(pigment, 0.), 1.25), 0., 1.);
    //ink on paper darkens it like a glaze rather than covering it
    vec3 col = paper * mix(vec3(1.), ink, amount);
    gl_FragColor = vec4(col, 1.);
}

// vec2 uv = gl_FragCoord.xy / u_resolution.xy;
//     // uv = uv-vec2(0.5);
//     float seed = u_time * 0.01;
//     float r = length(uv - vec2(0.5, 0.5));//r controls the pos

//     //the scale size of each color layer, -1. larger
//     float noise_scale = remap(sin(seed), -1., 1., -1., -0.1);
//     vec3 c = hsv2rgb(vec3(0.573, 0.800, 0.534));
//     vec4 fg_col = vec4(c, 1.000);
//     vec4 bg = vec4(1.0);

//     float v = 0.;
//     const float loop = 15.;
//     float hue = perlin(vec2(seed)); //color
//     float saturate = 0.2;
//     float brightness = 0.2;
//     for(float i = 0.; i < loop; i++) {
//         //move horizontal range
//         float xRange = remap(sin(u_time * 0.1 + i * 1.), -1., 1., 0., 1.);
//         // move vertical range
//         float yRange = remap(sin(u_time * 0.1 + i * 0.5), -1., 1., 0., 1.0);
//         r = length(uv - vec2(xRange, yRange));
//         float h = (noise_scale + i * 0.2) * perlin(uv + vec2(i + seed)) + r;
//         // uv.x += i;
//         hue += perlin(uv * 0.002);
//         saturate = pow(h, 3.) * 0.2;
//         brightness = 1. - pow(h, 3.) * 0.2;
//         c = hsv2rgb(vec3(hue, saturate, brightness));
//         fg_col = vec4(c, 1.000);
//         if(h < 0.1) { //larger value, larger color area
//             v += 1. / (loop * 1.00);
//         }
//     }

//     gl_FragColor = mix(bg, fg_col, v);