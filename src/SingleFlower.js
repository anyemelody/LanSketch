import SinglePetal from "./SinglePetal";

class SingleFlower {
    constructor(graphic, pos, flowerColor) {
        this.graphic = graphic;
        this.nbPetals = Math.floor(this.graphic.random(4, 6));
        this.flowerPetals = [];
        this.pos = pos;
        this.size = this.graphic.random(30, 72);
        this.flowerColor = flowerColor;
    }

    setFlower() {
        for (let i = 0; i < this.nbPetals; i++) {
            let petal = new SinglePetal(this.graphic, i, this.nbPetals, this.size, this.flowerColor);
            petal.setPetal();
            this.flowerPetals.push(petal);
        }
    }

    // the finished flower as geometry, for FlowerMesh. Call right after setFlower(): the
    // petals share p5's one noise field, seeded by the last petal set up.
    bake() {
        return { size: this.size, petals: this.flowerPetals.map((p) => p.bake()) };
    }

    drawFlower() {
        for (let i = 0; i < this.nbPetals; i++) {
            this.graphic.push();
            this.graphic.translate(this.pos.x, this.pos.y);
            this.flowerPetals[i].drawPetal();
            this.graphic.pop();

        }

    }
}

export default SingleFlower;
