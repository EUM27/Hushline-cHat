# Codex Project Rules

## Provider UI

- ChatGPT는 주연이 아니다.
- ChatGPT는 여러 모델 provider 중 하나일 뿐이며 기본값, 우선값, 자동 선택값으로 취급하지 않는다.
- `ChatGPT 연결` 같은 ChatGPT 전용 UI는 사용자가 provider를 `ChatGPT`로 명시 선택한 뒤에만 보여준다.
- ChatGPT 로그인 버튼은 로그인/OAuth 흐름만 시작해야 하며, 현재 슬롯이나 기본 연결 provider를 자동으로 `chatgpt`로 바꾸면 안 된다.
- 모델 연결 UI는 NanoGPT, OpenRouter, OpenAI, ChatGPT를 같은 계층의 선택지로 다룬다.

## No Hard-Coded UI Fixes

- 화면을 맞추기 위해 임의의 고정 width/height, viewport-height, absolute offset, magic number를 박지 않는다.
- 레이아웃은 토큰, CSS 변수, grid/flex의 `minmax`, `min-height: 0`, 내부 스크롤, intrinsic sizing으로 해결한다.
- 입력창·툴바·하단 액션처럼 항상 보여야 하는 영역은 컨테이너를 고정 높이로 밀어내지 말고, 본문 영역만 `minmax(0, 1fr)`로 스크롤되게 만든다.
- 고정값이 꼭 필요하면 토큰/상수로 이름을 붙이고 이유를 남긴 뒤, 데스크톱과 모바일 실제 렌더링을 확인한다.
