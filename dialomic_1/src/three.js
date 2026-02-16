import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

var canvas;
var scene;
var camera;
var renderer;
var info;

function setup(data){
    info = data.info;
    const canvas = document.getElementById(data.canvas);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color( 0xf0f0f0 );

    camera = new THREE.PerspectiveCamera( 75, info.w / info.h, 0.1, 1000 );

    renderer = new THREE.WebGLRenderer({ canvas: canvas});
    // window.postMessage({ type: "renderer", renderer: renderer}, window.location.origin);
    
    

    renderer.setSize( info.w, info.h );
    renderer.setAnimationLoop( animate );
    // document.body.appendChild( renderer.domElement );

    const geometry = new THREE.BoxGeometry( 1, 1, 1 );
    const material = new THREE.MeshBasicMaterial( { color: 0x00ff00 } );
    const cube = new THREE.Mesh( geometry, material );
    scene.add( cube );

    camera.position.z = 5;

    function animate() {

      cube.rotation.x += 0.01;
      cube.rotation.y += 0.01;

      renderer.render( scene, camera );
      // console.log(info);
      

    }
}

function resize (w,h) {

}



window.addEventListener("message", (event) => {
  // console.log("Message Recieved in three.js");
  // console.log(event.data.type);
  if (event.origin !== window.location.origin) return;
  let data = event.data;
  if (data.type === "tothree") {
    console.log("Message Recieved in three.js");
    window.postMessage({ type: "fromthree"}, window.location.origin);
    
  }

  if (data.type === "canvas") {
    console.log("Canvas Recieved in three.js");
    console.log(data.canvas)
    setup(data);
  }

  if (data.type === "update three"){
    // console.log("update three");
    info = data.info;
    // renderer.setSize(data.w,data.h);
    camera.aspect = info.w / info.h;
    camera.updateProjectionMatrix();
  }
});

// window.addEventListener( 'resize', onWindowResize, false );

// function onWindowResize() {

// 			camera.aspect = info.w / info.h;
//       camera.updateProjectionMatrix();

// 			renderer.setSize( info.w, info.h );

// 			// renderer.render(scene,camera);

// }