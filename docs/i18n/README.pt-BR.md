# Simplicio Canvas

[← English](../../README.md) · **Português**

Visualizador 2D de fluxos, local e privado. Cole o link de um projeto do GitHub para ver os fluxos dele como fluxogramas (ponto de entrada → passos → chamadas, com o que cada passo faz e o código) e reproduza, passo a passo, uma execução real ou simulada, inclusive cada chamada de LLM.

```bash
git clone https://github.com/simpletibr/simplicio-canvas.git
cd simplicio-canvas && npm install && npm run dev
```

Rodar localmente: `npm run dev` → http://127.0.0.1:5173

- **Fluxos** — arquitetura e um fluxo por ponto de entrada, com exportação para Mermaid.
- **Replay** — carregue um arquivo `simplicio.trace/v1` ou o JSON que o `simplicio-loop turbo` imprime; reproduza, pause e avance passo a passo; cada chamada de LLM com modelo, tokens, custo, latência e prévia do prompt e da resposta.
- **Simulação** — digite um pedido e veja por onde ele passaria e por quê, sem executar nada e sem chamar modelo.

O código fica na sua máquina: os arquivos são lidos no navegador e nunca enviados.

![Simplicio Canvas](../images/flows.png)

[Formato do trace](../trace-format.md) · [Simulação](../simulation.md) · [MIT](../../LICENSE)
