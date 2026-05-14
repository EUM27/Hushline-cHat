# Future: 배경 이미지 시스템 설계 메모

> 현재 단계에서는 미구현. 상업화 단계에서 붙일 것.

---

## 배경 처리 3가지 모드

### 1. 프리셋 (현재)
- 시나리오 팩에 이미지 파일 포함
- manifest에 id/name/tags 매핑
- Director가 `backgroundId`로 전환

### 2. AI 실시간 생성 (상업화 시)
- 시나리오 팩에 프롬프트만 포함 (이미지 파일 없음)
- 세션 시작 또는 장면 전환 시 이미지 생성 API 호출
- 생성된 이미지는 세션 캐시에 저장
- 같은 장소라도 분위기 변하면 재생성 가능

### 3. 유저 업로드 + 자동 태깅
- 유저가 이미지 드래그 앤 드롭
- PNG 메타데이터에서 프롬프트 추출 시도
- 비전 모델로 태그 자동 생성 (선택적)
- 유저가 확인/수정 후 manifest에 등록

---

## 배경 Manifest 구조 (통합)

```json
[
  {
    "id": "study-room",
    "name": "3층 서재",
    "file": "study-room.png",           // 프리셋 모드 (있으면 이거 씀)
    "prompt": "dark victorian study...", // AI 생성 모드 (file 없으면 이걸로 생성)
    "negativePrompt": "people, text",   // 생성 시 네거티브
    "tags": ["interior", "3f", "dark", "crime-scene"],
    "cached": "/cache/session-xxx/study-room.webp"  // 생성 후 캐시 경로
  }
]
```

- `file` 있으면 → 프리셋 사용
- `file` 없고 `prompt` 있으면 → AI 생성
- `cached` 있으면 → 이미 생성된 거 재사용
- `tags` → Director가 장면에 맞는 배경 선택할 때 사용

---

## Director의 배경 선택 방식

1. **명시적**: `stateDelta.backgroundId: "study-room"` — 정확한 ID 지정
2. **태그 기반** (나중에): Director가 `"어두운 실내"` 같은 조건 → 엔진이 tags 매칭해서 선택
3. **동적 생성** (나중에): Director가 새 장소 묘사 → 프롬프트 자동 생성 → 이미지 생성

---

## 분위기(Mood)와 배경의 관계

- **배경 = 장소** (정적, 바뀌려면 Director가 명시적으로 전환)
- **분위기 = 감정** (동적, 매 턴 Director가 결정)
- **렌더링 = 배경 이미지 + Mood 오버레이 합성**
  - `tense` → 약한 붉은 tint + vignette
  - `scared` → 어두운 tint + 노이즈
  - `warm` → 따뜻한 톤 + 밝기 증가
  - `neutral` → 오버레이 없음

배경 이미지 자체에 mood를 고정하지 않음. 같은 서재가 평온할 수도, 공포스러울 수도 있으니까.

---

## 비용 구조 (상업화 시)

- 배경 생성: 세션당 5~10장 정도 (장소 수)
- 리롤: 유저 크레딧 소모
- 캐시: 같은 세션 내에서는 재사용
- 프리셋 팩: 무료 (이미지 포함 배포)
- AI 생성 팩: 프롬프트만 배포, 생성 비용은 유저 부담

---

## 구현 우선순위

1. ✅ 현재: `backgroundId` 문자열 + 프리셋 이미지 (수동)
2. 다음: 시나리오 팩에 backgrounds/manifest.json 구조 추가
3. 그 다음: 이미지 생성 API 연동 (DALL-E / Stability / ComfyUI)
4. 마지막: 비전 모델 자동 태깅 + 유저 업로드 UI

---

## 참고: 마리나라 엔진의 배경 시스템

마리나라는 `background` 에이전트가 post_processing 단계에서 "현재 장면에 맞는 배경"을 유저 업로드 배경 중에서 선택하는 구조. 우리는 Director가 직접 지정하는 방식이라 더 명시적.
