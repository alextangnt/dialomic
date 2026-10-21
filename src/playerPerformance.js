// Optional on-device diagnostics. Enable with player.html?perf=1.
export class PlayerPerformanceHud {
    constructor() {
        this.panels = new WeakMap();
        this.lastTransition = 'waiting for a transition';
        this.peakWorkMs = 0;
        this.lastPaint = -Infinity;
        this.el = document.createElement('output');
        this.el.style.cssText = 'position:fixed;bottom:4px;left:4px;z-index:100000;pointer-events:none;white-space:pre-wrap;background:#000d;color:#fff;padding:6px;font:11px/1.4 monospace;max-width:calc(100vw - 20px)';
        document.body.appendChild(this.el);
    }

    recordPanel(panel, transition, expectedMs) {
        let record = this.panels.get(panel);
        if (record?.transition !== transition) {
            record = { transition, frames: 0 };
            this.panels.set(panel, record);
        }
        record.frames += 1;
        if (!panel.isUpdating) {
            this.lastTransition = `${Math.round(performance.now() - transition.startTime)}ms / ${expectedMs}ms target · ${record.frames} frames`;
            this.lastPaint = -Infinity;
        }
    }

    recordFrame(startedAt) {
        const now = performance.now();
        const workMs = now - startedAt;
        this.peakWorkMs = Math.max(this.peakWorkMs, workMs);
        if (now - this.lastPaint < 250) return;
        this.lastPaint = now;
        this.el.textContent = `elapsed-v2 · viewport ${window.innerWidth}×${window.innerHeight}\n${this.lastTransition}\nplayer work ${Math.round(workMs)}ms · peak ${Math.round(this.peakWorkMs)}ms`;
    }

    destroy() {
        this.el.remove();
    }
}
