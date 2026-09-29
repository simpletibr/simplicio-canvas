# Simplicio Canvas

[← English](../../README.md) · **Nederlands**

Lokale 2D-flowviewer. Plak de link van een GitHub-project om de flows als stroomdiagrammen te zien (ingangspunt → stappen → aanroepen, met wat elke stap doet en de broncode), en speel daarna een echte of gesimuleerde run stap voor stap af, inclusief elke LLM-aanroep.

```bash
git clone https://github.com/simpletibr/simplicio-canvas.git
cd simplicio-canvas && npm install && npm run dev
```

Lokaal draaien: `npm run dev` → http://127.0.0.1:5173

- **Flows** — architectuur en één flow per ingangspunt, met Mermaid-export.
- **Afspelen** — laad een `simplicio.trace/v1`-bestand of de JSON die `simplicio-loop turbo` afdrukt; afspelen, pauzeren, stap voor stap; elke LLM-aanroep met model, tokens, kosten, latentie en voorbeeld van prompt en antwoord.
- **Simulatie** — typ een verzoek en zie waar het heen zou gaan en waarom, zonder iets uit te voeren.

De code blijft op je machine: bestanden worden in de browser gelezen en nooit geüpload.

![Simplicio Canvas](../images/flows.png)

[Trace-formaat](../trace-format.md) · [Simulatie](../simulation.md) · [MIT](../../LICENSE)
