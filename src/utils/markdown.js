import DOMPurify from "dompurify";

let purifyInstance = null;

/**
 * Initialize or retrieve DOMPurify instance.
 * Works in Browser (where window exists) and Node/JSDOM test environments.
 */
export function getPurifier() {
  if (purifyInstance) return purifyInstance;
  if (typeof window !== "undefined") {
    purifyInstance = typeof DOMPurify === "function" ? DOMPurify(window) : DOMPurify;
  }
  return purifyInstance;
}

export function setPurifierWindow(domWindow) {
  if (domWindow) {
    purifyInstance = typeof DOMPurify === "function" ? DOMPurify(domWindow) : DOMPurify;
  } else {
    purifyInstance = null;
  }
}

const ALLOWED_TAGS = [
  "p", "br", "strong", "em", "code", "pre", "h1", "h2", "h3",
  "ul", "ol", "li", "table", "tbody", "thead", "tr", "td", "th",
  "hr", "span", "a"
];

const ALLOWED_ATTR = ["class", "href", "target", "rel"];

/**
 * Safely encodes all HTML special characters to entities.
 */
export function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Validates URLs for Markdown links to forbid javascript:, vbscript:, data:, etc.
 */
function sanitizeUrl(rawUrl) {
  const url = String(rawUrl || "").trim();
  if (/^(https?:\/\/|\/|#|mailto:)/i.test(url)) {
    return url;
  }
  return "#unsafe-link";
}

/**
 * Production Markdown renderer with multi-layer XSS protection:
 * 1. Strict HTML Entity Encoding of all raw characters.
 * 2. Whitelisted Markdown grammar conversion.
 * 3. Safe URL protocol enforcement on links.
 * 4. Structural HTML compliance (table wrapping).
 * 5. DOMPurify sanitization pass.
 */
export function renderMarkdown(text) {
  if (!text) return "";

  // Step 1: Pre-escape all raw HTML characters to neutralize scripts/tags/event handlers
  let html = escapeHtml(text)
    // Code blocks (preserve block code before inline operations)
    .replace(/```(\w*)\n([\s\S]*?)```/g, "<pre><code>$2</code></pre>")
    // Inline code
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    // Headings
    .replace(/^### (.*$)/gm, "<h3>$1</h3>")
    .replace(/^## (.*$)/gm, "<h2>$1</h2>")
    .replace(/^# (.*$)/gm, "<h1>$1</h1>")
    // Horizontal rules (before line break splitting)
    .replace(/^---+$/gm, "<hr>")
    // Bold
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/__(.*?)__/g, "<strong>$1</strong>")
    // Italic
    .replace(/\*(.*?)\*/g, "<em>$1</em>")
    .replace(/_(.*?)_/g, "<em>$1</em>")
    // Markdown Links: [label](url) with protocol validation
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, label, url) => {
      const safeHref = sanitizeUrl(url);
      return `<a href="${safeHref}" target="_blank" rel="noopener noreferrer">${label}</a>`;
    })
    // Tables: parse rows and wrap consecutive rows in <table><tbody>...</tbody></table>
    .replace(/\|(.+)\|/g, (match, tableContent) => {
      if (tableContent.trim().match(/^[-:| ]+$/)) return "";
      const cells = tableContent.split("|").map(c => c.trim()).filter(Boolean);
      return `<tr>${cells.map(c => `<td>${c}</td>`).join("")}</tr>`;
    })
    .replace(/(?:<tr>.*?<\/tr>[\s\n]*)+/g, (match) => {
      return `<table><tbody>${match.trim()}</tbody></table>`;
    })
    // Bullet lists
    .replace(/^[•*-] (.*)$/gm, "<li>$1</li>")
    // Numbered lists
    .replace(/^\d+\.\s+(.*)$/gm, "<li>$1</li>")
    // Wrap consecutive <li> in <ul>
    .replace(/(<li>.*?<\/li>(\s*<li>.*?<\/li>)*)/g, "<ul>$1</ul>")
    // Line breaks
    .replace(/\n\n/g, "</p><p>")
    .replace(/\n/g, "<br>");

  const rawFormatted = `<p>${html}</p>`;

  const purifier = getPurifier();
  if (purifier && typeof purifier.sanitize === "function") {
    return purifier.sanitize(rawFormatted, {
      ALLOWED_TAGS,
      ALLOWED_ATTR,
      FORBID_TAGS: ["script", "style", "iframe", "object", "embed", "form", "svg"],
      FORBID_ATTR: ["onerror", "onload", "onclick", "onmouseover", "onfocus", "onblur", "style"]
    });
  }

  // Fallback: rawFormatted is already strictly entity-escaped and contains only whitelisted static tags
  return rawFormatted;
}
