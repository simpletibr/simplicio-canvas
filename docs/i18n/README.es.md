# Simplicio Canvas

[← English](../../README.md) · **Español**

Visor 2D de flujos, local y privado. Pega el enlace de un proyecto de GitHub para ver sus flujos como diagramas (punto de entrada → pasos → llamadas, con lo que hace cada paso y su código), y reproduce paso a paso una ejecución real o simulada, incluida cada llamada a un LLM.

```bash
git clone https://github.com/simpletibr/simplicio-canvas.git
cd simplicio-canvas && npm install && npm run dev
```

Ejecutar en local: `npm run dev` → http://127.0.0.1:5173

- **Flujos** — arquitectura y un flujo por punto de entrada, con exportación a Mermaid.
- **Reproducción** — carga un archivo `simplicio.trace/v1` o el JSON que imprime `simplicio-loop turbo`; reproduce, pausa y avanza paso a paso; cada llamada a un LLM con modelo, tokens, costo, latencia y vista previa del prompt y la respuesta.
- **Simulación** — escribe una petición y mira adónde iría y por qué, sin ejecutar nada.

El código se queda en tu máquina: los archivos se leen en el navegador y nunca se suben.

![Simplicio Canvas](../images/flows.png)

[Formato de trace](../trace-format.md) · [Simulación](../simulation.md) · [MIT](../../LICENSE)
