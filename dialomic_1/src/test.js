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
        }
        
    });

    

}

// function setPsgInfo(info){
//     console.log("PASSAGE has been sent back");
//     layout.psgName = info.psgName;
//     // console.log("SugarCube is ready inside the iframe!");
//     layout.txt = info.passage;
//     // let panel = {
//     //     "txt": data.passage
//     // }

//     // console.log(txt);

    
//     console.log(vars);
//     links = info.links;
//     layout.updateButtons();

        
    
// }

function init(info){
    console.log("INIT");
    
    // let first = new p5(sketch1);
    // window.postMessage({ type: "tothree"}, window.location.origin);
    
    if (!started){
        let second = new p5(sketch2);
        layout = new p5(bigSketch);
    }
    
    layout.setPsgInfo(info);

    // second.setup();
    // panels.push(first);
    
    // console.log(iframe.contentWindow.SugarCube.State.variables);
    vars = iframe.contentWindow.SugarCube.State.variables;
    layout.lo = vars.DL_setup;
    layout.loCurr = vars.DL_curr;
    cols = vars.COLS;
    rows = vars.ROWS;
    
    
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


// Function for second canvas
function sketch2(p) {
  p.setup = function () {
    p.v = "waw";

   
    
    p.cnv = p.createCanvas(720, 300, p.WEBGL);
    p.cnv.position(100, 400);
    p.background(200);
    p.fill(0);
    p.stroke(255);

    p.info = {w: p.width, h: p.height, pos: p.cnv.position()};
    p.needsUpdate = false;

    window.postMessage({ type: "canvas", canvas: p.cnv.id(), info: p.info}, window.location.origin);
  };
  p.draw = function () {
    // if (p.mouseIsPressed){
    //     p.resizeCanvas(p.width,p.height+1);
    //     p.needsUpdate = true;

    //     // window.postMessage({ type: "resize", w: p.width, h: p.h}, window.location.origin);
    //     // renderer.setSize(p.width,p.height+1);
    // }
    
    if (p.needsUpdate) {
        p.info = {w: p.width, h: p.height, pos: p.cnv.position()};
        window.postMessage({ type: "update three", info: p.info}, window.location.origin);
        p.needsUpdate = false;
    }
    //  console.log(p.info);
  };
  p.mouseMoved = function () {
    // console.log(p.winMouseX);
    p.cnv.position(p.winMouseX,p.winMouseY);
    p.needsUpdate = true;
  };

//   p.mousePressed = function () {
//     p.resizeCanvas(p.width,p.height+10);
//   }
}

// Run second p5 instance


function bigSketch(S) {
    S.bg = 200;


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
    // S.history = []

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

    S.setPsgInfo = function (info) {
        console.log("PASSAGeinfo");
        S.psgName = info.psgName;
        // console.log("SugarCube is ready inside the iframe!");
        S.txt = info.passage;
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
        S.windowResized()
        S.bx = S.w/100;
        S.by = S.h*4/5;
        S.bd = S.fontSize;
        
        S.createCanvas(S.w, S.h);
        S.background(S.bg);

        S.textSize(S.fontSize);
        started = true;
        layout.updateButtons();
        
        
    
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
        S.text(S.txt, 10, 25,S.w-S.bx);



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
    };

    // S.updateLo = function (){
    //     outPadAmt = lo.outerPadding * S.screenRatio;
    //     inPadAmt = lo.innerPadding * S.screenRatio;
    //     S.r = lo.rows;
    //     S.c = lo.cols;
    //     S.x = (w-(outPadAmt*2))/S.c
    //     S.y = (h-(outPadAmt*2))/S.r
        
    //     S.noFill();
    //     S.strokeWeight(2);
    //     S.stroke(0);
    //     // console.log(r)
    //     let counter = 0;
    //     for (let i = 0; i<r; i++){
            
    //         for (let j = 0; j<c;  j++){
                
    //             if (counter == panelCount)
    //                 S.fill(0,0,255,50);
    //             else {
    //                 S.noFill()
    //             }
    //             S.rect(outPadAmt+j*x,outPadAmt+i*y,x,y);
    //             counter ++;
    //         }
    //     }
        
    // };

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






    // S.draw = function () {
    //     clear();
    //     background(bg);
    //     circle(mouseX,mouseY,10);
    //     if (loaded && !started && millis()>100){
    //         iframe.contentWindow.postMessage({ type: 'start' , passage: psgName}, window.location.origin);
    //         window.postMessage({ type: "tothree"}, window.location.origin);
    //         // iframe.contentWindow.postMessage({ type: 'play' , passage: psgName}, window.location.origin);
    //         started = true;
    //     }
        
    //     fill(0);
    //     noStroke();
    //     textWrap(WORD);
    //     text(txt, 10, 25, w-bx);
    //     for (let i=0; i<bpos.length; i++){
    //         let bbox = bpos[i];
    //         fill(255,255,0);
    //         rect(bbox.x, bbox.y, bbox.w, bbox.h);
    //         fill(0);
    //         noStroke();
    //         text(links[i], bx, by+(i*bd));
    //     }
    //     if (started){
    //         // console.log(vSetup);
    //         // rect(0,0,100,100);
    //         updateLo();
    //     }
    //     // textAlign(LEFT, TOP);
        


    // }

    S.keyPressed = function () {
    if (S.key === 'r' && loaded) {
        // document.getElementById("logicEngine").contentWindow.location.reload(true);
        iframe.contentWindow.postMessage({ type: 'start' , passage: S.psgName}, window.location.origin);
    }
    }

    S.mousePressed = function () {
        // iframe.contentWindow.SugarCube.Story.get("start").processText();
        
        // console.log("THIS:" + iframe.contentWindow.SugarCube.Story.get("start").processText());
        // iframe.contentWindow.postMessage("hello " + mouseX);
        //     story.postMessage({a:'This is a test message.', b:random(255), c:mouseX}); /* send */
        //   console.log('message posted at',mouseX);

        for (let i=0; i<S.bpos.length; i++){
            let bbox = S.bpos[i];
            if (S.winMouseX>bbox.x && S.winMouseX<bbox.x+bbox.w && S.winMouseY>bbox.y && S.winMouseY<bbox.y+bbox.h){
                // txtHistory.push(txt);
                // panelCount = (panelCount+1)%(lo.rows*lo.cols);
                S.psgName = links[i];
                S.clicked = i;
                console.log(links[i]);
                if (loaded)
                    iframe.contentWindow.postMessage({ type: 'click', clicked: S.clicked }, window.location.origin);

            }
            
        }
        // if (outside)
        //     iframe.contentWindow.postMessage({ type: 'play', passage: psgName }, '*');


    }




}