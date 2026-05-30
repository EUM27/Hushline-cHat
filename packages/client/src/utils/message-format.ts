export type MessageFormatToken =
  | { kind: "text"; text: string }
  | { kind: "dialogue"; text: string }
  | { kind: "thought"; text: string }
  | { kind: "bold"; text: string }
  | { kind: "italic"; text: string }
  | { kind: "lineBreak" };

export function parseMessageFormat(content: string): MessageFormatToken[] {
  const tokens: MessageFormatToken[] = [];
  const lines = content.split("\n");
  for (const [lineIndex, line] of lines.entries()) {
    if (lineIndex > 0) {
      tokens.push({ kind: "lineBreak" });
    }
    tokens.push(...parseInlineMessageFormat(line));
  }
  return mergeAdjacentTextTokens(tokens);
}

function parseInlineMessageFormat(line: string): MessageFormatToken[] {
  const tokens: MessageFormatToken[] = [];
  let index = 0;
  const pattern = /(\*\*([^*\n]+)\*\*)|(\*([^*\n]+)\*)|(["“]([^"”\n]*)(?:"|”)?)|(['‘]([^'’\n]*)(?:'|’)?)/g;
  while (index < line.length) {
    pattern.lastIndex = index;
    const match = pattern.exec(line);
    if (!match || match.index !== index || match[0].length === 0) {
      const nextIndex = findNextFormatStart(line, index + 1);
      tokens.push({ kind: "text", text: line.slice(index, nextIndex) });
      index = nextIndex;
      continue;
    }

    if (match[2] !== undefined) {
      tokens.push({ kind: "bold", text: match[2] });
    } else if (match[4] !== undefined) {
      tokens.push({ kind: "italic", text: match[4] });
    } else if (match[6] !== undefined) {
      tokens.push({ kind: "dialogue", text: match[6] });
    } else if (match[8] !== undefined) {
      tokens.push({ kind: "thought", text: match[8] });
    }
    index += match[0].length;
  }
  return tokens;
}

function findNextFormatStart(line: string, fromIndex: number): number {
  const starts = ["**", "*", "\"", "“", "'", "‘"]
    .map((marker) => line.indexOf(marker, fromIndex))
    .filter((nextIndex) => nextIndex >= 0);
  return starts.length > 0 ? Math.min(...starts) : line.length;
}

function mergeAdjacentTextTokens(tokens: MessageFormatToken[]): MessageFormatToken[] {
  const merged: MessageFormatToken[] = [];
  for (const token of tokens) {
    const previous = merged.at(-1);
    if (token.kind === "text" && previous?.kind === "text") {
      previous.text += token.text;
    } else if (token.kind !== "text" || token.text) {
      merged.push(token);
    }
  }
  return merged;
}
