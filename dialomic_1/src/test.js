var bg = 200;
var loaded = false;


var txt = "";
var psgName = "";
var clicked = 0;
var started = false;
var links = [];
var panels = 0;

var toThree = [0,0,0,0];

var w;
var h;
var fontSize;
var bx;
var by;
var bd;
var vars = {};
var v = {};
var vCurr = {};
var history = []
var cols = 3;
var rows = 2;

var panelCount = 0;

var numSizes = 5;

var screenRatio;


var bpos = [];
var font;
var iframe;

var panels = []

var testPanel;

window.onload = () =>{
    console.log("HIIIII");
    iframe = document.getElementById("logicEngine");
    
    loaded = true;
    iframe.addEventListener("load", (event) => {
        console.log("Iframe has loaded!");
        // You can now send a message to SugarCube
        iframe.contentWindow.postMessage({ type: "ping" }, event.origin);
        
        // vars = iframe.contentWindow.SugarCube.State.variables;
    });

    window.addEventListener("message", (event) => {
        if (event.origin !== window.location.origin) return;
        // print("data recieved");
        // print(event.data);
        let data = event.data;
        
        if (data.type === "fromthree") {
            console.log("from three");

            // let second = panels[1]
            // console.log(testPanel)
            // window.postMessage({ type: "canvas", canvas: testPanel.v}, window.location.origin);
        }

         if (data.type === "pong") {
            console.log("SugarCube is ready inside the iframe!");
        }

        if (data.type === "init") {
            init();
            
        }

       
        
        if (data.type === "passage") {
            // console.log(iframe.contentWindow.SugarCube.State.variables);
            console.log("PASSAGE has been sent back");
            psgName = data.psgName;
            // console.log("SugarCube is ready inside the iframe!");
            txt = data.passage;
            // let panel = {
            //     "txt": data.passage
            // }

            // console.log(txt);

            
            console.log(vars);
            links = data.links;

            if (started)
                updateButtons();
        }
        
    });

    

}

function init(){
    console.log("INIT");
        let first = new p5(sketch1);
        let second = new p5(sketch2);

        // second.setup();
        panels.push(first);
        panels.push(second);
        testPanel = second;
        // console.log(iframe.contentWindow.SugarCube.State.variables);
        vars = iframe.contentWindow.SugarCube.State.variables;
        v = vars.DL_setup;
        vCurr = vars.DL_curr;
        cols = vars.COLS;
        rows = vars.ROWS;
        window.postMessage({ type: "tothree"}, window.location.origin);
       
        // console.log(testPanel)
        // window.postMessage({ type: "canvas", canvas: testPanel.v}, window.location.origin);
        // for (let i=0;i<panels.length; i++){

        // }

}




// function layout(){
//     let outPadAmt = v.outerPadding * screenRatio;
//     let inPadAmt = v.innerPadding * screenRatio;
//     let r = v.rows;
//     let c = v.cols;
//     let x = (w-(outPadAmt*2))/c
//     let y = (h-(outPadAmt*2))/r
    
//     noFill();
//     strokeWeight(2);
//     stroke(0);
//     // console.log(r)
//     let counter = 0;
//     for (let i = 0; i<r; i++){
        
//         for (let j = 0; j<c;  j++){
            
//             if (counter == panelCount)
//                 fill(0,0,255,50);
//             else {
//                 noFill()
//             }
//             rect(outPadAmt+j*x,outPadAmt+i*y,x,y);
//             counter ++;
//         }
//     }
    
// }

function updateButtons(){
    bpos = [];
    by = h-links.length*bd
    for (let i=0; i<links.length; i++){
        let bbox = font.textBounds(links[i], bx, by+(i*bd));
        bpos.push(bbox);
        
    }
}


// Function for first canvas
function sketch1(p) {
  p.setup = function () {
    p.cnv = p.createCanvas(720, 200, p.WEBGL);
    
    p.background(0);
    window.postMessage({ type: "canvas", canvas: p.cnv.id(), w: p.width, h: p.height}, window.location.origin);
  };
  p.draw = function () {
    // p.circle(p.mouseX-p.width/2, p.mouseY-p.height/2, 50);
  };
}

// Run first p5 instance


// Function for second canvas
function sketch2(p) {
  p.setup = function () {
    p.v = "waw";

   
    
    p.cnv = p.createCanvas(720, 300, p.WEBGL);
    p.cnv.position(100, 400);
    p.background(200);
    p.fill(0);
    p.stroke(255);
    window.postMessage({ type: "canvas", canvas: p.cnv.id(), w: p.width, h: p.height}, window.location.origin);
  };
//   p.draw = function () {
//     p.square(p.mouseX, p.mouseY, 50);
//   };
  p.mouseMoved = function (){
    // console.log(p.winMouseX);
    p.cnv.position(p.winMouseX,p.winMouseY);
  }
}

// Run second p5 instance


function bigSketch(p) {

}