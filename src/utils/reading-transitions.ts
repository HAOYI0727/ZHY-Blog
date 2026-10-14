/** A layout and scroll-position change is revealed together, without a visible jump. */
export function readingTransitions(element: HTMLElement, signal: AbortSignal) {
    let generation = 0;
    let transition: ViewTransition | undefined;
    let animation: Animation | undefined;
    const stop = () => {
        generation++; transition?.skipTransition(); animation?.cancel();
        transition = undefined; animation = undefined;
        delete document.documentElement.dataset.notesTransition;
    };
    signal.addEventListener('abort', stop, { once: true });
    const run = (update: () => void, animate = true) => {
        stop();
        const current = generation;
        const valid = () => !signal.aborted && current === generation;
        const apply = () => { if (valid()) update(); };
        if (!valid()) return;
        if (!animate || window.matchMedia('(prefers-reduced-motion: reduce)').matches) { apply(); return; }
        if (document.startViewTransition) {
            document.documentElement.dataset.notesTransition = 'true';
            try {
                transition = document.startViewTransition(apply);
                void transition.ready.catch(() => {});
                void transition.finished.catch(() => {}).then(() => {
                    if (valid()) { delete document.documentElement.dataset.notesTransition; transition = undefined; }
                });
                return;
            } catch { delete document.documentElement.dataset.notesTransition; }
        }
        // Older browsers fade out before changing geometry, then reveal the new layout.
        if (!element.animate) { apply(); return; }
        animation = element.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 120, fill: 'forwards', easing: 'ease-out' });
        void animation.finished.then(() => {
            if (!valid()) return;
            apply();
            animation?.cancel();
            animation = element.animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 240, easing: 'ease-out' });
            return animation.finished;
        }).catch(() => {});
    };
    return { run, stop };
}
