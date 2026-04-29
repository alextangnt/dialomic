/*
 * Bridge script injected into SugarCube/Twine HTML.
 * It relays passage payloads to the parent player and accepts UI commands back.
 */

let allLinks = [];
let started = false;
let sessionId = null;

/**
 * Preserve explicit line breaks by converting text node newlines into <br>.
 */
function preserveWhitespaceInNode(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    const textNodes = [];
    while (walker.nextNode()) textNodes.push(walker.currentNode);

    for (const node of textNodes) {
        const text = node.nodeValue;
        if (!text) continue;
        const lines = text.split('\n');
        const frag = document.createDocumentFragment();
        for (let i = 0; i < lines.length; i += 1) {
            frag.appendChild(document.createTextNode(lines[i]));
            if (i < lines.length - 1) frag.appendChild(document.createElement('br'));
        }
        node.parentNode?.replaceChild(frag, node);
    }
}

/**
 * Build the payload consumed by the Dialomic player for the current passage.
 */
function buildPassagePayload(ev) {
    const psgName = String(ev?.passage?.name || '');
    const content = ev.detail.content.cloneNode(true);
    preserveWhitespaceInNode(content);
    const psgHtml = content.innerHTML;

    allLinks = Array.from(document.querySelectorAll('a.link-internal'));
    const links = allLinks.map((node) => node.innerHTML);

    const formRoot = content.querySelector('.passage') || content;
    const inputEl = formRoot.querySelector('input, textarea');
    const buttonEl = formRoot.querySelector('button');
    const formUI = {
        field: inputEl ? {
            tag: inputEl.tagName.toLowerCase(),
            type: inputEl.getAttribute('type') || 'text',
            value: inputEl.value || '',
            placeholder: inputEl.getAttribute('placeholder') || '',
            name: inputEl.getAttribute('name') || '',
            id: inputEl.getAttribute('id') || '',
        } : null,
        button: buttonEl ? {
            text: buttonEl.textContent || '',
            id: buttonEl.getAttribute('id') || '',
        } : null,
    };

    return { psgName, passage: psgHtml, links, formUI };
}

/**
 * Send passage payload to the parent frame (init once, then passage events).
 */
function postPassagePayload(payload) {
    const targetOrigin = window.location.origin === 'null' ? '*' : window.location.origin;
    if (!started) {
        parent.postMessage({ type: 'init', info: payload, sessionId }, targetOrigin);
        started = true;
        return;
    }
    parent.postMessage({ type: 'passage', info: payload, sessionId }, targetOrigin);
}

/**
 * Handle commands sent from the player.
 */
function handleViewerMessage(event) {
    const data = event.data || {};

    if (data.type === 'ping') {
        event.source?.postMessage({ type: 'pong', status: 'ready' }, event.origin);
        sessionId = data.sessionId || null;
        return;
    }

    if (data.type === 'start') {
        started = true;
        SugarCube.Engine.restart();
        return;
    }

    if (data.type === 'play') {
        SugarCube.Engine.play(data.passage);
        return;
    }

    if (data.type === 'click') {
        if (sessionId && data.sessionId && data.sessionId !== sessionId) return;
        const idx = Number(data.clicked);
        const link = Number.isFinite(idx) ? allLinks[idx] : null;
        if (link) link.click();
        return;
    }

    if (data.type === 'uiInput') {
        const root = document.querySelector('.passage') || document.body;
        const input = root.querySelector('input, textarea');
        if (input) input.value = String(data.value ?? '');
        return;
    }

    if (data.type === 'uiButton') {
        const root = document.querySelector('.passage') || document.body;
        const btn = root.querySelector('button');
        if (btn) btn.click();
    }
}

window.onload = () => {
    $(document).on(':passageend', (ev) => {
        const payload = buildPassagePayload(ev);
        postPassagePayload(payload);
    });

    window.addEventListener('message', handleViewerMessage);
};
