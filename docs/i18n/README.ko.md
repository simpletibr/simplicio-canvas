# Simplicio Canvas

[← English](../../README.md) · **한국어**

로컬 우선 2D 플로 뷰어. GitHub 프로젝트 링크를 붙여넣으면 프로젝트의 흐름을 순서도로 보여 줍니다(진입점 → 단계 → 호출, 각 단계가 하는 일과 소스 포함). 실제 실행이나 시뮬레이션을 LLM 호출까지 포함해 단계별로 재생할 수 있습니다.

```bash
git clone https://github.com/simpletibr/simplicio-canvas.git
cd simplicio-canvas && npm install && npm run dev
```

로컬에서 실행: `npm run dev` → http://127.0.0.1:5173

- **플로** — 아키텍처와 진입점별 플로, Mermaid 내보내기 지원.
- **리플레이** — `simplicio.trace/v1` 파일 또는 `simplicio-loop turbo`가 출력한 JSON을 불러와 재생, 일시정지, 단계별 이동; 각 LLM 호출의 모델, 토큰, 비용, 지연 시간, 프롬프트/응답 미리보기를 확인합니다.
- **시뮬레이션** — 요청을 입력하면 아무것도 실행하지 않고 어디로 가고 왜 그런지 보여 줍니다.

코드는 내 컴퓨터에 머뭅니다. 파일은 브라우저에서 읽히며 업로드되지 않습니다.

![Simplicio Canvas](../images/flows.png)

[트레이스 형식](../trace-format.md) · [시뮬레이션](../simulation.md) · [MIT](../../LICENSE)
