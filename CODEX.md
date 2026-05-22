# Codex Project Rules

## Provider UI

- ChatGPT는 주연이 아니다.
- ChatGPT는 여러 모델 provider 중 하나일 뿐이며 기본값, 우선값, 자동 선택값으로 취급하지 않는다.
- `ChatGPT 연결` 같은 ChatGPT 전용 UI는 사용자가 provider를 `ChatGPT`로 명시 선택한 뒤에만 보여준다.
- ChatGPT 로그인 버튼은 로그인/OAuth 흐름만 시작해야 하며, 현재 슬롯이나 기본 연결 provider를 자동으로 `chatgpt`로 바꾸면 안 된다.
- 모델 연결 UI는 NanoGPT, OpenRouter, OpenAI, ChatGPT를 같은 계층의 선택지로 다룬다.
