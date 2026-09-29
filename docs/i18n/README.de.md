# Simplicio Canvas

[← English](../../README.md) · **Deutsch**

Lokaler 2D-Flow-Viewer. Füge den Link eines GitHub-Projekts ein und sieh seine Abläufe als Flussdiagramme (Einstiegspunkt → Schritte → Aufrufe, mit dem, was jeder Schritt tut, und seinem Quellcode). Spiele danach einen echten oder simulierten Lauf Schritt für Schritt ab, inklusive jedes LLM-Aufrufs.

```bash
git clone https://github.com/simpletibr/simplicio-canvas.git
cd simplicio-canvas && npm install && npm run dev
```

Lokal starten: `npm run dev` → http://127.0.0.1:5173

- **Abläufe** — Architektur und ein Ablauf pro Einstiegspunkt, mit Mermaid-Export.
- **Wiedergabe** — lade eine `simplicio.trace/v1`-Datei oder das JSON von `simplicio-loop turbo`; abspielen, pausieren, Schritt für Schritt; jeder LLM-Aufruf mit Modell, Tokens, Kosten, Latenz und Prompt-/Antwort-Vorschau.
- **Simulation** — gib eine Anfrage ein und sieh, wohin sie laufen würde und warum, ohne etwas auszuführen.

Der Code bleibt lokal: Dateien werden im Browser gelesen und nie hochgeladen.

![Simplicio Canvas](../images/flows.png)

[Trace-Format](../trace-format.md) · [Simulation](../simulation.md) · [MIT](../../LICENSE)
