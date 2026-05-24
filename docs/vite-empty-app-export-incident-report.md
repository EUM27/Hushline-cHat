# Vite dev server App export 오류 리포트

작성 시각: 2026-05-23 22:38:11

## 요약

브라우저에서 다음 오류가 발생했다.

```text
Uncaught SyntaxError: The requested module '/src/App.tsx?...' does not provide an export named 'App'
```

실제 `packages/client/src/App.tsx` 파일에는 `export function App()`이 존재했지만, Vite dev server가 브라우저에 제공한 `/src/App.tsx?t=...` 응답이 빈 모듈에 가까운 잘못된 내용으로 캐시/서빙되고 있었다.

결론: 소스 코드에서 `App` export가 사라진 문제가 아니라, Vite dev server/HMR 모듈 캐시가 일시적으로 오염되어 `App.tsx`를 빈 모듈처럼 제공한 문제였다.

## 영향

- React 앱 엔트리 `main.tsx`의 `import { App } from "./App";`가 실패했다.
- 브라우저 앱이 시작되지 않았다.
- `favicon.ico 404`도 같이 보였지만, 이는 별도 문제이며 앱 로딩 실패의 원인은 아니었다.

## 확인한 증거

### 1. 브라우저/콘솔 오류

브라우저가 `/src/App.tsx?t=1779542796510` 모듈에서 named export `App`를 찾지 못했다.

### 2. 실제 파일 상태

`packages/client/src/App.tsx`에는 정상적으로 다음 export가 있었다.

```ts
export function App() {
```

### 3. dev server 응답 이상

문제 발생 시점에 Vite dev server의 `/src/App.tsx?t=1779542796510` 응답을 직접 확인했을 때:

- 응답 길이: 약 163 bytes
- 실제 TSX 변환 코드가 없음
- source map의 `sourcesContent`도 빈 문자열에 가까웠음

즉 dev server가 실제 파일 내용과 다른 빈 모듈을 브라우저에 제공하고 있었다.

### 4. 재시작 후 정상화 확인

기존 dev process를 종료하고 `corepack pnpm dev`를 다시 시작한 뒤 `/src/App.tsx` 응답을 재확인했다.

확인 결과:

- 응답 길이: 254930 bytes
- 응답에 `export function App` 포함
- source map `sourcesContent`에도 App.tsx 본문 포함
- 사용자 브라우저에서도 강력 새로고침 없이 자동으로 정상화됨

## 원인 추정

가장 가능성이 높은 원인:

1. `packages/client/src/App.tsx`가 큰 폭으로 수정되는 중 Vite HMR transform/cache가 중간 상태를 잡았다.
2. 해당 시점의 모듈 변환 결과가 빈 모듈처럼 dev server 내부 캐시에 남았다.
3. `main.tsx`는 정상적으로 `App` named export를 import했지만, dev server가 제공한 App 모듈에는 export가 없어 브라우저 ESM import 단계에서 SyntaxError가 발생했다.
4. dev server 재시작으로 Vite module graph/cache가 초기화되며 해결됐다.

## 해결 방법

실제 수행한 조치:

```bash
# 기존 client/server dev process 종료
# 이후 dev server 재시작
corepack pnpm dev
```

검증:

```bash
python - <<'PY'
import urllib.request
s = urllib.request.urlopen('http://localhost:4187/src/App.tsx', timeout=5).read().decode(errors='replace')
print('len', len(s))
print('has export', 'export function App' in s)
PY
```

기대 결과:

```text
has export True
```

## 다음에 같은 증상이 나오면

1. 먼저 실제 파일에 export가 있는지 확인한다.
   - `packages/client/src/App.tsx`
   - `packages/client/src/main.tsx`

2. dev server가 제공하는 모듈 응답을 직접 확인한다.

```bash
python - <<'PY'
import urllib.request
url = 'http://localhost:4187/src/App.tsx'
s = urllib.request.urlopen(url, timeout=5).read().decode(errors='replace')
print('len', len(s))
print('has export function App:', 'export function App' in s)
print(s[:500])
PY
```

3. 실제 파일은 정상인데 dev server 응답만 비정상이면 Vite 재시작을 우선한다.

```bash
corepack pnpm dev
```

4. 브라우저가 이전 timestamp 모듈을 계속 물고 있으면 그때만 다음 순서로 진행한다.
   - 일반 새로고침
   - 필요 시 Ctrl+Shift+R 강력 새로고침
   - DevTools Network 탭에서 Disable cache 체크 후 새로고침

이번 케이스에서는 dev server 재시작 뒤 브라우저가 자동으로 정상 모듈을 다시 받아와서 강력 새로고침은 필요하지 않았다.

## 예방/운영 메모

- 대규모 App.tsx 수정 중 dev server가 이상한 HMR 상태에 빠질 수 있다.
- `export does not provide named export` 류 오류가 실제 소스와 맞지 않으면 브라우저만 의심하지 말고 dev server 응답을 직접 확인한다.
- favicon 404는 앱 시작 실패와 무관하므로 우선순위를 낮춘다.
- 장기적으로 App.tsx가 너무 커지면 HMR/디버깅 부담이 커지므로, 기능 단위 컴포넌트 분리를 고려한다.
