const STORAGE_KEY = "twilight:reading-library:v1";
const MAX_ITEMS = 200;

type LibraryItem = { url: string; title: string; updatedAt: number };
type LibraryState = { bookmarks: LibraryItem[]; read: LibraryItem[] };

function readState(): LibraryState {
    try {
        const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") as Partial<LibraryState>;
        return {
            bookmarks: Array.isArray(parsed.bookmarks) ? parsed.bookmarks : [],
            read: Array.isArray(parsed.read) ? parsed.read : [],
        };
    } catch {
        return { bookmarks: [], read: [] };
    }
}

function writeState(state: LibraryState) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* optional enhancement */ }
}

function toggle(items: LibraryItem[], item: LibraryItem): LibraryItem[] {
    const exists = items.some((entry) => entry.url === item.url);
    return exists ? items.filter((entry) => entry.url !== item.url) : [item, ...items].slice(0, MAX_ITEMS);
}

export function initReadingLibrary() {
    if (typeof window === "undefined") return;
    window.__twilightReadingLibraryCleanup?.();
    const controller = new AbortController();
    window.__twilightReadingLibraryCleanup = () => controller.abort();
    const { signal } = controller;

    document.querySelectorAll<HTMLElement>("[data-reading-library]").forEach((root) => {
        const url = root.dataset.libraryUrl || window.location.pathname;
        const title = root.dataset.libraryTitle || document.title;
        const bookmarkButton = root.querySelector<HTMLButtonElement>("[data-library-bookmark]");
        const readButton = root.querySelector<HTMLButtonElement>("[data-library-read]");
        const render = () => {
            const state = readState();
            const bookmarked = state.bookmarks.some((item) => item.url === url);
            const read = state.read.some((item) => item.url === url);
            if (bookmarkButton) {
                bookmarkButton.setAttribute("aria-pressed", String(bookmarked));
                bookmarkButton.title = bookmarkButton.dataset.labelOn && bookmarked ? bookmarkButton.dataset.labelOn : bookmarkButton.dataset.labelOff || "Bookmark";
                bookmarkButton.classList.toggle("is-active", bookmarked);
            }
            if (readButton) {
                readButton.setAttribute("aria-pressed", String(read));
                readButton.title = readButton.dataset.labelOn && read ? readButton.dataset.labelOn : readButton.dataset.labelOff || "Mark as read";
                readButton.classList.toggle("is-active", read);
            }
        };
        bookmarkButton?.addEventListener("click", () => {
            const state = readState();
            writeState({ ...state, bookmarks: toggle(state.bookmarks, { url, title, updatedAt: Date.now() }) });
            render();
        }, { signal });
        readButton?.addEventListener("click", () => {
            const state = readState();
            writeState({ ...state, read: toggle(state.read, { url, title, updatedAt: Date.now() }) });
            render();
        }, { signal });
        render();
    });
}

declare global {
    interface Window {
        __twilightReadingLibraryCleanup?: () => void;
    }
}
