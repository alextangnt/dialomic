import { Panel } from './panel.js';

let loaded = false;
let started = false;
let iframe;
let vars = {};
let layout;

window.onload = () =>{
    console.log("HIIIII");
    iframe = document.getElementById("logicEngine");

    loaded = true;
    iframe.addEventListener("load", (event) => {
        console.log("Iframe has loaded!");
        iframe.contentWindow.postMessage({ type: "ping" }, event.origin);
    });

    window.addEventListener("message", (event) => {
        if (event.origin !== window.location.origin) return;
        let data = event.data;

        if (data.type === "fromthree") {
            console.log("from three");
        }

        if (data.type === "renderer") {
            console.log("getting renderer");
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
            }
            layout.setPsgInfo(data.info);
            layout.setPanel();
        }
    });
};

function init(info){
    console.log("INIT");

    if (!started){
        layout = new LayoutUI();
        started = true;
    }

    vars = iframe.contentWindow.SugarCube.State.variables;
    layout.lo = vars.DL_setup;
    layout.loCurr = vars.DL_curr;
    layout.setPsgInfo(info);
}

function cleanText(s){
    console.log(s);
    let i = s.indexOf("%%%");
    if (i !== -1){
        return s.substring(0, i);
    }
    return s;
}

class LayoutUI {
    constructor() {
        this.pressed = false;
        this.txt = "";
        this.psgName = "";
        this.clicked = 0;
        this.links = [];

        this.w = window.innerWidth;
        this.h = window.innerHeight;
        this.fontSize = this.w / 30;
        this.bx = this.w / 100;
        this.bd = this.fontSize;
        this.by = this.h;

        this.lo = {};
        this.loCurr = {};
        this.panels = {};
        this.currPanel = null;
        this.panelsOnscreen = {};

        this.uiRoot = document.createElement('div');
        this.uiRoot.id = 'ui-root';
        this.linksRoot = document.createElement('div');
        this.linksRoot.id = 'link-list';
        this.uiRoot.appendChild(this.linksRoot);
        document.body.appendChild(this.uiRoot);

        this.tick = this.tick.bind(this);
        requestAnimationFrame(this.tick);

        window.addEventListener('resize', () => this.onResize());
        window.addEventListener('keydown', (event) => this.onKeyDown(event));
    }

    onResize() {
        this.w = window.innerWidth;
        this.h = window.innerHeight;
        this.updateLinkLayout();
        this.updatePanelLayoutImmediate();
    }

    onKeyDown(event) {
        if (event.key === 'r' || event.key === 'R' && loaded) {
            iframe.contentWindow.postMessage({ type: 'start' , passage: this.psgName}, window.location.origin);
            for (let panel in this.panels){
                this.panels[panel].delete();
            }
            this.panels = []
        }
    }

    updateLinkLayout() {
        const maxFont = (this.h * 0.8) / Math.max(1, this.links.length);
        this.fontSize = Math.min(this.w / 30, maxFont);
        this.bx = this.w / 100;
        this.bd = this.fontSize;
        this.linkGap = Math.max(4, this.fontSize * 0.15);
        const totalHeight = this.links.length * this.bd + Math.max(0, this.links.length - 1) * this.linkGap;
        this.by = Math.max(this.h - totalHeight, this.h * 0.05);

        this.linksRoot.style.left = `${this.bx}px`;
        this.linksRoot.style.top = `${this.by}px`;
        this.linksRoot.style.fontSize = `${this.fontSize}px`;
        this.linksRoot.style.lineHeight = `${this.bd}px`;
        this.linksRoot.style.gap = `${this.linkGap}px`;

        const measure = document.createElement('span');
        measure.style.position = 'absolute';
        measure.style.visibility = 'hidden';
        measure.style.whiteSpace = 'pre';
        measure.style.fontFamily = '"InconsolataLocal", "Inconsolata", Menlo, Monaco, Consolas, "Liberation Mono", monospace';
        measure.style.fontSize = `${this.fontSize}px`;
        document.body.appendChild(measure);
        const buttons = this.linksRoot.querySelectorAll('button.link-button');
        for (const btn of buttons) {
            measure.textContent = btn.textContent || '';
            const textWidth = measure.getBoundingClientRect().width;
            btn.style.width = `${Math.ceil(textWidth + 8)}px`;
            btn.style.marginBottom = `${this.linkGap}px`;
        }
        measure.remove();
    }

    renderLinks() {
        this.linksRoot.innerHTML = '';
        const measure = document.createElement('span');
        measure.style.position = 'absolute';
        measure.style.visibility = 'hidden';
        measure.style.whiteSpace = 'pre';
        measure.style.fontFamily = '"InconsolataLocal", "Inconsolata", Menlo, Monaco, Consolas, "Liberation Mono", monospace';
        measure.style.fontSize = `${this.fontSize}px`;
        document.body.appendChild(measure);
        for (let i = 0; i < this.links.length; i++){
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'link-button';
            btn.textContent = this.links[i];
            btn.style.marginBottom = `${this.linkGap}px`;
            measure.textContent = this.links[i];
            const textWidth = measure.getBoundingClientRect().width;
            btn.style.width = `${Math.ceil(textWidth + 8)}px`;
            btn.addEventListener('click', () => {
                if (this.pressed) return;
                this.pressed = true;
                this.makeResponse(i);
            });
            this.linksRoot.appendChild(btn);
        }
        measure.remove();
        this.updateLinkLayout();
    }

    setPsgInfo(info) {
        console.log("PASSAGeinfo");
        this.psgName = info.psgName;
        this.txt = cleanText(info.passage);
        this.links = info.links || [];
        this.pressed = false;
        this.renderLinks();
    }

    setPanel() {
        let offscreen = {left: 0, top: -200, width: 360, height: 150};
        for (let i in this.panelsOnscreen){
            let ps = this.panelsOnscreen[i];
            ps.setTarget(offscreen);
        }

        let name = this.psgName;
        let data = {left: 0, top: this.h, width: 360, height: 150};
        let target = {left: 0, top: this.h / 4, width: this.w, height: 300};
        let vars = iframe.contentWindow.SugarCube.State.variables;
        let scene = vars.DL_currScene;
        // console.log(scene);

        if (!this.panels[name]) {
            let p = new Panel(data, target, name, this.txt, -1, scene);
            p.panelSize = 'large';
            this.panels[name] = p;
            this.currPanel = p;
            this.panelsOnscreen[name] = p;
        } else {
            let p = this.panels[name];
            this.currPanel = p;
            p.setLink(-1);
            p.setCurr(data);
            p.setTarget(target);
            p.setTxt(this.txt);
            p.panelSize = 'large';
            this.panelsOnscreen[name] = p;
        }
    }

    makeResponse(i) {
        let choice = this.links[i];
        let target = {left: 0, top: this.h / 5, width: 720 * 3 / 4, height: 300 * 3 / 4};
        for (let j in this.panelsOnscreen){
            let ps = this.panelsOnscreen[j];
            ps.setTarget(target);
        }

        let name = this.psgName + choice;
        let data = {left: 0, top: this.h, width: 100, height: 100};
        target = {left: this.w * 3 / 4, top: this.h / 3, width: 200, height: 200};
        vars = iframe.contentWindow.SugarCube.State.variables;
        let scene = vars.DL_currScene;
        console.log("makeresponese make response");
        console.log(vars);
        if (!this.panels[name]) {
            let p = new Panel(data, target, name, choice, i,scene);
            p.panelSize = 'small';
            this.panels[name] = p;
            this.currPanel = p;
            this.panelsOnscreen[name] = p;
        } else {
            let p = this.panels[name];
            p.setLink(i);
            this.currPanel = p;
            p.setCurr(data);
            p.setTarget(target);
            p.panelSize = 'small';
            this.panelsOnscreen[name] = p;
        }
    }

    clickLink(i){

        this.psgName = this.links[i];
        this.clicked = i;
        if (loaded) {
            iframe.contentWindow.postMessage({ type: 'click', clicked: this.clicked }, window.location.origin);
        }
    }

    tick() {
        for (let panel in this.panelsOnscreen){
            let p = this.panelsOnscreen[panel];
            if (!p.onScreen){
                console.log(p.text + " removed");
                this.pressed = false;
                delete this.panelsOnscreen[panel];
            } else {
                let linkExists = p.update();
                if (linkExists !== -1){
                    this.clickLink(linkExists);
                    p.setLink(-1);
                }
            }
        }
        requestAnimationFrame(this.tick);
    }

    updatePanelLayoutImmediate() {
        const panels = Object.values(this.panelsOnscreen);
        const largePanels = panels.filter((p) => p.panelSize !== 'small');
        const smallPanels = panels.filter((p) => p.panelSize === 'small');

        const largeTop = this.h * 0.1;
        const largeBottom = this.h * 0.6;
        const largeSpan = Math.max(0, largeBottom - largeTop);
        const largeStep = largePanels.length ? largeSpan / (largePanels.length + 1) : 0;

        const smallTop = this.h * 0.2;
        const smallBottom = this.h * 0.9;
        const smallSpan = Math.max(0, smallBottom - smallTop);
        const smallStep = smallPanels.length ? smallSpan / (smallPanels.length + 1) : 0;

        for (let i = 0; i < largePanels.length; i++) {
            const p = largePanels[i];
            const left = Math.max(0, p.data.left);
            const width = Math.max(50, this.w - left);
            const height = p.data.height;
            const top = largeTop + largeStep * (i + 1) - height / 2;
            const target = {left, top, width, height};
            const shouldScale = p.isUpdating;
            p.setCurr(target, shouldScale);
            p.target = target;
            p.movingToTarget = {left:false, top:false, width:false, height:false};
            p.isUpdating = false;
        }

        for (let i = 0; i < smallPanels.length; i++) {
            const p = smallPanels[i];
            const width = p.data.width;
            const height = p.data.height;
            const left = this.w - width;
            const top = smallTop + smallStep * (i + 1) - height / 2;
            const target = {left, top, width, height};
            const shouldScale = p.isUpdating;
            p.setCurr(target, shouldScale);
            p.target = target;
            p.movingToTarget = {left:false, top:false, width:false, height:false};
            p.isUpdating = false;
        }
    }
}
