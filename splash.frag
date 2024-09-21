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
float perlin(vec2 uv) {
    float a, b, c, d, coef1, coef2, t, p;

    t = _PerlinPrecision;					// Precision
    p = 0.0;								// Final heightmap value

    for(float i = 0.0; i < 8.0; i++) {
        a = rnd(vec2(floor(t * uv.x) / t, floor(t * uv.y) / t));	//	a----b
        b = rnd(vec2(ceil(t * uv.x) / t, floor(t * uv.y) / t));		//	|    |
        c = rnd(vec2(floor(t * uv.x) / t, ceil(t * uv.y) / t));		//	c----d
        d = rnd(vec2(ceil(t * uv.x) / t, ceil(t * uv.y) / t));

        if((ceil(t * uv.x) / t) == 1.0) {
            b = rnd(vec2(0.0, floor(t * uv.y) / t));
            d = rnd(vec2(0.0, ceil(t * uv.y) / t));
        }

        coef1 = fract(t * uv.x);
        coef2 = fract(t * uv.y);
        p += inter(inter(a, b, coef1), inter(c, d, coef1), coef2) * (1.0 / pow(2.0, (i + 0.6)));
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

void main() {
    vec2 uv = gl_FragCoord.xy / u_resolution.xy;
    float seed = u_time * 0.01;
    float r = 0.;//r controls the pos

        float noise_scale = remap(sin(seed), -1., 1., 0.1, 0.5); //smaller value, larger size
    vec3 c = vec3(1.0);
    vec4 fg_col = vec4(c,1.000);
    vec4 bg = vec4(1.0);
    // float alpha = 1.0 - noise;
    
    float v = 0.;
    const float loop = 12.;
    float hue = 0.; //color
    float saturate = 0.2;
    float brightness = 0.2;
    for (float i = 0.; i < loop; i++) {
        float xRange = remap(cos(seed-i*0.5),-1., 1., 0., 1.);
        float yRange = remap(sin(seed+i*1.),-1., 1., 0.2, 0.8);
        r = length(uv-vec2(xRange, yRange));
        float h = (noise_scale+i*0.1)*perlin((uv+i*0.1)*0.2)+r;
        hue = (h+i)*0.2+seed;
        saturate = pow(h,3.)*0.1;
        brightness = 1.-pow(h,3.)*0.1;
        // brightness = 1.-i*0.16;
        c = hsv2rgb(vec3(hue,saturate,brightness));
        fg_col = vec4(c,1.000);
    if (h < 0.8) { v += 1./(loop*1.00); }
    }

    gl_FragColor = mix(bg, fg_col, v);
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