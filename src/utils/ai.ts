/** Only this zero-priced model is allowed; no paid-model fallback. */
export const AI_MODELS = ["glm-4.7-flash"] as const;
export const DEFAULT_AI_MODEL = AI_MODELS[0];
export const MAX_ARTICLE_LENGTH = 60_000;
export const MAX_MESSAGE_LENGTH = 2_000;
export const MAX_HISTORY_LENGTH = 10;

export type AIMessage = { role: "user" | "model"; text: string };
export type AILink = { title: string; url: string };

export function plainAIText(text: string): string {
    return text.replace(/`([^`]+)`/g, "$1").replace(/\*\*([^*]+)\*\*/g, "$1")
        .replace(/^#{1,6}[ \t]+/gm, "")
        .replace(/^[ \t]*\*[ \t]+/gm, "• ");
}

export function validHistory(value: unknown): value is AIMessage[] {
    return Array.isArray(value) && value.length <= MAX_HISTORY_LENGTH && value.every((message, index) =>
        message && typeof message === "object" && message.role === (index % 2 === 0 ? "user" : "model") &&
        typeof message.text === "string" && message.text.trim().length > 0 && message.text.length <= 6_000,
    ) && value.length % 2 === 0;
}

/** Keep context from throughout a long article rather than silently losing its ending. */
export function articleContext(body: string): string {
    if (body.length <= MAX_ARTICLE_LENGTH) return body;
    const section = Math.floor(MAX_ARTICLE_LENGTH / 3);
    const middle = Math.floor(body.length / 2);
    return `${body.slice(0, section)}\n\n[长文节选：中间部分]\n\n${body.slice(middle - Math.floor(section / 2), middle + Math.floor(section / 2))}\n\n[长文节选：结尾部分]\n\n${body.slice(-section)}`;
}
