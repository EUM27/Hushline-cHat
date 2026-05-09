export function parseModelJson<T>(raw: string, fallback: T): T {
  const unfenced = raw
    .replace(/```json/gi, "```")
    .replace(/```/g, "")
    .trim();
  const candidate = extractFirstJsonObject(unfenced);

  if (!candidate) {
    return fallback;
  }

  try {
    return { ...fallback, ...JSON.parse(candidate) };
  } catch {
    return fallback;
  }
}

function extractFirstJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start === -1) {
    return null;
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < text.length; index += 1) {
    const char = text[index];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === "\\") {
      escaped = true;
      continue;
    }

    if (char === "\"") {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (char === "{") {
      depth += 1;
    }

    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return text.slice(start, index + 1);
      }
    }
  }

  return null;
}
