/** The article uses its own scroll pane only while the notebook is open. */
export function readingScroller(article: HTMLElement): HTMLElement | undefined {
    const pane = article.closest<HTMLElement>("[data-notes-article]");
    return pane?.closest<HTMLElement>("reading-notes")?.dataset.open === "true" ? pane : undefined;
}

export function readingPosition(article: HTMLElement) {
    const pane = readingScroller(article);
    return pane
        ? { offset: pane.scrollTop, distance: Math.max(pane.scrollHeight - pane.clientHeight, 1) }
        : { offset: -article.getBoundingClientRect().top, distance: Math.max(article.offsetHeight - window.innerHeight, 1) };
}

export function scrollReadingTo(article: HTMLElement, progress: number) {
    const { distance } = readingPosition(article);
    const pane = readingScroller(article);
    if (pane) pane.scrollTop = distance * progress;
    else window.scrollTo({ top: article.getBoundingClientRect().top + window.scrollY + distance * progress, behavior: "auto" });
}

export function scrollReadingHeading(target: HTMLElement): boolean {
    const pane = readingScroller(target);
    if (!pane) return false;
    pane.scrollTo({ top: pane.scrollTop + target.getBoundingClientRect().top - pane.getBoundingClientRect().top - 16, behavior: "smooth" });
    return true;
}
