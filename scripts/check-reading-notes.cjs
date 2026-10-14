const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const root = require('node:path').resolve(__dirname, '..') + '/';
function load(file, modules = {}) {
    const source = fs.readFileSync(root + file, 'utf8');
    const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
    const mod = { exports: {} };
    new Function('require', 'module', 'exports', code)(name => modules[name] ?? require(name), mod, mod.exports);
    return mod.exports;
}
const notes = load('src/utils/reading-notes.ts');
const viewport = load('src/utils/reading-viewport.ts');
const launcherUtils = load('src/utils/notes-launcher.ts');
const motionUtils = load('src/utils/reading-transitions.ts');
const preview = load('src/utils/note-preview.ts');
const memory = new Map();
globalThis.localStorage = { getItem: key => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value) };
const markdown = '## 我的理解\n\n- **镜像**是模板\n- 容器是实例\n\n> 保留一句话\n\n```python\nprint("<hello>")\n```\n\n|术语|释义|\n|---|---|\n|容器|运行实例|\n\n[原文](https://www.hustzhy.cn/posts/basic_knowledge/docker/)\n';
assert.equal(notes.loadReadingNote('a').note.markdown, '');
assert.ok(notes.saveReadingNote('a', markdown).updatedAt);
assert.equal(notes.loadReadingNote('a').note.markdown, markdown, 'Markdown syntax and newlines must survive saving/reloading');
assert.equal(notes.loadReadingNote('b').note.markdown, '', 'Different articles must not share notes');
notes.saveReadingNote('b', '# Another article');
assert.equal(notes.loadReadingNote('a').note.markdown, markdown);
for (const bad of ['null', '[]', 'broken', '{"version":1,"markdown":42,"updatedAt":1}', '{"version":1,"markdown":"x","updatedAt":1e999}']) {
    memory.set(notes.noteStorageKey('broken'), bad);
    assert.equal(notes.loadReadingNote('broken').note.markdown, '');
    assert.ok(notes.loadReadingNote('broken').error);
}
const snapshot = memory.get(notes.noteStorageKey('a'));
assert.ok(notes.saveReadingNote('a', 'x'.repeat(notes.MAX_NOTE_LENGTH + 1)).error);
assert.equal(memory.get(notes.noteStorageKey('a')), snapshot, 'Oversized drafts must not overwrite saved notes');
globalThis.localStorage = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('quota'); } };
assert.ok(notes.loadReadingNote('a').error);
assert.ok(notes.saveReadingNote('a', markdown).error);
const exported = notes.exportReadingNote('Docker', 'https://www.hustzhy.cn/posts/basic_knowledge/docker/', markdown);
assert.ok(exported.endsWith(markdown)); assert.ok(exported.includes('https://www.hustzhy.cn/posts/basic_knowledge/docker/'));
assert.ok(!/[\\/:*?"<>|]/.test(notes.noteFilename('A/B:*?<test>')));
console.log('PASS: per-article persistence, exact Markdown/newline roundtrip, corrupted/blocked/full storage, length limits and recoverable .md export.');
const html = preview.renderNotePreview(markdown);
for (const marker of ['<h2>我的理解</h2>', '<strong>镜像</strong>', '<blockquote>', '<pre><code class="language-python">', '<table>', 'target="_blank"', 'rel="noopener noreferrer"']) assert.ok(html.includes(marker), 'Missing Markdown rendering: ' + marker);
const hostile = preview.renderNotePreview('<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n\n[click](javascript:alert(1))\n\n![image](data:text/html;base64,PHNjcmlwdD4=)');
assert.ok(!/<script\b|<img\b[^>]*onerror|href="javascript:|src="data:text\/html/i.test(hostile));
assert.ok(hostile.includes('&lt;script&gt;'));
assert.ok(preview.renderNotePreview('```html\n<script>x</script>\n```').includes('&lt;script&gt;'));
console.log('PASS: live Markdown headings/lists/quotes/code/tables/links, escaped raw HTML and rejected script URLs.');
// Dock against actual-size music/TOC/back-to-top/pet footprints, including expanded panels.
let placements = 0;
for (const width of [640,744,768,1024,1366,1920]) for (const height of [360,600,844,1024]) {
    for (const expanded of [false,true]) for (const petRight of [false,true]) {
        const musicWidth = expanded ? 320 : 48, musicHeight = expanded ? Math.min(450,height-32) : 48;
        const obstacles = [
            {left:width-16-musicWidth,right:width-16,top:height-16-musicHeight,bottom:height-16},
            {left:width-64,right:width-16,top:height-220,bottom:height-172},
            {left:width-64,right:width-16,top:height-156,bottom:height-108},
            {left:petRight?width-174:16,right:petRight?width-20:170,top:height-174,bottom:height-20},
        ];
        const box = launcherUtils.notesLauncherPosition(width,height,obstacles);
        assert.ok(box, 'A notebook slot must be found for ordinary control layouts');
        assert.ok(box.left>=16 && box.top>=16 && box.left+48<=width-16 && box.top+48<=height-16);
        for (const rect of obstacles) assert.ok(box.left+60<=rect.left || box.left>=rect.right+12 || box.top+60<=rect.top || box.top>=rect.bottom+12,'The notebook button must leave a clear gap around every control');
        placements++;
    }
}
assert.equal(launcherUtils.notesLauncherPosition(744,844,[{left:0,right:744,top:0,bottom:844}]),undefined,'A completely occupied viewport must not force the notebook on top of another surface');
console.log(`PASS: ${placements} dock layouts avoid music, TOC, back-to-top and dragged mascot controls.`);

// Run the actual notebook custom-element script against a small DOM fixture.
// This verifies its debounce, close/navigation flush and stale-preview cleanup.
const { parse } = require('node-html-parser');
require('node:events').setMaxListeners(0);
const componentSource = fs.readFileSync(root + 'src/components/post/ReadingNotes.astro', 'utf8');
const markup = componentSource.match(/<reading-notes[\s\S]*?<\/reading-notes>/)[0].replace('<slot />', '<article id="post-container"><p>文章正文</p></article>');
const tree = parse(`<body>${markup}</body>`);
const wrappers = new Map();
let activeElement = null;
class Element extends EventTarget {
    constructor(node) {
        super(); this.node = node; this.style = {}; this.attributes = {}; this.hidden = node?.hasAttribute('hidden') || false;
        this.value = ''; this.selectionStart = 0; this.selectionEnd = 0; this.textContent = ''; this.innerHTML = ''; this.isConnected = true;
        this.dataset = Object.fromEntries(Object.entries(node?.attributes || {}).filter(([name]) => name.startsWith('data-')).map(([name,value]) => [name.slice(5).replace(/-([a-z])/g, (_,c)=>c.toUpperCase()), value]));
        this.classList = { toggle() {} };
        this.scrollTop = 0; this.scrollHeight = 4000; this.clientHeight = 500; this.offsetHeight = 4000;
    }
    get parentElement() { return wrap(this.node.parentNode); }
    querySelector(selector) { return wrap(this.node.querySelector(selector)); }
    querySelectorAll(selector) { return this.node.querySelectorAll(selector).map(wrap); }
    append(...nodes) { for (const node of nodes) { node.node.remove(); this.node.appendChild(node.node); } }
    setAttribute(name,value) { this.attributes[name] = value; }
    focus() { activeElement = this; }
    contains(node) { return !!node && (node === this || this.node.querySelectorAll("*").includes(node.node)); }
    setRangeText(text,start,end) { this.value=this.value.slice(0,start)+text+this.value.slice(end); this.selectionStart=this.selectionEnd=start+text.length; }
    closest(selector) { return wrap(this.node.closest(selector)); }
    getBoundingClientRect() { return {top: 100 - window.scrollY}; }
    scrollIntoView() { window.scrollY = 100; }
    click() { this.dispatchEvent(new Event('click')); }
    remove() { this.node.remove(); }
}
function wrap(node) { if (!node) return null; if (!wrappers.has(node)) wrappers.set(node,new Element(node)); return wrappers.get(node); }
const timers = new Map(); let timerId = 0;
globalThis.window = new EventTarget();
const unavailable = new EventTarget(); unavailable.matches = false;
window.matchMedia = query => query === notes.NOTES_UNAVAILABLE_QUERY ? unavailable : {matches:true};
window.innerWidth = 700; window.innerHeight = 900; window.scrollY = 600;
window.scrollTo = ({top}) => { window.scrollY = top; };
window.setTimeout = (callback,delay) => { timers.set(++timerId,{ callback,delay }); return timerId; };
window.clearTimeout = id => timers.delete(id);
const frames = new Map(); let frameId = 0;
window.requestAnimationFrame = callback => { frames.set(++frameId,callback); return frameId; }; window.cancelAnimationFrame = id => frames.delete(id);
const runFrames = () => { for (const [id,callback] of [...frames]) { frames.delete(id); callback(); } };
globalThis.document = new EventTarget();
document.body = wrap(tree.querySelector('body'));
document.documentElement = {dataset:{}};
document.querySelectorAll = () => [];
globalThis.MutationObserver = class {observe(){} disconnect(){}};
globalThis.ResizeObserver = class {observe(){} disconnect(){}};
Object.defineProperty(document,'activeElement',{get:()=>activeElement});
document.querySelector = () => null; document.getElementById = () => null;
const anchors = [];
document.createElement = tag => { const element = wrap(parse(`<${tag}></${tag}>`).querySelector(tag)); if (tag === 'a') anchors.push(element); return element; };
document.visibilityState = 'visible';
let clipboard = '';
Object.defineProperty(globalThis,'navigator',{configurable:true,value:{clipboard:{writeText:async text=>{clipboard=text;}}}});
globalThis.HTMLElement = Element;
const registered = new Map();
globalThis.customElements = { get:name=>registered.get(name),define:(name,type)=>registered.set(name,type) };
const surfaces = load('src/utils/pet-surfaces.ts');
const script = componentSource.match(/<script>([\s\S]*?)<\/script>/)[1];
const scriptCode = ts.transpileModule(script,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
new Function('require','exports',scriptCode)(name=>({'@utils/reading-notes':notes,'@utils/pet-surfaces':surfaces,'@utils/note-preview':preview,'@utils/reading-viewport':viewport,'@utils/notes-launcher':launcherUtils,'@utils/reading-transitions':motionUtils,'@utils/readingContinuity':{initReadingContinuity(){}}})[name],{});
globalThis.localStorage = {getItem:key=>memory.get(key)??null,setItem:(key,value)=>memory.set(key,value)};
const rootNode = tree.querySelector('reading-notes');
const notebook = new (registered.get('reading-notes'))(rootNode); wrappers.set(rootNode,notebook);
notebook.dataset.articleId = 'component-fixture'; notebook.dataset.articleTitle = '测试文章'; notebook.dataset.articleUrl = 'https://www.hustzhy.cn/posts/test/';
const launcher = notebook.querySelector('[data-notes-launcher]');
const source = notebook.querySelector('[data-notes-source]');
const panel = notebook.querySelector('[data-notes-window]');
const button = selector => panel.querySelector(selector);
const runTimers = delay => { for (const [id,timer] of [...timers]) if(timer.delay === delay) {timers.delete(id); timer.callback();} };
const flush = () => new Promise(resolve => setImmediate(resolve));
(async()=>{
    notebook.connectedCallback();
    assert.ok(document.body.contains(launcher) && !notebook.contains(launcher),'The dock must live outside transformed article ancestors');
    const article = notebook.querySelector('#post-container');
    const pane = notebook.querySelector('[data-notes-article]');
    assert.equal(viewport.readingScroller(article),undefined);
    assert.deepEqual(viewport.readingPosition(article),{offset:500,distance:3100});
    launcher.click();
    assert.equal(notebook.dataset.open,'true');
    assert.equal(viewport.readingScroller(article),pane);
    assert.ok(Math.abs(pane.scrollTop / 3500 - 500 / 3100) < 1e-9,'Opening must preserve the reading fraction through width/height changes');
    assert.ok(notebook.contains(panel) && notebook.contains(pane),'Both panes must remain inside the article workspace');
    assert.equal(panel.hidden,false); assert.equal(surfaces.activePetSurface(),'notes');
    source.value = markdown; source.dispatchEvent(new Event('input'));
    assert.equal(memory.has(notes.noteStorageKey('component-fixture')),false);
    runTimers(120); await flush();
    assert.ok(panel.querySelector('[data-notes-preview]').innerHTML.includes('<strong>镜像</strong>'));
    runTimers(400); assert.equal(notes.loadReadingNote('component-fixture').note.markdown,markdown);
    source.value = '## Final draft before closing'; source.dispatchEvent(new Event('input'));
    pane.scrollTop = 1750;
    button('[data-notes-close]').click();
    assert.equal(notebook.dataset.open,undefined);
    assert.equal(viewport.readingScroller(article),undefined);
    assert.ok(Math.abs(viewport.readingPosition(article).offset / 3100 - .5) < 1e-9,'Closing must restore the current article position to document scrolling');
    assert.equal(panel.hidden,true); assert.equal(surfaces.activePetSurface(),'none');
    assert.equal(notes.loadReadingNote('component-fixture').note.markdown,source.value,'Closing must flush a draft before the debounce timer runs');
    document.body.querySelector('[data-notes-launcher]').click();
    surfaces.activatePetSurface('chat');
    assert.equal(panel.hidden,true,'Opening the mascot chat must close the notebook');
    assert.equal(surfaces.activePetSurface(),'chat','Closing an old notebook must not dismiss the replacement chat');
    document.body.querySelector('[data-notes-launcher]').click();
    assert.equal(surfaces.activePetSurface(),'notes');
    source.value = '## Resize draft'; source.dispatchEvent(new Event('input'));
    unavailable.matches = true; unavailable.dispatchEvent(new Event('change')); runFrames();
    assert.equal(launcher.hidden,true,'The portaled button must remain hidden on phones');
    assert.equal(panel.hidden,true,'Switching to a phone-sized viewport must close the notebook');
    assert.equal(notebook.dataset.open,undefined,'Phone layout must restore normal article scrolling');
    assert.equal(notes.loadReadingNote('component-fixture').note.markdown,source.value,'Closing for phone size must save the draft');
    launcher.click();
    assert.equal(panel.hidden,true,'Phone mode must not allow the notebook to open');
    unavailable.matches = false; unavailable.dispatchEvent(new Event('change')); runFrames();
    assert.equal(launcher.hidden,false);
    assert.equal(panel.hidden,true,'Returning to desktop must not open the notebook automatically');
    launcher.click();
    assert.equal(panel.hidden,false);
    button('[data-notes-copy]').click(); await flush(); assert.equal(clipboard,source.value);
    button('[data-notes-download]').click();
    const download = anchors.at(-1);
    assert.equal(download.download,'测试文章-阅读笔记.md');
    assert.ok((await (await fetch(download.href)).text()).includes(source.value));
    source.value = '## Unsaved navigation draft'; source.dispatchEvent(new Event('input'));
    notebook.node.remove(); notebook.isConnected = false;
    notebook.disconnectedCallback();
    assert.equal((await fetch(download.href)).status,200,'A started download must remain available after article navigation');
    runTimers(60000);
    await assert.rejects(fetch(download.href),'Download resources must be released after the grace period');
    assert.equal(notes.loadReadingNote('component-fixture').note.markdown,source.value,'Navigation must flush the current draft');
    assert.ok(!document.body.querySelector('[data-notes-launcher]'),'Navigation must remove the entire article workspace');
    assert.equal(surfaces.activePetSurface(),'none');
    const detachedPreview = panel.querySelector('[data-notes-preview]').innerHTML;
    runTimers(120); await flush(); assert.equal(panel.querySelector('[data-notes-preview]').innerHTML,detachedPreview);
    source.value = ''; document.body.append(notebook); notebook.isConnected = true; notebook.connectedCallback();
    assert.equal(source.value,'## Unsaved navigation draft','Returning to the article must restore its saved note');
    source.value = '## Reload draft'; source.dispatchEvent(new Event('input'));
    window.dispatchEvent(new Event('pagehide'));
    assert.equal(notes.loadReadingNote('component-fixture').note.markdown,'## Reload draft');
    notebook.disconnectedCallback();
    window.matchMedia = () => ({matches:false});
    const native = [];
    document.startViewTransition = callback => {
        let finish; const finished = new Promise(resolve=>{finish=resolve;});
        const item = {callback,finish,ready:Promise.resolve(),finished,skipTransition(){finish();}};
        native.push(item); return item;
    };
    let state = 'closed'; const lifetime = new AbortController();
    const transitions = motionUtils.readingTransitions(notebook,lifetime.signal);
    transitions.run(()=>{state='open';});
    transitions.run(()=>{state='closed';});
    native[0].callback(); assert.equal(state,'closed','A replaced animation must not reopen a notebook');
    native[1].callback(); native[1].finish(); await flush();
    assert.equal(document.documentElement.dataset.notesTransition,undefined);
    transitions.run(()=>{state='open';}); lifetime.abort();
    native[2].callback(); assert.equal(state,'closed','Navigation must cancel pending layout changes');
    delete document.startViewTransition;
    const fades=[];
    notebook.animate = () => {
        let finish,reject; const finished=new Promise((resolve,fail)=>{finish=resolve;reject=fail;});
        const animation={finished,finish,cancel(){reject(new Error('cancelled'));}}; fades.push(animation);return animation;
    };
    const fallbackLifetime = new AbortController();
    const fallback = motionUtils.readingTransitions(notebook,fallbackLifetime.signal);
    fallback.run(()=>{state='open';}); assert.equal(state,'closed','Older browsers must fade out before mutating layout');
    fades[0].finish(); await flush(); assert.equal(state,'open');
    fades[1].finish(); await flush();
    fallback.run(()=>{state='closed';}); fallbackLifetime.abort();
    fades.at(-1).finish(); await flush(); assert.equal(state,'open','Aborting a fallback must prevent a late scroll/layout jump');
    console.log('PASS: native and fallback layout transitions, rapid-toggle cancellation and navigation cleanup.');
    console.log('PASS: actual notebook controller previews/debounces, flushes on close/navigation/reload, restores notes, copies raw Markdown, preserves reading position, saves when switching to phone mode and excludes mascot panels.');
})().catch(error=>{console.error(error);process.exitCode=1;});
