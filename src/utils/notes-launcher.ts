type Rect = { left: number; right: number; top: number; bottom: number };
const controls = '.music-player, .music-player-error, .toc-floating-container, .toc-floating-panel, #back-to-top-btn, [data-lulu-pet], [data-lulu-panel], [data-lulu-dialog], lulu-chat, .mobile-sidebar-panel';

/** Prefer the bottom-right corner, leaving a clear gap around existing controls. */
export function notesLauncherPosition(width: number, height: number, obstacles: Rect[], size = 48) {
    const margin = 16, gap = 12;
    const right = width - margin - size, bottom = height - margin - size;
    const xs = [right, ...obstacles.map(rect => rect.left - gap - size)];
    const ys = [bottom, ...obstacles.map(rect => rect.top - gap - size)];
    const candidates = xs.flatMap(left => ys.map(top => ({ left, top })));
    return candidates.filter(({ left, top }) => left >= margin && top >= margin && left <= right && top <= bottom &&
        obstacles.every(rect => left + size + gap <= rect.left || left >= rect.right + gap || top + size + gap <= rect.top || top >= rect.bottom + gap))
        .sort((a, b) => (right - a.left + 2 * (bottom - a.top)) - (right - b.left + 2 * (bottom - b.top)))[0];
}

/** Portal outside transformed article ancestors, and release it on Swup navigation. */
export function mountNotesLauncher(launcher: HTMLButtonElement, unavailable: MediaQueryList, signal: AbortSignal) {
    const home = launcher.parentElement!;
    document.body.append(launcher);
    let frame = 0;
    const position = () => {
        frame = 0;
        if (signal.aborted) return;
        if (unavailable.matches) { launcher.hidden = true; return; }
        const view = window.visualViewport;
        const x = view?.offsetLeft || 0, y = view?.offsetTop || 0;
        const width = view?.width || window.innerWidth, height = view?.height || window.innerHeight;
        const obstacles = Array.from(document.querySelectorAll<HTMLElement>(controls)).flatMap(control => {
            if (control.closest('[hidden], [inert], [aria-hidden="true"]')) return [];
            const style = getComputedStyle(control), rect = control.getBoundingClientRect();
            if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0 || !rect.width || !rect.height) return [];
            return [{ left: rect.left - x, right: rect.right - x, top: rect.top - y, bottom: rect.bottom - y }];
        });
        const box = notesLauncherPosition(width, height, obstacles, launcher.offsetWidth || 48);
        launcher.hidden = !box;
        if (box) Object.assign(launcher.style, { left: `${box.left + x}px`, top: `${box.top + y}px`, right: 'auto', bottom: 'auto' });
    };
    const requestPosition = () => { if (!frame && !signal.aborted) frame = window.requestAnimationFrame(position); };
    const mutationObserver = new MutationObserver(records => {
        if (records.some(record => (record.target instanceof Element && record.target.closest(controls)) ||
            Array.from(record.addedNodes).some(node => node instanceof Element && (node.matches(controls) || node.querySelector(controls))))) requestPosition();
    });
    mutationObserver.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'style', 'hidden', 'aria-hidden', 'open'] });
    const resizeObserver = new ResizeObserver(requestPosition);
    document.querySelectorAll(controls).forEach(control => resizeObserver.observe(control));
    window.addEventListener('resize', requestPosition, { passive: true, signal });
    window.addEventListener('lulu:position-change', requestPosition, { signal });
    window.addEventListener('lulu:surface-change', requestPosition, { signal });
    document.addEventListener('transitionend', requestPosition, { capture: true, signal });
    unavailable.addEventListener('change', requestPosition, { signal });
    window.visualViewport?.addEventListener('resize', requestPosition, { passive: true, signal });
    window.visualViewport?.addEventListener('scroll', requestPosition, { passive: true, signal });
    position();
    return () => {
        window.cancelAnimationFrame(frame); mutationObserver.disconnect(); resizeObserver.disconnect();
        home.append(launcher);
    };
}
