#ifdef GL_ES
precision mediump float;
#endif

uniform vec2 u_resolution;
uniform vec2 u_mouse;
uniform float u_time;

void main() {
    float speed = 0.1;
    float scale = 0.002;
    vec2 p = gl_FragCoord.xy * scale;
    for(int i = 1; i < 10; i++) {
        p.x += 0.3 / float(i) * sin(float(i) * 3. * p.y + u_time * speed);
        p.y += 0.3 / float(i) * cos(float(i) * 3. * p.x + u_time * speed);
    }
    float r = cos(p.x + p.y + 3.14) * -0.5;
    float g = sin(p.x + p.y + 1.) * 0.3 + .5;
    float b = (sin(p.x + p.y) + cos(p.x + p.y)) * 0.3 + 0.5;
    vec3 color = vec3(r, g, b);
    float alpha = pow((r + g + b) / 3.0, 1.0);

    gl_FragColor = vec4(color, alpha);

}