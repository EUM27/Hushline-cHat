---
inclusion: manual
---
# Hushline 디자인 시스템

이 문서는 별도 제공된 design-system.md의 전체 내용을 steering으로 등록한 것입니다.
구현 시 참조용으로 사용합니다.

핵심 규칙 요약:
- User ≠ Character (유저는 독립 존재, 캐릭터 직접 조종 X)
- Beat = Utterance 묶음 + state_changes 컨테이너
- action은 연출 전용, 실제 세계 변화는 state_changes
- visibility: allow list 기반 (초기 버전 deny 미지원)
- Mood enum: neutral, warm, cold, tense, scared, angry, sad, amused, surprised, resigned
- Genre / Mood / Theme 3축 분리
- 모드 전환: Director / User / System만 가능, Character 불가
- 스트리밍 중 전환: 현재 Beat 종료 후 적용
- Stage(항상 다크) / Surface(라이트·다크) 토큰 분리
- .storypack import → 자동 시작이 최종 목표
