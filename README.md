# Lan Flower Sketch 
![](https://github.com/anyemelody/LanSketch/blob/main/Images/Lan%20Sketch.gif)

The flower deity for July in traditional Chinese culture is the Orchid flower, which is "Lan" in Chinese. Lan flower hold a special place in Chinese aesthetics and symbolism, often representing elegance, nobility, grace, and integrity. And the qualities represented by the flower deity symbolizes the characteristics possessed by those born in this month. 

I am not good at painting, but want to use my own skills to draw these beautiful plants. And the painting is dynamic, which means the lan will grow differently every time you see it. And you can click to bloom the flowers any where on the canvas, just create your own Lan Sketch.

You can preview the effect on 
https://anyemelody.github.io/LanSketch/

The effect is written by using tools like [canvas-sketch](https://github.com/mattdesl/canvas-sketch), [p5.js](https://p5js.org/), and glsl. All original js files are in `src` folder. 
If you download the `src` folder, use commonds to preview the effect: 

`canvas-sketch index.js --open`

## Inspiration
![](https://github.com/anyemelody/LanSketch/blob/main/Images/reference.png)

## Diagram
The project consists of three components: the flower, the branch and the background effect. Each component has its own distinct behaviors and characteristics.
![](https://github.com/anyemelody/LanSketch/blob/main/Images/Code%20Structure.png)

### Branch Design
Here is a detailed explanation of the branch component. So the `SingleBranch.js` defines each single branch, meanwhile each single branch consists of several lines that defines in `BranchLine.js`. The reason to use several lines to consist one branch is I want more dynamic colors for each branch.
![](https://github.com/anyemelody/LanSketch/blob/main/Images/Branch%20Diagram.png)

### Flower Design
For each flower, the interaction is when you click on the canvas, it will generate a new lan flower on the position where you clicked. In order to make the flower has more dynamic shape and color, each flower consist of 4 or 5 petals. Meanwhile each petal consists of a set of lines. The line has the basic shape of sin wave with some noise on the curve. The color of the lines are changing according to the line position to create the gradient effect.
![](https://github.com/anyemelody/LanSketch/blob/main/Images/Flower%20Diagram.png)

    updateStep() {

    this.theta = this.graphic.map(Math.pow((this.lineStep / this.totalStep), this.curvePow), 0, 1, 0, Math.PI);
    
    //petal thinkness noise
    
    this.curveAmp += (this.graphic.noise(this.ampNoise + this.lineStep * 0.006) - 0.5) * 1.;
    
    this.pos = this.graphic.createVector(this.lineStep * this.petalLength, Math.sin(this.theta) * this.curveAmp);
    
    this.pos = this.pos.add(this.originPos);
    
    this.lineStep++;

    }

