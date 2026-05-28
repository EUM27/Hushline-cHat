import { useEffect, useMemo, useRef, useState } from "react";
import type { ModelOption } from "@hushline/shared";

export function ModelSearchPicker({
  value,
  options,
  loading,
  onSelect,
  onLoadModels,
}: {
  value: string;
  options: ModelOption[];
  loading: boolean;
  onSelect: (modelId: string) => void;
  onLoadModels: () => void;
}) {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setQuery(value);
  }, [value]);

  const visibleOptions = useMemo(
    () => open ? getVisibleModelOptions(options, query, value) : [],
    [open, options, query, value],
  );

  function handleSelect(modelId: string) {
    setQuery(modelId);
    onSelect(modelId);
    setOpen(false);
  }

  function handleInputChange(v: string) {
    setQuery(v);
    setOpen(true);
    // 직접 입력도 모델 ID로 반영
    onSelect(v);
  }

  return (
    <div className="model-search-picker">
      <div className="model-picker">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => handleInputChange(e.target.value)}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder="모델 ID 검색 또는 직접 입력"
        />
        <button type="button" onClick={onLoadModels} disabled={loading}>
          {loading ? "로드 중" : "목록"}
        </button>
      </div>
      {open && visibleOptions.length > 0 && (
        <ul className="model-dropdown" onMouseDown={(event) => event.preventDefault()}>
          {visibleOptions.map((m) => (
            <li
              key={m.id}
              onMouseDown={() => handleSelect(m.id)}
              className={m.id === value ? "selected" : ""}
            >
              <span className="model-dropdown-row">
                <span className="model-dropdown-id">{m.id}</span>
                {m.billingTier ? <span className={`model-tier ${m.billingTier}`}>{getBillingTierLabel(m.billingTier)}</span> : null}
              </span>
              {m.label !== m.id && <span className="model-dropdown-label">{m.label}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function getVisibleModelOptions(
  options: ModelOption[],
  query: string,
  selectedModelId = "",
): ModelOption[] {
  const normalizedQuery = query.trim().toLowerCase();
  const selectedModel = selectedModelId && !options.some((model) => model.id === selectedModelId)
    ? [{ id: selectedModelId, label: selectedModelId }]
    : [];
  const filtered = options.filter(
    (model) =>
      !normalizedQuery ||
      model.id.toLowerCase().includes(normalizedQuery) ||
      model.label.toLowerCase().includes(normalizedQuery),
  );

  return [...selectedModel, ...filtered];
}

function getBillingTierLabel(tier: NonNullable<ModelOption["billingTier"]>): string {
  if (tier === "subscription") return "구독";
  if (tier === "paid") return "유료";
  return "기타";
}
