import { useRef, useState } from "react";
import { Upload, UserPlus } from "lucide-react";
import { importCharacterCard, type ImportedCharacterCardResult } from "../../api-v2";

export interface CharacterCardImportProps {
  targetLabel?: string;
  preview?: ImportedCharacterCardResult | null;
  /** Called when a card is successfully imported and previewed. */
  onImported?: (result: ImportedCharacterCardResult) => void;
  onApply?: (result: ImportedCharacterCardResult) => void;
}

export function CharacterCardImport({ targetLabel, preview, onImported, onApply }: CharacterCardImportProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [localPreview, setLocalPreview] = useState<ImportedCharacterCardResult | null>(null);
  const activePreview = preview ?? localPreview;
  const importStatus = activePreview
    ? `${activePreview.character.name} 카드를 불러왔습니다.${
        activePreview.characterCard ? " 저장된 카드 목록에도 추가됐습니다." : ""
      }`
    : null;

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setIsLoading(true);
    setError(null);
    try {
      const result = await importCharacterCard(file);
      setLocalPreview(result);
      onImported?.(result);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "카드를 불러오지 못했습니다.");
      setLocalPreview(null);
    } finally {
      setIsLoading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <section className="card-import" aria-label="캐릭터 카드 불러오기">
      <div className="card-import-head">
        <UserPlus size={16} aria-hidden="true" />
        <span>캐릭터 카드 불러오기</span>
      </div>

      <button
        type="button"
        className="card-import-button"
        onClick={() => inputRef.current?.click()}
        disabled={isLoading}
      >
        <Upload size={14} aria-hidden="true" />
        {isLoading ? "불러오는 중..." : "JSON / PNG 카드 선택"}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept=".json,.png,image/png,application/json"
        hidden
        onChange={(event) => void handleFile(event.target.files?.[0] ?? undefined)}
      />

      {error ? <p className="error-line card-import-error">{error}</p> : null}
      {importStatus ? (
        <p className="card-import-status" role="status" aria-live="polite">
          {importStatus}
        </p>
      ) : null}

      {activePreview ? (
        <article className="card-import-preview">
          <div className="card-import-preview-head">
            <strong>{activePreview.character.name}</strong>
            <span>{formatSourceFormat(activePreview.metadata.sourceFormat)}</span>
          </div>
          {activePreview.character.role ? <p className="card-import-role">{activePreview.character.role}</p> : null}
          <dl className="card-import-source-grid">
            <div>
              <dt>파일</dt>
              <dd>{activePreview.metadata.sourceFileName ?? "직접 입력"}</dd>
            </div>
            <div>
              <dt>스펙</dt>
              <dd>{activePreview.metadata.cardSpec ?? "알 수 없음"}</dd>
            </div>
            <div>
              <dt>Creator</dt>
              <dd>{activePreview.metadata.creator ?? "미기재"}</dd>
            </div>
            <div>
              <dt>첫 메시지</dt>
              <dd>{activePreview.metadata.hasFirstMessage ? "있음" : "없음"}</dd>
            </div>
          </dl>
          {activePreview.metadata.extensionKeys.length ? (
            <div className="card-import-tags">
              {activePreview.metadata.extensionKeys.map((key) => (
                <span key={key}>{formatExtensionKey(key)}</span>
              ))}
            </div>
          ) : null}
          <div className="card-import-meta">
            <span>자율성</span>
            <strong>{activePreview.character.autonomy.toFixed(2)}</strong>
            <span>호감도</span>
            <strong>{activePreview.character.handout.initialRelationshipToUser}</strong>
            <span>관계</span>
            <strong>{activePreview.character.relationships.length}</strong>
            <span>비밀</span>
            <strong>{activePreview.character.handout.secret ? "있음" : "없음"}</strong>
          </div>
          {onApply ? (
            <button type="button" className="card-import-apply" onClick={() => onApply(activePreview)}>
              {targetLabel ? `${targetLabel} 슬롯에 적용` : "현재 슬롯에 적용"}
            </button>
          ) : null}
        </article>
      ) : null}
    </section>
  );
}

function formatSourceFormat(format: ImportedCharacterCardResult["metadata"]["sourceFormat"]): string {
  switch (format) {
    case "png-chara-v2":
      return "Tavern PNG v2";
    case "png-ccv3":
      return "Tavern PNG v3";
    case "json-v2":
      return "JSON v2";
    case "json-v3":
      return "JSON v3";
    default:
      return "JSON";
  }
}

function formatExtensionKey(key: string): string {
  return key === "janitor" ? "Janitor" : key;
}
