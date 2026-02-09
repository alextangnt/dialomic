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
        }

         if (data.type === "pong") {
            console.log("SugarCube is ready inside the iframe!");
        }

        if (data.type === "init") {
            console.log("INIT");
            // console.log(iframe.contentWindow.SugarCube.State.variables);
            vars = iframe.contentWindow.SugarCube.State.variables;
            v = vars.DL_setup;
            vCurr = vars.DL_curr;
            cols = vars.COLS;
            rows = vars.ROWS;
        }

       
        
        if (data.type === "passage") {
            // console.log(iframe.contentWindow.SugarCube.State.variables);
            console.log("PASSAGE has been sent back");
            psgName = data.psgName;
            // console.log("SugarCube is ready inside the iframe!");
            txt = data.passage;
            let panel = {
                "txt": data.passage
            }

            // console.log(txt);

            
            console.log(vars);
            links = data.links;

            if (started)
                updateButtons();
        }
        
    });

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
    cnv = p.createCanvas(720, 200);
    cnv.position(50, 100);
    p.background(0);
  };
  p.draw = function () {
    p.circle(p.mouseX, p.mouseY, 50);
  };
}

// Run first p5 instance
new p5(sketch1);

// Function for second canvas
function sketch2(p) {
  p.setup = function () {
    cnv = p.createCanvas(720, 200);
    p.background(255);
    p.fill(0);
    p.stroke(255);
  };
  p.draw = function () {
    p.square(p.mouseX, p.mouseY, 50);
  };
}

// Run second p5 instance
new p5(sketch2);