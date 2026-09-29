# `simplicio.trace/v1`

A trace is a text file with **one JSON object per line** that says what happened during a run: steps, LLM calls, tool
calls, shell commands, file edits and verifications. Simplicio Canvas turns it into a 2D flow and replays it step by
step, showing the data of every step (for an LLM call: model, tokens, cost, latency, prompt and response preview).

Anything can write it: a script, an MCP server, an agent, an LLM app. The file is read **in your browser** and never
uploaded.

```jsonl
{"schema":"simplicio.trace/v1","title":"answer a question"}
{"id":"run","parent":null,"kind":"step","name":"answer a question","start":0,"end":2.4,"status":"ok"}
{"id":"c1","parent":"run","kind":"llm_call","name":"summarize","start":0.3,"end":2.1,"status":"ok","attrs":{"model":"my-model","prompt_tokens":812,"completion_tokens":64,"cost_usd":0.0007,"latency_s":1.8,"prompt_preview":"Summarize...","response_preview":"The text says..."}}
```

Open the app, choose **Run → Real run → Load trace** (or drop the file on the page) and press play.

## File format

- UTF-8 text, one JSON object per line. Blank lines are ignored. At most **20,000 events** per file.
- The first line may be a **header** (`schema` present, no `id`/`kind`). It is optional.
- Every other line is an **event**.
- Lines may come in any order (see [ordering](#ordering-parents-and-timing)).

### Header

| Field | Type | Meaning |
|---|---|---|
| `schema` | string | Must be `"simplicio.trace/v1"`. Any other value is an error. |
| `title` | string | Shown as the name of the replay. |
| `source` | string | Where the trace came from (a script, a tool, a document schema). |
| `synthetic` | boolean | `true` for samples and simulations: the viewer labels them *sample* / *simulated*. |

### Event

| Field | Type | Required | Meaning |
|---|---|---|---|
| `id` | string or integer | yes | Unique within the file. |
| `parent` | id or `null` | no | The event this one happened inside. `null`/missing means a root. |
| `kind` | string | yes | `step`, `llm_call`, `tool`, `command`, `file_edit` or `verify`. |
| `name` | string | yes | What the node says: `"pytest -q"`, `"plan the fix"`, `"read_file cart.py"`. |
| `start` | number or string | yes | See [time](#time). |
| `end` | number or string | no | When it finished. Missing means "not measured": the event is drawn as a point in time. |
| `status` | string | no | `ok` (default), `error`, `running`, `skipped` or `unknown`. |
| `attrs` | object | no | Free-form data. The viewer knows the keys listed [below](#attributes-the-viewer-understands). |

Unknown top-level keys are ignored, and unknown `attrs` are kept and shown under *Other attributes*: the format grows
by adding keys, never by changing their meaning.

### Kinds

| `kind` | Use it for | Drawn as |
|---|---|---|
| `step` | A unit of work or a phase that contains other events (a run, a request, a plan). | grey node |
| `llm_call` | One call to a language model. | red node with provider, tokens and latency chips |
| `tool` | A named tool, operator or MCP call (`read_file`, `search`, `simplicio-mapper`). | blue node |
| `command` | A shell command. | amber node |
| `file_edit` | A change applied to files. | green node |
| `verify` | A check that passes or fails: tests, linters, a validator. | violet node |

### Status

`ok` and `error` are the normal outcomes. `running` marks something that had not finished when the trace was written.
`skipped` is for steps that were decided against. `unknown` is used by [simulations](simulation.md) for steps that may or
may not happen: the viewer draws them dashed with a "?".

### Time

`start` and `end` accept:

- a number: **seconds**, either epoch seconds (`time.time()`) or seconds since your own start;
- a numeric string (`"12.5"`);
- an ISO-8601 string (`"2026-09-29T13:12:51Z"`).

The viewer subtracts the earliest `start`, so the first event happens at `0s` whichever you use. Timestamps in
milliseconds are not detected: divide by 1000.

### Ordering, parents and timing

- **Any order.** Emitters that write a span when it *ends* put children before their parent; that is fine. The viewer
  resolves `parent` after reading the whole file and sorts events by `start`. Events with the same `start` follow the
  call tree (parent first, then children) and then file order.
- **Unknown or circular parents** never make a trace unreadable: the event becomes a root and a warning is shown.
- **Sequence.** Among events with the same parent, one that starts after another ended follows it (`next` edge).
  Events that overlap in time are drawn as parallel branches that fork and join. A parent points to its first children
  with a dashed edge. Events without `end` count as points in time.

### Validation

The viewer reports every problem with its line number and refuses a file only for the errors below.

| Problem | Result |
|---|---|
| a line that is not JSON, or not an object | error |
| missing or duplicate `id`; unknown or missing `kind`; missing `name`; missing or unreadable `start` | error |
| header with another `schema`; no events at all; more than 20,000 events | error |
| unreadable `end`; `end` before `start` (clamped to `start`) | warning |
| unknown `status` (read as `ok`); `attrs` that is not an object (ignored) | warning |
| unknown `parent`, a parent equal to the event itself, a parent cycle (the event becomes a root) | warning |
| a header that is not the first record (ignored) | warning |

## Attributes the viewer understands

| Kind | Keys | Notes |
|---|---|---|
| `llm_call` | `model`, `provider`, `prompt_tokens`, `cached_tokens`, `completion_tokens`, `cost_usd`, `latency_s`, `prompt_preview`, `response_preview`, `warm`, `hedged` | Every key is optional; missing numbers show as "—". Keep previews short (a few hundred characters). |
| `verify` | `command`, `passed`, `returncode`, `output_tail` | |
| `command` | `command`, `returncode`, `output_tail` | |
| `file_edit` | `applied` (list), `failed` (list of `{tasks, reason, excerpt}`) | Other keys such as `path` or `diff_preview` appear under *Other attributes*. |
| `tool` | `tool` | Shown as a chip on the card. |
| any | `note`, `summary` | `note` is shown as a callout in the side panel; `summary` as one line on the card. |

The **run summary** at the top of the side panel adds up the events: LLM calls, tokens (a total reported on a
non-LLM step wins over the sum of the calls), cost and duration.

**Simulations** are ordinary traces with `synthetic: true`. Their events carry `attrs.simulated: true`, `attrs.node`
(the node of the flow the step lights up), `attrs.explanation` (the plain-language text) and
`attrs.explanation_parts` (`what`, `why`, `io`, `failure`, `notes`). See [simulation.md](simulation.md).

## Emit a trace from your own code

### Python

`docs/examples/simplicio_trace.py` is the whole emitter (about 25 lines, standard library only). A `span` writes one
line when it ends, records failures as `status: "error"`, and nests through the `with` blocks.

```python
import json, time, uuid
from contextlib import contextmanager

class Trace:
    """Append simplicio.trace/v1 events (one JSON object per line) to a file."""
    def __init__(self, path, now=time.time, new_id=lambda: uuid.uuid4().hex[:8], **header):
        self.out, self.now, self.new_id, self.stack = open(path, "a", buffering=1), now, new_id, []
        self.write({"schema": "simplicio.trace/v1", **header})

    def write(self, record):
        self.out.write(json.dumps(record, ensure_ascii=False) + "\n")

    @contextmanager
    def span(self, kind, name, **attrs):
        event = {"id": self.new_id(), "parent": self.stack[-1] if self.stack else None,
                 "kind": kind, "name": name, "start": round(self.now(), 6), "attrs": attrs}
        self.stack.append(event["id"])
        try:
            yield event["attrs"]          # the caller adds tokens, cost, previews...
            bad = event["attrs"].get("returncode", 0) != 0 or event["attrs"].get("passed", True) is False
            event["status"] = "error" if bad else "ok"
        except Exception as error:
            event["status"], event["attrs"]["error"] = "error", repr(error)
            raise
        finally:
            self.stack.pop()
            event["end"] = round(self.now(), 6)
            self.write(event)              # written when the span ends: children come before parents
```

```python
trace = Trace("run.trace.jsonl", title="answer a question")
with trace.span("step", "answer a question"):
    with trace.span("tool", "search docs", query="rate limits") as attrs:
        hits = search("rate limits")
        attrs["hits"] = len(hits)
    with trace.span("llm_call", "summarize") as attrs:
        reply = client.chat(...)                      # any client
        attrs.update(model=reply.model, provider="openai", prompt_tokens=reply.usage.prompt,
                     completion_tokens=reply.usage.completion, cost_usd=0.0007,
                     prompt_preview="Summarize...", response_preview=reply.text[:300])
    with trace.span("verify", "pytest -q") as attrs:
        attrs.update(passed=True, returncode=0, output_tail="6 passed")
```

`docs/examples/agent_demo.py` writes `fixtures/traces/agent-demo.trace.jsonl` with this emitter and a stubbed model
(the clock is faked so the file is reproducible).

### Capture LLM calls by wrapping the HTTP client

If your code already talks to an OpenAI-compatible endpoint through `httpx`, log the calls where they leave the
process, so no call site changes. `docs/examples/llm_http_client.py`:

```python
import json, time, uuid
import httpx

def logging_client(trace, **kwargs):
    """An httpx.Client that records every /chat/completions call as an llm_call event."""
    def start(request):
        request.extensions["t0"] = time.time()

    def done(response):
        if not str(response.request.url).endswith("/chat/completions"):
            return
        response.read()
        t0, t1 = response.request.extensions["t0"], time.time()
        body = response.json() if response.is_success else {}
        usage, sent = body.get("usage", {}), json.loads(response.request.content or b"{}")
        reply = ((body.get("choices") or [{}])[0].get("message") or {}).get("content", "")
        trace.write({"id": uuid.uuid4().hex[:8], "parent": trace.stack[-1] if trace.stack else None, "kind": "llm_call",
                     "name": body.get("model") or sent.get("model", "llm call"), "start": t0, "end": t1,
                     "status": "ok" if response.is_success else "error",
                     "attrs": {"model": body.get("model"), "prompt_tokens": usage.get("prompt_tokens"),
                               "completion_tokens": usage.get("completion_tokens"), "latency_s": round(t1 - t0, 3),
                               "prompt_preview": str((sent.get("messages") or [{}])[-1].get("content", ""))[:500],
                               "response_preview": reply[:500]}})

    return httpx.Client(event_hooks={"request": [start], "response": [done]}, **kwargs)
```

`trace.stack` keeps the call attached to the span that is open when the request is made. The same idea works with
`requests` (a `Session` hook), `fetch` (a wrapper) or an SDK's own callback: read `usage` from the response, take the
timestamps around the call, write one `llm_call` line.

### Any other language

Write JSON lines. The minimum is `id`, `kind`, `name`, `start`; add `end` and `attrs` when you have them:

```
{"id":"1","kind":"command","name":"cargo test","start":1790000000.1,"end":1790000004.6,"status":"error","attrs":{"returncode":101}}
```

### Next layer: an OpenAI-compatible proxy (not built yet)

The lowest-friction capture for arbitrary LLM apps is a local proxy that speaks the OpenAI API, forwards the request
to the real provider and appends one `llm_call` line per call, so any app only needs a different `base_url`. Sketch:

- read `usage` (`prompt_tokens`, `completion_tokens`, cached tokens) and the model from the response, time the round
  trip for `latency_s`, price it from a local table for `cost_usd`;
- keep `prompt_preview` / `response_preview` short and **redacted** (API keys, bearer tokens, `.env` values);
- take the `parent` from a header such as `x-simplicio-parent` when the app sets one, otherwise from the previous
  open span;
- append to a JSONL file that the viewer can tail (the "live mode" layer).

This repository does not implement the proxy. This document is the contract it would write.

## `simplicio-loop turbo` as a source

Drop the JSON that `simplicio-loop turbo` prints on the page, or load it from a file, and the viewer converts it to a
trace (`src/domain/turbo.ts`). The input can be one document, a JSON array of documents, or one document per line;
several runs are laid out one after another as separate root steps (`r1.run`, `r2.run`, ...).

`turbo-run/v1` has no timestamps, no per-call cost and no prompt text. The converter lays events out from the measured
latencies only and **never invents the rest**: cost appears on the run step (the run total), previews say "not captured".
Only the last path segment of `repo` is kept, so machine paths never reach the trace.

### Provider mode (`simplicio-loop` 3.45.0, or `"mode": "provider"`)

| Event (`id`) | Kind | Comes from |
|---|---|---|
| `run` | step | the whole document: `model`, `reasoning`, `tasks`, `model_calls`, `retries`, `hedged_calls`, `tokens`, `cache_hit_pct`, `cost_usd`, `wall_s` |
| `survey` | tool | Mapper reads the repository once; its map is the header of every model call |
| `call-1`, `call-2`, ... | llm_call | one per entry of `calls[]`: `provider`, `prompt_tokens`, `cached_tokens`, `completion_tokens`, `latency_s`, `warm`, `hedged`; laid out one after another by latency |
| `apply` | file_edit | `applied`, `failed`; each rejected lane is a child `apply-failed-N` with its reason |
| `verify-1` | verify | `verify`; when `verify_retry.attempted` it is the first (failed) run |
| `repair` | llm_call | the **last** entry of `calls[]` when `verify_retry.attempted` (turbo makes exactly one repair call) |
| `reapply`, `verify-2` | file_edit, verify | `verify_retry` and the final `verify` |

A `status: "blocked"` document (for example `turbo_provider_key_missing`) becomes `run` plus a `blocked` step with
`reason_code`, `detail` and `fix`.

### Host mode (`simplicio-loop` 3.45.1)

In host mode the loop makes **no LLM call**: it prints a `simplicio.turbo-request/v1` document with
`status: "needs_plan"`, the invoking agent's model writes the plan itself, and `simplicio-loop turbo --apply` prints a
`simplicio.turbo-run/v1` result with `"mode": "host"` and no `calls[]`. Feed the viewer the request followed by the
result(s), one document per line:

| Event (`id`) | Kind | Comes from |
|---|---|---|
| `survey` | tool | Mapper survey |
| `plan-request` | step | the request: `plan_path`, `apply`, `tasks`, size of `prompt` |
| `host-plan` | llm_call | *Host model writes the plan*: `provider: "host"`, model `invoking agent (host model)`, **no token data**, `prompt_preview` from the request `prompt`; `running` when only the request exists |
| `apply-1` | file_edit | first apply result: `applied`, `failed` (`reason`, `excerpt`) |
| `verify-1` | verify | its `verify` |
| `host-fix`, `apply-2`, `verify-2` | llm_call, file_edit, verify | a second apply result: the model fixes the plan once and it is applied again (`reapply: true`) |

A single apply result on its own is accepted too (it starts at `apply-1`).

### Fixtures and where they come from

| File | What it is |
|---|---|
| `fixtures/traces/turbo-provider.run.json` → `.trace.jsonl` | A **sample built from the documented schema**: no `OPENROUTER_API_KEY` was available to run `simplicio-loop turbo` for real. Values are plausible, not measured. |
| `fixtures/traces/turbo-host.docs.jsonl` → `.trace.jsonl` | A **sample** for host mode. `simplicio-loop` 3.45.1 is not released: field names beyond `schema`, `status`, `mode`, `plan_path`, `apply`, `tasks`, `prompt`, `applied`, `failed` (`reason`, `excerpt`) and `verify` are assumptions. |
| `fixtures/traces/turbo-blocked.run.json` → `.trace.jsonl` | The **real** document `simplicio-loop turbo` 3.45.0 printed without `OPENROUTER_API_KEY`, with the repository path anonymised. |
| `fixtures/traces/agent-demo.trace.jsonl` | A **synthetic** run written by the emitter above with a stubbed model. |

`npm run fixtures` regenerates the `.trace.jsonl` files from the documents (and the Mapper artifacts of the bundled
example); a test fails if they drift. When a real key is available, run
`simplicio-loop turbo --repo <tiny repo> --task "..." --verify "..." > run.json`, drop `run.json` on the page, and replace
the sample.

## Privacy

Traces can contain prompts and outputs. The viewer reads the file in the browser, never uploads it, and the production
build carries a Content-Security-Policy that only allows its own origin. Before you share a trace or paste the Mermaid
export into an issue, remove anything secret from `prompt_preview`, `response_preview`, `output_tail` and `command`.

## Versioning

`simplicio.trace/v1` only grows by adding optional keys and attribute names. A change that would break older files gets
a new schema string (`v2`) and the viewer keeps refusing unknown schemas with a clear message.
