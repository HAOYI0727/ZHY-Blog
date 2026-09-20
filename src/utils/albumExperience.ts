export function initAlbumExperience() {
    if (typeof window === "undefined") return;
    window.__twilightAlbumExperienceCleanup?.();
    const root = document.querySelector<HTMLElement>("[data-album-page]");
    if (!root) return;

    const controller = new AbortController();
    window.__twilightAlbumExperienceCleanup = () => controller.abort();
    const { signal } = controller;

    const albumId = root.dataset.albumId;
    const viewsNode = root.querySelector<HTMLElement>("[data-album-views] strong");
    if (albumId && viewsNode) {
        const storageKey = `album-viewed:${albumId}`;
        const loadViews = async () => {
            let viewed = false;
            try { viewed = sessionStorage.getItem(storageKey) === "1"; } catch { /* private mode */ }
            try {
                const response = await fetch(viewed ? `/api/engagement/?post=${encodeURIComponent(albumId)}` : "/api/engagement/", {
                    method: viewed ? "GET" : "POST",
                    headers: viewed ? undefined : { "content-type": "application/json" },
                    body: viewed ? undefined : JSON.stringify({ post: albumId, action: "view" }),
                    signal,
                    cache: "no-store",
                });
                if (!response.ok) return;
                const payload = await response.json() as { views?: number };
                viewsNode.textContent = new Intl.NumberFormat().format(Math.max(0, Number(payload.views) || 0));
                if (!viewed) { try { sessionStorage.setItem(storageKey, "1"); } catch {} }
            } catch { /* view metrics are optional */ }
        };
        loadViews();
    }
}

declare global {
    interface Window { __twilightAlbumExperienceCleanup?: () => void; }
}
