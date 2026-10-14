import type { APIRoute } from "astro";
import { getCollection } from "astro:content";
import { getPostUrl } from "@utils/url";
import { plainAIText } from "@utils/ai";

export const prerender = false;

const escapeHTML = (value: string) => value.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);

// Production uses Pagefind. This endpoint makes local development searchable
// without a stale build index or exposing encrypted/draft content.
export const GET: APIRoute = async ({ url }) => {
    if (import.meta.env.STATIC_HOSTING) return Response.json({ error: "请使用页面内的 Pagefind 搜索", results: [] });
    if (!import.meta.env.DEV) return new Response(null, { status: 404 });
    const query = (url.searchParams.get("q") || "").trim().toLowerCase();
    if (!query || query.length > 100) return Response.json({ results: [] }, { status: query.length > 100 ? 400 : 200 });
    const terms = query.split(/\s+/u);
    const posts = await getCollection("posts", post => !post.data.encrypted && !post.data.draft);
    const results = posts.map(post => {
        const title = post.data.title;
        const metadata = [title, ...(post.data.tags || []), post.data.description || ""].join(" ").toLowerCase();
        const text = plainAIText(post.body || "").replace(/\s+/g, " ");
        const body = text.toLowerCase();
        if (!terms.every(term => metadata.includes(term) || body.includes(term))) return null;
        const score = terms.reduce((sum, term) => sum + (title.toLowerCase().includes(term) ? 8 : metadata.includes(term) ? 4 : 1), 0);
        const index = Math.max(0, body.indexOf(terms[0]));
        const start = Math.max(0, index - 35);
        const excerpt = `${start ? "…" : ""}${text.slice(start, start + 180)}${text.length > start + 180 ? "…" : ""}`;
        return { score, url: getPostUrl(post), meta: { title }, excerpt: escapeHTML(excerpt) };
    }).filter(item => item !== null).sort((a, b) => b.score - a.score).slice(0, 12).map(({ score: _, ...result }) => result);
    return Response.json({ results }, { headers: { "cache-control": "no-store" } });
};
