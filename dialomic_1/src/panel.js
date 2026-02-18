import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';


export class TextBox {
    constructor(left,top,size,font){

    }
}

function lerp(start, stop, t) {

    return Math.round(start + (stop - start) * t);
}

export class Panel {
    constructor(curr,target, id,text) {
        console.log("make panel");
        // let curr = {left: left, top: top, width: width, height: height};
        // let target = {left: left, top: top, width: width, height: height};
        this.data = curr;
        this.target = target;
        this.id = id;
        this.text = text;
        this.isUpdating = true;
        this.movingToTarget = {left:true, top:true, width:true, height:true};



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
        this.three = {};
        let camera = new THREE.PerspectiveCamera( 75, this.data.width / this.data.height, 0.1, 1000 );
        this.three.camera = camera;
        let scene = new THREE.Scene();
        this.three.scene = scene;
        let r = Math.floor(Math.random() * 255);
        let color = new THREE.Color("hsl("+r+", 100%, 50%)");
        r = Math.floor(Math.random() * 255);
        let bg = new THREE.Color("hsl("+r+", 100%, 50%)");
        scene.background = bg
        let renderer = new THREE.WebGLRenderer({ canvas: this.canvas});
        this.three.renderer = renderer;
        renderer.setSize( this.data.width, this.data.height );
        

        let skyColor = 0xB1E1FF;
        let groundColor = 0xB97A20;
        
        let objects = [];
        let light = new THREE.HemisphereLight(skyColor, groundColor, 3);
        objects.push(light);
        scene.add( light );
        r = Math.max(Math.floor(Math.random() * 5),1);
        let r2 = Math.max(Math.floor(Math.random() * 5),1);
        let r3 = Math.max(Math.floor(Math.random() * 5),1);
        let geometry = new THREE.BoxGeometry( r, r2, r3 );
        objects.push(geometry);
        let material = new THREE.MeshLambertMaterial( { color: color } );
        objects.push(material);
        let cube = new THREE.Mesh( geometry, material );
        objects.push(cube);
        // this.scene.add( cube );
        
        this.three.objects = objects;
        scene.add( cube );
        camera.position.z = 5;


        

        this.three.animate = function () {
            
            cube.rotation.x += 0.01;
            cube.rotation.y += 0.01;

            renderer.render( scene, camera );
        };

        renderer.setAnimationLoop( this.three.animate );
    }

    resize(width, height) {
        this.data.width = width;
        this.data.height = height;
        this.p5.resizeCanvas(width, height)
        this.three.camera.aspect = width / height;
        this.three.camera.updateProjectionMatrix();
        

    }

    move(left,top){
        this.data.left = left;
        this.data.top = top;
        this.p5.move(left,top);
    }

    setCurr(data){
        let t = data;
        this.move(t.left,t.top);
        this.resize(t.width,t.height);
    }
    
    setTarget(data){
        this.target = data;
        this.startUpdates();
    }


    moveToTarget(){
        
        let rate = 0.2
        let c = this.data;
        let t = this.target;

        let wwidth = window.innerWidth;
        let wheight = window.innerHeight;

        if (c.left+c.width<0 || c.top+c.height<0 || c.left>wwidth || c.top>wheight){
            this.stopUpdates();
            return;
        }

        

        if (this.movingToTarget.left){
            this.move(lerp(c.left,t.left,rate), c.top);
            if (Math.abs(c.left-t.left)<1) this.movingToTarget.left = false;
        }
        if (this.movingToTarget.top){
            this.move(c.left,lerp(c.top,t.top,rate));
            if (Math.abs(c.top-t.top)<1) this.movingToTarget.top = false;
        }
        if (this.movingToTarget.width){
            this.resize(lerp(c.width,t.width,rate), c.height);
            if (Math.abs(c.width-t.width)<1) this.movingToTarget.width = false;
        }
        if (this.movingToTarget.height){
            this.resize(c.width,lerp(c.height,t.height,rate));
            if (Math.abs(c.height-t.height)<1) this.movingToTarget.height = false;
        }
        
        // if (!movingToTarget.width && !movingToTarget.height && !movingToTarget.top && !movingToTarget.left) {
        //     c.data.
        // }

    }
    
    queueUpdates(){
        this.isUpdating = true;
        this.movingToTarget = {left:true, top:true, width:true, height:true};
    }
    stopUpdates(){
        this.isUpdating = false;
        this.movingToTarget = {left:false, top:false, width:false, height:false};
        this.three.renderer.setAnimationLoop(null);
    }
    startUpdates(){
        this.three.renderer.setAnimationLoop(this.three.animate);
        this.queueUpdates()
    }

    update(){
        if (!this.isUpdating) return;
        this.moveToTarget();
    }

    delete(){
        //idk if this works
        this.p5.remove();
        this.three.renderer.dispose();
        for (let obj in this.three.objects){
            if (!obj.isMesh) return;
                obj.geometry.dispose();
                if (obj.material.isMaterial) {
                    cleanMaterial(object.material);
                } else {
                    for (const material of obj.material) cleanMaterial(material);
                }
        }
    }

    
    
    makeP5() {
        let data = this.data;
        function panel(p) {

            p.setup = function() {
                
                
                p.cnv = p.createCanvas(data.width, data.height, p.WEBGL);
                p.cnv.position(data.left, data.top);

                // p.font = data.font;
                // p.textFont(p.font);
                console.log(data);
                p.background(255,0,0);
            }

            p.draw = function () {
                p.fill(0);

            }

            p.move = function (left,top){
                p.cnv.position(left, top);
            }

            p.remove = function() {
                remove();
            }


        }
        this.p5 = new p5(panel);
    }


    
}
