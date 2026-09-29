# Simplicio Canvas

[← English](../../README.md) · **Italiano**

Visualizzatore 2D di flussi, locale e privato. Incolla il link di un progetto GitHub per vederne i flussi come diagrammi (punto di ingresso → passi → chiamate, con ciò che fa ogni passo e il suo codice), poi riproduci passo per passo un’esecuzione reale o simulata, inclusa ogni chiamata a un LLM.

```bash
git clone https://github.com/simpletibr/simplicio-canvas.git
cd simplicio-canvas && npm install && npm run dev
```

Avvio in locale: `npm run dev` → http://127.0.0.1:5173

- **Flussi** — architettura e un flusso per punto di ingresso, con esportazione Mermaid.
- **Riproduzione** — carica un file `simplicio.trace/v1` o il JSON stampato da `simplicio-loop turbo`; play, pausa, passo per passo; ogni chiamata LLM con modello, token, costo, latenza e anteprima di prompt e risposta.
- **Simulazione** — scrivi una richiesta e guarda dove andrebbe e perché, senza eseguire nulla.

Il codice resta sulla tua macchina: i file sono letti nel browser e mai caricati.

![Simplicio Canvas](../images/flows.png)

[Formato del trace](../trace-format.md) · [Simulazione](../simulation.md) · [MIT](../../LICENSE)
