<script lang="ts">
import { getPostUrl } from "@utils/url";
import { getCategoryPathLabel, getCategoryPathParts } from "@utils/category";
import { parseTags } from "@utils/tag";
import { i18n } from "@i18n/translation";
import I18nKey from "@i18n/i18nKey";

interface Post {
    id: string;
    data: { title: string; tags: string[]; category?: string | string[] | null; published: Date | string; cover?: string };
}
interface MonthGroup { key: string; year: number; month: number; posts: Post[]; cover?: string }
interface YearGroup { year: number; months: MonthGroup[]; count: number }
interface Props { sortedPosts?: Post[]; tags?: string[]; categories?: string[]; uncategorized?: string | null }

let { sortedPosts = [], tags = [], categories = [], uncategorized = null }: Props = $props();

function formatDate(date: Date | string) {
    return new Date(date).toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" });
}
function isCategoryMatch(category: string | string[] | null | undefined, targets: string[]) {
    const postParts = getCategoryPathParts(category);
    if (!postParts?.length) return false;
    return targets.some((target) => {
        const targetParts = target.split(" / ").map((part) => part.trim()).filter(Boolean);
        return targetParts.length <= postParts.length && targetParts.every((part, index) => part === postParts[index]);
    });
}

let groups = $derived.by(() => {
    let filtered = sortedPosts.map((post) => ({ ...post, data: { ...post.data, published: new Date(post.data.published) } }));
    if (tags.length) filtered = filtered.filter((post) => parseTags(post.data.tags).some((tag) => tags.includes(tag)));
    if (categories.length) filtered = filtered.filter((post) => isCategoryMatch(post.data.category, categories));
    if (uncategorized !== null) filtered = filtered.filter((post) => !getCategoryPathLabel(post.data.category));
    filtered.sort((a, b) => new Date(b.data.published).getTime() - new Date(a.data.published).getTime());

    const monthMap = new Map<string, MonthGroup>();
    for (const post of filtered) {
        const date = new Date(post.data.published);
        const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
        const month = monthMap.get(key) || { key, year: date.getFullYear(), month: date.getMonth() + 1, posts: [] };
        month.posts.push(post);
        if (!month.cover && post.data.cover) month.cover = post.data.cover;
        monthMap.set(key, month);
    }
    const years = new Map<number, YearGroup>();
    Array.from(monthMap.values()).forEach((month) => {
        const year = years.get(month.year) || { year: month.year, months: [], count: 0 };
        year.months.push(month);
        year.count += month.posts.length;
        years.set(month.year, year);
    });
    return Array.from(years.values()).sort((a, b) => b.year - a.year).map((year) => ({ ...year, months: year.months.sort((a, b) => b.month - a.month) }));
});
</script>

<div class="archive-timeline">
    {#each groups as group, yearIndex}
        <section class="archive-year">
            <div class="archive-year-marker"><span>{String(yearIndex + 1).padStart(2, "0")}</span><strong>{group.year}</strong><small>{group.count} {i18n(group.count === 1 ? I18nKey.postCount : I18nKey.postsCount)}</small></div>
            <div class="archive-year-line"></div>
            <div class="archive-months">
                {#each group.months as month}
                    <article class="archive-month">
                        <header class="archive-month-header">
                            <div><span class="archive-month-number">{String(month.month).padStart(2, "0")}</span><h2>{new Date(group.year, month.month - 1, 1).toLocaleDateString("zh-CN", { month: "long" })}</h2></div>
                            <span>{month.posts.length} 篇</span>
                        </header>
                        <div class="archive-posts">
                            {#each month.posts as post}
                                <a href={getPostUrl(post)} class="archive-post">
                                    <time datetime={new Date(post.data.published).toISOString()}>{formatDate(post.data.published)}</time>
                                    <span class="archive-post-dot"></span>
                                    <span class="archive-post-title">{post.data.title}</span>
                                    {#if getCategoryPathParts(post.data.category)?.[0]}<span class="archive-post-category">{getCategoryPathParts(post.data.category)?.[0]?.replaceAll("_", " ")}</span>{/if}
                                    <span class="i-material-symbols:arrow-outward-rounded archive-post-arrow"></span>
                                </a>
                            {/each}
                        </div>
                    </article>
                {/each}
            </div>
        </section>
    {:else}
        <div class="archive-empty"><span class="i-material-symbols:inventory-2-outline-rounded"></span><p>暂无符合条件的文章</p></div>
    {/each}
</div>

<style>
    .archive-timeline { position:relative; display:grid; gap:2.3rem; }
    .archive-year { display:grid; grid-template-columns:8.4rem 1px minmax(0,1fr); gap:1.4rem; align-items:stretch; }
    .archive-year-marker { position:sticky; top:1rem; align-self:start; padding-top:.2rem; text-align:right; }
    .archive-year-marker span { display:block; color:var(--primary); font-size:.65rem; font-weight:800; letter-spacing:.17em; }
    .archive-year-marker strong { display:block; margin:.1rem 0 .22rem; color:var(--text-color); font-size:2.25rem; line-height:1; letter-spacing:-.07em; }
    .archive-year-marker small { color:var(--text-tertiary); font-size:.72rem; }
    .archive-year-line { position:relative; width:1px; background:linear-gradient(180deg, color-mix(in srgb, var(--primary) 75%, transparent), var(--line-divider) 70%, transparent); }
    .archive-year-line::before { content:""; position:absolute; top:.45rem; left:50%; width:.55rem; height:.55rem; border:2px solid var(--card-bg); border-radius:50%; background:var(--primary); box-shadow:0 0 0 3px color-mix(in srgb, var(--primary) 20%, transparent); transform:translateX(-50%); }
    .archive-months { display:grid; gap:1rem; }
    .archive-month { overflow:hidden; border:1px solid var(--line-divider); border-radius:1.05rem; background:color-mix(in srgb, var(--card-bg) 82%, transparent); }
    .archive-month-header { display:flex; align-items:center; justify-content:space-between; gap:1rem; padding:.85rem 1rem .75rem; border-bottom:1px solid var(--line-divider); background:linear-gradient(90deg, color-mix(in srgb, var(--primary) 9%, transparent), transparent 55%); }
    .archive-month-header > div { display:flex; align-items:center; gap:.65rem; }
    .archive-month-number { display:grid; width:2rem; height:2rem; place-items:center; border-radius:.65rem; background:color-mix(in srgb, var(--primary) 13%, var(--btn-regular-bg)); color:var(--primary); font-size:.72rem; font-weight:800; }
    .archive-month-header h2 { margin:0; color:var(--text-color); font-size:1.05rem; }
    .archive-month-header > span { color:var(--text-tertiary); font-size:.72rem; }
    .archive-posts { padding:.3rem .7rem .5rem; }
    .archive-post { display:grid; grid-template-columns:3.3rem .6rem minmax(0,1fr) auto auto; align-items:center; gap:.55rem; min-height:2.55rem; border-radius:.65rem; color:var(--text-secondary); transition:background 150ms ease, color 150ms ease, transform 150ms ease; }
    .archive-post:hover { background:color-mix(in srgb, var(--primary) 8%, transparent); color:var(--text-color); transform:translateX(3px); }
    .archive-post time { color:var(--text-tertiary); font-size:.72rem; font-variant-numeric:tabular-nums; text-align:right; }
    .archive-post-dot { width:.32rem; height:.32rem; border-radius:50%; background:var(--line-divider); transition:background 150ms ease, transform 150ms ease; }
    .archive-post:hover .archive-post-dot { background:var(--primary); transform:scale(1.5); }
    .archive-post-title { overflow:hidden; font-size:.86rem; font-weight:650; text-overflow:ellipsis; white-space:nowrap; }
    .archive-post-category { max-width:7rem; overflow:hidden; border:1px solid color-mix(in srgb, var(--primary) 16%, transparent); border-radius:999px; padding:.18rem .45rem; color:var(--primary); font-size:.64rem; text-overflow:ellipsis; white-space:nowrap; }
    .archive-post-arrow { color:var(--text-tertiary); font-size:1rem; opacity:0; transition:opacity 150ms ease, transform 150ms ease; }
    .archive-post:hover .archive-post-arrow { opacity:1; transform:translate(2px,-2px) rotate(45deg); }
    .archive-empty { display:grid; place-items:center; gap:.55rem; min-height:16rem; color:var(--text-tertiary); }
    .archive-empty > span { font-size:2.3rem; }
    .archive-empty p { margin:0; font-size:.88rem; }
    @media (max-width: 700px) { .archive-year { grid-template-columns:4rem 1px minmax(0,1fr); gap:.8rem; } .archive-year-marker strong { font-size:1.55rem; } .archive-year-marker small { font-size:.64rem; } .archive-post { grid-template-columns:2.8rem .4rem minmax(0,1fr) auto; gap:.4rem; } .archive-post-category { display:none; } .archive-post-arrow { display:none; } }
</style>
