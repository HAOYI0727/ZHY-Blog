const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const root = require('node:path').resolve(__dirname, '..') + '/';
function compile(source) {
    return ts.transpileModule(source.replaceAll('import.meta.env', 'globalThis.__testEnv'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
}
function load(path, modules = {}) {
    const mod = { exports: {} };
    new Function('require', 'module', 'exports', compile(fs.readFileSync(root + path, 'utf8')))(name => {
        assert.ok(name in modules, `Missing test dependency: ${name}`);
        return modules[name];
    }, mod, mod.exports);
    return mod.exports;
}
const stored = new Map();
globalThis.localStorage = {
    getItem: key => stored.get(key) ?? null,
    setItem: (key, value) => stored.set(key, value),
    removeItem: key => stored.delete(key),
};
const { scopeSvgIds } = load('src/utils/svg-ids.ts');
const svg = '<svg><defs><linearGradient id="a"/><clipPath id="ab"/></defs><path fill="url(#a)" clip-path="url(#ab)"/><use href="#a"/><use xlink:href="#ab"/></svg>';
const scoped = scopeSvgIds(svg, 's1');
assert.ok(scoped.includes('id="icon-s1-a"'));
assert.ok(scoped.includes('id="icon-s1-ab"'));
assert.ok(scoped.includes('fill="url(#icon-s1-a)"'));
assert.ok(scoped.includes('clip-path="url(#icon-s1-ab)"'));
assert.ok(scoped.includes('href="#icon-s1-a"'));
assert.ok(scoped.includes('xlink:href="#icon-s1-ab"'));
assert.ok(!scopeSvgIds(svg, 's2').includes('icon-s1-'));
assert.equal(scopeSvgIds('<svg><path d="M0 0"/></svg>', 's1'), '<svg><path d="M0 0"/></svg>');
console.log('PASS: repeated SVG definitions are isolated without breaking gradient, clip or use references.');
const storage = load('src/utils/storage.ts');
const library = load('src/utils/readingLibrary.ts', { '@utils/storage': storage });
const viewport = load('src/utils/reading-viewport.ts');
const continuity = load('src/utils/readingContinuity.ts', { '@utils/storage': storage, '@utils/reading-viewport': viewport });
const engagementStorage = load('src/utils/engagement-storage.ts', { '@utils/storage': storage });
const good = { url: '/posts/docker/', title: 'Docker', updatedAt: Date.now() };
for (const raw of ['null', '[]', 'invalid json', '{"bookmarks":[null,42,{}],"read":[null]}']) {
    stored.set('twilight:reading-library:v1', raw);
    assert.deepEqual(library.readState(), { bookmarks: [], read: [] });
}
stored.set('twilight:reading-library:v1', JSON.stringify({ bookmarks: [null, good, good, { ...good, url: '//outside.test/' }], read: [good] }));
assert.deepEqual(library.readState(), { bookmarks: [good], read: [good] });
for (const raw of ['null', '[]', 'invalid json', '{"/posts/docker/":null}']) {
    stored.set('blog-post-engagement-v1', raw);
    assert.deepEqual(engagementStorage.readEngagementStats(), {});
}
stored.set('blog-post-engagement-v1', JSON.stringify({ '/posts/docker/': { views: -1, likes: 2, heat: 9000, liked: 'false' } }));
assert.deepEqual(engagementStorage.readEngagementStats()['/posts/docker/'], { views: 0, likes: 2, heat: 12, liked: false });
for (const bad of [null, { ...good, url: 'http://[', progress: .5 }, { ...good, url: '//other.test/', progress: .5 }, { ...good, progress: 1 }, { ...good, progress: .5, updatedAt: 0 }]) {
    stored.set('twilight:reading-progress:v1', JSON.stringify(bad));
    assert.equal(continuity.readRecord(), null);
}
stored.set('twilight:reading-progress:v1', '{"url":"/posts/docker/","title":"Docker","progress":0.5,"updatedAt":1e999}');
assert.equal(continuity.readRecord(), null);
stored.set('twilight:reading-progress:v1', JSON.stringify({ ...good, progress: .5 }));
assert.equal(continuity.readRecord().progress, .5);
const availableStorage = globalThis.localStorage;
globalThis.localStorage = { getItem() { throw new Error('Storage blocked'); }, setItem() { throw new Error('Storage blocked'); } };
assert.equal(storage.getPreference('theme'), null);
assert.doesNotThrow(() => storage.setPreference('theme', 'dark'));
assert.deepEqual(library.readState(), { bookmarks: [], read: [] });
assert.equal(continuity.readRecord(), null);
assert.deepEqual(engagementStorage.readEngagementStats(), {});
const config = { siteConfig: { defaultTheme: 'system', themeColor: { hue: 250 } } };
const constants = { LIGHT_MODE: 'light', DARK_MODE: 'dark', SYSTEM_MODE: 'system' };
const theme = load('src/utils/theme.ts', { '@utils/storage': storage, '@/config': config, '@constants/constants': constants });
const hue = load('src/utils/hue.ts', { '@utils/storage': storage, '@/config': config });
assert.equal(theme.getStoredTheme(), 'system');
assert.equal(hue.getHue(), 250);
assert.doesNotThrow(() => theme.setTheme('dark'));
assert.doesNotThrow(() => hue.setHue(210));
globalThis.localStorage = availableStorage;
stored.set('theme', 'broken'); stored.set('hue', 'NaN');
assert.equal(theme.getStoredTheme(), 'system'); assert.equal(hue.getHue(), 250);
stored.set('theme', 'light'); stored.set('hue', '210');
assert.equal(theme.getStoredTheme(), 'light'); assert.equal(hue.getHue(), 210);

class Node extends EventTarget {
    dataset = {}; attributes = {}; hidden = false; style = {}; textContent = '';
    classList = { toggle() {}, add() {}, remove() {} };
    setAttribute(name, value) { this.attributes[name] = value; }
    querySelector(selector) { return this.children?.[selector] ?? null; }
    querySelectorAll() { return []; }
    closest() { return null; }
}
const bookmark = new Node(), read = new Node(), libraryRoot = new Node();
libraryRoot.dataset = { libraryUrl: good.url, libraryTitle: good.title };
libraryRoot.children = { '[data-library-bookmark]': bookmark, '[data-library-read]': read };
globalThis.window = new EventTarget();
window.location = { pathname: good.url, origin: 'http://localhost:4321', search: '', hash: '' };
globalThis.document = new EventTarget();
document.title = good.title;
document.querySelectorAll = () => [libraryRoot];
stored.delete('twilight:reading-library:v1');
library.initReadingLibrary(); library.initReadingLibrary();
bookmark.dispatchEvent(new Event('click'));
assert.equal(library.readState().bookmarks.length, 1, 'Swup reinitialization must not duplicate click handlers');
assert.equal(bookmark.attributes['aria-pressed'], 'true');
read.dispatchEvent(new Event('click')); assert.equal(library.readState().read.length, 1);
bookmark.dispatchEvent(new Event('click')); assert.equal(library.readState().bookmarks.length, 0);
const article = new Node(), fill = new Node(), bar = new Node();
article.dataset = { readingUrl: good.url, readingTitle: good.title };
article.offsetHeight = 2000;
article.getBoundingClientRect = () => ({ top: 100 - window.scrollY });
window.innerHeight = 500; window.scrollY = 500;
let frameId = 0; const frames = new Map();
window.requestAnimationFrame = callback => { frames.set(++frameId, callback); return frameId; };
window.cancelAnimationFrame = id => frames.delete(id);
window.scrollTo = () => { throw new Error('A stale resume callback scrolled the next page'); };
window.history = { replaceState() {} };
document.querySelector = () => article;
document.getElementById = id => id === 'progress-bar-wrapper' ? bar : id === 'progress-bar-fill' ? fill : null;
continuity.initReadingContinuity();
window.dispatchEvent(new Event('scroll'));
const lateFrame = [...frames.values()][0];
window.__twilightReadingContinuityCleanup();
const progressBefore = stored.get('twilight:reading-progress:v1');
window.scrollY = 1900; lateFrame();
assert.equal(stored.get('twilight:reading-progress:v1'), progressBefore, 'An old animation frame must not overwrite reading progress after navigation');
assert.equal(fill.style.transform, 'scaleX(0)');
frames.clear(); window.scrollY = 500; window.location.search = '?resume=1';
stored.set('twilight:reading-progress:v1', JSON.stringify({ ...good, progress: .5 }));
continuity.initReadingContinuity(); [...frames.values()][0]();
const lateResume = [...frames.values()].at(-1);
window.__twilightReadingContinuityCleanup(); lateResume();
console.log('PASS: corrupted/blocked storage, valid preferences, bookmark persistence, Swup listener cleanup and stale reading/resume frames.');

// The notebook article pane must drive the same progress bar as document scrolling.
const pane = new Node(); pane.scrollTop = 300; pane.scrollHeight = 2500; pane.clientHeight = 500;
pane.closest = () => ({ dataset: { open: 'true' } });
article.closest = () => pane;
window.location.search = ''; frames.clear();
continuity.initReadingContinuity();
assert.equal(bar.attributes['aria-valuenow'], '15');
pane.scrollTop = 1000; pane.dispatchEvent(new Event('scroll'));
for (const callback of frames.values()) callback();
assert.equal(bar.attributes['aria-valuenow'], '50', 'Article pane scrolling must update reading progress');
window.__twilightReadingContinuityCleanup();

// Exercise actual TOC initialization and the click binding, including the floating variant.
globalThis.HTMLElement = Node;
globalThis.HTMLAnchorElement = class extends Node {};
globalThis.IntersectionObserver = class { observe() {} disconnect() {} unobserve() {} };
globalThis.customElements = { get() { return true; }, define() {} };
const { TableOfContents } = load('src/components/sidebar/toc.ts', {
    '@utils/reading-viewport': viewport,
    '@constants/constants': { NAVBAR_HEIGHT: 72, NAVBAR_GAP: 1 },
    '@utils/widget': { widgetManager: {} },
});
const heading = new Node(); heading.closest = () => pane;
heading.getBoundingClientRect = () => ({ top: 350 });
pane.getBoundingClientRect = () => ({ top: 100 });
let targetTop; pane.scrollTo = ({top}) => { targetTop = top; };
document.getElementById = id => id === 'section' ? heading : null;
for (const floating of [false,true]) {
    const toc = new TableOfContents(), tocScroll = new Node();
    toc.dataset = { isFloating: String(floating) };
    toc.children = { '.toc-floating-panel': tocScroll };
    toc.closest = () => tocScroll;
    toc.regenerateTOC = () => true;
    toc.init();
    const anchor = new HTMLAnchorElement(); anchor.hash = '#section';
    const click = new Event('click', {cancelable:true}); click.composedPath = () => [anchor];
    targetTop = undefined; tocScroll.dispatchEvent(click);
    assert.ok(click.defaultPrevented, 'TOC clicks must be bound to the actual sidebar/floating container');
    assert.equal(targetTop, 1234, 'TOC links must scroll the article pane, keeping the notebook in view');
    toc.disconnectedCallback();
    const detachedClick = new Event('click',{cancelable:true}); detachedClick.composedPath = () => [anchor];
    tocScroll.dispatchEvent(detachedClick); assert.ok(!detachedClick.defaultPrevented);
}
console.log('PASS: notebook article scroll updates reading progress; sidebar and floating TOC clicks scroll the reading pane and clean up their handlers.');


// Execute the actual search script with Svelte lifecycle/state stubs and deferred
// Pagefind results. The old query resolves during the next query debounce.
const effects = [], destroy = [], navigation = [];
globalThis.__testEnv = { PROD: true, DEV: false };
globalThis.$state = value => value; globalThis.$derived = value => value; globalThis.$effect = callback => effects.push(callback);
globalThis.requestAnimationFrame = callback => callback();
document.getElementById = () => null;
const source = fs.readFileSync(root + 'src/components/navbar/search.svelte', 'utf8').match(/<script[^>]*>([\s\S]*?)<\/script>/)[1];
const modules = { svelte: { onMount() {}, onDestroy: callback => destroy.push(callback) }, '@utils/navigation': { navigateToPage: target => navigation.push(target) }, '@utils/widget': {}, '@i18n/translation': {}, '@i18n/i18nKey': {}, '@/components/common/DropdownPanel.svelte': {}, '@components/common/icon.svelte': {} };
const search = new Function('require', 'exports', 'effects', compile(source) + '\nreturn {search, handleResultClick, initialize() { initialized=true; pagefindLoaded=true; }, setKeyword(value) { keyword=value; effects[0](); }, getResult() { return result; }};')(name => modules[name], {}, effects);
search.initialize();

(async () => {
    let resolveOld;
    window.pagefind = { search: query => query === 'old' ? new Promise(resolve => resolveOld = resolve) : Promise.resolve({ results: [{ data: async () => ({ url: '/posts/new/', meta: { title: 'new' }, excerpt: '' }) }] }) };
    const oldRequest = search.search('old');
    search.setKeyword('new');
    resolveOld({ results: [{ data: async () => ({ url: '/posts/old/', meta: { title: 'old' }, excerpt: '' }) }] });
    await oldRequest;
    assert.deepEqual(search.getResult(), [], 'Old results must not appear while the new keyword is debouncing');
    await new Promise(resolve => setTimeout(resolve, 300));
    assert.equal(search.getResult()[0].url, '/posts/new/');
    let prevented = false;
    search.handleResultClick({ button: 0, metaKey: true, preventDefault() { prevented = true; } }, '/posts/new/');
    assert.equal(prevented, false); assert.equal(navigation.length, 0);
    search.handleResultClick({ button: 0, preventDefault() { prevented = true; } }, '/posts/new/');
    assert.equal(prevented, true); assert.deepEqual(navigation, ['/posts/new/']);
    destroy.forEach(callback => callback());
    console.log('PASS: search query race, real latest results and native modified-click navigation.');

    globalThis.__testEnv = { DEV: true, PROD: false };
    for (const name of ['UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN', 'KV_REST_API_URL', 'KV_REST_API_TOKEN']) delete process.env[name];
    const endpoint = load('src/pages/api/engagement.ts');
    const url = new URL('http://localhost:4321/api/engagement/?post=/posts/runtime-check/');
    const post = body => endpoint.POST({ request: new Request(url, { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body) }) });
    for (const bad of [null, [], 1, true, 'invalid json', { post: '/bad/', action: 'view' }, { post: '/posts/runtime-check/', action: 'invalid' }]) assert.equal((await post(bad)).status, 400);
    const getCount = async () => (await endpoint.GET({ url })).json();
    assert.equal((await getCount()).views, 0);
    assert.equal((await (await post({ post: '/posts/runtime-check/', action: 'view' })).json()).views, 1);
    assert.equal((await (await post({ post: '/posts/runtime-check/', action: 'like' })).json()).likes, 1);
    await post({ post: '/posts/runtime-check/', action: 'unlike' }); await post({ post: '/posts/runtime-check/', action: 'unlike' });
    assert.equal((await getCount()).likes, 0);
    assert.equal((await getCount()).heat, 1);
    const batch = await (await endpoint.GET({ url: new URL('http://localhost/api/engagement/?posts=%2Fposts%2Fruntime-check%2F,%25broken') })).json();
    assert.equal(batch.posts['/posts/runtime-check/'].views, 1);
    globalThis.__testEnv = { DEV: false, PROD: true };
    assert.equal((await endpoint.GET({ url })).status, 503);
    process.env.UPSTASH_REDIS_REST_URL = 'https://redis.test'; process.env.UPSTASH_REDIS_REST_TOKEN = 'mock-token';
    globalThis.fetch = async () => new Response('{"error":"mock-token backend-detail"}', { status: 502 });
    const failure = await endpoint.GET({ url });
    assert.equal(failure.status, 502); assert.ok(!(await failure.text()).includes('mock-token'));
    const originalTimeout = AbortSignal.timeout;
    AbortSignal.timeout = milliseconds => { assert.equal(milliseconds, 8000); return AbortSignal.abort(); };
    globalThis.fetch = async (_, options) => { assert.equal(options.signal.aborted, true); throw new DOMException('Timeout', 'AbortError'); };
    assert.equal((await endpoint.GET({ url })).status, 502);
    AbortSignal.timeout = originalTimeout;
    globalThis.__testEnv.STATIC_HOSTING = true;
    assert.equal((await (await endpoint.GET({ url })).json()).storage, 'unavailable');
    console.log('PASS: malformed engagement bodies, normal view/like counts, batch IDs, missing production storage, sanitized failures, timeouts and static fallback.');

    globalThis.__testEnv = { DEV: true };
    const fixtures = [
        { id: 'docker', data: { title: 'Docker 入门', tags: ['容器'], description: '学习镜像' }, body: 'Docker 容器与镜像。literal <img onerror="alert(1)"> & text' },
        { id: 'secret', data: { title: 'Docker 私密', encrypted: true }, body: 'secret' },
        { id: 'draft', data: { title: 'Docker 草稿', draft: true }, body: 'draft' },
    ];
    const devSearch = load('src/pages/api/search.ts', { 'astro:content': { getCollection: async (_, filter) => fixtures.filter(filter) }, '@utils/url': { getPostUrl: post => '/posts/' + post.id + '/' }, '@utils/ai': { plainAIText: text => text } });
    const query = async q => (await devSearch.GET({ url: new URL('http://localhost/api/search/?q=' + encodeURIComponent(q)) })).json();
    assert.deepEqual((await query('Docker')).results.map(item => item.url), ['/posts/docker/']);
    assert.equal((await query('容器')).results.length, 1); assert.equal((await query('镜像')).results.length, 1);
    assert.equal((await query('nothing')).results.length, 0);
    assert.equal((await query('Docker')).results[0].excerpt.includes('<img'), false);
    assert.equal((await query('Docker')).results[0].excerpt.includes('&lt;img'), true);
    globalThis.__testEnv = { PROD: true }; assert.equal((await devSearch.GET({ url: new URL('http://localhost/api/search/?q=Docker') })).status, 404);
    console.log('PASS: local search uses public articles, excludes encrypted/draft entries, searches title/tags/body, escapes excerpts and stays disabled in production.');

    // Exercise the real statistics custom element through successful requests,
    // a failed like, a client timeout and a detached page with a late response.
    const elements = new Map();
    globalThis.HTMLElement = Node;
    globalThis.customElements = { get: name => elements.get(name), define: (name, value) => elements.set(name, value) };
    document.documentElement = { lang: 'zh-CN' };
    window.setTimeout = setTimeout; window.clearTimeout = clearTimeout;
    const sessions = new Map();
    globalThis.sessionStorage = { getItem: key => sessions.get(key) ?? null, setItem: (key, value) => sessions.set(key, value) };
    const engagementScript = fs.readFileSync(root + 'src/components/post/PostEngagement.astro', 'utf8').match(/<script[^>]*>([\s\S]*?)<\/script>/)[1];
    new Function('require', 'exports', compile(engagementScript))(name => ({ '@utils/storage': storage, '@utils/engagement-storage': engagementStorage })[name], {});
    const createPost = id => {
        const element = new (elements.get('post-engagement'))();
        element.dataset = { postId: id }; element.isConnected = true;
        element.children = Object.fromEntries(['like', 'views', 'likes', 'heat'].map(name => [`[data-post-${name}]`, new Node()]));
        return element;
    };
    const flush = () => new Promise(resolve => setImmediate(resolve));
    stored.set('blog-post-engagement-v1', 'null');
    let failLike = false;
    globalThis.fetch = async (_, options) => {
        const action = options.body && JSON.parse(options.body).action;
        return failLike ? new Response('{}', { status: 503 }) : Response.json({ views: 3, likes: action === 'like' ? 1 : 0, heat: action === 'like' ? 9 : 3, storage: 'development-memory' });
    };
    const postElement = createPost('/posts/client-check/');
    postElement.connectedCallback(); await flush();
    const like = postElement.children['[data-post-like]'];
    assert.equal(like.disabled, false);
    assert.equal(postElement.children['[data-post-views]'].textContent, '3');
    assert.equal(sessions.get('blog-post-viewed:/posts/client-check/'), '1');
    like.dispatchEvent(new Event('click')); await flush();
    assert.equal(like.attributes['aria-pressed'], 'true');
    failLike = true; like.dispatchEvent(new Event('click')); await flush();
    assert.equal(like.attributes['aria-pressed'], 'true', 'Failed requests must roll back optimistic likes');
    assert.equal(like.disabled, false);
    postElement.disconnectedCallback();
    let timeout;
    window.setTimeout = (callback, milliseconds) => { assert.equal(milliseconds, 10000); timeout = callback; return 1; };
    window.clearTimeout = () => {};
    globalThis.fetch = (_, options) => new Promise((resolve, reject) => options.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError'))));
    const slow = createPost('/posts/slow-check/'); slow.connectedCallback();
    assert.equal(slow.children['[data-post-like]'].disabled, true);
    timeout(); await flush();
    assert.equal(slow.children['[data-post-like]'].disabled, false, 'An unavailable service must not keep the like button locked');
    assert.equal(sessions.has('blog-post-viewed:/posts/slow-check/'), false, 'An unsuccessful view request must not be marked as saved');
    slow.disconnectedCallback();
    let lateResponse;
    globalThis.fetch = () => new Promise(resolve => lateResponse = resolve);
    const detached = createPost('/posts/detached-check/'); detached.connectedCallback();
    const snapshot = stored.get('blog-post-engagement-v1');
    detached.disconnectedCallback();
    lateResponse(Response.json({ views: 999, likes: 50, heat: 1299 })); await flush();
    assert.equal(stored.get('blog-post-engagement-v1'), snapshot, 'Detached requests must not write stale snapshots');
    assert.equal(sessions.has('blog-post-viewed:/posts/detached-check/'), false);
    console.log('PASS: real statistics component handles corrupted caches, successful views/likes, rollback, client timeouts and late responses after navigation.');
})().catch(error => { console.error(error); process.exitCode = 1; });
