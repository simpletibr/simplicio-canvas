# Runtime trace contract

`src/domain/runtime-trace.ts` is a small, renderer-independent contract that predates the viewer's replay format:
runtime **spans between graph nodes** are imported as a separate, redacted evidence type and correlated with static edges.

| Contract | Boundary | Evidence |
| --- | --- | --- |
| `runtime-trace.ts` | Runtime spans are a separate, redacted evidence type. Import rejects identity/content attributes and emits typed runtime edges. | `tests/maturity-contracts.test.ts` |
| `runtime-trace.ts` | Opt-in redacted spans remain distinct from static edges; correlation reports matched, unexpected and unused-static paths with confidence. | `tests/maturity-contracts.test.ts` |
| `hrm-trace.ts` | Maps a `simplicio-hrm` plan outcome to that runtime trace, with the internal state redacted by default. | `tests/hrm-trace.test.ts` |

It is **not** the format the replay player reads: that is `simplicio.trace/v1` ([trace-format.md](trace-format.md)), one JSON
event per line for any run (steps, LLM calls, tools, commands, edits). The two have different jobs — one correlates
runtime edges with the static graph, the other replays a run — and converting between them is a follow-up.

These are integration-ready foundations, not claims that the browser can execute processes, access private
repositories, ingest production telemetry or mutate source.
