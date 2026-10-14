import { getPreference, nonnegativeCount } from "@utils/storage";

export type PostStat = { views: number; likes: number; heat: number; liked: boolean };
export type PostStats = Record<string, PostStat>;

export function readEngagementStats(): PostStats {
    const stats: PostStats = {};
    try {
        const parsed = JSON.parse(getPreference("blog-post-engagement-v1") || "{}");
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return stats;
        for (const [path, value] of Object.entries(parsed)) {
            if (!/^\/(posts|albums|diary)\//.test(path) || !value || typeof value !== "object") continue;
            const item = value as Partial<PostStat>;
            const views = nonnegativeCount(item.views), likes = nonnegativeCount(item.likes);
            stats[path] = { views, likes, heat: views + likes * 6, liked: item.liked === true };
        }
    } catch { /* Ignore malformed or unavailable storage. */ }
    return stats;
}
