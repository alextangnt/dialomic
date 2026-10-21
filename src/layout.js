import { Panel, PANEL_ENTER_DURATION_MS, PANEL_EXIT_DURATION_MS } from './panel.js';
import { PlayerPerformanceHud } from './playerPerformance.js';
import { stripHtml, splitHtmlParagraphs, buildSceneObjectMap } from './passageText.js';

/*
 * Player runtime orchestrator:
 * - receives passage payloads from the story iframe
 * - computes panel/bubble/narration layout
 * - sends user interactions back to the iframe
 */
let loaded = false;
let started = false;
let iframe;
let vars = {};
let layout;
let activeSessionId = null;
const EDITED_STORY_STORAGE_KEY = 'DL_IMPORTED_STORY_HTML';
const EDITOR_BOOT_STORY_KEY = 'DL_VISUAL_EDITOR_BOOT_STORY';
const PLAYER_START_SELECTION_KEY = 'DL_PLAYER_START_SELECTION';
const USER_STORIES_STORAGE_KEY = 'DL_USER_STORIES';

/**
 * Read live SugarCube variable state from the story iframe safely.
 */
function getSugarCubeVars() {
    try {
        return iframe?.contentWindow?.SugarCube?.State?.variables || null;
    } catch {
        return null;
    }
}

function isStoryInitPayload(info) {
    return String(info?.psgName || '').trim().toLowerCase() === 'storyinit';
}

function getIframeTargetOrigin() {
    return iframe?.getAttribute('srcdoc') ? '*' : window.location.origin;
}


window.onload = () =>{
    iframe = document.getElementById("logicEngine");
    const fileInput = document.getElementById("storyFile");
    const statusEl = document.getElementById("fileStatus");
    const storyStatusEl = document.getElementById("storyStatus");
    const defaultStorySelect = document.getElementById("defaultStorySelect");
    const editorLink = document.getElementById("editorLink");
    const newCustomStoryDialog = document.getElementById('newCustomStoryDialog');
    const newCustomStoryName = document.getElementById('newCustomStoryName');
    const newCustomStoryCancelBtn = document.getElementById('newCustomStoryCancelBtn');
    const newCustomStoryCreateBtn = document.getElementById('newCustomStoryCreateBtn');
    const IMPORTED_STORY_SELECT_VALUE = '__imported_story__';
    const USER_STORY_SELECT_PREFIX = '__user_story__:';
    const FALLBACK_DEFAULT_STORIES = [
        { label: 'Template', url: 'defaultstories/template.html' },
        { label: 'GuessingGame', url: 'defaultstories/GuessingGame.html' },
    ];
    let defaultStories = [...FALLBACK_DEFAULT_STORIES];
    let templateStoryUrl = defaultStories[0]?.url || '';
    const defaultStoryHtmlCache = new Map();
    const fetchDefaultStoryHtml = async (url) => {
        const key = String(url || '');
        if (!key) return null;
        if (defaultStoryHtmlCache.has(key)) return defaultStoryHtmlCache.get(key);
        const p = fetch(key)
            .then(async (resp) => {
                if (resp.ok) return resp.text();
                // Backward compatibility before defaultstories migration.
                const fallback = key.split('/').pop();
                if (fallback && fallback !== key) {
                    const alt = await fetch(fallback);
                    if (alt.ok) return alt.text();
                }
                return null;
            })
            .catch(() => null);
        defaultStoryHtmlCache.set(key, p);
        return p;
    };
    let defaultStoryHtmlPromise = Promise.resolve(null);
    const refreshResets = true;
    let importedHtml = null;
    let importedName = null;
    let userStories = [];
    let currentMode = 'default';
    let currentUserStoryId = '';
    let currentDefaultStoryUrl = defaultStories[1]?.url || defaultStories[0]?.url;
    let currentDefaultStoryHtml = '';
    let pendingStart = false;
    let refreshRestarted = false;
    let awaitingRefreshInit = false;
    const applyPassageInfoWithRetry = (info, attempt = 0) => {
        const sugarVars = getSugarCubeVars();
        if (!sugarVars && attempt < 12) {
            setTimeout(() => applyPassageInfoWithRetry(info, attempt + 1), 30);
            return;
        }
        if (!started) {
            init(info);
        }
        if (!layout) return;
        layout.setPsgInfo(info);
        layout.setPanel();
    };
    try {
        const stored = localStorage.getItem(EDITED_STORY_STORAGE_KEY);
        if (stored) {
            const parsed = JSON.parse(stored);
            if (typeof parsed?.html === 'string' && parsed.html.trim()) {
                importedHtml = parsed.html;
                importedName = parsed.name || 'Edited Story.html';
            }
            localStorage.removeItem(EDITED_STORY_STORAGE_KEY);
        }
    } catch (err) {
        console.warn('[layout] Failed to load edited story from storage', err);
    }
    try {
        const raw = localStorage.getItem(USER_STORIES_STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        if (Array.isArray(parsed)) {
            userStories = parsed.filter((s) =>
                typeof s?.id === 'string' &&
                typeof s?.name === 'string' &&
                typeof s?.html === 'string'
            );
        }
    } catch (err) {
        console.warn('[layout] Failed to load user stories', err);
    }

    loaded = true;
    iframe.addEventListener("load", (event) => {
        activeSessionId = Math.random().toString(36).slice(2);
        iframe.contentWindow.postMessage({ type: "ping", sessionId: activeSessionId }, event.origin);
    });

    window.addEventListener("message", (event) => {
        const isSameOrigin = event.origin === window.location.origin;
        const isNullFromIframe = event.origin === "null" && event.source === iframe.contentWindow;
        if (!isSameOrigin && !isNullFromIframe) return;
        let data = event.data;

        if (data.type === "pong") {
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
            if (awaitingRefreshInit) {
                // After refresh-start handshake, the first real passage is the one we want.
                // Do not drop it; consume it and clear the guard.
                awaitingRefreshInit = false;
            }
            if (isStoryInitPayload(data.info)) {
                return;
            }
            applyPassageInfoWithRetry(data.info);
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

    function loadStoryHtml(html, name, opts = {}) {
        resetLayout();
        const patched = injectMessaging(html);
        iframe.removeAttribute("src");
        iframe.setAttribute("srcdoc", patched);
        if (statusEl) statusEl.textContent = name ? `Loaded: ${name}` : 'Loaded';
        if (storyStatusEl) storyStatusEl.textContent = String(opts.storyStatus || (name || 'Imported story'));
        pendingStart = true;
    }

    function setMode(mode, options = {}) {
        currentMode = mode;
        if (mode === 'default') {
            const targetUrl = String(options.defaultUrl || currentDefaultStoryUrl || defaultStories[0]?.url || '').trim();
            if (targetUrl) currentDefaultStoryUrl = targetUrl;
            const selectedLabel = defaultStories.find((s) => s.url === currentDefaultStoryUrl)?.label || 'Default story';
            // Always load defaults through HTML injection path so messaging.js is attached.
            fetchDefaultStoryHtml(currentDefaultStoryUrl).then((html) => {
                if (typeof html === 'string' && html.trim()) {
                    currentDefaultStoryHtml = html;
                    loadStoryHtml(html, `${selectedLabel}.html`, { storyStatus: selectedLabel });
                } else {
                    currentDefaultStoryHtml = '';
                    resetLayout();
                    iframe.removeAttribute('srcdoc');
                    iframe.setAttribute('src', currentDefaultStoryUrl);
                    if (statusEl) statusEl.textContent = `Loaded default: ${selectedLabel}`;
                    if (storyStatusEl) storyStatusEl.textContent = selectedLabel;
                    pendingStart = true;
                }
                if (defaultStorySelect) defaultStorySelect.value = currentDefaultStoryUrl;
            });
        } else if (mode === 'user') {
            const userStory = options.userStory || userStories.find((s) => s.id === options.userStoryId);
            if (!userStory) return;
            currentUserStoryId = String(userStory.id);
            loadStoryHtml(userStory.html, `${userStory.name}.html`, { storyStatus: userStory.name });
            if (defaultStorySelect) defaultStorySelect.value = `${USER_STORY_SELECT_PREFIX}${currentUserStoryId}`;
        } else if (importedHtml) {
            loadStoryHtml(importedHtml, importedName);
            if (defaultStorySelect) defaultStorySelect.value = IMPORTED_STORY_SELECT_VALUE;
        }
    }

    function sanitizeStoryUrl(raw) {
        const url = String(raw || '').trim();
        if (!url) return '';
        if (/^https?:\/\//i.test(url)) return '';
        if (!url.toLowerCase().endsWith('.html')) return '';
        return url.replace(/^\/+/, '');
    }

    function nextCustomStoryName(baseName) {
        const base = String(baseName || 'Story').trim() || 'Story';
        const existing = new Set(userStories.map((s) => String(s?.name || '').trim().toLowerCase()));
        let n = 1;
        let candidate = `${base} ${n}`;
        while (existing.has(candidate.toLowerCase())) {
            n += 1;
            candidate = `${base} ${n}`;
        }
        return candidate;
    }

    function showNewCustomStoryDialog(defaultName) {
        return new Promise((resolve) => {
            if (!newCustomStoryDialog || !newCustomStoryName || !newCustomStoryCancelBtn || !newCustomStoryCreateBtn) {
                resolve(null);
                return;
            }
            newCustomStoryDialog.hidden = false;
            newCustomStoryName.value = defaultName;
            newCustomStoryName.focus();
            newCustomStoryName.select();
            const cleanup = () => {
                newCustomStoryDialog.hidden = true;
                newCustomStoryCancelBtn.removeEventListener('click', onCancel);
                newCustomStoryCreateBtn.removeEventListener('click', onCreate);
                newCustomStoryDialog.removeEventListener('pointerdown', onBackdrop);
                newCustomStoryName.removeEventListener('keydown', onKeyDown);
            };
            const onCancel = () => {
                cleanup();
                resolve(null);
            };
            const onCreate = () => {
                const value = String(newCustomStoryName.value || '').trim();
                if (!value) return;
                cleanup();
                resolve(value);
            };
            const onBackdrop = (event) => {
                if (event.target === newCustomStoryDialog) onCancel();
            };
            const onKeyDown = (event) => {
                if (event.key === 'Escape') onCancel();
                if (event.key === 'Enter') onCreate();
            };
            newCustomStoryCancelBtn.addEventListener('click', onCancel);
            newCustomStoryCreateBtn.addEventListener('click', onCreate);
            newCustomStoryDialog.addEventListener('pointerdown', onBackdrop);
            newCustomStoryName.addEventListener('keydown', onKeyDown);
        });
    }

    function inferStoryLabel(url) {
        const file = String(url || '').split('/').pop() || '';
        const base = file.replace(/\.html$/i, '').replace(/[-_]+/g, ' ').trim();
        return base || 'Story';
    }

    async function loadDefaultStoriesFromManifest() {
        try {
            const resp = await fetch('defaultstories/index.json', { cache: 'no-store' });
            if (!resp.ok) return [];
            const payload = await resp.json();
            const rows = Array.isArray(payload?.stories) ? payload.stories : [];
            return rows
                .map((entry) => {
                    if (typeof entry === 'string') {
                        const url = sanitizeStoryUrl(entry);
                        if (!url) return null;
                        return { label: inferStoryLabel(url), url };
                    }
                    const url = sanitizeStoryUrl(entry?.url);
                    if (!url) return null;
                    const label = String(entry?.label || '').trim() || inferStoryLabel(url);
                    return { label, url };
                })
                .filter(Boolean);
        } catch {
            return [];
        }
    }

    function populateDefaultStorySelect() {
        if (!defaultStorySelect) return;
        defaultStorySelect.innerHTML = '';
        for (const story of defaultStories) {
            const opt = document.createElement('option');
            opt.value = story.url;
            opt.textContent = story.label;
            defaultStorySelect.appendChild(opt);
        }
        for (const story of userStories) {
            const opt = document.createElement('option');
            opt.value = `${USER_STORY_SELECT_PREFIX}${story.id}`;
            opt.textContent = `Custom: ${story.name}`;
            defaultStorySelect.appendChild(opt);
        }
        if (importedHtml) {
            const opt = document.createElement('option');
            opt.value = IMPORTED_STORY_SELECT_VALUE;
            opt.textContent = importedName
                ? `Imported: ${importedName}`
                : 'Imported Story';
            defaultStorySelect.appendChild(opt);
        }
        if (currentDefaultStoryUrl) {
            defaultStorySelect.value = currentDefaultStoryUrl;
        }
    }

    async function initDefaultStories() {
        const fromManifest = await loadDefaultStoriesFromManifest();
        if (fromManifest.length > 0) {
            defaultStories = fromManifest;
        }
        const templateEntry = defaultStories.find((s) => /template\.html$/i.test(String(s?.url || '')))
            || defaultStories[0]
            || null;
        templateStoryUrl = templateEntry?.url || '';
        const preferred = defaultStories.find((s) => !/template\.html$/i.test(String(s?.url || '')))
            || templateEntry
            || null;
        currentDefaultStoryUrl = preferred?.url || '';
        defaultStoryHtmlPromise = templateStoryUrl ? fetchDefaultStoryHtml(templateStoryUrl) : Promise.resolve(null);
        populateDefaultStorySelect();
    }

    async function getCurrentDisplayedStoryForEditor() {
        const getCurrentPassageName = () => {
            try {
                const sc = iframe?.contentWindow?.SugarCube;
                const byPassage = String(sc?.State?.passage || '').trim();
                if (byPassage) return byPassage;
                const byActive = String(sc?.State?.active?.title || '').trim();
                if (byActive) return byActive;
            } catch {
                // ignore; fallback below
            }
            return '';
        };
        if (currentMode === 'imported' && importedHtml) {
            return {
                kind: 'imported',
                html: importedHtml,
                name: importedName || 'Imported Story.html',
                currentPassage: getCurrentPassageName(),
            };
        }
        if (currentMode === 'user') {
            const found = userStories.find((s) => s.id === currentUserStoryId);
            if (found?.html) {
                return {
                    kind: 'user',
                    id: found.id,
                    html: found.html,
                    name: `${found.name}.html`,
                    currentPassage: getCurrentPassageName(),
                };
            }
        }
        const html = await fetchDefaultStoryHtml(currentDefaultStoryUrl);
        const resolvedHtml = (typeof currentDefaultStoryHtml === 'string' && currentDefaultStoryHtml.trim())
            ? currentDefaultStoryHtml
            : html;
        if (typeof resolvedHtml === 'string' && resolvedHtml.trim()) {
            const selectedLabel = defaultStories.find((s) => s.url === currentDefaultStoryUrl)?.label || 'Default story';
            return {
                kind: 'default',
                url: currentDefaultStoryUrl,
                html: resolvedHtml,
                name: `${selectedLabel}.html`,
                currentPassage: getCurrentPassageName(),
            };
        }
        return null;
    }

    function readFileText(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result || ''));
            reader.onerror = () => reject(new Error('Failed to load file'));
            reader.readAsText(file);
        });
    }

    function parseTweePassages(twee) {
        const text = String(twee || '').replace(/\r\n/g, '\n').replace(/^\uFEFF/, '');
        const lines = text.split('\n');
        const passages = [];
        let current = null;
        let body = [];

        const pushCurrent = () => {
            if (!current) return;
            passages.push({
                name: current.name,
                tags: current.tags,
                body: body.join('\n').replace(/^\n/, ''),
            });
            body = [];
        };

        const parseHeader = (line) => {
            const raw = line.slice(2).trim();
            // :: Passage [tag1 tag2] <meta>
            const match = raw.match(/^(.*?)\s*\[(.*?)\]\s*(?:<.*?>)?\s*$/);
            if (!match) return { name: raw, tags: [] };
            const name = match[1].trim();
            const tags = match[2]
                .split(/\s+/)
                .map((t) => t.trim())
                .filter(Boolean);
            return { name, tags };
        };

        for (const line of lines) {
            if (line.startsWith('::')) {
                pushCurrent();
                current = parseHeader(line);
                continue;
            }
            if (current) body.push(line);
        }
        pushCurrent();
        return passages.filter((p) => p.name);
    }

    function compileTweeToHtml(tweeText, templateHtml, sourceName) {
        if (!templateHtml) throw new Error('Missing default story template');
        const passages = parseTweePassages(tweeText);
        if (!passages.length) throw new Error('No Twee passages found');

        const parser = new DOMParser();
        const doc = parser.parseFromString(templateHtml, 'text/html');
        const storyData = doc.querySelector('tw-storydata');
        if (!storyData) throw new Error('Template missing <tw-storydata>');

        const getPassage = (name) => passages.find((p) => String(p?.name || '').trim().toLowerCase() === String(name || '').trim().toLowerCase());
        const specialNames = new Set([
            'StoryTitle',
            'StoryAuthor',
            'StorySubtitle',
            'StoryCaption',
            'StoryBanner',
            'StoryMenu',
            'StoryData',
            'StoryInit',
            'StorySettings',
            'StoryStylesheet',
            'StoryJavaScript',
            'StoryDisplayTitle',
        ].map((n) => String(n).toLowerCase()));
        const storyTitle = getPassage('StoryTitle')?.body?.trim()
            || sourceName?.replace(/\.[^.]+$/, '')
            || 'Dialomic Story';
        storyData.setAttribute('name', storyTitle);

        const storyDataPassage = getPassage('StoryData');
        if (storyDataPassage?.body) {
            try {
                const parsed = JSON.parse(storyDataPassage.body);
                if (typeof parsed?.ifid === 'string' && parsed.ifid.trim()) {
                    storyData.setAttribute('ifid', parsed.ifid.trim());
                }
            } catch {
                // Ignore invalid StoryData JSON and keep template defaults.
            }
        }

        const startCandidate = passages.find((p) => !specialNames.has(String(p?.name || '').trim().toLowerCase())) || passages[0];
        let startPid = 1;
        storyData.querySelectorAll('tw-passagedata').forEach((n) => n.remove());

        for (let i = 0; i < passages.length; i += 1) {
            const p = passages[i];
            const pid = i + 1;
            if (String(p?.name || '').trim().toLowerCase() === String(startCandidate?.name || '').trim().toLowerCase()) startPid = pid;
            const pass = doc.createElement('tw-passagedata');
            pass.setAttribute('pid', String(pid));
            pass.setAttribute('name', p.name);
            pass.setAttribute('tags', p.tags.join(' '));
            pass.setAttribute('position', `${100 + (i % 8) * 140},${100 + Math.floor(i / 8) * 140}`);
            pass.setAttribute('size', '100,100');
            pass.textContent = p.body;
            storyData.appendChild(pass);
        }

        storyData.setAttribute('startnode', String(startPid));
        return `<!DOCTYPE html>\n${doc.documentElement.outerHTML}`;
    }

    async function handleFile(file) {
        if (!file) return;
        try {
            const fileText = await readFileText(file);
            const lowerName = String(file.name || '').toLowerCase();
            if (lowerName.endsWith('.twee') || lowerName.endsWith('.tw')) {
                const templateHtml = await defaultStoryHtmlPromise;
                importedHtml = compileTweeToHtml(fileText, templateHtml, file.name);
                importedName = `${file.name} (compiled)`;
                if (statusEl) statusEl.textContent = `Compiled and loaded: ${file.name}`;
            } else {
                importedHtml = fileText;
                importedName = file.name;
            }
            populateDefaultStorySelect();
            setMode('imported');
        } catch (err) {
            console.error(err);
            if (statusEl) statusEl.textContent = 'Failed to load file';
        }
    }

    if (fileInput) {
        fileInput.addEventListener('change', () => handleFile(fileInput.files?.[0]));
    }

    if (defaultStorySelect) {
        defaultStorySelect.addEventListener('change', () => {
            const url = String(defaultStorySelect.value || '').trim();
            if (!url) return;
            if (url === IMPORTED_STORY_SELECT_VALUE) {
                if (!importedHtml) return;
                setMode('imported');
                return;
            }
            if (url.startsWith(USER_STORY_SELECT_PREFIX)) {
                const id = url.slice(USER_STORY_SELECT_PREFIX.length);
                const story = userStories.find((s) => s.id === id);
                if (!story) return;
                setMode('user', { userStory: story });
                return;
            }
            setMode('default', { defaultUrl: url });
        });
    }

    if (editorLink) {
        editorLink.addEventListener('click', async (event) => {
            event.preventDefault();
            try {
                const payload = await getCurrentDisplayedStoryForEditor();
                if (payload?.kind === 'default' && payload?.html) {
                    const selectedLabel = defaultStories.find((s) => s.url === payload.url)?.label || 'Template';
                    const defaultName = nextCustomStoryName(selectedLabel);
                    const storyName = await showNewCustomStoryDialog(defaultName);
                    if (!storyName) return;
                    let html = String(payload.html || '');
                    if (!html.trim() && payload.url) {
                        html = String(await fetchDefaultStoryHtml(payload.url) || '');
                    }
                    if (!html.trim()) {
                        if (statusEl) statusEl.textContent = 'Unable to create story: source story HTML unavailable';
                        return;
                    }
                    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
                    const story = { id, name: storyName, html, createdAt: Date.now() };
                    userStories = [...userStories, story];
                    localStorage.setItem(USER_STORIES_STORAGE_KEY, JSON.stringify(userStories));
                    populateDefaultStorySelect();
                    const bootPayload = {
                        kind: 'user',
                        id,
                        html,
                        name: `${storyName}.html`,
                        currentPassage: String(payload.currentPassage || ''),
                    };
                    localStorage.setItem(EDITOR_BOOT_STORY_KEY, JSON.stringify(bootPayload));
                    window.location.href = editorLink.getAttribute('href') || './visual-editor.html';
                    return;
                }
                if (payload?.html) {
                    localStorage.setItem(EDITOR_BOOT_STORY_KEY, JSON.stringify(payload));
                }
            } catch (err) {
                console.warn('[layout] Failed to stage current story for editor', err);
            }
            window.location.href = editorLink.getAttribute('href') || './visual-editor.html';
        });
    }

    initDefaultStories().then(() => {
        let forcedSelection = null;
        try {
            const raw = localStorage.getItem(PLAYER_START_SELECTION_KEY) || localStorage.getItem('DL_VIEWER_START_SELECTION');
            if (raw) forcedSelection = JSON.parse(raw);
            localStorage.removeItem(PLAYER_START_SELECTION_KEY);
            localStorage.removeItem('DL_VIEWER_START_SELECTION');
        } catch {
            forcedSelection = null;
        }
        if (importedHtml) {
            setMode('imported');
            return;
        }
        if (forcedSelection?.kind === 'user') {
            const story = userStories.find((s) => s.id === String(forcedSelection.id || ''));
            if (story) {
                setMode('user', { userStory: story });
                return;
            }
        }
        if (forcedSelection?.kind === 'default') {
            const url = String(forcedSelection.url || '').trim();
            if (url) {
                setMode('default', { defaultUrl: url });
                return;
            }
        }
        setMode('default');
    });
};

/**
 * Bootstrap or refresh player state from a newly received passage payload.
 */
function init(info){
    if (!started){
        layout = new LayoutUI();
        started = true;
    }

    const sugarVars = getSugarCubeVars();
    if (!sugarVars) {
        console.warn('[layout] SugarCube vars unavailable during init; skipping this init tick.');
        return;
    }
    vars = sugarVars;
    layout.lo = vars.DL_setup;
    layout.loCurr = vars.DL_curr;
    if (isStoryInitPayload(info)) return;
    layout.setPsgInfo(info);
    // Render immediately on init so first passage does not depend on a follow-up
    // :passage message timing from the iframe bridge.
    layout.setPanel();
}

function cleanText(s){
    let i = s.indexOf("%%%");
    if (i !== -1){
        return s.substring(0, i);
    }
    return s;
}

function cloneSceneSpec(scene) {
    if (!scene || typeof scene !== 'object') return scene || {};
    if (typeof structuredClone === 'function') {
        try {
            return structuredClone(scene);
        } catch {
            // fallback below
        }
    }
    try {
        return JSON.parse(JSON.stringify(scene));
    } catch {
        return { ...scene };
    }
}

const DEFAULT_PANEL_CAMERA = Object.freeze({
    position: [0, 0.8, 9],
    target: [0, 2, -80],
    fov: 25,
    near: 0.03,
    far: 500,
});

function withDefaultSceneCamera(scene) {
    const next = cloneSceneSpec(scene) || {};
    if (!next.camera || typeof next.camera !== 'object') {
        next.camera = cloneSceneSpec(DEFAULT_PANEL_CAMERA);
    }
    return next;
}

function cloneSnapshotValue(value) {
    if (value == null) return value;
    try {
        return JSON.parse(JSON.stringify(value));
    } catch (_) {
        return value;
    }
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
        const eqIdx = token.indexOf('=');
        const colonIdx = token.indexOf(':');
        let sepIdx = -1;
        if (eqIdx >= 0 && colonIdx >= 0) sepIdx = Math.min(eqIdx, colonIdx);
        else sepIdx = Math.max(eqIdx, colonIdx);
        if (sepIdx < 1) return;
        const key = token.slice(0, sepIdx).trim();
        const value = token.slice(sepIdx + 1).trim();
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
            const ratioMatch = v.match(/^([0-9]*\.?[0-9]+)\s*:\s*([0-9]*\.?[0-9]+)$/);
            if (ratioMatch) {
                const w = Number(ratioMatch[1]);
                const h = Number(ratioMatch[2]);
                if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) {
                    commands.aspectRatio = w / h;
                }
                return;
            }
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
        const speakerKey = String(speaker || '').trim();
        const speakerObj = sceneObjects
            ? (sceneObjects[speakerKey] || sceneObjects[speakerKey.toLowerCase()])
            : null;
        if (!speakerKey || !speakerObj) {
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
        speakers.push({ speaker: speakerKey, html: updatedPara.trim() });
    }

    return {
        speakers,
        narrationText: narrationParas.join('\n\n'),
    };
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
        this.panelConfig = { panels: 'stack', rows: 1, cols: 1, aspect: 'free', aspectRatio: null };
        this.panelCommands = {};
        this.panelAspectRatio = null;
        this.largePanelOrder = [];
        this.panelOrderCounter = 0;
        this.activePanelName = null;
        this.hoverPanelName = null;
        this.panelHistory = [];
        this.historyCursor = null;
        this.historyCurrentSnapshot = null;
        this.historyMode = false;
        this.historyScrollLockUntil = 0;
        this.suppressHistoryCapture = false;

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
        this.historyReturnBtn = document.createElement('button');
        this.historyReturnBtn.type = 'button';
        this.historyReturnBtn.id = 'history-return-btn';
        this.historyReturnBtn.textContent = '↓';
        this.historyReturnBtn.style.position = 'fixed';
        this.historyReturnBtn.style.left = '50%';
        this.historyReturnBtn.style.transform = 'translateX(-50%)';
        this.historyReturnBtn.style.width = '44px';
        this.historyReturnBtn.style.height = '44px';
        this.historyReturnBtn.style.borderRadius = '999px';
        this.historyReturnBtn.style.border = 'none';
        this.historyReturnBtn.style.background = '#000';
        this.historyReturnBtn.style.color = '#fff';
        this.historyReturnBtn.style.fontSize = '24px';
        this.historyReturnBtn.style.fontWeight = '700';
        this.historyReturnBtn.style.lineHeight = '1';
        this.historyReturnBtn.style.cursor = 'pointer';
        this.historyReturnBtn.style.display = 'none';
        this.historyReturnBtn.style.zIndex = '9400';
        this.historyReturnBtn.addEventListener('click', () => this.exitHistoryMode());
        document.body.appendChild(this.historyReturnBtn);

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
        this.performanceHud = new URLSearchParams(window.location.search).has('perf')
            ? new PlayerPerformanceHud() : null;
        this.frameRequest = requestAnimationFrame(this.tick);

        this.windowListeners = [
            ['resize', () => this.onResize()],
            ['keydown', (event) => this.onKeyDown(event)],
            ['wheel', (event) => this.onWheel(event), { passive: false }],
            ['pointermove', (event) => this.onGlobalPointerMove(event), { passive: true, capture: true }],
        ];
        for (const [type, handler, options] of this.windowListeners) {
            window.addEventListener(type, handler, options);
        }
    }

    destroy() {
        this.destroyed = true;
        cancelAnimationFrame(this.frameRequest);
        this.performanceHud?.destroy();
        for (const [type, handler, options] of this.windowListeners) {
            window.removeEventListener(type, handler, options);
        }
        if (this.linksRoot) this.linksRoot.remove();
        if (this.inputRoot) this.inputRoot.remove();
        if (this.restartBtn) this.restartBtn.remove();
        if (this.historyReturnBtn) this.historyReturnBtn.remove();
    }

    normalizePanelConfig(rawConfig) {
        const cfg = rawConfig && typeof rawConfig === 'object' ? rawConfig : {};
        const modeRaw = String(cfg.panels || 'stack').toLowerCase();
        const panels = modeRaw === 'cycle' ? 'cycle' : 'stack';
        const rows = Math.max(1, Math.min(3, Number.isFinite(Number(cfg.rows)) ? Math.floor(Number(cfg.rows)) : 1));
        const cols = Math.max(1, Math.min(3, Number.isFinite(Number(cfg.cols)) ? Math.floor(Number(cfg.cols)) : 1));
        let aspectRatio = null;
        const ratioFromKey = Number(cfg.aspectRatio);
        if (Number.isFinite(ratioFromKey) && ratioFromKey > 0) {
            aspectRatio = ratioFromKey;
        }
        const aspectRaw = String(cfg.aspect || 'free').toLowerCase();
        const ratioFromAspect = aspectRaw.match(/^([0-9]*\.?[0-9]+)\s*:\s*([0-9]*\.?[0-9]+)$/);
        if (ratioFromAspect) {
            const aw = Number(ratioFromAspect[1]);
            const ah = Number(ratioFromAspect[2]);
            if (Number.isFinite(aw) && Number.isFinite(ah) && aw > 0 && ah > 0) {
                aspectRatio = aw / ah;
            }
        }
        let aspect = aspectRaw === 'fixed' ? 'fixed' : 'free';
        if (aspectRatio) aspect = 'fixed';
        return { panels, rows, cols, aspect, aspectRatio };
    }

    getPanelCapacity() {
        return Math.max(1, this.panelConfig.rows * this.panelConfig.cols);
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
        const areaTop = this.topInset + topPad;
        const uiGap = Math.max(10, this.h * 0.02);
        const fallbackBottomPad = Math.max(120, this.h * 0.22);
        let areaBottom = Math.max(areaTop + 80, window.innerHeight - fallbackBottomPad);
        const reserveTopCandidates = [];
        if (this.linksRoot && this.links && this.links.length > 0) {
            const linksRect = this.linksRoot.getBoundingClientRect();
            if (Number.isFinite(linksRect.top) && linksRect.height > 0) {
                reserveTopCandidates.push(linksRect.top - uiGap);
            }
        }
        if (this.inputRoot && this.inputRoot.style.display !== 'none') {
            const inputRect = this.inputRoot.getBoundingClientRect();
            if (Number.isFinite(inputRect.top) && inputRect.height > 0) {
                reserveTopCandidates.push(inputRect.top - uiGap);
            }
        }
        if (reserveTopCandidates.length) {
            const reserveTop = Math.min(...reserveTopCandidates);
            if (Number.isFinite(reserveTop)) {
                areaBottom = Math.min(areaBottom, reserveTop);
            }
        }
        areaBottom = Math.max(areaTop + 80, areaBottom);
        const areaWidth = Math.max(80, this.w - leftPad - rightPad);
        const areaHeight = Math.max(80, areaBottom - areaTop);
        const gapX = Math.max(10, areaWidth * 0.03);
        const gapY = Math.max(10, areaHeight * 0.04);
        const slotWidth = Math.max(80, (areaWidth - gapX * (usedCols - 1)) / usedCols);
        const slotHeight = Math.max(80, (areaHeight - gapY * (usedRows - 1)) / usedRows);

        let defaultCellWidth = slotWidth;
        let defaultCellHeight = slotHeight;
        if (this.panelConfig.aspect === 'fixed') {
            const baseAspect = Number.isFinite(this.panelConfig.aspectRatio) && this.panelConfig.aspectRatio > 0
                ? this.panelConfig.aspectRatio
                : (() => {
                    const fullCellWidth = Math.max(80, (areaWidth - gapX * (maxCols - 1)) / maxCols);
                    const fullCellHeight = Math.max(80, (areaHeight - gapY * (maxRows - 1)) / maxRows);
                    return Math.max(0.1, fullCellWidth / Math.max(1, fullCellHeight));
                })();
            defaultCellWidth = Math.min(slotWidth, slotHeight * baseAspect);
            defaultCellHeight = defaultCellWidth / baseAspect;
            if (defaultCellHeight > slotHeight) {
                defaultCellHeight = slotHeight;
                defaultCellWidth = defaultCellHeight * baseAspect;
            }
        }

        const targets = {};
        for (let i = 0; i < count; i++) {
            const name = order[i];
            const row = Math.floor(i / usedCols);
            const col = i % usedCols;
            const slotLeft = leftPad + col * (slotWidth + gapX);
            const slotTop = areaTop + row * (slotHeight + gapY);
            let cellWidth = defaultCellWidth;
            let cellHeight = defaultCellHeight;
            const panelAspect = this.panelsOnscreen[name]?.customAspectRatio;
            if (Number.isFinite(panelAspect) && panelAspect > 0) {
                cellWidth = Math.min(slotWidth, slotHeight * panelAspect);
                cellHeight = cellWidth / panelAspect;
                if (cellHeight > slotHeight) {
                    cellHeight = slotHeight;
                    cellWidth = cellHeight * panelAspect;
                }
            }
            targets[name] = {
                left: slotLeft + (slotWidth - cellWidth) * 0.5,
                top: slotTop + (slotHeight - cellHeight) * 0.5,
                width: cellWidth,
                height: cellHeight,
                speechBounds: {
                    left: slotLeft,
                    top: slotTop,
                    right: slotLeft + slotWidth,
                    bottom: slotTop + slotHeight,
                },
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
            panel.setSpeechBounds?.(target.speechBounds || {
                left: target.left,
                top: target.top,
                right: target.left + target.width,
                bottom: target.top + target.height,
            });
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
        const names = Object.keys(this.panelsOnscreen || {});
        for (let i = 0; i < names.length; i++) {
            const name = names[i];
            const panel = this.panelsOnscreen[name];
            if (!panel || panel.panelSize === 'small' || panel.onScreen === false) continue;
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
        if (this.historyMode && Number.isInteger(this.historyCursor)) {
            this.showHistoryPageAt(this.historyCursor);
            this.showHistoryControls();
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

    onKeyDown(event) {
        const active = document.activeElement;
        if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || this.inputRoot?.contains(active))) {
            return;
        }
        if (this.historyMode) {
            if (event.key === ' ' || event.key === 'Enter' || event.key === 'Escape') {
                event.preventDefault();
                this.exitHistoryMode();
            }
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

    onWheel(event) {
        const active = document.activeElement;
        if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || this.inputRoot?.contains(active))) return;
        event.preventDefault();
        const now = performance.now();
        if (now < this.historyScrollLockUntil) return;
        const dy = Number(event.deltaY) || 0;
        if (dy === 0) return;
        if (Math.abs(dy) < 45) return;
        const direction = dy < 0 ? -1 : 1;
        if (direction < 0) {
            if (this.enterOrStepBackHistory()) {
                this.historyScrollLockUntil = now + 320;
            }
            return;
        }
        if (this.historyMode) {
            if (this.stepForwardOrExitHistory()) {
                this.historyScrollLockUntil = now + 320;
            }
        }
    }

    restartStory() {
        if (!loaded) return;
        iframe.contentWindow.postMessage({ type: 'start' , passage: this.psgName}, getIframeTargetOrigin());
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
        this.panelHistory = [];
        this.historyCursor = null;
        this.historyCurrentSnapshot = null;
        this.historyMode = false;
    }

    captureVisiblePageSnapshot() {
        this.reconcileLargePanelOrder();
        const order = this.largePanelOrder.filter((name) => {
            const p = this.panelsOnscreen[name];
            return p && p.panelSize !== 'small' && p.onScreen !== false && !p.isAnimatingOut;
        });
        if (!order.length) return null;
        const panels = order.map((name) => {
            const p = this.panels[name] || this.panelsOnscreen[name];
            if (!p) return null;
            return {
                name,
                rect: {
                    left: p.data.left,
                    top: p.data.top,
                    width: p.data.width,
                    height: p.data.height,
                },
                speechBounds: p.speechBounds ? {
                    left: p.speechBounds.left,
                    top: p.speechBounds.top,
                    right: p.speechBounds.right,
                    bottom: p.speechBounds.bottom,
                } : null,
                aspectMode: this.panelConfig?.aspect || 'free',
                customAspectRatio: Number.isFinite(p.customAspectRatio) ? p.customAspectRatio : null,
                passageAsSeen: {
                    narrationText: p.txt || '',
                    narrationHtml: p.text || '',
                    speakers: cloneSnapshotValue(p.speakers || []),
                    scene: cloneSnapshotValue(p.scene || null),
                },
            };
        }).filter(Boolean);
        if (!panels.length) return null;
        return {
            order,
            panels,
            viewport: {
                w: this.w,
                h: this.h,
                topInset: this.topInset,
            },
        };
    }

    getHistoryRectForViewport(item, snapshot) {
        const rect = item?.rect || { left: 0, top: this.topInset, width: 360, height: 150 };
        const srcW = Math.max(1, Number(snapshot?.viewport?.w) || this.w || window.innerWidth || 1);
        const srcH = Math.max(1, Number(snapshot?.viewport?.h) || this.h || (window.innerHeight - this.topInset) || 1);
        const dstW = Math.max(1, this.w || window.innerWidth || 1);
        const dstH = Math.max(1, this.h || (window.innerHeight - this.topInset) || 1);
        const scaleX = dstW / srcW;
        const scaleY = dstH / srcH;
        const srcTopInset = Number(snapshot?.viewport?.topInset) || 0;
        const relTop = rect.top - srcTopInset;
        return {
            left: rect.left * scaleX,
            top: this.topInset + (relTop * scaleY),
            width: rect.width * scaleX,
            height: rect.height * scaleY,
        };
    }

    pushHistorySnapshot() {
        if (this.suppressHistoryCapture || this.historyMode) return;
        const snapshot = this.captureVisiblePageSnapshot();
        if (!snapshot) return;
        const signature = JSON.stringify(snapshot.panels.map((p) => `${p.name}:${Math.round(p.rect.left)},${Math.round(p.rect.top)},${Math.round(p.rect.width)},${Math.round(p.rect.height)}`));
        const last = this.panelHistory[this.panelHistory.length - 1];
        if (last?.signature === signature) return;
        this.panelHistory.push({ ...snapshot, signature });
        if (this.panelHistory.length > 40) this.panelHistory.shift();
    }

    showHistoryControls() {
        this.linksRoot.style.visibility = 'hidden';
        this.linksRoot.style.pointerEvents = 'none';
        this.linksRoot.style.display = 'flex';
        this.inputRoot.style.display = 'none';
        const y = Math.max(this.topInset + 96, window.innerHeight - 92);
        this.historyReturnBtn.style.top = `${y}px`;
        this.historyReturnBtn.style.display = 'block';
    }

    showLiveControls() {
        this.historyReturnBtn.style.display = 'none';
        this.linksRoot.style.visibility = 'visible';
        this.linksRoot.style.pointerEvents = '';
        this.linksRoot.style.display = 'flex';
        this.renderLinks();
        this.renderFormUI();
    }

    showHistoryPageAt(index) {
        if (index < 0 || index >= this.panelHistory.length) return false;
        const snapshot = this.panelHistory[index];
        if (!snapshot) return false;
        const keep = new Set(snapshot.order);
        const offscreen = { left: 0, top: this.topInset - 400, width: 360, height: 150 };
        this.suppressHistoryCapture = true;
        for (const name of Object.keys(this.panelsOnscreen)) {
            const p = this.panelsOnscreen[name];
            if (!p || p.panelSize === 'small') continue;
            if (!keep.has(name)) {
                p.three?.setSpeakerAnimationPaused?.(true);
                p.setTarget(offscreen, { animateOut: true });
            }
        }
        for (const item of snapshot.panels) {
            const p = this.panels[item.name];
            if (!p) continue;
            p.historyModeLiveAnchors = true;
            p.panelSize = 'large';
            p.setAspectMode?.(item.aspectMode || 'free');
            p.customAspectRatio = Number.isFinite(item.customAspectRatio) ? item.customAspectRatio : null;
            if (item.passageAsSeen) {
                const narration = item.passageAsSeen.narrationText || item.passageAsSeen.narrationHtml || '';
                p.setTxt?.(narration);
                p.setSpeakers?.(cloneSnapshotValue(item.passageAsSeen.speakers || []));
                if (item.passageAsSeen.scene) {
                    p.setScene?.(cloneSnapshotValue(item.passageAsSeen.scene));
                }
            }
            const scaledRect = this.getHistoryRectForViewport(item, snapshot);
            if (!this.panelsOnscreen[item.name]) this.panelsOnscreen[item.name] = p;
            p.setSpeechBounds?.(item.speechBounds || {
                left: scaledRect.left,
                top: scaledRect.top,
                right: scaledRect.left + scaledRect.width,
                bottom: scaledRect.top + scaledRect.height,
            });
            p.setTarget(scaledRect);
            p.setNarrationMinTop?.(null);
            p.setNarrationFixedTop?.(null);
            p.updateTextMode?.();
            p.syncNarrationPosition?.();
            p.three?.setSpeakerAnimationPaused?.(true);
            if (p.speechLayout?.items) {
                for (const it of p.speechLayout.items) {
                    it.anchorNorm = null;
                }
            }
            this.bindPanelHover(item.name, p);
        }
        this.largePanelOrder = [...snapshot.order];
        this.activePanelName = snapshot.order[snapshot.order.length - 1] || this.activePanelName;
        this.hoverPanelName = null;
        this.historyCursor = index;
        this.historyMode = true;
        this.applyPanelLayering();
        this.showHistoryControls();
        this.suppressHistoryCapture = false;
        return true;
    }

    enterOrStepBackHistory() {
        if (!this.historyMode) {
            if (!this.panelHistory.length) return false;
            this.historyCurrentSnapshot = this.captureVisiblePageSnapshot();
            return this.showHistoryPageAt(this.panelHistory.length - 1);
        }
        if (this.historyCursor === null || this.historyCursor <= 0) return false;
        return this.showHistoryPageAt(this.historyCursor - 1);
    }

    stepForwardOrExitHistory() {
        if (!this.historyMode) return false;
        if (this.historyCursor === null) return this.exitHistoryMode();
        if (this.historyCursor < this.panelHistory.length - 1) {
            return this.showHistoryPageAt(this.historyCursor + 1);
        }
        return this.exitHistoryMode();
    }

    exitHistoryMode() {
        if (!this.historyMode) return false;
        const offscreen = { left: 0, top: this.topInset - 400, width: 360, height: 150 };
        const keep = new Set(this.historyCurrentSnapshot?.order || []);
        this.suppressHistoryCapture = true;
        for (const name of Object.keys(this.panelsOnscreen)) {
            const p = this.panelsOnscreen[name];
            if (!p || p.panelSize === 'small') continue;
            if (!keep.has(name)) {
                p.three?.setSpeakerAnimationPaused?.(true);
                p.setTarget(offscreen, { animateOut: true });
            }
        }
        for (const name of Object.keys(this.panels)) {
            const p = this.panels[name];
            if (!p) continue;
            p.historyModeLiveAnchors = false;
        }
        if (this.historyCurrentSnapshot?.panels?.length) {
            for (const item of this.historyCurrentSnapshot.panels) {
                const p = this.panels[item.name];
                if (!p) continue;
                if (!this.panelsOnscreen[item.name]) this.panelsOnscreen[item.name] = p;
                p.panelSize = 'large';
                p.setAspectMode?.(item.aspectMode || this.panelConfig?.aspect || 'free');
                p.customAspectRatio = Number.isFinite(item.customAspectRatio) ? item.customAspectRatio : null;
                if (item.passageAsSeen) {
                    const narration = item.passageAsSeen.narrationText || item.passageAsSeen.narrationHtml || '';
                    p.setTxt?.(narration);
                    p.setSpeakers?.(cloneSnapshotValue(item.passageAsSeen.speakers || []));
                    if (item.passageAsSeen.scene) {
                        p.setScene?.(cloneSnapshotValue(item.passageAsSeen.scene));
                    }
                }
                p.setSpeechBounds?.(item.speechBounds || {
                    left: item.rect.left,
                    top: item.rect.top,
                    right: item.rect.left + item.rect.width,
                    bottom: item.rect.top + item.rect.height,
                });
                p.setTarget(item.rect);
                p.updateTextMode?.();
                p.syncNarrationPosition?.();
                p.three?.setSpeakerAnimationPaused?.(item.name !== this.activePanelName);
                if (p.speechLayout?.items) {
                    for (const it of p.speechLayout.items) {
                        it.anchorNorm = null;
                    }
                }
                this.bindPanelHover(item.name, p);
            }
            this.largePanelOrder = [...this.historyCurrentSnapshot.order];
        }
        this.historyMode = false;
        this.historyCursor = null;
        this.historyCurrentSnapshot = null;
        this.showLiveControls();
        this.reconcileLargePanelOrder();
        if (this.largePanelOrder.length) {
            this.activePanelName = this.largePanelOrder[this.largePanelOrder.length - 1];
        }
        this.applyPanelLayering();
        this.setActiveLargePanel(this.activePanelName);
        this.suppressHistoryCapture = false;
        return true;
    }

    updateLinkLayout() {
        const maxFont = (this.h * 0.8) / Math.max(1, this.links.length);
        this.fontSize = Math.min(22, maxFont);
        // Match the panel grid's horizontal inset so links align with full-width panels.
        this.bx = Math.max(8, this.w * 0.02);
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
            getIframeTargetOrigin()
        );
    }

    sendUIButton() {
        if (!loaded) return;
        iframe.contentWindow.postMessage(
            { type: 'uiButton' },
            getIframeTargetOrigin()
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
        if (this.historyMode) this.exitHistoryMode();
       
        this.psgName = info.psgName;
        const liveVars = getSugarCubeVars();
        if (liveVars) vars = liveVars;
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
        this.panelAspectRatio = Number.isFinite(this.panelCommands.aspectRatio)
            ? this.panelCommands.aspectRatio
            : null;
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
        if (this.historyMode) this.exitHistoryMode();
        const mode = this.panelConfig?.panels || 'stack';
        const capacity = this.getPanelCapacity();
        const name = this.psgName;
        const isStack = mode === 'stack';
        if (this.panelSolo) {
            this.pushHistorySnapshot();
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
            this.pushHistorySnapshot();
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
        const liveVars = getSugarCubeVars();
        if (liveVars) vars = liveVars;
        const sceneVars = liveVars || vars || {};
        let scene = withDefaultSceneCamera(sceneVars.DL);

        if (!this.panels[name]) {
            let p = new Panel(data, target, name, this.txt, -1, scene, 'narration', this.topInset);
            p.three.setExternallyDriven();
            p.historyModeLiveAnchors = false;
            p.setAspectMode?.(this.panelConfig.aspect);
            p.customAspectRatio = this.panelAspectRatio;
            if (this.speakers?.length) p.setSpeakers(this.speakers);
            p.panelSize = 'large';
            p.stackOrder = ++this.panelOrderCounter;
            this.panels[name] = p;
            this.currPanel = p;
            this.panelsOnscreen[name] = p;
            this.bindPanelHover(name, p);
        } else {
            let p = this.panels[name];
            p.historyModeLiveAnchors = false;
            this.currPanel = p;
            p.setLink(-1);
            if (!isAlreadyOnscreenLarge) {
                p.setCurr(data);
                p.setSpeechBounds?.({
                    left: target.left,
                    top: target.top,
                    right: target.left + target.width,
                    bottom: target.top + target.height,
                });
                p.setTarget(target);
            }
            p.setTxt(this.txt);
            p.setSpeakers(this.speakers || []);
            p.setScene(scene);
            p.setTopInset(this.topInset);
            p.setAspectMode?.(this.panelConfig.aspect);
            p.customAspectRatio = this.panelAspectRatio;
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
            this.pushHistorySnapshot();
            this.panelsOnscreen[name]?.setNarrationMinTop?.(null);
            this.panelsOnscreen[name]?.setNarrationFixedTop?.(null);
            this.panelsOnscreen[name]?.setSpeechBounds?.({
                left: target.left,
                top: target.top,
                right: target.left + target.width,
                bottom: target.top + target.height,
            });
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
    }

    makeResponse(i) {
        if (this.historyMode) this.exitHistoryMode();
        this.pushHistorySnapshot();
        let choice = this.links[i];
        let target = {left: 0, top: this.topInset + this.h / 5, width: this.w * 3 / 4, height: 300 * 3 / 4};
        for (let j in this.panelsOnscreen){
            let ps = this.panelsOnscreen[j];
            ps.setTarget(target, { animateOut: true });
        }

        let name = this.psgName + choice;
        let data = {left: 0, top: this.topInset + this.h, width: 100, height: 100};
        target = {left: this.w * 3 / 4, top: this.topInset + this.h / 3, width: 200, height: 200};
        const liveVars = getSugarCubeVars();
        if (liveVars) vars = liveVars;
        const sceneVars = liveVars || vars || {};
        let scene = withDefaultSceneCamera(sceneVars.DL);
        if (!this.panels[name]) {
            let p = new Panel(data, target, name, choice, i,scene, 'narration', this.topInset);
            p.three.setExternallyDriven();
            p.panelSize = 'small';
            p.setSpeechBounds?.({
                left: target.left,
                top: target.top,
                right: target.left + target.width,
                bottom: target.top + target.height,
            });
            this.panels[name] = p;
            this.currPanel = p;
            this.panelsOnscreen[name] = p;
            this.bindPanelHover(name, p);
        } else {
            let p = this.panels[name];
            p.setLink(i);
            this.currPanel = p;
            p.setCurr(data);
            p.setSpeechBounds?.({
                left: target.left,
                top: target.top,
                right: target.left + target.width,
                bottom: target.top + target.height,
            });
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
                getIframeTargetOrigin()
            );
        }
    }

    tick() {
        if (this.destroyed) return;
        // Sample the monotonic wall clock when work starts, rather than using the
        // timestamp of a frame whose callback may have waited behind other work.
        const now = performance.now();
        for (let panel in this.panelsOnscreen){
            let p = this.panelsOnscreen[panel];
            if (!p.onScreen){
                this.pressed = false;
                delete this.panelsOnscreen[panel];
                this.largePanelOrder = this.largePanelOrder.filter((key) => key !== panel);
                if (this.activePanelName === panel) this.activePanelName = null;
                if (this.hoverPanelName === panel) this.hoverPanelName = null;
                this.applyPanelLayering();
            } else {
                const transition = p.isUpdating ? p.transition : null;
                const expectedMs = p.isAnimatingOut ? PANEL_EXIT_DURATION_MS : PANEL_ENTER_DURATION_MS;
                let linkExists = p.update(now);
                if (transition) this.performanceHud?.recordPanel(p, transition, expectedMs);
                if (linkExists !== -1){
                    this.clickLink(linkExists);
                    p.setLink(-1);
                }
            }
        }
        this.performanceHud?.recordFrame(now);
        this.frameRequest = requestAnimationFrame(this.tick);
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
                p.setSpeechBounds?.({
                    left,
                    top,
                    right: left + width,
                    bottom: top + height,
                });
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
            p.setSpeechBounds?.({
                left,
                top,
                right: left + width,
                bottom: top + height,
            });
            const shouldScale = p.isUpdating;
            p.setCurr(target, shouldScale);
            p.target = target;
            p.movingToTarget = {left:false, top:false, width:false, height:false};
            p.isUpdating = false;
        }
    }
}
