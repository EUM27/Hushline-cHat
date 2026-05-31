import { useRef, useState } from "react";
import { Upload, UserPlus } from "lucide-react";
import { importCharacterCard, type ImportedCharacterCard } from "../../api-v2";

export interface CharacterCardImportProps {
  /** Called when a card is successfully imported (preview confirmed). */
  onImported?: (character: ImportedCharacterCard) => void;
}

export function CharacterCardImport({ onImported }: CharacterCardImportProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImportedCharacterCard | null>(null);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setIsLoading(true);
    setError(null);
    try {
      const character = await importCharacterCard(file);
      setPreview(character);
      onImported?.(character);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "카드를 불러오지 못했습니다.");
      setPreview(null);
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

      {preview ? (
        <article className="card-import-preview">
          <div className="card-import-preview-head">
            <strong>{preview.name}</strong>
            <span>{preview.mbti}</span>
          </div>
          {preview.role ? <p className="card-import-role">{preview.role}</p> : null}
          {preview.handout.surfacePersonality?.length ? (
            <div className="card-import-tags">
              {preview.handout.surfacePersonality.map((tag) => (
                <span key={tag}>{tag}</span>
              ))}
            </div>
          ) : null}
          <div className="card-import-meta">
            <span>자율성</span>
            <strong>{preview.autonomy.toFixed(2)}</strong>
            <span>호감도</span>
            <strong>{preview.handout.initialRelationshipToUser}</strong>
            <span>관계</span>
            <strong>{preview.relationships.length}</strong>
            <span>비밀</span>
            <strong>{preview.handout.secret ? "있음" : "없음"}</strong>
          </div>
        </article>
      ) : null}
    </section>
  );
}
