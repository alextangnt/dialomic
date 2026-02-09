import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

function setup(data){
    
    const canvas = document.getElementById(data.canvas);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color( 0xf0f0f0 );

    const camera = new THREE.PerspectiveCamera( 75, data.w / data.h, 0.1, 1000 );

    const renderer = new THREE.WebGLRenderer({ canvas: canvas});

    renderer.setSize( data.w,data.h );
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

    }
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
});

window.addEventListener( 'resize', onWindowResize, false );

function onWindowResize() {

			camera.aspect = window.innerWidth / window.innerHeight;
			camera.updateProjectionMatrix();

			renderer.setSize( window.innerWidth, window.innerHeight );

			// renderer.render(scene,camera);

}