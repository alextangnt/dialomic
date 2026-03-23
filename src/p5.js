
var bg = 200;
var loaded = false;


var txt = "";
var psgName = "";
var clicked = 0;
var started = false;
var links = [];
var panels = 0;


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






function layout(){
    let outPadAmt = v.outerPadding * screenRatio;
    let inPadAmt = v.innerPadding * screenRatio;
    let r = v.rows;
    let c = v.cols;
    let x = (w-(outPadAmt*2))/c
    let y = (h-(outPadAmt*2))/r
    
    noFill();
    strokeWeight(2);
    stroke(0);
    // console.log(r)
    let counter = 0;
    for (let i = 0; i<r; i++){
        
        for (let j = 0; j<c;  j++){
            
            if (counter == panelCount)
                fill(0,0,255,50);
            else {
                noFill()
            }
            rect(outPadAmt+j*x,outPadAmt+i*y,x,y);
            counter ++;
        }
    }
    
}

function updateButtons(){
    bpos = [];
    by = h-links.length*bd
    for (let i=0; i<links.length; i++){
        let bbox = font.textBounds(links[i], bx, by+(i*bd));
        bpos.push(bbox);
        
    }
}

function windowResized() {
    resizeCanvas(windowWidth, windowHeight);
    w = windowWidth;
    h = windowHeight;
    screenRatio = windowWidth/12;
    fontSize = w/30;
    
}

function setup() {
    
    bg = color(255,0,0,60)
    windowResized()
    bx = w/100;
    by = h*4/5;
    bd = fontSize;
    font = loadFont('ARIAL.TTF');
    createCanvas(w, h);
    background(bg);
    textFont(font);
    textSize(fontSize);
    // started = true;
    
   
    // iframe.contentWindow.postMessage({ type: 'load', passage: 'Start' }, '*');
    // iframe.contentWindow.postMessage({ type: 'start'}, '*');
    

}


function draw() {
    clear();
    background(bg);
    circle(mouseX,mouseY,10);
    if (loaded && !started && millis()>100){
        iframe.contentWindow.postMessage({ type: 'start' , passage: psgName}, window.location.origin);
        window.postMessage({ type: "tothree"}, window.location.origin);
        // iframe.contentWindow.postMessage({ type: 'play' , passage: psgName}, window.location.origin);
        started = true;
    }
    
    fill(0);
    noStroke();
    textWrap(WORD);
    text(txt, 10, 25, w-bx);
    for (let i=0; i<bpos.length; i++){
        let bbox = bpos[i];
        fill(255,255,0);
        rect(bbox.x, bbox.y, bbox.w, bbox.h);
        fill(0);
        noStroke();
        text(links[i], bx, by+(i*bd));
    }
    if (started){
        // console.log(vSetup);
        // rect(0,0,100,100);
        layout();
    }
    // textAlign(LEFT, TOP);
    


}

function keyPressed() {
  if (key === 'r' && loaded) {
    // document.getElementById("logicEngine").contentWindow.location.reload(true);
    iframe.contentWindow.postMessage({ type: 'start' , passage: psgName}, window.location.origin);
  }
}

function mousePressed() {
    // iframe.contentWindow.SugarCube.Story.get("start").processText();
    
    // console.log("THIS:" + iframe.contentWindow.SugarCube.Story.get("start").processText());
    // iframe.contentWindow.postMessage("hello " + mouseX);
    //     story.postMessage({a:'This is a test message.', b:random(255), c:mouseX}); /* send */
    //   console.log('message posted at',mouseX);
    let outside = true;
    for (let i=0; i<bpos.length; i++){
        let bbox = bpos[i];
        if (mouseX>bbox.x && mouseX<bbox.x+bbox.w && mouseY>bbox.y && mouseY<bbox.y+bbox.h){
            // txtHistory.push(txt);
            panelCount = (panelCount+1)%(v.rows*v.cols);
            psgName = links[i];
            clicked = i;
            if (loaded)
                iframe.contentWindow.postMessage({ type: 'click', clicked: clicked }, window.location.origin);
            outside = false;
        }
        
    }
    // if (outside)
    //     iframe.contentWindow.postMessage({ type: 'play', passage: psgName }, '*');


}


