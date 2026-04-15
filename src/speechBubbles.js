import * as THREE from 'three';

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
    }

    sync(elements, speakers) {
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
            };
        });
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
                tailLeft: tail?.style.left || '',
                tailTop: tail?.style.top || '',
                tailBorderTop: tailBorder?.style.top || '',
                tailBorderLeft: tailBorder?.style.left || '',
                tailBorderTopWidth: tailBorder?.style.borderTopWidth || '',
                tailBorderBottomWidth: tailBorder?.style.borderBottomWidth || '',
                tailBorderTopRule: tailBorder?.style.borderTop || '',
                tailBorderBottomRule: tailBorder?.style.borderBottom || '',
                tailTopWidth: tail?.style.borderTopWidth || '',
                tailBottomWidth: tail?.style.borderBottomWidth || '',
                tailTopRule: tail?.style.borderTop || '',
                tailBottomRule: tail?.style.borderBottom || '',
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
            const x = canvasRect.left + s.x;
            const y = canvasRect.top + s.y;
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
                    const anchorX = canvasRect.left + (item.frozenAnchorNormX * canvasRect.width);
                    const anchorY = canvasRect.top + (item.frozenAnchorNormY * canvasRect.height);
                    const tailMargin = 18;
                    const tailX = Math.max(tailMargin, Math.min(rect.width - tailMargin, anchorX - item.x));
                    const isBelow = Boolean(item.frozenIsBelow);
                    if (tail) tail.style.left = `${tailX - 8}px`;
                    if (tailBorder) tailBorder.style.left = `${tailX - 9}px`;

                    if (isBelow) {
                        const tailLength = Math.max(14, item.y - anchorY);
                        tailBorder.style.top = `${-(tailLength + 2)}px`;
                        tailBorder.style.borderBottomWidth = `${tailLength + 2}px`;
                        tailBorder.style.borderTopWidth = '0';
                        tailBorder.style.borderTop = '0';
                        tailBorder.style.borderBottom = `${tailLength + 2}px solid #000`;
                        tail.style.top = `${-(tailLength - 1)}px`;
                        tail.style.borderBottomWidth = `${tailLength}px`;
                        tail.style.borderTopWidth = '0';
                        tail.style.borderTop = '0';
                        tail.style.borderBottom = `${tailLength}px solid #fff`;
                    } else {
                        const tailStartY = item.y + rect.height - 4;
                        const tailLength = Math.max(14, anchorY - tailStartY);
                        tailBorder.style.top = `${rect.height - 2}px`;
                        tailBorder.style.borderTopWidth = `${tailLength + 2}px`;
                        tailBorder.style.borderBottomWidth = '0';
                        tailBorder.style.borderBottom = '0';
                        tailBorder.style.borderTop = `${tailLength + 2}px solid #000`;
                        tail.style.top = `${rect.height - 4}px`;
                        tail.style.borderTopWidth = `${tailLength}px`;
                        tail.style.borderBottomWidth = '0';
                        tail.style.borderBottom = '0';
                        tail.style.borderTop = `${tailLength}px solid #fff`;
                    }
                } else if (s && tail && tailBorder) {
                    tail.style.left = s.tailLeft;
                    tail.style.top = s.tailTop;
                    tail.style.borderTopWidth = s.tailTopWidth;
                    tail.style.borderBottomWidth = s.tailBottomWidth;
                    tail.style.borderTop = s.tailTopRule;
                    tail.style.borderBottom = s.tailBottomRule;
                    tailBorder.style.left = s.tailBorderLeft;
                    tailBorder.style.top = s.tailBorderTop;
                    tailBorder.style.borderTopWidth = s.tailBorderTopWidth;
                    tailBorder.style.borderBottomWidth = s.tailBorderBottomWidth;
                    tailBorder.style.borderTop = s.tailBorderTopRule;
                    tailBorder.style.borderBottom = s.tailBorderBottomRule;
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
        const panelIsMoving = Boolean(this.panel?.isUpdating) && !Boolean(this.panel?.isAnimatingOut);
        const recomputeLayout = resized || panelIsMoving || this.items.some((item) => item.baseLeft == null || item.baseTop == null || item.widthDirty);
        const leftBound = canvasRect.left + 8;
        const rightBound = canvasRect.right - 8;
        const topBound = canvasRect.top + 8;
        const linkList = document.getElementById('link-list');
        const linkRect = linkList ? linkList.getBoundingClientRect() : null;
        const choiceTop = linkRect ? (linkRect.top - 8) : null;
        const bottomBound = canvasRect.bottom - 8;
        const narrationRect = this.panel.narrationEl.getBoundingClientRect();
        const maxWidth = Math.min(this.maxWidth, rightBound - leftBound);
        const placed = [];
        const overlapsPlaced = (rect, allowNonBlocking = false) => placed.some((r) => (allowNonBlocking ? r.block !== false : true) &&
            rect.right > r.left && rect.left < r.right &&
            rect.bottom > r.top && rect.top < r.bottom);
        const speakerCircles = [];
        const seenSpeakers = new Set();
        for (const item of this.items) {
            const key = String(item.speaker || '').trim();
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

        let prevTop = topBound - this.minTopSeparation;
        for (let idx = 0; idx < this.items.length; idx++) {
            const item = this.items[idx];
            const el = item.el;
            if (!el) continue;
            const allowWidthChange = resized || item.widthDirty || item.width == null;
            if (allowWidthChange) {
                el.style.maxWidth = `${maxWidth}px`;
                el.style.width = 'fit-content';
            } else {
                el.style.maxWidth = `${item.width}px`;
                el.style.width = `${item.width}px`;
            }
            let rect = el.getBoundingClientRect();
            if (allowWidthChange) {
                if (item.expandOnly && item.width != null) {
                    item.width = Math.min(maxWidth, Math.max(item.width, rect.width));
                } else {
                    item.width = Math.min(maxWidth, rect.width);
                }
                el.style.maxWidth = `${item.width}px`;
                el.style.width = `${item.width}px`;
                rect = el.getBoundingClientRect();
                item.widthDirty = false;
                item.expandOnly = false;
            }

            const speakerKey = String(item.speaker || '').trim();
            const speakerModel = speakerKey ? this.panel.three?.getModelByKey(speakerKey) : null;
            const activeIndex = this.panel.three?.speakerAnim?.index ?? -1;
            const isActiveLine = activeIndex === idx;
            const isSpeaking = Boolean(speakerModel?.userData?.speaking) && isActiveLine;
            const hopDelta = speakerModel && Number.isFinite(speakerModel.userData?.baseY)
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
            let anchorX;
            let anchorY;
            let anchorXLive = null;
            if (speakerRect) {
                const targetAnchorX = (speakerRect.left + speakerRect.right) / 2;
                const targetAnchorY = speakerRect.top;
                const targetNorm = {
                    x: (targetAnchorX - canvasRect.left) / canvasRect.width,
                    y: (targetAnchorY - canvasRect.top) / canvasRect.height,
                };
                if (!item.anchorNorm) {
                    item.anchorNorm = targetNorm;
                } else {
                    const follow = 0.15;
                    item.anchorNorm = {
                        x: item.anchorNorm.x + (targetNorm.x - item.anchorNorm.x) * follow,
                        y: item.anchorNorm.y + (targetNorm.y - item.anchorNorm.y) * follow,
                    };
                }
                if (!item.side) {
                    item.side = targetAnchorX <= canvasCenterX ? 'left' : 'right';
                }
                anchorXLive = targetAnchorX;
            }
            if (item.anchorNorm) {
                anchorX = canvasRect.left + item.anchorNorm.x * canvasRect.width;
                anchorY = canvasRect.top + item.anchorNorm.y * canvasRect.height;
            } else {
                anchorX = canvasCenterX;
                anchorY = canvasRect.top + canvasRect.height * 0.2;
                if (!item.side) {
                    item.side = anchorX <= canvasCenterX ? 'left' : 'right';
                }
            }
            item.lastAnchorX = anchorX;
            item.lastAnchorY = anchorY;

            if (speakerOffscreen) {
                const centerX = speakerRect ? (speakerRect.left + speakerRect.right) / 2 : anchorX;
                const centerY = speakerRect ? (speakerRect.top + speakerRect.bottom) / 2 : anchorY;
                const clampedX = Math.max(leftBound, Math.min(rightBound, centerX));
                let clampedY = Math.max(topBound, Math.min(bottomBound, centerY));
                if (speakerRect && speakerRect.bottom < topBound) clampedY = topBound;
                if (speakerRect && speakerRect.top > bottomBound) clampedY = bottomBound;
                anchorX = clampedX;
                anchorY = clampedY;
                anchorXLive = clampedX;
            }

            const speakerCircle = speakerOffscreen ? null : this.getSpeakerCircle(item, speakerRect, canvasRect);
            const circleRect = speakerCircle
                ? {
                    left: speakerCircle.cx - speakerCircle.r,
                    right: speakerCircle.cx + speakerCircle.r,
                    top: speakerCircle.cy - speakerCircle.r,
                    bottom: speakerCircle.cy + speakerCircle.r,
                }
                : speakerRect;

            const liftTarget = isSpeaking
                ? Math.min(10, canvasRect.height * 0.08)
                : 0;
            const liftFollow = 0.32;
            item.lift = item.lift + (liftTarget - item.lift) * liftFollow;
            const topLimit = topBound;
            let left = Math.max(leftBound, Math.min(rightBound - rect.width, anchorX - rect.width / 2));
            let top;
            let placementMode = 'above';
            let forcedBottom = false;
            let testRect;
            const useBaseLayout = !recomputeLayout && (
                (item.baseNormX != null && item.baseNormY != null) ||
                (item.baseLeft != null && item.baseTop != null)
            );
            if (useBaseLayout) {
                left = item.baseNormX != null
                    ? (canvasRect.left + item.baseNormX * canvasRect.width)
                    : item.baseLeft;
                top = item.baseNormY != null
                    ? (canvasRect.top + item.baseNormY * canvasRect.height)
                    : item.baseTop;
                testRect = { left, top, right: left + rect.width, bottom: top + rect.height };
            } else {
                if (circleRect) {
                    const candidateAbove = circleRect.top - rect.height - this.tailPad;
                    const candidateBelow = circleRect.bottom + this.tailPad;
                    const aboveRect = {
                        left,
                        top: candidateAbove,
                        right: left + rect.width,
                        bottom: candidateAbove + rect.height,
                    };
                    const belowRect = {
                        left,
                        top: candidateBelow,
                        right: left + rect.width,
                        bottom: candidateBelow + rect.height,
                    };
                    const overlapsAbove = this.rectIntersectsCircle(aboveRect, speakerCircle);
                    const overlapsBelow = this.rectIntersectsCircle(belowRect, speakerCircle);
                    if (overlapsAbove && !overlapsBelow) {
                        top = candidateBelow;
                        placementMode = 'below';
                    } else if (overlapsAbove && overlapsBelow) {
                        top = candidateBelow;
                        placementMode = 'below';
                    } else {
                        top = candidateAbove;
                        placementMode = 'above';
                    }
                } else {
                    top = anchorY - rect.height - this.tailPad;
                }
                top = Math.max(topLimit, top);
                top = Math.max(top, prevTop + this.minTopSeparation);
                testRect = { left, top, right: left + rect.width, bottom: top + rect.height };

                // Avoid any speaker overlap, prioritizing upward movement.
                if (overlapsAnySpeaker(testRect)) {
                    let moved = false;
                    let candidate = top;
                    for (let i = 0; i < 16; i++) {
                        candidate -= 6;
                        if (candidate < topBound) break;
                        const tryRect = {
                            left,
                            top: candidate,
                            right: left + rect.width,
                            bottom: candidate + rect.height,
                        };
                        const overlapsNarration =
                            tryRect.right > narrationRect.left &&
                            tryRect.left < narrationRect.right &&
                            tryRect.bottom > narrationRect.top &&
                            tryRect.top < narrationRect.bottom;
                        if (overlapsNarration || overlapsPlaced(tryRect, !recomputeLayout)) break;
                        if (!overlapsAnySpeaker(tryRect)) {
                            top = candidate;
                            testRect = tryRect;
                            moved = true;
                            break;
                        }
                    }

                    if (!moved && circleRect) {
                        const shiftLeft = Math.max(leftBound, Math.min(rightBound - rect.width, circleRect.left - 8 - rect.width));
                        const shiftRight = Math.max(leftBound, Math.min(rightBound - rect.width, circleRect.right + 8));
                        const leftRect = { left: shiftLeft, top, right: shiftLeft + rect.width, bottom: top + rect.height };
                        const rightRect = { left: shiftRight, top, right: shiftRight + rect.width, bottom: top + rect.height };
                        if (!overlapsAnySpeaker(leftRect) && !overlapsPlaced(leftRect, !recomputeLayout)) {
                            left = shiftLeft;
                            testRect = leftRect;
                        } else if (!overlapsAnySpeaker(rightRect) && !overlapsPlaced(rightRect, !recomputeLayout)) {
                            left = shiftRight;
                            testRect = rightRect;
                        }
                    }
                }

                // If still overlapping speaker or other bubbles, push downward until clear.
                let downTries = 0;
                while (downTries < 20) {
                    const overlapsSpeaker = overlapsAnySpeaker(testRect);
                    const overlapsBubble = overlapsPlaced(testRect, !recomputeLayout);
                    if (!overlapsSpeaker && !overlapsBubble) break;
                    top = Math.max(topLimit, testRect.bottom + 8);
                    testRect = { left, top, right: left + rect.width, bottom: top + rect.height };
                    downTries += 1;
                }
            }

            if (choiceTop != null && testRect.bottom > choiceTop) {
                top = Math.max(topLimit, choiceTop - rect.height);
                testRect = { left, top, right: left + rect.width, bottom: top + rect.height };
                placementMode = 'above';
                forcedBottom = false;
            }

            if (!useBaseLayout && item.lift <= 0.5 && overlapsAnySpeaker(testRect)) {
                if (item.side === 'left') {
                    const targetRight = Math.min(rightBound, circleRect.left - 8);
                    left = Math.max(leftBound, targetRight - rect.width);
                } else {
                    const targetLeft = Math.max(leftBound, circleRect.right + 8);
                    left = Math.min(rightBound - rect.width, targetLeft);
                }
                testRect = { left, top, right: left + rect.width, bottom: top + rect.height };
            }

            if (!useBaseLayout && allowWidthChange && !item.expandOnly && item.lift <= 0.5 && overlapsAnySpeaker(testRect)) {
                const widths = [Math.max(this.minWidth, rect.width - 60), this.minWidth];
                for (const width of widths) {
                    el.style.maxWidth = `${width}px`;
                    el.style.width = 'fit-content';
                    rect = el.getBoundingClientRect();
                    left = Math.max(leftBound, Math.min(rightBound - rect.width, anchorX - rect.width / 2));
                    testRect = { left, top, right: left + rect.width, bottom: top + rect.height };
                    if (!overlapsAnySpeaker(testRect)) {
                        item.width = Math.min(maxWidth, rect.width);
                        el.style.maxWidth = `${item.width}px`;
                        el.style.width = `${item.width}px`;
                        rect = el.getBoundingClientRect();
                        break;
                    }
                }
            }

            if (!useBaseLayout && testRect.right > narrationRect.left &&
                testRect.left < narrationRect.right &&
                testRect.bottom > narrationRect.top &&
                testRect.top < narrationRect.bottom) {
                top = narrationRect.bottom + 8;
                testRect.top = top;
                testRect.bottom = top + rect.height;
            }

            if (!useBaseLayout && !isSpeaking && this.items.length > 1) {
                let tries = 0;
                let shrinkTried = false;
                while (tries < 12) {
                    const overlapsBubble = overlapsPlaced(testRect);
                    if (!overlapsBubble) break;

                    if (!shrinkTried && allowWidthChange && !item.expandOnly) {
                        shrinkTried = true;
                        const widths = [Math.max(this.minWidth, rect.width - 80), this.minWidth];
                        for (const width of widths) {
                            el.style.maxWidth = `${width}px`;
                            el.style.width = 'fit-content';
                            rect = el.getBoundingClientRect();
                            left = Math.max(leftBound, Math.min(rightBound - rect.width, anchorX - rect.width / 2));
                            testRect = { left, top, right: left + rect.width, bottom: top + rect.height };
                            const stillOverlaps = overlapsPlaced(testRect, !recomputeLayout);
                            if (!stillOverlaps) {
                                item.width = Math.min(maxWidth, rect.width);
                                el.style.maxWidth = `${item.width}px`;
                                el.style.width = `${item.width}px`;
                                rect = el.getBoundingClientRect();
                                break;
                            }
                        }
                        const afterShrinkOverlap = overlapsPlaced(testRect, !recomputeLayout);
                        if (!afterShrinkOverlap) break;
                    }

                    top = testRect.bottom + 8;
                    testRect.top = top;
                    testRect.bottom = top + rect.height;
                    tries += 1;
                }
            }

            if (!useBaseLayout && !isSpeaking && this.items.length > 1) {
                let candidate = top;
                let best = top;
                for (let i = 0; i < 60; i++) {
                    candidate -= 6;
                    if (candidate < topBound) break;
                    const tryRect = {
                        left,
                        top: candidate,
                        right: left + rect.width,
                        bottom: candidate + rect.height,
                    };
                    const overlapsBubble = overlapsPlaced(tryRect, !recomputeLayout);
                    const overlapsNarration =
                        tryRect.right > narrationRect.left &&
                        tryRect.left < narrationRect.right &&
                        tryRect.bottom > narrationRect.top &&
                        tryRect.top < narrationRect.bottom;
                    if (overlapsBubble || overlapsNarration) break;
                    if (placementMode === 'above' && overlapsAnySpeaker(tryRect)) {
                        break;
                    }
                    best = candidate;
                }
                if (best !== top) {
                    top = best;
                    testRect.top = top;
                    testRect.bottom = top + rect.height;
                }
            }

            if (!useBaseLayout && !isSpeaking && this.items.length > 1) {
                const topHalfLimit = topBound + (canvasRect.height * 0.5);
                let guard = 0;
                while (testRect.top > topHalfLimit && guard < 20) {
                    const candidate = testRect.top - 12;
                    const tryRect = {
                        left,
                        top: candidate,
                        right: left + rect.width,
                        bottom: candidate + rect.height,
                    };
                    const overlapsBubble = overlapsPlaced(tryRect, !recomputeLayout);
                    const overlapsNarration =
                        tryRect.right > narrationRect.left &&
                        tryRect.left < narrationRect.right &&
                        tryRect.bottom > narrationRect.top &&
                        tryRect.top < narrationRect.bottom;
                    if (overlapsBubble || overlapsNarration) break;
                    if (placementMode === 'above' && overlapsAnySpeaker(tryRect)) break;
                    top = candidate;
                    testRect = tryRect;
                    guard += 1;
                }
            }

            if (!useBaseLayout && circleRect &&
                overlapsAnySpeaker(testRect) &&
                testRect.bottom > circleRect.top &&
                testRect.top < circleRect.bottom) {
                const candidateBelow = circleRect.bottom + this.tailPad;
                top = Math.max(topLimit, candidateBelow);
                testRect = { left, top, right: left + rect.width, bottom: top + rect.height };
                placementMode = 'below';
                forcedBottom = true;
            }

            if (!useBaseLayout && !isSpeaking && this.items.length > 1 && idx === 0) {
                const pinRect = {
                    left,
                    top: topBound,
                    right: left + rect.width,
                    bottom: topBound + rect.height,
                };
                const overlapsBubble = overlapsPlaced(pinRect, !recomputeLayout);
                const overlapsNarration =
                    pinRect.right > narrationRect.left &&
                    pinRect.left < narrationRect.right &&
                    pinRect.bottom > narrationRect.top &&
                    pinRect.top < narrationRect.bottom;
                const overlapsSpeaker = overlapsAnySpeaker(pinRect);
                if (!overlapsBubble && !overlapsNarration && !overlapsSpeaker) {
                    top = topBound;
                    testRect = pinRect;
                    placementMode = 'above';
                    forcedBottom = false;
                }
            }

            if (!useBaseLayout) {
                const belowByPosition = circleRect
                    ? top >= ((circleRect.top + circleRect.bottom) / 2)
                    : top >= anchorY;
                item.isBelow = forcedBottom || placementMode === 'below' || belowByPosition;
                if (item.lastIsBelow === null) {
                    item.lastIsBelow = item.isBelow;
                } else if (!item.lastIsBelow && item.isBelow) {
                    item.lastIsBelow = true;
                } else if (item.lastIsBelow && !item.isBelow) {
                    item.lastIsBelow = false;
                }
            }

            if (!useBaseLayout) {
                item.baseLeft = left;
                item.baseTop = top;
                item.baseWidth = rect.width;
                item.baseHeight = rect.height;
                item.baseNormX = canvasRect.width > 0 ? ((left - canvasRect.left) / canvasRect.width) : null;
                item.baseNormY = canvasRect.height > 0 ? ((top - canvasRect.top) / canvasRect.height) : null;
                item.baseAnchorX = anchorX;
                item.baseAnchorNormX = canvasRect.width > 0 ? ((anchorX - canvasRect.left) / canvasRect.width) : null;
            } else {
                left = item.baseNormX != null
                    ? (canvasRect.left + item.baseNormX * canvasRect.width)
                    : item.baseLeft;
                top = item.baseNormY != null
                    ? (canvasRect.top + item.baseNormY * canvasRect.height)
                    : item.baseTop;
            }

            if (item.baseAnchorX == null && item.baseAnchorNormX != null) {
                item.baseAnchorX = canvasRect.left + item.baseAnchorNormX * canvasRect.width;
            }
            if (item.baseAnchorX == null) {
                item.baseAnchorX = anchorXLive ?? anchorX;
            }

            const speakerMidY = circleRect
                ? (circleRect.top + circleRect.bottom) / 2
                : anchorY;
            const currentCenterY = (item.y ?? top) + rect.height / 2;
            const margin = 6;
            if (item.visualBelow === undefined) {
                item.visualBelow = currentCenterY >= speakerMidY;
            } else {
                if (currentCenterY <= speakerMidY - margin) item.visualBelow = false;
                if (currentCenterY >= speakerMidY + margin) item.visualBelow = true;
            }
            const visualBelowNow = item.visualBelow;
            const liftOffset = item.lift > 0 ? (visualBelowNow ? item.lift : -item.lift) : 0;
            const targetTop = top + liftOffset;

            const driftXSource = anchorXLive ?? anchorX;
            const driftX = item.baseAnchorX != null ? (driftXSource - item.baseAnchorX) : 0;
            const driftedLeft = Math.max(leftBound, Math.min(rightBound - rect.width, left + driftX));

            if (!useBaseLayout) {
                prevTop = Math.max(prevTop, top);
                placed.push({ left, top, right: left + rect.width, bottom: top + rect.height, block: recomputeLayout ? true : !isSpeaking });
            }

            if (item.x == null) item.x = driftedLeft;
            if (item.y == null) item.y = targetTop;
            item.x = driftedLeft;
            if (visualBelowNow && isSpeaking) {
                const downOnlyTarget = Math.max(item.y, targetTop);
                item.y = item.y + (downOnlyTarget - item.y) * this.smooth;
            } else {
                item.y = item.y + (targetTop - item.y) * this.smooth;
            }
            if (choiceTop != null) {
                const baseMaxY = choiceTop - rect.height;
                const allowedMaxY = baseMaxY + Math.max(0, item.lift || 0);
                if (Number.isFinite(allowedMaxY)) {
                    item.y = Math.min(item.y, allowedMaxY);
                }
            }

            const visualBelow = (item.y + rect.height / 2) >= speakerMidY;

            el.style.left = `${item.x}px`;
            el.style.top = `${item.y}px`;
            const zBase = 100000;
            const z = visualBelow ? (zBase - Math.round(item.y)) : (zBase + Math.round(item.y));
            el.style.zIndex = `${z}`;
            item.visualBelow = visualBelow;

            el.dataset.isBelow = '';
            el.style.outline = '';
            el.style.outlineOffset = '';

            const tailMargin = 18;
            const tailX = Math.max(tailMargin, Math.min(rect.width - tailMargin, anchorX - item.x));
            const tail = el.querySelector('.speech-tail');
            const tailBorder = el.querySelector('.speech-tail-border');
            const isBubbleBelow = visualBelow;
            if (tail) tail.style.left = `${tailX - 8}px`;
            if (tailBorder) tailBorder.style.left = `${tailX - 9}px`;

            if (isBubbleBelow) {
                const minTipY = circleRect ? circleRect.bottom + 6 : anchorY;
                const tipY = Math.min(bottomBound - 6, Math.max(minTipY, topBound + 6));
                const tailLength = Math.max(14, item.y - tipY);
                if (tailBorder) {
                    tailBorder.style.top = `${-(tailLength + 2)}px`;
                    tailBorder.style.borderBottomWidth = `${tailLength + 2}px`;
                    tailBorder.style.borderTopWidth = '0';
                    tailBorder.style.borderTop = '0';
                    tailBorder.style.borderBottom = `${tailLength + 2}px solid #000`;
                }
                if (tail) {
                    tail.style.top = `${-(tailLength-1)}px`;
                    tail.style.borderBottomWidth = `${tailLength}px`;
                    tail.style.borderTopWidth = '0';
                    tail.style.borderTop = '0';
                    tail.style.borderBottom = `${tailLength}px solid #fff`;
                }
            } else {
                const tailStartY = item.y + rect.height - 4;
                const desiredTipY = Math.min(bottomBound - 6, Math.max(topBound + 6, anchorY));
                const tailLength = Math.max(14, desiredTipY - tailStartY);
                if (tailBorder) {
                    tailBorder.style.top = `${rect.height - 2}px`;
                    tailBorder.style.borderTopWidth = `${tailLength + 2}px`;
                    tailBorder.style.borderBottomWidth = '0';
                    tailBorder.style.borderBottom = '0';
                    tailBorder.style.borderTop = `${tailLength + 2}px solid #000`;
                }
                if (tail) {
                    tail.style.top = `${rect.height - 4}px`;
                    tail.style.borderTopWidth = `${tailLength}px`;
                    tail.style.borderBottomWidth = '0';
                    tail.style.borderBottom = '0';
                    tail.style.borderTop = `${tailLength}px solid #fff`;
                }
            }
        }
    }
}
