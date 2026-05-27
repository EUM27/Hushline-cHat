const BACKGROUND_TAG_PATTERN = /\[(?:bg|background|배경)\s*:\s*([^\]]+)\]/gi;

const BACKGROUND_ALIASES: Record<string, string> = {
  "거실": "lodge-foyer",
  "현관": "lodge-foyer",
  "현관홀": "lodge-foyer",
  "로비": "lodge-foyer",
  "입구": "lodge-foyer",
  "식당": "lodge-dining-room",
  "다이닝": "lodge-dining-room",
  "복도": "lodge-upstairs-hallway",
  "2층복도": "lodge-upstairs-hallway",
  "이층복도": "lodge-upstairs-hallway",
  "서재문": "lodge-study-door",
  "서재앞": "lodge-study-door",
  "잠긴문": "lodge-study-door",
  "서재": "lodge-study-crime-scene",
  "사건현장": "lodge-study-crime-scene",
  "시체": "lodge-study-crime-scene",
  "설비실": "lodge-maintenance-room",
  "보일러실": "lodge-maintenance-room",
  "발전기실": "lodge-maintenance-room",
  "외부": "lodge-exterior-storm",
  "산장밖": "lodge-exterior-storm",
  "폭설": "lodge-exterior-storm",
  "진입로": "lodge-exterior-drive",
  "눈길": "lodge-exterior-drive",
};

export interface ParsedBackgroundTags {
  content: string;
  backgroundId: string | null;
}

export function parseBackgroundTags(
  content: string,
  allowedBackgroundIds: Iterable<string>,
): ParsedBackgroundTags {
  const allowed = new Set(allowedBackgroundIds);
  let backgroundId: string | null = null;
  const cleaned = content.replace(BACKGROUND_TAG_PATTERN, (match, rawTag: string) => {
    const resolved = resolveBackgroundTag(rawTag, allowed);
    if (!resolved) {
      return match;
    }
    backgroundId = resolved;
    return "";
  });

  return {
    content: cleaned.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim(),
    backgroundId,
  };
}

function resolveBackgroundTag(rawTag: string, allowed: Set<string>): string | null {
  const tag = rawTag.trim();
  if (!tag) return null;
  if (allowed.has(tag)) return tag;

  const normalized = tag
    .normalize("NFKC")
    .replace(/^backgrounds:/i, "")
    .replace(/\s+/g, "")
    .toLowerCase();

  for (const id of allowed) {
    const normalizedId = id.replace(/[-_\s]+/g, "").toLowerCase();
    if (normalized === normalizedId || normalizedId.endsWith(normalized)) {
      return id;
    }
  }

  const alias = BACKGROUND_ALIASES[normalized] ?? BACKGROUND_ALIASES[tag.replace(/\s+/g, "")];
  return alias && allowed.has(alias) ? alias : null;
}
