// Browser preferences are optional; blocked storage must not interrupt page setup.
export function getPreference(key: string): string | null {
    try { return localStorage.getItem(key); } catch { return null; }
}

export function setPreference(key: string, value: string): void {
    try { localStorage.setItem(key, value); } catch { /* Keep the current page usable. */ }
}

export function isArticlePath(value: unknown): value is string {
    return typeof value === "string" && /^\/posts\/(?!.*(?:\/\/|[?#\\]))[^\s]+\/$/u.test(value);
}

export function nonnegativeCount(value: unknown): number {
    return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : 0;
}
