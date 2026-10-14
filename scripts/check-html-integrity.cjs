const fs = require('node:fs');
const path = require('node:path');
const { parse } = require('node-html-parser');
const base = path.resolve(process.argv[2] || (fs.existsSync('dist/index.html') ? 'dist' : 'dist/client'));
const files = [];
function walk(dir) {
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
        const file = path.join(dir, item.name);
        if (item.isDirectory()) walk(file);
        else if (file.endsWith('.html')) files.push(file);
    }
}
walk(base);
if (!files.length) throw new Error('No built HTML pages found');
const origin = 'http://site-check.local';
const identifiers = new Map(), references = [], errors = [];
for (const file of files) {
    const tree = parse(fs.readFileSync(file, 'utf8'));
    const ids = new Set(), names = new Set();
    for (const node of tree.querySelectorAll('[id],a[name]')) {
        if (node.id) {
            if (ids.has(node.id)) errors.push(`${path.relative(base, file)}: duplicate id="${node.id}"`);
            ids.add(node.id);
        }
        const name = node.getAttribute('name');
        if (name) names.add(name);
    }
    identifiers.set(file, new Set([...ids, ...names]));
    const pageUrl = origin + '/' + path.relative(base, file).split(path.sep).join('/').replace(/index\.html$/, '');
    for (const node of tree.querySelectorAll('[href],[src],[poster],[srcset]')) {
        const values = ['href', 'src', 'poster'].map(attr => node.getAttribute(attr)).filter(Boolean);
        const srcset = node.getAttribute('srcset');
        if (srcset && !srcset.includes('data:')) values.push(...srcset.split(',').map(value => value.trim().split(/\s+/)[0]));
        for (const value of values) {
            // Check relative and root-relative assets/anchors; external URLs are
            // not a reliable build gate and require a separate network audit.
            if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(value)) continue;
            let url;
            try { url = new URL(value, pageUrl); decodeURIComponent(url.pathname); decodeURIComponent(url.hash); }
            catch { errors.push(`${path.relative(base, file)}: malformed URL ${value}`); continue; }
            if (url.pathname.startsWith('/api/')) continue;
            references.push({ file, value, url });
        }
    }
}
for (const { file, value, url } of references) {
    const target = path.join(base, decodeURIComponent(url.pathname));
    const existing = [target, path.join(target, 'index.html'), target + '.html'].find(candidate => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
    if (!existing) { errors.push(`${path.relative(base, file)}: missing target ${value}`); continue; }
    const id = decodeURIComponent(url.hash.slice(1)).split(':~:text=')[0];
    if (id && identifiers.has(existing) && !identifiers.get(existing).has(id)) errors.push(`${path.relative(base, file)}: missing anchor ${value}`);
}
if (errors.length) {
    errors.slice(0, 40).forEach(error => console.error('❌ ' + error));
    if (errors.length > 40) console.error(`… ${errors.length - 40} more errors`);
    process.exitCode = 1;
} else {
    console.log(`✅ HTML 完整性检查通过：${files.length} 个页面，无重复 ID，章节锚点与相对资源链接有效`);
}
