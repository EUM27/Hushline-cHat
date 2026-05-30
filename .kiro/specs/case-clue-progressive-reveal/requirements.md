# Requirements Document

## Introduction

현재 사건파일의 단서장(`buildCaseBoard`)은 시나리오의 briefing/public 사실을 **세션 시작부터
전부** `knownSinceTurn: 0`으로 노출하고, 인물 기록(dossier)도 `session.characters` 전체를
**처음부터 전량** 나열한다. 그 결과 플레이어가 아무것도 조사하지 않았는데도 단서장과 인물
목록이 처음부터 가득 차 있어, 추리물의 "수첩이 차오르는" 경험이 없다.

이 기능은 단서장과 인물 기록을 모두 **빈 상태로 시작**해서, 사실이 실제로 플레이 중
언급/공개되거나 인물을 실제로 만났을 때마다 채워지도록 바꾼다. 어떤 사실이 "공개되었는지"는
엔진이 이미 턴마다 계산하는 `caseAnswerScope`에서, 어떤 인물을 "만났는지"는 그 턴에 실제로
발화/등장한 speaker에서 가져온다.

핵심 제약: 노출은 **단조 증가(monotonic)**여야 한다. 한 번 공개된 단서/인물은 이후 턴에서
사라지면 안 된다. scene snapshot은 최근 10개만 보존되므로, snapshot에만 의존하면 오래된
항목이 유실된다. 따라서 공개·조우 이력을 worldState에 누적 보관한다.

## Glossary

- **단서장(Clue Ledger)**: 사건파일 앱의 "밝혀진 단서" 목록(`CaseBoardView.clues`).
- **공개된 사실(revealed fact)**: 플레이 중 플레이어에게 정당하게 드러난 case fact.
- **revealedCaseFacts**: factId → 최초 공개 턴을 기록하는 worldState 누적 맵(신규).
- **caseAnswerScope**: 엔진이 턴마다 계산하는, 그 질문에 답할 수 있는 fact 범위.

## Requirements

### Requirement 1: 단서장은 빈 상태로 시작

**User Story:** 플레이어로서, 아직 아무것도 조사하지 않았을 때 단서장이 비어 있길 원한다.
그래야 단서를 모아가는 추리 경험이 산다.

#### Acceptance Criteria

1. WHEN 세션이 시작되고 아직 어떤 사실도 공개되지 않았으면 THE 단서장 SHALL 비어 있어야 한다(clues 길이 0).
2. THE briefing/public 사실 SHALL 더 이상 `knownSinceTurn: 0`으로 자동 전량 노출되지 않는다.
3. WHEN 단서장이 비어 있으면 THE 사건파일 앱 SHALL "아직 확보한 단서가 없어" 안내를 표시한다(기존 빈 상태 재사용).

### Requirement 2: 공개 이력 누적 (단조 증가)

**User Story:** 엔진으로서, 한 번 공개된 단서를 영구히 기억하고 싶다. 그래야 snapshot이
밀려나도 단서가 유실되지 않는다.

#### Acceptance Criteria

1. THE `WorldState` SHALL 공개된 case fact의 이력(`revealedCaseFacts`: factId → 최초 공개 턴)을 보관한다.
2. WHEN 한 턴에서 `caseAnswerScope`가 public/observable 사실을 답변 범위에 포함하면 THE 파이프라인
   SHALL 그 factId들을 `revealedCaseFacts`에 (없을 때만) 최초 공개 턴과 함께 기록한다.
3. WHEN 같은 factId가 이후 턴에 다시 공개되면 THE 파이프라인 SHALL 최초 공개 턴을 덮어쓰지 않는다.
4. WHEN 새 세션의 WorldState가 생성되면 THE `revealedCaseFacts` SHALL 빈 상태로 초기화된다.
5. THE hidden truth fact SHALL `revealedCaseFacts`에 절대 기록되지 않는다.

### Requirement 3: 단서장은 누적 이력으로 구성

**User Story:** 플레이어로서, 조사로 드러난 단서가 시간이 지나도 단서장에 남아 있길 원한다.

#### Acceptance Criteria

1. WHEN 단서장을 구성하면 THE `buildCaseBoard` SHALL `revealedCaseFacts`에 기록된 사실만 단서로 포함한다.
2. WHEN 사실이 briefing/public/observable 중 무엇이든 THE 단서의 `source` SHALL 원래 카테고리에
   맞게 표시된다(briefing/public/observed).
3. WHEN 사실이 공개된 턴이 있으면 THE 단서의 `knownSinceTurn` SHALL 그 최초 공개 턴으로 표시된다.
4. THE 단서 목록 SHALL `knownSinceTurn` 오름차순(공개된 순서)으로 정렬된다.
5. THE 단서장 SHALL hidden truth fact를 절대 포함하지 않는다(기존 불변식 유지).

### Requirement 4: 인물 기록도 점진적 공개

**User Story:** 플레이어로서, 아직 만나지도 않은 인물이 인물 기록에 미리 떠 있지 않길 원한다.
단서처럼 만난 인물만 쌓여야 한다.

#### Acceptance Criteria

1. THE `WorldState` SHALL 조우한 인물 이력(`encounteredCharacters`: characterId → 최초 조우 턴)을 보관한다.
2. WHEN 한 턴에서 NPC가 실제로 발화/등장하면 THE 파이프라인 SHALL 그 characterId를 (없을 때만)
   최초 조우 턴과 함께 `encounteredCharacters`에 기록한다.
3. WHEN 인물 기록을 구성하면 THE `buildCaseBoard` SHALL 조우한 인물 또는 진술을 남긴 인물만 포함한다.
4. THE 인물 기록 SHALL 최초 조우 턴 오름차순(정의 순서로 동률 해소)으로 정렬된다.
5. WHEN 세션 시작 직후(아무도 안 만남) THE 인물 기록 SHALL 비어 있다.
6. WHEN 새 세션의 WorldState가 생성되면 THE `encounteredCharacters` SHALL 빈 상태로 초기화된다.

### Requirement 5: 하위 호환 및 검증

**User Story:** 개발자로서, 이 변경이 기존 세션/테스트/빌드를 깨지 않길 원한다.

#### Acceptance Criteria

1. WHEN `revealedCaseFacts`/`encounteredCharacters`가 없는 기존 세션을 로드하면 THE 파이프라인/보드
   SHALL 빈 맵으로 폴백해 정상 동작한다.
2. WHEN 비-미스터리 시나리오(caseKnowledge 없음)이면 THE 단서장 SHALL 기존과 동일하게 비어 있고,
   인물 기록도 조우 전까지 비어 있다.
3. WHEN 변경 적용 후 THE 타입체크(`pnpm -r run check`) SHALL 통과한다.
4. WHEN 변경 적용 후 THE 서버 테스트 스위트 SHALL 전부 통과한다(기존 테스트는 새 동작에 맞게 갱신).
5. THE 신규/갱신 테스트 SHALL 빈 시작, 공개 후 누적, 단조 증가(최초 턴 보존), hidden truth 미포함,
   인물 점진 공개를 커버한다.
