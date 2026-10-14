<script lang="ts">
import { onDestroy, onMount } from "svelte";

import type { SearchResult } from "@/global";
import { navigateToPage } from "@utils/navigation";
import { onClickOutside } from "@utils/widget";
import { i18n } from "@i18n/translation";
import I18nKey from "@i18n/i18nKey";
import DropdownPanel from "@/components/common/DropdownPanel.svelte";
import Icon from "@components/common/icon.svelte";

type SearchStatus = "idle" | "loading" | "ready" | "empty" | "unavailable";

let keyword = $state("");
let result: SearchResult[] = $state([]);
let status: SearchStatus = $state("idle");
let initialized = $state(false);
let pagefindLoaded = false;
let isDesktopSearchExpanded = $state(false);
let isMobilePanelOpen = $state(false);
let selectedIndex = $state(-1);
let debounceTimer: ReturnType<typeof setTimeout> | undefined;
let requestSequence = 0;
let activeSearch: AbortController | undefined;
let lastFocusedElement: HTMLElement | null = null;

const panelVisible = $derived(
    isMobilePanelOpen || (isDesktopSearchExpanded && keyword.trim().length > 0),
);

function focusSearchInput(desktop: boolean) {
    requestAnimationFrame(() => {
        const input = document.getElementById(
            desktop ? "search-input-desktop" : "search-input-mobile",
        ) as HTMLInputElement | null;
        input?.focus();
        input?.select();
    });
}

function openSearch() {
    document.dispatchEvent(new CustomEvent("twilight:search-intent"));
    const desktop = window.matchMedia("(min-width: 1280px)").matches;
    if (!panelVisible && !isDesktopSearchExpanded) {
        lastFocusedElement = document.activeElement as HTMLElement | null;
    }
    if (desktop) {
        isDesktopSearchExpanded = true;
    } else {
        isMobilePanelOpen = true;
    }
    focusSearchInput(desktop);
}

function dismissSearch(returnFocus = false) {
    isDesktopSearchExpanded = false;
    isMobilePanelOpen = false;
    if (returnFocus) {
        requestAnimationFrame(() => lastFocusedElement?.focus());
    }
}

function toggleMobilePanel() {
    if (isMobilePanelOpen) {
        dismissSearch(true);
        return;
    }
    openSearch();
}

function expandDesktopSearch() {
    document.dispatchEvent(new CustomEvent("twilight:search-intent"));
    isDesktopSearchExpanded = true;
}

function collapseDesktopSearch() {
    if (!keyword.trim() && document.activeElement?.id !== "search-input-desktop") {
        isDesktopSearchExpanded = false;
    }
}

function clearSearch() {
    requestSequence += 1;
    keyword = "";
    result = [];
    status = "idle";
    selectedIndex = -1;
    focusSearchInput(window.matchMedia("(min-width: 1280px)").matches);
}

function askAI() {
    const topic = keyword.trim();
    if (!topic) return;
    dismissSearch();
    window.dispatchEvent(new CustomEvent("lulu:ask", {
        detail: `我想找与「${topic.slice(0, 1000)}」相关的本站文章，请推荐并简要说明适合谁阅读。`,
    }));
}

function selectResult(index: number) {
    if (result.length === 0) {
        selectedIndex = -1;
        return;
    }
    selectedIndex = (index + result.length) % result.length;
    requestAnimationFrame(() => {
        document.getElementById(`search-result-${selectedIndex}`)?.scrollIntoView({
            block: "nearest",
        });
    });
}

function handleSearchKeydown(event: KeyboardEvent) {
    if (status !== "ready" || result.length === 0) return;

    if (event.key === "ArrowDown") {
        event.preventDefault();
        selectResult(selectedIndex + 1);
        return;
    }
    if (event.key === "ArrowUp") {
        event.preventDefault();
        selectResult(selectedIndex < 0 ? result.length - 1 : selectedIndex - 1);
        return;
    }
    if (event.key === "Enter" && selectedIndex >= 0) {
        event.preventDefault();
        const target = result[selectedIndex]?.url;
        if (!target) return;
        if (event.metaKey || event.ctrlKey || event.shiftKey) {
            window.open(target, "_blank", "noopener,noreferrer");
        } else {
            dismissSearch();
            keyword = "";
            result = [];
            status = "idle";
            selectedIndex = -1;
            navigateToPage(target);
        }
    }
}

function handleResultClick(event: MouseEvent, resultUrl: string) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    dismissSearch();
    keyword = "";
    result = [];
    status = "idle";
    selectedIndex = -1;
    navigateToPage(resultUrl);
}

async function search(query: string, currentRequest = ++requestSequence) {
    const normalizedQuery = query.trim();
    if (!normalizedQuery || !initialized || currentRequest !== requestSequence) return;

    status = "loading";

    try {
        let searchResults: SearchResult[];
        if (import.meta.env.PROD && pagefindLoaded && window.pagefind) {
            const response = await window.pagefind.search(normalizedQuery);
            searchResults = await Promise.all(
                response.results.slice(0, 12).map((item) => item.data()),
            );
        } else if (import.meta.env.DEV) {
            const controller = new AbortController();
            activeSearch = controller;
            const timer = setTimeout(() => controller.abort(), 10_000);
            try {
                const response = await fetch(`/api/search/?q=${encodeURIComponent(normalizedQuery.slice(0, 100))}`, { signal: controller.signal });
                if (!response.ok) throw new Error("Local search unavailable");
                searchResults = (await response.json()).results;
            } finally { clearTimeout(timer); }
        } else {
            if (currentRequest === requestSequence) {
                result = [];
                status = "unavailable";
            }
            return;
        }

        if (currentRequest !== requestSequence) return;
        result = searchResults;
        status = searchResults.length > 0 ? "ready" : "empty";
    } catch (error) {
        console.error("Search error:", error);
        if (currentRequest === requestSequence) {
            result = [];
            status = "unavailable";
        }
    }
}

function handleClickOutside(event: MouseEvent) {
    if (!panelVisible && !isDesktopSearchExpanded) return;
    onClickOutside(event, "search-panel", ["search-switch", "search-bar"], () => {
        dismissSearch();
    });
}

function isEditableTarget(target: EventTarget | null) {
    const element = target as HTMLElement | null;
    return !!element?.closest("input, textarea, select, [contenteditable='true']");
}

function handleGlobalKeydown(event: KeyboardEvent) {
    if (event.key === "Escape" && (panelVisible || isDesktopSearchExpanded)) {
        event.preventDefault();
        dismissSearch(true);
        return;
    }

    const commandShortcut = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k";
    const slashShortcut = event.key === "/" && !event.metaKey && !event.ctrlKey && !event.altKey;
    if (commandShortcut || (slashShortcut && !isEditableTarget(event.target))) {
        event.preventDefault();
        openSearch();
    }
}

function handlePagefindReady() {
    pagefindLoaded = !!window.pagefind && typeof window.pagefind.search === "function";
    initialized = true;
    if (keyword.trim()) void search(keyword);
}

function handlePagefindError() {
    requestSequence += 1;
    pagefindLoaded = false;
    initialized = true;
    if (keyword.trim()) status = "unavailable";
}

onMount(() => {
    document.addEventListener("click", handleClickOutside);
    document.addEventListener("keydown", handleGlobalKeydown);

    if (import.meta.env.DEV) {
        initialized = true;
    } else {
        document.addEventListener("pagefindready", handlePagefindReady);
        document.addEventListener("pagefindloaderror", handlePagefindError);
        if (window.pagefind && typeof window.pagefind.search === "function") {
            handlePagefindReady();
        }
    }

    return () => {
        document.removeEventListener("click", handleClickOutside);
        document.removeEventListener("keydown", handleGlobalKeydown);
        document.removeEventListener("pagefindready", handlePagefindReady);
        document.removeEventListener("pagefindloaderror", handlePagefindError);
    };
});

$effect(() => {
    const query = keyword.trim();
    const currentRequest = ++requestSequence;
    if (debounceTimer) clearTimeout(debounceTimer);
    activeSearch?.abort();
    if (!query) {
        result = [];
        status = "idle";
        selectedIndex = -1;
        return;
    }
    if (!initialized) {
        status = "loading";
        return;
    }
    result = [];
    status = "loading";
    selectedIndex = -1;
    debounceTimer = setTimeout(() => search(query, currentRequest), 250);
});

$effect(() => {
    if (typeof document === "undefined") return;
    document.getElementById("navbar")?.classList.toggle("is-searching", isDesktopSearchExpanded);
});

onDestroy(() => {
    requestSequence += 1;
    activeSearch?.abort();
    if (debounceTimer) clearTimeout(debounceTimer);
    if (typeof document !== "undefined") {
        document.getElementById("navbar")?.classList.remove("is-searching");
    }
});
</script>

<!-- Desktop keeps the original compact hover-to-expand treatment. -->
<div
    id="search-bar"
    class="hidden min-[1280px]:flex transition-all items-center h-11 rounded-lg relative
        {isDesktopSearchExpanded ? 'bg-black/4 hover:bg-black/6 focus-within:bg-black/6 dark:bg-white/5 dark:hover:bg-white/10 dark:focus-within:bg-white/10' : 'btn-plain scale-animation active:scale-90'}
        {isDesktopSearchExpanded ? 'w-52' : 'w-11'}"
    role="search"
    onmouseenter={expandDesktopSearch}
    onmouseleave={collapseDesktopSearch}
>
    <Icon icon="material-symbols:search" class="absolute text-[1.25rem] pointer-events-none {isDesktopSearchExpanded ? 'ml-3' : 'left-1/2 -translate-x-1/2'} transition my-auto {isDesktopSearchExpanded ? 'text-black/30 dark:text-white/30' : ''}"></Icon>
    <input
        id="search-input-desktop"
        aria-label={i18n(I18nKey.search)}
        role="combobox"
        aria-controls="search-results"
        aria-expanded={panelVisible}
        aria-activedescendant={selectedIndex >= 0 ? `search-result-${selectedIndex}` : undefined}
        aria-autocomplete="list"
        aria-haspopup="listbox"
        aria-keyshortcuts="Control+K Meta+K /"
        placeholder={i18n(I18nKey.search)}
        bind:value={keyword}
        maxlength="100"
        onfocus={expandDesktopSearch}
        onkeydown={handleSearchKeydown}
        class="transition-all pl-10 pr-9 text-sm bg-transparent outline-0 h-full {isDesktopSearchExpanded ? 'w-full opacity-100' : 'w-0 opacity-0 pointer-events-none'} text-black/60 dark:text-white/60"
    >
    {#if isDesktopSearchExpanded && keyword}
        <button
            type="button"
            aria-label={i18n(I18nKey.clearSearch)}
            class="absolute right-1 h-8 w-8 rounded-lg btn-plain"
            onclick={clearSearch}
        >
            <Icon icon="material-symbols:close-rounded" class="text-[1.05rem]"></Icon>
        </button>
    {/if}
</div>

<button
    type="button"
    onclick={toggleMobilePanel}
    aria-label={i18n(I18nKey.search)}
    aria-expanded={isMobilePanelOpen}
    aria-controls="search-panel-region"
    aria-keyshortcuts="Control+K Meta+K /"
    id="search-switch"
    class="btn-plain scale-animation min-[1280px]:hidden! rounded-lg w-11 h-11 active:scale-90 flex items-center justify-center"
>
    <Icon icon={isMobilePanelOpen ? "material-symbols:close-rounded" : "material-symbols:search"} class="text-[1.25rem]"></Icon>
</button>

<div id="search-panel-region" aria-hidden={!panelVisible} inert={!panelVisible}>
    <DropdownPanel
        id="search-panel"
        class="{panelVisible ? '' : 'float-panel-closed'} absolute md:w-120 top-20 left-4 md:left-[unset] right-4 z-50 search-panel"
    >
        <div id="search-bar-inside" class="flex relative min-[1280px]:hidden transition-all items-center h-11 rounded-xl bg-black/4 hover:bg-black/6 focus-within:bg-black/6 dark:bg-white/5 dark:hover:bg-white/10 dark:focus-within:bg-white/10">
            <Icon icon="material-symbols:search" class="absolute text-[1.25rem] pointer-events-none ml-3 text-black/30 dark:text-white/30"></Icon>
            <input
                id="search-input-mobile"
                aria-label={i18n(I18nKey.search)}
                role="combobox"
                aria-controls="search-results"
                aria-expanded={panelVisible}
                aria-activedescendant={selectedIndex >= 0 ? `search-result-${selectedIndex}` : undefined}
                aria-autocomplete="list"
                aria-haspopup="listbox"
                placeholder={i18n(I18nKey.searchHint)}
                bind:value={keyword}
                maxlength="100"
                onkeydown={handleSearchKeydown}
                class="pl-10 pr-11 w-full h-full text-sm bg-transparent outline-0 text-black/60 dark:text-white/60"
            >
            {#if keyword}
                <button
                    type="button"
                    aria-label={i18n(I18nKey.clearSearch)}
                    class="absolute right-1 h-9 w-9 rounded-lg btn-plain"
                    onclick={clearSearch}
                >
                    <Icon icon="material-symbols:close-rounded" class="text-[1.05rem]"></Icon>
                </button>
            {/if}
        </div>

        {#if keyword.trim()}
            <button type="button" onclick={askAI} class="ai-search-assist">
                💬 让 AI 帮我找文章 <span>免费 · 按主题推荐</span>
            </button>
        {/if}
        <div
            id="search-results"
            role={status === "ready" ? "listbox" : undefined}
            aria-label={status === "ready" ? i18n(I18nKey.search) : undefined}
            aria-live="polite"
            aria-busy={status === "loading"}
        >
            {#if status === "idle"}
                <div class="min-[1280px]:hidden flex items-center gap-2 px-3 py-4 text-sm text-50">
                    <Icon icon="material-symbols:lightbulb-outline-rounded" class="text-[1.1rem] text-(--primary)"></Icon>
                    <span>{i18n(I18nKey.searchHint)}</span>
                </div>
            {:else if status === "loading"}
                <div class="flex items-center justify-center gap-2 px-3 py-5 text-sm text-50">
                    <Icon icon="material-symbols:progress-activity" class="text-[1.15rem] animate-spin text-(--primary)"></Icon>
                    <span>{i18n(I18nKey.searchLoading)}</span>
                </div>
            {:else if status === "empty" || status === "unavailable"}
                <div class="flex items-center justify-center gap-2 px-3 py-5 text-sm text-50">
                    <Icon icon={status === "empty" ? "material-symbols:search-off-rounded" : "material-symbols:cloud-off-outline-rounded"} class="text-[1.15rem] text-(--primary)"></Icon>
                    <span>{status === "empty" ? i18n(I18nKey.searchNoResults) : i18n(I18nKey.searchUnavailable)}</span>
                </div>
            {:else}
                <div role="presentation" class="px-3 pt-2 pb-1 text-xs font-medium text-50">
                    {result.length} {i18n(I18nKey.posts)}
                </div>
                {#each result as item, index}
                    <a
                        id={`search-result-${index}`}
                        href={item.url}
                        role="option"
                        aria-selected={selectedIndex === index}
                        onclick={(event) => handleResultClick(event, item.url)}
                        onmouseenter={() => (selectedIndex = index)}
                        class="transition group block rounded-xl text-lg px-3 py-2 hover:bg-(--btn-plain-bg-hover) active:bg-(--btn-plain-bg-active) {selectedIndex === index ? 'bg-(--btn-plain-bg-hover)' : ''}"
                    >
                        <div class="transition text-90 inline-flex items-center font-bold group-hover:text-(--primary)">
                            {item.meta.title}
                            <Icon icon="fa6-solid:chevron-right" class="transition text-[0.75rem] translate-x-1 text-(--primary)"></Icon>
                        </div>
                        <div class="transition text-sm text-50 line-clamp-3">
                            {@html item.excerpt}
                        </div>
                    </a>
                {/each}
                <div role="presentation" class="sticky bottom-0 mt-1 hidden items-center justify-end border-t border-(--line-divider) bg-(--float-panel-bg) px-3 py-2 text-xs text-50 min-[1280px]:flex">
                    {i18n(I18nKey.searchKeyboardHint)}
                </div>
            {/if}
        </div>
    </DropdownPanel>
</div>

<style>
    .ai-search-assist { display: flex; align-items: center; justify-content: space-between; gap: .5rem; width: 100%; margin-top: .6rem; padding: .65rem .8rem; border-radius: .75rem; background: color-mix(in srgb, var(--primary) 10%, transparent); color: var(--primary); font-size: .8rem; text-align: left; }
    .ai-search-assist:hover { background: color-mix(in srgb, var(--primary) 17%, transparent); }
    .ai-search-assist:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }
    .ai-search-assist span { opacity: .65; font-size: .65rem; }
    input:focus { outline: 0; }
    :global(.search-panel) {
        max-height: min(34rem, calc(100dvh - 6.25rem));
        overflow-y: auto;
        overscroll-behavior: contain;
    }
</style>
