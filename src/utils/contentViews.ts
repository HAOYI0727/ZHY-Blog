type ViewPayload = {
    posts?: Record<string, { views?: number }>;
};

const formatViews = (value: unknown) => new Intl.NumberFormat(
    document.documentElement.lang || "zh-CN",
    { notation: "compact", maximumFractionDigits: 1 },
).format(Math.max(0, Number(value) || 0));

export function initContentViews() {
    if (typeof window === "undefined") return;
    window.__twilightContentViewsCleanup?.();

    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 10_000);
    window.__twilightContentViewsCleanup = () => { window.clearTimeout(timer); controller.abort(); };
    const { signal } = controller;
    const pending: Promise<void>[] = [];
    const tracked = document.querySelector<HTMLElement>("[data-view-track][data-view-id]");
    if (tracked) {
        const id = tracked.dataset.viewId;
        const output = tracked.querySelector<HTMLElement>("[data-view-count]");
        if (id && output) {
            const storageKey = `content-viewed:${id}`;
            let viewed = false;
            try { viewed = sessionStorage.getItem(storageKey) === "1"; } catch { /* private mode */ }
            pending.push(fetch(viewed ? `/api/engagement/?post=${encodeURIComponent(id)}` : "/api/engagement/", {
                method: viewed ? "GET" : "POST",
                headers: viewed ? undefined : { "content-type": "application/json" },
                body: viewed ? undefined : JSON.stringify({ post: id, action: "view" }),
                cache: "no-store",
                signal,
            }).then(async (response) => {
                if (!response.ok) return;
                const payload = await response.json() as { views?: number };
                if (signal.aborted || !payload || !Number.isSafeInteger(payload.views) || Number(payload.views) < 0) return;
                output.textContent = formatViews(payload.views);
                if (!viewed) {
                    try { sessionStorage.setItem(storageKey, "1"); } catch { /* private mode */ }
                }
            }).catch(() => {
                // 统计服务不可用时保留占位符，不影响内容阅读。
            }));
        }
    }
    const nodes = Array.from(document.querySelectorAll<HTMLElement>("[data-card-view-id]"));
    const ids = [...new Set(nodes.map((node) => node.dataset.cardViewId).filter((id): id is string => Boolean(id)))];
    if (ids.length > 0) pending.push(fetch(`/api/engagement/?posts=${ids.map(encodeURIComponent).join(",")}`, {
        cache: "no-store",
        signal,
    }).then(async (response) => {
        if (!response.ok) return;
        const payload = await response.json() as ViewPayload;
        if (signal.aborted || !payload?.posts) return;
        for (const node of nodes) {
            const id = node.dataset.cardViewId;
            const count = id ? payload.posts?.[id]?.views : undefined;
            if (!Number.isSafeInteger(count) || Number(count) < 0) continue;
            node.querySelectorAll<HTMLElement>("[data-view-count]").forEach((target) => {
                target.textContent = formatViews(count);
            });
        }
    }).catch(() => {
        // 统计服务不可用时保留占位符，不影响卡片导航。
    }));
    void Promise.allSettled(pending).then(() => window.clearTimeout(timer));
}

declare global {
    interface Window {
        __twilightContentViewsCleanup?: () => void;
    }
}
