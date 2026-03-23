import { Panel } from './panel.js';

let loaded = false;
let started = false;
let iframe;
let vars = {};
let layout;
let activeSessionId = null;

window.onload = () =>{
    console.log("HIIIII");
    iframe = document.getElementById("logicEngine");
    const fileInput = document.getElementById("storyFile");
    const statusEl = document.getElementById("fileStatus");
    const storyStatusEl = document.getElementById("storyStatus");
    const storyToggleBtn = document.getElementById("storyToggleBtn");
    const defaultStoryUrl = "story.with-messaging.html";
    let importedHtml = null;
    let importedName = null;
    let currentMode = 'default';
    let pendingStart = false;

    loaded = true;
    iframe.addEventListener("load", (event) => {
        console.log("Iframe has loaded!");
        activeSessionId = Math.random().toString(36).slice(2);
        iframe.contentWindow.postMessage({ type: "ping", sessionId: activeSessionId }, event.origin);
    });

    window.addEventListener("message", (event) => {
        const isSameOrigin = event.origin === window.location.origin;
        const isNullFromIframe = event.origin === "null" && event.source === iframe.contentWindow;
        if (!isSameOrigin && !isNullFromIframe) return;
        let data = event.data;

        if (data.type === "fromthree") {
            console.log("from three");
        }

        if (data.type === "renderer") {
            console.log("getting renderer");
        }

        if (data.type === "pong") {
            console.log("SugarCube is ready inside the iframe!");
            if (pendingStart) {
                const targetOrigin = iframe.getAttribute('srcdoc') ? '*' : window.location.origin;
                iframe.contentWindow.postMessage({ type: "start" }, targetOrigin);
                pendingStart = false;
            }
        }

        if (data.type === "init") {
            if (data.sessionId && data.sessionId !== activeSessionId) return;
            init(data.info);
        }

        if (data.type === "passage") {
            if (data.sessionId && data.sessionId !== activeSessionId) return;
            console.log("passage recieved");
            if (!started){
                return;
            }
            layout.setPsgInfo(data.info);
            layout.setPanel();
        }
    });

    function resetLayout() {
        if (!layout) return;
        for (let key in layout.panels) {
            layout.panels[key].delete();
        }
        layout.uiRoot?.remove();
        layout = null;
        started = false;
    }

    function injectMessaging(html) {
        if (html.includes('messaging.js')) return html;
        if (/<\/body>/i.test(html)) {
            return html.replace(/<\/body>/i, '<script src="messaging.js"></script>\n</body>');
        }
        return html + '\n<script src="messaging.js"></script>\n';
    }

    function loadStoryHtml(html, name) {
        resetLayout();
        const patched = injectMessaging(html);
        iframe.removeAttribute("src");
        iframe.setAttribute("srcdoc", patched);
        statusEl.textContent = name ? `Loaded: ${name}` : 'Loaded';
        if (storyStatusEl) storyStatusEl.textContent = 'Your imported story';
        pendingStart = true;
    }

    function updateToggleLabel() {
        if (!storyToggleBtn) return;
        if (!importedHtml) {
            storyToggleBtn.textContent = 'Play default story';
            storyToggleBtn.disabled = true;
            return;
        }
        storyToggleBtn.disabled = false;
        storyToggleBtn.textContent =
            currentMode === 'default' ? 'Play imported story' : 'Play default story';
    }

    function setMode(mode) {
        currentMode = mode;
        if (mode === 'default') {
            resetLayout();
            iframe.removeAttribute('srcdoc');
            iframe.setAttribute('src', defaultStoryUrl);
            statusEl.textContent = 'Loaded default story';
            if (storyStatusEl) storyStatusEl.textContent = 'Default story';
            pendingStart = true;
        } else if (importedHtml) {
            loadStoryHtml(importedHtml, importedName);
        }
        updateToggleLabel();
    }

    function handleFile(file) {
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            importedHtml = reader.result;
            importedName = file.name;
            setMode('imported');
        };
        reader.onerror = () => {
            statusEl.textContent = 'Failed to load file';
        };
        reader.readAsText(file);
    }

    if (fileInput) {
        fileInput.addEventListener('change', () => handleFile(fileInput.files?.[0]));
    }

    if (storyToggleBtn) {
        updateToggleLabel();
        storyToggleBtn.addEventListener('click', () => {
            if (!importedHtml) return;
            setMode(currentMode === 'default' ? 'imported' : 'default');
        });
    }
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

        this.topInset = this.getTopInset();
        this.w = window.innerWidth;
        this.h = Math.max(0, window.innerHeight - this.topInset);
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
        this.uiRoot.style.top = `${this.topInset}px`;
        this.uiRoot.style.height = `${this.h}px`;
        this.linksRoot = document.createElement('div');
        this.linksRoot.id = 'link-list';
        this.uiRoot.appendChild(this.linksRoot);
        document.body.appendChild(this.uiRoot);

        this.restartBtn = document.createElement('button');
        this.restartBtn.id = 'restartBtn';
        this.restartBtn.type = 'button';
        this.restartBtn.textContent = 'restart';
        this.restartBtn.addEventListener('click', () => this.restartStory());
        document.body.appendChild(this.restartBtn);

        this.tick = this.tick.bind(this);
        requestAnimationFrame(this.tick);

        window.addEventListener('resize', () => this.onResize());
        window.addEventListener('keydown', (event) => this.onKeyDown(event));
    }

    onResize() {
        this.topInset = this.getTopInset();
        this.w = window.innerWidth;
        this.h = Math.max(0, window.innerHeight - this.topInset);
        this.uiRoot.style.top = `${this.topInset}px`;
        this.uiRoot.style.height = `${this.h}px`;
        for (let panel in this.panelsOnscreen){
            this.panelsOnscreen[panel].setTopInset(this.topInset);
        }
        this.updateLinkLayout();
        this.updatePanelLayoutImmediate();
    }

    getTopInset() {
        const topbar = document.getElementById('topbar');
        if (!topbar) return 0;
        return Math.max(0, Math.ceil(topbar.getBoundingClientRect().height));
    }

    onKeyDown(event) {
        if (event.key === 'r' || event.key === 'R') {
            this.restartStory();
        }
    }

    restartStory() {
        if (!loaded) return;
        iframe.contentWindow.postMessage({ type: 'start' , passage: this.psgName}, window.location.origin);
        for (let panel in this.panels){
            this.panels[panel].delete();
        }
        this.panels = []
    }

    updateLinkLayout() {
        const maxFont = (this.h * 0.8) / Math.max(1, this.links.length);
        this.fontSize = Math.min(16.8, maxFont);
        this.bx = this.w / 100;
        this.bd = this.fontSize;
        this.linkGap = Math.max(4, this.fontSize * 0.15);
        const bottomPad = Math.max(6, this.fontSize * 0.4);
        const totalHeight = this.links.length * this.bd +
            Math.max(0, this.links.length - 1) * this.linkGap +
            bottomPad;
        this.by = Math.max(this.h - totalHeight, this.h * 0.05, 0);

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
        const maxWidth = Math.max(50, this.w - this.bx * 2);
        for (const btn of buttons) {
            const text = btn.textContent || '';
            measure.textContent = text;
            const textWidth = Math.ceil(measure.getBoundingClientRect().width + 8);
            if (textWidth > maxWidth) {
                btn.style.width = `${maxWidth}px`;
                btn.style.whiteSpace = 'normal';
            } else {
                btn.style.width = `${textWidth}px`;
                btn.style.whiteSpace = 'nowrap';
            }
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
            const textWidth = Math.ceil(measure.getBoundingClientRect().width + 8);
            const maxWidth = Math.max(50, this.w - this.bx * 2);
            if (textWidth > maxWidth) {
                btn.style.width = `${maxWidth}px`;
                btn.style.whiteSpace = 'normal';
            } else {
                btn.style.width = `${textWidth}px`;
                btn.style.whiteSpace = 'nowrap';
            }
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
        let offscreen = {left: 0, top: this.topInset - 400, width: 360, height: 150};
        for (let i in this.panelsOnscreen){
            let ps = this.panelsOnscreen[i];
            ps.setTarget(offscreen);
        }

        let name = this.psgName;
        let data = {left: 0, top: this.topInset + this.h, width: 360, height: 150};
        let target = {left: 0, top: this.topInset + this.h / 4, width: this.w, height: 300};
        let vars = iframe.contentWindow.SugarCube.State.variables;
        let scene = vars.DL_currScene;
        // console.log(scene);

        if (!this.panels[name]) {
            let p = new Panel(data, target, name, this.txt, -1, scene, 'narration', this.topInset);
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
            p.setTopInset(this.topInset);
            p.panelSize = 'large';
            this.panelsOnscreen[name] = p;
        }
    }

    makeResponse(i) {
        let choice = this.links[i];
        let target = {left: 0, top: this.topInset + this.h / 5, width: this.w * 3 / 4, height: 300 * 3 / 4};
        for (let j in this.panelsOnscreen){
            let ps = this.panelsOnscreen[j];
            ps.setTarget(target);
        }

        let name = this.psgName + choice;
        let data = {left: 0, top: this.topInset + this.h, width: 100, height: 100};
        target = {left: this.w * 3 / 4, top: this.topInset + this.h / 3, width: 200, height: 200};
        vars = iframe.contentWindow.SugarCube.State.variables;
        let scene = vars.DL_currScene;
        console.log("makeresponese make response");
        console.log(vars);
        if (!this.panels[name]) {
            let p = new Panel(data, target, name, choice, i,scene, 'narration', this.topInset);
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
            p.setTopInset(this.topInset);
            p.panelSize = 'small';
            this.panelsOnscreen[name] = p;
        }
    }

    clickLink(i){

        this.psgName = this.links[i];
        this.clicked = i;
        if (loaded) {
            iframe.contentWindow.postMessage(
                { type: 'click', clicked: this.clicked, sessionId: activeSessionId },
                window.location.origin
            );
        }
    }

    tick() {
        for (let panel in this.panelsOnscreen){
            let p = this.panelsOnscreen[panel];
            if (!p.onScreen){
                // console.log(p.text + " removed");
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

        for (let i = 0; i < largePanels.length; i++) {
            const p = largePanels[i];
            const left = Math.max(0, p.data.left);
            const width = Math.max(50, this.w - left);
            const height = p.data.height;
            const top = Math.max(this.topInset, p.data.top);
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
            const top = Math.max(this.topInset, p.data.top);
            const target = {left, top, width, height};
            const shouldScale = p.isUpdating;
            p.setCurr(target, shouldScale);
            p.target = target;
            p.movingToTarget = {left:false, top:false, width:false, height:false};
            p.isUpdating = false;
        }
    }
}
