# Simulation

Type a request ("adicione um campo telefone no cadastro.html", "resolva todas as issues") and watch, step by step,
where it would go and **why**. Every step has a plain-language explanation: what happens, why, input → output, and what
can fail. Nothing runs: no command, no model call, no API key.

Open **Run → Simulated**, type the request, pick a flow and press **Simulate**. The player highlights the active node
and edge on the 2D flow, the side panel explains the current step, and the step list lets you jump to any step.
"Simulated" and "Real run" are one toggle apart: the second replays a trace you load (see [trace-format.md](trace-format.md)).

A simulation is an ordinary `simplicio.trace/v1` with `synthetic: true`; every event has `attrs.simulated: true`,
`attrs.explanation` and `attrs.node` (a node of the flow shown on the canvas).

## Flow 1: simplicio-loop (built in)

The default flow describes `simplicio-loop turbo` in host mode (3.45.1), where the invoking agent's model writes the plan:

1. **Skill invoked** with the request.
2. **`simplicio-loop "<request>"`**: files named in the request become target and context.
3. **Mapper survey**: reads the repository once, cached while the tree is unchanged.
4. **Plan request**: a `needs_plan` document; a map slice for one task, the full map as a cached header for many.
5. **The agent's model writes the plan**: JSON `find`/`replace`; the loop makes no LLM call.
6. **`turbo --apply`**: simplicio-dev-cli compiles and applies each swap.
7. **`--verify`** runs the tests.
8. **On failure** the reason goes back and the model fixes the plan once.
9. **Done** = `status: ok` and `verify.passed`; the promise is emitted.

The **branch is chosen from the request text** (`src/domain/request.ts`, using the same path rule as the CLI: a token
with a code extension is a file):

| The request says | Branch | Extra steps |
|---|---|---|
| one sentence, one task | single | none |
| several tasks (`1) … 2) …`, bullets, lines, `;`, "e depois") on different files | independent → **fan-out** | *Independent tasks: fan-out* |
| several tasks that name the same file | **in order** (`depends_on`) | *Same file: in order* |
| both of the above | mixed | fan-out, then in order |
| "todas as issues", "all open issues", "fila", "backlog", "drain the board" | **queue** | *Queue: list the items*, then the whole pipeline **per item** ending in *Open a PR for the item* (two illustrative items) |
| `--provider openrouter`, "modo provider" | **provider mode** | the engine's own model call instead of the agent's; *cache warm-up* when there are more than 3 tasks; a *hedged request* |

Flags such as `--provider` and `--verify "…"` are removed from the task text before it is split.

### What is "unknown"

The simulation shows the **happy path** and marks with "?" (`status: "unknown"`) what cannot be known without running:

- the repair step (only happens if apply or verify fails);
- the hedged request (only happens when the provider is slow);
- everything in a queue after the first item (how many items exist is only known by asking GitHub).

Nothing is invented: a simulated LLM step has no token, cost or latency numbers.

## Flow 2: any project, from a GitHub link

Import a project (Analyze, with the local bridge), choose an entry point in **Run → Flow** — a console script, CLI
command, MCP tool, `main`, or **any function** picked from the Flows sidebar — type a request and simulate. The
simulator walks the Mapper call graph from that function **in call order** (the order of the call sites), to a chosen
depth, one step per function:

- **What happens** comes from the docstring / doc comment (or says there is none), **Why** from who called it (and
  where), **Input → output** from the signature, and the notes list the calls it makes next ("chama X para …, depois Y"),
  the library calls with no code in the project, and the errors it can raise (`raise`, `throw new`).
- No model is used. If the request names a function, the step says so.
- A function that appears again is explained once and marked as a **revisit**.

Whatever static analysis cannot decide is marked `unknown` instead of guessed:

| Situation | Why it is unknown |
|---|---|
| the call sits under `if` / `elif` / `else`, a loop, an `except`, or a nested function | the condition is not evaluated; the step names it |
| the call comes after a `return` / `raise` / `throw` inside an earlier block | that exit may skip it |
| Mapper found several possible targets for a call (`ambiguous`) | an extra *ambiguous call* step lists the candidates |

The heuristics read indentation and braces of well-formatted code, and Mapper's resolution is lexical: treat the walk as
a guide, not proof. (Mapper also cuts its call graph at 1,000 edges; the UI warns when that happened. It does not index Python
`async def` either, so those functions are found in the source but have no calls in the walk.)

## Editing the explanations

All text of the simplicio-loop flow lives in one file, `src/simulation/simplicio-loop.flow.json`, in **pt-BR and en**:

```json
{ "id": "apply", "kind": "file_edit",
  "label":   { "pt-BR": "turbo --apply: o dev-cli aplica o plano", "en": "turbo --apply: dev-cli applies the plan" },
  "explain": { "what": { "pt-BR": "…", "en": "…" }, "why": {…}, "input": {…}, "output": {…}, "failure": {…} },
  "variants": { "many": { "what": {…} }, "provider": { "what": {…} } } }
```

- `variants` override a part for a branch (`provider`, `many`, `queue`); the first matching variant wins.
- Placeholders: `{request}`, `{tasks}`, `{files}`, `{lanes}`, `{items}`, `{item}`.
- `edges` define the transitions; a test checks that every step the simulator can take follows an existing edge, so the
  active edge can always be highlighted, and that every text exists in both languages.

The texts of the project walk (`docstring`, `caller`, `condition` templates) are in `src/simulation/static-walk.json`.
The explanations describe the documented flow of `simplicio-loop turbo`; internal details can differ between releases.
