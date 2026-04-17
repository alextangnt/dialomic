import * as THREE from 'three';
import { Panel } from './panel.js';

const VISUAL_EDITOR_STATE_KEY = 'DL_VISUAL_EDITOR_STATE_V1';
const VIEWER_IMPORTED_STORY_KEY = 'DL_IMPORTED_STORY_HTML';
const BACKGROUND_KEY = '__background__';
const FALLBACK_ANIMAL_ASSET_NAMES = ['cat', 'cow', 'deer', 'hare', 'rat', 'wolf'];
const FALLBACK_BACKGROUND_ASSET_NAMES = ['ballpark', 'beach', 'bus_stop', 'tennis_court'];
let ANIMAL_ASSET_NAMES = [...FALLBACK_ANIMAL_ASSET_NAMES];
let BACKGROUND_ASSET_NAMES = [...FALLBACK_BACKGROUND_ASSET_NAMES];

const el = {
    file: document.getElementById('editorFile'),
    exportBtn: document.getElementById('exportBtn'),
    previewStoryBtn: document.getElementById('previewStoryBtn'),
    formatText: document.getElementById('formatText'),
    passageSelect: document.getElementById('passageSelect'),
    passageBody: document.getElementById('passageBody'),
    applyBtn: document.getElementById('applyBtn'),
    modelSelect: document.getElementById('modelSelect'),
    gizmoMode: document.getElementById('gizmoMode'),
    saveSceneBtn: document.getElementById('saveSceneBtn'),
    viewerLink: document.getElementById('viewerLink'),
    stage: document.getElementById('previewStage'),
    previewPane: document.querySelector('.preview-pane'),
    panelAspectHandle: document.getElementById('panelAspectHandle'),
    selectedModelBadge: document.getElementById('selectedModelBadge'),
    selectedModelLabel: document.getElementById('selectedModelLabel'),
    selectedEnvironmentControls: document.getElementById('selectedEnvironmentControls'),
    selectedEnvironmentLabel: document.getElementById('selectedEnvironmentLabel'),
    selectedBackgroundSelect: document.getElementById('selectedBackgroundSelect'),
    selectedSkyColorInput: document.getElementById('selectedSkyColorInput'),
    selectedEnvironmentResetBtn: document.getElementById('selectedEnvironmentResetBtn'),
    selectedDeleteModelBtn: document.getElementById('selectedDeleteModelBtn'),
    addModelAssetSelect: document.getElementById('addModelAssetSelect'),
    addModelBtn: document.getElementById('addModelBtn'),
    clearSceneBtn: document.getElementById('clearSceneBtn'),
    floatingModelButtons: document.getElementById('floatingModelButtons'),
    floatingAddSpeechBtn: document.getElementById('floatingAddSpeechBtn'),
    cameraTools: document.getElementById('cameraTools'),
    saveCameraBtn: document.getElementById('saveCameraBtn'),
    revertCameraBtn: document.getElementById('revertCameraBtn'),
    floatingDeleteModelBtn: document.getElementById('floatingDeleteModelBtn'),
    floatingModeTranslateBtn: document.getElementById('floatingModeTranslateBtn'),
    floatingModeRotateBtn: document.getElementById('floatingModeRotateBtn'),
    floatingModeScaleBtn: document.getElementById('floatingModeScaleBtn'),
    links: document.getElementById('previewLinks'),
    status: document.getElementById('statusBar'),
    unsavedDialog: document.getElementById('unsavedDialog'),
    dialogSaveBtn: document.getElementById('dialogSaveBtn'),
    dialogDiscardBtn: document.getElementById('dialogDiscardBtn'),
    dialogCancelBtn: document.getElementById('dialogCancelBtn'),
};

const state = {
    format: null, // html | twee
    filename: '',
    sourceHtmlTemplate: '',
    passages: [],
    storyInitBody: '',
    vars: {},
    selected: -1,
    panel: null,
    previewRaf: 0,
    editableModelKeys: [],
    selectedModelKey: null,
    lastModelKeySignature: '',
    lastSceneConfig: null,
    panelAspectOverride: null,
    panelRectCache: null,
    draggingAspect: false,
    debugMode: false,
    hasUnsavedChanges: false,
    hasTextEdits: false,
    hasSceneEdits: false,
    pendingSelectionKey: null,
    environmentUndo: null,
    textDraft: { narration: '', narrationRaw: '', hiddenTail: '', speakers: [] },
    activeInlineEditor: null,
    selectedBubbleIndex: null,
    savedCameraByPassage: {},
    implicitCameraByPassage: {},
};
const IGNORED_PASSAGES = new Set(['StoryTitle', 'StoryData']);

function setStatus(msg) {
    if (el.status) el.status.textContent = msg;
}

function setDirty(next) {
    state.hasUnsavedChanges = Boolean(next);
    if (el.saveSceneBtn) el.saveSceneBtn.classList.toggle('dirty', state.hasUnsavedChanges);
}

function setTextDirty(next) {
    state.hasTextEdits = Boolean(next);
    setDirty(state.hasTextEdits || state.hasSceneEdits);
}

function setSceneDirty(next) {
    state.hasSceneEdits = Boolean(next);
    setDirty(state.hasTextEdits || state.hasSceneEdits);
}

function getCurrentPassageKey() {
    const p = state.passages[state.selected];
    if (!p) return '';
    return `${state.selected}:${p.name}`;
}

function refreshCameraButtons() {
    const three = state.panel?.three;
    const hasPanel = Boolean(three);
    const passageKey = getCurrentPassageKey();
    const saved = passageKey ? state.savedCameraByPassage[passageKey] : null;
    const implicit = passageKey ? state.implicitCameraByPassage[passageKey] : null;
    const baseline = saved || implicit || null;
    const current = hasPanel && three.getCameraSpecSnapshot ? three.getCameraSpecSnapshot() : null;
    const sameAsBaseline = current && baseline ? cameraSpecsEqual(current, baseline) : false;
    if (el.saveCameraBtn) {
        el.saveCameraBtn.disabled = !hasPanel || sameAsBaseline;
    }
    if (el.revertCameraBtn) {
        el.revertCameraBtn.disabled = !hasPanel || !baseline || sameAsBaseline;
    }
    positionCameraTools();
}

function maybeCaptureImplicitCamera() {
    const three = state.panel?.three;
    if (!three?.getCameraSpecSnapshot) return;
    const key = getCurrentPassageKey();
    if (!key || state.implicitCameraByPassage[key]) return;
    if (Number(three.pendingShotModels || 0) > 0) return;
    const snapshot = three.getCameraSpecSnapshot();
    if (!snapshot) return;
    state.implicitCameraByPassage[key] = cloneSceneSpec(snapshot);
}

function cameraSpecsEqual(a, b, eps = 1e-6) {
    if (!a || !b) return false;
    const getVec = (v) => Array.isArray(v) ? v : [v?.x, v?.y, v?.z];
    const avp = getVec(a.position);
    const bvp = getVec(b.position);
    const avt = getVec(a.target);
    const bvt = getVec(b.target);
    const close = (x, y) => Number.isFinite(Number(x)) && Number.isFinite(Number(y)) && Math.abs(Number(x) - Number(y)) <= eps;
    return close(avp[0], bvp[0]) && close(avp[1], bvp[1]) && close(avp[2], bvp[2]) &&
        close(avt[0], bvt[0]) && close(avt[1], bvt[1]) && close(avt[2], bvt[2]) &&
        close(a.fov, b.fov) && close(a.near, b.near) && close(a.far, b.far);
}

function positionCameraTools() {
    if (!el.cameraTools || !state.panelRectCache || !el.previewPane) return;
    const paneRect = el.previewPane.getBoundingClientRect();
    const panelRect = state.panelRectCache;
    const narrationRect = state.panel?.narrationEl?.getBoundingClientRect?.();
    let top = panelRect.top - paneRect.top + 10;
    if (narrationRect && narrationRect.height > 0) {
        top = Math.min(
            panelRect.top - paneRect.top + panelRect.height - 34,
            narrationRect.bottom - paneRect.top + 6
        );
    }
    const right = paneRect.right - (panelRect.left + panelRect.width) + 10;
    el.cameraTools.style.top = `${Math.max(6, top)}px`;
    el.cameraTools.style.right = `${Math.max(6, right)}px`;
}

function initAssetDropdown() {
    if (!el.addModelAssetSelect) return;
    el.addModelAssetSelect.innerHTML = '';
    const names = ANIMAL_ASSET_NAMES.length ? ANIMAL_ASSET_NAMES : FALLBACK_ANIMAL_ASSET_NAMES;
    for (const name of names) {
        const opt = document.createElement('option');
        opt.value = name;
        opt.textContent = name;
        el.addModelAssetSelect.appendChild(opt);
    }
}

function initBackgroundDropdown() {
    const applyOptions = (selectEl, includeNoneLabel = null) => {
        if (!selectEl) return;
        selectEl.innerHTML = '';
        if (includeNoneLabel) {
            const none = document.createElement('option');
            none.value = '';
            none.textContent = includeNoneLabel;
            selectEl.appendChild(none);
        }
        const names = BACKGROUND_ASSET_NAMES.length ? BACKGROUND_ASSET_NAMES : FALLBACK_BACKGROUND_ASSET_NAMES;
        for (const name of names) {
            const opt = document.createElement('option');
            opt.value = name;
            opt.textContent = name;
            selectEl.appendChild(opt);
        }
    };
    applyOptions(el.selectedBackgroundSelect, '(No background)');
}

async function loadAssetNamesFromManifest() {
    const base = import.meta.env.BASE_URL || '/';
    const loadList = async (path, fallback) => {
        try {
            const resp = await fetch(`${base}${path}`);
            if (!resp.ok) return fallback;
            const data = await resp.json();
            if (!Array.isArray(data)) return fallback;
            return data
                .map((v) => String(v || '').trim().replace(/\.glb$/i, ''))
                .filter(Boolean)
                .sort((a, b) => a.localeCompare(b));
        } catch {
            return fallback;
        }
    };
    ANIMAL_ASSET_NAMES = await loadList('assets/animals/manifest.json', FALLBACK_ANIMAL_ASSET_NAMES);
    BACKGROUND_ASSET_NAMES = await loadList('assets/backgrounds/manifest.json', FALLBACK_BACKGROUND_ASSET_NAMES);
    initAssetDropdown();
    initBackgroundDropdown();
}

function refreshSelectedModelBadge() {
    if (!state.panelRectCache || !el.previewPane) return;
    if (!state.selectedModelKey) {
        if (el.selectedModelBadge) el.selectedModelBadge.style.display = 'none';
        if (el.selectedEnvironmentControls) el.selectedEnvironmentControls.style.display = 'none';
        return;
    }
    const paneRect = el.previewPane.getBoundingClientRect();
    const rect = state.panelRectCache;
    const key = state.selectedModelKey;
    const isBackground = key === BACKGROUND_KEY;
    const left = `${rect.left - paneRect.left + 6}px`;
    const top = `${rect.top - paneRect.top + rect.height + 10}px`;

    if (!isBackground) {
        if (el.selectedEnvironmentControls) el.selectedEnvironmentControls.style.display = 'none';
        if (el.selectedModelLabel) {
            el.selectedModelLabel.textContent = `Selected: ${key}`;
            el.selectedModelLabel.style.display = 'inline';
        } else if (el.selectedModelBadge) {
            el.selectedModelBadge.textContent = `Selected: ${key}`;
        }
        if (el.selectedDeleteModelBtn) {
            el.selectedDeleteModelBtn.disabled = false;
            el.selectedDeleteModelBtn.style.display = 'inline-block';
        }
        if (el.selectedModelBadge) {
            el.selectedModelBadge.style.display = 'block';
            el.selectedModelBadge.style.left = left;
            el.selectedModelBadge.style.top = top;
        }
        return;
    }

    if (el.selectedModelBadge) el.selectedModelBadge.style.display = 'none';
    if (el.selectedEnvironmentControls) {
        el.selectedEnvironmentControls.style.display = 'flex';
        el.selectedEnvironmentControls.style.left = left;
        el.selectedEnvironmentControls.style.top = top;
    }
}

function refreshEnvironmentControlsFromPassage() {
    const p = state.passages[state.selected];
    if (!p) return;
    const scene = buildSceneFromPassage(p.body, state.vars) || {};
    const env = getSceneEnvironment(scene);
    if (el.selectedBackgroundSelect) {
        el.selectedBackgroundSelect.value = env.backgroundName || '';
    }
    if (el.selectedSkyColorInput) {
        el.selectedSkyColorInput.value = env.skyColor;
    }
}

function setFloatingModeActive(mode) {
    const m = String(mode || 'translate').toLowerCase();
    el.floatingModeTranslateBtn?.classList.toggle('active', m === 'translate');
    el.floatingModeRotateBtn?.classList.toggle('active', m === 'rotate');
    el.floatingModeScaleBtn?.classList.toggle('active', m === 'scale');
}

function getModelScreenRect(panel, key) {
    const bounds = panel?.three?.getModelBoundsByKey?.(key);
    if (!bounds?.box || !panel?.three?.worldToScreen) return null;
    const box = bounds.box;
    const corners = [
        new THREE.Vector3(box.min.x, box.min.y, box.min.z),
        new THREE.Vector3(box.min.x, box.min.y, box.max.z),
        new THREE.Vector3(box.min.x, box.max.y, box.min.z),
        new THREE.Vector3(box.min.x, box.max.y, box.max.z),
        new THREE.Vector3(box.max.x, box.min.y, box.min.z),
        new THREE.Vector3(box.max.x, box.min.y, box.max.z),
        new THREE.Vector3(box.max.x, box.max.y, box.min.z),
        new THREE.Vector3(box.max.x, box.max.y, box.max.z),
    ];
    const canvasRect = panel.canvas.getBoundingClientRect();
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const c of corners) {
        const s = panel.three.worldToScreen(c);
        const x = canvasRect.left + s.x;
        const y = canvasRect.top + s.y;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
    }
    if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
        return null;
    }
    return { left: minX, top: minY, right: maxX, bottom: maxY };
}

function getModelScreenCenter(panel, key) {
    const model = panel?.three?.getModelByKey?.(key);
    if (!model || !panel?.three?.worldToScreen) return null;
    const world = model.getWorldPosition(new THREE.Vector3());
    const screen = panel.three.worldToScreen(world);
    const canvasRect = panel.canvas.getBoundingClientRect();
    return {
        x: canvasRect.left + screen.x,
        y: canvasRect.top + screen.y,
    };
}

function refreshFloatingDeleteButton() {
    if (!el.floatingModelButtons || !el.previewPane || !state.panel || !state.selectedModelKey) {
        if (el.floatingModelButtons) el.floatingModelButtons.style.display = 'none';
        if (el.floatingAddSpeechBtn) el.floatingAddSpeechBtn.style.display = 'none';
        return;
    }
    const paneRect = el.previewPane.getBoundingClientRect();
    const center = getModelScreenCenter(state.panel, state.selectedModelKey);
    const cx = center ? center.x : (state.panelRectCache ? state.panelRectCache.left + state.panelRectCache.width * 0.5 : paneRect.left + paneRect.width * 0.5);
    const cy = center ? center.y : (state.panelRectCache ? state.panelRectCache.top + state.panelRectCache.height * 0.5 : paneRect.top + paneRect.height * 0.5);
    // Keep controls under the model at a fixed screen-space distance.
    const ringDistancePx = 25;
    const x = cx - paneRect.left;
    const y = cy - paneRect.top + ringDistancePx;
    el.floatingModelButtons.style.display = 'flex';
    el.floatingModelButtons.style.left = `${x}px`;
    el.floatingModelButtons.style.top = `${y}px`;
    if (el.floatingDeleteModelBtn) {
        el.floatingDeleteModelBtn.style.display = 'inline-block';
        const isEnvironment = state.selectedModelKey === BACKGROUND_KEY;
        el.floatingDeleteModelBtn.title = isEnvironment ? 'Undo environment change' : 'Undo selected model transform';
        el.floatingDeleteModelBtn.setAttribute('aria-label', el.floatingDeleteModelBtn.title);
    }
    if (el.floatingAddSpeechBtn) {
        const isEnvironment = state.selectedModelKey === BACKGROUND_KEY;
        if (isEnvironment) {
            el.floatingAddSpeechBtn.style.display = 'none';
        } else {
            el.floatingAddSpeechBtn.style.display = 'inline-block';
            el.floatingAddSpeechBtn.style.left = `${x}px`;
            el.floatingAddSpeechBtn.style.top = `${Math.max(0, cy - paneRect.top - (ringDistancePx + 16))}px`;
        }
    }
}

function showUnsavedDialog() {
    return new Promise((resolve) => {
        if (!el.unsavedDialog) {
            resolve('discard');
            return;
        }
        el.unsavedDialog.hidden = false;
        const cleanup = () => {
            el.unsavedDialog.hidden = true;
            el.dialogSaveBtn?.removeEventListener('click', onSave);
            el.dialogDiscardBtn?.removeEventListener('click', onDiscard);
            el.dialogCancelBtn?.removeEventListener('click', onCancel);
        };
        const onSave = () => { cleanup(); resolve('save'); };
        const onDiscard = () => { cleanup(); resolve('discard'); };
        const onCancel = () => { cleanup(); resolve('cancel'); };
        el.dialogSaveBtn?.addEventListener('click', onSave);
        el.dialogDiscardBtn?.addEventListener('click', onDiscard);
        el.dialogCancelBtn?.addEventListener('click', onCancel);
    });
}

async function runWithUnsavedGuard(action, { onSave } = {}) {
    if (!state.hasUnsavedChanges) {
        await Promise.resolve(action());
        return;
    }
    const choice = await showUnsavedDialog();
    if (choice === 'cancel') return;
    if (choice === 'save' && typeof onSave === 'function') {
        await Promise.resolve(onSave());
    }
    setTextDirty(false);
    setSceneDirty(false);
    await Promise.resolve(action());
}

function updatePreviewStoryButton() {
    if (!el.previewStoryBtn) return;
    const isHtml = state.format === 'html';
    el.previewStoryBtn.disabled = !isHtml;
    el.previewStoryBtn.classList.toggle('enabled', isHtml);
    if (isHtml) {
        el.previewStoryBtn.title = 'Open viewer';
    } else {
        el.previewStoryBtn.title = 'compile locally first, then import to viewer directly';
    }
}

function initDebugMode() {
    const params = new URLSearchParams(window.location.search);
    state.debugMode = params.get('debug') === '1';
    document.body.classList.toggle('debug-mode', state.debugMode);
}

function parseTwee(text) {
    const lines = String(text || '').replace(/\r\n/g, '\n').replace(/^\uFEFF/, '').split('\n');
    const passages = [];
    let curr = null;
    let body = [];

    const flush = () => {
        if (!curr) return;
        passages.push({
            name: curr.name,
            tags: curr.tags,
            body: body.join('\n').replace(/^\n/, ''),
        });
        body = [];
    };

    const parseHeader = (line) => {
        const raw = line.slice(2).trim();
        const m = raw.match(/^(.*?)\s*\[(.*?)\]\s*(?:<.*?>)?\s*$/);
        if (!m) return { name: raw, tags: [] };
        return {
            name: m[1].trim(),
            tags: m[2].split(/\s+/).map((s) => s.trim()).filter(Boolean),
        };
    };

    for (const line of lines) {
        if (line.startsWith('::')) {
            flush();
            curr = parseHeader(line);
            continue;
        }
        if (curr) body.push(line);
    }
    flush();
    return passages;
}

function parseHtmlStory(html) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const storyData = doc.querySelector('tw-storydata');
    if (!storyData) throw new Error('Not a Twine HTML file');
    const passages = Array.from(storyData.querySelectorAll('tw-passagedata')).map((node) => ({
        name: node.getAttribute('name') || '',
        tags: String(node.getAttribute('tags') || '').split(/\s+/).map((s) => s.trim()).filter(Boolean),
        body: node.textContent || '',
    }));
    return { passages, template: html };
}

function cleanText(text) {
    const i = String(text || '').indexOf('%%%');
    if (i === -1) return String(text || '');
    return String(text || '').slice(0, i);
}

function stripDialomicCommands(text) {
    const source = String(text || '');
    const pattern = /(^|[^%])%%\s*([^%]+?)\s*%%(?!%)/g;
    let out = '';
    let lastIndex = 0;
    let match;
    while ((match = pattern.exec(source)) !== null) {
        const fullStart = match.index;
        const prefix = match[1] || '';
        out += source.slice(lastIndex, fullStart);
        out += prefix;
        lastIndex = pattern.lastIndex;
    }
    out += source.slice(lastIndex);
    return out;
}

function extractPanelAspectCommand(text) {
    const source = String(text || '');
    const pattern = /%%\s*([^%]+?)\s*%%/g;
    let match;
    while ((match = pattern.exec(source)) !== null) {
        const body = String(match[1] || '');
        const aspectMatch = body.match(/(?:^|[\s,;])aspect\s*[:=]\s*([0-9]*\.?[0-9]+)\s*:\s*([0-9]*\.?[0-9]+)/i);
        if (!aspectMatch) continue;
        const w = Number(aspectMatch[1]);
        const h = Number(aspectMatch[2]);
        if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) {
            return w / h;
        }
    }
    return null;
}

function ratioToAspectToken(ratio) {
    const clamped = Math.max(0.2, Math.min(5, Number(ratio) || (16 / 9)));
    const base = 100;
    let w = Math.max(1, Math.round(clamped * base));
    let h = base;
    const gcd = (a, b) => (b ? gcd(b, a % b) : a);
    const g = gcd(w, h);
    w = Math.round(w / g);
    h = Math.round(h / g);
    return `${w}:${h}`;
}

function upsertPanelAspectCommand(body, ratio) {
    const source = String(body || '');
    const aspectToken = ratioToAspectToken(ratio);
    const pattern = /%%\s*([^%]+?)\s*%%/g;
    let replaced = false;
    const next = source.replace(pattern, (full, inner) => {
        if (replaced) return full;
        const text = String(inner || '');
        if (!/(?:^|[\s,;])aspect\s*[:=]/i.test(text)) return full;
        replaced = true;
        const updated = text.replace(/(?:^|[\s,;])aspect\s*[:=]\s*[0-9]*\.?[0-9]+\s*:\s*[0-9]*\.?[0-9]+/i, (m) => {
            const prefix = /^[\s,;]+/.test(m) ? m.match(/^[\s,;]+/)?.[0] || '' : '';
            return `${prefix}aspect=${aspectToken}`;
        });
        return `%%${updated}%%`;
    });
    if (replaced) return next;
    return `%%aspect=${aspectToken}%%\n${source}`.trimStart();
}

function stripHtml(html) {
    if (!html) return '';
    const node = document.createElement('div');
    node.innerHTML = html;
    return (node.textContent || '').replace(/\r\n/g, '\n');
}

function splitHtmlParagraphs(html) {
    const normalized = String(html || '')
        .replace(/\r\n/g, '\n')
        // Visual editor loads source passage text; viewer parses rendered DOM
        // where newlines are preserved as <br>. Mirror that behavior here.
        .replace(/\n/g, '<br>');
    return normalized.split(/<br\s*\/?>/i);
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
                if (key) map[key] = spec;
                else {
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

function splitParagraphs(text, format) {
    if (format === 'twee') {
        // In Twee authoring, a single newline is a practical paragraph boundary.
        return String(text || '').split('\n').map((p) => p.trim()).filter(Boolean);
    }
    return splitHtmlParagraphs(text);
}

function removeSpeakerParagraphsForModel(body, format, modelKey) {
    const key = String(modelKey || '').trim().toLowerCase();
    if (!key) return { body: String(body || ''), removed: 0 };
    const parts = splitParagraphs(body, format);
    const kept = [];
    let removed = 0;
    for (const part of parts) {
        const plain = stripHtml(part).trim();
        const firstLine = plain.split('\n').find((l) => l.trim().length > 0) || '';
        const m = firstLine.match(/^([^:]+)::\s*(.*)$/);
        const speaker = String(m?.[1] || '').trim().toLowerCase();
        if (speaker && speaker === key) {
            removed += 1;
            continue;
        }
        kept.push(part);
    }
    const sep = format === 'twee' ? '\n' : '\n\n';
    return { body: kept.join(sep), removed };
}

function htmlToPlainText(html) {
    const withBreaks = String(html || '')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>/gi, '\n\n')
        .replace(/<p[^>]*>/gi, '');
    return stripHtml(withBreaks);
}

function escapeHtml(text) {
    return String(text || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function plainTextToHtml(text) {
    return escapeHtml(String(text || '')).replace(/\n/g, '<br>');
}

function splitHiddenBody(sourceBody) {
    const source = String(sourceBody || '').replace(/\r\n/g, '\n');
    const idx = source.indexOf('%%%');
    if (idx < 0) return { visible: source, hidden: '' };
    return {
        visible: source.slice(0, idx),
        hidden: source.slice(idx),
    };
}

function cloneSceneSpec(value) {
    if (!value || typeof value !== 'object') return value;
    if (typeof structuredClone === 'function') {
        try {
            return structuredClone(value);
        } catch {
            // fallback
        }
    }
    try {
        return JSON.parse(JSON.stringify(value));
    } catch {
        return { ...value };
    }
}

function composeBodyWithHidden(visibleBody, hiddenTail) {
    const visible = String(visibleBody || '').replace(/\r\n/g, '\n').trimEnd();
    const hidden = String(hiddenTail || '');
    if (!hidden) return visible;
    if (!visible) return hidden;
    return `${visible}\n${hidden.replace(/^\n+/, '')}`;
}

function replaceFirstBlock(source, oldBlock, newBlock) {
    const src = String(source || '');
    const oldText = String(oldBlock || '');
    if (!oldText) return src;
    const idx = src.indexOf(oldText);
    if (idx < 0) return src;
    return `${src.slice(0, idx)}${newBlock}${src.slice(idx + oldText.length)}`;
}

function removeFirstLineMatch(source, lineText) {
    const src = String(source || '');
    const line = String(lineText || '').trim();
    if (!line) return src;
    const escaped = line.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`(^|\\n)${escaped}(?=\\n|$)`);
    const next = src.replace(re, (m, p1) => (p1 ? p1 : ''));
    return next.replace(/\n{3,}/g, '\n\n').replace(/^\n+/, '');
}

function splitLinesPreserve(raw) {
    return String(raw || '').replace(/\r\n/g, '\n').split('\n');
}

function logBodyDiff(beforeRaw, afterRaw, reason = 'update') {
    if (!state.debugMode) return;
    const before = String(beforeRaw || '').replace(/\r\n/g, '\n');
    const after = String(afterRaw || '').replace(/\r\n/g, '\n');
    if (before === after) return;
    const a = before.split('\n');
    const b = after.split('\n');
    const max = Math.max(a.length, b.length);
    const lines = [];
    for (let i = 0; i < max; i += 1) {
        const av = a[i] ?? '';
        const bv = b[i] ?? '';
        if (av === bv) continue;
        lines.push({ line: i + 1, before: av, after: bv });
        if (lines.length >= 30) break;
    }
    console.groupCollapsed(`[visual-editor diff] ${reason} (${a.length} -> ${b.length} lines)`);
    console.table(lines);
    console.groupEnd();
}

function extractSceneLines(raw) {
    const lines = splitLinesPreserve(raw);
    const out = [];
    let inDlMacro = false;
    for (let i = 0; i < lines.length; i += 1) {
        const line = String(lines[i] || '');
        const t = line.trim();
        if (/^%%.*%%$/.test(t)) {
            out.push(line);
            continue;
        }
        if (!inDlMacro && /<<\s*set\s+\$DL\b/i.test(t)) {
            inDlMacro = true;
            out.push(line);
            if (t.includes('>>')) inDlMacro = false;
            continue;
        }
        if (inDlMacro) {
            out.push(line);
            if (t.includes('>>')) inDlMacro = false;
        }
    }
    return out.join('\n');
}

function extractChoiceLines(raw) {
    return splitLinesPreserve(raw).filter((line) => {
        const src = String(line || '');
        const t = src.trim();
        return /\[\[[^\]]+\]\]/.test(src) || /<<(?:link|button)\b/i.test(t);
    }).join('\n');
}

function getSceneLineIndices(raw) {
    const lines = splitLinesPreserve(raw);
    const idxs = [];
    let inDlMacro = false;
    for (let i = 0; i < lines.length; i += 1) {
        const line = String(lines[i] || '');
        const t = line.trim();
        if (/^%%.*%%$/.test(t)) {
            idxs.push(i);
            continue;
        }
        if (!inDlMacro && /<<\s*set\s+\$DL\b/i.test(t)) {
            inDlMacro = true;
            idxs.push(i);
            if (t.includes('>>')) inDlMacro = false;
            continue;
        }
        if (inDlMacro) {
            idxs.push(i);
            if (t.includes('>>')) inDlMacro = false;
        }
    }
    return idxs;
}

function getChoiceLineIndices(raw) {
    const lines = splitLinesPreserve(raw);
    const idxs = [];
    for (let i = 0; i < lines.length; i += 1) {
        const src = String(lines[i] || '');
        const t = src.trim();
        if (/\[\[[^\]]+\]\]/.test(src) || /<<(?:link|button)\b/i.test(t)) idxs.push(i);
    }
    return idxs;
}

function getTextLineIndices(raw) {
    const lines = splitLinesPreserve(raw);
    const sceneSet = new Set(getSceneLineIndices(raw));
    const choiceSet = new Set(getChoiceLineIndices(raw));
    const idxs = [];
    for (let i = 0; i < lines.length; i += 1) {
        if (sceneSet.has(i) || choiceSet.has(i)) continue;
        idxs.push(i);
    }
    return idxs;
}

function extractTextLines(raw) {
    const lines = splitLinesPreserve(raw);
    const idxs = getTextLineIndices(raw);
    return idxs.map((i) => lines[i]).join('\n');
}

function mergeLinesAtIndices(baseRaw, indices, editedRaw, insertAt = 'bottom', preserveEmpty = false) {
    const base = splitLinesPreserve(baseRaw);
    const edited = preserveEmpty
        ? splitLinesPreserve(editedRaw)
        : splitLinesPreserve(editedRaw).filter((ln) => String(ln).trim().length > 0);
    if (!indices.length) {
        if (!edited.length) return base.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd();
        if (insertAt === 'top') return [...edited, ...base].join('\n').replace(/\n{3,}/g, '\n\n').trimEnd();
        return [...base, ...edited].join('\n').replace(/\n{3,}/g, '\n\n').trimEnd();
    }
    const out = [...base];
    const replaceCount = Math.min(indices.length, edited.length);
    for (let i = 0; i < replaceCount; i += 1) {
        out[indices[i]] = edited[i];
    }
    for (let i = replaceCount; i < indices.length; i += 1) {
        out[indices[i]] = '';
    }
    if (edited.length > indices.length) {
        const extra = edited.slice(indices.length);
        const insertAfter = indices[indices.length - 1];
        out.splice(insertAfter + 1, 0, ...extra);
    }
    if (preserveEmpty) return out.join('\n').replace(/\r\n/g, '\n');
    return out.join('\n').replace(/\n{3,}/g, '\n\n').replace(/^\n+/, '').trimEnd();
}

function parseSpeakerRawBlock(raw, fallbackSpeaker = '') {
    const src = String(raw || '').replace(/\r\n/g, '\n');
    const lines = src.split('\n');
    for (const line of lines) {
        const stripped = stripHtml(line).trim();
        const match = stripped.match(/^([^:]+)::\s*(.*)$/);
        if (!match) continue;
        const speaker = String(match[1] || '').trim() || String(fallbackSpeaker || '').trim();
        const idx = line.indexOf('::');
        const text = idx >= 0 ? line.slice(idx + 2).trim() : String(match[2] || '').trim();
        return { speaker, text };
    }
    return {
        speaker: String(fallbackSpeaker || '').trim(),
        text: stripHtml(src).trim(),
    };
}

function getSpeakerPayloadFromRaw(raw, fallbackSpeaker = '') {
    const src = String(raw || '').replace(/\r\n/g, '\n');
    const lines = src.split('\n');
    for (let i = 0; i < lines.length; i += 1) {
        const stripped = stripHtml(lines[i]).trim();
        const match = stripped.match(/^([^:]+)::\s*(.*)$/);
        if (!match) continue;
        const textAfter = lines[i].slice(lines[i].indexOf('::') + 2).replace(/^\s*/, '');
        const out = [textAfter, ...lines.slice(i + 1)];
        return out.join('\n').replace(/^\n+/, '');
    }
    return parseSpeakerRawBlock(src, fallbackSpeaker).text || '';
}

function withSpeakerTag(rawValue, speaker, previousRaw = '') {
    const payload = String(rawValue || '').replace(/\r\n/g, '\n');
    const prev = String(previousRaw || '').replace(/\r\n/g, '\n');
    const prevLines = prev.split('\n');
    const tagged = `${String(speaker || '').trim()}:: ${payload.split('\n')[0] || ''}`.trimEnd();
    const trailing = payload.split('\n').slice(1);
    for (let i = 0; i < prevLines.length; i += 1) {
        const stripped = stripHtml(prevLines[i]).trim();
        if (/^[^:]+::\s*/.test(stripped)) {
            const prefix = prevLines.slice(0, i);
            const suffix = prevLines.slice(i + 1);
            return [...prefix, tagged, ...trailing, ...suffix].join('\n');
        }
    }
    return [tagged, ...trailing].join('\n');
}

function parseNarrationRawBlock(raw) {
    const src = String(raw || '').replace(/\r\n/g, '\n');
    const out = [];
    for (const line of src.split('\n')) {
        const t = String(line || '').trim();
        if (!t) continue;
        if (/^%%.*%%$/.test(t)) continue;
        if (/\[\[[^\]]+\]\]/.test(line)) continue;
        if (line.includes('<<') || line.includes('>>')) continue;
        if (/^[^:]+::\s*/.test(stripHtml(line).trim())) continue;
        out.push(stripHtml(line));
    }
    return out.join('\n').trim();
}

function draftNarrationHtmlForPanel() {
    const raw = String(state.textDraft.narration || '');
    if (raw.trim().length === 0) {
        // Keep a one-line click target in visual editor even when narration is empty.
        return '&#8203;';
    }
    return plainTextToHtml(raw);
}

function suppressPreviewSpeakerAnimation() {
    const three = state.panel?.three;
    if (!three || !three.speakerAnim) return;
    const anim = three.speakerAnim;
    anim.queue = [];
    anim.index = 0;
    anim.startTime = 0;
    anim.duration = 0;
    anim.active = false;
    anim.paused = false;
    anim.currentKey = null;
    anim.startDelayUntil = 0;
    anim.cyclePauseUntil = 0;
    for (const model of three.models || []) {
        if (!model?.userData) continue;
        model.userData.speaking = false;
        if (Number.isFinite(model.userData.baseY)) {
            model.position.y = model.userData.baseY;
        }
    }
}

function draftToPanelSpeakers() {
    return (state.textDraft.speakers || []).map((s) => ({
        speaker: s.speaker,
        html: plainTextToHtml(s.text || ''),
    }));
}

function buildDraftTextBlock() {
    const lines = [];
    const narrationRaw = String(state.textDraft.narrationRaw || '').trim();
    if (narrationRaw) {
        lines.push(...narrationRaw.split('\n'));
    } else {
        const narration = String(state.textDraft.narration || '').trim();
        if (narration) {
            lines.push(...narration.split(/\n+/).map((l) => l.trim()).filter(Boolean));
        }
    }
    for (const s of state.textDraft.speakers || []) {
        const raw = String(s.raw || '').trim();
        if (raw) {
            lines.push(...raw.split('\n'));
            continue;
        }
        const speaker = String(s.speaker || '').trim();
        const text = String(s.text || '').trim();
        if (!speaker || !text) continue;
        lines.push(`${speaker}:: ${text}`);
    }
    return lines;
}

function applyDraftToPassageBody(sourceBody) {
    const source = String(sourceBody || '').replace(/\r\n/g, '\n');
    const hiddenIndex = source.indexOf('%%%');
    const visibleSource = hiddenIndex >= 0 ? source.slice(0, hiddenIndex) : source;
    const hiddenTail = hiddenIndex >= 0 ? source.slice(hiddenIndex) : '';
    const lines = visibleSource.split('\n');
    const bodyLines = buildDraftTextBlock().filter((line) => !/\[\[[^\]]+\]\]/.test(String(line)));
    const editableIdx = [];
    let firstLinkIdx = -1;

    const isEditableLine = (line) => {
        const t = String(line || '').trim();
        if (!t) return false;
        if (/^%%.*%%$/.test(t)) return false;
        if (/\[\[[^\]]+\]\]/.test(line)) return false;
        if (t.includes('<<') || t.includes('>>')) return false;
        return true;
    };

    for (let i = 0; i < lines.length; i += 1) {
        const line = String(lines[i] || '');
        if (firstLinkIdx < 0 && /\[\[[^\]]+\]\]/.test(line)) firstLinkIdx = i;
        if (isEditableLine(line)) editableIdx.push(i);
    }

    const out = [...lines];
    const replaceCount = Math.min(editableIdx.length, bodyLines.length);
    for (let i = 0; i < replaceCount; i += 1) {
        out[editableIdx[i]] = bodyLines[i];
    }
    for (let i = replaceCount; i < editableIdx.length; i += 1) {
        out[editableIdx[i]] = '';
    }
    if (bodyLines.length > editableIdx.length) {
        const extra = bodyLines.slice(editableIdx.length);
        const insertAt = firstLinkIdx >= 0 ? firstLinkIdx : out.length;
        out.splice(insertAt, 0, ...extra);
    }

    let visibleOut = out.join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .replace(/^\n+/, '')
        .trimEnd();
    if (!hiddenTail) return visibleOut;
    if (!visibleOut) return hiddenTail;
    return `${visibleOut}\n${hiddenTail.replace(/^\n+/, '')}`;
}

function syncDraftIntoPassageBody() {
    const p = state.passages[state.selected];
    if (!p) return;
    const next = composeBodyWithHidden(state.textDraft.narrationRaw || '', state.textDraft.hiddenTail || '');
    logBodyDiff(p.body, next, `sync:${p.name || state.selected}`);
    p.body = next;
    if (el.passageBody) el.passageBody.value = next;
}

function refreshDraftFromPassageBody() {
    const p = state.passages[state.selected];
    if (!p) return;
    const split = splitHiddenBody(p.body);
    const visibleBody = split.visible;
    const scene = buildSceneFromPassage(p.body, state.vars) || {};
    const sceneObjects = buildSceneObjectMap(scene?.objects);
    const parsed = parseSpeakerBlocks(visibleBody, sceneObjects, state.format);
    state.textDraft.narrationRaw = visibleBody;
    state.textDraft.narration = parseNarrationRawBlock(visibleBody);
    state.textDraft.hiddenTail = split.hidden;
    state.textDraft.speakers = (parsed.speakers || []).map((s) => ({
        speaker: String(s.speaker || ''),
        text: htmlToPlainText(s.html || ''),
        raw: String(s.raw || ''),
    }));
}

function updatePanelFromTextDraft() {
    if (!state.panel) return;
    state.panel.setTxt?.(draftNarrationHtmlForPanel());
    state.panel.setSpeakers?.(draftToPanelSpeakers());
    suppressPreviewSpeakerAnimation();
    wireInlineTextEditors();
    refreshSpeechBubbleDeleteButtons();
}

function openInlineTextEditor(hostEl, getValue, onCommit, options = {}) {
    if (!hostEl || !el.previewPane) return;
    if (state.activeInlineEditor) {
        state.activeInlineEditor.commit();
    }
    if (state.panel?.three) {
        state.panel.three.setSpeakerAnimationPaused?.(true);
        state.panel.three.renderer?.setAnimationLoop?.(null);
    }
    const rect = hostEl.getBoundingClientRect();
    hostEl.classList.add('is-inline-editing');
    const wrapper = document.createElement('div');
    wrapper.className = 'inline-text-editor';
    if (hostEl.classList?.contains('panel-speech')) {
        wrapper.classList.add('speech-inline-editor');
    }
    wrapper.style.left = `${rect.left}px`;
    wrapper.style.top = `${rect.top}px`;
    wrapper.style.width = `${Math.max(220, rect.width)}px`;
    const ta = document.createElement('textarea');
    ta.className = 'inline-text-editor-input';
    ta.value = getValue();
    let activeTab = 'text';
    const sceneMacro = typeof options.sceneMacro === 'string' ? options.sceneMacro : '';
    const choicesRaw = typeof options.choicesRaw === 'string' ? options.choicesRaw : '';
    const hasSceneTab = typeof options.onSceneChange === 'function' || Boolean(sceneMacro.trim());
    const hasChoicesTab = typeof options.onChoicesChange === 'function' || Boolean(choicesRaw.trim());
    let sceneTa = null;
    let choicesTa = null;
    if (hasSceneTab) {
        const tabs = document.createElement('div');
        tabs.className = 'inline-text-editor-tabs';
        const textTab = document.createElement('button');
        textTab.type = 'button';
        textTab.className = 'inline-tab active';
        textTab.textContent = 'Text';
        const sceneTab = document.createElement('button');
        sceneTab.type = 'button';
        sceneTab.className = 'inline-tab';
        sceneTab.textContent = 'Scene';
        tabs.appendChild(textTab);
        tabs.appendChild(sceneTab);
        let choicesTab = null;
        if (hasChoicesTab) {
            choicesTab = document.createElement('button');
            choicesTab.type = 'button';
            choicesTab.className = 'inline-tab';
            choicesTab.textContent = 'Choices';
            tabs.appendChild(choicesTab);
        }
        wrapper.appendChild(tabs);
        sceneTa = document.createElement('textarea');
        sceneTa.className = 'inline-text-editor-input';
        sceneTa.value = sceneMacro;
        sceneTa.style.display = 'none';
        sceneTa.readOnly = false;
        if (hasChoicesTab) {
            choicesTa = document.createElement('textarea');
            choicesTa.className = 'inline-text-editor-input';
            choicesTa.value = choicesRaw;
            choicesTa.style.display = 'none';
            choicesTa.readOnly = false;
        }
        const switchTab = (tab) => {
            activeTab = tab;
            const textActive = tab === 'text';
            const sceneActive = tab === 'scene';
            const choicesActive = tab === 'choices';
            textTab.classList.toggle('active', textActive);
            sceneTab.classList.toggle('active', sceneActive);
            if (choicesTab) choicesTab.classList.toggle('active', choicesActive);
            ta.style.display = textActive ? 'block' : 'none';
            if (sceneTa) sceneTa.style.display = sceneActive ? 'block' : 'none';
            if (choicesTa) choicesTa.style.display = choicesActive ? 'block' : 'none';
            autoSize();
            if (textActive) ta.focus();
            if (sceneActive && sceneTa) sceneTa.focus();
            if (choicesActive && choicesTa) choicesTa.focus();
        };
        textTab.addEventListener('click', () => switchTab('text'));
        sceneTab.addEventListener('click', () => switchTab('scene'));
        if (choicesTab) choicesTab.addEventListener('click', () => switchTab('choices'));
    }
    wrapper.appendChild(ta);
    if (sceneTa) wrapper.appendChild(sceneTa);
    if (choicesTa) wrapper.appendChild(choicesTa);
    const autoSize = () => {
        const active = activeTab === 'text' ? ta : (activeTab === 'scene' ? (sceneTa || ta) : (choicesTa || ta));
        active.style.height = 'auto';
        const desired = Math.max(48, active.scrollHeight);
        active.style.height = `${Math.min(desired, Math.floor(window.innerHeight * 0.55))}px`;
    };
    const applyLiveComposite = () => {
        if (!options.onLiveText) return;
        let textVal;
        if (typeof options.composeValue === 'function') {
            textVal = options.composeValue({
                textValue: ta.value,
                sceneValue: sceneTa ? sceneTa.value : '',
                choicesValue: choicesTa ? choicesTa.value : '',
            });
        } else {
            textVal = ta.value;
            if (sceneTa && typeof options.onSceneChange === 'function') {
                textVal = options.onSceneChange(sceneTa.value, textVal);
            }
            if (choicesTa && typeof options.onChoicesChange === 'function') {
                textVal = options.onChoicesChange(choicesTa.value, textVal);
            }
        }
        options.onLiveText(textVal);
    };
    const commit = () => {
        let val;
        if (typeof options.composeValue === 'function') {
            val = options.composeValue({
                textValue: ta.value,
                sceneValue: sceneTa ? sceneTa.value : '',
                choicesValue: choicesTa ? choicesTa.value : '',
            });
        } else {
            val = ta.value;
            if (sceneTa && typeof options.onSceneChange === 'function') {
                val = options.onSceneChange(sceneTa.value, val);
            }
            if (choicesTa && typeof options.onChoicesChange === 'function') {
                val = options.onChoicesChange(choicesTa.value, val);
            }
        }
        wrapper.remove();
        hostEl.classList.remove('is-inline-editing');
        state.activeInlineEditor = null;
        if (state.panel?.three) {
            state.panel.three.setSpeakerAnimationPaused?.(false);
            state.panel.three.renderer?.setAnimationLoop?.(state.panel.three.animate);
        }
        onCommit(val);
        refreshSpeechBubbleDeleteButtons();
    };
    const cancel = () => {
        wrapper.remove();
        hostEl.classList.remove('is-inline-editing');
        state.activeInlineEditor = null;
        if (state.panel?.three) {
            state.panel.three.setSpeakerAnimationPaused?.(false);
            state.panel.three.renderer?.setAnimationLoop?.(state.panel.three.animate);
        }
        refreshSpeechBubbleDeleteButtons();
    };
    ta.addEventListener('blur', () => {
        // Don't auto-commit when moving between tabs/inputs inside wrapper.
        requestAnimationFrame(() => {
            if (!wrapper.contains(document.activeElement)) {
                commit();
            }
        });
    });
    ta.addEventListener('input', autoSize);
    ta.addEventListener('input', applyLiveComposite);
    if (sceneTa) sceneTa.addEventListener('blur', () => {
        requestAnimationFrame(() => {
            if (!wrapper.contains(document.activeElement)) {
                commit();
            }
        });
    });
    if (sceneTa) sceneTa.addEventListener('input', () => {
        autoSize();
        applyLiveComposite();
    });
    if (choicesTa) choicesTa.addEventListener('blur', () => {
        requestAnimationFrame(() => {
            if (!wrapper.contains(document.activeElement)) {
                commit();
            }
        });
    });
    if (choicesTa) choicesTa.addEventListener('input', () => {
        autoSize();
        applyLiveComposite();
    });
    ta.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            e.preventDefault();
            cancel();
        }
    });
    document.body.appendChild(wrapper);
    autoSize();
    ta.focus();
    ta.select();
    state.activeInlineEditor = { el: wrapper, commit, cancel, host: hostEl };
    refreshSpeechBubbleDeleteButtons();
}

function openNarrationTabbedEditor(hostEl) {
    if (!hostEl || !el.previewPane) return;
    const p = state.passages[state.selected];
    if (!p) return;
    const raw = String(p.body || '');
    const textRaw = extractTextLines(raw);
    const sceneRaw = extractSceneLines(raw);
    const choicesRaw = extractChoiceLines(raw);
    openInlineTextEditor(
        hostEl,
        () => textRaw,
        (val) => {
            const nextRaw = String(val || '');
            if (nextRaw === String(p.body || '')) return;
            logBodyDiff(p.body, nextRaw, `narration-tabs:${p.name || state.selected}`);
            p.body = nextRaw;
            if (el.passageBody) el.passageBody.value = nextRaw;
            refreshDraftFromPassageBody();
            updatePanelFromTextDraft();
            renderPreviewLinks(parseLinkLabels(p.body || ''));
            setTextDirty(true);
        },
        {
            sceneMacro: sceneRaw,
            choicesRaw,
            composeValue: ({ textValue, sceneValue, choicesValue }) => {
                let nextRaw = String(raw || '');
                nextRaw = mergeLinesAtIndices(
                    nextRaw,
                    getTextLineIndices(nextRaw),
                    String(textValue || ''),
                    'top',
                    true
                );
                nextRaw = mergeLinesAtIndices(
                    nextRaw,
                    getSceneLineIndices(nextRaw),
                    String(sceneValue || ''),
                    'top'
                );
                nextRaw = mergeLinesAtIndices(
                    nextRaw,
                    getChoiceLineIndices(nextRaw),
                    String(choicesValue || ''),
                    'bottom'
                );
                return nextRaw;
            },
            onSceneChange: (sceneVal, baseTextVal) => {
                const textRaw = String(baseTextVal || state.textDraft.narrationRaw || '');
                const sceneIdx = getSceneLineIndices(textRaw);
                return mergeLinesAtIndices(textRaw, sceneIdx, String(sceneVal || ''), 'top');
            },
            onChoicesChange: (choicesVal, baseTextVal) => {
                const textRaw = String(baseTextVal || state.textDraft.narrationRaw || '');
                const choiceIdx = getChoiceLineIndices(textRaw);
                return mergeLinesAtIndices(textRaw, choiceIdx, String(choicesVal || ''), 'bottom');
            },
            onLiveText: (nextRaw) => {
                const value = String(nextRaw || '');
                if (value === String(p.body || '')) return;
                logBodyDiff(p.body, value, `narration-live:${p.name || state.selected}`);
                p.body = value;
                if (el.passageBody) el.passageBody.value = value;
                refreshDraftFromPassageBody();
                updatePanelFromTextDraft();
                renderPreviewLinks(parseLinkLabels(p.body || ''));
                setTextDirty(true);
            },
        }
    );
}

function wireInlineTextEditors() {
    if (!state.panel) return;
    const narration = state.panel.narrationEl;
    if (narration && !narration.dataset.inlineEditBound) {
        narration.dataset.inlineEditBound = '1';
        narration.addEventListener('click', (event) => {
            event.stopPropagation();
            state.selectedBubbleIndex = null;
            refreshSpeechBubbleDeleteButtons();
            openNarrationTabbedEditor(narration);
        });
    }
    for (let i = 0; i < (state.panel.speechEls || []).length; i += 1) {
        const bubble = state.panel.speechEls[i];
        if (!bubble || bubble.dataset.inlineEditBound) continue;
        const draftSpeaker = state.textDraft.speakers?.[i] || null;
        bubble.dataset.inlineEditBound = '1';
        bubble.addEventListener('click', (event) => {
            event.stopPropagation();
            if (state.activeInlineEditor) return;
            state.selectedBubbleIndex = i;
            refreshSpeechBubbleDeleteButtons();
        });
        bubble.addEventListener('dblclick', (event) => {
            event.stopPropagation();
            if (state.activeInlineEditor) return;
            state.selectedBubbleIndex = i;
            refreshSpeechBubbleDeleteButtons();
            openInlineTextEditor(
                bubble,
                () => String(getSpeakerPayloadFromRaw(draftSpeaker?.raw || '', draftSpeaker?.speaker || '')),
                (val) => {
                    if (!draftSpeaker) return;
                    const idx = state.textDraft.speakers.indexOf(draftSpeaker);
                    if (idx < 0) return;
                    const oldRaw = String(state.textDraft.speakers[idx].raw || '');
                    const raw = withSpeakerTag(String(val || ''), state.textDraft.speakers[idx].speaker || '', oldRaw).trim();
                    if (raw === oldRaw.trim()) return;
                    let visible = String(state.textDraft.narrationRaw || '');
                    if (!raw) {
                        const oldLine = oldRaw.split('\n').find((ln) => String(ln || '').trim()) || '';
                        visible = oldLine ? removeFirstLineMatch(visible, oldLine) : replaceFirstBlock(visible, oldRaw, '');
                    } else if (oldRaw && visible.includes(oldRaw)) {
                        visible = replaceFirstBlock(visible, oldRaw, raw);
                    } else {
                        visible = `${visible.replace(/\s*$/, '')}\n${raw}`.replace(/^\n+/, '');
                    }
                    state.textDraft.narrationRaw = visible;
                    syncDraftIntoPassageBody();
                    refreshDraftFromPassageBody();
                    updatePanelFromTextDraft();
                    setTextDirty(true);
                }
            );
        });
    }
}

function removeSpeechBubbleAt(index) {
    const i = Number(index);
    if (!Number.isFinite(i) || i < 0) return;
    if (!state.textDraft?.speakers?.[i]) return;
    const oldRaw = String(state.textDraft.speakers[i].raw || '');
    const oldLine = oldRaw.split('\n').find((ln) => String(ln || '').trim()) || '';
    let visible = String(state.textDraft.narrationRaw || '');
    visible = oldLine ? removeFirstLineMatch(visible, oldLine) : replaceFirstBlock(visible, oldRaw, '');
    state.textDraft.narrationRaw = visible;
    state.selectedBubbleIndex = null;
    syncDraftIntoPassageBody();
    refreshDraftFromPassageBody();
    updatePanelFromTextDraft();
    setTextDirty(true);
}

function refreshSpeechBubbleDeleteButtons() {
    if (!state.panel?.speechEls?.length) return;
    const selectedModel = String(state.selectedModelKey || '').trim().toLowerCase();
    for (let i = 0; i < state.panel.speechEls.length; i += 1) {
        const bubble = state.panel.speechEls[i];
        if (!bubble) continue;
        const draftSpeaker = state.textDraft.speakers?.[i];
        const speakerKey = String(draftSpeaker?.speaker || '').trim().toLowerCase();
        let btn = bubble.querySelector('.speech-remove-btn');
        if (!btn) {
            btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'speech-remove-btn';
            btn.title = 'Remove speech bubble';
            btn.setAttribute('aria-label', 'Remove speech bubble');
            btn.textContent = '×';
            btn.addEventListener('click', (event) => {
                event.stopPropagation();
                removeSpeechBubbleAt(i);
            });
            bubble.appendChild(btn);
        }
        const selectedByBubble = state.selectedBubbleIndex === i;
        const selectedByModel = Boolean(
            selectedModel &&
            selectedModel !== BACKGROUND_KEY &&
            speakerKey &&
            selectedModel === speakerKey
        );
        const editingThisBubble = state.activeInlineEditor?.host === bubble;
        const bubbleSelected = selectedByBubble || selectedByModel;
        bubble.classList.toggle('is-selected-bubble', bubbleSelected && !editingThisBubble);
        btn.style.display = (!editingThisBubble && bubbleSelected) ? 'grid' : 'none';
    }
}

function refreshCurrentPanelTextAndBubbles() {
    const p = state.passages[state.selected];
    if (!p || !state.panel) return;
    updatePanelFromTextDraft();
    syncDraftIntoPassageBody();
    renderPreviewLinks(parseLinkLabels(p.body));
    wireInlineTextEditors();
    refreshSpeechBubbleDeleteButtons();
}

function parseSpeakerBlocks(text, sceneObjects, format) {
    const originalParas = splitParagraphs(text, format);
    const cleanedParas = originalParas.map((p) => stripHtml(p));
    const narrationParas = [];
    const speakers = [];

    for (let i = 0; i < cleanedParas.length; i += 1) {
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
        speakers.push({ speaker, html: updatedPara.trim(), raw: originalPara });
    }

    return {
        speakers,
        narrationText: narrationParas.join(format === 'twee' ? '\n' : '\n\n'),
        narrationRaw: narrationParas.join('\n'),
    };
}

function parseLinkLabels(text) {
    const source = String(text || '');
    const labels = [];
    const seen = new Set();
    const pushLabel = (label) => {
        const trimmed = String(label || '').trim();
        if (!trimmed || seen.has(trimmed)) return;
        seen.add(trimmed);
        labels.push(trimmed);
    };
    const re = /\[\[([\s\S]*?)\]\]/g;
    let m;
    while ((m = re.exec(source)) !== null) {
        const rawAll = String(m[1] || '');
        const raw = rawAll.split('][')[0].trim();
        const pipe = raw.indexOf('|');
        if (pipe >= 0) pushLabel(raw.slice(0, pipe).trim());
        else {
            const arrowIdx = raw.indexOf('->');
            const revArrowIdx = raw.indexOf('<-');
            if (arrowIdx >= 0) pushLabel(raw.slice(0, arrowIdx).trim());
            else if (revArrowIdx >= 0) pushLabel(raw.slice(revArrowIdx + 2).trim());
            else pushLabel(raw.trim());
        }
    }
    // Support SugarCube link/button macros in editor preview.
    const macroRe = /<<(?:link|button)\s+([^>]+)>>/gi;
    while ((m = macroRe.exec(source)) !== null) {
        const arg = String(m[1] || '').trim();
        if (!arg) continue;
        const quoted = arg.match(/^["']([^"']+)["']/);
        if (quoted) {
            pushLabel(quoted[1]);
            continue;
        }
        const bare = arg.match(/^([^\s>]+)/);
        if (bare) pushLabel(bare[1]);
    }
    return labels;
}

function saveCurrentPassageBody() {
    const p = state.passages[state.selected];
    if (!p) return;
    p.body = el.passageBody.value;
}

function getSceneEnvironment(scene) {
    const bg = scene?.background;
    const backgroundName = typeof bg === 'string'
        ? bg
        : String(bg?.name || bg?.model || '');
    let skyColor = String(scene?.skyColor || '').trim();
    if (!/^#[0-9a-f]{6}$/i.test(skyColor)) skyColor = '#bfe3ff';
    return { backgroundName, skyColor };
}

function updateCurrentPassageEnvironment({ backgroundName, skyColor }) {
    const p = state.passages[state.selected];
    if (!p) return;
    const scene = buildSceneFromPassage(p.body, state.vars) || {};
    const nextBackground = typeof backgroundName === 'string'
        ? backgroundName.trim()
        : getSceneEnvironment(scene).backgroundName;
    const nextSkyColor = typeof skyColor === 'string'
        ? skyColor.trim()
        : getSceneEnvironment(scene).skyColor;

    if (!state.environmentUndo) {
        state.environmentUndo = getSceneEnvironment(scene);
    }

    if (nextBackground) {
        const bg = scene.background;
        if (bg && typeof bg === 'object') {
            scene.background = { ...bg, name: nextBackground };
        } else {
            scene.background = { name: nextBackground };
        }
    } else {
        delete scene.background;
    }
    scene.skyColor = nextSkyColor;
    const nextBody = writeDlExprToPassage(p.body, toPrettyDlExpression(scene));
    p.body = nextBody;
    el.passageBody.value = nextBody;
    persistVisualEditorState();
    setSceneDirty(true);
    state.pendingSelectionKey = BACKGROUND_KEY;
    renderPreview();
}

function undoEnvironmentChanges() {
    if (!state.environmentUndo) return false;
    const undo = state.environmentUndo;
    state.environmentUndo = null;
    updateCurrentPassageEnvironment({
        backgroundName: undo.backgroundName,
        skyColor: undo.skyColor,
    });
    return true;
}

function serializeTwee() {
    const blocks = state.passages.map((p) => {
        const tags = p.tags?.length ? ` [${p.tags.join(' ')}]` : '';
        return `:: ${p.name}${tags}\n${p.body || ''}`;
    });
    return `${blocks.join('\n\n')}\n`;
}

function serializeHtml() {
    const parser = new DOMParser();
    const doc = parser.parseFromString(state.sourceHtmlTemplate || '', 'text/html');
    const storyData = doc.querySelector('tw-storydata');
    if (!storyData) throw new Error('No <tw-storydata> found for HTML export');
    storyData.querySelectorAll('tw-passagedata').forEach((n) => n.remove());
    for (let i = 0; i < state.passages.length; i += 1) {
        const p = state.passages[i];
        const node = doc.createElement('tw-passagedata');
        node.setAttribute('pid', String(i + 1));
        node.setAttribute('name', p.name);
        node.setAttribute('tags', (p.tags || []).join(' '));
        node.setAttribute('position', `${100 + (i % 8) * 140},${100 + Math.floor(i / 8) * 140}`);
        node.setAttribute('size', '100,100');
        node.textContent = p.body || '';
        storyData.appendChild(node);
    }
    return `<!DOCTYPE html>\n${doc.documentElement.outerHTML}`;
}

function downloadText(filename, text) {
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

function stageEditedHtmlForViewer() {
    if (state.format !== 'html' || !state.passages.length) return false;
    saveCurrentPassageBody();
    const html = serializeHtml();
    const nameBase = state.filename.replace(/\.[^.]+$/, '') || 'story';
    localStorage.setItem(VIEWER_IMPORTED_STORY_KEY, JSON.stringify({
        html,
        name: `${nameBase}.html`,
    }));
    return true;
}

function persistVisualEditorState() {
    try {
        const payload = {
            format: state.format,
            filename: state.filename,
            sourceHtmlTemplate: state.sourceHtmlTemplate,
            passages: state.passages,
            selected: state.selected,
            ts: Date.now(),
        };
        localStorage.setItem(VISUAL_EDITOR_STATE_KEY, JSON.stringify(payload));
    } catch (err) {
        console.warn('[visual-editor] Failed to persist state', err);
    }
}

function restoreVisualEditorState() {
    try {
        const raw = localStorage.getItem(VISUAL_EDITOR_STATE_KEY);
        if (!raw) return false;
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed?.passages) || !parsed.passages.length) return false;
        state.format = parsed.format === 'html' ? 'html' : 'twee';
        state.filename = String(parsed.filename || 'Edited Story');
        state.sourceHtmlTemplate = String(parsed.sourceHtmlTemplate || '');
        state.passages = parsed.passages
            .map((p) => ({
                name: String(p?.name || ''),
                tags: Array.isArray(p?.tags) ? p.tags.map((t) => String(t)) : [],
                body: String(p?.body || ''),
            }))
            .filter((p) => p.name && !IGNORED_PASSAGES.has(p.name));
        state.selected = Number.isFinite(Number(parsed.selected)) ? Number(parsed.selected) : 0;
        if (!state.passages.length) return false;
        state.storyInitBody = state.passages.find((p) => p.name === 'StoryInit')?.body || '';
        state.vars = parseStoryInitGlobals(state.storyInitBody);
        el.formatText.textContent = `Type: ${state.format}`;
        renderPassageList();
        setStatus(`Restored Visual Editor state: ${state.filename}`);
        return true;
    } catch (err) {
        console.warn('[visual-editor] Failed to restore state', err);
        return false;
    }
}

function renderPreviewLinks(labels) {
    if (!el.links) return;
    el.links.innerHTML = '';
    const stageRect = el.stage?.getBoundingClientRect();
    const maxWidth = Math.max(120, (stageRect?.width || 600) - 24);
    for (const label of labels) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'link-button';
        btn.textContent = label;
        btn.disabled = true;
        btn.style.maxWidth = `${maxWidth}px`;
        btn.style.whiteSpace = 'normal';
        el.links.appendChild(btn);
    }
}

function splitAssignments(source) {
    const out = [];
    let quote = null;
    let depth = 0;
    let curr = '';
    for (let i = 0; i < source.length; i += 1) {
        const ch = source[i];
        if (quote) {
            curr += ch;
            if (ch === '\\') {
                i += 1;
                if (i < source.length) curr += source[i];
                continue;
            }
            if (ch === quote) quote = null;
            continue;
        }
        if (ch === '"' || ch === "'" || ch === '`') {
            quote = ch;
            curr += ch;
            continue;
        }
        if (ch === '{' || ch === '[' || ch === '(') depth += 1;
        if (ch === '}' || ch === ']' || ch === ')') depth = Math.max(0, depth - 1);
        if (ch === ';' && depth === 0) {
            if (curr.trim()) out.push(curr.trim());
            curr = '';
            continue;
        }
        curr += ch;
    }
    if (curr.trim()) out.push(curr.trim());
    return out;
}

function sugarExprToJs(expr) {
    return String(expr || '')
        .replace(/\$([A-Za-z_]\w*)/g, (_, name) => `vars.${name}`);
}

function evalWithVars(expr, vars) {
    const js = sugarExprToJs(expr);
    return Function('vars', `return (${js});`)(vars);
}

function parseStoryInitGlobals(storyInitBody) {
    const vars = {};
    const macroRe = /<<set\s+([\s\S]*?)>>/gi;
    let m;
    while ((m = macroRe.exec(String(storyInitBody || ''))) !== null) {
        const inner = m[1] || '';
        const assigns = splitAssignments(inner);
        for (const a of assigns) {
            const match = a.match(/^(?:State\.variables\.)?(\$?[A-Za-z_]\w*)\s*=\s*([\s\S]+)$/);
            if (!match) continue;
            const rawName = match[1];
            const name = rawName.startsWith('$') ? rawName.slice(1) : rawName;
            const rhs = match[2];
            try {
                vars[name] = evalWithVars(rhs, vars);
            } catch {
                // ignore invalid assignment
            }
        }
    }
    return vars;
}

function extractDlExpr(passageBody) {
    const m = String(passageBody || '').match(/<<set\s+\$DL\s*=\s*([\s\S]*?)>>/i);
    return m ? m[1] : null;
}

function stripMacros(body) {
    return String(body || '')
        .replace(/<<[\s\S]*?>>/g, '')
        .replace(/\[\[[\s\S]*?\]\]/g, '')
        .trim();
}

function buildSceneFromPassage(passageBody, vars) {
    const expr = extractDlExpr(passageBody);
    if (!expr) return {};
    try {
        const dl = evalWithVars(expr, vars);
        return dl && typeof dl === 'object' ? dl : {};
    } catch (err) {
        setStatus(`Unable to parse $DL in passage: ${err.message || err}`);
        return {};
    }
}

function toPrettyDlExpression(dl) {
    return JSON.stringify(dl, null, 2);
}

function writeDlExprToPassage(body, dlExpr) {
    const src = String(body || '');
    const hiddenIndex = src.indexOf('%%%');
    const visibleSource = hiddenIndex >= 0 ? src.slice(0, hiddenIndex) : src;
    const hiddenTail = hiddenIndex >= 0 ? src.slice(hiddenIndex) : '';
    const macro = `<<set $DL = ${dlExpr}>>`;
    let visibleOut;
    if (/<<set\s+\$DL\s*=/.test(visibleSource)) {
        visibleOut = visibleSource.replace(/<<set\s+\$DL\s*=\s*[\s\S]*?>>/i, macro);
    } else {
        visibleOut = `${macro}\n${visibleSource}`.trimStart();
    }
    if (!hiddenTail) return visibleOut;
    if (!visibleOut) return hiddenTail;
    return `${visibleOut}\n${hiddenTail.replace(/^\n+/, '')}`;
}

function destroyPanel() {
    if (state.previewRaf) {
        cancelAnimationFrame(state.previewRaf);
        state.previewRaf = 0;
    }
    if (!state.panel) return;
    state.panel.delete?.();
    state.panel = null;
    state.editableModelKeys = [];
    state.selectedModelKey = null;
    state.lastModelKeySignature = '';
    if (el.modelSelect) {
        el.modelSelect.innerHTML = '';
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = '(No models)';
        el.modelSelect.appendChild(opt);
        el.modelSelect.disabled = true;
    }
    if (el.gizmoMode) el.gizmoMode.disabled = true;
    if (el.saveSceneBtn) el.saveSceneBtn.disabled = true;
    if (el.panelAspectHandle) el.panelAspectHandle.style.display = 'none';
    if (el.selectedModelBadge) el.selectedModelBadge.style.display = 'none';
    if (el.selectedEnvironmentControls) el.selectedEnvironmentControls.style.display = 'none';
    if (el.floatingModelButtons) el.floatingModelButtons.style.display = 'none';
    if (el.floatingAddSpeechBtn) el.floatingAddSpeechBtn.style.display = 'none';
    refreshCameraButtons();
}

function refreshModelSelect() {
    if (!el.modelSelect || !state.panel?.three) return;
    const keys = state.panel.three.getEditableModelKeys?.() || [];
    const signature = keys.join('|');
    if (signature === state.lastModelKeySignature) return;
    state.lastModelKeySignature = signature;
    state.editableModelKeys = keys;
    const previous = state.selectedModelKey;

    el.modelSelect.innerHTML = '';
    if (!keys.length) {
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = '(No models loaded yet)';
        el.modelSelect.appendChild(opt);
        el.modelSelect.disabled = true;
        if (el.gizmoMode) el.gizmoMode.disabled = true;
        state.selectedModelKey = null;
        if (el.saveSceneBtn) el.saveSceneBtn.disabled = true;
        refreshSelectedModelBadge();
        refreshFloatingDeleteButton();
        return;
    }

    el.modelSelect.disabled = false;
    if (el.gizmoMode) el.gizmoMode.disabled = false;
    const noneOpt = document.createElement('option');
    noneOpt.value = '';
    noneOpt.textContent = '(None)';
    el.modelSelect.appendChild(noneOpt);
    for (const key of keys) {
        const opt = document.createElement('option');
        opt.value = key;
        opt.textContent = key;
        el.modelSelect.appendChild(opt);
    }

    const nextSelected = keys.includes(previous) ? previous : keys[0];
    state.selectedModelKey = nextSelected;
    el.modelSelect.value = nextSelected;
    state.panel.three.setSelectedEditableModel?.(nextSelected);
    if (el.saveSceneBtn) el.saveSceneBtn.disabled = false;
    refreshSelectedModelBadge();
    refreshFloatingDeleteButton();
}

function setupSceneEditor() {
    if (!state.panel?.three) return;
    state.panel.three.enableEditorTools?.({
        onChange: () => {
            setSceneDirty(true);
        },
        onSelect: (key) => {
            const normalized = String(key || '');
            state.selectedBubbleIndex = null;
            if (!normalized) {
                state.selectedModelKey = null;
                if (el.modelSelect) el.modelSelect.value = '';
            } else {
                state.selectedModelKey = normalized;
                if (el.modelSelect && normalized !== BACKGROUND_KEY && el.modelSelect.value !== normalized) {
                    el.modelSelect.value = normalized;
                } else if (el.modelSelect && normalized === BACKGROUND_KEY) {
                    el.modelSelect.value = '';
                }
            }
            refreshSelectedModelBadge();
            refreshFloatingDeleteButton();
            refreshSpeechBubbleDeleteButtons();
        },
    });
    const mode = el.gizmoMode?.value || 'translate';
    state.panel.three.setEditorTransformMode?.(mode);
    setFloatingModeActive(mode);
    refreshModelSelect();
}

function getSceneSnapshotForSave() {
    return state.panel?.three?.getEditableSceneSnapshot?.() || null;
}

function saveSceneTransformsToPassage() {
    const p = state.passages[state.selected];
    if (!p || !state.panel?.three) return;
    const prevBody = String(p.body || '');
    let nextBody = prevBody;
    if (state.hasTextEdits) {
        syncDraftIntoPassageBody();
        nextBody = String(p.body || '');
    }

    let savedSceneCount = null;
    if (state.hasSceneEdits) {
        const snapshot = getSceneSnapshotForSave();
        if (!snapshot) {
            setStatus('No editable scene to save.');
            return;
        }
        const scene = buildSceneFromPassage(nextBody, state.vars) || {};
        const selectedBackgroundName = String(el.selectedBackgroundSelect?.value || '').trim();
        const selectedSkyColor = String(el.selectedSkyColorInput?.value || '').trim();
        scene.objects = snapshot.objects || [];
        scene.camera = snapshot.camera || null;
        if (/^#[0-9a-f]{6}$/i.test(selectedSkyColor)) {
            scene.skyColor = selectedSkyColor;
        }
        if (snapshot.background && (snapshot.background.name || snapshot.background.model || selectedBackgroundName)) {
            scene.background = {
                ...snapshot.background,
                name: snapshot.background.name || selectedBackgroundName || snapshot.background.model || '',
            };
        } else if (selectedBackgroundName) {
            scene.background = { name: selectedBackgroundName };
        } else {
            delete scene.background;
        }
        nextBody = writeDlExprToPassage(nextBody, toPrettyDlExpression(scene));
        if (Number.isFinite(state.panelAspectOverride) && state.panelAspectOverride > 0) {
            nextBody = upsertPanelAspectCommand(nextBody, state.panelAspectOverride);
        }
        savedSceneCount = scene.objects.length;
    }

    if (nextBody !== prevBody) {
        p.body = nextBody;
        el.passageBody.value = nextBody;
        persistVisualEditorState();
        if (savedSceneCount == null) {
            setStatus(`Saved text updates in "${p.name}".`);
        } else {
            setStatus(`Saved ${savedSceneCount} model transforms + camera + environment to "$DL" in "${p.name}".`);
        }
    } else {
        setStatus('No changes to save.');
    }
    setTextDirty(false);
    setSceneDirty(false);
}

function startPreviewLoop() {
    if (!state.panel) return;
    if (state.previewRaf) cancelAnimationFrame(state.previewRaf);
    const tick = () => {
        if (!state.panel) {
            state.previewRaf = 0;
            return;
        }
        if (state.activeInlineEditor) {
            state.previewRaf = requestAnimationFrame(tick);
            return;
        }
        if (state.pendingSelectionKey && state.panel?.three) {
            const picked = state.panel.three.setSelectedEditableModel?.(state.pendingSelectionKey);
            if (picked) {
                state.pendingSelectionKey = null;
            }
        }
        // Keep bubble anchors synced as models finish loading / camera drifts.
        state.panel.update?.();
        refreshModelSelect();
        refreshFloatingDeleteButton();
        maybeCaptureImplicitCamera();
        refreshCameraButtons();
        state.previewRaf = requestAnimationFrame(tick);
    };
    state.previewRaf = requestAnimationFrame(tick);
}

function getPanelRect(sceneConfig = null) {
    const rect = el.stage.getBoundingClientRect();
    const pad = 16;
    const linkReserve = 140;
    const availableWidth = Math.max(120, rect.width - pad * 2);
    const availableHeight = Math.max(120, rect.height - linkReserve - pad * 2);
    const targetAspect = Number.isFinite(state.panelAspectOverride) && state.panelAspectOverride > 0
        ? state.panelAspectOverride
        : (16 / 9);
    let width = availableWidth;
    let height = width / targetAspect;
    if (height > availableHeight) {
        height = availableHeight;
        width = height * targetAspect;
    }
    const left = rect.left + pad + (availableWidth - width) * 0.5;
    const top = rect.top + pad + (availableHeight - height) * 0.5;
    return {
        left,
        top,
        width,
        height,
    };
}

function refreshPanelAspectHandle() {
    if (!el.panelAspectHandle || !state.panelRectCache || !el.previewPane) return;
    const paneRect = el.previewPane.getBoundingClientRect();
    const rect = state.panelRectCache;
    el.panelAspectHandle.style.display = 'block';
    // Keep handle locked to the panel's bottom-right corner (pane-local coords).
    el.panelAspectHandle.style.left = `${rect.left + rect.width - paneRect.left}px`;
    el.panelAspectHandle.style.top = `${rect.top + rect.height - paneRect.top}px`;
    refreshSelectedModelBadge();
}

function renderPreview() {
    const p = state.passages[state.selected];
    if (!p || !el.stage) return;
    const scene = buildSceneFromPassage(p.body, state.vars);
    const inlineAspect = extractPanelAspectCommand(p.body);
    state.panelAspectOverride = Number.isFinite(inlineAspect) ? inlineAspect : (16 / 9);
    state.lastSceneConfig = scene?.config || null;
    const rect = getPanelRect(state.lastSceneConfig);
    state.panelRectCache = rect;
    const topInset = 0;
    const curr = {
        left: rect.left,
        top: rect.top,
        width: Math.max(50, rect.width),
        height: Math.max(50, rect.height),
    };
    const target = { ...curr };
    const aspectMode = String(scene?.config?.aspect || 'free').toLowerCase() === 'fixed' ? 'fixed' : 'free';
    const env = getSceneEnvironment(scene);
    const sceneObjects = buildSceneObjectMap(scene?.objects);
    const cleanedText = stripDialomicCommands(cleanText(p.body))
        .replace(/<<[\s\S]*?>>/g, '')
        .replace(/\[\[[\s\S]*?\]\]/g, '');
    const parsed = parseSpeakerBlocks(cleanedText, sceneObjects, state.format);
    const split = splitHiddenBody(p.body || '');
    state.textDraft.hiddenTail = split.hidden;
    refreshDraftFromPassageBody();
    refreshEnvironmentControlsFromPassage();
    const links = parseLinkLabels(p.body);
    renderPreviewLinks(links);
    destroyPanel();
    const narrationForPanel = (state.textDraft.narrationRaw || '').trim().length
        ? plainTextToHtml(state.textDraft.narrationRaw || '')
        : '&#8203;';
    state.panel = new Panel(curr, target, `visual_${Date.now()}`, narrationForPanel, -1, scene, 'narration', topInset);
    if (state.panel?.three?.scene) {
        state.panel.three.scene.background = new THREE.Color(env.skyColor);
    }
    const passageKey = getCurrentPassageKey();
    if (passageKey && !state.savedCameraByPassage[passageKey] && scene?.camera && typeof scene.camera === 'object') {
        state.savedCameraByPassage[passageKey] = cloneSceneSpec(scene.camera);
    }
    maybeCaptureImplicitCamera();
    state.panel.setSpeakers?.(draftToPanelSpeakers());
    suppressPreviewSpeakerAnimation();
    // Match viewer behavior: apply panel aspect mode and settle panel/canvas sizing
    // immediately so model slotting uses the same effective viewport.
    state.panel.setAspectMode?.(aspectMode);
    state.panel.setCurr?.(curr, false);
    try {
        setupSceneEditor();
        if (state.pendingSelectionKey && state.panel?.three) {
            const picked = state.panel.three.setSelectedEditableModel?.(state.pendingSelectionKey);
            if (picked) {
                state.pendingSelectionKey = null;
            }
        }
    } catch (err) {
        console.error('[visual-editor] editor tools setup failed', err);
        setStatus(`Previewing "${p.name}" (editor tools unavailable)`);
    }
    startPreviewLoop();
    refreshPanelAspectHandle();
    refreshFloatingDeleteButton();
    refreshCameraButtons();
    wireInlineTextEditors();
    refreshSpeechBubbleDeleteButtons();
    if (!String(el.status?.textContent || '').includes('editor tools unavailable')) {
        setStatus(`Previewing "${p.name}"`);
    }
}

function renderPassageList() {
    el.passageSelect.innerHTML = '';
    for (let i = 0; i < state.passages.length; i += 1) {
        const p = state.passages[i];
        const opt = document.createElement('option');
        opt.value = String(i);
        opt.textContent = `${i + 1}. ${p.name}`;
        el.passageSelect.appendChild(opt);
    }
    const has = state.passages.length > 0;
    el.applyBtn.disabled = !has;
    if (el.exportBtn) el.exportBtn.disabled = !has;
    if (el.saveSceneBtn) el.saveSceneBtn.disabled = !has;
    if (!has) {
        state.selected = -1;
        el.passageBody.value = '';
        destroyPanel();
        return;
    }
    state.selected = Math.max(0, Math.min(state.selected, state.passages.length - 1));
    el.passageSelect.value = String(state.selected);
    const p = state.passages[state.selected];
    el.passageBody.value = p.body || '';
    persistVisualEditorState();
    updatePreviewStoryButton();
    renderPreview();
}

async function loadFile(file) {
    if (!file) return;
    const text = await file.text();
    const lower = file.name.toLowerCase();
    state.filename = file.name;
    if (lower.endsWith('.html') || text.toLowerCase().includes('<tw-storydata')) {
        state.format = 'html';
        const parsed = parseHtmlStory(text);
        state.passages = parsed.passages.filter((p) => !IGNORED_PASSAGES.has(p.name));
        state.sourceHtmlTemplate = parsed.template;
    } else {
        state.format = 'twee';
        state.passages = parseTwee(text).filter((p) => !IGNORED_PASSAGES.has(p.name));
        state.sourceHtmlTemplate = '';
    }
    state.storyInitBody = state.passages.find((p) => p.name === 'StoryInit')?.body || '';
    state.vars = parseStoryInitGlobals(state.storyInitBody);
    state.selected = 0;
    setTextDirty(false);
    setSceneDirty(false);
    el.formatText.textContent = `Type: ${state.format}`;
    updatePreviewStoryButton();
    renderPassageList();
    persistVisualEditorState();
    setStatus(`Loaded ${file.name}: ${state.passages.length} passages`);
}

function onResize() {
    if (!state.panel || !el.stage) return;
    const rect = getPanelRect(state.lastSceneConfig);
    state.panelRectCache = rect;
    const next = {
        left: rect.left,
        top: rect.top,
        width: Math.max(50, rect.width),
        height: Math.max(50, rect.height),
    };
    state.panel.setCurr?.(next, false);
    refreshPanelAspectHandle();
    refreshFloatingDeleteButton();
    const p = state.passages[state.selected];
    if (p) renderPreviewLinks(parseLinkLabels(p.body));
}

function unselectAllEditorTargets() {
    if (!state.panel?.three) return;
    state.pendingSelectionKey = null;
    state.selectedModelKey = null;
    state.selectedBubbleIndex = null;
    state.panel.three.clearSelectedEditableModel?.();
    if (el.modelSelect) el.modelSelect.value = '';
    refreshSelectedModelBadge();
    refreshFloatingDeleteButton();
    refreshSpeechBubbleDeleteButtons();
}

el.file?.addEventListener('change', async () => {
    const file = el.file.files?.[0];
    await runWithUnsavedGuard(async () => {
        try {
            await loadFile(file);
        } catch (err) {
            console.error(err);
            setStatus(`Failed to load file: ${err.message || err}`);
        }
    }, {
        onSave: () => saveSceneTransformsToPassage(),
    });
});

el.passageSelect?.addEventListener('change', async () => {
    const next = Number(el.passageSelect.value);
    const prev = state.selected;
    if (!Number.isFinite(next) || next === prev) return;
    await runWithUnsavedGuard(() => {
        saveCurrentPassageBody();
        state.selected = next;
        const p = state.passages[state.selected];
        if (!p) return;
        el.passageBody.value = p.body || '';
        persistVisualEditorState();
        renderPreview();
    }, {
        onSave: () => saveSceneTransformsToPassage(),
    });
    if (state.selected !== next) {
        el.passageSelect.value = String(prev);
    }
});

el.applyBtn?.addEventListener('click', () => {
    saveCurrentPassageBody();
    const p = state.passages[state.selected];
    if (!p) return;
    // Recompute vars in case StoryInit changed.
    state.storyInitBody = state.passages.find((x) => x.name === 'StoryInit')?.body || '';
    state.vars = parseStoryInitGlobals(state.storyInitBody);
    persistVisualEditorState();
    setTextDirty(false);
    setSceneDirty(false);
    renderPreview();
});

el.modelSelect?.addEventListener('change', () => {
    const key = String(el.modelSelect.value || '').trim();
    if (!state.panel?.three) return;
    state.selectedBubbleIndex = null;
    if (!key) {
        state.selectedModelKey = null;
        state.panel.three.clearSelectedEditableModel?.();
        refreshSelectedModelBadge();
        refreshFloatingDeleteButton();
        refreshSpeechBubbleDeleteButtons();
        return;
    }
    state.selectedModelKey = key;
    state.panel.three.setSelectedEditableModel?.(key);
    refreshSelectedModelBadge();
    refreshFloatingDeleteButton();
    refreshSpeechBubbleDeleteButtons();
});

window.addEventListener('pointerdown', (event) => {
    if (!state.panelRectCache) return;
    if (document.activeElement === el.selectedSkyColorInput) return;
    const target = event.target;
    if (target && typeof target.closest === 'function') {
        if (
            target.closest('.inline-text-editor') ||
            target.closest('#selectedEnvironmentControls') ||
            target.closest('#selectedModelBadge') ||
            target.closest('#floatingModelButtons') ||
            target.closest('#floatingAddSpeechBtn') ||
            target.closest('#cameraTools') ||
            target.closest('#floatingSaveTools')
        ) {
            return;
        }
    }
    const x = Number(event.clientX);
    const y = Number(event.clientY);
    const rect = state.panelRectCache;
    const insidePanel = x >= rect.left && x <= (rect.left + rect.width) && y >= rect.top && y <= (rect.top + rect.height);
    if (!insidePanel) {
        unselectAllEditorTargets();
    }
}, true);

el.gizmoMode?.addEventListener('change', () => {
    if (!state.panel?.three) return;
    const mode = el.gizmoMode.value || 'translate';
    state.panel.three.setEditorTransformMode?.(mode);
    setFloatingModeActive(mode);
});

el.floatingModeTranslateBtn?.addEventListener('click', () => {
    if (!state.panel?.three) return;
    const mode = 'translate';
    if (el.gizmoMode) el.gizmoMode.value = mode;
    state.panel.three.setEditorTransformMode?.(mode);
    setFloatingModeActive(mode);
});

el.floatingModeRotateBtn?.addEventListener('click', () => {
    if (!state.panel?.three) return;
    const mode = 'rotate';
    if (el.gizmoMode) el.gizmoMode.value = mode;
    state.panel.three.setEditorTransformMode?.(mode);
    setFloatingModeActive(mode);
});

el.floatingModeScaleBtn?.addEventListener('click', () => {
    if (!state.panel?.three) return;
    const mode = 'scale';
    if (el.gizmoMode) el.gizmoMode.value = mode;
    state.panel.three.setEditorTransformMode?.(mode);
    setFloatingModeActive(mode);
});

el.saveCameraBtn?.addEventListener('click', () => {
    const three = state.panel?.three;
    if (!three?.getCameraSpecSnapshot) return;
    const key = getCurrentPassageKey();
    if (!key) return;
    const spec = three.getCameraSpecSnapshot();
    state.savedCameraByPassage[key] = cloneSceneSpec(spec);
    setSceneDirty(true);
    setStatus('Saved camera position for this passage. Press Save Scene to persist.');
});

el.revertCameraBtn?.addEventListener('click', () => {
    const three = state.panel?.three;
    if (!three) return;
    const key = getCurrentPassageKey();
    let spec = key ? state.savedCameraByPassage[key] : null;
    if (!spec && key) {
        spec = state.implicitCameraByPassage[key] || null;
    }
    if (!spec) {
        const p = state.passages[state.selected];
        const scene = buildSceneFromPassage(p?.body || '', state.vars) || {};
        if (scene?.camera && typeof scene.camera === 'object') {
            spec = scene.camera;
        }
    }
    if (!spec) {
        setStatus('No saved camera found for this passage.');
        return;
    }
    three.setCameraSpec?.(cloneSceneSpec(spec));
    setSceneDirty(true);
    setStatus('Reverted camera. Press Save Scene to persist.');
});

el.addModelBtn?.addEventListener('click', () => {
    if (!state.panel?.three) return;
    const asset = String(el.addModelAssetSelect?.value || '').trim();
    if (!asset) return;
    const existing = state.panel.three.getEditableModelKeys?.() || [];
    let i = 1;
    let key = `${asset}${i}`;
    const used = new Set(existing.map((k) => String(k).toLowerCase()));
    while (used.has(key.toLowerCase())) {
        i += 1;
        key = `${asset}${i}`;
    }
    state.panel.three.addModel(`${key}=${asset} MID CENTER LOOKFRONT`);
    setSceneDirty(true);
});

el.floatingAddSpeechBtn?.addEventListener('click', () => {
    const speaker = String(state.selectedModelKey || '').trim();
    if (!speaker || speaker === BACKGROUND_KEY) return;
    const rawLine = `${speaker}:: `;
    state.textDraft.narrationRaw = `${String(state.textDraft.narrationRaw || '').replace(/\s*$/, '')}\n${rawLine}`.replace(/^\n+/, '');
    syncDraftIntoPassageBody();
    refreshDraftFromPassageBody();
    updatePanelFromTextDraft();
    setTextDirty(true);
    wireInlineTextEditors();
    const draftSpeaker = state.textDraft.speakers[state.textDraft.speakers.length - 1];
    if (!draftSpeaker) return;
    const idx = state.textDraft.speakers.indexOf(draftSpeaker);
    const bubble = idx >= 0 ? state.panel?.speechEls?.[idx] : null;
    if (bubble) {
        openInlineTextEditor(
            bubble,
            () => String(getSpeakerPayloadFromRaw(draftSpeaker.raw || '', draftSpeaker.speaker || speaker)),
            (val) => {
                const i = state.textDraft.speakers.indexOf(draftSpeaker);
                if (i < 0) return;
                const oldRaw = String(state.textDraft.speakers[i].raw || '');
                const raw = withSpeakerTag(String(val || ''), state.textDraft.speakers[i].speaker || speaker, oldRaw).trim();
                if (raw === oldRaw.trim()) return;
                let visible = String(state.textDraft.narrationRaw || '');
                if (!raw) {
                    const oldLine = oldRaw.split('\n').find((ln) => String(ln || '').trim()) || '';
                    visible = oldLine ? removeFirstLineMatch(visible, oldLine) : replaceFirstBlock(visible, oldRaw, '');
                } else if (oldRaw && visible.includes(oldRaw)) {
                    visible = replaceFirstBlock(visible, oldRaw, raw);
                } else {
                    visible = `${visible.replace(/\s*$/, '')}\n${raw}`.replace(/^\n+/, '');
                }
                state.textDraft.narrationRaw = visible;
                syncDraftIntoPassageBody();
                refreshDraftFromPassageBody();
                updatePanelFromTextDraft();
                setTextDirty(true);
            }
        );
    }
});

el.selectedBackgroundSelect?.addEventListener('change', () => {
    const name = String(el.selectedBackgroundSelect.value || '').trim();
    updateCurrentPassageEnvironment({ backgroundName: name });
});

el.selectedSkyColorInput?.addEventListener('input', () => {
    const color = String(el.selectedSkyColorInput.value || '').trim();
    if (state.panel?.three?.scene) {
        state.panel.three.scene.background = new THREE.Color(color || '#bfe3ff');
    }
});

el.selectedSkyColorInput?.addEventListener('change', () => {
    const color = String(el.selectedSkyColorInput.value || '').trim();
    updateCurrentPassageEnvironment({ skyColor: color });
});

el.selectedEnvironmentResetBtn?.addEventListener('click', () => {
    undoEnvironmentChanges();
});

el.floatingDeleteModelBtn?.addEventListener('click', () => {
    if (!state.panel?.three || !state.selectedModelKey) return;
    if (state.selectedModelKey === BACKGROUND_KEY) {
        if (undoEnvironmentChanges()) {
            setSceneDirty(true);
            refreshFloatingDeleteButton();
            refreshSelectedModelBadge();
        }
        return;
    }
    const reverted = state.panel.three.revertEditableModelTransformByKey?.(state.selectedModelKey);
    if (reverted) {
        setSceneDirty(true);
        refreshModelSelect();
        refreshFloatingDeleteButton();
    }
});

el.selectedDeleteModelBtn?.addEventListener('click', () => {
    if (!state.panel?.three || !state.selectedModelKey) return;
    const deletedKey = String(state.selectedModelKey);
    const removedLines = (state.textDraft.speakers || []).filter(
        (s) => String(s.speaker || '').trim().toLowerCase() === deletedKey.toLowerCase()
    ).length;
    if (removedLines > 0) {
        const ok = window.confirm(
            `Model "${deletedKey}" has ${removedLines} speech bubble paragraph${removedLines === 1 ? '' : 's'}. Delete model and remove those paragraph${removedLines === 1 ? '' : 's'}?`
        );
        if (!ok) return;
    }
    const removed = state.panel.three.removeEditableModelByKey?.(deletedKey);
    if (removed) {
        state.textDraft.speakers = (state.textDraft.speakers || []).filter(
            (s) => String(s.speaker || '').trim().toLowerCase() !== deletedKey.toLowerCase()
        );
        syncDraftIntoPassageBody();
        setTextDirty(true);
        setSceneDirty(true);
        refreshModelSelect();
        refreshFloatingDeleteButton();
        refreshCurrentPanelTextAndBubbles();
    }
});

el.clearSceneBtn?.addEventListener('click', () => {
    if (!state.panel?.three) return;
    const keys = state.panel.three.getEditableModelKeys?.() || [];
    if (!keys.length) return;
    const ok = window.confirm(`Clear ${keys.length} model${keys.length === 1 ? '' : 's'} from this scene?`);
    if (!ok) return;
    for (const key of keys) {
        state.panel.three.removeEditableModelByKey?.(key);
    }
    setSceneDirty(true);
    refreshModelSelect();
    refreshSelectedModelBadge();
    refreshFloatingDeleteButton();
    refreshCurrentPanelTextAndBubbles();
});

el.saveSceneBtn?.addEventListener('click', () => {
    saveCurrentPassageBody();
    saveSceneTransformsToPassage();
});

el.panelAspectHandle?.addEventListener('pointerdown', (event) => {
    if (!state.panelRectCache) return;
    event.preventDefault();
    state.draggingAspect = true;
    el.panelAspectHandle.setPointerCapture?.(event.pointerId);
});

el.panelAspectHandle?.addEventListener('pointermove', (event) => {
    if (!state.draggingAspect || !state.panelRectCache || !state.panel) return;
    const rect = state.panelRectCache;
    const w = Math.max(80, event.clientX - rect.left);
    const h = Math.max(60, event.clientY - rect.top);
    const ratio = Math.max(0.3, Math.min(4.5, w / Math.max(1, h)));
    state.panelAspectOverride = ratio;
    const fitted = getPanelRect(state.lastSceneConfig);
    state.panelRectCache = fitted;
    state.panel.setCurr?.({
        left: fitted.left,
        top: fitted.top,
        width: fitted.width,
        height: fitted.height,
    }, false);
    refreshPanelAspectHandle();
    setSceneDirty(true);
});

el.panelAspectHandle?.addEventListener('pointerup', (event) => {
    state.draggingAspect = false;
    el.panelAspectHandle.releasePointerCapture?.(event.pointerId);
});

el.panelAspectHandle?.addEventListener('pointercancel', (event) => {
    state.draggingAspect = false;
    el.panelAspectHandle.releasePointerCapture?.(event.pointerId);
});

el.passageBody?.addEventListener('input', () => {
    saveCurrentPassageBody();
    persistVisualEditorState();
    setTextDirty(true);
});

el.exportBtn?.addEventListener('click', async () => {
    await runWithUnsavedGuard(() => {
        saveCurrentPassageBody();
        if (!state.passages.length) return;
        if (state.format === 'html') {
            const html = serializeHtml();
            const out = state.filename.replace(/\.[^.]+$/, '') || 'story';
            downloadText(`${out}.html`, html);
            setStatus('Exported HTML');
        } else {
            const twee = serializeTwee();
            const out = state.filename.replace(/\.[^.]+$/, '') || 'story';
            downloadText(`${out}.twee`, twee);
            setStatus('Exported TWEE');
        }
        persistVisualEditorState();
        setTextDirty(false);
        setSceneDirty(false);
    }, {
        onSave: () => saveSceneTransformsToPassage(),
    });
});

el.previewStoryBtn?.addEventListener('click', async () => {
    if (state.format !== 'html') return;
    await runWithUnsavedGuard(() => {
        saveCurrentPassageBody();
        saveSceneTransformsToPassage();
        stageEditedHtmlForViewer();
        window.location.href = import.meta.env.BASE_URL || './';
    }, {
        onSave: () => saveSceneTransformsToPassage(),
    });
});

el.viewerLink?.addEventListener('click', async (event) => {
    event.preventDefault();
    await runWithUnsavedGuard(() => {
        window.location.href = import.meta.env.BASE_URL || './';
    }, {
        onSave: () => saveSceneTransformsToPassage(),
    });
});

window.addEventListener('resize', onResize);
window.addEventListener('beforeunload', () => {
    persistVisualEditorState();
    destroyPanel();
});

if (el.modelSelect && !el.modelSelect.options.length) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = '(No models)';
    el.modelSelect.appendChild(opt);
    el.modelSelect.disabled = true;
}
if (el.gizmoMode) el.gizmoMode.disabled = true;
if (el.saveSceneBtn) el.saveSceneBtn.disabled = true;
refreshCameraButtons();
initAssetDropdown();
initBackgroundDropdown();
loadAssetNamesFromManifest();
updatePreviewStoryButton();

initDebugMode();

if (!restoreVisualEditorState()) {
    setStatus('Load a file to start visual passage preview.');
}
