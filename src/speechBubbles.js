import * as THREE from 'three';

// Global debug toggle for projected speaker target circles.
export let SPEECH_BUBBLE_DEBUG_TARGET = false;
export function setSpeechBubbleDebugTarget(enabled) {
    SPEECH_BUBBLE_DEBUG_TARGET = Boolean(enabled);
}

export function stripLeadingHtmlWhitespace(html) {
    if (!html) return '';
    const container = document.createElement('div');
    container.innerHTML = html;

    while (container.firstChild) {
        const node = container.firstChild;
        if (node.nodeType === Node.ELEMENT_NODE && node.tagName === 'BR') {
            container.removeChild(node);
            continue;
        }
        if (node.nodeType === Node.TEXT_NODE) {
            const trimmed = node.nodeValue.replace(/^\s+/, '');
            if (trimmed.length === 0) {
                container.removeChild(node);
                continue;
            }
            node.nodeValue = trimmed;
        }
        break;
    }

    let htmlOut = container.innerHTML;
    htmlOut = htmlOut.replace(/^(?:\s|&nbsp;|&#160;)+/gi, '');
    htmlOut = htmlOut.replace(/^(?:<br\s*\/?>\s*)+/gi, '');
    return htmlOut;
}

export function getHtmlTextLength(html) {
    if (!html) return 0;
    const el = document.createElement('div');
    el.innerHTML = html;
    return (el.textContent || '').trim().length;
}

export class SpeechBubbleLayout {
    constructor(panel) {
        this.panel = panel;
        this.items = [];
        this.smooth = 0.18;
        this.minWidth = 140;
        this.maxWidth = 420;
        this.minTopSeparation = 8;
        this.tailPad = 18;
        this.lastCanvasSize = { width: 0, height: 0, left: 0, top: 0 };
        this.lastBoundsSig = '';
    }

    sync(elements, speakers) {
        const prevItems = this.items || [];
        const reused = new Set(elements);
        for (const prev of prevItems) {
            if (!prev?.debugTargetEl) continue;
            if (!reused.has(prev.el)) prev.debugTargetEl.remove();
        }
        this.items = elements.map((el, index) => {
            const existing = this.items[index];
            const canReuse = existing?.el === el;
            return {
                el,
                speaker: speakers?.[index]?.speaker || '',
                anchorNorm: canReuse ? (existing?.anchorNorm || null) : null,
                circleNorm: canReuse ? (existing?.circleNorm || null) : null,
                side: canReuse ? (existing?.side || null) : null,
                x: canReuse ? (existing?.x ?? null) : null,
                y: canReuse ? (existing?.y ?? null) : null,
                lift: canReuse ? (existing?.lift ?? 0) : 0,
                width: canReuse ? (existing?.width ?? null) : null,
                widthDirty: canReuse ? false : true,
                lastIsBelow: canReuse ? (existing?.lastIsBelow ?? null) : null,
                expandOnly: canReuse ? (existing?.expandOnly ?? false) : false,
                baseLeft: canReuse ? (existing?.baseLeft ?? null) : null,
                baseTop: canReuse ? (existing?.baseTop ?? null) : null,
                baseWidth: canReuse ? (existing?.baseWidth ?? null) : null,
                baseHeight: canReuse ? (existing?.baseHeight ?? null) : null,
                baseNormX: canReuse ? (existing?.baseNormX ?? null) : null,
                baseNormY: canReuse ? (existing?.baseNormY ?? null) : null,
                baseAnchorX: canReuse ? (existing?.baseAnchorX ?? null) : null,
                baseAnchorNormX: canReuse ? (existing?.baseAnchorNormX ?? null) : null,
                frozenOffsetX: canReuse ? (existing?.frozenOffsetX ?? null) : null,
                frozenOffsetY: canReuse ? (existing?.frozenOffsetY ?? null) : null,
                frozenNormX: canReuse ? (existing?.frozenNormX ?? null) : null,
                frozenNormY: canReuse ? (existing?.frozenNormY ?? null) : null,
                frozenAnchorNormX: canReuse ? (existing?.frozenAnchorNormX ?? null) : null,
                frozenAnchorNormY: canReuse ? (existing?.frozenAnchorNormY ?? null) : null,
                frozenIsBelow: canReuse ? (existing?.frozenIsBelow ?? null) : null,
                frozenTailStyle: canReuse ? (existing?.frozenTailStyle ?? null) : null,
                lastAnchorX: canReuse ? (existing?.lastAnchorX ?? null) : null,
                lastAnchorY: canReuse ? (existing?.lastAnchorY ?? null) : null,
                narrationSide: canReuse ? (existing?.narrationSide ?? null) : null,
                debugTargetEl: canReuse ? (existing?.debugTargetEl ?? null) : null,
            };
        });
    }

    shouldShowDebugTarget() {
        return Boolean(SPEECH_BUBBLE_DEBUG_TARGET);
    }

    ensureDebugTargetEl(item) {
        if (!item) return null;
        if (item.debugTargetEl?.isConnected) return item.debugTargetEl;
        const el = document.createElement('div');
        el.setAttribute('aria-hidden', 'true');
        el.style.position = 'fixed';
        el.style.pointerEvents = 'none';
        el.style.zIndex = '2147483647';
        el.style.border = '2px dashed rgba(255, 84, 84, 0.95)';
        el.style.background = 'rgba(255, 84, 84, 0.12)';
        el.style.borderRadius = '999px';
        el.style.boxSizing = 'border-box';
        el.style.display = 'none';
        document.body.appendChild(el);
        item.debugTargetEl = el;
        return el;
    }

    updateDebugTarget(item, cx, cy, r) {
        const marker = this.ensureDebugTargetEl(item);
        if (!marker) return;
        const canvasRect = this.panel?.canvas?.getBoundingClientRect?.();
        const panelVisible = Boolean(
            this.panel?.onScreen &&
            this.panel?.canvas &&
            this.panel.canvas.style.display !== 'none' &&
            canvasRect &&
            canvasRect.width > 0 &&
            canvasRect.height > 0 &&
            canvasRect.right > 0 &&
            canvasRect.bottom > 0 &&
            canvasRect.left < window.innerWidth &&
            canvasRect.top < window.innerHeight
        );
        if (
            !this.shouldShowDebugTarget() ||
            !panelVisible ||
            !Number.isFinite(cx) ||
            !Number.isFinite(cy) ||
            !Number.isFinite(r) ||
            r <= 0
        ) {
            marker.style.display = 'none';
            return;
        }
        const radius = Math.max(6, r);
        marker.style.display = 'block';
        // Keep debug marker just above this panel's speech layer.
        const layerBase = Number.isFinite(this.panel?.speechLayerBaseZ) ? this.panel.speechLayerBaseZ : 300;
        marker.style.zIndex = String(layerBase + 10);
        marker.style.left = `${cx - radius}px`;
        marker.style.top = `${cy - radius}px`;
        marker.style.width = `${radius * 2}px`;
        marker.style.height = `${radius * 2}px`;
    }

    getClosestTipOnCircle(centerX, centerY, radius, bubbleRect) {
        if (![centerX, centerY, radius].every((n) => Number.isFinite(n)) || radius <= 0) {
            return { x: centerX, y: centerY };
        }
        const base = this.getTailBaseCenterWorld(bubbleRect, centerX, centerY);
        let dx = base.x - centerX;
        let dy = base.y - centerY;
        const len = Math.hypot(dx, dy);
        if (len < 0.001) {
            dx = 0;
            dy = -1;
        } else {
            dx /= len;
            dy /= len;
        }
        return {
            x: centerX + dx * radius,
            y: centerY + dy * radius,
        };
    }

    getSpeakerRadius(speakerRect, fallback = 10) {
        if (!speakerRect) return fallback;
        const w = speakerRect.right - speakerRect.left;
        const h = speakerRect.bottom - speakerRect.top;
        // Radius from average of horizontal and vertical screen dimensions.
        return Math.max(6, (w + h) * 0.25);
    }

    freezeForPanelExit() {
        const canvasRect = this.panel.canvas.getBoundingClientRect();
        for (const item of this.items) {
            if (!item?.el) continue;
            const rect = item.el.getBoundingClientRect();
            const x = Number.isFinite(item.x) ? item.x : rect.left;
            const y = Number.isFinite(item.y) ? item.y : rect.top;
            item.frozenOffsetX = x - canvasRect.left;
            item.frozenOffsetY = y - canvasRect.top;
            item.frozenNormX = canvasRect.width > 0 ? item.frozenOffsetX / canvasRect.width : null;
            item.frozenNormY = canvasRect.height > 0 ? item.frozenOffsetY / canvasRect.height : null;
            const anchorX = Number.isFinite(item.lastAnchorX) ? item.lastAnchorX : (canvasRect.left + canvasRect.width * 0.5);
            const anchorY = Number.isFinite(item.lastAnchorY) ? item.lastAnchorY : (canvasRect.top + canvasRect.height * 0.2);
            item.frozenAnchorNormX = canvasRect.width > 0 ? ((anchorX - canvasRect.left) / canvasRect.width) : null;
            item.frozenAnchorNormY = canvasRect.height > 0 ? ((anchorY - canvasRect.top) / canvasRect.height) : null;
            item.frozenIsBelow = Boolean(item.visualBelow);
            const tail = item.el.querySelector('.speech-tail');
            const tailBorder = item.el.querySelector('.speech-tail-border');
            item.frozenTailStyle = {
                tailCssText: tail?.style?.cssText || '',
                tailBorderCssText: tailBorder?.style?.cssText || '',
            };
        }
    }

    clearExitFreeze() {
        for (const item of this.items) {
            if (!item) continue;
            item.frozenOffsetX = null;
            item.frozenOffsetY = null;
            item.frozenNormX = null;
            item.frozenNormY = null;
            item.frozenAnchorNormX = null;
            item.frozenAnchorNormY = null;
            item.frozenIsBelow = null;
            item.frozenTailStyle = null;
        }
    }

    getSpeakerRect(speakerKey, canvasRect, yOffset = 0) {
        if (!speakerKey) return null;
        const bounds = this.panel.three?.getModelBoundsByKey(speakerKey);
        if (!bounds) return null;
        const logicalW = Math.max(1, this.panel.canvas?.clientWidth || this.panel.data?.width || canvasRect.width || 1);
        const logicalH = Math.max(1, this.panel.canvas?.clientHeight || this.panel.data?.height || canvasRect.height || 1);
        const sx = canvasRect.width / logicalW;
        const sy = canvasRect.height / logicalH;
        const box = bounds.box;
        const corners = [
            new THREE.Vector3(box.min.x, box.min.y + yOffset, box.min.z),
            new THREE.Vector3(box.min.x, box.min.y + yOffset, box.max.z),
            new THREE.Vector3(box.min.x, box.max.y + yOffset, box.min.z),
            new THREE.Vector3(box.min.x, box.max.y + yOffset, box.max.z),
            new THREE.Vector3(box.max.x, box.min.y + yOffset, box.min.z),
            new THREE.Vector3(box.max.x, box.min.y + yOffset, box.max.z),
            new THREE.Vector3(box.max.x, box.max.y + yOffset, box.min.z),
            new THREE.Vector3(box.max.x, box.max.y + yOffset, box.max.z),
        ];
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        for (const c of corners) {
            const s = this.panel.three.worldToScreen(c);
            const x = canvasRect.left + s.x * sx;
            const y = canvasRect.top + s.y * sy;
            minX = Math.min(minX, x);
            maxX = Math.max(maxX, x);
            minY = Math.min(minY, y);
            maxY = Math.max(maxY, y);
        }
        if (!Number.isFinite(minX)) return null;
        return { left: minX, top: minY, right: maxX, bottom: maxY };
    }

    rectIntersectsCircle(rect, circle) {
        if (!circle) return false;
        const cx = circle.cx;
        const cy = circle.cy;
        const radius = circle.r;
        const closestX = Math.max(rect.left, Math.min(cx, rect.right));
        const closestY = Math.max(rect.top, Math.min(cy, rect.bottom));
        const dx = cx - closestX;
        const dy = cy - closestY;
        return dx * dx + dy * dy <= radius * radius;
    }

    getSpeakerCircle(item, speakerRect, canvasRect) {
        const scale = Math.min(canvasRect.width, canvasRect.height);
        if (speakerRect) {
            const cx = (speakerRect.left + speakerRect.right) / 2;
            const cy = (speakerRect.top + speakerRect.bottom) / 2;
            const radius = Math.max(1, Math.min(speakerRect.right - speakerRect.left, speakerRect.bottom - speakerRect.top) / 2);
            const target = {
                x: (cx - canvasRect.left) / canvasRect.width,
                y: (cy - canvasRect.top) / canvasRect.height,
                r: radius / scale,
            };
            if (!item.circleNorm) {
                item.circleNorm = target;
            } else {
                const follow = 0.2;
                item.circleNorm = {
                    x: item.circleNorm.x + (target.x - item.circleNorm.x) * follow,
                    y: item.circleNorm.y + (target.y - item.circleNorm.y) * follow,
                    r: item.circleNorm.r + (target.r - item.circleNorm.r) * follow,
                };
            }
        }
        if (!item.circleNorm) return null;
        return {
            cx: canvasRect.left + item.circleNorm.x * canvasRect.width,
            cy: canvasRect.top + item.circleNorm.y * canvasRect.height,
            r: Math.max(1, item.circleNorm.r * scale),
        };
    }

    getImmediateSpeakerCircle(speakerRect) {
        if (!speakerRect) return null;
        const cx = (speakerRect.left + speakerRect.right) / 2;
        const cy = (speakerRect.top + speakerRect.bottom) / 2;
        const r = Math.max(1, Math.min(speakerRect.right - speakerRect.left, speakerRect.bottom - speakerRect.top) / 2);
        return { cx, cy, r };
    }

    getLiveModelScreenAnchor(speakerKey, canvasRect, speakerRect = null) {
        if (!speakerKey) return null;
        const three = this.panel?.three;
        const model = three?.getModelByKey?.(speakerKey);
        if (!model || !three?.worldToScreen) return null;
        model.updateMatrixWorld?.(true);
        const bounds = three.getModelBoundsByKey?.(speakerKey);
        const world = new THREE.Vector3();
        if (bounds?.center?.isVector3) {
            world.copy(bounds.center);
        } else {
            model.getWorldPosition(world);
        }
        // Always project from the current active viewport camera.
        const screen = three.worldToScreen(world);
        let x = canvasRect.left + screen.x;
        let y = canvasRect.top + screen.y;
        if (speakerRect) {
            const centerX = (speakerRect.left + speakerRect.right) / 2;
            const centerY = (speakerRect.top + speakerRect.bottom) / 2;
            if (!Number.isFinite(x)) x = centerX;
            if (!Number.isFinite(y)) y = centerY;
        }
        if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
        return { x, y };
    }

    applyTriangleTail(el, bubbleLeft, bubbleTop, bubbleWidth, bubbleHeight, anchorX, anchorY, canvasRect = null, opts = {}) {
        if (!el) return;
        const tail = el.querySelector('.speech-tail');
        const tailBorder = el.querySelector('.speech-tail-border');
        if (!tail || !tailBorder) return;

        const clampX = opts?.clampX !== false;
        const clampY = opts?.clampY !== false;
        const minX = (canvasRect && clampX) ? (canvasRect.left + 4) : Number.NEGATIVE_INFINITY;
        const maxX = (canvasRect && clampX) ? (canvasRect.right - 4) : Number.POSITIVE_INFINITY;
        const minY = (canvasRect && clampY) ? (canvasRect.top + 4) : Number.NEGATIVE_INFINITY;
        const maxY = (canvasRect && clampY) ? (canvasRect.bottom - 4) : Number.POSITIVE_INFINITY;
        const tipX = Math.max(minX, Math.min(maxX, anchorX));
        const tipY = Math.max(minY, Math.min(maxY, anchorY));

        const bubbleRect = {
            left: bubbleLeft,
            top: bubbleTop,
            right: bubbleLeft + bubbleWidth,
            bottom: bubbleTop + bubbleHeight,
        };
        const baseWorld = this.getTailBaseCenterWorld(bubbleRect, tipX, tipY);
        let vx = tipX - baseWorld.x;
        let vy = tipY - baseWorld.y;
        let len = Math.hypot(vx, vy);
        if (!Number.isFinite(len) || len < 0.001) {
            vx = 0;
            vy = 1;
            len = 1;
        }
        const ux = vx / len;
        const uy = vy / len;
        const px = -uy;
        const py = ux;
        const baseHalf = Math.max(8, Math.min(16, Math.min(bubbleWidth, bubbleHeight) * 0.14));
        const stroke = 1.5;

        const toLocal = (x, y) => ({ x: x - bubbleLeft, y: y - bubbleTop });
        const baseCenter = toLocal(baseWorld.x, baseWorld.y);
        const tip = toLocal(tipX, tipY);
        const p1 = { x: baseCenter.x + px * baseHalf, y: baseCenter.y + py * baseHalf };
        const p2 = { x: baseCenter.x - px * baseHalf, y: baseCenter.y - py * baseHalf };
        const p1b = { x: baseCenter.x + px * (baseHalf + stroke), y: baseCenter.y + py * (baseHalf + stroke) };
        const p2b = { x: baseCenter.x - px * (baseHalf + stroke), y: baseCenter.y - py * (baseHalf + stroke) };
        const tipb = { x: tip.x + ux * stroke, y: tip.y + uy * stroke };

        const applyPoly = (node, a, b, c, color) => {
            const minPx = Math.min(a.x, b.x, c.x);
            const maxPx = Math.max(a.x, b.x, c.x);
            const minPy = Math.min(a.y, b.y, c.y);
            const maxPy = Math.max(a.y, b.y, c.y);
            const w = Math.max(1, maxPx - minPx);
            const h = Math.max(1, maxPy - minPy);
            const ax = ((a.x - minPx) / w) * 100;
            const ay = ((a.y - minPy) / h) * 100;
            const bx = ((b.x - minPx) / w) * 100;
            const by = ((b.y - minPy) / h) * 100;
            const cxp = ((c.x - minPx) / w) * 100;
            const cyp = ((c.y - minPy) / h) * 100;
            node.style.left = `${minPx}px`;
            node.style.top = `${minPy}px`;
            node.style.width = `${w}px`;
            node.style.height = `${h}px`;
            node.style.clipPath = `polygon(${ax}% ${ay}%, ${bx}% ${by}%, ${cxp}% ${cyp}%)`;
            node.style.background = color;
            node.style.border = '0';
            node.style.borderTop = '0';
            node.style.borderBottom = '0';
            node.style.borderLeft = '0';
            node.style.borderRight = '0';
            node.style.borderRadius = '0';
            node.style.transform = 'none';
        };

        // Layer order inside bubble:
        // 1 underlay tail (black), 2 rounded bubble body, 3 overlay tail (white), 4 text.
        tailBorder.style.zIndex = '1';
        tail.style.zIndex = '3';
        applyPoly(tailBorder, p1b, p2b, tipb, '#000');
        applyPoly(tail, p1, p2, tip, '#fff');
    }

    getTailBaseCenterWorld(bubbleRect, tipX, tipY) {
        const width = Math.max(1, bubbleRect.right - bubbleRect.left);
        const height = Math.max(1, bubbleRect.bottom - bubbleRect.top);
        const cx = bubbleRect.left + width * 0.5;
        const cy = bubbleRect.top + height * 0.5;
        const minEdgeDist = Math.min(width * 0.5, height * 0.5);
        let x = cx;
        let y = cy;
        if (width >= height) {
            const minX = bubbleRect.left + minEdgeDist;
            const maxX = bubbleRect.right - minEdgeDist;
            x = Math.max(minX, Math.min(maxX, tipX));
        } else {
            const minY = bubbleRect.top + minEdgeDist;
            const maxY = bubbleRect.bottom - minEdgeDist;
            y = Math.max(minY, Math.min(maxY, tipY));
        }
        return { x, y };
    }

    segmentsIntersect(a, b, c, d) {
        const eps = 1e-6;
        const orient = (p, q, r) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
        const onSeg = (p, q, r) =>
            q.x + eps >= Math.min(p.x, r.x) &&
            q.x - eps <= Math.max(p.x, r.x) &&
            q.y + eps >= Math.min(p.y, r.y) &&
            q.y - eps <= Math.max(p.y, r.y);
        const o1 = orient(a, b, c);
        const o2 = orient(a, b, d);
        const o3 = orient(c, d, a);
        const o4 = orient(c, d, b);
        if (((o1 > eps && o2 < -eps) || (o1 < -eps && o2 > eps)) &&
            ((o3 > eps && o4 < -eps) || (o3 < -eps && o4 > eps))) return true;
        if (Math.abs(o1) <= eps && onSeg(a, c, b)) return true;
        if (Math.abs(o2) <= eps && onSeg(a, d, b)) return true;
        if (Math.abs(o3) <= eps && onSeg(c, a, d)) return true;
        if (Math.abs(o4) <= eps && onSeg(c, b, d)) return true;
        return false;
    }

    getTailTipWithAvoidance(anchorX, anchorY, speakerRect, speakerCircle, bubbleRect, boundsRect, usedTailSegments, speakerKey = '') {
        const defaultTip = { x: anchorX, y: anchorY };
        if (boundsRect) {
            defaultTip.x = Math.max(boundsRect.left, Math.min(boundsRect.right, defaultTip.x));
            defaultTip.y = Math.max(boundsRect.top, Math.min(boundsRect.bottom, defaultTip.y));
        }

        const candidates = [defaultTip];
        if (speakerCircle) {
            const bubbleCx = (bubbleRect.left + bubbleRect.right) / 2;
            const bubbleCy = (bubbleRect.top + bubbleRect.bottom) / 2;
            const baseAngle = Math.atan2(bubbleCy - speakerCircle.cy, bubbleCx - speakerCircle.cx);
            const offsets = [0, 0.25, -0.25, 0.5, -0.5, 0.9, -0.9, 1.3, -1.3];
            for (const off of offsets) {
                let x = speakerCircle.cx + Math.cos(baseAngle + off) * speakerCircle.r;
                let y = speakerCircle.cy + Math.sin(baseAngle + off) * speakerCircle.r;
                if (boundsRect) {
                    x = Math.max(boundsRect.left, Math.min(boundsRect.right, x));
                    y = Math.max(boundsRect.top, Math.min(boundsRect.bottom, y));
                }
                candidates.push({ x, y, offCost: Math.abs(off) * 10 });
            }
        } else if (speakerRect) {
            const cx = (speakerRect.left + speakerRect.right) / 2;
            const cy = (speakerRect.top + speakerRect.bottom) / 2;
            const r = Math.max(1, Math.min(speakerRect.right - speakerRect.left, speakerRect.bottom - speakerRect.top) / 2);
            const bubbleCx = (bubbleRect.left + bubbleRect.right) / 2;
            const bubbleCy = (bubbleRect.top + bubbleRect.bottom) / 2;
            const baseAngle = Math.atan2(bubbleCy - cy, bubbleCx - cx);
            let x = cx + Math.cos(baseAngle) * r;
            let y = cy + Math.sin(baseAngle) * r;
            if (boundsRect) {
                x = Math.max(boundsRect.left, Math.min(boundsRect.right, x));
                y = Math.max(boundsRect.top, Math.min(boundsRect.bottom, y));
            }
            candidates.push({ x, y, offCost: 2 });
        }

        let best = candidates[0];
        let bestScore = Number.POSITIVE_INFINITY;
        for (const tip of candidates) {
            const base = this.getTailBaseCenterWorld(bubbleRect, tip.x, tip.y);
            let score = (tip.offCost || 0) + Math.hypot(tip.x - defaultTip.x, tip.y - defaultTip.y) * 0.08;
            for (const seg of usedTailSegments || []) {
                if (speakerKey && seg?.speakerKey && seg.speakerKey === speakerKey) continue;
                if (this.segmentsIntersect(base, tip, seg.from, seg.to)) score += 1500;
            }
            if (score < bestScore) {
                bestScore = score;
                best = { x: tip.x, y: tip.y, baseX: base.x, baseY: base.y };
            }
        }
        return best;
    }

    layout() {
        if (!this.items.length) return;
        const canvasRect = this.panel.canvas.getBoundingClientRect();
        const prevCanvasLeft = this.lastCanvasSize.left;
        const prevCanvasTop = this.lastCanvasSize.top;
        const moved = canvasRect.left !== prevCanvasLeft || canvasRect.top !== prevCanvasTop;
        if (this.panel.isAnimatingOut) {
            for (const item of this.items) {
                const el = item?.el;
                if (!el) continue;
                if (!Number.isFinite(item.frozenOffsetX) || !Number.isFinite(item.frozenOffsetY)) {
                    const rect = el.getBoundingClientRect();
                    item.frozenOffsetX = rect.left - canvasRect.left;
                    item.frozenOffsetY = rect.top - canvasRect.top;
                    item.frozenNormX = canvasRect.width > 0 ? item.frozenOffsetX / canvasRect.width : null;
                    item.frozenNormY = canvasRect.height > 0 ? item.frozenOffsetY / canvasRect.height : null;
                }
                const x = Number.isFinite(item.frozenNormX)
                    ? (canvasRect.left + item.frozenNormX * canvasRect.width)
                    : (canvasRect.left + item.frozenOffsetX);
                const y = Number.isFinite(item.frozenNormY)
                    ? (canvasRect.top + item.frozenNormY * canvasRect.height)
                    : (canvasRect.top + item.frozenOffsetY);
                item.x = x;
                item.y = y;
                el.style.left = `${x}px`;
                el.style.top = `${y}px`;
                const tail = el.querySelector('.speech-tail');
                const tailBorder = el.querySelector('.speech-tail-border');
                const s = item.frozenTailStyle;
                if (tail && tailBorder && Number.isFinite(item.frozenAnchorNormX) && Number.isFinite(item.frozenAnchorNormY)) {
                    const rect = el.getBoundingClientRect();
                    const localWidth = el.offsetWidth || rect.width;
                    const localHeight = el.offsetHeight || rect.height;
                    const anchorX = canvasRect.left + (item.frozenAnchorNormX * canvasRect.width);
                    const anchorY = canvasRect.top + (item.frozenAnchorNormY * canvasRect.height);
                    this.applyTriangleTail(el, item.x, item.y, localWidth, localHeight, anchorX, anchorY, canvasRect);
                } else if (s && tail && tailBorder) {
                    tail.style.cssText = s.tailCssText || '';
                    tailBorder.style.cssText = s.tailBorderCssText || '';
                }
            }
            return;
        }
        const resized = canvasRect.width !== this.lastCanvasSize.width ||
            canvasRect.height !== this.lastCanvasSize.height;
        if (moved && !resized) {
            const dx = canvasRect.left - prevCanvasLeft;
            const dy = canvasRect.top - prevCanvasTop;
            for (const item of this.items) {
                if (!item) continue;
                if (Number.isFinite(item.baseLeft)) item.baseLeft += dx;
                if (Number.isFinite(item.baseTop)) item.baseTop += dy;
                if (Number.isFinite(item.x)) item.x += dx;
                if (Number.isFinite(item.y)) item.y += dy;
            }
        }
        this.lastCanvasSize.width = canvasRect.width;
        this.lastCanvasSize.height = canvasRect.height;
        this.lastCanvasSize.left = canvasRect.left;
        this.lastCanvasSize.top = canvasRect.top;
        const speechBounds = this.panel.speechBounds || null;
        const boundsSig = speechBounds
            ? [
                Math.round(Number(speechBounds.left) || 0),
                Math.round(Number(speechBounds.top) || 0),
                Math.round(Number(speechBounds.right) || 0),
                Math.round(Number(speechBounds.bottom) || 0),
            ].join('|')
            : 'none';
        const boundsChanged = boundsSig !== this.lastBoundsSig;
        this.lastBoundsSig = boundsSig;
        // Keep a stable base layout; recompute only on meaningful geometry changes.
        // Pure per-frame translation while panel animates is handled by shifting cached coordinates above.
        const recomputeLayout =
            resized ||
            boundsChanged ||
            this.items.some((item) => item.baseLeft == null || item.baseTop == null || item.widthDirty);
        const leftBound = Math.max(
            0,
            Number.isFinite(speechBounds?.left) ? (speechBounds.left + 8) : (canvasRect.left + 8)
        );
        const rightBound = Math.max(
            leftBound + 24,
            Math.min(
                window.innerWidth,
                Number.isFinite(speechBounds?.right) ? (speechBounds.right - 8) : (canvasRect.right - 8)
            )
        );
        const topBound = Math.max(
            0,
            Number.isFinite(speechBounds?.top) ? (speechBounds.top + 8) : (canvasRect.top + 8)
        );
        const linkList = document.getElementById('link-list');
        const linkRect = linkList ? linkList.getBoundingClientRect() : null;
        const choiceTop = linkRect ? (linkRect.top - 8) : null;
        let bottomBound = Math.min(
            window.innerHeight,
            Number.isFinite(speechBounds?.bottom) ? (speechBounds.bottom - 8) : (canvasRect.bottom - 8)
        );
        if (choiceTop != null) bottomBound = Math.min(bottomBound, choiceTop - 8);
        bottomBound = Math.max(topBound + 24, bottomBound);
        const softBottomBound = bottomBound + 24;
        const hardLeftBound = 6;
        const hardRightBound = Math.max(hardLeftBound + 24, window.innerWidth - 6);
        const hardTopBound = 6;
        const hardBottomBound = this.panel?.editorEnabled
            ? Math.max(hardTopBound + 24, window.innerHeight - 6)
            : Math.max(hardTopBound + 24, (choiceTop != null ? (choiceTop - 8) : (window.innerHeight - 8)) + 24);
        const narrationRect = this.panel.narrationEl.getBoundingClientRect();
        const maxWidth = Math.min(this.maxWidth, rightBound - leftBound);
        const placed = [];
        const committedRects = [];
        const tailSegments = [];
        const rectsOverlap = (a, b) =>
            a.right > b.left && a.left < b.right &&
            a.bottom > b.top && a.top < b.bottom;
        const overlapsPlaced = (rect, allowNonBlocking = false) => placed.some((r) => (allowNonBlocking ? r.block !== false : true) &&
            rect.right > r.left && rect.left < r.right &&
            rect.bottom > r.top && rect.top < r.bottom);
        const speakerCircles = [];
        const seenSpeakers = new Set();
        const speakerKeys = new Set();
        if (this.panel?.three?.modelByKey && typeof this.panel.three.modelByKey.keys === 'function') {
            for (const k of this.panel.three.modelByKey.keys()) {
                if (k) speakerKeys.add(String(k));
            }
        }
        for (const item of this.items) {
            const k = String(item.speaker || '').trim();
            if (k) speakerKeys.add(k);
        }
        for (const key of speakerKeys) {
            if (!key || seenSpeakers.has(key)) continue;
            const model = this.panel.three?.getModelByKey(key);
            const hopDelta = model && Number.isFinite(model.userData?.baseY)
                ? model.position.y - model.userData.baseY
                : 0;
            const rect = this.getSpeakerRect(key, canvasRect, -hopDelta);
            if (!rect) continue;
            const cx = (rect.left + rect.right) / 2;
            const cy = (rect.top + rect.bottom) / 2;
            const radius = Math.max(1, Math.min(rect.right - rect.left, rect.bottom - rect.top) / 2);
            speakerCircles.push({ cx, cy, r: radius });
            seenSpeakers.add(key);
        }
        const overlapsAnySpeaker = (rect) => speakerCircles.some((circle) => this.rectIntersectsCircle(rect, circle));
        const ownId = String(this.panel.id);
        const blockedRects = [];
        // Narration is the only global blocker. Bubble bodies may exceed their own panel
        // within slot bounds, as long as they avoid narration regions.
        document.querySelectorAll('.panel-narration-bg[data-panel-id]').forEach((el) => {
            if (el.style?.display === 'none') return;
            const pid = String(el.dataset.panelId || '');
            if (!pid || pid === ownId) return;
            const r = el.getBoundingClientRect();
            if (r.width <= 0 || r.height <= 0) return;
            blockedRects.push({ left: r.left, top: r.top, right: r.right, bottom: r.bottom });
        });

        const bubbles = [];
        const speakerLineOrder = new Map();
        for (let idx = 0; idx < this.items.length; idx++) {
            const item = this.items[idx];
            const el = item.el;
            if (!el) continue;
            const allowWidthChange = resized || item.widthDirty || item.width == null;
            el.style.maxWidth = `${maxWidth}px`;
            if (allowWidthChange) {
                el.style.width = 'fit-content';
                const natural = el.getBoundingClientRect().width;
                item.width = Math.max(this.minWidth, Math.min(maxWidth, natural));
                item.widthDirty = false;
                item.expandOnly = false;
            } else if (!Number.isFinite(item.width)) {
                const natural = el.getBoundingClientRect().width;
                item.width = Math.max(this.minWidth, Math.min(maxWidth, natural));
            }
            el.style.width = `${item.width}px`;
            el.style.maxWidth = `${item.width}px`;
            let rect = el.getBoundingClientRect();

            const speakerKey = String(item.speaker || '').trim();
            const lineOrder = speakerKey
                ? (speakerLineOrder.get(speakerKey) || 0)
                : 0;
            if (speakerKey) speakerLineOrder.set(speakerKey, lineOrder + 1);
            const speakerModel = speakerKey ? this.panel.three?.getModelByKey(speakerKey) : null;
            const activeIndex = this.panel.three?.speakerAnim?.index ?? -1;
            const isActiveLine = activeIndex === idx;
            const isSpeaking = Boolean(speakerModel?.userData?.speaking) && isActiveLine;
            const hopDelta = speakerModel && Number.isFinite(speakerModel.userData?.baseY) && !this.panel?.editorEnabled
                ? speakerModel.position.y - speakerModel.userData.baseY
                : 0;
            const speakerRect = this.getSpeakerRect(speakerKey, canvasRect, -hopDelta);
            const speakerOffscreen = speakerRect
                ? (speakerRect.right < leftBound ||
                    speakerRect.left > rightBound ||
                    speakerRect.bottom < topBound ||
                    speakerRect.top > bottomBound)
                : false;
            const canvasCenterX = (canvasRect.left + canvasRect.right) / 2;
            let anchorX = canvasCenterX;
            let anchorY = canvasRect.top + canvasRect.height * 0.2;
            let anchorXLive = null;
            let anchorYLive = null;
            if (speakerRect) {
                const targetAnchorX = (speakerRect.left + speakerRect.right) / 2;
                const targetAnchorY = speakerRect.top;
                if (this.panel?.editorEnabled) {
                    item.anchorNorm = null;
                    anchorXLive = targetAnchorX;
                    anchorYLive = targetAnchorY;
                } else if (!item.anchorNorm) {
                    item.anchorNorm = {
                        x: (targetAnchorX - canvasRect.left) / canvasRect.width,
                        y: (targetAnchorY - canvasRect.top) / canvasRect.height,
                    };
                    anchorXLive = targetAnchorX;
                    anchorYLive = targetAnchorY;
                } else {
                    anchorXLive = targetAnchorX;
                    anchorYLive = targetAnchorY;
                }
            }
            if (!this.panel?.editorEnabled && item.anchorNorm) {
                anchorX = canvasRect.left + item.anchorNorm.x * canvasRect.width;
                anchorY = canvasRect.top + item.anchorNorm.y * canvasRect.height;
            }
            if (speakerOffscreen && speakerRect) {
                const centerX = (speakerRect.left + speakerRect.right) / 2;
                const centerY = (speakerRect.top + speakerRect.bottom) / 2;
                anchorXLive = Math.max(leftBound, Math.min(rightBound, centerX));
                anchorYLive = Math.max(topBound, Math.min(bottomBound, centerY));
                anchorX = anchorXLive;
                anchorY = anchorYLive;
            }
            item.lastAnchorX = anchorXLive ?? anchorX;
            item.lastAnchorY = anchorYLive ?? anchorY;
            const speakerCircle = speakerOffscreen
                ? null
                : (this.panel?.editorEnabled
                    ? this.getImmediateSpeakerCircle(speakerRect)
                    : this.getSpeakerCircle(item, speakerRect, canvasRect));
            const speakerMidY = speakerCircle
                ? speakerCircle.cy
                : (speakerRect ? (speakerRect.top + speakerRect.bottom) / 2 : anchorY);
            const prefX = Math.max(leftBound, Math.min(rightBound - rect.width, anchorX - rect.width / 2));
            const prefAbove = anchorY - rect.height - this.tailPad;
            const prefBelow = anchorY + this.tailPad;
            const sameSpeakerOffset = lineOrder * Math.max(10, rect.height * 0.42);
            const prefY = Math.max(topBound, Math.min(softBottomBound - rect.height, prefAbove + sameSpeakerOffset));
            const startY = speakerCircle
                ? (this.rectIntersectsCircle({ left: prefX, top: prefY, right: prefX + rect.width, bottom: prefY + rect.height }, speakerCircle)
                    ? Math.max(topBound, Math.min(softBottomBound - rect.height, prefBelow))
                    : prefY)
                : prefY;
            const useBaseLayout = !recomputeLayout && (
                (item.baseNormX != null && item.baseNormY != null) ||
                (item.baseLeft != null && item.baseTop != null)
            );
            const baseX = useBaseLayout
                ? (item.baseNormX != null ? (canvasRect.left + item.baseNormX * canvasRect.width) : item.baseLeft)
                : prefX;
            const baseY = useBaseLayout
                ? (item.baseNormY != null ? (canvasRect.top + item.baseNormY * canvasRect.height) : item.baseTop)
                : startY;
            bubbles.push({
                idx,
                item,
                el,
                rect,
                w: rect.width,
                h: rect.height,
                x: baseX,
                y: baseY,
                prefX,
                prefY: startY,
                speakerCircle,
                speakerRect,
                speakerMidY,
                speakerKey,
                lineOrder,
                isSpeaking,
                anchorX,
                anchorY,
                anchorXLive,
                anchorYLive,
                useBaseLayout,
            });
        }

        const narrationVisible = this.panel.narrationEl?.style?.display !== 'none' && narrationRect.height > 0;
        const collidesNarration = (b) => {
            if (!narrationVisible) return false;
            const r = { left: b.x, top: b.y, right: b.x + b.w, bottom: b.y + b.h };
            const eps = 1; // avoid sub-pixel "touching" jitter against narration
            return (
                r.right > narrationRect.left + eps &&
                r.left < narrationRect.right - eps &&
                r.bottom > narrationRect.top + eps &&
                r.top < narrationRect.bottom - eps
            );
        };
        const resolveNarrationOverlap = (item, x, y, w, h) => {
            if (!narrationVisible) return { x, y, side: item?.narrationSide || null };
            const rect = { left: x, top: y, right: x + w, bottom: y + h };
            if (!rectsOverlap(rect, narrationRect)) return { x, y, side: item?.narrationSide || null };
            const pad = 8;
            const candidates = [];
            const addCandidate = (side, nx, ny) => {
                const cx = Math.max(hardLeftBound, Math.min(hardRightBound - w, nx));
                const cy = Math.max(hardTopBound, Math.min(hardBottomBound - h, ny));
                const r = { left: cx, top: cy, right: cx + w, bottom: cy + h };
                if (rectsOverlap(r, narrationRect)) return;
                const score = Math.hypot(cx - x, cy - y);
                candidates.push({ side, x: cx, y: cy, score });
            };
            // Side placement first to reduce vertical jitter.
            addCandidate('left', narrationRect.left - w - pad, y);
            addCandidate('right', narrationRect.right + pad, y);
            addCandidate('top', x, narrationRect.top - h - pad);
            addCandidate('bottom', x, narrationRect.bottom + pad);
            if (!candidates.length) return { x, y, side: item?.narrationSide || null };
            candidates.sort((a, b) => a.score - b.score);
            if (item) item.narrationSide = candidates[0].side;
            return { x: candidates[0].x, y: candidates[0].y, side: candidates[0].side };
        };
        const collidesBlocked = (b) => {
            const r = { left: b.x, top: b.y, right: b.x + b.w, bottom: b.y + b.h };
            return blockedRects.find((blk) => rectsOverlap(r, blk)) || null;
        };
        const enforceSpeakerOrder = (list) => {
            const bySpeaker = new Map();
            for (const b of list) {
                const key = String(b.speakerKey || '').trim();
                if (!key) continue;
                if (!bySpeaker.has(key)) bySpeaker.set(key, []);
                bySpeaker.get(key).push(b);
            }
            for (const arr of bySpeaker.values()) {
                arr.sort((a, b) => (a.lineOrder || 0) - (b.lineOrder || 0));
                for (let i = 1; i < arr.length; i++) {
                    const prev = arr[i - 1];
                    const cur = arr[i];
                    const minTop = prev.y + Math.max(6, prev.h * 0.16);
                    if (cur.y < minTop) {
                        cur.y = minTop;
                    }
                }
            }
        };
        const clampBubble = (b) => {
            b.x = Math.max(hardLeftBound, Math.min(hardRightBound - b.w, b.x));
            b.y = Math.max(hardTopBound, Math.min(hardBottomBound - b.h, b.y));
        };
        const verticalDeadzone = 1.25;

        // In visual editor mode, keep bubbles anchored over speaker heads with a
        // simple deterministic layout (no free-form physics wandering).
        if (this.panel?.editorEnabled) {
            const editorStacks = new Map();
            for (const b of bubbles) {
                const stackKey = b.speakerKey || `__bubble_${b.idx}`;
                if (!editorStacks.has(stackKey)) editorStacks.set(stackKey, []);
                editorStacks.get(stackKey).push(b);
            }
            for (const arr of editorStacks.values()) {
                arr.sort((a, b) => (a.lineOrder || 0) - (b.lineOrder || 0));
                let total = 0;
                const offsetByIdx = new Map();
                for (let i = 0; i < arr.length; i++) {
                    const h = arr[i]?.rect?.height || arr[i]?.h || 0;
                    offsetByIdx.set(arr[i].idx, total);
                    total += h;
                    if (i < arr.length - 1) total += 8;
                }
                arr.__totalHeight = total;
                arr.__offsetByIdx = offsetByIdx;
            }
            const minModelGap = Math.max(12, this.tailPad);
            for (const b of bubbles) {
                const { item, el, rect, speakerRect, speakerCircle, speakerKey } = b;
                // In editor mode, always read a fresh live anchor from the current model transform.
                const liveRect = this.getSpeakerRect(speakerKey, canvasRect, 0) || speakerRect;
                const liveCircle = this.getImmediateSpeakerCircle(liveRect) || speakerCircle;
                const liveModelAnchor = this.getLiveModelScreenAnchor(speakerKey, canvasRect, liveRect);
                const modelAnchorX = liveModelAnchor?.x ?? null;
                const modelAnchorY = liveModelAnchor?.y ?? null;
                const rectAnchorX = liveRect ? ((liveRect.left + liveRect.right) / 2) : null;
                const rectTopY = liveRect ? liveRect.top : null;
                const rectCenterY = liveRect ? ((liveRect.top + liveRect.bottom) / 2) : null;
                // Bubble body in editor should follow model transform directly.
                let liveAnchorX = Number.isFinite(modelAnchorX)
                    ? modelAnchorX
                    : (Number.isFinite(rectAnchorX) ? rectAnchorX : (b.anchorXLive ?? b.anchorX));
                let liveTopY = liveRect ? liveRect.top : (b.anchorYLive ?? b.anchorY);
                if (!Number.isFinite(liveTopY)) {
                    liveTopY = Number.isFinite(rectTopY)
                        ? rectTopY
                        : (Number.isFinite(modelAnchorY) ? modelAnchorY : (b.anchorYLive ?? b.anchorY));
                }
                // Tail tip follows projected model center each frame (transform live), falling back to rect center.
                let liveCenterY = Number.isFinite(modelAnchorY)
                    ? modelAnchorY
                    : (Number.isFinite(rectCenterY) ? rectCenterY : (b.anchorYLive ?? b.anchorY));
                if (!Number.isFinite(liveAnchorX) || !Number.isFinite(liveTopY) || !Number.isFinite(liveCenterY)) {
                    liveAnchorX = Number.isFinite(item.lastAnchorX) ? item.lastAnchorX : b.anchorX;
                    liveTopY = Number.isFinite(item.lastAnchorY) ? item.lastAnchorY : b.anchorY;
                    liveCenterY = Number.isFinite(item.lastAnchorY) ? item.lastAnchorY : b.anchorY;
                }
                const anchorX = Number.isFinite(liveAnchorX)
                    ? liveAnchorX
                    : (Number.isFinite(item.lastAnchorX) ? item.lastAnchorX : b.anchorX);
                const anchorTopY = Number.isFinite(liveTopY)
                    ? liveTopY
                    : (Number.isFinite(item.lastAnchorY) ? item.lastAnchorY : b.anchorY);
                const anchorCenterY = Number.isFinite(liveCenterY)
                    ? liveCenterY
                    : anchorTopY;
                const speakerRadius = this.getSpeakerRadius(liveRect, 10);
                const bodyCenterX = Number.isFinite(modelAnchorX) ? modelAnchorX : anchorX;
                const bodyCenterY = Number.isFinite(modelAnchorY) ? modelAnchorY : anchorCenterY;
                const stackKey = speakerKey || `__bubble_${b.idx}`;
                const stackArr = editorStacks.get(stackKey) || [];
                const totalStackHeight = Number.isFinite(stackArr.__totalHeight) ? stackArr.__totalHeight : rect.height;
                const offsetForThis = stackArr.__offsetByIdx?.get?.(b.idx) ?? 0;
                // Editor-only bubble spawn:
                // Keep a minimum gap from the speaker circle and stack lines vertically:
                // first line is highest, subsequent lines render downward.
                const baseBottomY = bodyCenterY - speakerRadius - minModelGap;
                const targetLeft = bodyCenterX - rect.width / 2;
                const stackTop = baseBottomY - totalStackHeight;
                const targetTop = stackTop + offsetForThis;

                // In editor, keep placement deterministic on selection changes.
                item.x = Math.max(hardLeftBound, Math.min(hardRightBound - rect.width, targetLeft));
                item.y = Math.max(hardTopBound, Math.min(hardBottomBound - rect.height, targetTop));
                item.lastAnchorX = anchorX;
                item.lastAnchorY = anchorCenterY;

                item.lift = 0;
                item.visualBelow = false;
                item.isBelow = false;
                el.style.left = `${item.x}px`;
                el.style.top = `${item.y}px`;
                const editorBaseZ = Number.isFinite(this.panel?.speechLayerBaseZ) ? this.panel.speechLayerBaseZ : 300;
                const bubbleCenterX = item.x + rect.width * 0.5;
                const bubbleCenterY = item.y + rect.height * 0.5;
                const dist = Math.hypot(bubbleCenterX - bodyCenterX, bubbleCenterY - bodyCenterY);
                const distScore = Math.max(0, 2200 - Math.round(dist * 3));
                el.style.zIndex = `${editorBaseZ + distScore + (120 - Math.min(120, b.lineOrder || 0))}`;

                const localWidth = el.offsetWidth || rect.width;
                const localHeight = el.offsetHeight || rect.height;
                const bubbleRectNow = {
                    left: item.x,
                    top: item.y,
                    right: item.x + localWidth,
                    bottom: item.y + localHeight,
                };
                const circleCenterX = Number.isFinite(modelAnchorX) ? modelAnchorX : anchorX;
                const circleCenterY = Number.isFinite(modelAnchorY) ? modelAnchorY : anchorCenterY;
                const circleRadius = Number.isFinite(liveCircle?.r)
                    ? liveCircle.r
                    : this.getSpeakerRadius(liveRect, 10);
                this.updateDebugTarget(item, circleCenterX, circleCenterY, circleRadius);
                // Tail tip anchors to the closest point on a radius-circle around the projected model center.
                const tip = this.getClosestTipOnCircle(circleCenterX, circleCenterY, circleRadius, bubbleRectNow);
                const viewportRect = { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight };
                this.applyTriangleTail(
                    el,
                    item.x,
                    item.y,
                    localWidth,
                    localHeight,
                    tip.x,
                    tip.y,
                    viewportRect,
                    // Keep vertical viewport bounds for editor tails.
                    { clampX: false, clampY: true }
                );
                const segBase = this.getTailBaseCenterWorld(bubbleRectNow, tip.x, tip.y);
                tailSegments.push({
                    from: { x: segBase.x, y: segBase.y },
                    to: { x: tip.x, y: tip.y },
                    speakerKey,
                });
            }
            return;
        }

        if (recomputeLayout && bubbles.length) {
            const iterations = 56;
            for (let iter = 0; iter < iterations; iter++) {
                for (const b of bubbles) {
                    b.x += (b.prefX - b.x) * 0.12;
                    b.y += (b.prefY - b.y) * 0.12;
                }

                for (let i = 0; i < bubbles.length; i++) {
                    for (let j = i + 1; j < bubbles.length; j++) {
                        const a = bubbles[i];
                        const b = bubbles[j];
                        const ax2 = a.x + a.w;
                        const ay2 = a.y + a.h;
                        const bx2 = b.x + b.w;
                        const by2 = b.y + b.h;
                        const ox = Math.min(ax2, bx2) - Math.max(a.x, b.x);
                        const oy = Math.min(ay2, by2) - Math.max(a.y, b.y);
                        if (ox <= 0 || oy <= 0) continue;
                        // Prefer lateral separation when possible; fallback to vertical only if needed.
                        const dirX = (a.x + a.w * 0.5) < (b.x + b.w * 0.5) ? -1 : 1;
                        const pushX = (ox * 0.5) + 1.5;
                        const ax0 = a.x;
                        const bx0 = b.x;
                        a.x += dirX * pushX;
                        b.x -= dirX * pushX;
                        clampBubble(a);
                        clampBubble(b);
                        const stillOverlapX =
                            Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 0 &&
                            Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 0;
                        if (stillOverlapX) {
                            a.x = ax0;
                            b.x = bx0;
                            const dirY = (a.y + a.h * 0.5) < (b.y + b.h * 0.5) ? -1 : 1;
                            const pushY = (oy * 0.5) + 1.5;
                            a.y += dirY * pushY;
                            b.y -= dirY * pushY;
                        }
                    }
                }

                for (const b of bubbles) {
                    for (const c of speakerCircles) {
                        const cx = c.cx;
                        const cy = c.cy;
                        const closestX = Math.max(b.x, Math.min(cx, b.x + b.w));
                        const closestY = Math.max(b.y, Math.min(cy, b.y + b.h));
                        const dx = closestX - cx;
                        const dy = closestY - cy;
                        const d = Math.hypot(dx, dy);
                        if (d < c.r + 2) {
                            const ux = d > 0.001 ? (dx / d) : 0;
                            const uy = d > 0.001 ? (dy / d) : -1;
                            const push = (c.r + 2 - d);
                            b.x += ux * push;
                            b.y += uy * push;
                        }
                    }
                    if (collidesNarration(b)) {
                        const shifted = resolveNarrationOverlap(b.item, b.x, b.y, b.w, b.h);
                        b.x = b.x + (shifted.x - b.x) * 0.7;
                        b.y = b.y + (shifted.y - b.y) * 0.25;
                    }
                    const blk = collidesBlocked(b);
                    if (blk) {
                        const bcx = b.x + b.w * 0.5;
                        const bcy = b.y + b.h * 0.5;
                        const rcx = (blk.left + blk.right) * 0.5;
                        const rcy = (blk.top + blk.bottom) * 0.5;
                        const ox = Math.min(b.x + b.w, blk.right) - Math.max(b.x, blk.left);
                        const oy = Math.min(b.y + b.h, blk.bottom) - Math.max(b.y, blk.top);
                        if (ox > 0 && oy > 0) {
                            if (ox <= oy) {
                                const dir = bcx < rcx ? -1 : 1;
                                b.x += dir * (ox + 4);
                            } else {
                                const dir = bcy < rcy ? -1 : 1;
                                b.y += dir * (oy + 4);
                            }
                        }
                    }
                    clampBubble(b);
                }
                enforceSpeakerOrder(bubbles);
                for (const b of bubbles) clampBubble(b);
            }
            // Final strict no-overlap collider pass.
            for (let pass = 0; pass < 20; pass++) {
                let changed = false;
                for (let i = 0; i < bubbles.length; i++) {
                    for (let j = i + 1; j < bubbles.length; j++) {
                        const a = bubbles[i];
                        const b = bubbles[j];
                        const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
                        const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
                        if (ox <= 0 || oy <= 0) continue;
                        changed = true;
                        // Prefer horizontal spread (use full slot width) before vertical stacking.
                        const ax0 = a.x;
                        const bx0 = b.x;
                        const dirX = (a.x + a.w * 0.5) < (b.x + b.w * 0.5) ? -1 : 1;
                        const pushX = (ox * 0.5) + 1.5;
                        a.x += dirX * pushX;
                        b.x -= dirX * pushX;
                        clampBubble(a);
                        clampBubble(b);
                        const stillOverlapX =
                            Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 0 &&
                            Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 0;
                        if (stillOverlapX) {
                            a.x = ax0;
                            b.x = bx0;
                            const dirY = (a.y + a.h * 0.5) < (b.y + b.h * 0.5) ? -1 : 1;
                            const pushY = (oy * 0.5) + 1.5;
                            a.y += dirY * pushY;
                            b.y -= dirY * pushY;
                        }
                        clampBubble(a);
                        clampBubble(b);
                    }
                }
                if (!changed) break;
            }
            enforceSpeakerOrder(bubbles);
            for (const b of bubbles) clampBubble(b);
            for (const b of bubbles) {
                b.item.baseLeft = b.x;
                b.item.baseTop = b.y;
                b.item.baseWidth = b.w;
                b.item.baseHeight = b.h;
                b.item.baseNormX = canvasRect.width > 0 ? ((b.x - canvasRect.left) / canvasRect.width) : null;
                b.item.baseNormY = canvasRect.height > 0 ? ((b.y - canvasRect.top) / canvasRect.height) : null;
                b.item.baseAnchorX = b.anchorX;
                b.item.baseAnchorNormX = canvasRect.width > 0 ? ((b.anchorX - canvasRect.left) / canvasRect.width) : null;
                const baseCenterY = b.y + b.h / 2;
                b.item.visualBelow = baseCenterY >= b.speakerMidY;
                b.item.isBelow = b.item.visualBelow;
            }
        }

        for (const b of bubbles) {
            const { item, el, rect, speakerCircle, speakerRect, speakerKey, isSpeaking } = b;
            const correctionLerp = 0.45;
            const correctionMax = 12;
            let left = item.baseNormX != null
                ? (canvasRect.left + item.baseNormX * canvasRect.width)
                : item.baseLeft;
            let top = item.baseNormY != null
                ? (canvasRect.top + item.baseNormY * canvasRect.height)
                : item.baseTop;
            if (!Number.isFinite(left)) left = b.prefX;
            if (!Number.isFinite(top)) top = b.prefY;
            if (item.baseAnchorX == null && item.baseAnchorNormX != null) {
                item.baseAnchorX = canvasRect.left + item.baseAnchorNormX * canvasRect.width;
            }
            if (item.baseAnchorX == null) item.baseAnchorX = b.anchorX;

            const liftTarget = isSpeaking ? Math.min(10, canvasRect.height * 0.08) : 0;
            item.lift = item.lift + (liftTarget - item.lift) * 0.32;
            const visualBelowNow = Boolean(item.visualBelow);
            const liftOffset = item.lift > 0 ? (visualBelowNow ? item.lift : -item.lift) : 0;
            const targetTop = top + liftOffset;
            const targetLeft = left;

            if (item.x == null) item.x = targetLeft;
            if (item.y == null) item.y = targetTop;
            item.x = item.x + (targetLeft - item.x) * this.smooth;
            if (visualBelowNow && isSpeaking) {
                const downOnlyTarget = Math.max(item.y, targetTop);
                item.y = item.y + (downOnlyTarget - item.y) * this.smooth;
            } else {
                item.y = item.y + (targetTop - item.y) * this.smooth;
            }
            const narrationYLocked = false;
            if (Math.abs(item.x - targetLeft) < 0.2) item.x = targetLeft;
            if (Math.abs(item.y - targetTop) < 0.2) item.y = targetTop;

            item.x = Math.max(hardLeftBound, Math.min(hardRightBound - rect.width, item.x));
            item.y = Math.max(hardTopBound, Math.min(hardBottomBound - rect.height, item.y));

            const currentRect = { left: item.x, top: item.y, right: item.x + rect.width, bottom: item.y + rect.height };
            if (b.lineOrder > 0 && b.speakerKey) {
                const prevSame = bubbles.find((x) => x.speakerKey === b.speakerKey && x.lineOrder === b.lineOrder - 1);
                if (prevSame && Number.isFinite(prevSame.item?.y)) {
                    const minTop = prevSame.item.y + Math.max(6, (prevSame.h || rect.height) * 0.16);
                    if (item.y < minTop) {
                        item.y = minTop;
                        currentRect.top = item.y;
                        currentRect.bottom = item.y + rect.height;
                    }
                }
            }
            if ((item.lift || 0) <= 0.5 && narrationVisible && rectsOverlap(currentRect, narrationRect)) {
                const shifted = resolveNarrationOverlap(item, item.x, item.y, rect.width, rect.height);
                // Keep narration avoidance soft so bubbles are not hard-locked away.
                item.x = item.x + (shifted.x - item.x) * 0.45;
                const dyNarr = shifted.y - item.y;
                const hasSideMove = Math.abs(shifted.x - item.x) > 0.5;
                if (!hasSideMove && Math.abs(dyNarr) > verticalDeadzone) {
                    item.y = item.y + dyNarr * 0.22;
                }
                item.x = Math.max(hardLeftBound, Math.min(hardRightBound - rect.width, item.x));
                item.y = Math.max(hardTopBound, Math.min(hardBottomBound - rect.height, item.y));
                currentRect.left = item.x;
                currentRect.right = item.x + rect.width;
                currentRect.top = item.y;
                currentRect.bottom = item.y + rect.height;
            }
            for (const prev of committedRects) {
                if ((item.lift || 0) > 0.5 || (prev.lift || 0) > 0.5) continue;
                if (!rectsOverlap(currentRect, prev)) continue;
                const ox = Math.min(currentRect.right, prev.right) - Math.max(currentRect.left, prev.left);
                const oy = Math.min(currentRect.bottom, prev.bottom) - Math.max(currentRect.top, prev.top);
                if (ox <= 1.2 || oy <= 1.2) continue;
                const x0 = item.x;
                const dirX = (currentRect.left + currentRect.right) * 0.5 < (prev.left + prev.right) * 0.5 ? -1 : 1;
                item.x += dirX * (ox + 1.6);
                item.x = Math.max(hardLeftBound, Math.min(hardRightBound - rect.width, item.x));
                item.y = Math.max(hardTopBound, Math.min(hardBottomBound - rect.height, item.y));
                currentRect.left = item.x;
                currentRect.right = item.x + rect.width;
                currentRect.top = item.y;
                currentRect.bottom = item.y + rect.height;
                if (rectsOverlap(currentRect, prev) && !narrationYLocked) {
                    item.x = x0;
                    const dirY = (currentRect.top + currentRect.bottom) * 0.5 < (prev.top + prev.bottom) * 0.5 ? -1 : 1;
                    if ((oy + 1.6) > verticalDeadzone) {
                        item.y += dirY * (oy + 1.6);
                    }
                    item.x = Math.max(hardLeftBound, Math.min(hardRightBound - rect.width, item.x));
                    item.y = Math.max(hardTopBound, Math.min(hardBottomBound - rect.height, item.y));
                    currentRect.left = item.x;
                    currentRect.right = item.x + rect.width;
                    currentRect.top = item.y;
                    currentRect.bottom = item.y + rect.height;
                }
            }
            const blocked = (item.lift || 0) > 0.5 ? null : blockedRects.find((blk) => rectsOverlap(currentRect, blk));
            if (blocked) {
                const bcx = (currentRect.left + currentRect.right) * 0.5;
                const bcy = (currentRect.top + currentRect.bottom) * 0.5;
                const rcx = (blocked.left + blocked.right) * 0.5;
                const rcy = (blocked.top + blocked.bottom) * 0.5;
                const ox = Math.min(currentRect.right, blocked.right) - Math.max(currentRect.left, blocked.left);
                const oy = Math.min(currentRect.bottom, blocked.bottom) - Math.max(currentRect.top, blocked.top);
                if (ox > 0 && oy > 0) {
                    if (ox <= oy) {
                        const dx = (bcx < rcx ? -1 : 1) * Math.min(correctionMax, ox + 2);
                        item.x += dx * correctionLerp;
                    } else if (!narrationYLocked) {
                        const dy = (bcy < rcy ? -1 : 1) * Math.min(correctionMax, oy + 2);
                        if (Math.abs(dy * correctionLerp) > verticalDeadzone) {
                            item.y += dy * correctionLerp;
                        }
                    }
                    item.x = Math.max(hardLeftBound, Math.min(hardRightBound - rect.width, item.x));
                    item.y = Math.max(hardTopBound, Math.min(hardBottomBound - rect.height, item.y));
                    currentRect.left = item.x;
                    currentRect.right = item.x + rect.width;
                    currentRect.top = item.y;
                    currentRect.bottom = item.y + rect.height;
                }
            }

            el.style.left = `${item.x}px`;
            el.style.top = `${item.y}px`;
            const panelSpeechBase = Number.isFinite(this.panel?.speechLayerBaseZ) ? this.panel.speechLayerBaseZ : 300;
            const bubbleCenterX = item.x + rect.width * 0.5;
            const bubbleCenterY = item.y + rect.height * 0.5;
            const liveModelAnchor = this.getLiveModelScreenAnchor(speakerKey, canvasRect, speakerRect);
            const liveAnchorX = Number.isFinite(liveModelAnchor?.x) ? liveModelAnchor.x : (b.anchorXLive ?? b.anchorX);
            const liveAnchorY = Number.isFinite(liveModelAnchor?.y) ? liveModelAnchor.y : (b.anchorYLive ?? b.anchorY);
            const dist = Math.hypot(bubbleCenterX - liveAnchorX, bubbleCenterY - liveAnchorY);
            const distScore = Math.max(0, 2200 - Math.round(dist * 3));
            const z = panelSpeechBase + distScore + (120 - Math.min(120, b.lineOrder || 0));
            el.style.zIndex = `${z}`;
            el.dataset.isBelow = '';
            el.style.outline = '';
            el.style.outlineOffset = '';

            const localWidth = el.offsetWidth || rect.width;
            const localHeight = el.offsetHeight || rect.height;
            const bubbleRectNow = {
                left: item.x,
                top: item.y,
                right: item.x + localWidth,
                bottom: item.y + localHeight,
            };
            const liveSpeakerRadius = Number.isFinite(speakerCircle?.r)
                ? speakerCircle.r
                : this.getSpeakerRadius(speakerRect, 10);
            const liveSpeakerCircle = {
                cx: liveAnchorX,
                cy: liveAnchorY,
                r: liveSpeakerRadius,
            };
            const closestTip = this.getClosestTipOnCircle(
                liveSpeakerCircle.cx,
                liveSpeakerCircle.cy,
                liveSpeakerCircle.r,
                bubbleRectNow
            );
            const tip = this.getTailTipWithAvoidance(
                closestTip.x,
                closestTip.y,
                null,
                liveSpeakerCircle,
                bubbleRectNow,
                // Clamp tails to viewport bounds in both axes.
                { left: hardLeftBound, top: hardTopBound, right: hardRightBound, bottom: hardBottomBound },
                tailSegments,
                speakerKey
            );
            this.updateDebugTarget(item, liveSpeakerCircle.cx, liveSpeakerCircle.cy, liveSpeakerCircle.r);
            this.applyTriangleTail(
                el,
                item.x,
                item.y,
                localWidth,
                localHeight,
                tip.x,
                tip.y,
                canvasRect,
                { clampY: true }
            );
            const segBase = this.getTailBaseCenterWorld(bubbleRectNow, tip.x, tip.y);
            tailSegments.push({
                from: { x: segBase.x, y: segBase.y },
                to: { x: tip.x, y: tip.y },
                speakerKey,
            });
            committedRects.push({
                left: item.x,
                top: item.y,
                right: item.x + localWidth,
                bottom: item.y + localHeight,
                lift: item.lift || 0,
            });
        }
    }
}
