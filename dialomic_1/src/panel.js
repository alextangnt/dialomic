import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';


export class TextBox {
    constructor(left,top,size,font){
        
    }
}

export class Panel {
    constructor(left, top, width, height, id) {
        console.log("make panel");
        this.data = {left: left, top: top, width: width, height: height, id: id};
        this.text = []



        console.log(this.data);
        this.p5;
        this.makeP5();
        this.canvas = this.p5.cnv.elt;
        this.canvasID = this.p5.cnv.id();

        
        this.makeThree();
        
    }
    
    getData() {
        return this.data;
    }

    makeThree() {
        
        this.camera = new THREE.PerspectiveCamera( 75, this.data.width / this.data.height, 0.1, 1000 );
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color( 0xf0f0f0 );
        this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas});
        this.renderer.setSize( this.data.width, this.data.height );
        this.renderer.setAnimationLoop( animate );

        

        let geometry = new THREE.BoxGeometry( 1, 1, 1 );
        let material = new THREE.MeshBasicMaterial( { color: 0x00ff00 } );
        let cube = new THREE.Mesh( geometry, material );
        // this.scene.add( cube );
        
        
        this.scene.add( cube );
        this.camera.position.z = 5;


        let renderer = this.renderer;
        let scene = this.scene;
        let camera = this.camera;
        

        function animate () {
            
            cube.rotation.x += 0.01;
            cube.rotation.y += 0.01;

            renderer.render( scene, camera );
        };
    }

    resize(width, height) {
        this.data.width = width;
        this.data.height = height;
        this.p5.resizeCanvas(width, height)
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        

    }

    move(left,top){
        this.data.left = left;
        this.data.top = top;
        this.p5.move(left,top);
    }
    
    makeP5() {
        let data = this.data;
        function panel(p) {

            p.setup = function() {
                
                
                p.cnv = p.createCanvas(data.width, data.height, p.WEBGL);
                p.cnv.position(data.left, data.top);

                // p.font = data.font;
                // p.textFont(p.font);
                console.log(data.font)
                console.log(data);
                p.background(255,0,0);
            }

            p.draw = function () {
                p.fill(0);

            }

            p.move = function (left,top){
                p.cnv.position(left, top);
            }

            // p.remove = function() {
            //     remove();
            // }


        }
        this.p5 = new p5(panel);
    }


    
}
