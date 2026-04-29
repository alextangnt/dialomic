/**
 * Shared passage text helpers used by player and visual editor.
 */

/**
 * Strip HTML markup into plain text.
 */
export function stripHtml(html) {
    if (!html) return '';
    const node = document.createElement('div');
    node.innerHTML = html;
    return (node.textContent || '').replace(/\r\n/g, '\n');
}

/**
 * Split HTML-ish passage text into paragraph-like chunks.
 * - `singleLineBreak`: treat every newline as a boundary.
 * - default: treat blank lines as boundaries.
 */
export function splitHtmlParagraphs(html, { singleLineBreak = false } = {}) {
    const normalized = String(html || '').replace(/\r\n/g, '\n');
    const asBreaks = singleLineBreak
        ? normalized.replace(/\n/g, '<br>')
        : normalized.replace(/\n\s*\n/g, '<br>');
    return asBreaks.split(/<br\s*\/?>/i);
}

/**
 * Format-aware paragraph splitter for passage editing.
 */
export function splitParagraphs(text, format) {
    if (format === 'twee') {
        // Twee authoring in this editor treats one newline as one block boundary.
        return String(text || '').split('\n').map((p) => p.trim()).filter(Boolean);
    }
    return splitHtmlParagraphs(text, { singleLineBreak: true });
}

/**
 * Build a lookup map for scene objects.
 * Supports arrays and keyed maps, with optional lowercase aliases.
 */
export function buildSceneObjectMap(objs, { includeLowercase = true } = {}) {
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
                    if (includeLowercase) map[String(key).toLowerCase()] = spec;
                } else {
                    const modelKey = (trimmed.split(/\s+/)[0] || '').toLowerCase();
                    if (modelKey) map[modelKey] = obj;
                }
            } else if (obj && typeof obj === 'object') {
                const key = (obj.id || obj.name || obj.model || `obj_${i}`);
                if (key) {
                    map[String(key)] = obj;
                    if (includeLowercase) map[String(key).toLowerCase()] = obj;
                }
            }
            map[`obj_${i}`] = obj;
        });
        return map;
    }
    if (typeof objs === 'object') {
        const map = { ...objs };
        if (includeLowercase) {
            for (const [k, v] of Object.entries(objs)) {
                if (!k) continue;
                map[String(k).toLowerCase()] = v;
            }
        }
        return map;
    }
    return {};
}

/**
 * Split out the hidden Dialomic tail (`%%%...`) from passage body.
 */
export function splitHiddenBody(sourceBody) {
    const source = String(sourceBody || '').replace(/\r\n/g, '\n');
    const idx = source.indexOf('%%%');
    if (idx < 0) return { visible: source, hidden: '' };
    return {
        visible: source.slice(0, idx).replace(/\s+$/, ''),
        hidden: source.slice(idx),
    };
}

/**
 * Re-compose visible body + hidden tail.
 */
export function composeBodyWithHidden(visibleBody, hiddenTail) {
    const visible = String(visibleBody || '').replace(/\r\n/g, '\n').trimEnd();
    const hidden = String(hiddenTail || '');
    if (!hidden) return visible;
    if (!visible) return hidden;
    return `${visible}\n${hidden.replace(/^\n+/, '')}`;
}

/**
 * Remove all `speaker:: ...` blocks for a given model key.
 */
export function removeSpeakerParagraphsForModel(body, format, modelKey) {
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
    return { body: kept.join('\n'), removed };
}
