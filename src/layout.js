import { Panel } from './panel.js';

let loaded = false;
let started = false;
let iframe;
let vars = {};
let layout;
let activeSessionId = null;
window.DL_DEBUG_DELIVERY = true


window.onload = () =>{
    console.log("HIIIII");
    iframe = document.getElementById("logicEngine");
    const fileInput = document.getElementById("storyFile");
    const statusEl = document.getElementById("fileStatus");
    const storyStatusEl = document.getElementById("storyStatus");
    const storyToggleBtn = document.getElementById("storyToggleBtn");
    const defaultStoryUrl = "story.with-messaging.html";
    const refreshResets = true;
    let importedHtml = null;
    let importedName = null;
    let currentMode = 'default';
    let pendingStart = false;
    let refreshRestarted = false;
    let awaitingRefreshInit = false;

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
            if (refreshResets && currentMode === 'default' && !refreshRestarted) {
                refreshRestarted = true;
                awaitingRefreshInit = true;
                const targetOrigin = iframe.getAttribute('srcdoc') ? '*' : window.location.origin;
                iframe.contentWindow.postMessage({ type: "start" }, targetOrigin);
                return;
            }
            if (awaitingRefreshInit) {
                awaitingRefreshInit = false;
            }
            init(data.info);
        }

        if (data.type === "passage") {
            if (data.sessionId && data.sessionId !== activeSessionId) return;
            console.log("passage recieved");
            if (awaitingRefreshInit) return;
            if (!started){
                init(data.info);
            }
            layout.setPsgInfo(data.info);
            layout.setPanel();
        }
    });

    function resetLayout() {
        if (!layout) return;
        const uniquePanels = new Set([
            ...Object.values(layout.panels || {}),
            ...Object.values(layout.panelsOnscreen || {}),
        ]);
        for (const panel of uniquePanels) {
            if (panel?.delete) panel.delete();
        }
        layout.uiRoot?.remove();
        layout.destroy?.();
        layout.panels = {};
        layout.panelsOnscreen = {};
        layout.currPanel = null;
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

function stripHtml(html) {
    if (!html) return '';
    const el = document.createElement('div');
    el.innerHTML = html;
    return (el.textContent || '').replace(/\r\n/g, '\n');
}

function splitHtmlParagraphs(html) {
    const normalized = String(html || '')
        .replace(/\r\n/g, '\n')
        .replace(/\n\s*\n/g, '<br>');
    return normalized.split(/<br\s*\/?>/i);
}

function extractPanelCommands(text) {
    const commands = {};
    const source = String(text || '');
    const pattern = /(^|[^%])%%\s*([^%]+?)\s*%%(?!%)/g;
    let out = '';
    let lastIndex = 0;
    let match;

    const applyToken = (rawToken) => {
        const token = String(rawToken || '').trim().toLowerCase();
        if (!token) return;
        if (token === 'solo') {
            commands.solo = true;
            return;
        }
        const pair = token.split(/[:=]/);
        if (pair.length < 2) return;
        const key = pair[0].trim();
        const value = pair.slice(1).join('=').trim();
        if (!key) return;
        if (key === 'rows') {
            const n = Number(value);
            if (Number.isFinite(n)) commands.rows = Math.floor(n);
            return;
        }
        if (key === 'cols') {
            const n = Number(value);
            if (Number.isFinite(n)) commands.cols = Math.floor(n);
            return;
        }
        if (key === 'panels') {
            const v = String(value).toLowerCase();
            commands.panels = v === 'cycle' ? 'cycle' : 'stack';
            return;
        }
        if (key === 'aspect') {
            const v = String(value).toLowerCase();
            commands.aspect = v === 'fixed' ? 'fixed' : 'free';
        }
    };

    while ((match = pattern.exec(source)) !== null) {
        const fullStart = match.index;
        const prefix = match[1] || '';
        const commandBody = match[2] || '';
        out += source.slice(lastIndex, fullStart);
        out += prefix;
        lastIndex = pattern.lastIndex;
        const parts = commandBody.split(/[\s,;]+/).map((p) => p.trim()).filter(Boolean);
        for (const part of parts) {
            applyToken(part);
        }
    }

    out += source.slice(lastIndex);
    return { text: out, commands };
}

function parseSpeakerBlocks(text, sceneObjects) {
    // console.log(sceneObjects);
    const originalParas = splitHtmlParagraphs(text);
    const cleanedParas = originalParas.map((p) => stripHtml(p));
    const narrationParas = [];
    const speakers = [];

    for (let i = 0; i < cleanedParas.length; i++) {
        const para = cleanedParas[i].trim();
        if (!para) continue;
        const firstLine = para.split('\n').find((l) => l.trim().length > 0) || '';
        const line = firstLine.replace(/^(?:<br\s*\/?>\s*)+/gi, '').trim();
        if (!line) continue;
        const match = line.match(/^([^:]+)::\s*(.*)$/);
        if (!match) {
            narrationParas.push(originalParas[i] || '');
            continue;
        }
        const speaker = match[1].trim();
        if (!speaker || !sceneObjects || !sceneObjects[speaker]) {
            narrationParas.push(originalParas[i] || '');
            continue;
        }
        const originalPara = originalParas[i] || '';
        const splitIdx = originalPara.indexOf('::');
        let updatedPara = originalPara;
        if (splitIdx >= 0) {
            const after = originalPara.slice(splitIdx + 2);
            updatedPara = after.replace(/^\s+/, '').replace(/^(?:<br\s*\/?>\s*)+/gi, '');
        }
        speakers.push({ speaker, html: updatedPara.trim() });
    }

    return {
        speakers,
        narrationText: narrationParas.join('\n\n'),
    };
}

function buildSceneObjectMap(objs) {
    if (!objs) return {};
    if (Array.isArray(objs)) {
        const map = {};
        objs.forEach((obj, i) => {
            if (typeof obj === 'string') {
                const trimmed = obj.trim();
                let key = '';
                let spec = trimmed;
                const eqIdx = trimmed.indexOf('=');
                if (eqIdx > 0) {
                    key = trimmed.slice(0, eqIdx).trim();
                    spec = trimmed.slice(eqIdx + 1).trim();
                }
                if (key) {
                    map[key] = spec;
                } else {
                    const modelKey = (trimmed.split(/\s+/)[0] || '').toLowerCase();
                    if (modelKey) map[modelKey] = obj;
                }
            } else if (obj && typeof obj === 'object') {
                const key = (obj.id || obj.name || obj.model || `obj_${i}`);
                if (key) map[String(key)] = obj;
            }
            map[`obj_${i}`] = obj;
        });
        return map;
    }
    if (typeof objs === 'object') return objs;
    return {};
}

class LayoutUI {
    constructor() {
        this.pressed = false;
        this.txt = "";
        this.psgName = "";
        this.clicked = 0;
        this.links = [];
        this.showResponse = true;
        this.panelSolo = false;
        this.panelConfig = { panels: 'stack', rows: 1, cols: 1, aspect: 'free' };
        this.panelCommands = {};
        this.largePanelOrder = [];
        this.panelOrderCounter = 0;
        this.activePanelName = null;
        this.hoverPanelName = null;

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

        this.linksRoot = document.createElement('div');
        this.linksRoot.id = 'link-list';
        document.body.appendChild(this.linksRoot);

        this.inputRoot = document.createElement('div');
        this.inputRoot.id = 'input-list';
        this.inputRoot.style.display = 'none';
        document.body.appendChild(this.inputRoot);

        this.restartBtn = document.createElement('button');
        this.restartBtn.id = 'restartBtn';
        this.restartBtn.type = 'button';
        this.restartBtn.textContent = 'restart';
        this.restartBtn.addEventListener('click', () => this.restartStory());
        document.body.appendChild(this.restartBtn);

        this.selectedLinkIndex = 0;

        this.tick = this.tick.bind(this);
        requestAnimationFrame(this.tick);

        window.addEventListener('resize', () => this.onResize());
        window.addEventListener('keydown', (event) => this.onKeyDown(event));
        window.addEventListener('pointermove', (event) => this.onGlobalPointerMove(event), { passive: true, capture: true });
        window.addEventListener('mousemove', (event) => this.onGlobalPointerMove(event), { passive: true, capture: true });
    }

    destroy() {
        if (this.linksRoot) this.linksRoot.remove();
        if (this.inputRoot) this.inputRoot.remove();
        if (this.restartBtn) this.restartBtn.remove();
    }

    normalizePanelConfig(rawConfig) {
        const cfg = rawConfig && typeof rawConfig === 'object' ? rawConfig : {};
        const modeRaw = String(cfg.panels || 'stack').toLowerCase();
        const panels = modeRaw === 'cycle' ? 'cycle' : 'stack';
        const rows = Math.max(1, Math.min(3, Number.isFinite(Number(cfg.rows)) ? Math.floor(Number(cfg.rows)) : 1));
        const cols = Math.max(1, Math.min(3, Number.isFinite(Number(cfg.cols)) ? Math.floor(Number(cfg.cols)) : 1));
        const aspectRaw = String(cfg.aspect || 'free').toLowerCase();
        const aspect = aspectRaw === 'fixed' ? 'fixed' : 'free';
        return { panels, rows, cols, aspect };
    }

    getPanelCapacity() {
        return Math.max(1, this.panelConfig.rows * this.panelConfig.cols);
    }

    logPanelCount() {
        const count = Object.keys(this.panelsOnscreen).length;
        console.log('[layout] panelsOnscreen:', count);
    }

    reconcileLargePanelOrder() {
        const names = Object.keys(this.panelsOnscreen)
            .filter((name) => {
                const panel = this.panelsOnscreen[name];
                if (!panel) return false;
                if (panel.panelSize === 'small') return false;
                if (panel.onScreen === false) return false;
                if (panel.isAnimatingOut) return false;
                return true;
            })
            .sort((a, b) => {
                const pa = this.panelsOnscreen[a];
                const pb = this.panelsOnscreen[b];
                const sa = Number.isFinite(pa?.stackOrder) ? pa.stackOrder : 0;
                const sb = Number.isFinite(pb?.stackOrder) ? pb.stackOrder : 0;
                return sa - sb;
            });
        this.largePanelOrder = names;
    }

    getStackTargets(order) {
        const count = order.length;
        if (!count) return {};
        const maxRows = this.panelConfig.rows;
        const maxCols = this.panelConfig.cols;
        const usedCols = Math.min(maxCols, Math.max(1, count));
        const usedRows = Math.min(maxRows, Math.max(1, Math.ceil(count / usedCols)));

        const leftPad = Math.max(8, this.w * 0.02);
        const rightPad = leftPad;
        const topPad = Math.max(10, this.h * 0.04);
        const bottomPad = Math.max(120, this.h * 0.22);
        const areaTop = this.topInset + topPad;
        const areaWidth = Math.max(80, this.w - leftPad - rightPad);
        const areaHeight = Math.max(80, this.h - topPad - bottomPad);
        const gapX = Math.max(10, areaWidth * 0.03);
        const gapY = Math.max(10, areaHeight * 0.04);
        const slotWidth = Math.max(80, (areaWidth - gapX * (usedCols - 1)) / usedCols);
        const slotHeight = Math.max(80, (areaHeight - gapY * (usedRows - 1)) / usedRows);

        let cellWidth = slotWidth;
        let cellHeight = slotHeight;
        if (this.panelConfig.aspect === 'fixed') {
            const fullCellWidth = Math.max(80, (areaWidth - gapX * (maxCols - 1)) / maxCols);
            const fullCellHeight = Math.max(80, (areaHeight - gapY * (maxRows - 1)) / maxRows);
            const baseAspect = Math.max(0.1, fullCellWidth / Math.max(1, fullCellHeight));
            cellWidth = Math.min(slotWidth, slotHeight * baseAspect);
            cellHeight = cellWidth / baseAspect;
            if (cellHeight > slotHeight) {
                cellHeight = slotHeight;
                cellWidth = cellHeight * baseAspect;
            }
        }

        const targets = {};
        for (let i = 0; i < count; i++) {
            const name = order[i];
            const row = Math.floor(i / usedCols);
            const col = i % usedCols;
            const slotLeft = leftPad + col * (slotWidth + gapX);
            const slotTop = areaTop + row * (slotHeight + gapY);
            targets[name] = {
                left: slotLeft + (slotWidth - cellWidth) * 0.5,
                top: slotTop + (slotHeight - cellHeight) * 0.5,
                width: cellWidth,
                height: cellHeight,
            };
        }
        return targets;
    }

    applyLargePanelTargets(immediate = false) {
        const order = this.largePanelOrder.filter((name) => this.panelsOnscreen[name] && this.panelsOnscreen[name].panelSize !== 'small');
        this.largePanelOrder = order;
        const targets = this.getStackTargets(order);
        const count = order.length;
        const maxCols = this.panelConfig.cols;
        const usedCols = Math.min(maxCols, Math.max(1, count));
        const narrationGap = 6;
        for (let i = 0; i < order.length; i++) {
            const name = order[i];
            const panel = this.panelsOnscreen[name];
            if (!panel) continue;
            const target = targets[name];
            if (!target) continue;
            panel.setAspectMode?.(this.panelConfig.aspect);
            const row = Math.floor(i / usedCols);
            let narrationMinTop = null;
            let narrationFixedTop = this.topInset;
            if (row > 0) {
                const aboveName = order[i - usedCols];
                const aboveTarget = targets[aboveName];
                if (aboveTarget) {
                    narrationMinTop = aboveTarget.top + aboveTarget.height + narrationGap;
                    narrationFixedTop = narrationMinTop;
                }
            }
            panel.setNarrationMinTop?.(narrationMinTop);
            panel.setNarrationFixedTop?.(narrationFixedTop);
            if (immediate) {
                panel.setCurr(target, true);
                panel.target = target;
                panel.movingToTarget = {left:false, top:false, width:false, height:false};
                panel.isUpdating = false;
            } else {
                panel.setTarget(target);
            }
        }
    }

    setActiveLargePanel(activeName) {
        for (let i = 0; i < this.largePanelOrder.length; i++) {
            const name = this.largePanelOrder[i];
            const panel = this.panelsOnscreen[name];
            if (!panel || panel.panelSize === 'small') continue;
            panel.three?.setSpeakerAnimationPaused?.(name !== activeName);
        }
    }

    onResize() {
        this.topInset = this.getTopInset();
        this.w = window.innerWidth;
        this.h = Math.max(0, window.innerHeight - this.topInset);
        for (let panel in this.panelsOnscreen){
            this.panelsOnscreen[panel].topInset = this.topInset;
        }
        this.updateLinkLayout();
        this.updatePanelLayoutImmediate();
        for (let panel in this.panelsOnscreen){
            this.panelsOnscreen[panel].syncNarrationPosition?.();
        }
        this.applyPanelLayering();
    }

    getTopInset() {
        const topbar = document.getElementById('topbar');
        if (!topbar) return 0;
        return Math.max(0, Math.ceil(topbar.getBoundingClientRect().height));
    }

    onGlobalPointerMove(event) {
        const elements = document.elementsFromPoint(event.clientX, event.clientY);
        if (!elements || !elements.length) return;
        if (this.links && this.links.length > 0) {
            const btn = elements.find((el) => el?.classList?.contains('link-button'));
            if (btn && this.linksRoot.contains(btn)) {
                const buttons = Array.from(this.linksRoot.querySelectorAll('button.link-button'));
                const idx = buttons.indexOf(btn);
                if (idx >= 0 && idx !== this.selectedLinkIndex) {
                    this.selectedLinkIndex = idx;
                    this.updateSelectedLink();
                }
            }
        }

        const panelEl = elements.find((el) => el?.dataset?.panelId);
        const hoveredPanel = panelEl?.dataset?.panelId || null;
        if (hoveredPanel && this.panelsOnscreen[hoveredPanel]) {
            if (this.hoverPanelName !== hoveredPanel) {
                this.hoverPanelName = hoveredPanel;
                this.applyPanelLayering();
            }
        } else if (this.hoverPanelName) {
            this.hoverPanelName = null;
            this.applyPanelLayering();
        }
    }

    bindPanelHover(name, panel) {
        if (!panel || panel._layerHoverBound) return;
        const onEnter = () => {
            this.hoverPanelName = name;
            this.applyPanelLayering();
        };
        const onLeave = () => {
            if (this.hoverPanelName === name) {
                this.hoverPanelName = null;
                this.applyPanelLayering();
            }
        };
        for (const el of [panel.canvas, panel.textEl, panel.narrationEl]) {
            if (!el) continue;
            el.addEventListener('pointerenter', onEnter, { passive: true });
            el.addEventListener('pointerleave', onLeave, { passive: true });
        }
        panel._layerHoverBound = true;
    }

    applyPanelLayering() {
        const names = Object.keys(this.panelsOnscreen).filter((name) => {
            const p = this.panelsOnscreen[name];
            return p && p.onScreen !== false;
        });
        if (!names.length) return;
        names.sort((a, b) => {
            const pa = this.panelsOnscreen[a];
            const pb = this.panelsOnscreen[b];
            const sa = Number.isFinite(pa?.stackOrder) ? pa.stackOrder : 0;
            const sb = Number.isFinite(pb?.stackOrder) ? pb.stackOrder : 0;
            return sa - sb;
        });
        const hoverValid = this.hoverPanelName && this.panelsOnscreen[this.hoverPanelName];
        const activeValid = this.activePanelName && this.panelsOnscreen[this.activePanelName];
        const focus = hoverValid ? this.hoverPanelName : (activeValid ? this.activePanelName : names[names.length - 1]);
        this.activePanelName = focus;
        const ordered = names.filter((n) => n !== focus);
        if (focus) ordered.push(focus);
        for (let i = 0; i < ordered.length; i++) {
            const name = ordered[i];
            const panel = this.panelsOnscreen[name];
            if (!panel) continue;
            panel.setLayerPriority?.(i, name === focus);
            panel.setHovered?.(name === this.hoverPanelName);
        }
    }

    // initEventDebug() {
    //     if (!window.DL_DEBUG_EVENTS) return;
    //     let mouseMoves = 0;
    //     let pointerMoves = 0;
    //     let lastEventAt = 0;
    //     const stamp = () => {
    //         lastEventAt = performance.now();
    //     };
    //     const onMouse = () => { mouseMoves += 1; stamp(); };
    //     const onPointer = () => { pointerMoves += 1; stamp(); };
    //     window.addEventListener('mousemove', onMouse, { capture: true, passive: true });
    //     window.addEventListener('pointermove', onPointer, { capture: true, passive: true });
    //     document.addEventListener('mousemove', onMouse, { capture: true, passive: true });
    //     document.addEventListener('pointermove', onPointer, { capture: true, passive: true });
    //     setInterval(() => {
    //         console.log('[event-debug]', {
    //             mouseMoves,
    //             pointerMoves,
    //             hasFocus: document.hasFocus(),
    //             visibility: document.visibilityState,
    //             msSinceEvent: Math.round(performance.now() - lastEventAt),
    //         });
    //         mouseMoves = 0;
    //         pointerMoves = 0;
    //     }, 1000);
    // }

    // initPointerDebug() {
    //     if (!window.DL_DEBUG_POINTER) return;
    //     const overlay = document.createElement('div');
    //     overlay.id = 'pointer-debug-overlay';
    //     overlay.style.position = 'fixed';
    //     overlay.style.left = '0';
    //     overlay.style.top = '0';
    //     overlay.style.width = '0';
    //     overlay.style.height = '0';
    //     overlay.style.border = '2px solid rgba(255, 0, 0, 0.8)';
    //     overlay.style.background = 'rgba(255, 0, 0, 0.08)';
    //     overlay.style.zIndex = '2147483647';
    //     overlay.style.pointerEvents = 'none';
    //     document.body.appendChild(overlay);

    //     const label = document.createElement('div');
    //     label.id = 'pointer-debug-label';
    //     label.style.position = 'fixed';
    //     label.style.left = '0';
    //     label.style.top = '0';
    //     label.style.zIndex = '2147483647';
    //     label.style.pointerEvents = 'none';
    //     label.style.background = 'rgba(0, 0, 0, 0.75)';
    //     label.style.color = '#fff';
    //     label.style.font = '11px/1.2 "InconsolataLocal", "Inconsolata", Menlo, Monaco, Consolas, "Liberation Mono", monospace';
    //     label.style.padding = '2px 4px';
    //     label.style.borderRadius = '3px';
    //     document.body.appendChild(label);

    //     document.addEventListener('pointermove', (e) => {
    //         const x = e.clientX;
    //         const y = e.clientY;
    //         const el = document.elementFromPoint(x, y);
    //         if (!el) return;
    //         const rect = el.getBoundingClientRect();
    //         overlay.style.left = `${rect.left}px`;
    //         overlay.style.top = `${rect.top}px`;
    //         overlay.style.width = `${rect.width}px`;
    //         overlay.style.height = `${rect.height}px`;
    //         const name = el.id ? `#${el.id}` : (el.className ? `.${String(el.className).split(' ').join('.')}` : el.tagName.toLowerCase());
    //         label.textContent = `${el.tagName.toLowerCase()} ${name}`.trim();
    //         label.style.left = `${Math.min(window.innerWidth - 10, rect.left + 4)}px`;
    //         label.style.top = `${Math.max(0, rect.top - 18)}px`;
    //     }, { passive: true });

    //     document.addEventListener('pointerdown', (e) => {
    //         const x = e.clientX;
    //         const y = e.clientY;
    //         const el = document.elementFromPoint(x, y);
    //         if (!el) return;
    //         const style = window.getComputedStyle(el);
    //         const name = el.id ? `#${el.id}` : (el.className ? `.${String(el.className).split(' ').join('.')}` : el.tagName.toLowerCase());
    //         console.log('[pointer-debug] down', {
    //             tag: el.tagName.toLowerCase(),
    //             name,
    //             zIndex: style.zIndex,
    //             pointerEvents: style.pointerEvents,
    //             opacity: style.opacity,
    //             position: style.position,
    //         });
    //     }, { passive: true });
    // }

    onKeyDown(event) {
        const active = document.activeElement;
        if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || this.inputRoot?.contains(active))) {
            return;
        }
        if (event.key === 'r' || event.key === 'R') {
            this.restartStory();
        }
        if (!this.links || this.links.length === 0) return;
        if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
            event.preventDefault();
            this.selectedLinkIndex = (this.selectedLinkIndex - 1 + this.links.length) % this.links.length;
            this.updateSelectedLink();
            return;
        }
        if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
            event.preventDefault();
            this.selectedLinkIndex = (this.selectedLinkIndex + 1) % this.links.length;
            this.updateSelectedLink();
            return;
        }
        if (event.key === ' ' || event.key === 'Enter') {
            event.preventDefault();
            this.pressSelectedLink();
        }
    }

    restartStory() {
        if (!loaded) return;
        iframe.contentWindow.postMessage({ type: 'start' , passage: this.psgName}, window.location.origin);
        const uniquePanels = new Set([
            ...Object.values(this.panels || {}),
            ...Object.values(this.panelsOnscreen || {}),
        ]);
        for (const panel of uniquePanels) {
            if (panel?.delete) panel.delete();
        }
        this.panels = {};
        this.panelsOnscreen = {};
        this.currPanel = null;
        this.largePanelOrder = [];
    }

    updateLinkLayout() {
        const maxFont = (this.h * 0.8) / Math.max(1, this.links.length);
        this.fontSize = Math.min(22, maxFont);
        this.bx = this.w / 100;
        this.bd = this.fontSize * 1.2;
        this.linkGap = Math.max(8, this.fontSize * 0.3);
        const bottomPad = Math.max(48, this.fontSize * 2);
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
        const textPaddingX = Math.round(this.fontSize * 1.1);
        for (const btn of buttons) {
            const text = btn.textContent || '';
            measure.textContent = text;
            const textWidth = Math.ceil(measure.getBoundingClientRect().width + textPaddingX);
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
        this.updateFormUILayout();
    }

    renderLinks() {
        const existingButtons = Array.from(this.linksRoot.querySelectorAll('button.link-button'));
        const measure = document.createElement('span');
        measure.style.position = 'absolute';
        measure.style.visibility = 'hidden';
        measure.style.whiteSpace = 'pre';
        measure.style.fontFamily = '"InconsolataLocal", "Inconsolata", Menlo, Monaco, Consolas, "Liberation Mono", monospace';
        measure.style.fontSize = `${this.fontSize}px`;
        document.body.appendChild(measure);
        for (let i = 0; i < this.links.length; i++){
            const label = this.links[i];
            let btn = existingButtons[i];
            if (!btn) {
                btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'link-button';
                this.linksRoot.appendChild(btn);
            }
            btn.textContent = label;
            btn.style.marginBottom = `${this.linkGap}px`;
            btn.dataset.index = String(i);
            if (!btn.dataset.bound) {
                btn.addEventListener('mouseenter', (event) => {
                    const idx = Number(event.currentTarget?.dataset?.index);
                    if (Number.isFinite(idx)) {
                        this.selectedLinkIndex = idx;
                        this.updateSelectedLink();
                    }
                });
                btn.addEventListener('click', (event) => {
                    const idx = Number(event.currentTarget?.dataset?.index);
                    if (Number.isFinite(idx)) this.pressLink(idx);
                });
                btn.dataset.bound = 'true';
            }
            measure.textContent = label;
            const textPaddingX = Math.round(this.fontSize * 1.1);
            const textWidth = Math.ceil(measure.getBoundingClientRect().width + textPaddingX);
            const maxWidth = Math.max(50, this.w - this.bx * 2);
            if (textWidth > maxWidth) {
                btn.style.width = `${maxWidth}px`;
                btn.style.whiteSpace = 'normal';
            } else {
                btn.style.width = `${textWidth}px`;
                btn.style.whiteSpace = 'nowrap';
            }
        }
        for (let i = existingButtons.length - 1; i >= this.links.length; i--) {
            existingButtons[i].remove();
        }
        measure.remove();
        this.updateLinkLayout();
        this.updateSelectedLink();
    }

    renderFormUI() {
        const formUI = this.formUI;
        const fieldSpec = formUI?.field;
        const buttonSpec = formUI?.button;
        const hasField = Boolean(fieldSpec && (fieldSpec.tag || fieldSpec.type || fieldSpec.placeholder || fieldSpec.value));
        const hasButton = Boolean(buttonSpec && (buttonSpec.text || buttonSpec.id));

        if (!hasField && !hasButton) {
            this.inputRoot.innerHTML = '';
            this.inputRoot.style.display = 'none';
            this.formFieldEl = null;
            this.formButtonEl = null;
            return;
        }

        this.inputRoot.style.display = 'flex';
        this.inputRoot.style.fontSize = `${this.fontSize}px`;
        this.inputRoot.style.lineHeight = `${this.bd}px`;
        this.inputRoot.style.gap = `${Math.max(6, this.fontSize * 0.35)}px`;

        if (hasField) {
            let el = this.formFieldEl;
            const tag = (fieldSpec.tag || 'input').toLowerCase();
            const needsTextarea = tag === 'textarea';
            if (!el || (needsTextarea && el.tagName.toLowerCase() !== 'textarea') || (!needsTextarea && el.tagName.toLowerCase() !== 'input')) {
                if (el) el.remove();
                el = document.createElement(needsTextarea ? 'textarea' : 'input');
                el.className = 'ui-input';
                if (!needsTextarea) el.type = fieldSpec.type || 'text';
                el.addEventListener('input', (event) => {
                    this.sendUIInput(event.currentTarget?.value || '');
                });
                this.inputRoot.appendChild(el);
                this.formFieldEl = el;
            }
            if (typeof fieldSpec.placeholder === 'string') {
                el.placeholder = fieldSpec.placeholder;
            } else {
                el.removeAttribute('placeholder');
            }
            if (typeof fieldSpec.value === 'string') {
                el.value = fieldSpec.value;
            }
        } else if (this.formFieldEl) {
            this.formFieldEl.remove();
            this.formFieldEl = null;
        }

        if (hasButton) {
            let btn = this.formButtonEl;
            if (!btn) {
                btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'ui-submit';
                btn.addEventListener('click', () => this.sendUIButton());
                this.inputRoot.appendChild(btn);
                this.formButtonEl = btn;
            }
            btn.textContent = buttonSpec.text || 'submit';
        } else if (this.formButtonEl) {
            this.formButtonEl.remove();
            this.formButtonEl = null;
        }

        this.updateFormUILayout();
    }

    updateFormUILayout() {
        if (!this.inputRoot || this.inputRoot.style.display === 'none') return;
        this.inputRoot.style.left = `${this.bx}px`;

        const linkRect = this.linksRoot.getBoundingClientRect();
        const inputRect = this.inputRoot.getBoundingClientRect();
        const gap = Math.max(8, this.fontSize * 0.5);
        let top = linkRect.top - inputRect.height - gap;
        if (!this.links || this.links.length === 0 || !Number.isFinite(top)) {
            const bottomPad = Math.max(48, this.fontSize * 2);
            top = Math.max(this.topInset + gap, this.h - inputRect.height - bottomPad);
        } else {
            top = Math.max(this.topInset + gap, top);
        }
        this.inputRoot.style.top = `${top}px`;

        const maxWidth = Math.max(180, this.w - this.bx * 2);
        if (this.formFieldEl) {
            this.formFieldEl.style.width = `${maxWidth}px`;
        }
        if (this.formButtonEl) {
            this.formButtonEl.style.width = `${Math.min(maxWidth, Math.max(160, this.fontSize * 8))}px`;
        }
    }

    sendUIInput(value) {
        if (!loaded) return;
        iframe.contentWindow.postMessage(
            { type: 'uiInput', value: String(value ?? '') },
            window.location.origin
        );
    }

    sendUIButton() {
        if (!loaded) return;
        iframe.contentWindow.postMessage(
            { type: 'uiButton' },
            window.location.origin
        );
    }

    pressSelectedLink() {
        this.pressLink(this.selectedLinkIndex);
    }

    pressLink(index) {
        if (this.pressed) return;
        const buttons = this.linksRoot.querySelectorAll('button.link-button');
        const btn = buttons[index];
        if (!btn) return;
        btn.classList.add('pressed');
        this.pressed = true;
        const iframeEl = document.getElementById('logicEngine');
        if (iframeEl && iframeEl.blur) iframeEl.blur();
        if (document.activeElement && document.activeElement.blur) {
            document.activeElement.blur();
        }
        if (document.body && document.body.focus) {
            document.body.focus({ preventScroll: true });
        }
        if (window.focus) window.focus();
        if (this.showResponse) {
            this.makeResponse(index);
        } else {
            this.clickLink(index);
        }
    }

    updateSelectedLink() {
        const buttons = this.linksRoot.querySelectorAll('button.link-button');
        buttons.forEach((btn, idx) => {
            btn.classList.toggle('selected', idx === this.selectedLinkIndex);
        });
    }

    setPsgInfo(info) {
       
        this.psgName = info.psgName;
        vars = iframe.contentWindow.SugarCube.State.variables;
        const baseConfig = this.normalizePanelConfig(vars?.DL?.config);
        const baseSolo = vars?.DL_solo === true;
        const cleaned = cleanText(info.passage);
        const extracted = extractPanelCommands(cleaned);
        this.panelCommands = extracted.commands || {};
        const mergedConfig = {
            ...baseConfig,
            ...(this.panelCommands.panels ? { panels: this.panelCommands.panels } : {}),
            ...(Number.isFinite(this.panelCommands.rows) ? { rows: this.panelCommands.rows } : {}),
            ...(Number.isFinite(this.panelCommands.cols) ? { cols: this.panelCommands.cols } : {}),
            ...(this.panelCommands.aspect ? { aspect: this.panelCommands.aspect } : {}),
        };
        this.panelConfig = this.normalizePanelConfig(mergedConfig);
        this.panelSolo = this.panelCommands.solo === true ? true : baseSolo;
        // console.log(vars?.DL?.objects);
        const sceneObjects = buildSceneObjectMap(vars?.DL?.objects);
        const parsed = parseSpeakerBlocks(extracted.text, sceneObjects);
        this.speakers = parsed.speakers || [];
        this.txt = parsed.narrationText || '';
        this.links = info.links || [];
        this.showResponse = vars?.DL?.show_response === true;
        this.formUI = info.formUI || null;
        this.selectedLinkIndex = 0;
        this.pressed = false;
        this.renderLinks();
        this.renderFormUI();
    }

    setPanel() {
        const mode = this.panelConfig?.panels || 'stack';
        const capacity = this.getPanelCapacity();
        const name = this.psgName;
        const isStack = mode === 'stack';
        if (this.panelSolo) {
            const keys = Object.keys(this.panelsOnscreen);
            const offscreen = {left: 0, top: this.topInset - 400, width: 360, height: 150};
            for (let i = 0; i < keys.length; i++) {
                const key = keys[i];
                const panel = this.panelsOnscreen[key];
                if (!panel || key === name) continue;
                panel.three?.setSpeakerAnimationPaused?.(true);
                panel.setTarget(offscreen, { animateOut: true });
            }
            this.largePanelOrder = [];
        }
        this.reconcileLargePanelOrder();
        const existingOnscreenPanel = this.panelsOnscreen[name];
        const isAlreadyOnscreenLarge = Boolean(
            existingOnscreenPanel &&
            existingOnscreenPanel.panelSize !== 'small' &&
            existingOnscreenPanel.onScreen !== false &&
            !existingOnscreenPanel.isAnimatingOut
        );
        const projectedSet = new Set(this.largePanelOrder);
        projectedSet.add(name);
        const projectedCount = projectedSet.size;
        if (isStack && projectedCount > capacity) {
            const offscreen = {left: 0, top: this.topInset - 400, width: 360, height: 150};
            for (let i = 0; i < this.largePanelOrder.length; i++) {
                const key = this.largePanelOrder[i];
                const ps = this.panelsOnscreen[key];
                if (!ps) continue;
                ps.three?.setSpeakerAnimationPaused?.(true);
                ps.setTarget(offscreen, { animateOut: true });
            }
            this.largePanelOrder = [];
        }

        let data = {left: 0, top: this.topInset + this.h, width: 360, height: 150};
        let target = {left: 0, top: this.topInset + this.h / 4, width: this.w, height: 300};
        let vars = iframe.contentWindow.SugarCube.State.variables;
        let scene = vars.DL;
        console.log(scene);

        if (!this.panels[name]) {
            let p = new Panel(data, target, name, this.txt, -1, scene, 'narration', this.topInset);
            p.setAspectMode?.(this.panelConfig.aspect);
            if (this.speakers?.length) p.setSpeakers(this.speakers);
            p.panelSize = 'large';
            p.stackOrder = ++this.panelOrderCounter;
            this.panels[name] = p;
            this.currPanel = p;
            this.panelsOnscreen[name] = p;
            this.bindPanelHover(name, p);
        } else {
            let p = this.panels[name];
            this.currPanel = p;
            p.setLink(-1);
            if (!isAlreadyOnscreenLarge) {
                p.setCurr(data);
                p.setTarget(target);
            }
            p.setTxt(this.txt);
            p.setSpeakers(this.speakers || []);
            p.setScene(scene);
            p.setTopInset(this.topInset);
            p.setAspectMode?.(this.panelConfig.aspect);
            p.panelSize = 'large';
            p.stackOrder = ++this.panelOrderCounter;
            this.panelsOnscreen[name] = p;
            this.bindPanelHover(name, p);
        }
        if (isStack) {
            this.largePanelOrder = this.largePanelOrder.filter((key) => key !== name);
            this.largePanelOrder.push(name);
            this.applyLargePanelTargets(false);
            this.setActiveLargePanel(name);
        } else {
            this.panelsOnscreen[name]?.setNarrationMinTop?.(null);
            this.panelsOnscreen[name]?.setNarrationFixedTop?.(null);
            let offscreen = {left: 0, top: this.topInset - 400, width: 360, height: 150};
            for (let i in this.panelsOnscreen){
                let ps = this.panelsOnscreen[i];
                if (ps === this.panelsOnscreen[name]) continue;
                ps.setNarrationMinTop?.(null);
                ps.setNarrationFixedTop?.(null);
                ps.setTarget(offscreen);
            }
            this.largePanelOrder = [name];
            this.setActiveLargePanel(name);
        }
        this.activePanelName = name;
        this.applyPanelLayering();
        this.logPanelCount();
    }

    makeResponse(i) {
        let choice = this.links[i];
        let target = {left: 0, top: this.topInset + this.h / 5, width: this.w * 3 / 4, height: 300 * 3 / 4};
        for (let j in this.panelsOnscreen){
            let ps = this.panelsOnscreen[j];
            ps.setTarget(target, { animateOut: true });
        }

        let name = this.psgName + choice;
        let data = {left: 0, top: this.topInset + this.h, width: 100, height: 100};
        target = {left: this.w * 3 / 4, top: this.topInset + this.h / 3, width: 200, height: 200};
        vars = iframe.contentWindow.SugarCube.State.variables;
        let scene = vars.DL;
        // console.log("makeresponese make response");
        // console.log(vars);
        if (!this.panels[name]) {
            let p = new Panel(data, target, name, choice, i,scene, 'narration', this.topInset);
            p.panelSize = 'small';
            this.panels[name] = p;
            this.currPanel = p;
            this.panelsOnscreen[name] = p;
            this.bindPanelHover(name, p);
        } else {
            let p = this.panels[name];
            p.setLink(i);
            this.currPanel = p;
            p.setCurr(data);
            p.setTarget(target);
            p.setTopInset(this.topInset);
            p.panelSize = 'small';
            this.panelsOnscreen[name] = p;
            this.bindPanelHover(name, p);
        }
        this.activePanelName = name;
        this.applyPanelLayering();
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
                this.largePanelOrder = this.largePanelOrder.filter((key) => key !== panel);
                if (this.activePanelName === panel) this.activePanelName = null;
                if (this.hoverPanelName === panel) this.hoverPanelName = null;
                this.applyPanelLayering();
                this.logPanelCount();
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

        if ((this.panelConfig?.panels || 'stack') === 'stack' && this.largePanelOrder.length) {
            this.applyLargePanelTargets(true);
        } else {
            for (let i = 0; i < largePanels.length; i++) {
                const p = largePanels[i];
                p.setNarrationMinTop?.(null);
                p.setNarrationFixedTop?.(null);
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
