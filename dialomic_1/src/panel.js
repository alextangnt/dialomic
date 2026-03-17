import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';


export class TextBox {
    constructor(left,top,size,font){

    }
}

function lerp(start, stop, t) {

    return start + (stop - start) * t;
}


const locsIdx = ["FARLEFT","LEFT","CENTER","RIGHT","FARRIGHT"];
const locations = {
    "FARLEFT": 0,
    "LEFT": 1,
    "CENTER": 2,
    "RIGHT": 3,
    "FARRIGHT": 4
}
const distIdx = ["VERYNEAR","NEAR","MID","FAR","VERYFAR"];
const distances = {
    "VERYNEAR":5.5,
    "NEAR":4,
    "MID":2,
    "FAR":-2,
    "VERYFAR":-9
}
const facingIdx = ["LOOKLEFT","LOOKFRONT","LOOKRIGHT","LOOKBACK"];
const facings = {
    "LOOKLEFT": -Math.PI/2,
    "LOOKFRONT": 0,
    "LOOKRIGHT": Math.PI/2,
    "LOOKBACK": Math.PI
}

export class ThreeScene {
    
    constructor (width,height,canvas) {

        
        let camera = new THREE.PerspectiveCamera( 25, width / height, 0.1, 500 );
        camera.position.set(0,0.8,9);
        camera.lookAt(0,2,-80);



        this.camera = camera;
        let scene = new THREE.Scene();
        this.scene = scene;
        let r = Math.floor(Math.random() * 255);
        let color = new THREE.Color("hsl("+r+", 100%, 50%)");
        r = Math.floor(Math.random() * 255);
        let bg = new THREE.Color("hsl("+r+", 100%, 80%)");
        scene.background = bg
        let renderer = new THREE.WebGLRenderer({ canvas: canvas});
        this.renderer = renderer;
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.setSize( width, height );

        
        

        let skyColor = 0xB1E1FF;
        let groundColor = 0xB97A20;
        
        let objects = [];
        let light = new THREE.HemisphereLight(skyColor, groundColor, 3);
        objects.push(light);
        scene.add( light );
        // r = Math.max(Math.floor(Math.random() * 5),1);
        // let r2 = Math.max(Math.floor(Math.random() * 5),1);
        // let r3 = Math.max(Math.floor(Math.random() * 5),1);
        // let geometry = new THREE.BoxGeometry( r, r2, r3 );
        // objects.push(geometry);
        // let material = new THREE.MeshLambertMaterial( { color: color } );
        // objects.push(material);
        // let cube = new THREE.Mesh( geometry, material );
        // objects.push(cube);
        // // this.scene.add( cube );
        
        
        // scene.add( cube );
        this.objects = objects;

        let loader = new GLTFLoader();
        this.loader = loader;
        // loader.load('/src/assets/animals/mammoth.obj', (object)=> {
        //     scene.add(object);
        // })

        let models = []
        this.models = models;
        const size = 10;
        const divisions = 10;
        const gridHelper = new THREE.GridHelper( size, divisions );
        scene.add( gridHelper );
        objects.push(gridHelper);

        

        // let controls = new OrbitControls( camera, renderer.domElement );
        // this.controls = controls;
        // controls.update();
        




        this.animate = this.animate.bind(this);
        renderer.setAnimationLoop(this.animate);
    }



    animate() {
        // console.log(this.camera.position);
        for (const model of this.models) {
            // if (model) {
            //     model.rotation.x += 0.01;
            //     model.rotation.y += 0.01;
            // }
        }
        // this.controls.update();
        this.renderer.render( this.scene, this.camera );
        
    }

    resize(width, height) {
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);

    }

    parseModelInfo(info){
        // console.log(info);
        let specs = info.split(" ");
        let file = specs[0].toLowerCase();
        // file is string name of animal that we add .glb to the end of
        let filename = '/src/assets/animals/'+file+'.glb';
        let dist;
        let distName;
        let locKey = "CENTER";


        for (const spec of specs){
            let s = spec.toUpperCase();
            
            if (distances[s]!== undefined){
                dist = distances[s];
                distName = s;
            }
            else if (locations[s]!== undefined){
                locKey = s;
            }
        }
        return {filename, dist, distName, locKey};
        
    }

    addModel(obj){
        let {filename, dist, distName, locKey} = this.parseModelInfo(obj);
        // console.log(filename);
        // console.log(dist);
        // console.log(locKey);
        // let file = obj.model;
        // let pos = obj.position;
        // let scale = obj.scale;
        // let rotation = obj.rotation;
        // if (rotation) {
        //     rotation.forEach((v,i) => rotation[i] = v*Math.PI/4);
        //     console.log(rotation);
        // }
    
        // let filename = '/src/assets/animals/'+file+'.glb';
        // console.log(filename);
        let loader = this.loader;
        let scene = this.scene;
        let models = this.models;
        loader.load( filename, ( gltf ) => {
            let model = gltf.scene;
            scene.add( model );
            model.scale.set(1,1,1);
                
            const xPos = this.getScreenXForLocation(locKey, distName);
            if (typeof dist === 'number') {
                const alignedX = this.screenXToWorldX(model, xPos, dist);
                if (typeof alignedX === 'number') {
                    model.position.x = alignedX;
                }
                model.position.y = 0;
                model.position.z = dist;
            }
            models.push(model);

        }, undefined, function ( error ) {

            console.error( error );

        } );
    }

    screenXToWorldX(object, screenX, depthZ) {
        if (!object || typeof screenX !== 'number' || typeof depthZ !== 'number') return;
        const canvas = this.renderer.domElement;
        const width = canvas.clientWidth || canvas.width;
        const height = canvas.clientHeight || canvas.height;
        if (!width || !height) return;

        const ndcX = (screenX / width) * 2 - 1;
        const projected = object.position.clone().project(this.camera);
        const ndcY = projected.y;

        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.camera);

        const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -depthZ);
        const hit = new THREE.Vector3();
        if (raycaster.ray.intersectPlane(plane, hit)) {
            return hit.x;
        }
    }

    getScreenXForLocation(locKey, distName) {
        const canvas = this.renderer.domElement;
        const width = canvas.clientWidth || canvas.width;
        if (!width) return 0;

        const slots = locsIdx.length;
        const paddingRatio = 0.12;
        const padding = width * paddingRatio;
        const usable = Math.max(0, width - padding * 2);
        const step = slots > 1 ? usable / (slots - 1) : 0;
        const idx = locations[locKey] ?? locations.CENTER;

        return padding + step * idx;
    }

}

export class Panel {
    constructor(curr, target, id, text, linked, scene) {
        console.log("make panel");
        // let curr = {left: left, top: top, width: width, height: height};
        // let target = {left: left, top: top, width: width, height: height};
        this.data = curr;
        this.target = target;
        this.id = id;
        this.text = text;
        this.isUpdating = true;
        this.movingToTarget = {left:true, top:true, width:true, height:true};
        this.linked = linked;
        this.onScreen = true;

        console.log(this.data);
        this.canvas = document.createElement('canvas');
        this.canvas.style.position = 'absolute';
        this.canvas.style.left = `${curr.left}px`;
        this.canvas.style.top = `${curr.top}px`;
        this.canvas.style.width = `${curr.width}px`;
        this.canvas.style.height = `${curr.height}px`;
        this.canvas.style.display = 'block';
        this.canvas.style.zIndex = '20';
        document.body.appendChild(this.canvas);

        this.textEl = document.createElement('div');
        this.textEl.className = 'panel-text';
        this.textEl.style.left = `${curr.left}px`;
        this.textEl.style.top = `${curr.top}px`;
        this.textEl.style.width = `${curr.width}px`;
        this.textEl.style.height = `${curr.height}px`;
        this.textEl.textContent = this.text || '';
        document.body.appendChild(this.textEl);
        
        
        // this.three.addModel('rat');
        this.makeScene(scene);
        
    }

    makeScene(scene){
        this.three = new ThreeScene(this.data.width, this.data.height, this.canvas);
        let objs = scene.objs;
        for (const obj of objs){
            if (obj){
                this.three.addModel(obj)
            }
        }
    }
    
    getData() {
        return this.data;
    }

    

    resize(width, height) {
        this.data.width = width;
        this.data.height = height;
        this.canvas.style.width = `${width}px`;
        this.canvas.style.height = `${height}px`;
        this.textEl.style.width = `${width}px`;
        this.textEl.style.height = `${height}px`;
        this.three.resize(width,height);
        
        

    }

    move(left,top){
        this.data.left = left;
        this.data.top = top;
        this.canvas.style.left = `${left}px`;
        this.canvas.style.top = `${top}px`;
        this.textEl.style.left = `${left}px`;
        this.textEl.style.top = `${top}px`;
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
        
        if (!this.movingToTarget.width && !this.movingToTarget.height && !this.movingToTarget.top && !this.movingToTarget.left) {
            console.log(this.id + " is done updating");
            this.isUpdating = false;
        }
        
        if (c.left+c.width<0 || c.top+c.height<0 || c.left>wwidth || c.top>wheight){
            console.log("off screen")
            this.isUpdating = false;
            this.onScreen = false;
            this.stopUpdates();
            return;
        }
    }
    

    stopUpdates(){
        this.isUpdating = false;
        this.movingToTarget = {left:false, top:false, width:false, height:false};
        this.three.renderer.setAnimationLoop(null);
    }
    startUpdates(){
        this.onScreen = true;
        this.isUpdating = true;
        this.three.renderer.setAnimationLoop(this.three.animate);
        this.movingToTarget = {left:true, top:true, width:true, height:true};
    }

    update(){
        
        if (!this.isUpdating) {
            // console.log(this.linked);
            return this.linked;
        }
        this.moveToTarget();
        return -1;
    }
    setLink(i){
        this.linked = i;
    }

    setTxt(txt){
        this.text = txt;
        this.textEl.textContent = txt || '';
    }

    delete(){
        //idk if this works
        this.canvas.remove();
        this.textEl.remove();
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

    
    
}
