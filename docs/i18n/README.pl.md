# Simplicio Canvas

[← English](../../README.md) · **Polski**

Lokalny podgląd przepływów 2D. Wklej link do projektu na GitHubie, aby zobaczyć jego przepływy jako schematy (punkt wejścia → kroki → wywołania, z opisem tego, co robi każdy krok, i jego kodem), a następnie odtwórz krok po kroku prawdziwe lub symulowane uruchomienie, łącznie z każdym wywołaniem LLM.

```bash
git clone https://github.com/simpletibr/simplicio-canvas.git
cd simplicio-canvas && npm install && npm run dev
```

Uruchom lokalnie: `npm run dev` → http://127.0.0.1:5173

- **Przepływy** — architektura i jeden przepływ na punkt wejścia, z eksportem do Mermaid.
- **Odtwarzanie** — wczytaj plik `simplicio.trace/v1` albo JSON drukowany przez `simplicio-loop turbo`; odtwarzaj, wstrzymuj, przechodź krok po kroku; każde wywołanie LLM z modelem, tokenami, kosztem, opóźnieniem i podglądem promptu i odpowiedzi.
- **Symulacja** — wpisz żądanie i zobacz, dokąd by trafiło i dlaczego, bez uruchamiania czegokolwiek.

Kod zostaje na Twoim komputerze: pliki są czytane w przeglądarce i nigdy nie są wysyłane.

![Simplicio Canvas](../images/flows.png)

[Format trace](../trace-format.md) · [Symulacja](../simulation.md) · [MIT](../../LICENSE)
