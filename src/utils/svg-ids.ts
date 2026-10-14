// Inline SVG definitions share the HTML document. Repeated icons need scoped
// IDs, while every gradient/clip/use reference must still point to its own SVG.
const instances = new WeakMap<Request, number>();

export function nextSvgInstance(request: Request): string {
    const index = (instances.get(request) || 0) + 1;
    instances.set(request, index);
    return `astro-${index}`;
}

export function scopeSvgIds(svg: string, instance: string): string {
    const ids = new Map<string, string>();
    const prefix = `icon-${instance.replace(/[^a-zA-Z0-9_-]/g, "-")}-`;
    for (const match of svg.matchAll(/\bid\s*=\s*(["'])([^"']+)\1/g)) ids.set(match[2], prefix + match[2]);
    if (!ids.size) return svg;
    return svg
        .replace(/(\bid\s*=\s*["'])([^"']+)(["'])/g, (_, before, id, after) => before + (ids.get(id) || id) + after)
        .replace(/(url\(\s*["']?#)([^\s)"']+)(["']?\s*\))/g, (_, before, id, after) => before + (ids.get(id) || id) + after)
        .replace(/((?:xlink:)?href\s*=\s*["']#)([^"']+)(["'])/g, (_, before, id, after) => before + (ids.get(id) || id) + after);
}
