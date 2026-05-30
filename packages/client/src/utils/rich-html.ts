export function looksLikeRichHtml(content: string): boolean {
  return /<\/?[a-z][\s\S]*>/i.test(content);
}

export function sanitizeRichHtml(raw: string): string {
  const parser = new DOMParser();
  const document = parser.parseFromString(`<div>${raw}</div>`, "text/html");
  const root = document.body.firstElementChild;
  if (!root) return "";

  root.querySelectorAll("script, iframe, object, embed, link, meta, base, form, input, button, select, textarea, svg, math").forEach((element) => {
    element.remove();
  });

  root.querySelectorAll("*").forEach((element) => {
    for (const attr of Array.from(element.attributes)) {
      const name = attr.name.toLowerCase();
      const value = attr.value.trim();
      const lowerValue = value.toLowerCase();
      if (name.startsWith("on") || name === "srcdoc") {
        element.removeAttribute(attr.name);
        continue;
      }
      if ((name === "href" || name === "src") && /^(javascript:|data:text\/html)/i.test(lowerValue)) {
        element.removeAttribute(attr.name);
        continue;
      }
      if (name === "style") {
        const cleaned = sanitizeCssText(value);
        if (cleaned) {
          element.setAttribute("style", cleaned);
        } else {
          element.removeAttribute(attr.name);
        }
      }
    }
  });

  root.querySelectorAll("style").forEach((element) => {
    element.textContent = scopeCssToMessage(sanitizeCssText(element.textContent ?? ""));
  });

  return root.innerHTML;
}

export function sanitizeCssText(value: string): string {
  return value
    .replace(/@import\s+[^;]+;?/gi, "")
    .replace(/javascript\s*:/gi, "")
    .replace(/expression\s*\([^)]*\)/gi, "")
    .trim();
}

export function scopeCssToMessage(value: string): string {
  return value.replace(/(^|})\s*([^@{}][^{}]*)\s*{/g, (_match, closeBrace: string, selectorBlock: string) => {
    const selectors = selectorBlock
      .split(",")
      .map((selector) => selector.trim())
      .filter(Boolean)
      .map((selector) => `.message-content.rich-html ${selector}`)
      .join(", ");
    return selectors ? `${closeBrace} ${selectors} {` : `${closeBrace} {`;
  });
}
