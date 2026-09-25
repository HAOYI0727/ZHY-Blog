import type { APIRoute } from "astro";

export const prerender = false;

type Counts = {
    views: number;
    likes: number;
};

type EngagementAction = "view" | "like" | "unlike";

const memoryStore = new Map<string, Counts>();

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
    status,
    headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store, max-age=0",
    },
});

const normalizeEngagementId = (value: unknown) => {
    if (typeof value !== "string") return null;
    const postId = value.trim();
    if (!/^\/(?:posts|albums|diary)\/[a-z0-9_\-/]+\/$/i.test(postId) || postId.length > 240) return null;
    return postId;
};

const getRedisConfig = () => {
    const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
    return url && token ? { url: url.replace(/\/$/, ""), token } : null;
};

const redisCommand = async (command: Array<string | number>) => {
    const config = getRedisConfig();
    if (!config) throw new Error("Persistent engagement storage is not configured");

    const response = await fetch(config.url, {
        method: "POST",
        headers: {
            authorization: `Bearer ${config.token}`,
            "content-type": "application/json",
        },
        body: JSON.stringify(command),
    });
    const payload = await response.json() as { result?: unknown; error?: string };
    if (!response.ok || payload.error) throw new Error(payload.error || "Redis request failed");
    return payload.result;
};

const parseHash = (value: unknown): Counts => {
    const record: Record<string, string> = {};
    if (Array.isArray(value)) {
        for (let index = 0; index < value.length; index += 2) {
            record[String(value[index])] = String(value[index + 1] ?? "0");
        }
    } else if (value && typeof value === "object") {
        for (const [field, count] of Object.entries(value)) record[field] = String(count ?? "0");
    } else {
        return { views: 0, likes: 0 };
    }
    return {
        views: Math.max(0, Number.parseInt(record.views || "0", 10) || 0),
        likes: Math.max(0, Number.parseInt(record.likes || "0", 10) || 0),
    };
};

const readPersistentCounts = async (postId: string) => {
    const key = `blog:engagement:${postId}`;
    return parseHash(await redisCommand(["HGETALL", key]));
};

const updatePersistentCounts = async (postId: string, action: EngagementAction) => {
    const key = `blog:engagement:${postId}`;
    const field = action === "view" ? "views" : "likes";
    const amount = action === "unlike" ? -1 : 1;
    const updated = Number(await redisCommand(["HINCRBY", key, field, amount])) || 0;
    if (updated < 0) await redisCommand(["HSET", key, field, 0]);
    return readPersistentCounts(postId);
};

const readDevelopmentCounts = (postId: string) => memoryStore.get(postId) || { views: 0, likes: 0 };

const updateDevelopmentCounts = (postId: string, action: EngagementAction) => {
    const counts = { ...readDevelopmentCounts(postId) };
    if (action === "view") counts.views += 1;
    if (action === "like") counts.likes += 1;
    if (action === "unlike") counts.likes = Math.max(0, counts.likes - 1);
    memoryStore.set(postId, counts);
    return counts;
};

const withHeat = (counts: Counts) => ({ ...counts, heat: counts.views + counts.likes * 6 });

export const GET: APIRoute = async ({ url }) => {
    const postIds = (url.searchParams.get("posts") || "")
        .split(",")
            // URLSearchParams 已经完成了解码；再次 decodeURIComponent 会让畸形输入直接抛出异常。
            .map((postId) => normalizeEngagementId(postId))
        .filter((postId): postId is string => Boolean(postId));

    if (postIds.length > 0) {
        const persistentConfig = getRedisConfig();
        if (!persistentConfig && !import.meta.env.DEV) {
            return json({ error: "Persistent engagement storage is not configured", storage: "unavailable" }, 503);
        }
        try {
            const entries = await Promise.all(postIds.slice(0, 100).map(async (postId) => {
                const counts = persistentConfig
                    ? await readPersistentCounts(postId)
                    : import.meta.env.DEV
                        ? readDevelopmentCounts(postId)
                        : { views: 0, likes: 0 };
                return [postId, withHeat(counts)] as const;
            }));
            return json({ posts: Object.fromEntries(entries), storage: persistentConfig ? "persistent" : "development-memory" });
        } catch {
            return json({ error: "Unable to read engagement data" }, 502);
        }
    }

    const postId = normalizeEngagementId(url.searchParams.get("post"));
    if (!postId) return json({ error: "Invalid post id" }, 400);

    try {
        if (getRedisConfig()) return json({ ...withHeat(await readPersistentCounts(postId)), storage: "persistent" });
        if (import.meta.env.DEV) return json({ ...withHeat(readDevelopmentCounts(postId)), storage: "development-memory" });
        return json({ error: "Persistent engagement storage is not configured" }, 503);
    } catch {
        return json({ error: "Unable to read engagement data" }, 502);
    }
};

export const POST: APIRoute = async ({ request }) => {
    let body: { post?: unknown; action?: unknown };
    try {
        body = await request.json();
    } catch {
        return json({ error: "Invalid JSON body" }, 400);
    }

    const postId = normalizeEngagementId(body.post);
    const action = body.action;
    if (!postId || (action !== "view" && action !== "like" && action !== "unlike")) {
        return json({ error: "Invalid engagement request" }, 400);
    }

    try {
        if (getRedisConfig()) return json({ ...withHeat(await updatePersistentCounts(postId, action)), storage: "persistent" });
        if (import.meta.env.DEV) return json({ ...withHeat(updateDevelopmentCounts(postId, action)), storage: "development-memory" });
        return json({ error: "Persistent engagement storage is not configured" }, 503);
    } catch {
        return json({ error: "Unable to update engagement data" }, 502);
    }
};
