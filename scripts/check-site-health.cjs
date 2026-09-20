const { existsSync, readFileSync, readdirSync } = require("node:fs");
const { join, resolve } = require("node:path");

function resolveOutputDir() {
    if (process.argv[2]) return resolve(process.argv[2]);
    const distDir = resolve("dist");
    const clientDir = join(distDir, "client");
    return existsSync(join(distDir, "index.html")) ? distDir : clientDir;
}

const outputDir = resolveOutputDir();
const checks = [
    ["index.html", "首页"],
    [join("posts", "index.html"), "文章列表"],
    [join("archive", "index.html"), "归档"],
    [join("pagefind", "pagefind.js"), "搜索索引"],
];
let failed = false;
for (const [relative, label] of checks) {
    const file = join(outputDir, relative);
    if (!existsSync(file)) {
        console.error(`❌ 健康检查缺少${label}: ${relative}`);
        failed = true;
    }
}

const htmlFiles = [];
function walk(dir) {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) walk(path);
        else if (entry.name.endsWith(".html")) htmlFiles.push(path);
    }
}
walk(outputDir);
if (htmlFiles.length < 20) {
    console.error(`❌ 健康检查页面数量异常：仅发现 ${htmlFiles.length} 个 HTML 文件`);
    failed = true;
}
let missingTitle = 0;
let leakedPlaceholder = 0;
for (const file of htmlFiles) {
    const html = readFileSync(file, "utf8");
    if (!/<title>[^<]+<\/title>/.test(html)) missingTitle++;
    if (/__ASTRO_/.test(html)) leakedPlaceholder++;
}
if (missingTitle) { console.error(`❌ 健康检查发现 ${missingTitle} 个页面缺少 title`); failed = true; }
if (leakedPlaceholder) { console.error(`❌ 健康检查发现 ${leakedPlaceholder} 个页面包含未替换占位符`); failed = true; }

if (failed) process.exit(1);
console.log(`✅ 站点健康检查通过：${htmlFiles.length} 个页面、核心路由和搜索索引完整`);
