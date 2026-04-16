import * as THREE from 'three';
import { Panel } from './panel.js';

const VISUAL_EDITOR_STATE_KEY = 'DL_VISUAL_EDITOR_STATE_V1';
const VIEWER_IMPORTED_STORY_KEY = 'DL_IMPORTED_STORY_HTML';
const BACKGROUND_KEY = '__background__';
const ANIMAL_ASSET_MODULES = import.meta.glob('/public/assets/animals/*.glb');
const ANIMAL_ASSET_NAMES = Object.keys(ANIMAL_ASSET_MODULES)
    .map((path) => path.split('/').pop()?.replace(/\.glb$/i, '') || '')
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
const BACKGROUND_ASSET_MODULES = import.meta.glob('/public/assets/backgrounds/*.glb');
const BACKGROUND_ASSET_NAMES = Object.keys(BACKGROUND_ASSET_MODULES)
    .map((path) => path.split('/').pop()?.replace(/\.glb$/i, '') || '')
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));

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
    pendingSelectionKey: null,
    environmentUndo: null,
    textDraft: { narration: '', speakers: [] },
    activeInlineEditor: null,
    selectedBubbleIndex: null,
};
const IGNORED_PASSAGES = new Set(['StoryTitle', 'StoryData']);

function setStatus(msg) {
    if (el.status) el.status.textContent = msg;
}

function setDirty(next) {
    state.hasUnsavedChanges = Boolean(next);
    if (el.saveSceneBtn) el.saveSceneBtn.classList.toggle('dirty', state.hasUnsavedChanges);
}

function initAssetDropdown() {
    if (!el.addModelAssetSelect) return;
    el.addModelAssetSelect.innerHTML = '';
    const names = ANIMAL_ASSET_NAMES.length ? ANIMAL_ASSET_NAMES : ['cat', 'cow', 'deer', 'hare', 'rat', 'wolf'];
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
        const names = BACKGROUND_ASSET_NAMES.length ? BACKGROUND_ASSET_NAMES : ['ballpark', 'beach', 'bus_stop', 'tennis_court'];
        for (const name of names) {
            const opt = document.createElement('option');
            opt.value = name;
            opt.textContent = name;
            selectEl.appendChild(opt);
        }
    };
    applyOptions(el.selectedBackgroundSelect, '(No background)');
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
    setDirty(false);
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

function draftToPanelSpeakers() {
    return (state.textDraft.speakers || []).map((s) => ({
        speaker: s.speaker,
        html: plainTextToHtml(s.text || ''),
    }));
}

function buildDraftTextBlock() {
    const lines = [];
    const narration = String(state.textDraft.narration || '').trim();
    if (narration) {
        lines.push(...narration.split(/\n+/).map((l) => l.trim()).filter(Boolean));
    }
    for (const s of state.textDraft.speakers || []) {
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
    const macroAndCommand = [];
    const links = [];
    const seenMeta = new Set();
    const seenLinks = new Set();
    let multilineMacro = null;
    const pushMeta = (raw) => {
        const token = String(raw || '').trim();
        if (!token || seenMeta.has(token)) return;
        seenMeta.add(token);
        macroAndCommand.push(raw);
    };
    for (const line of lines) {
        const t = line.trim();
        if (multilineMacro) {
            multilineMacro.push(line);
            if (t.includes('>>')) {
                pushMeta(multilineMacro.join('\n'));
                multilineMacro = null;
            }
            continue;
        }
        if (!t) continue;
        if (t.startsWith('<<') && !t.includes('>>')) {
            multilineMacro = [line];
            continue;
        }
        if (/^<<.*>>$/.test(t) || /^%%.*%%$/.test(t)) {
            pushMeta(line);
            continue;
        }
        if (/\[\[[^\]]+\]\]/.test(t)) {
            if (!seenLinks.has(t)) {
                seenLinks.add(t);
                links.push(line);
            }
        }
    }
    if (multilineMacro?.length) {
        pushMeta(multilineMacro.join('\n'));
    }
    const bodyLines = buildDraftTextBlock().filter((line) => !/\[\[[^\]]+\]\]/.test(String(line)));
    const out = [];
    if (macroAndCommand.length) out.push(...macroAndCommand);
    if (bodyLines.length) out.push(...bodyLines);
    if (links.length) out.push(...links);
    const visibleOut = out.join('\n').trimEnd();
    if (!hiddenTail) return visibleOut;
    if (!visibleOut) return hiddenTail;
    return `${visibleOut}\n${hiddenTail.replace(/^\n+/, '')}`;
}

function syncDraftIntoPassageBody() {
    const p = state.passages[state.selected];
    if (!p) return;
    const next = applyDraftToPassageBody(p.body);
    p.body = next;
    if (el.passageBody) el.passageBody.value = next;
}

function updatePanelFromTextDraft() {
    if (!state.panel) return;
    state.panel.setTxt?.(plainTextToHtml(state.textDraft.narration || ''));
    state.panel.setSpeakers?.(draftToPanelSpeakers());
    wireInlineTextEditors();
    refreshSpeechBubbleDeleteButtons();
}

function openInlineTextEditor(hostEl, getValue, onCommit) {
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
    const ta = document.createElement('textarea');
    ta.className = 'inline-text-editor';
    ta.value = getValue();
    ta.style.left = `${rect.left}px`;
    ta.style.top = `${rect.top}px`;
    ta.style.width = `${Math.max(80, rect.width)}px`;
    ta.style.height = `${Math.max(28, rect.height)}px`;
    const autoSize = () => {
        ta.style.height = 'auto';
        ta.style.height = `${Math.max(28, ta.scrollHeight)}px`;
    };
    const commit = () => {
        const val = ta.value;
        ta.remove();
        hostEl.classList.remove('is-inline-editing');
        state.activeInlineEditor = null;
        if (state.panel?.three) {
            state.panel.three.setSpeakerAnimationPaused?.(false);
            state.panel.three.renderer?.setAnimationLoop?.(state.panel.three.animate);
        }
        onCommit(val);
    };
    const cancel = () => {
        ta.remove();
        hostEl.classList.remove('is-inline-editing');
        state.activeInlineEditor = null;
        if (state.panel?.three) {
            state.panel.three.setSpeakerAnimationPaused?.(false);
            state.panel.three.renderer?.setAnimationLoop?.(state.panel.three.animate);
        }
    };
    ta.addEventListener('blur', commit);
    ta.addEventListener('input', autoSize);
    ta.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            e.preventDefault();
            cancel();
        }
    });
    document.body.appendChild(ta);
    autoSize();
    ta.focus();
    ta.select();
    state.activeInlineEditor = { el: ta, commit, cancel, host: hostEl };
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
            openInlineTextEditor(
                narration,
                () => String(state.textDraft.narration || ''),
                (val) => {
                    state.textDraft.narration = String(val || '');
                    updatePanelFromTextDraft();
                    syncDraftIntoPassageBody();
                    setDirty(true);
                }
            );
        });
    }
    for (let i = 0; i < (state.panel.speechEls || []).length; i += 1) {
        const bubble = state.panel.speechEls[i];
        if (!bubble || bubble.dataset.inlineEditBound) continue;
        const draftSpeaker = state.textDraft.speakers?.[i] || null;
        bubble.dataset.inlineEditBound = '1';
        bubble.addEventListener('click', (event) => {
            event.stopPropagation();
            state.selectedBubbleIndex = i;
            refreshSpeechBubbleDeleteButtons();
            openInlineTextEditor(
                bubble,
                () => String(draftSpeaker?.text || ''),
                (val) => {
                    if (!draftSpeaker) return;
                    const idx = state.textDraft.speakers.indexOf(draftSpeaker);
                    if (idx < 0) return;
                    const nextText = String(val || '').trim();
                    if (!nextText) {
                        state.textDraft.speakers.splice(idx, 1);
                    } else {
                        state.textDraft.speakers[idx].text = nextText;
                    }
                    updatePanelFromTextDraft();
                    syncDraftIntoPassageBody();
                    setDirty(true);
                }
            );
        });
    }
}

function removeSpeechBubbleAt(index) {
    const i = Number(index);
    if (!Number.isFinite(i) || i < 0) return;
    if (!state.textDraft?.speakers?.[i]) return;
    state.textDraft.speakers.splice(i, 1);
    state.selectedBubbleIndex = null;
    updatePanelFromTextDraft();
    syncDraftIntoPassageBody();
    setDirty(true);
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
        btn.style.display = (selectedByBubble || selectedByModel) ? 'grid' : 'none';
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
        speakers.push({ speaker, html: updatedPara.trim() });
    }

    return {
        speakers,
        narrationText: narrationParas.join(format === 'twee' ? '\n' : '\n\n'),
    };
}

function parseLinkLabels(text) {
    const visible = cleanText(text);
    const labels = [];
    const re = /\[\[([^\]]+)\]\]/g;
    let m;
    while ((m = re.exec(String(visible || ''))) !== null) {
        const raw = m[1] || '';
        const pipe = raw.indexOf('|');
        if (pipe >= 0) labels.push(raw.slice(0, pipe).trim());
        else labels.push(raw.trim());
    }
    return labels.filter(Boolean);
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
    setDirty(true);
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
            setDirty(true);
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
    state.textDraft.speakers = (state.textDraft.speakers || []).filter((s) => String(s.text || '').trim().length > 0);
    updatePanelFromTextDraft();
    syncDraftIntoPassageBody();
    const snapshot = getSceneSnapshotForSave();
    if (!snapshot) {
        setStatus('No editable scene to save.');
        return;
    }

    const scene = buildSceneFromPassage(p.body, state.vars) || {};
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

    let nextBody = writeDlExprToPassage(p.body, toPrettyDlExpression(scene));
    if (Number.isFinite(state.panelAspectOverride) && state.panelAspectOverride > 0) {
        nextBody = upsertPanelAspectCommand(nextBody, state.panelAspectOverride);
    }
    p.body = nextBody;
    el.passageBody.value = nextBody;
    persistVisualEditorState();
    setDirty(false);
    setStatus(`Saved ${scene.objects.length} model transforms + camera + environment to "$DL" in "${p.name}".`);
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
    state.textDraft = {
        narration: htmlToPlainText(parsed.narrationText || ''),
        speakers: (parsed.speakers || []).map((s) => ({
            speaker: String(s.speaker || ''),
            text: htmlToPlainText(s.html || ''),
        })),
    };
    refreshEnvironmentControlsFromPassage();
    const links = parseLinkLabels(p.body);
    renderPreviewLinks(links);
    destroyPanel();
    state.panel = new Panel(curr, target, `visual_${Date.now()}`, parsed.narrationText || '', -1, scene, 'narration', topInset);
    if (state.panel?.three?.scene) {
        state.panel.three.scene.background = new THREE.Color(env.skyColor);
    }
    state.panel.setSpeakers?.(draftToPanelSpeakers());
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
    setDirty(false);
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
    setDirty(false);
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
    setDirty(true);
});

el.floatingAddSpeechBtn?.addEventListener('click', () => {
    const speaker = String(state.selectedModelKey || '').trim();
    if (!speaker || speaker === BACKGROUND_KEY) return;
    const draftSpeaker = { speaker, text: '' };
    state.textDraft.speakers.push(draftSpeaker);
    updatePanelFromTextDraft();
    syncDraftIntoPassageBody();
    setDirty(true);
    wireInlineTextEditors();
    const idx = state.textDraft.speakers.indexOf(draftSpeaker);
    const bubble = idx >= 0 ? state.panel?.speechEls?.[idx] : null;
    if (bubble) {
        openInlineTextEditor(
            bubble,
            () => '',
            (val) => {
                const i = state.textDraft.speakers.indexOf(draftSpeaker);
                if (i < 0) return;
                const nextText = String(val || '').trim();
                if (!nextText) {
                    state.textDraft.speakers.splice(i, 1);
                } else {
                    state.textDraft.speakers[i].text = nextText;
                }
                updatePanelFromTextDraft();
                syncDraftIntoPassageBody();
                setDirty(true);
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
            setDirty(true);
            refreshFloatingDeleteButton();
            refreshSelectedModelBadge();
        }
        return;
    }
    const reverted = state.panel.three.revertEditableModelTransformByKey?.(state.selectedModelKey);
    if (reverted) {
        setDirty(true);
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
        setDirty(true);
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
    setDirty(true);
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
    setDirty(true);
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
    setDirty(true);
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
        setDirty(false);
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
        window.location.href = '/';
    }, {
        onSave: () => saveSceneTransformsToPassage(),
    });
});

el.viewerLink?.addEventListener('click', async (event) => {
    event.preventDefault();
    await runWithUnsavedGuard(() => {
        window.location.href = '/';
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
initAssetDropdown();
initBackgroundDropdown();
updatePreviewStoryButton();

initDebugMode();

if (!restoreVisualEditorState()) {
    setStatus('Load a file to start visual passage preview.');
}
