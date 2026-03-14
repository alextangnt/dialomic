import { Panel } from './panel.js';
var loaded = false;
var started = false;

var links = [];
var iframe;
var vars = {};

var panels = []

var testPanel;
var layout;

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

        if (data.type === "renderer") {
            console.log("getting renderer");
            const renderer = data.renderer;
        }

         if (data.type === "pong") {
            console.log("SugarCube is ready inside the iframe!");
        }

        if (data.type === "init") {
            init(data.info);
            
        }

       
        
        if (data.type === "passage") {
            console.log("passage recieved");
            if (!started){
                return;
                // layout = new p5(bigSketch);
            }
            layout.setPsgInfo(data.info);
            layout.setPanel();
        }
        
    });

    

}

    
// }

function init(info){
    console.log("INIT");
    
    // let first = new p5(sketch1);
    // window.postMessage({ type: "tothree"}, window.location.origin);
    
    if (!started){
        // let second = new p5(sketch2);
        layout = new p5(bigSketch);
    }
    
    
    

    // second.setup();
    // panels.push(first);
    
    // console.log(iframe.contentWindow.SugarCube.State.variables);
    vars = iframe.contentWindow.SugarCube.State.variables;
    layout.lo = vars.DL_setup;
    layout.loCurr = vars.DL_curr;

    layout.setPsgInfo(info);
    // cols = vars.COLS;
    // rows = vars.ROWS;
    
    
    // console.log(testPanel)
    // window.postMessage({ type: "canvas", canvas: testPanel.v}, window.location.origin);
    // for (let i=0;i<panels.length; i++){

    // }

}




// function layout(){
//     let outPadAmt = lo.outerPadding * screenRatio;
//     let inPadAmt = lo.innerPadding * screenRatio;
//     let r = lo.rows;
//     let c = lo.cols;
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



// Function for first canvas
function sketch1(p) {
  p.setup = function () {
    p.cnv = p.createCanvas(720, 200, p.WEBGL);
    p.info = {w: p.width, h: p.height, pos: p.cnv.position()};
    p.background(0);
    window.postMessage({ type: "canvas", canvas: p.cnv.id(), info: p.info}, window.location.origin);
  };
  p.draw = function () {
    // p.circle(p.mouseX-p.width/2, p.mouseY-p.height/2, 50);
  };
}

// Run first p5 instance


function cleanText(s){
    let i = s.indexOf("%%%");
    if (i!=-1){
        return s.substring(0,i);
    }
}


function bigSketch(S) {
    S.bg = 200;
    S.pressed = false;


    S.txt = "";
    S.psgName = "";
    S.clicked = 0;
    


    S.w;
    S.h;
    S.fontSize;
    S.bx;
    S.by;
    S.bd;
    
    S.lo = {};
    S.loCurr = {};
    S.panels = {};
    S.currPanel;

    S.panelsOnscreen = {};

    S.panelCount = 0;

    S.screenRatio;


    S.bpos = [];
    S.font;
    let fontLoaded = false;

    S.preload = function() {
        S.font = S.loadFont('/src/assets/Inconsolata.otf', S.success, S.failure);
    }
    S.success = function() {
        // S.textFont(S.font);
        fontLoaded = true;
        console.log("success");

    }

    S.failure = function() {
        console.error("FAILFAIL");
    }
    

    S.setPanel = function (){
        // S.pressed = false;
        let offscreen = {left: 0, top: -200, width: 360, height: 150};
        for (let i in S.panelsOnscreen){
            let ps = S.panelsOnscreen[i];
            ps.setTarget(offscreen);
        }
        // S.currPanel.setTarget(offscreen)

        let name = S.psgName;
        let data = {left: 0, top: S.h, width: 360, height: 150};
        let target = {left: 0, top: S.h/4, width: S.w, height: 300};

        if (!S.panels[name]) {
            
            let p = new Panel(data,target, name, S.txt,-1);
            S.panels[name] = p;
            S.currPanel = p;
            S.panelsOnscreen[name] = p;
        }
        else {
            let p = S.panels[name];
            S.currPanel = p;
            p.setLink = -1;
            p.setCurr(data);
            p.setTarget(target);
            p.setTxt(S.txt);
            S.panelsOnscreen[name] = p;
        }

    }

    S.setPsgInfo = function (info) {
        console.log("PASSAGeinfo");
        S.psgName = info.psgName;
        // console.log("SugarCube is ready inside the iframe!");
        S.txt = cleanText(info.passage);
        // let panel = {
        //     "txt": data.passage
        // }

        // console.log(txt);

        
        console.log(vars);
        links = info.links;
        S.updateButtons();

        
    }

    S.setup = function() {
        S.textFont(S.font);
        S.bg = S.color(255,0,0,60)
        // S.bg = S.color(255,255,255,0)
        S.windowResized()
        S.bx = S.w/100;
        S.by = S.h*4/5;
        S.bd = S.fontSize;
        
        S.cnv = S.createCanvas(S.w, S.h);
        S.cnv.style('z-index', '10');
        S.background(S.bg);

        S.textSize(S.fontSize);
        
        layout.updateButtons();

        
        iframe.contentWindow.postMessage({ type: 'start' , passage: S.psgName}, window.location.origin);
        started = true;
        // let h = S.height
        // let data = {left: 0, top: h, width: 360, height: 150};
        // let target = {left: 0, top: h/4, width: S.w, height: 300};
        // let p = new Panel(data,target, S.psgName,S.txt, -1);
        // S.currPanel = p;
        // let name = S.psgName;
        // S.panels[name] = p;
        // S.panelsOnscreen[name] = p;
        
    
        // iframe.contentWindow.postMessage({ type: 'load', passage: 'Start' }, '*');
        // iframe.contentWindow.postMessage({ type: 'start'}, '*');
        

    };


    S.windowResized = function () {
        S.resizeCanvas(S.windowWidth, S.windowHeight);
        S.w = S.windowWidth;
        S.h = S.windowHeight;
        S.screenRatio = S.windowWidth/12;
        S.fontSize = S.w/30;

        

        
    };

    S.draw = function () {
        S.clear();
        S.background(S.bg);

        // if (loaded && !started && S.millis()>100){
        //     iframe.contentWindow.postMessage({ type: 'start' , passage: S.psgName}, window.location.origin);
        //     window.postMessage({ type: "tothree"}, window.location.origin);
        //     // iframe.contentWindow.postMessage({ type: 'play' , passage: psgName}, window.location.origin);
        //     started = true;
        // }


        S.noFill();
        S.stroke(0);
        S.strokeWeight(1);

        
        S.circle(S.winMouseX,S.winMouseY,10);
        S.fill(0);
        S.noStroke();
        S.textWrap(S.WORD);

        // S.text(S.windowWidth,10, 50,S.w-S.bx);
        // S.text(S.windowHeight,10, 75,S.w-S.bx);

        // S.text(S.txt, 10, 25,S.w-S.bx);

        // S.text(S.txt, S.currPanel.data.left, S.currPanel.data.top,S.w-S.bx);



        for (let i=0; i<S.bpos.length; i++){
            let bbox = S.bpos[i];
            S.fill(255,255,0);
            S.rect(bbox.x, bbox.y, bbox.w, bbox.h);
            S.fill(0);
            S.noStroke();
            S.text(links[i], S.bx, S.by+(i*S.bd));

        }
        // if (started){

        //     S.updateLo();
        // }

        for (let panel in S.panelsOnscreen){
            let p = S.panelsOnscreen[panel]
            
            if (!p.onScreen){
                console.log(p.text + " removed")
                S.pressed = false;
                delete S.panelsOnscreen[panel]
            }
            else {
                S.text(p.text, p.data.left, p.data.top,S.w-S.bx);
                let linkExists = p.update();
                // console.log(linkExists);

                if (linkExists!=-1){
                    
                    S.clickLink(linkExists)
                    p.setLink(-1);
                    
                }
            }
        }
        // S.currPanel.update();
    };


    S.updateButtons = function () {
        if (!fontLoaded)
            return;
        console.log("buttons")
        console.log(links);
        S.bpos = [];
        S.by = S.h-links.length*S.bd
        for (let i=0; i<links.length; i++){
            let bbox = S.font.textBounds(links[i], S.bx, S.by+(i*S.bd));
            S.bpos.push(bbox);
            
        }
        console.log(S.bpos)
    };





    S.keyPressed = function () {
    if (S.key === 'r' && loaded) {
        // document.getElementById("logicEngine").contentWindow.location.reload(true);
        iframe.contentWindow.postMessage({ type: 'start' , passage: S.psgName}, window.location.origin);
        for (let panel in S.panels){
            //this doesnt rly work yet
            S.panels[panel].delete();
        }
    }
    }

    S.mousePressed = function () {
        
        
        for (let i=0; i<S.bpos.length; i++){
            let bbox = S.bpos[i];
            if (S.winMouseX>bbox.x && S.winMouseX<bbox.x+bbox.w && S.winMouseY>bbox.y && S.winMouseY<bbox.y+bbox.h){
                // txtHistory.push(txt);
                // panelCount = (panelCount+1)%(lo.rows*lo.cols);
                if (S.pressed) return;
                S.pressed = true;
                S.makeResponse(i);
                

                
            }
            
        }
        
        // if (outside)
        //     iframe.contentWindow.postMessage({ type: 'play', passage: psgName }, '*');


    }

    S.makeResponse = function (i) {
        let choice = links[i]
        let target = {left: 0, top: S.h/5, width: 720*3/4, height: 300*3/4};
        for (let i in S.panelsOnscreen){
            let ps = S.panelsOnscreen[i];
            ps.setTarget(target);
        }
        // S.currPanel.setTarget(target)

        let name = S.psgName+choice;
        let data = {left: 0, top: S.h, width: 100, height: 100};
        target = {left: S.width*3/4, top: S.h/3, width: 200, height: 200};

        if (!S.panels[name]) {
            
            let p = new Panel(data,target, name, choice, i);
            S.panels[name] = p;
            S.currPanel = p;
            S.panelsOnscreen[name] = p;
        }
        else {
            let p = S.panels[name];
            p.setLink(i);
            S.currPanel = p;
            // p.setTxt(choice);
            p.setCurr(data);
            p.setTarget(target);
            S.panelsOnscreen[name] = p;
        } 
    }

    S.clickLink = function (i){

        console.log("click link " + i);
        S.psgName = links[i];
        S.clicked = i;
        // console.log(links[i]);
        if (loaded)
            iframe.contentWindow.postMessage({ type: 'click', clicked: S.clicked }, window.location.origin);

    }

    S.mouseWheel = function(event) {
        
        let data = S.currPanel.getData();

        
        let top = data.top;
        let left = data.left;
        // if (event.delta > 0){
        //     S.panel.move(left,top+10);
        // }
        // else {
        //     S.panel.move(left,top-10);
        // }
    }




}