const canvasSketch = require('canvas-sketch');
const p5 = require('p5');
const glslify = require('glslify');


new p5();

const settings = {
    dimensions: [1024, 1024],
    p5: true,
    animate: true,
    contest: "webgl",
    attributes: {
        antialias: true
    }
};


let simpleShader, shaderCanvas, timer, bgCanvas;

window.preload = () => {
    simpleShader = loadShader('Shaders/simple.vert', 'Shaders/splash.frag');

};




const sketch = (gl) => {
    bgCanvas = createGraphics(1024, 1024, WEBGL);
    shaderCanvas = createGraphics(1024, 1024, WEBGL);
    shaderCanvas.shader(simpleShader);
    timer = 0;


    document.addEventListener("mousemove", (e) => {
        // simpleShader.setUniform('u_mouse', [e.clientX, e.clientY]);
    });



    return ({ gl, frag, uniforms }) => {
        timer = frameCount * 0.1;
        shaderCanvas.noStroke();
        shaderCanvas.quad(-512, -512, 512, -512, 512, 512, -512, 512);
        simpleShader.setUniform('u_resolution', [1024, 1024]);
        simpleShader.setUniform('u_time', timer);
        image(shaderCanvas, 0, 0);
        // shaderCanvas.clear(0.,0,0,1.0);
        // shaderCanvas.reset();
    };


}

canvasSketch(sketch, settings);
