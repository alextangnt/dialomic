import * as THREE from 'three';
import { Panel } from './panel.js';
import {
    stripHtml,
    splitHtmlParagraphs,
    splitParagraphs,
    buildSceneObjectMap,
    removeSpeakerParagraphsForModel,
} from './passageText.js';

/*
 * Visual editor runtime:
 * - parses Twine/Twee passages
 * - renders single-passage 3D scene previews
 * - keeps text/scene/camera editing workflows synchronized
 */

const VISUAL_EDITOR_STATE_KEY = 'DL_VISUAL_EDITOR_STATE_V1';
const PLAYER_IMPORTED_STORY_KEY = 'DL_IMPORTED_STORY_HTML';
const PLAYER_EDITOR_BOOT_STORY_KEY = 'DL_VISUAL_EDITOR_BOOT_STORY';
const BACKGROUND_KEY = '__background__';
const FALLBACK_ANIMAL_ASSET_NAMES = ['cat', 'cow', 'deer', 'hare', 'rat', 'wolf'];
const FALLBACK_BACKGROUND_ASSET_NAMES = ['ballpark', 'beach', 'bus_stop', 'tennis_court'];
let ANIMAL_ASSET_NAMES = [...FALLBACK_ANIMAL_ASSET_NAMES];
let BACKGROUND_ASSET_NAMES = [...FALLBACK_BACKGROUND_ASSET_NAMES];

const el = {
    editorHomeLink: document.getElementById('editorHomeLink'),
    file: document.getElementById('editorFile'),
    exportBtn: document.getElementById('exportBtn'),
    previewStoryBtn: document.getElementById('previewStoryBtn'),
    formatText: document.getElementById('formatText'),
    passageSelect: document.getElementById('passageSelect'),
    addPassageBtn: document.getElementById('addPassageBtn'),
    deletePassageBtn: document.getElementById('deletePassageBtn'),
    passageDialogBackdrop: document.getElementById('passageDialogBackdrop'),
    passageDialog: document.getElementById('passageDialog'),
    newPassageName: document.getElementById('newPassageName'),
    newPassageCancelBtn: document.getElementById('newPassageCancelBtn'),
    newPassageCreateBtn: document.getElementById('newPassageCreateBtn'),
    passageBody: document.getElementById('passageBody'),
    applyBtn: document.getElementById('applyBtn'),
    modelSelect: document.getElementById('modelSelect'),
    gizmoMode: document.getElementById('gizmoMode'),
    saveSceneBtn: document.getElementById('saveSceneBtn'),
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
    revertSceneBtn: document.getElementById('revertSceneBtn'),
    floatingModelButtons: document.getElementById('floatingModelButtons'),
    floatingAddSpeechBtn: document.getElementById('floatingAddSpeechBtn'),
    cameraTools: document.getElementById('cameraTools'),
    focusModelBtn: document.getElementById('focusModelBtn'),
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
    confirmDialog: document.getElementById('confirmDialog'),
    confirmTitle: document.getElementById('confirmTitle'),
    confirmMessage: document.getElementById('confirmMessage'),
    confirmOkBtn: document.getElementById('confirmOkBtn'),
    confirmCancelBtn: document.getElementById('confirmCancelBtn'),
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
    sceneSyncTimer: 0,
    stableBodyByPassage: {},
    aspectDirtyByPassage: {},
    lockedModelKeys: new Set(),
    backgroundLocked: false,
    openedHtmlBaseline: '',
    startPassageName: '',
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
    refreshRevertSceneButton();
}

function setSceneDirty(next) {
    state.hasSceneEdits = Boolean(next);
    setDirty(state.hasTextEdits || state.hasSceneEdits);
    refreshRevertSceneButton();
}

/**
 * Mark scene-dirty due to a 3D/editor interaction and immediately reflect
 * current scene snapshot in passage/text state (camera excluded elsewhere).
 */
function markSceneDirtyFrom3d() {
    syncSceneToBodyNow();
    setSceneDirty(true);
}

function getCurrentPassageKey() {
    const p = state.passages[state.selected];
    if (!p) return '';
    return `${state.selected}:${p.name}`;
}

function isStoryInitPassage(passage = state.passages[state.selected]) {
    return String(passage?.name || '').trim().toLowerCase() === 'storyinit';
}

function applyStoryInitPreviewMode(enabled) {
    const storyInit = Boolean(enabled);
    if (el.previewLinks) el.previewLinks.style.display = storyInit ? 'none' : '';
    const saveTools = document.getElementById('floatingSaveTools');
    if (saveTools) saveTools.style.display = storyInit ? 'none' : '';
    if (el.panelAspectHandle) el.panelAspectHandle.style.display = storyInit ? 'none' : (state.panelRectCache ? 'block' : 'none');
    if (el.floatingModelButtons) el.floatingModelButtons.style.display = storyInit ? 'none' : el.floatingModelButtons.style.display;
    if (el.floatingAddSpeechBtn) el.floatingAddSpeechBtn.style.display = storyInit ? 'none' : el.floatingAddSpeechBtn.style.display;
    if (el.cameraTools) el.cameraTools.style.display = storyInit ? 'none' : '';
    if (el.selectedModelBadge) el.selectedModelBadge.style.display = storyInit ? 'none' : el.selectedModelBadge.style.display;
    if (el.selectedEnvironmentControls) el.selectedEnvironmentControls.style.display = storyInit ? 'none' : el.selectedEnvironmentControls.style.display;
}

function splitTopLevelCsv(source) {
    const out = [];
    let curr = '';
    let depth = 0;
    let quote = null;
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
        if (ch === ',' && depth === 0) {
            out.push(curr.trim());
            curr = '';
            continue;
        }
        curr += ch;
    }
    if (curr.trim()) out.push(curr.trim());
    return out;
}

function withObjectIdTag(spec, idTag) {
    const id = String(idTag || '').trim();
    if (!id) return spec;
    if (typeof spec === 'string') {
        const trimmed = spec.trim();
        if (!trimmed) return `${id}=`;
        const eqIdx = trimmed.indexOf('=');
        const rhs = eqIdx > 0 ? trimmed.slice(eqIdx + 1).trim() : trimmed;
        return `${id}=${rhs}`;
    }
    if (spec && typeof spec === 'object') {
        return { ...spec, id };
    }
    return spec;
}

function extractTopLevelArrayItemsFromField(sourceText, fieldName) {
    const src = String(sourceText || '');
    const fieldRe = new RegExp(`${fieldName}\\s*:\\s*\\[`, 'i');
    const m = fieldRe.exec(src);
    if (!m) return null;
    const openIdx = m.index + m[0].length - 1; // index at '['
    if (src[openIdx] !== '[') return null;
    let i = openIdx + 1;
    let depth = 1;
    let quote = null;
    let esc = false;
    let start = i;
    const out = [];
    for (; i < src.length; i += 1) {
        const ch = src[i];
        if (quote) {
            if (esc) {
                esc = false;
                continue;
            }
            if (ch === '\\') {
                esc = true;
                continue;
            }
            if (ch === quote) quote = null;
            continue;
        }
        if (ch === '"' || ch === "'" || ch === '`') {
            quote = ch;
            continue;
        }
        if (ch === '[' || ch === '{' || ch === '(') {
            depth += 1;
            continue;
        }
        if (ch === ']' || ch === '}' || ch === ')') {
            depth -= 1;
            if (depth === 0) {
                const tail = src.slice(start, i).trim();
                if (tail) out.push(tail);
                return out;
            }
            continue;
        }
        if (ch === ',' && depth === 0) {
            out.push(src.slice(start, i).trim());
            start = i + 1;
        }
    }
    return out;
}

function applyVariableDrivenSceneBindings(passageBody, scene) {
    const sceneText = extractSceneLines(passageBody);
    const lockedModelKeys = new Set();
    let backgroundLocked = false;
    if (!scene || typeof scene !== 'object') return { lockedModelKeys, backgroundLocked };
    const objects = scene.objects;
    const collectResolvedKeys = () => {
        const keys = [];
        const objs = scene?.objects;
        if (Array.isArray(objs)) {
            objs.forEach((obj, i) => {
                if (typeof obj === 'string') {
                    const trimmed = obj.trim();
                    const eqIdx = trimmed.indexOf('=');
                    const key = eqIdx > 0 ? trimmed.slice(0, eqIdx).trim() : (trimmed.split(/\s+/)[0] || `obj_${i}`);
                    if (key) keys.push(String(key).toLowerCase());
                } else if (obj && typeof obj === 'object') {
                    const key = obj.id || obj.name || obj.model || `obj_${i}`;
                    if (key) keys.push(String(key).toLowerCase());
                }
            });
        } else if (objs && typeof objs === 'object') {
            Object.entries(objs).forEach(([k, obj]) => {
                const key = (obj && typeof obj === 'object' && (obj.id || obj.name || obj.model)) || k;
                if (key) keys.push(String(key).toLowerCase());
            });
        }
        return keys;
    };

    // objects: { key: $var, ... } -> lock/tag by variable name.
    if (objects && !Array.isArray(objects) && typeof objects === 'object') {
        const mapMatches = [...sceneText.matchAll(/(['"]?[A-Za-z_][\w-]*['"]?)\s*:\s*\$([A-Za-z_]\w*)/g)];
        for (const m of mapMatches) {
            const authoredKey = String(m[1] || '').trim().replace(/^['"]|['"]$/g, '');
            const varName = String(m[2] || '').trim();
            if (!authoredKey || !varName) continue;
            if (!Object.prototype.hasOwnProperty.call(objects, authoredKey)) continue;
            const value = objects[authoredKey];
            delete objects[authoredKey];
            objects[varName] = withObjectIdTag(value, varName);
            lockedModelKeys.add(varName.toLowerCase());
        }
    }

    // objects: [ ..., $var, ... ] -> lock/tag by variable name at matching index.
    if (Array.isArray(objects)) {
        const items = extractTopLevelArrayItemsFromField(sceneText, 'objects') || [];
        for (let i = 0; i < items.length && i < objects.length; i += 1) {
            const itm = String(items[i] || '').trim();
            const m = itm.match(/^\$([A-Za-z_]\w*)$/);
            if (!m) continue;
            const varName = String(m[1] || '').trim();
            if (!varName) continue;
            objects[i] = withObjectIdTag(objects[i], varName);
            lockedModelKeys.add(varName.toLowerCase());
        }
    }

    // If a global variable appears in scene text and its resolved object exists in the scene,
    // ensure it is tagged + locked even when authored syntax is complex.
    const referencedVarNames = new Set(
        [...sceneText.matchAll(/\$([A-Za-z_]\w*)/g)]
            .map((m) => String(m[1] || '').trim())
            .filter(Boolean)
    );
    if (referencedVarNames.size && Array.isArray(objects)) {
        const entries = Object.entries(state.vars || {});
        for (const [name, value] of entries) {
            if (!referencedVarNames.has(name)) continue;
            for (let i = 0; i < objects.length; i += 1) {
                const obj = objects[i];
                if (typeof obj === 'string' && typeof value === 'string') {
                    const sObj = obj.trim().toLowerCase();
                    const sVal = value.trim().toLowerCase();
                    const eqIdx = sObj.indexOf('=');
                    const rhs = eqIdx > 0 ? sObj.slice(eqIdx + 1).trim() : sObj;
                    if (rhs === sVal) {
                        objects[i] = withObjectIdTag(obj, name);
                        lockedModelKeys.add(name.toLowerCase());
                    }
                } else if (obj && typeof obj === 'object' && value && typeof value === 'object') {
                    const key = String(obj.id || obj.name || obj.model || '').trim().toLowerCase();
                    if (key === name.toLowerCase()) {
                        objects[i] = withObjectIdTag(obj, name);
                        lockedModelKeys.add(name.toLowerCase());
                    }
                }
            }
        }
    }

    // Broad global fallback:
    // Any StoryInit variable declared as <<set $var = ...>> that matches an existing
    // scene object id/key should be treated as global (locked + tagged to var name).
    const declaredVarNames = Object.keys(state.vars || {})
        .map((n) => String(n || '').trim())
        .filter(Boolean);
    if (declaredVarNames.length) {
        if (Array.isArray(objects)) {
            for (let i = 0; i < objects.length; i += 1) {
                const obj = objects[i];
                let key = '';
                if (typeof obj === 'string') {
                    const trimmed = obj.trim();
                    const eqIdx = trimmed.indexOf('=');
                    key = eqIdx > 0 ? trimmed.slice(0, eqIdx).trim() : (trimmed.split(/\s+/)[0] || '');
                } else if (obj && typeof obj === 'object') {
                    key = String(obj.id || obj.name || obj.model || '').trim();
                }
                if (!key) continue;
                const match = declaredVarNames.find((v) => v.toLowerCase() === key.toLowerCase());
                if (!match) continue;
                objects[i] = withObjectIdTag(obj, match);
                lockedModelKeys.add(match.toLowerCase());
            }
        } else if (objects && typeof objects === 'object') {
            for (const [k, value] of Object.entries(objects)) {
                const match = declaredVarNames.find((v) => v.toLowerCase() === String(k).toLowerCase());
                if (!match) continue;
                if (k !== match) {
                    delete objects[k];
                    objects[match] = withObjectIdTag(value, match);
                } else {
                    objects[k] = withObjectIdTag(value, match);
                }
                lockedModelKeys.add(match.toLowerCase());
            }
        }
    }

    // Heuristic fallback for array-form objects where parsing nested arrays/objects
    // makes direct index mapping hard. If a resolved object string equals a variable
    // value token (e.g. "$cow" -> "cow"), tag/lock it by variable name.
    const allVarNames = [...sceneText.matchAll(/\$([A-Za-z_]\w*)/g)]
        .map((m) => String(m[1] || '').trim())
        .filter(Boolean);
    if (Array.isArray(objects) && allVarNames.length) {
        for (let i = 0; i < objects.length; i += 1) {
            const obj = objects[i];
            if (typeof obj !== 'string') continue;
            const trimmed = obj.trim().toLowerCase();
            const eqIdx = trimmed.indexOf('=');
            const currentId = eqIdx > 0 ? trimmed.slice(0, eqIdx).trim() : '';
            if (currentId) continue;
            for (const vn of allVarNames) {
                const v = vn.toLowerCase();
                if (trimmed === v || trimmed.startsWith(`${v} `)) {
                    objects[i] = withObjectIdTag(obj, v);
                    lockedModelKeys.add(v);
                    break;
                }
            }
        }
    }

    // Fallback: if a model with the variable-name key exists, lock it.
    const allVarRefs = new Set([...sceneText.matchAll(/\$([A-Za-z_]\w*)/g)].map((m) => String(m[1] || '').trim().toLowerCase()).filter(Boolean));
    if (allVarRefs.size) {
        const existingKeys = new Set();
        if (Array.isArray(objects)) {
            for (const obj of objects) {
                if (typeof obj === 'string') {
                    const trimmed = obj.trim();
                    const eqIdx = trimmed.indexOf('=');
                    const key = eqIdx > 0 ? trimmed.slice(0, eqIdx).trim() : (trimmed.split(/\s+/)[0] || '');
                    if (key) existingKeys.add(String(key).toLowerCase());
                } else if (obj && typeof obj === 'object') {
                    const key = obj.id || obj.name || obj.model || '';
                    if (key) existingKeys.add(String(key).toLowerCase());
                }
            }
        } else if (objects && typeof objects === 'object') {
            for (const [k, obj] of Object.entries(objects)) {
                const key = (obj && typeof obj === 'object' && (obj.id || obj.name || obj.model)) || k;
                if (key) existingKeys.add(String(key).toLowerCase());
            }
        }
        for (const v of allVarRefs) {
            if (existingKeys.has(v)) lockedModelKeys.add(v);
        }
    }

    // If entire $DL is referenced from one global variable, lock all resolved objects.
    if (/<<\s*set\s+\$DL\s*=\s*\$[A-Za-z_]\w*\s*>>/i.test(sceneText)) {
        for (const key of collectResolvedKeys()) lockedModelKeys.add(key);
        if (scene?.background) backgroundLocked = true;
    }

    backgroundLocked = /background\s*:\s*\$[A-Za-z_]\w*/i.test(sceneText);
    return { lockedModelKeys, backgroundLocked };
}

function refreshRevertSceneButton() {
    if (!el.revertSceneBtn) return;
    const key = getCurrentPassageKey();
    const p = state.passages[state.selected];
    if (!key || !p) {
        el.revertSceneBtn.disabled = true;
        return;
    }
    const stable = state.stableBodyByPassage[key];
    el.revertSceneBtn.disabled = !(typeof stable === 'string' && stable !== String(p.body || ''));
}

function ensureStableBodySnapshot(passageIndex = state.selected) {
    const p = state.passages[passageIndex];
    if (!p) return;
    const key = `${passageIndex}:${p.name}`;
    if (!key) return;
    if (typeof state.stableBodyByPassage[key] !== 'string') {
        state.stableBodyByPassage[key] = String(p.body || '');
    }
}

function initializeStableBodySnapshots() {
    state.stableBodyByPassage = {};
    state.aspectDirtyByPassage = {};
    for (let i = 0; i < state.passages.length; i += 1) {
        const p = state.passages[i];
        const key = `${i}:${p?.name || ''}`;
        if (!p || !key) continue;
        state.stableBodyByPassage[key] = String(p.body || '');
        state.aspectDirtyByPassage[key] = false;
    }
}

function refreshCameraButtons() {
    const three = state.panel?.three;
    const hasPanel = Boolean(three);
    const storyInit = isStoryInitPassage();
    const passageKey = getCurrentPassageKey();
    const saved = passageKey ? state.savedCameraByPassage[passageKey] : null;
    const implicit = passageKey ? state.implicitCameraByPassage[passageKey] : null;
    const baseline = saved || implicit || null;
    const current = hasPanel && three.getCameraSpecSnapshot ? three.getCameraSpecSnapshot() : null;
    const sameAsBaseline = current && baseline ? cameraSpecsEqual(current, baseline) : false;
    if (el.saveCameraBtn) {
        el.saveCameraBtn.disabled = storyInit || !hasPanel || sameAsBaseline;
    }
    if (el.revertCameraBtn) {
        el.revertCameraBtn.disabled = storyInit || !hasPanel || !baseline || sameAsBaseline;
    }
    refreshFocusButton();
    positionCameraTools();
}

function refreshFocusButton() {
    if (!el.focusModelBtn) return;
    const three = state.panel?.three;
    const key = String(state.selectedModelKey || '').trim();
    if (!three || !key) {
        el.focusModelBtn.disabled = true;
        return;
    }
    const model = three.getModelByKey?.(key);
    el.focusModelBtn.disabled = !model;
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
        refreshFocusButton();
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
        refreshFocusButton();
        return;
    }

    if (el.selectedModelBadge) el.selectedModelBadge.style.display = 'none';
    if (el.selectedEnvironmentControls) {
        el.selectedEnvironmentControls.style.display = 'flex';
        el.selectedEnvironmentControls.style.left = left;
        el.selectedEnvironmentControls.style.top = top;
    }
    const bgLocked = Boolean(state.panel?.three?.isEditorBackgroundLocked?.());
    if (el.selectedBackgroundSelect) el.selectedBackgroundSelect.disabled = bgLocked;
    if (el.selectedSkyColorInput) el.selectedSkyColorInput.disabled = bgLocked;
    if (el.selectedEnvironmentResetBtn) {
        el.selectedEnvironmentResetBtn.disabled = bgLocked;
    }
    refreshFocusButton();
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
        if (el.floatingModeTranslateBtn) el.floatingModeTranslateBtn.disabled = true;
        if (el.floatingModeRotateBtn) el.floatingModeRotateBtn.disabled = true;
        if (el.floatingModeScaleBtn) el.floatingModeScaleBtn.disabled = true;
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
    const hasSelectedModel = Boolean(state.panel?.three?.getModelByKey?.(state.selectedModelKey));
    const isEnvironment = state.selectedModelKey === BACKGROUND_KEY;
    const selectedModelObj = state.panel?.three?.getModelByKey?.(state.selectedModelKey);
    const selectedSourceId = String(selectedModelObj?.userData?.sourceId || '').toLowerCase();
    const locked = isEnvironment
        ? Boolean(state.panel?.three?.isEditorBackgroundLocked?.())
        : (Boolean(state.panel?.three?.isEditorModelLocked?.(state.selectedModelKey))
            || Boolean(selectedModelObj?.userData?.editorLocked)
            || Boolean(selectedSourceId && state.lockedModelKeys?.has?.(selectedSourceId)));
    if (locked && !isEnvironment) {
        el.floatingModelButtons.style.display = 'none';
        if (el.floatingAddSpeechBtn) {
            el.floatingAddSpeechBtn.style.display = hasSelectedModel ? 'inline-block' : 'none';
            el.floatingAddSpeechBtn.style.left = `${x}px`;
            el.floatingAddSpeechBtn.style.top = `${Math.max(0, cy - paneRect.top - (ringDistancePx + 16))}px`;
        }
        if (el.floatingModeTranslateBtn) el.floatingModeTranslateBtn.disabled = true;
        if (el.floatingModeRotateBtn) el.floatingModeRotateBtn.disabled = true;
        if (el.floatingModeScaleBtn) el.floatingModeScaleBtn.disabled = true;
        return;
    }
    const disableTransforms = !hasSelectedModel || locked;
    if (el.floatingModeTranslateBtn) el.floatingModeTranslateBtn.disabled = disableTransforms;
    if (el.floatingModeRotateBtn) el.floatingModeRotateBtn.disabled = disableTransforms;
    if (el.floatingModeScaleBtn) el.floatingModeScaleBtn.disabled = disableTransforms;
    if (el.floatingDeleteModelBtn) el.floatingDeleteModelBtn.disabled = !hasSelectedModel;
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

function applySceneFromBodyLive(body, { ignoreCamera = false } = {}) {
    if (!state.panel) return;
    const scene = buildSceneFromPassage(body, state.vars) || {};
    const sceneForApply = cloneSceneSpec(scene) || {};
    const locks = applyVariableDrivenSceneBindings(body, sceneForApply);
    if (ignoreCamera && sceneForApply && typeof sceneForApply === 'object') {
        const liveCamera = state.panel?.three?.getCameraSpecSnapshot?.() || null;
        if (liveCamera) {
            sceneForApply.camera = cloneSceneSpec(liveCamera);
        } else {
            delete sceneForApply.camera;
        }
    }
    state.lastSceneConfig = scene?.config || state.lastSceneConfig || null;
    const aspectMode = String(sceneForApply?.config?.aspect || 'free').toLowerCase() === 'fixed' ? 'fixed' : 'free';
    state.panel.setAspectMode?.(aspectMode);
    state.panel.setScene?.(sceneForApply);
    state.lockedModelKeys = locks.lockedModelKeys;
    state.backgroundLocked = locks.backgroundLocked;
    state.panel?.three?.setEditorLockConfig?.({
        modelKeys: Array.from(state.lockedModelKeys),
        backgroundLocked: state.backgroundLocked,
    });
    state.panel.setSpeakers?.(draftToPanelSpeakers());
    suppressPreviewSpeakerAnimation();
    wireInlineTextEditors();
    refreshSpeechBubbleDeleteButtons();
    refreshModelSelect();
    refreshSelectedModelBadge();
    refreshEnvironmentControlsFromPassage();
    refreshFloatingDeleteButton();
}

function syncSceneToBodyNow() {
    if (state.sceneSyncTimer) {
        clearTimeout(state.sceneSyncTimer);
        state.sceneSyncTimer = 0;
    }
    const p = state.passages[state.selected];
    if (!p) return false;
    const nextBody = composeBodyWithCurrentSceneSnapshot(p.body || '');
    if (nextBody === String(p.body || '')) return false;
    p.body = nextBody;
    if (el.passageBody) el.passageBody.value = nextBody;
    if (state.activeInlineEditor?.setSceneText) {
        state.activeInlineEditor.setSceneText(extractSceneLines(nextBody), { applyLive: false });
    }
    refreshDraftFromPassageBody();
    return true;
}

function upsertSceneCameraSpec(bodyRaw, cameraSpec) {
    const baseBody = String(bodyRaw || '');
    if (!cameraSpec || typeof cameraSpec !== 'object') return baseBody;
    const sceneText = extractSceneLines(baseBody);
    const hasVariableRefs = /(?:\bobjects\b[\s\S]*?\$[A-Za-z_]\w*)|(?:\bbackground\b\s*:\s*\$[A-Za-z_]\w*)/i.test(sceneText);
    if (hasVariableRefs) {
        const matches = getDlMacroMatches(sceneText);
        if (!matches.length) return baseBody;
        const expr = String(matches[matches.length - 1].expr || '').trim();
        if (!expr.startsWith('{') || !expr.endsWith('}')) return baseBody;
        const cameraBlock = `"camera": ${JSON.stringify(cameraSpec, null, 2)}`;
        let nextExpr = expr;
        if (/"camera"\s*:/.test(nextExpr)) {
            nextExpr = nextExpr.replace(/"camera"\s*:\s*(\{[\s\S]*?\}|\[[\s\S]*?\]|"[^"]*"|[^,\n}]+)\s*,?/m, `${cameraBlock},`);
            nextExpr = nextExpr.replace(/,\s*}/g, '\n}');
        } else {
            nextExpr = nextExpr.replace(/\}\s*$/, (tail) => {
                const core = nextExpr.slice(0, -tail.length).trimEnd();
                const needsComma = !core.endsWith('{');
                return `${needsComma ? ',' : ''}\n${cameraBlock}\n}`;
            });
        }
        const nextSceneText = writeDlExprToPassage(sceneText, nextExpr);
        if (nextSceneText === sceneText) return baseBody;
        return mergeLinesAtIndices(
            baseBody,
            getSceneLineIndices(baseBody),
            nextSceneText,
            'top'
        );
    }
    const scene = buildSceneFromPassage(baseBody, state.vars) || {};
    scene.camera = cloneSceneSpec(cameraSpec);
    return writeDlExprToPassage(baseBody, toPrettyDlExpression(scene));
}

function insertSpeechLineInDraft(rawLine) {
    const line = String(rawLine || '').trimEnd();
    if (!line) return String(state.textDraft.narrationRaw || '');
    const visible = String(state.textDraft.narrationRaw || '').replace(/\s*$/, '');
    const choiceIdx = getChoiceLineIndices(visible);
    if (!choiceIdx.length) {
        return `${visible}\n${line}`.replace(/^\n+/, '');
    }
    const lines = splitLinesPreserve(visible);
    const insertAt = Math.max(0, Math.min(lines.length, choiceIdx[0]));
    lines.splice(insertAt, 0, line);
    return lines.join('\n').replace(/\n{3,}/g, '\n\n').replace(/^\n+/, '');
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

function showConfirmDialog(message, title = 'Confirm') {
    return new Promise((resolve) => {
        if (!el.confirmDialog) {
            resolve(window.confirm(String(message || 'Are you sure?')));
            return;
        }
        if (el.confirmTitle) el.confirmTitle.textContent = String(title || 'Confirm');
        if (el.confirmMessage) el.confirmMessage.textContent = String(message || 'Are you sure?');
        el.confirmDialog.hidden = false;
        const cleanup = () => {
            el.confirmDialog.hidden = true;
            el.confirmOkBtn?.removeEventListener('click', onOk);
            el.confirmCancelBtn?.removeEventListener('click', onCancel);
        };
        const onOk = () => { cleanup(); resolve(true); };
        const onCancel = () => { cleanup(); resolve(false); };
        el.confirmOkBtn?.addEventListener('click', onOk);
        el.confirmCancelBtn?.addEventListener('click', onCancel);
    });
}

/**
 * Guard navigation/actions with save/discard/cancel behavior for unsaved edits.
 */
async function runWithUnsavedGuard(action, { onSave, onDiscard } = {}) {
    if (!state.hasUnsavedChanges) {
        await Promise.resolve(action());
        return;
    }
    const choice = await showUnsavedDialog();
    if (choice === 'cancel') return;
    if (choice === 'save' && typeof onSave === 'function') {
        await Promise.resolve(onSave());
    }
    if (choice === 'discard' && typeof onDiscard === 'function') {
        await Promise.resolve(onDiscard());
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
        el.previewStoryBtn.title = 'Open player';
    } else {
        el.previewStoryBtn.title = 'compile locally first, then import to player directly';
    }
}

function initDebugMode() {
    const params = new URLSearchParams(window.location.search);
    state.debugMode = params.get('debug') === '1';
    document.body.classList.toggle('debug-mode', state.debugMode);
}

function sortPassagesStoryInitFirst(passages) {
    const list = Array.isArray(passages) ? [...passages] : [];
    const idx = list.findIndex((p) => String(p?.name || '').trim().toLowerCase() === 'storyinit');
    if (idx <= 0) return list;
    const [storyInit] = list.splice(idx, 1);
    return [storyInit, ...list];
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
    const nodes = Array.from(storyData.querySelectorAll('tw-passagedata'));
    const passages = nodes.map((node) => ({
        pid: Number(node.getAttribute('pid') || 0),
        name: node.getAttribute('name') || '',
        tags: String(node.getAttribute('tags') || '').split(/\s+/).map((s) => s.trim()).filter(Boolean),
        body: node.textContent || '',
    }));
    const startPid = Number(storyData.getAttribute('startnode') || 0);
    const startPassage = nodes.find((n) => Number(n.getAttribute('pid') || 0) === startPid);
    const startPassageName = String(startPassage?.getAttribute('name') || '').trim();
    return { passages, template: html, startPassageName };
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

function removeVariableReferenceFromScene(rawBody, varName) {
    const body = String(rawBody || '');
    const key = String(varName || '').trim();
    if (!key) return body;
    const esc = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    let next = body;
    // object map: key: $var or "key": $var
    next = next.replace(new RegExp(`\\s*['"]?[A-Za-z_][\\w-]*['"]?\\s*:\\s*\\$${esc}\\s*,?`, 'gi'), (m) => m.includes('\n') ? '\n' : '');
    // object map: key: { ... id: "var"... } fallback by key name
    next = next.replace(new RegExp(`\\s*['"]?${esc}['"]?\\s*:\\s*[^,}\\]]+\\s*,?`, 'gi'), (m) => m.includes('\n') ? '\n' : '');
    // array token: $var
    next = next.replace(new RegExp(`(^|[\\[,])\\s*\\$${esc}\\s*(?=,|\\])`, 'gi'), '$1');
    next = next.replace(/,\s*,/g, ',').replace(/\[\s*,/g, '[').replace(/,\s*\]/g, ']');
    return next.replace(/\n{3,}/g, '\n\n');
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

function isChoiceDividerLine(line) {
    return /^%%%+\s*$/.test(String(line || '').trim());
}

function normalizeChoiceDivider(raw) {
    const lines = splitLinesPreserve(raw);
    const withoutDivider = lines.filter((line) => !isChoiceDividerLine(line));
    const firstChoiceIdx = withoutDivider.findIndex((line) => {
        const src = String(line || '');
        const t = src.trim();
        return /\[\[[^\]]+\]\]/.test(src) || /<<(?:link|button)\b/i.test(t);
    });
    if (firstChoiceIdx < 0) return withoutDivider.join('\n');
    const out = [...withoutDivider];
    out.splice(firstChoiceIdx, 0, '%%%');
    return out.join('\n');
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
        if (isChoiceDividerLine(lines[i])) continue;
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
        if (!edited.length) return base.join('\n');
        if (insertAt === 'top') return [...edited, ...base].join('\n');
        return [...base, ...edited].join('\n');
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
    return out.join('\n');
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

function escapeHtmlForEditor(text) {
    return String(text || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function highlightSugarcubeTokens(text) {
    const src = String(text || '');
    // Tokenize delimiters/operators so opening brackets highlight immediately.
    const re = /(^|\n)\s*[^:\n<>[\]%]+::|<<|>>|\[\[|\]\]|%%|\$[A-Za-z_]\w*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\b\d+(?:\.\d+)?\b|[{}\[\](),:]/gm;
    let out = '';
    let last = 0;
    let m;
    while ((m = re.exec(src)) !== null) {
        out += escapeHtmlForEditor(src.slice(last, m.index));
        const tok = String(m[0] || '');
        let cls = 'sugar-token';
        if (tok === '<<' || tok === '>>') cls = 'sugar-macro';
        else if (tok === '[[' || tok === ']]') cls = 'sugar-link';
        else if (tok === '%%') cls = 'dialomic-macro';
        else if (/::\s*$/.test(tok)) cls = 'speaker-prefix';
        else if (/^\$[A-Za-z_]\w*$/.test(tok)) cls = 'sugar-var';
        else if (/^['"]/.test(tok)) cls = 'js-string';
        else if (/^\d/.test(tok)) cls = 'js-number';
        else if (/^[{}\[\](),:]$/.test(tok)) cls = 'js-punct';
        const tokenStart = m.index;
        const tokenEnd = tokenStart + tok.length;
        const err = Array.isArray(highlightSugarcubeTokens.errorRanges)
            && highlightSugarcubeTokens.errorRanges.some((r) => tokenStart < r.end && tokenEnd > r.start);
        out += `<span class="${cls}${err ? ' lint-error' : ''}">${escapeHtmlForEditor(tok)}</span>`;
        last = re.lastIndex;
    }
    out += escapeHtmlForEditor(src.slice(last));
    return out;
}

function lintSugarcubeText(text) {
    const source = String(text || '');
    const issues = [];
    const errorRanges = [];
    const addRange = (index, len = 1) => {
        const start = Math.max(0, Number(index) || 0);
        const end = Math.max(start + 1, start + Math.max(1, Number(len) || 1));
        errorRanges.push({ start, end });
    };
    const stack = [];
    const macroRe = /<<\s*(\/?\s*[A-Za-z_]\w*)[^>]*>>/g;
    let m;
    while ((m = macroRe.exec(source)) !== null) {
        const raw = String(m[1] || '').trim().toLowerCase();
        const line = source.slice(0, m.index).split('\n').length;
        if (!raw) continue;
        if (raw === 'if' || raw === 'for' || raw === 'switch') {
            stack.push({ type: raw, line, index: m.index });
            continue;
        }
        if (raw === 'elseif' || raw === 'else') {
            const top = stack[stack.length - 1];
            if (!top || top.type !== 'if') {
                issues.push(`Line ${line}: <<${raw}>> without open <<if>>`);
                addRange(m.index, m[0]?.length || 2);
            }
            continue;
        }
        if (raw === '/if' || raw === 'endif') {
            const top = stack.pop();
            if (!top || top.type !== 'if') {
                issues.push(`Line ${line}: unmatched <<${raw}>>`);
                addRange(m.index, m[0]?.length || 2);
            }
            continue;
        }
        if (raw === '/for' || raw === 'endfor') {
            const top = stack.pop();
            if (!top || top.type !== 'for') {
                issues.push(`Line ${line}: unmatched <<${raw}>>`);
                addRange(m.index, m[0]?.length || 2);
            }
            continue;
        }
        if (raw === '/switch' || raw === 'endswitch') {
            const top = stack.pop();
            if (!top || top.type !== 'switch') {
                issues.push(`Line ${line}: unmatched <<${raw}>>`);
                addRange(m.index, m[0]?.length || 2);
            }
            continue;
        }
    }
    while (stack.length) {
        const open = stack.pop();
        issues.push(`Line ${open.line}: unclosed <<${open.type}>>`);
        addRange(open.index || 0, 2);
    }

    // Lightweight bracket/brace/paren matcher (ignores quoted strings).
    const delim = [];
    let quote = null;
    for (let i = 0; i < source.length; i += 1) {
        const ch = source[i];
        if (quote) {
            if (ch === '\\') {
                i += 1;
                continue;
            }
            if (ch === quote) quote = null;
            continue;
        }
        if (ch === '"' || ch === "'" || ch === '`') {
            quote = ch;
            continue;
        }
        if (ch === '{' || ch === '[' || ch === '(') {
            delim.push({ ch, line: source.slice(0, i).split('\n').length, index: i });
            continue;
        }
        if (ch === '}' || ch === ']' || ch === ')') {
            const top = delim.pop();
            const pair = top?.ch;
            const ok = (pair === '{' && ch === '}')
                || (pair === '[' && ch === ']')
                || (pair === '(' && ch === ')');
            if (!ok) {
                const line = source.slice(0, i).split('\n').length;
                issues.push(`Line ${line}: unmatched "${ch}"`);
                addRange(i, 1);
            }
        }
    }
    while (delim.length) {
        const top = delim.pop();
        issues.push(`Line ${top.line}: unclosed "${top.ch}"`);
        addRange(top.index, 1);
    }

    // Very light JSON-ish comma lint inside object/array literals.
    const missingCommaRe = /(["'\}\]0-9])\s*\n\s*(["'$\[{A-Za-z_])/g;
    let mc;
    while ((mc = missingCommaRe.exec(source)) !== null) {
        const idx = mc.index + String(mc[1] || '').length;
        const line = source.slice(0, idx).split('\n').length;
        issues.push(`Line ${line}: possible missing comma`);
        addRange(idx, 1);
    }
    return { issues, errorRanges };
}

function draftNarrationHtmlForPanel() {
    const raw = String(state.textDraft.narrationRaw || state.textDraft.narration || '');
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
    const lines = source.split('\n');
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

    const visibleOut = out.join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .replace(/^\n+/, '')
        .trimEnd();
    return visibleOut;
}

function syncDraftIntoPassageBody() {
    const p = state.passages[state.selected];
    if (!p) return;
    const next = normalizeChoiceDivider(String(state.textDraft.narrationRaw || ''));
    logBodyDiff(p.body, next, `sync:${p.name || state.selected}`);
    p.body = next;
    if (el.passageBody) el.passageBody.value = next;
    state.textDraft.narrationRaw = next;
}

function applyCurrentPassageBody(nextBody, { applyScene = true, markSceneDirty = true } = {}) {
    const p = state.passages[state.selected];
    if (!p) return false;
    const next = String(nextBody || '');
    if (next === String(p.body || '')) return false;
    p.body = next;
    if (el.passageBody) el.passageBody.value = next;
    if (state.activeInlineEditor?.setSceneText) {
        state.activeInlineEditor.setSceneText(extractSceneLines(next), { applyLive: false });
    }
    refreshDraftFromPassageBody();
    if (applyScene) applySceneFromBodyLive(next, { ignoreCamera: true });
    renderPreviewLinks(parseLinkLabels(next));
    if (markSceneDirty) setSceneDirty(true);
    return true;
}

function removeSpeakerLinesFromCurrentDraft(modelKey) {
    const key = String(modelKey || '').trim();
    if (!key) return 0;
    const currentVisible = String(state.textDraft.narrationRaw || '');
    const { body: cleanedVisible, removed } = removeSpeakerParagraphsForModel(currentVisible, state.format, key);
    if (cleanedVisible === currentVisible) return removed;
    state.textDraft.narrationRaw = cleanedVisible;
    syncDraftIntoPassageBody();
    refreshDraftFromPassageBody();
    updatePanelFromTextDraft();
    return removed;
}

function removeLockedGlobalFromCurrentPassage(selectedKey) {
    const p = state.passages[state.selected];
    if (!p) return false;
    const sourceVar = String(state.panel?.three?.getModelByKey?.(selectedKey)?.userData?.sourceId || selectedKey);
    const next = removeVariableReferenceFromScene(String(p.body || ''), sourceVar);
    const pruned = removeSpeakerParagraphsForModel(next, state.format, selectedKey);
    return applyCurrentPassageBody(pruned.body, { applyScene: true, markSceneDirty: true });
}

function tryDeleteSelectedModel() {
    if (!state.panel?.three || !state.selectedModelKey) return false;
    const selectedKey = String(state.selectedModelKey || '').trim().toLowerCase();
    const isLockedGlobal = Boolean(
        selectedKey &&
        selectedKey !== BACKGROUND_KEY &&
        state.panel.three.isEditorModelLocked?.(selectedKey)
    );
    if (isLockedGlobal) {
        removeLockedGlobalFromCurrentPassage(selectedKey);
        return true;
    }
    const deletedKey = String(state.selectedModelKey);
    const removedLines = (state.textDraft.speakers || []).filter(
        (s) => String(s.speaker || '').trim().toLowerCase() === deletedKey.toLowerCase()
    ).length;
    if (removedLines > 0) {
        const ok = window.confirm(
            `Model "${deletedKey}" has ${removedLines} speech bubble paragraph${removedLines === 1 ? '' : 's'}. Delete model and remove those paragraph${removedLines === 1 ? '' : 's'}?`
        );
        if (!ok) return false;
    }
    const removed = state.panel.three.removeEditableModelByKey?.(deletedKey);
    if (!removed) return false;
    removeSpeakerLinesFromCurrentDraft(deletedKey);
    setTextDirty(true);
    markSceneDirtyFrom3d();
    refreshModelSelect();
    refreshFloatingDeleteButton();
    refreshCurrentPanelTextAndBubbles();
    return true;
}

function refreshDraftFromPassageBody() {
    const p = state.passages[state.selected];
    if (!p) return;
    const visibleBody = String(p.body || '');
    const scene = buildSceneFromPassage(p.body, state.vars) || {};
    const sceneObjects = buildSceneObjectMap(scene?.objects);
    const parsed = parseSpeakerBlocks(visibleBody, sceneObjects, state.format, { requireKnownSpeaker: false });
    state.textDraft.narrationRaw = visibleBody;
    state.textDraft.narration = parseNarrationRawBlock(visibleBody);
    state.textDraft.hiddenTail = '';
    state.textDraft.speakers = (parsed.speakers || []).map((s) => ({
        speaker: String(s.speaker || ''),
        text: htmlToPlainText(s.html || ''),
        raw: String(s.raw || ''),
        sourceIndex: Number.isFinite(Number(s.sourceIndex)) ? Number(s.sourceIndex) : null,
    }));
}

function replaceSpeakerBlockAtSourceIndex(visibleRaw, sourceIndex, nextRaw) {
    const idx = Number(sourceIndex);
    if (!Number.isFinite(idx) || idx < 0) return null;
    const parts = splitParagraphs(visibleRaw, state.format);
    if (idx >= parts.length) return null;
    const replacement = String(nextRaw || '').trim();
    if (!replacement) {
        parts.splice(idx, 1);
    } else {
        parts[idx] = replacement;
    }
    // splitParagraphs() is line-based for both html and twee in the editor.
    const sep = '\n';
    return parts.join(sep);
}

function getLastSpeechDraftIndex() {
    const speakers = state.textDraft.speakers || [];
    if (!speakers.length) return -1;
    let bestIdx = speakers.length - 1;
    let bestSource = Number.NEGATIVE_INFINITY;
    for (let i = 0; i < speakers.length; i += 1) {
        const src = Number(speakers[i]?.sourceIndex);
        if (Number.isFinite(src) && src >= bestSource) {
            bestSource = src;
            bestIdx = i;
        }
    }
    return bestIdx;
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
    // Debug: print currently resolved global variables whenever any inline editor opens.
    // Use console.log (not debug) so it shows in default console levels.
    const storyInit = state.passages.find((p) => String(p?.name || '').trim().toLowerCase() === 'storyinit');
    const globalsSnapshot = parseStoryInitGlobals(String(storyInit?.body || state.storyInitBody || ''));
    state.vars = globalsSnapshot;
    window.__DL_GLOBALS__ = cloneSceneSpec(globalsSnapshot);
    if (state.panel?.three) {
        state.panel.three.setSpeakerAnimationPaused?.(true);
        state.panel.three.renderer?.setAnimationLoop?.(null);
    }
    const backdrop = document.createElement('div');
    backdrop.className = 'inline-text-editor-backdrop';
    document.body.appendChild(backdrop);
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
    const actions = document.createElement('div');
    actions.className = 'inline-text-editor-actions';
    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'inline-editor-cancel';
    cancelBtn.textContent = String(options.cancelLabel || 'Cancel');
    const doneBtn = document.createElement('button');
    doneBtn.type = 'button';
    doneBtn.className = 'inline-editor-done';
    doneBtn.textContent = String(options.doneLabel || 'Done');
    actions.appendChild(cancelBtn);
    actions.appendChild(doneBtn);
    wrapper.appendChild(actions);
    const ta = document.createElement('textarea');
    ta.className = 'inline-text-editor-input';
    ta.value = getValue();
    const getCursorLineCol = (textarea) => {
        const pos = Math.max(0, Number(textarea?.selectionStart) || 0);
        const prefix = String(textarea?.value || '').slice(0, pos);
        const lines = prefix.split('\n');
        const line = lines.length;
        const col = String(lines[lines.length - 1] || '').length + 1;
        return { line, col };
    };
    const isInsideMacroField = (text, pos) => {
        const src = String(text || '');
        const before = src.slice(0, Math.max(0, pos));
        const after = src.slice(Math.max(0, pos));
        const opens = (before.match(/<</g) || []).length;
        const closes = (before.match(/>>/g) || []).length;
        if (opens <= closes) return false;
        return after.includes('>>');
    };
    const replaceSelection = (textarea, nextText, caretStart, caretEnd = caretStart) => {
        textarea.setRangeText(nextText, textarea.selectionStart, textarea.selectionEnd, 'end');
        textarea.selectionStart = Math.max(0, caretStart);
        textarea.selectionEnd = Math.max(0, caretEnd);
    };
    const handleCodeEditorKeydown = (e, textarea) => {
        if (!textarea) return;
        if (e.key === 'Tab') {
            e.preventDefault();
            const value = String(textarea.value || '');
            const start = textarea.selectionStart;
            const end = textarea.selectionEnd;
            const lineStart = value.lastIndexOf('\n', Math.max(0, start - 1)) + 1;
            const lineEndSearch = value.indexOf('\n', end);
            const lineEnd = lineEndSearch < 0 ? value.length : lineEndSearch;
            const block = value.slice(lineStart, lineEnd);
            const lines = block.split('\n');
            if (e.shiftKey) {
                let removed = 0;
                const nextLines = lines.map((ln) => {
                    const m = ln.match(/^ {1,4}/);
                    const n = m ? m[0].length : 0;
                    removed += n;
                    return ln.slice(n);
                });
                const next = nextLines.join('\n');
                textarea.setSelectionRange(lineStart, lineEnd);
                replaceSelection(textarea, next, Math.max(lineStart, start - 4), Math.max(lineStart, end - removed));
                return;
            }
            const prefix = '    ';
            if (start !== end || block.includes('\n')) {
                const next = lines.map((ln) => `${prefix}${ln}`).join('\n');
                textarea.setSelectionRange(lineStart, lineEnd);
                replaceSelection(textarea, next, start + prefix.length, end + prefix.length * lines.length);
                return;
            }
            textarea.setSelectionRange(start, end);
            replaceSelection(textarea, prefix, start + prefix.length);
            return;
        }
        if (e.key === 'Enter') {
            const value = String(textarea.value || '');
            const pos = textarea.selectionStart;
            if (!isInsideMacroField(value, pos)) return;
            e.preventDefault();
            const lineStart = value.lastIndexOf('\n', Math.max(0, pos - 1)) + 1;
            const line = value.slice(lineStart, pos);
            const indent = (line.match(/^\s*/) || [''])[0];
            const trimmed = line.trimEnd();
            const nextIndent = /[\{\[\(]$/.test(trimmed) ? `${indent}    ` : indent;
            textarea.setSelectionRange(pos, textarea.selectionEnd);
            replaceSelection(textarea, `\n${nextIndent}`, pos + 1 + nextIndent.length);
        }
    };
    const makeCodeField = (textarea) => {
        const field = document.createElement('div');
        field.className = 'inline-code-field';
        const hl = document.createElement('pre');
        hl.className = 'inline-text-editor-highlight';
        hl.setAttribute('aria-hidden', 'true');
        const sync = () => {
            const value = String(textarea.value || '');
            const hasTokens = /(<<[\s\S]*?>>|\[\[[\s\S]*?\]\]|%%[\s\S]*?%%|\$[A-Za-z_]\w*|(?:^|\n)\s*[^:\n<>[\]%]+::)/m.test(value);
            field.classList.toggle('has-tokens', hasTokens);
            highlightSugarcubeTokens.errorRanges = textarea.__lintErrorRanges || [];
            hl.innerHTML = hasTokens ? (highlightSugarcubeTokens(value) || '&#8203;') : '';
            hl.style.transform = 'none';
            hl.scrollTop = textarea.scrollTop;
            hl.scrollLeft = textarea.scrollLeft;
        };
        textarea.addEventListener('input', sync);
        textarea.addEventListener('scroll', sync);
        field.appendChild(hl);
        field.appendChild(textarea);
        sync();
        return { field, sync };
    };
    const taField = makeCodeField(ta);
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
        sceneTa.readOnly = false;
        const sceneField = makeCodeField(sceneTa);
        sceneTa.__codeField = sceneField;
        sceneField.field.style.display = 'none';
        if (hasChoicesTab) {
            choicesTa = document.createElement('textarea');
            choicesTa.className = 'inline-text-editor-input';
            choicesTa.value = choicesRaw;
            choicesTa.readOnly = false;
            const choicesField = makeCodeField(choicesTa);
            choicesTa.__codeField = choicesField;
            choicesField.field.style.display = 'none';
        }
        const switchTab = (tab) => {
            activeTab = tab;
            const textActive = tab === 'text';
            const sceneActive = tab === 'scene';
            const choicesActive = tab === 'choices';
            textTab.classList.toggle('active', textActive);
            sceneTab.classList.toggle('active', sceneActive);
            if (choicesTab) choicesTab.classList.toggle('active', choicesActive);
            taField.field.style.display = textActive ? 'block' : 'none';
            if (sceneTa?.__codeField) sceneTa.__codeField.field.style.display = sceneActive ? 'block' : 'none';
            if (choicesTa?.__codeField) choicesTa.__codeField.field.style.display = choicesActive ? 'block' : 'none';
            autoSize();
            if (textActive) ta.focus();
            if (sceneActive && sceneTa) sceneTa.focus();
            if (choicesActive && choicesTa) choicesTa.focus();
        };
        textTab.addEventListener('click', () => switchTab('text'));
        sceneTab.addEventListener('click', () => switchTab('scene'));
        if (choicesTab) choicesTab.addEventListener('click', () => switchTab('choices'));
    }
    wrapper.appendChild(taField.field);
    if (sceneTa?.__codeField) wrapper.appendChild(sceneTa.__codeField.field);
    if (choicesTa?.__codeField) wrapper.appendChild(choicesTa.__codeField.field);
    const diagnostics = document.createElement('div');
    diagnostics.className = 'inline-text-editor-diagnostics';
    wrapper.appendChild(diagnostics);
    const autoSize = () => {
        const active = activeTab === 'text' ? ta : (activeTab === 'scene' ? (sceneTa || ta) : (choicesTa || ta));
        active.style.height = 'auto';
        const desired = Math.max(48, active.scrollHeight);
        active.style.height = `${Math.min(desired, Math.floor(window.innerHeight * 0.55))}px`;
    };
    const updateDiagnostics = () => {
        const active = activeTab === 'text' ? ta : (activeTab === 'scene' ? (sceneTa || ta) : (choicesTa || ta));
        const value = String(active?.value || '');
        const hasTokens = /(<<[\s\S]*?>>|\[\[[\s\S]*?\]\]|%%[\s\S]*?%%|\$[A-Za-z_]\w*|(?:^|\n)\s*[^:\n<>[\]%]+::)/m.test(value);
        const lint = lintSugarcubeText(String(active?.value || ''));
        const issues = Array.isArray(lint?.issues) ? lint.issues : [];
        active.__lintErrorRanges = Array.isArray(lint?.errorRanges) ? lint.errorRanges : [];
        active.__codeField?.sync?.();
        const lc = getCursorLineCol(active);
        if (!hasTokens && !issues.length) {
            diagnostics.textContent = '';
            diagnostics.style.display = 'none';
            return;
        }
        const cursorInfo = `Line ${lc.line}, Col ${lc.col}`;
        if (!issues.length) {
            diagnostics.style.display = 'block';
            diagnostics.textContent = `${cursorInfo} • SugarCube tokens detected. No structural lint issues.`;
            return;
        }
        diagnostics.style.display = 'block';
        diagnostics.textContent = `${cursorInfo} • ${issues.join(' | ')}`;
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
    const getCompositeValue = () => {
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
        return val;
    };
    const cleanup = () => {
        wrapper.remove();
        backdrop.remove();
        hostEl.classList.remove('is-inline-editing');
        state.activeInlineEditor = null;
        if (state.panel?.three) {
            state.panel.three.setSpeakerAnimationPaused?.(false);
            state.panel.three.renderer?.setAnimationLoop?.(state.panel.three.animate);
        }
    };
    const commit = () => {
        const val = getCompositeValue();
        cleanup();
        onCommit(val);
        state.panel?.setTxt?.(draftNarrationHtmlForPanel());
        state.panel?.updateNarrationTarget?.();
        state.panel?.syncNarrationBackground?.();
        // Rebind handlers in case panel/bubbles were re-rendered by commit.
        wireInlineTextEditors();
        refreshSpeechBubbleDeleteButtons();
    };
    const cancel = () => {
        cleanup();
        if (typeof options.onCancel === 'function') options.onCancel();
        // Always restore inline bubble editing hooks after editor exit.
        wireInlineTextEditors();
        refreshSpeechBubbleDeleteButtons();
    };
    doneBtn.addEventListener('click', () => commit());
    cancelBtn.addEventListener('click', () => cancel());
    ta.addEventListener('input', autoSize);
    ta.addEventListener('input', applyLiveComposite);
    ta.addEventListener('input', updateDiagnostics);
    ta.addEventListener('click', updateDiagnostics);
    ta.addEventListener('keyup', updateDiagnostics);
    ta.addEventListener('keydown', (e) => handleCodeEditorKeydown(e, ta));
    if (sceneTa) sceneTa.addEventListener('input', () => {
        autoSize();
        applyLiveComposite();
        updateDiagnostics();
    });
    if (sceneTa) sceneTa.addEventListener('click', updateDiagnostics);
    if (sceneTa) sceneTa.addEventListener('keyup', updateDiagnostics);
    if (sceneTa) sceneTa.addEventListener('keydown', (e) => handleCodeEditorKeydown(e, sceneTa));
    if (choicesTa) choicesTa.addEventListener('input', () => {
        autoSize();
        applyLiveComposite();
        updateDiagnostics();
    });
    if (choicesTa) choicesTa.addEventListener('click', updateDiagnostics);
    if (choicesTa) choicesTa.addEventListener('keyup', updateDiagnostics);
    if (choicesTa) choicesTa.addEventListener('keydown', (e) => handleCodeEditorKeydown(e, choicesTa));
    ta.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            e.preventDefault();
            cancel();
        }
    });
    document.body.appendChild(wrapper);
    autoSize();
    updateDiagnostics();
    ta.focus();
    ta.select();
    const setSceneText = (nextScene, { applyLive = false } = {}) => {
        if (!sceneTa) return;
        const value = String(nextScene || '');
        if (sceneTa.value === value) return;
        sceneTa.value = value;
        autoSize();
        updateDiagnostics();
        if (applyLive) applyLiveComposite();
    };
    state.activeInlineEditor = {
        el: wrapper,
        commit,
        cancel,
        host: hostEl,
        setSceneText,
    };
    refreshSpeechBubbleDeleteButtons();
}

function openNarrationTabbedEditor(hostEl) {
    if (!hostEl || !el.previewPane) return;
    const p = state.passages[state.selected];
    if (!p) return;
    const raw = String(p.body || '');
    if (isStoryInitPassage(p)) {
        openInlineTextEditor(
            hostEl,
            () => raw,
            (val) => {
                const nextRaw = String(val || '');
                const prevRaw = String(p.body || '');
                if (nextRaw === prevRaw) return;
                p.body = nextRaw;
                if (el.passageBody) el.passageBody.value = nextRaw;
                state.storyInitBody = nextRaw;
                state.vars = parseStoryInitGlobals(state.storyInitBody);
                refreshDraftFromPassageBody();
                updatePanelFromTextDraft();
                setTextDirty(true);
                saveSceneTransformsToPassage();
            },
            {
                doneLabel: 'Save',
            }
        );
        return;
    }
    const initialRaw = raw;
    const textRaw = extractTextLines(raw);
    const sceneRaw = extractSceneLines(raw);
    const choicesRaw = extractChoiceLines(raw);
    openInlineTextEditor(
        hostEl,
        () => textRaw,
        (val) => {
            const nextRaw = normalizeChoiceDivider(String(val || ''));
            const validScene = validateDlMacroInPassage(nextRaw, state.vars);
            if (!validScene.ok) {
                p.body = initialRaw;
                if (el.passageBody) el.passageBody.value = initialRaw;
                refreshDraftFromPassageBody();
                updatePanelFromTextDraft();
                renderPreviewLinks(parseLinkLabels(initialRaw));
                setStatus(`Scene update canceled: ${validScene.error}`);
                return;
            }
            const prevRaw = String(p.body || '');
            const sceneChanged = extractSceneLines(nextRaw) !== extractSceneLines(prevRaw);
            const cameraChanged = didCameraSpecChange(prevRaw, nextRaw);
            if (nextRaw !== prevRaw) {
                logBodyDiff(prevRaw, nextRaw, `narration-tabs:${p.name || state.selected}`);
                p.body = nextRaw;
                if (el.passageBody) el.passageBody.value = nextRaw;
                refreshDraftFromPassageBody();
                updatePanelFromTextDraft();
                renderPreviewLinks(parseLinkLabels(p.body || ''));
                setTextDirty(true);
            }
            // Always apply live scene on commit (click-off) so scene tab edits
            // propagate even if the text body was already updated by live input.
            applySceneFromBodyLive(nextRaw, { ignoreCamera: !cameraChanged });
            refreshDraftFromPassageBody();
            updatePanelFromTextDraft();
            state.panel?.updateNarrationTarget?.();
            state.panel?.syncNarrationBackground?.();
            if (sceneChanged) {
                state.panel?.positionSpeechBubbles?.();
            }
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
                return normalizeChoiceDivider(nextRaw);
            },
            onSceneChange: (sceneVal, baseTextVal) => {
                const textRaw = String(baseTextVal || state.textDraft.narrationRaw || '');
                const sceneIdx = getSceneLineIndices(textRaw);
                return normalizeChoiceDivider(
                    mergeLinesAtIndices(textRaw, sceneIdx, String(sceneVal || ''), 'top')
                );
            },
            onChoicesChange: (choicesVal, baseTextVal) => {
                const textRaw = String(baseTextVal || state.textDraft.narrationRaw || '');
                const choiceIdx = getChoiceLineIndices(textRaw);
                return normalizeChoiceDivider(
                    mergeLinesAtIndices(textRaw, choiceIdx, String(choicesVal || ''), 'bottom')
                );
            },
            onCancel: () => {
                const currentRaw = String(p.body || '');
                if (currentRaw === initialRaw) return;
                const cameraChanged = didCameraSpecChange(currentRaw, initialRaw);
                p.body = initialRaw;
                if (el.passageBody) el.passageBody.value = initialRaw;
                refreshDraftFromPassageBody();
                updatePanelFromTextDraft();
                applySceneFromBodyLive(initialRaw, { ignoreCamera: !cameraChanged });
                renderPreviewLinks(parseLinkLabels(initialRaw));
            },
            // Commit-only update mode: apply to scene only when exiting editor.
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
        const bubbleIndex = i;
        bubble.dataset.inlineEditBound = '1';
        bubble.addEventListener('pointerdown', (event) => {
            event.stopPropagation();
            if (state.activeInlineEditor) return;
            state.selectedBubbleIndex = bubbleIndex;
            refreshSpeechBubbleDeleteButtons();
        });
        bubble.addEventListener('click', (event) => {
            event.stopPropagation();
            if (state.activeInlineEditor) return;
            state.selectedBubbleIndex = bubbleIndex;
            refreshSpeechBubbleDeleteButtons();
            if (event.detail < 2) return;
            state.selectedBubbleIndex = bubbleIndex;
            refreshSpeechBubbleDeleteButtons();
            const captured = state.textDraft.speakers?.[bubbleIndex] || null;
            const capturedSourceIndex = Number(captured?.sourceIndex);
            const findCurrentSpeaker = () => {
                if (Number.isFinite(capturedSourceIndex)) {
                    const bySource = (state.textDraft.speakers || []).find(
                        (s) => Number(s?.sourceIndex) === capturedSourceIndex
                    );
                    if (bySource) return bySource;
                }
                return state.textDraft.speakers?.[bubbleIndex] || null;
            };
            openInlineTextEditor(
                bubble,
                () => {
                    const current = findCurrentSpeaker();
                    return String(getSpeakerPayloadFromRaw(current?.raw || '', current?.speaker || ''));
                },
                (val) => {
                    let idx = bubbleIndex;
                    if (Number.isFinite(capturedSourceIndex)) {
                        const matchIdx = (state.textDraft.speakers || []).findIndex(
                            (s) => Number(s?.sourceIndex) === capturedSourceIndex
                        );
                        if (matchIdx >= 0) idx = matchIdx;
                    }
                    const speakerEntry = state.textDraft.speakers?.[idx];
                    if (!speakerEntry) return;
                    const oldRaw = String(speakerEntry.raw || '');
                    const raw = withSpeakerTag(String(val || ''), speakerEntry.speaker || '', oldRaw).trim();
                    if (raw === oldRaw.trim()) return;
                    let visible = String(state.textDraft.narrationRaw || '');
                    const byIndex = replaceSpeakerBlockAtSourceIndex(visible, speakerEntry.sourceIndex, raw);
                    if (byIndex != null) {
                        visible = byIndex;
                    } else if (!raw) {
                        const oldLine = oldRaw.split('\n').find((ln) => String(ln || '').trim()) || '';
                        visible = oldLine ? removeFirstLineMatch(visible, oldLine) : replaceFirstBlock(visible, oldRaw, '');
                    } else if (oldRaw && visible.includes(oldRaw)) {
                        visible = replaceFirstBlock(visible, oldRaw, raw);
                    } else if (!oldRaw) {
                        visible = insertSpeechLineInDraft(raw);
                    }
                    state.textDraft.narrationRaw = visible;
                    syncDraftIntoPassageBody();
                    refreshDraftFromPassageBody();
                    updatePanelFromTextDraft();
                    setTextDirty(true);
                    markSceneDirtyFrom3d();
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
    let visible = String(state.textDraft.narrationRaw || '');
    const byIndex = replaceSpeakerBlockAtSourceIndex(visible, state.textDraft.speakers[i].sourceIndex, '');
    if (byIndex != null) {
        visible = byIndex;
    } else {
        const oldLine = oldRaw.split('\n').find((ln) => String(ln || '').trim()) || '';
        visible = oldLine ? removeFirstLineMatch(visible, oldLine) : replaceFirstBlock(visible, oldRaw, '');
    }
    state.textDraft.narrationRaw = visible;
    state.selectedBubbleIndex = null;
    syncDraftIntoPassageBody();
    refreshDraftFromPassageBody();
    updatePanelFromTextDraft();
    setTextDirty(true);
    markSceneDirtyFrom3d();
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

function parseSpeakerBlocks(text, sceneObjects, format, options = {}) {
    const requireKnownSpeaker = Boolean(options?.requireKnownSpeaker);
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
        const speakerNorm = speaker.toLowerCase();
        if (!speaker) {
            narrationParas.push(originalParas[i] || '');
            continue;
        }
        if (requireKnownSpeaker && (!sceneObjects || (!sceneObjects[speaker] && !sceneObjects[speakerNorm]))) {
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
        speakers.push({ speaker: speakerNorm, html: updatedPara.trim(), raw: originalPara, sourceIndex: i });
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
    let backgroundName = typeof bg === 'string'
        ? bg
        : String(bg?.name || bg?.model || '');
    if (backgroundName.toLowerCase() === 'none') backgroundName = '';
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

    const bg = (scene.background && typeof scene.background === 'object')
        ? { ...scene.background }
        : {};
    const normalizedBackground = nextBackground && nextBackground.toLowerCase() !== 'none'
        ? nextBackground
        : 'none';
    scene.background = { ...bg, name: normalizedBackground };
    scene.skyColor = nextSkyColor;
    const nextBody = writeDlExprToPassage(p.body, toPrettyDlExpression(scene));
    p.body = nextBody;
    el.passageBody.value = nextBody;
    persistVisualEditorState();
    markSceneDirtyFrom3d();
    state.selectedModelKey = BACKGROUND_KEY;
    state.pendingSelectionKey = BACKGROUND_KEY;
    applySceneFromBodyLive(nextBody, { ignoreCamera: true });
    renderPreviewLinks(parseLinkLabels(nextBody));
    refreshSelectedModelBadge();
    refreshFloatingDeleteButton();
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

function stageEditedHtmlForPlayer() {
    if (state.format !== 'html' || !state.passages.length) return false;
    saveCurrentPassageBody();
    const html = serializeHtml();
    const nameBase = state.filename.replace(/\.[^.]+$/, '') || 'story';
    localStorage.setItem(PLAYER_IMPORTED_STORY_KEY, JSON.stringify({
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
            startPassageName: state.startPassageName,
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
        state.startPassageName = String(parsed.startPassageName || '');
        state.passages = parsed.passages
            .map((p) => ({
                name: String(p?.name || ''),
                tags: Array.isArray(p?.tags) ? p.tags.map((t) => String(t)) : [],
                body: String(p?.body || ''),
            }))
            .filter((p) => p.name && !IGNORED_PASSAGES.has(p.name));
        state.selected = Number.isFinite(Number(parsed.selected)) ? Number(parsed.selected) : 0;
        if (!state.passages.length) return false;
        initializeStableBodySnapshots();
        state.storyInitBody = state.passages.find((p) => p.name === 'StoryInit')?.body || '';
        state.vars = parseStoryInitGlobals(state.storyInitBody);
        state.openedHtmlBaseline = state.format === 'html' ? serializeHtml() : '';
        renderPassageList();
        setStatus(`Restored Visual Editor state: ${state.filename}`);
        return true;
    } catch (err) {
        console.warn('[visual-editor] Failed to restore state', err);
        return false;
    }
}

function restoreBootStoryFromPlayer() {
    try {
        const raw = localStorage.getItem(PLAYER_EDITOR_BOOT_STORY_KEY);
        if (!raw) return false;
        localStorage.removeItem(PLAYER_EDITOR_BOOT_STORY_KEY);
        const parsed = JSON.parse(raw);
        const html = String(parsed?.html || '');
        if (!html.trim()) return false;
        const story = parseHtmlStory(html);
        state.format = 'html';
        state.filename = String(parsed?.name || 'Player Story.html');
        state.sourceHtmlTemplate = story.template;
        state.startPassageName = String(story.startPassageName || '');
        state.passages = story.passages.filter((p) => !IGNORED_PASSAGES.has(p.name));
        if (!state.passages.length) return false;
        const requestedPassage = String(parsed?.currentPassage || '').trim();
        const requestedIdx = requestedPassage
            ? state.passages.findIndex((p) => String(p?.name || '').trim() === requestedPassage)
            : -1;
        state.selected = requestedIdx >= 0 ? requestedIdx : 0;
        state.storyInitBody = state.passages.find((p) => p.name === 'StoryInit')?.body || '';
        state.vars = parseStoryInitGlobals(state.storyInitBody);
        state.openedHtmlBaseline = html;
        initializeStableBodySnapshots();
        setTextDirty(false);
        setSceneDirty(false);
        updatePreviewStoryButton();
        renderPassageList();
        persistVisualEditorState();
        setStatus(`Loaded from player: ${state.filename}`);
        return true;
    } catch (err) {
        console.warn('[visual-editor] Failed to restore player boot story', err);
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

function getDlMacroMatches(sourceText) {
    const source = String(sourceText || '');
    const re = /<<set\s+\$DL\s*=\s*([\s\S]*?)>>/gi;
    const matches = [];
    let m;
    while ((m = re.exec(source)) !== null) {
        matches.push({
            index: m.index,
            length: String(m[0] || '').length,
            full: String(m[0] || ''),
            expr: String(m[1] || ''),
        });
    }
    return matches;
}

function extractDlExpr(passageBody) {
    const matches = getDlMacroMatches(passageBody);
    if (!matches.length) return null;
    return matches[matches.length - 1].expr;
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

function validateDlMacroInPassage(passageBody, vars) {
    const expr = extractDlExpr(passageBody);
    if (!expr) return { ok: true, error: '' };
    try {
        const dl = evalWithVars(expr, vars);
        if (!dl || typeof dl !== 'object') {
            return { ok: false, error: '$DL must evaluate to an object.' };
        }
        return { ok: true, error: '' };
    } catch (err) {
        return { ok: false, error: err?.message || String(err) };
    }
}

function didCameraSpecChange(prevRaw, nextRaw) {
    const prevScene = buildSceneFromPassage(prevRaw, state.vars) || {};
    const nextScene = buildSceneFromPassage(nextRaw, state.vars) || {};
    const prevCam = (prevScene.camera && typeof prevScene.camera === 'object') ? prevScene.camera : null;
    const nextCam = (nextScene.camera && typeof nextScene.camera === 'object') ? nextScene.camera : null;
    if (!prevCam && !nextCam) return false;
    if (!prevCam || !nextCam) return true;
    return !cameraSpecsEqual(prevCam, nextCam);
}

function toPrettyDlExpression(dl) {
    return JSON.stringify(dl, null, 2);
}

function writeDlExprToPassage(body, dlExpr) {
    const src = String(body || '');
    const macro = `<<set $DL = ${dlExpr}>>`;
    let visibleOut;
    const matches = getDlMacroMatches(src);
    if (matches.length) {
        const insertAt = matches[0].index;
        const withoutAllDl = src.replace(/<<set\s+\$DL\s*=\s*[\s\S]*?>>/gi, '');
        visibleOut = `${withoutAllDl.slice(0, insertAt)}${macro}${withoutAllDl.slice(insertAt)}`;
    } else {
        visibleOut = `${macro}\n${src}`.trimStart();
    }
    return visibleOut;
}

function destroyPanel() {
    if (state.sceneSyncTimer) {
        clearTimeout(state.sceneSyncTimer);
        state.sceneSyncTimer = 0;
    }
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
        if (state.selectedModelKey !== BACKGROUND_KEY) {
            state.selectedModelKey = null;
        }
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
    state.panel.three.setMouseTiltEnabled?.(false);
    // Enable editor-specific speech bubble behavior (live model-following anchors,
    // deterministic editor stacking, debug target visibility).
    state.panel.editorEnabled = true;
    state.panel.three.enableEditorTools?.({
        onChange: () => {
            const changed = syncSceneToBodyNow();
            if (changed) setSceneDirty(true);
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

/**
 * Compose updated passage body using current panel snapshot while preserving authored
 * variable references for global-driven scenes.
 */
function composeBodyWithCurrentSceneSnapshot(baseBody) {
    let nextBody = String(baseBody || '');
    const snapshot = getSceneSnapshotForSave();
    if (!snapshot) return nextBody;
    const sceneText = extractSceneLines(nextBody);
    const hasVariableRefs = /(?:\bobjects\b[\s\S]*?\$[A-Za-z_]\w*)|(?:\bbackground\b\s*:\s*\$[A-Za-z_]\w*)/i.test(sceneText);
    if (hasVariableRefs) {
        // Keep authored variable references intact; avoid rewriting $DL to concrete JSON.
        // Locked/global-driven models are preview-only in this mode.
        return nextBody;
    }
    const scene = buildSceneFromPassage(nextBody, state.vars) || {};
    const selectedBackgroundName = String(el.selectedBackgroundSelect?.value || '').trim();
    const selectedSkyColor = String(el.selectedSkyColorInput?.value || '').trim();
    scene.objects = snapshot.objects || [];
    if (/^#[0-9a-f]{6}$/i.test(selectedSkyColor)) {
        scene.skyColor = selectedSkyColor;
    }
    const bgPrev = (scene.background && typeof scene.background === 'object')
        ? { ...scene.background }
        : {};
    const selectedName = selectedBackgroundName && selectedBackgroundName.toLowerCase() !== 'none'
        ? selectedBackgroundName
        : '';
    if (snapshot.background && typeof snapshot.background === 'object') {
        scene.background = {
            ...bgPrev,
            ...snapshot.background,
            name: selectedName || snapshot.background.name || snapshot.background.model || bgPrev.name || 'none',
        };
    } else {
        scene.background = {
            ...bgPrev,
            name: selectedName || bgPrev.name || 'none',
        };
    }
    nextBody = writeDlExprToPassage(nextBody, toPrettyDlExpression(scene));
    const passageKey = getCurrentPassageKey();
    const aspectDirty = Boolean(passageKey && state.aspectDirtyByPassage[passageKey]);
    if (aspectDirty && Number.isFinite(state.panelAspectOverride) && state.panelAspectOverride > 0) {
        nextBody = upsertPanelAspectCommand(nextBody, state.panelAspectOverride);
    }
    return nextBody;
}

/**
 * Sync current 3D snapshot into the selected passage body even if dirty flags
 * are stale. Used by preview/export flows so player gets the exact current scene.
 */
function syncCurrentSceneSnapshotToPassageBody() {
    const p = state.passages[state.selected];
    if (!p) return false;
    if (!state.panel?.three) return false;
    const prevBody = String(p.body || '');
    const nextBody = composeBodyWithCurrentSceneSnapshot(prevBody);
    if (nextBody === prevBody) return false;
    p.body = nextBody;
    if (el.passageBody) el.passageBody.value = nextBody;
    if (state.activeInlineEditor?.setSceneText) {
        state.activeInlineEditor.setSceneText(extractSceneLines(nextBody), { applyLive: false });
    }
    refreshDraftFromPassageBody();
    renderPreviewLinks(parseLinkLabels(nextBody));
    persistVisualEditorState();
    return true;
}

/**
 * Persist current text + scene edits back to the selected passage body.
 */
function saveSceneTransformsToPassage() {
    const p = state.passages[state.selected];
    if (!p || !state.panel?.three) return;
    const passageKey = getCurrentPassageKey();
    ensureStableBodySnapshot(state.selected);
    const prevBody = String(p.body || '');
    let nextBody = prevBody;
    if (state.hasTextEdits) {
        syncDraftIntoPassageBody();
        nextBody = String(p.body || '');
    }

    let savedSceneCount = null;
    if (state.hasSceneEdits) {
        if (!getSceneSnapshotForSave()) {
            setStatus('No editable scene to save.');
            return;
        }
        const snapshot = getSceneSnapshotForSave();
        nextBody = composeBodyWithCurrentSceneSnapshot(nextBody);
        savedSceneCount = snapshot?.objects?.length || 0;
    }

    if (nextBody !== prevBody) {
        p.body = nextBody;
        el.passageBody.value = nextBody;
        if (passageKey) state.stableBodyByPassage[passageKey] = nextBody;
        if (passageKey) state.aspectDirtyByPassage[passageKey] = false;
        persistVisualEditorState();
        if (savedSceneCount == null) {
            setStatus(`Saved text updates in "${p.name}".`);
        } else {
            setStatus(`Saved ${savedSceneCount} model transforms + environment to "$DL" in "${p.name}".`);
        }
    } else {
        if (passageKey) state.stableBodyByPassage[passageKey] = nextBody;
        if (passageKey) state.aspectDirtyByPassage[passageKey] = false;
        setStatus('No changes to save.');
    }
    setTextDirty(false);
    setSceneDirty(false);
    refreshRevertSceneButton();
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
    if (isStoryInitPassage()) {
        el.panelAspectHandle.style.display = 'none';
        return;
    }
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
    ensureStableBodySnapshot(state.selected);
    const scene = buildSceneFromPassage(p.body, state.vars);
    const sceneForPanel = cloneSceneSpec(scene || {}) || {};
    const locks = applyVariableDrivenSceneBindings(p.body || '', sceneForPanel);
    const storyInit = isStoryInitPassage(p);
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
    const cleanedText = storyInit
        ? String(p.body || '')
        : stripDialomicCommands(String(p.body || ''))
            .replace(/<<[\s\S]*?>>/g, '')
            .replace(/\[\[[\s\S]*?\]\]/g, '');
    const parsed = parseSpeakerBlocks(cleanedText, sceneObjects, state.format);
    state.textDraft.hiddenTail = '';
    refreshDraftFromPassageBody();
    refreshEnvironmentControlsFromPassage();
    const links = storyInit ? [] : parseLinkLabels(p.body);
    renderPreviewLinks(links);
    destroyPanel();
    const narrationForPanel = storyInit
        ? ((String(p.body || '').trim().length ? plainTextToHtml(String(p.body || '')) : '&#8203;'))
        : ((state.textDraft.narrationRaw || '').trim().length
            ? plainTextToHtml(state.textDraft.narrationRaw || '')
            : '&#8203;');
    state.panel = new Panel(curr, target, `visual_${Date.now()}`, narrationForPanel, -1, sceneForPanel, 'narration', topInset);
    state.panel?.three?.setMouseTiltEnabled?.(false);
    if (state.panel?.three?.scene) {
        state.panel.three.scene.background = new THREE.Color(env.skyColor);
    }
    const passageKey = getCurrentPassageKey();
    if (passageKey && !state.savedCameraByPassage[passageKey] && scene?.camera && typeof scene.camera === 'object') {
        state.savedCameraByPassage[passageKey] = cloneSceneSpec(scene.camera);
    }
    maybeCaptureImplicitCamera();
    state.panel.setSpeakers?.(storyInit ? [] : draftToPanelSpeakers());
    state.lockedModelKeys = locks.lockedModelKeys;
    state.backgroundLocked = locks.backgroundLocked;
    state.panel?.three?.setEditorLockConfig?.({
        modelKeys: Array.from(state.lockedModelKeys),
        backgroundLocked: state.backgroundLocked,
    });
    if (storyInit) {
        state.panel?.setStoryInitPreviewMode?.(true);
        state.panel?.setTxt?.(narrationForPanel);
        if (state.panel?.canvas) state.panel.canvas.style.display = 'none';
        if (state.panel?.narrationBgEl) {
            state.panel.narrationBgEl.style.top = '0px';
            state.panel.narrationBgEl.style.height = `${curr.height}px`;
        }
        if (state.panel?.narrationEl) {
            state.panel.narrationEl.style.top = '0px';
            state.panel.narrationEl.style.height = `${curr.height}px`;
        }
    } else {
        state.panel?.setStoryInitPreviewMode?.(false);
    }
    suppressPreviewSpeakerAnimation();
    // Match player behavior: apply panel aspect mode and settle panel/canvas sizing
    // immediately so model slotting uses the same effective viewport.
    state.panel.setAspectMode?.(aspectMode);
    state.panel.setCurr?.(curr, false);
    try {
        if (!storyInit) {
            setupSceneEditor();
            if (state.pendingSelectionKey && state.panel?.three) {
                const picked = state.panel.three.setSelectedEditableModel?.(state.pendingSelectionKey);
                if (picked) {
                    state.pendingSelectionKey = null;
                }
            }
        }
    } catch (err) {
        console.error('[visual-editor] editor tools setup failed', err);
        setStatus(`Previewing "${p.name}" (editor tools unavailable)`);
    }
    applyStoryInitPreviewMode(storyInit);
    startPreviewLoop();
    refreshPanelAspectHandle();
    refreshFloatingDeleteButton();
    refreshCameraButtons();
    refreshRevertSceneButton();
    wireInlineTextEditors();
    refreshSpeechBubbleDeleteButtons();
    if (!String(el.status?.textContent || '').includes('editor tools unavailable')) {
        setStatus(`Previewing "${p.name}"`);
    }
}

function renderPassageList() {
    el.passageSelect.innerHTML = '';
    let displayNum = 1;
    const indices = state.passages.map((_, i) => i);
    const storyInitIdx = indices.find((i) => String(state.passages[i]?.name || '').trim().toLowerCase() === 'storyinit');
    const ordered = storyInitIdx == null || storyInitIdx < 0
        ? indices
        : [storyInitIdx, ...indices.filter((i) => i !== storyInitIdx)];
    for (const i of ordered) {
        const p = state.passages[i];
        const opt = document.createElement('option');
        opt.value = String(i);
        if (String(p?.name || '').trim().toLowerCase() === 'storyinit') {
            opt.textContent = p.name;
        } else {
            opt.textContent = `${displayNum}. ${p.name}`;
            displayNum += 1;
        }
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
    refreshPassageActionButtons();
    persistVisualEditorState();
    updatePreviewStoryButton();
    renderPreview();
}

function isProtectedPassageName(name) {
    const n = String(name || '').trim().toLowerCase();
    if (!n) return false;
    if (n === 'storyinit') return true;
    return n === String(state.startPassageName || '').trim().toLowerCase();
}

function refreshPassageActionButtons() {
    const p = state.passages[state.selected];
    const canDelete = Boolean(p) && !isProtectedPassageName(p.name);
    if (el.deletePassageBtn) el.deletePassageBtn.disabled = !canDelete;
}

function getNextDefaultPassageName() {
    const used = new Set((state.passages || []).map((p) => String(p?.name || '').trim().toLowerCase()));
    let n = 2;
    while (used.has(`passage ${n}`)) n += 1;
    return `passage ${n}`;
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
        state.startPassageName = String(parsed.startPassageName || '');
        state.openedHtmlBaseline = text;
    } else {
        state.format = 'twee';
        state.passages = parseTwee(text).filter((p) => !IGNORED_PASSAGES.has(p.name));
        state.sourceHtmlTemplate = '';
        state.startPassageName = '';
        state.openedHtmlBaseline = '';
    }
    state.storyInitBody = state.passages.find((p) => p.name === 'StoryInit')?.body || '';
    state.vars = parseStoryInitGlobals(state.storyInitBody);
    initializeStableBodySnapshots();
    state.selected = 0;
    setTextDirty(false);
    setSceneDirty(false);
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
    applyStoryInitPreviewMode(isStoryInitPassage(p));
    if (p) renderPreviewLinks(isStoryInitPassage(p) ? [] : parseLinkLabels(p.body));
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
    refreshPassageActionButtons();
});

function setPassageDialogOpen(open) {
    if (!el.passageDialog) return;
    el.passageDialog.hidden = !open;
    // Keep add-passage popup inline without page overlay.
    if (el.passageDialogBackdrop) el.passageDialogBackdrop.hidden = true;
    if (open && el.newPassageName) {
        const btnRect = el.addPassageBtn?.getBoundingClientRect();
        if (btnRect) {
            el.passageDialog.style.top = `${Math.round(btnRect.bottom + 8)}px`;
            el.passageDialog.style.left = `${Math.round(btnRect.left)}px`;
            el.passageDialog.style.right = 'auto';
        }
        el.newPassageName.value = getNextDefaultPassageName();
        el.newPassageName.focus();
        el.newPassageName.select();
    }
}

el.addPassageBtn?.addEventListener('click', () => {
    setPassageDialogOpen(true);
});

el.newPassageCancelBtn?.addEventListener('click', () => {
    setPassageDialogOpen(false);
});
el.passageDialogBackdrop?.addEventListener('click', () => {
    setPassageDialogOpen(false);
});

el.newPassageCreateBtn?.addEventListener('click', () => {
    const raw = String(el.newPassageName?.value || '').trim() || getNextDefaultPassageName();
    if (!raw) return;
    const existing = new Set((state.passages || []).map((p) => String(p?.name || '').trim().toLowerCase()));
    let name = raw;
    let i = 2;
    while (existing.has(name.toLowerCase())) {
        name = `${raw} ${i}`;
        i += 1;
    }
    state.passages.push({ name, tags: [], body: '' });
    state.selected = state.passages.length - 1;
    setPassageDialogOpen(false);
    setTextDirty(true);
    persistVisualEditorState();
    renderPassageList();
});

el.deletePassageBtn?.addEventListener('click', () => {
    const p = state.passages[state.selected];
    if (!p || isProtectedPassageName(p.name)) return;
    showConfirmDialog(`Delete passage "${p.name}"?`, 'Delete Passage').then((ok) => {
        if (!ok) return;
        state.passages.splice(state.selected, 1);
        state.selected = Math.max(0, Math.min(state.selected, state.passages.length - 1));
        setTextDirty(true);
        persistVisualEditorState();
        renderPassageList();
    });
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
    if (!el.passageDialog?.hidden) {
        const t = event.target;
        if (t instanceof Element && !t.closest('#passageDialog') && !t.closest('#addPassageBtn')) {
            setPassageDialogOpen(false);
        }
    }
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
    const p = state.passages[state.selected];
    if (p) {
        const prevBody = String(p.body || '');
        const nextBody = upsertSceneCameraSpec(prevBody, spec);
        if (nextBody !== prevBody) {
            p.body = nextBody;
            if (el.passageBody) el.passageBody.value = nextBody;
            if (state.activeInlineEditor?.setSceneText) {
                state.activeInlineEditor.setSceneText(extractSceneLines(nextBody), { applyLive: false });
            }
            refreshDraftFromPassageBody();
            updatePanelFromTextDraft();
            renderPreviewLinks(parseLinkLabels(nextBody));
            persistVisualEditorState();
        }
    }
    setStatus('Set camera for this passage.');
    refreshCameraButtons();
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
    setStatus('Reverted camera.');
    refreshCameraButtons();
});

el.focusModelBtn?.addEventListener('click', () => {
    const three = state.panel?.three;
    const key = String(state.selectedModelKey || '').trim();
    if (!three || !key) return;
    const focused = three.focusEditableModelByKey?.(key);
    if (!focused) return;
    setStatus(`Focused view on "${key}".`);
    refreshCameraButtons();
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
    state.panel.three.addModel(`${key}=${asset}`);
    markSceneDirtyFrom3d();
});

el.floatingAddSpeechBtn?.addEventListener('click', () => {
    const speaker = String(state.selectedModelKey || '').trim();
    if (!speaker || speaker === BACKGROUND_KEY) return;
    const rawLine = `${speaker}:: `;
    const beforeAddRaw = String(state.textDraft.narrationRaw || '');
    const textDirtyBeforeAdd = Boolean(state.hasTextEdits);
    state.textDraft.narrationRaw = insertSpeechLineInDraft(rawLine);
    syncDraftIntoPassageBody();
    // Keep scene/body aligned immediately so player parsing can resolve the
    // newly referenced speaker model without requiring re-entering the passage.
    syncCurrentSceneSnapshotToPassageBody();
    refreshDraftFromPassageBody();
    updatePanelFromTextDraft();
    setTextDirty(true);
    wireInlineTextEditors();
    const idx = getLastSpeechDraftIndex();
    if (idx < 0) return;
    const draftSpeaker = state.textDraft.speakers?.[idx];
    if (!draftSpeaker) return;
    const draftSourceIndex = Number.isFinite(Number(draftSpeaker.sourceIndex)) ? Number(draftSpeaker.sourceIndex) : null;
    const bubble = idx >= 0 ? state.panel?.speechEls?.[idx] : null;
    if (bubble) {
        openInlineTextEditor(
            bubble,
            () => String(getSpeakerPayloadFromRaw(draftSpeaker.raw || '', draftSpeaker.speaker || speaker)),
            (val) => {
                const i = idx;
                if (i < 0) return;
                const sp = state.textDraft.speakers?.[i];
                if (!sp) return;
                const oldRaw = String(sp.raw || '');
                const raw = withSpeakerTag(String(val || ''), sp.speaker || speaker, oldRaw).trim();
                if (raw === oldRaw.trim()) return;
                let visible = String(state.textDraft.narrationRaw || '');
                const byIndex = replaceSpeakerBlockAtSourceIndex(visible, sp.sourceIndex, raw);
                if (byIndex != null) {
                    visible = byIndex;
                } else if (!raw) {
                    const oldLine = oldRaw.split('\n').find((ln) => String(ln || '').trim()) || '';
                    visible = oldLine ? removeFirstLineMatch(visible, oldLine) : replaceFirstBlock(visible, oldRaw, '');
                } else if (oldRaw && visible.includes(oldRaw)) {
                    visible = replaceFirstBlock(visible, oldRaw, raw);
                } else if (!oldRaw) {
                    visible = insertSpeechLineInDraft(raw);
                }
                state.textDraft.narrationRaw = visible;
                syncDraftIntoPassageBody();
                refreshDraftFromPassageBody();
                updatePanelFromTextDraft();
                setTextDirty(true);
                markSceneDirtyFrom3d();
            },
            {
                onCancel: () => {
                    // Cancel should not mutate passage/editor text.
                    // Revert to the exact pre-add visible body snapshot.
                    state.textDraft.narrationRaw = beforeAddRaw;
                    syncDraftIntoPassageBody();
                    refreshDraftFromPassageBody();
                    updatePanelFromTextDraft();
                    setTextDirty(textDirtyBeforeAdd);
                },
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
    if (state.panel?.three?.isEditorBackgroundLocked?.()) return;
    undoEnvironmentChanges();
});

el.floatingDeleteModelBtn?.addEventListener('click', () => {
    if (!state.panel?.three || !state.selectedModelKey) return;
    const selectedKey = String(state.selectedModelKey || '').trim().toLowerCase();
    const isLockedGlobal = Boolean(
        selectedKey &&
        selectedKey !== BACKGROUND_KEY &&
        state.panel.three.isEditorModelLocked?.(selectedKey)
    );
    if (isLockedGlobal) {
        removeLockedGlobalFromCurrentPassage(selectedKey);
        return;
    }
    if (state.selectedModelKey === BACKGROUND_KEY) {
        if (undoEnvironmentChanges()) {
            markSceneDirtyFrom3d();
            refreshFloatingDeleteButton();
            refreshSelectedModelBadge();
        }
        return;
    }
    const reverted = state.panel.three.revertEditableModelTransformByKey?.(state.selectedModelKey);
    if (reverted) {
        markSceneDirtyFrom3d();
        refreshModelSelect();
        refreshFloatingDeleteButton();
    }
});

el.selectedDeleteModelBtn?.addEventListener('click', () => {
    tryDeleteSelectedModel();
});

el.clearSceneBtn?.addEventListener('click', () => {
    if (!state.panel?.three) return;
    const keys = state.panel.three.getEditableModelKeys?.() || [];
    const hadModels = keys.length > 0;
    const hadBackground = Boolean(state.panel.three.getModelByKey?.(BACKGROUND_KEY));
    if (!hadModels && !hadBackground) {
        // Still force environment selection mode in an already-cleared scene.
        state.selectedModelKey = BACKGROUND_KEY;
        refreshSelectedModelBadge();
        refreshFloatingDeleteButton();
        return;
    }
    showConfirmDialog(`Clear ${keys.length} model${keys.length === 1 ? '' : 's'} from this scene?`, 'Clear Scene').then((ok) => {
        if (!ok) return;
        for (const key of keys) {
            state.panel.three.removeEditableModelByKey?.(key);
        }
    if (keys.length) {
        let visible = String(state.textDraft.narrationRaw || '');
        for (const key of keys) {
            const next = removeSpeakerParagraphsForModel(visible, state.format, key);
            visible = next.body;
        }
        if (visible !== String(state.textDraft.narrationRaw || '')) {
            state.textDraft.narrationRaw = visible;
            syncDraftIntoPassageBody();
            refreshDraftFromPassageBody();
            updatePanelFromTextDraft();
            setTextDirty(true);
        }
    }
    updateCurrentPassageEnvironment({ backgroundName: 'none' });
    state.selectedModelKey = BACKGROUND_KEY;
    markSceneDirtyFrom3d();
    refreshModelSelect();
    refreshSelectedModelBadge();
    refreshFloatingDeleteButton();
    refreshCurrentPanelTextAndBubbles();
    });
});

el.saveSceneBtn?.addEventListener('click', () => {
    saveCurrentPassageBody();
    saveSceneTransformsToPassage();
});

el.revertSceneBtn?.addEventListener('click', () => {
    const p = state.passages[state.selected];
    if (!p) return;
    const key = getCurrentPassageKey();
    const stable = key ? state.stableBodyByPassage[key] : null;
    if (typeof stable !== 'string') return;
    if (stable === String(p.body || '')) {
        refreshRevertSceneButton();
        return;
    }
    p.body = stable;
    if (el.passageBody) el.passageBody.value = stable;
    refreshDraftFromPassageBody();
    updatePanelFromTextDraft();
    applySceneFromBodyLive(stable, { ignoreCamera: true });
    renderPreviewLinks(parseLinkLabels(stable));
    setTextDirty(false);
    setSceneDirty(false);
    persistVisualEditorState();
    setStatus(`Reverted "${p.name}" to last saved scene.`);
    refreshRevertSceneButton();
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
    const key = getCurrentPassageKey();
    if (key) state.aspectDirtyByPassage[key] = true;
    refreshPanelAspectHandle();
    markSceneDirtyFrom3d();
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
    let discardedUnsaved = false;
    await runWithUnsavedGuard(() => {
        if (discardedUnsaved && state.openedHtmlBaseline) {
            const nameBase = state.filename.replace(/\.[^.]+$/, '') || 'story';
            localStorage.setItem(PLAYER_IMPORTED_STORY_KEY, JSON.stringify({
                html: state.openedHtmlBaseline,
                name: `${nameBase}.html`,
            }));
        } else {
            saveCurrentPassageBody();
            // Force one final live scene->body sync before staging for player.
            syncCurrentSceneSnapshotToPassageBody();
            stageEditedHtmlForPlayer();
        }
        window.location.href = './player.html';
    }, {
        onSave: () => saveSceneTransformsToPassage(),
        onDiscard: () => {
            discardedUnsaved = true;
        },
    });
});

el.editorHomeLink?.addEventListener('click', async (event) => {
    event.preventDefault();
    await runWithUnsavedGuard(() => {
        window.location.href = './index.html';
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

if (!restoreBootStoryFromPlayer() && !restoreVisualEditorState()) {
    setStatus('Load a file to start visual passage preview.');
}
