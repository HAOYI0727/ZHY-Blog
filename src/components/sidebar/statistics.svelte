<script lang="ts">
    import { i18n } from "@i18n/translation";
    import I18nKey from "@i18n/i18nKey";

    type TimeScale = "year" | "month" | "day";
    type CountItem = { name: string; count: number };
    type ActivityPoint = { label: string; fullLabel: string; count: number };

    let {
        publishedDates = [], categories = [], tags = [],
        side = "default",
    }: {
        publishedDates?: string[]; categories?: CountItem[]; tags?: CountItem[];
        side?: string;
    } = $props();

    const labels = {
        year: i18n(I18nKey.year), month: i18n(I18nKey.month), day: i18n(I18nKey.day),
        posts: i18n(I18nKey.posts), activities: "Activities",
        categories: i18n(I18nKey.categories), tags: i18n(I18nKey.tags),
        statistics: i18n(I18nKey.statistics),
    };
    let timeScale = $state<TimeScale>("year");
    const scaleOptions: { value: TimeScale; label: string }[] = [
        { value: "year", label: labels.year },
        { value: "month", label: labels.month },
        { value: "day", label: labels.day },
    ];
    const pad = (value: number) => String(value).padStart(2, "0");
    const localDay = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    const localMonth = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;

    function buildActivity(scale: TimeScale): ActivityPoint[] {
        const dates = publishedDates.map((value) => new Date(value)).filter((date) => !Number.isNaN(date.getTime()));
        const now = new Date();
        if (scale === "year") {
            const oldest = dates.length ? Math.min(...dates.map((date) => date.getFullYear())) : now.getFullYear();
            // 年度视图至少展示最近三年，即使文章只集中在较新的年份。
            const start = Math.min(oldest, now.getFullYear() - 2);
            return Array.from({ length: now.getFullYear() - start + 1 }, (_, index) => {
                const year = start + index;
                return { label: String(year), fullLabel: String(year), count: dates.filter((date) => date.getFullYear() === year).length };
            });
        }
        if (scale === "month") {
            return Array.from({ length: 12 }, (_, index) => {
                const date = new Date(now.getFullYear(), now.getMonth() - (11 - index), 1);
                const key = localMonth(date);
                return { label: date.toLocaleDateString(undefined, { month: "short" }), fullLabel: key, count: dates.filter((item) => localMonth(item) === key).length };
            });
        }
        return Array.from({ length: 30 }, (_, index) => {
            const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (29 - index));
            const key = localDay(date);
            return { label: pad(date.getDate()), fullLabel: key, count: dates.filter((item) => localDay(item) === key).length };
        });
    }

    function activityGeometry(points: ActivityPoint[]) {
        const left = 24, right = 292, top = 34, bottom = 132;
        const max = Math.max(...points.map((point) => point.count), 1);
        const coords = points.map((point, index) => ({
            ...point,
            x: points.length === 1 ? left : left + (index / (points.length - 1)) * (right - left),
            y: bottom - (point.count / max) * (bottom - top),
            showLabel: points.length <= 12 || index % 5 === 0 || index === points.length - 1,
        }));
        const line = coords.map((point) => `${point.x},${point.y}`).join(" ");
        const area = coords.length ? `M ${coords[0].x} ${bottom} L ${coords.map((point) => `${point.x} ${point.y}`).join(" L ")} L ${coords.at(-1)?.x ?? right} ${bottom} Z` : "";
        return { coords, line, area, top, bottom, left, right };
    }

    function radarGeometry(items: CountItem[]) {
        const data = [...items].sort((a, b) => b.count - a.count).slice(0, 8);
        const cx = 150, cy = 91, radius = 54;
        const max = Math.max(...data.map((item) => item.count), 5);
        const points = data.map((item, index) => {
            const angle = -Math.PI / 2 + (Math.PI * 2 * index) / data.length;
            return {
                ...item,
                x: cx + Math.cos(angle) * radius * (item.count / max),
                y: cy + Math.sin(angle) * radius * (item.count / max),
                axisX: cx + Math.cos(angle) * radius,
                axisY: cy + Math.sin(angle) * radius,
            };
        });
        const rings = [0.25, 0.5, 0.75, 1].map((ratio) => data.map((_, index) => {
            const angle = -Math.PI / 2 + (Math.PI * 2 * index) / data.length;
            return `${cx + Math.cos(angle) * radius * ratio},${cy + Math.sin(angle) * radius * ratio}`;
        }).join(" "));
        return { points, rings, polygon: points.map((point) => `${point.x},${point.y}`).join(" "), cx, cy };
    }

    let activity = $derived(activityGeometry(buildActivity(timeScale)));
    let categoryRadar = $derived(radarGeometry(categories));
    let tagRadar = $derived(radarGeometry(tags));
</script>

{#snippet lineChart()}
    <svg class="chart-svg" viewBox="0 0 310 158" role="img" aria-label={labels.activities}>
        <defs><linearGradient id={`activity-fill-${side}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--primary)" stop-opacity="0.36"/><stop offset="1" stop-color="var(--primary)" stop-opacity="0.02"/></linearGradient></defs>
        <text class="chart-title" x="8" y="16">{labels.activities}</text>
        {#each [0, 0.5, 1] as ratio}<line class="grid-line" x1={activity.left} x2={activity.right} y1={activity.top + (activity.bottom - activity.top) * ratio} y2={activity.top + (activity.bottom - activity.top) * ratio}/>{/each}
        {#if activity.area}<path d={activity.area} fill={`url(#activity-fill-${side})`}/>{/if}
        <polyline class="activity-line" points={activity.line}/>
        {#each activity.coords as point}
            <circle class="activity-dot" cx={point.x} cy={point.y} r="3"><title>{point.fullLabel}: {point.count} {labels.posts}</title></circle>
            {#if point.showLabel}<text class="axis-label" x={point.x} y="150" text-anchor="middle">{point.label}</text>{/if}
        {/each}
    </svg>
{/snippet}

{#snippet radarChart(title: string, radar: ReturnType<typeof radarGeometry>, tone: "orange" | "green")}
    <svg class="chart-svg" viewBox="0 0 310 158" role="img" aria-label={title}>
        <text class="chart-title" x="8" y="16">{title}</text>
        {#each radar.rings as ring}<polygon class="radar-ring" points={ring}/>{/each}
        {#each radar.points as point}
            <line class="radar-axis" x1={radar.cx} y1={radar.cy} x2={point.axisX} y2={point.axisY}/>
            <text class="radar-label" x={radar.cx + (point.axisX - radar.cx) * 1.2} y={radar.cy + (point.axisY - radar.cy) * 1.14} text-anchor={point.axisX < radar.cx - 5 ? "end" : point.axisX > radar.cx + 5 ? "start" : "middle"}>{point.name}</text>
        {/each}
        {#if radar.points.length}
            <polygon class="radar-data" class:radar-orange={tone === "orange"} class:radar-green={tone === "green"} points={radar.polygon}/>
            {#each radar.points as point}<circle class="radar-dot" class:dot-orange={tone === "orange"} class:dot-green={tone === "green"} cx={point.x} cy={point.y} r="2.8"><title>{point.name}: {point.count}</title></circle>{/each}
        {/if}
    </svg>
{/snippet}

<div class="stats-charts px-3" aria-label={labels.statistics}>
    <section class="chart-section">
        <div class="scale-control" role="group" aria-label={labels.activities}>
            {#each scaleOptions as option}
                <button
                    type="button"
                    class:active={timeScale === option.value}
                    aria-pressed={timeScale === option.value}
                    onclick={() => (timeScale = option.value)}
                >{option.label}</button>
            {/each}
        </div>
        {@render lineChart()}
    </section>
    <section class="chart-section">{@render radarChart(labels.categories, categoryRadar, "orange")}</section>
    <section class="chart-section">{@render radarChart(labels.tags, tagRadar, "green")}</section>
</div>

<style>
    .stats-charts{display:flex;flex-direction:column;gap:.6rem;width:100%}.chart-section{position:relative;width:100%;min-height:158px;overflow:visible}.chart-svg{display:block;width:100%;height:auto;min-height:158px;overflow:visible;color:var(--primary)}.chart-title{fill:currentColor;font-size:13px;font-weight:700}.grid-line,.radar-ring,.radar-axis{stroke:color-mix(in srgb,currentColor 16%,transparent);stroke-width:1;fill:none}.activity-line{fill:none;stroke:currentColor;stroke-width:2.6;stroke-linecap:round;stroke-linejoin:round}.activity-dot{fill:var(--card-bg);stroke:currentColor;stroke-width:2}.axis-label,.radar-label{fill:color-mix(in srgb,currentColor 72%,transparent);font-size:8px}.radar-data{stroke-width:2;stroke-linejoin:round}.radar-orange{fill:rgb(249 115 22/.28);stroke:rgb(249 115 22/.88)}.radar-green{fill:rgb(16 185 129/.28);stroke:rgb(16 185 129/.88)}.radar-dot{stroke-width:1.4}.dot-orange{fill:rgb(249 115 22);stroke:var(--card-bg)}.dot-green{fill:rgb(16 185 129);stroke:var(--card-bg)}.scale-control{position:absolute;z-index:2;right:.25rem;top:0;display:flex;overflow:hidden;border:1px solid var(--line-divider);border-radius:.45rem;background:var(--btn-regular-bg)}.scale-control button{min-height:26px;border:0;border-right:1px solid var(--line-divider);background:transparent;color:color-mix(in srgb,currentColor 62%,transparent);padding:2px 7px;font-size:.68rem;cursor:pointer}.scale-control button:last-child{border-right:0}.scale-control button.active{background:var(--primary);color:var(--card-bg)}@media(prefers-reduced-motion:no-preference){.activity-line,.radar-data{animation:chart-enter 360ms ease-out both}@keyframes chart-enter{from{opacity:0}to{opacity:1}}}
</style>
