const EDITED_STORY_STORAGE_KEY = 'DL_IMPORTED_STORY_HTML';
const EDITOR_BOOT_STORY_KEY = 'DL_VISUAL_EDITOR_BOOT_STORY';
const PLAYER_START_SELECTION_KEY = 'DL_PLAYER_START_SELECTION';
const USER_STORIES_STORAGE_KEY = 'DL_USER_STORIES';

const FALLBACK_DEFAULT_STORIES = [
    { label: 'Template', url: 'defaultstories/template.html' },
    { label: 'GuessingGame', url: 'defaultstories/GuessingGame.html' },
];

const el = {
    newStoryBtn: document.getElementById('newStoryBtn'),
    newStoryDialog: document.getElementById('newStoryDialog'),
    newStoryName: document.getElementById('newStoryName'),
    newStoryCancelBtn: document.getElementById('newStoryCancelBtn'),
    newStoryCreateBtn: document.getElementById('newStoryCreateBtn'),
    viewStorySelect: document.getElementById('viewStorySelect'),
    importStoryBtn: document.getElementById('importStoryBtn'),
    openPlayerBtn: document.getElementById('openPlayerBtn'),
    importStoryFile: document.getElementById('importStoryFile'),
};

function genIfid() {
    const rnd = (n) => Math.floor(Math.random() * n).toString(16).padStart(2, '0');
    const bytes = new Uint8Array(16);
    if (window.crypto?.getRandomValues) window.crypto.getRandomValues(bytes);
    else for (let i = 0; i < 16; i += 1) bytes[i] = Number.parseInt(rnd(256), 16);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const h = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`.toUpperCase();
}

function readUserStories() {
    try {
        const raw = localStorage.getItem(USER_STORIES_STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        if (!Array.isArray(parsed)) return [];
        return parsed.filter((s) => typeof s?.id === 'string' && typeof s?.name === 'string' && typeof s?.html === 'string');
    } catch {
        return [];
    }
}

function writeUserStories(stories) {
    localStorage.setItem(USER_STORIES_STORAGE_KEY, JSON.stringify(stories));
}

function inferStoryLabel(url) {
    const file = String(url || '').split('/').pop() || '';
    const base = file.replace(/\.html$/i, '').replace(/[-_]+/g, ' ').trim();
    return base || 'Story';
}

function sanitizeStoryUrl(raw) {
    const url = String(raw || '').trim();
    if (!url || /^https?:\/\//i.test(url) || !url.toLowerCase().endsWith('.html')) return '';
    return url.replace(/^\/+/, '');
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
                    return url ? { label: inferStoryLabel(url), url } : null;
                }
                const url = sanitizeStoryUrl(entry?.url);
                if (!url) return null;
                return { label: String(entry?.label || '').trim() || inferStoryLabel(url), url };
            })
            .filter(Boolean);
    } catch {
        return [];
    }
}

function setDialogOpen(open) {
    if (!el.newStoryDialog) return;
    el.newStoryDialog.hidden = !open;
    if (open && el.newStoryName) {
        el.newStoryName.focus();
        el.newStoryName.select();
    }
}

function populateStorySelect(defaultStories, userStories) {
    if (!el.viewStorySelect) return;
    el.viewStorySelect.innerHTML = '';
    for (const s of defaultStories) {
        const opt = document.createElement('option');
        opt.value = `default:${s.url}`;
        opt.textContent = s.label;
        el.viewStorySelect.appendChild(opt);
    }
    for (const s of userStories) {
        const opt = document.createElement('option');
        opt.value = `user:${s.id}`;
        opt.textContent = `${s.name}`;
        el.viewStorySelect.appendChild(opt);
    }
}

function ensureImportedSelectOption(filename = 'Imported Story') {
    if (!el.viewStorySelect) return;
    const existing = Array.from(el.viewStorySelect.options).find((o) => o.value === 'imported');
    if (existing) {
        existing.textContent = `Imported: ${filename}`;
        return;
    }
    const opt = document.createElement('option');
    opt.value = 'imported';
    opt.textContent = `Imported: ${filename}`;
    el.viewStorySelect.appendChild(opt);
}

async function fetchTemplateHtml(defaultStories) {
    const template = defaultStories.find((s) => /template\.html$/i.test(String(s?.url || ''))) || defaultStories[0];
    if (!template?.url) return null;
    try {
        const resp = await fetch(template.url);
        if (resp.ok) return await resp.text();
    } catch {
        return null;
    }
    return null;
}

function createStoryFromTemplate(templateHtml, storyName) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(templateHtml, 'text/html');
    const storyData = doc.querySelector('tw-storydata');
    if (!storyData) throw new Error('Template missing <tw-storydata>');
    storyData.setAttribute('name', storyName);
    storyData.setAttribute('ifid', genIfid());

    const passages = Array.from(storyData.querySelectorAll('tw-passagedata'));
    const titlePassage = passages.find((n) => String(n.getAttribute('name') || '').trim().toLowerCase() === 'storytitle');
    if (titlePassage) titlePassage.textContent = storyName;

    return `<!DOCTYPE html>\n${doc.documentElement.outerHTML}`;
}

function openPlayerWithSelection(selection, userStories) {
    if (selection === 'imported') {
        localStorage.setItem(PLAYER_START_SELECTION_KEY, JSON.stringify({ kind: 'imported' }));
        window.location.href = './player.html';
        return;
    }
    const [kind, value] = String(selection || '').split(':');
    if (kind === 'user') {
        const found = userStories.find((s) => s.id === value);
        if (!found) return;
        localStorage.setItem(PLAYER_START_SELECTION_KEY, JSON.stringify({ kind: 'user', id: found.id }));
    } else {
        localStorage.setItem(PLAYER_START_SELECTION_KEY, JSON.stringify({ kind: 'default', url: value || '' }));
    }
    window.location.href = './player.html';
}

async function main() {
    const manifestStories = await loadDefaultStoriesFromManifest();
    const defaultStories = manifestStories.length ? manifestStories : FALLBACK_DEFAULT_STORIES;
    let userStories = readUserStories();
    populateStorySelect(defaultStories, userStories);

    el.newStoryBtn?.addEventListener('click', () => setDialogOpen(true));
    el.newStoryCancelBtn?.addEventListener('click', () => setDialogOpen(false));

    el.newStoryCreateBtn?.addEventListener('click', async () => {
        const name = String(el.newStoryName?.value || '').trim();
        if (!name) return;
        const templateHtml = await fetchTemplateHtml(defaultStories);
        if (!templateHtml) return;
        const html = createStoryFromTemplate(templateHtml, name);
        const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        userStories = [...userStories, { id, name, html, createdAt: Date.now() }];
        writeUserStories(userStories);
        populateStorySelect(defaultStories, userStories);
        localStorage.setItem(EDITOR_BOOT_STORY_KEY, JSON.stringify({
            html,
            name: `${name}.html`,
        }));
        localStorage.setItem(PLAYER_START_SELECTION_KEY, JSON.stringify({ kind: 'user', id }));
        setDialogOpen(false);
        window.location.href = './visual-editor.html';
    });

    el.newStoryName?.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') setDialogOpen(false);
        if (event.key === 'Enter') el.newStoryCreateBtn?.click();
    });

    window.addEventListener('pointerdown', (event) => {
        if (el.newStoryDialog?.hidden) return;
        const t = event.target;
        if (!(t instanceof Element)) return;
        if (t.closest('#newStoryDialog') || t.closest('#newStoryBtn')) return;
        setDialogOpen(false);
    }, true);

    setDialogOpen(false);

    el.importStoryFile?.addEventListener('change', async () => {
        const file = el.importStoryFile.files?.[0];
        if (!file) return;
        try {
            const html = await file.text();
            localStorage.setItem(EDITED_STORY_STORAGE_KEY, JSON.stringify({
                html: String(html || ''),
                name: file.name || 'Imported Story.html',
            }));
            ensureImportedSelectOption(file.name || 'Imported Story');
            el.viewStorySelect.value = 'imported';
        } catch (err) {
            console.warn('[landing] failed to import story file', err);
        } finally {
            el.importStoryFile.value = '';
        }
    });

    el.importStoryBtn?.addEventListener('click', () => {
        el.importStoryFile?.click();
    });

    el.openPlayerBtn?.addEventListener('click', () => {
        const sel = String(el.viewStorySelect?.value || '');
        if (!sel) return;
        openPlayerWithSelection(sel, userStories);
    });
}

main();
