type HeatStat = { heat?: number };

/**
 * Bind the article browse tabs and heat pagination for the current page.
 *
 * The posts page is loaded through Swup, so its page-local script is not
 * guaranteed to execute when navigating from another page. Keeping the
 * initializer in the persistent base layout lets us bind it after every
 * client-side navigation as well as on a hard load.
 */
export function initPostBrowseSwitcher(): void {
    const root = document.querySelector<HTMLElement>("#swup-container");
    const switcher = root?.querySelector<HTMLElement>(".post-browse-switch");
    if (!root || !switcher || switcher.dataset.postBrowseReady === "true") return;

    const buttons = Array.from(root.querySelectorAll<HTMLButtonElement>("[data-post-view-button]"));
    const panels = Array.from(root.querySelectorAll<HTMLElement>("[data-post-view]"));
    if (!buttons.length || !panels.length) return;

    switcher.dataset.postBrowseReady = "true";
    const selectView = (view: string) => {
        buttons.forEach((button) => {
            button.setAttribute("aria-selected", String(button.dataset.postViewButton === view));
        });
        panels.forEach((panel) => {
            panel.hidden = panel.dataset.postView !== view;
        });
    };

    buttons.forEach((button) => {
        button.addEventListener("click", () => selectView(button.dataset.postViewButton || "topic"));
    });
    selectView("topic");

    const cards = Array.from(root.querySelectorAll<HTMLElement>("[data-heat-card]"));
    const list = root.querySelector<HTMLElement>("[data-heat-list]");
    if (!cards.length || !list) return;

    const pageSize = 10;
    let currentPage = 1;
    const previousButton = root.querySelector<HTMLButtonElement>("[data-heat-prev]");
    const nextButton = root.querySelector<HTMLButtonElement>("[data-heat-next]");
    const pageLabel = root.querySelector<HTMLElement>("[data-heat-page]");
    const renderPage = () => {
        const pageCount = Math.max(1, Math.ceil(cards.length / pageSize));
        currentPage = Math.min(currentPage, pageCount);
        const start = (currentPage - 1) * pageSize;
        cards.forEach((card, index) => {
            card.hidden = index < start || index >= start + pageSize;
        });
        if (previousButton) previousButton.disabled = currentPage <= 1;
        if (nextButton) nextButton.disabled = currentPage >= pageCount;
        if (pageLabel) pageLabel.textContent = `第 ${currentPage} / ${pageCount} 页`;
    };

    previousButton?.addEventListener("click", () => {
        if (currentPage > 1) {
            currentPage -= 1;
            renderPage();
            list.scrollIntoView({ behavior: "smooth", block: "start" });
        }
    });
    nextButton?.addEventListener("click", () => {
        if (currentPage < Math.ceil(cards.length / pageSize)) {
            currentPage += 1;
            renderPage();
            list.scrollIntoView({ behavior: "smooth", block: "start" });
        }
    });

    const ids = cards.map((card) => card.dataset.postId || "").filter(Boolean);
    const renderHeat = (stats: Record<string, HeatStat>, showValues = true) => {
        cards.forEach((card) => {
            const stat = stats[card.dataset.postId || ""];
            card.dataset.heat = String(Math.max(0, Number(stat?.heat) || 0));
            const value = card.querySelector<HTMLElement>("[data-heat-value]");
            if (value && showValues) value.textContent = card.dataset.heat;
        });
        cards.sort((a, b) =>
            Number(b.dataset.heat) - Number(a.dataset.heat) ||
            Number(b.dataset.published) - Number(a.dataset.published) ||
            Number(a.dataset.defaultOrder) - Number(b.dataset.defaultOrder),
        );
        cards.forEach((card, index) => {
            card.querySelector<HTMLElement>("[data-heat-rank]")!.textContent = String(index + 1).padStart(2, "0");
            list.appendChild(card);
        });
        renderPage();
    };

    renderHeat({}, false);
    fetch(`/api/engagement/?posts=${encodeURIComponent(ids.join(","))}`, { credentials: "same-origin" })
        .then((response) => response.ok ? response.json() : Promise.reject(new Error("engagement unavailable")))
        .then((payload) => renderHeat(payload.posts || {}))
        .catch(() => {
            const status = root.querySelector<HTMLElement>("[data-heat-status]");
            if (status) status.textContent = "热度数据暂不可用";
        });
}
