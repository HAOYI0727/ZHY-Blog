export const MAX_NOTE_LENGTH = 100_000;
// Include phones in landscape, while keeping iPad mini portrait and desktop windows.
export const NOTES_UNAVAILABLE_QUERY = "(max-width: 639px), (hover: none) and (pointer: coarse) and (max-height: 540px) and (max-width: 1023px)";
export const noteStorageKey = (articleId: string) => `twilight:article-note:v1:${articleId}`;
export type ReadingNote = { markdown: string; updatedAt: number };

export function loadReadingNote(articleId: string): { note: ReadingNote; error?: string } {
    const empty = { markdown: "", updatedAt: 0 };
    try {
        const raw = localStorage.getItem(noteStorageKey(articleId));
        if (!raw) return { note: empty };
        const value = JSON.parse(raw);
        if (!value || value.version !== 1 || typeof value.markdown !== "string" || value.markdown.length > MAX_NOTE_LENGTH ||
            !Number.isFinite(value.updatedAt) || value.updatedAt < 0) return { note: empty, error: "已保存的笔记格式异常，请先下载当前草稿再尝试保存。" };
        return { note: { markdown: value.markdown, updatedAt: value.updatedAt } };
    } catch { return { note: empty, error: "无法读取本地笔记；仍可编辑并下载 .md 文件。" }; }
}

export function saveReadingNote(articleId: string, markdown: string): { updatedAt?: number; error?: string } {
    if (markdown.length > MAX_NOTE_LENGTH) return { error: "笔记超过长度限制，请下载 .md 文件保存。" };
    const updatedAt = Date.now();
    try {
        localStorage.setItem(noteStorageKey(articleId), JSON.stringify({ version: 1, markdown, updatedAt }));
        return { updatedAt };
    } catch { return { error: "本地保存失败，请下载 .md 文件，避免关闭页面后丢失。" }; }
}

export function noteFilename(title: string): string {
    return `${title.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-").trim().slice(0, 80) || "文章"}-阅读笔记.md`;
}

export function exportReadingNote(title: string, articleUrl: string, markdown: string): string {
    const heading = title.replace(/[\r\n]/g, " ");
    return `# ${heading} · 阅读笔记\n\n原文：<${articleUrl}>\n\n---\n\n${markdown}${markdown.endsWith("\n") ? "" : "\n"}`;
}
