import MarkdownIt from "markdown-it";

// Raw HTML stays escaped; MarkdownIt's link validation rejects script URLs.
// Keeping this module separate lets the editor load the parser only when opened.
const markdown = new MarkdownIt({ html: false, linkify: true, breaks: true });
const defaultLink = markdown.renderer.rules.link_open;
markdown.renderer.rules.link_open = (tokens, index, options, env, self) => {
    tokens[index].attrSet("target", "_blank");
    tokens[index].attrSet("rel", "noopener noreferrer");
    return defaultLink ? defaultLink(tokens, index, options, env, self) : self.renderToken(tokens, index, options);
};
export function renderNotePreview(source: string): string { return markdown.render(source); }
