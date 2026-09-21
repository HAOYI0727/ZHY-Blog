const { existsSync, readFileSync, readdirSync } = require("node:fs");
const { join, relative, resolve, extname, sep } = require("node:path");

function resolveOutputDir() {
    if (process.argv[2]) return resolve(process.argv[2]);
    const distDir = resolve("dist");
    const clientDir = join(distDir, "client");
    return existsSync(join(distDir, "index.html")) ? distDir : clientDir;
}

const outputDir = resolveOutputDir();
const htmlFiles = [];

function walk(dir) {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const file = join(dir, entry.name);
        if (entry.isDirectory()) walk(file);
        else if (entry.name.endsWith(".html")) htmlFiles.push(file);
    }
}

walk(outputDir);

const attributePattern = /(?:href|src|poster)=["']([^"']+)["']/g;
const missing = new Map();

function isSkippable(url) {
    return !url
        || url.startsWith("#")
        || url.startsWith("/api/")
        || /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(url);
}

function candidatesFor(url) {
    const pathname = decodeURIComponent(url.split("#")[0].split("?")[0]);
    if (!pathname.startsWith("/")) return [];
    const target = join(outputDir, pathname.slice(1));
    if (extname(target)) return [target];
    return [target, join(target, "index.html"), `${target}.html`];
}

// Vercel runs on a case-sensitive Linux filesystem, while local macOS
// development commonly uses a case-insensitive volume. Resolve each path
// segment against the directory entries so a `VLM.png`/`vlm.png` mismatch is
// caught before deployment rather than only after the remote build fails.
function existsCaseSensitive(path) {
    const relativePath = relative(outputDir, path);
    if (relativePath.startsWith("..") || relativePath === "") return relativePath === "";
    let current = outputDir;
    for (const segment of relativePath.split(sep)) {
        if (!segment) continue;
        let entries;
        try {
            entries = readdirSync(current);
        } catch {
            return false;
        }
        if (!entries.includes(segment)) return false;
        current = join(current, segment);
    }
    return true;
}

for (const file of htmlFiles) {
    const html = readFileSync(file, "utf8");
    let match;
    while ((match = attributePattern.exec(html))) {
        const url = match[1];
        if (isSkippable(url)) continue;
        const candidates = candidatesFor(url);
        if (candidates.length && !candidates.some(existsCaseSensitive)) {
            if (!missing.has(url)) missing.set(url, []);
            missing.get(url).push(relative(outputDir, file));
        }
    }
}

if (missing.size) {
    for (const [url, files] of missing) {
        const sample = files.slice(0, 3).join(", ");
        const suffix = files.length > 3 ? " …" : "";
        console.error(`❌ 本地资源或路由不存在：${url} ← ${sample}${suffix}`);
    }
    process.exit(1);
}

console.log(`✅ 本地链接与资源检查通过：扫描 ${htmlFiles.length} 个页面`);
