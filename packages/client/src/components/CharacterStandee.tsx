import type { ChatMessage } from "@hushline/shared";
import { resolveCharacterExpressionPose, type CharacterExpressionPose } from "../character-expression";

export function CharacterStandeeFallback({
  label,
  expression,
}: {
  label: string;
  expression?: ChatMessage["expression"] | string | null;
}) {
  const pose = resolveCharacterExpressionPose(expression);

  return (
    <div className="vn-svg-standee" aria-label={`${label} 스탠딩 ${pose}`}>
      <div className="vn-character-aura" aria-hidden="true" />
      <svg viewBox="0 0 400 600" role="img" aria-label={label}>
        <path d="M150,220 C120,280 110,400 130,550 C140,550 250,550 270,480 C290,430 270,280 250,220 Z" fill="#0f1e36" opacity="0.8" />
        <path d="M130,240 C100,300 90,420 120,550 L280,550 C290,410 270,290 240,240 Z" fill="#172f52" opacity="0.9" />
        <path d="M165,350 L235,350 L270,580 L130,580 Z" fill="#0b1629" />
        <path d="M175,350 L225,350 L250,580 L150,580 Z" fill="#13233f" />
        <path className="vn-character-accent-stroke" d="M175,380 Q200,390 225,380" />
        <path className="vn-character-accent-stroke soft" d="M150,580 C170,550 230,550 250,580" />
        <path d="M185,290 L215,290 L208,350 L192,350 Z" fill="#2b4369" />
        <path d="M170,330 C180,310 220,310 230,330" stroke="#3b82f6" strokeWidth="2" fill="none" opacity="0.4" />
        <path d="M170,220 C170,280 230,280 230,220 C230,190 170,190 170,220 Z" fill="#1d355c" />
        <path d="M165,200 C155,230 160,260 170,270 C175,220 190,210 195,230 C200,250 185,270 190,280 C210,280 215,240 220,270 C225,250 230,220 235,210 C245,230 240,260 230,275 C245,250 245,210 235,190 Z" fill="#0d1b33" />
        <CharacterExpressionFace pose={pose} />
      </svg>
    </div>
  );
}

export function CharacterExpressionFace({ pose }: { pose: CharacterExpressionPose }) {
  if (pose === "happy") {
    return (
      <g className="vn-expression-face">
        <path className="vn-character-mouth" d="M182,232 Q190,225 194,232" strokeWidth="2.5" />
        <path className="vn-character-mouth" d="M206,232 Q214,225 218,232" strokeWidth="2.5" />
        <path className="vn-character-mouth" d="M195,246 Q200,250 205,246" strokeWidth="1.5" />
      </g>
    );
  }

  if (pose === "surprised") {
    return (
      <g className="vn-expression-face">
        <circle className="vn-character-eye" cx="188" cy="233" r="4.5" />
        <circle className="vn-character-eye" cx="212" cy="233" r="4.5" />
        <circle cx="188" cy="233" r="2" fill="#ffffff" />
        <circle cx="212" cy="233" r="2" fill="#ffffff" />
        <circle cx="200" cy="247" r="2.5" fill="var(--vn-character-eye)" />
      </g>
    );
  }

  if (pose === "sad") {
    return (
      <g className="vn-expression-face">
        <path className="vn-character-accent-stroke" d="M182,230 Q190,235 194,230" />
        <path className="vn-character-accent-stroke" d="M206,230 Q214,235 218,230" />
        <path className="vn-character-mouth" d="M196,248 Q200,244 204,248" />
      </g>
    );
  }

  if (pose === "thinking") {
    return (
      <g className="vn-expression-face">
        <path className="vn-character-accent-stroke" d="M182,228 L194,231" />
        <path className="vn-character-accent-stroke" d="M218,228 L206,231" />
        <ellipse className="vn-character-eye" cx="188" cy="235" rx="3.5" ry="4" />
        <ellipse className="vn-character-eye" cx="212" cy="235" rx="3.5" ry="4" />
        <line className="vn-character-mouth" x1="196" y1="247" x2="204" y2="247" />
      </g>
    );
  }

  if (pose === "worried") {
    return (
      <g className="vn-expression-face">
        <path className="vn-character-accent-stroke" d="M181,228 Q188,224 194,230" />
        <path className="vn-character-accent-stroke" d="M206,230 Q212,224 219,228" />
        <ellipse className="vn-character-eye" cx="188" cy="234" rx="3.5" ry="5" />
        <ellipse className="vn-character-eye" cx="212" cy="234" rx="3.5" ry="5" />
        <path className="vn-character-mouth" d="M196,249 Q200,246 204,249" />
      </g>
    );
  }

  if (pose === "angry") {
    return (
      <g className="vn-expression-face">
        <path className="vn-character-accent-stroke" d="M181,226 L194,230" />
        <path className="vn-character-accent-stroke" d="M219,226 L206,230" />
        <path className="vn-character-eye" d="M184,235 Q188,232 193,235" />
        <path className="vn-character-eye" d="M207,235 Q212,232 217,235" />
        <line className="vn-character-mouth" x1="195" y1="248" x2="205" y2="246" />
      </g>
    );
  }

  return (
    <g className="vn-expression-face">
      <ellipse className="vn-character-eye" cx="188" cy="233" rx="3.5" ry="5" />
      <ellipse className="vn-character-eye" cx="212" cy="233" rx="3.5" ry="5" />
      <circle cx="189" cy="232" r="1" fill="#ffffff" />
      <circle cx="213" cy="232" r="1" fill="#ffffff" />
      <line className="vn-character-mouth" x1="196" y1="245" x2="204" y2="245" />
    </g>
  );
}
