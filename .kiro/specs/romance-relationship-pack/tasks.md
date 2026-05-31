# Implementation Plan — Romance Relationship Pack

## Overview

순수 관계 드라마 시나리오 팩 `shared-house-romance`를 데이터로 추가한다. 팩 골격 → 캐릭터 →
프롬프트 → 이벤트/scene device → 테스트 순. 로더/스키마/파이프라인 코드는 수정하지 않는다.

## Tasks

- [x] 1. 팩 골격 (manifest + scenario-card + objective)
  - `scenarios/shared-house-romance/manifest.json` (genre romance, scene-first, caseKnowledge 없음)
  - `scenario-card.json` (공간/대화/톤/hardNos/openingBeats — 일상 관계극)
  - `objectives/main.json`
  - _Requirements: 1.1, 1.2, 1.3_

- [x] 2. 관계 중심 캐릭터 3명
  - `characters/seo-yujin.json`, `han-doyun.json`, `mer-ari.json`
  - 각 handout(surfacePersonality/fear/behaviorRules/desire/objective/initialRelationshipToUser)
  - relationships로 삼각/라이벌/소꿉친구 구도, 고유 OCEAN/systemPrompt
  - systemPrompt/behaviorRules에 유저 대리 서술 금지 포함
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

- [x] 3. 프롬프트 (director + narrator)
  - `prompts/director.txt` — 관계 드라마 GM 지침(감정 beat 우선, relationshipUpdate 신중, 삼각 활용, JSON만)
  - `prompts/narrator.txt` — 잔잔한 일상 관계극 나레이터(대사 금지, 유저 감정 단정 금지)
  - _Requirements: 3.1_

- [x] 4. 이벤트 + scene device
  - `events/triggers.json` — 관계 전개 이벤트(둘만 남는 저녁/오해/고백 기회/라이벌 표면화)
  - `scene-devices.json` — relational/social/quiet_texture beat, 일부 relationshipChanges(실제 id), factReveals 미사용
  - _Requirements: 3.2, 3.3, 3.4_

- [x] 5. 테스트 + 검증
  - 로드 테스트: success=true, 캐릭터 3명, relationships/scene device 참조 id 무결성
  - dry-run 턴 테스트: 오류 없이 메시지 생성, caseBoard isCaseScenario=false
  - 관계 초기화 테스트: createInitialWorldState가 relationshipGraph를 채움
  - `corepack pnpm -r run check` + 전체 서버 테스트 통과
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 5.1, 5.2, 5.3, 5.4, 5.5_

## Task Dependency Graph

```json
{
  "waves": [
    { "wave": 1, "tasks": ["1"] },
    { "wave": 2, "tasks": ["2", "3", "4"] },
    { "wave": 3, "tasks": ["5"] }
  ]
}
```

```
1 (골격) ─┬─> 2 (캐릭터) ─┐
          ├─> 3 (프롬프트) ┼─> 5 (테스트/검증)
          └─> 4 (이벤트/device) ┘
```

## Notes

- 데이터-only: 로더/스키마/파이프라인 무수정. 추가 변경이 필요하면 별도 처리(공백을 드러내는 게 목적).
- 비미스터리: caseKnowledge 없음 → caseBoard 비고, 누출 하니스 대상 아님.
- PNG 카드 import는 별도 작업(②). design.md Appendix에 포맷 메모.
- 검증: `pnpm -r run check` + 서버 테스트 전체(현재 143 기준) pass.

