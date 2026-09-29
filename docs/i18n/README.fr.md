# Simplicio Canvas

[← English](../../README.md) · **Français**

Visionneuse 2D de flux, locale et privée. Collez le lien d’un projet GitHub pour voir ses flux sous forme de diagrammes (point d’entrée → étapes → appels, avec ce que fait chaque étape et son code), puis rejouez pas à pas une exécution réelle ou simulée, y compris chaque appel à un LLM.

```bash
git clone https://github.com/simpletibr/simplicio-canvas.git
cd simplicio-canvas && npm install && npm run dev
```

Lancer en local: `npm run dev` → http://127.0.0.1:5173

- **Flux** — architecture et un flux par point d’entrée, avec export Mermaid.
- **Rejeu** — chargez un fichier `simplicio.trace/v1` ou le JSON affiché par `simplicio-loop turbo` ; lecture, pause, pas à pas ; chaque appel LLM avec modèle, jetons, coût, latence et aperçu du prompt et de la réponse.
- **Simulation** — saisissez une demande et voyez où elle irait et pourquoi, sans rien exécuter.

Le code reste chez vous : les fichiers sont lus dans le navigateur et jamais envoyés.

![Simplicio Canvas](../images/flows.png)

[Format de trace](../trace-format.md) · [Simulation](../simulation.md) · [MIT](../../LICENSE)
