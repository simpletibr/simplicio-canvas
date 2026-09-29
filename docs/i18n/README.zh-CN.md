# Simplicio Canvas

[← English](../../README.md) · **简体中文**

本地优先的 2D 流程查看器。粘贴 GitHub 项目链接，即可把它的流程画成流程图（入口 → 步骤 → 调用，并说明每一步做什么及其源码），然后逐步回放一次真实或模拟的运行，包括每一次 LLM 调用。

```bash
git clone https://github.com/simpletibr/simplicio-canvas.git
cd simplicio-canvas && npm install && npm run dev
```

本地运行: `npm run dev` → http://127.0.0.1:5173

- **流程** — 架构图，以及每个入口点一张流程图，可导出 Mermaid。
- **回放** — 载入 `simplicio.trace/v1` 文件或 `simplicio-loop turbo` 打印的 JSON；播放、暂停、单步；查看每次 LLM 调用的模型、token、成本、延迟以及提示词/回复预览。
- **模拟** — 输入一个请求，查看它会走向何处以及原因，无需运行任何东西。

代码留在你的机器上：文件在浏览器中读取，绝不上传。

![Simplicio Canvas](../images/flows.png)

[Trace 格式](../trace-format.md) · [模拟](../simulation.md) · [MIT](../../LICENSE)
